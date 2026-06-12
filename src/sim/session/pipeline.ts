/**
 * The per-tick simulation pipeline.
 *
 * advanceTick is a pure function: SessionState in, new SessionState and
 * any events out. The game loop runs N ticks per frame through it and
 * writes the result back to the stores. Order matters and is fixed:
 * movement → fuel → ambush → contracts → market drift → end check.
 *
 * Runs up to a few thousand times per second at 100× speed — keep every
 * stage cheap and allocation-light on the no-op path.
 */
import {
  AMBUSH_CARGO_LOSS_MAX,
  AMBUSH_CARGO_LOSS_MIN,
  AMBUSH_CREDIT_LOSS_MAX,
  AMBUSH_RATE_PER_TICK,
  FUEL_PER_EFFECTIVE_KM,
  MARKET_DRIFT_INTERVAL,
} from '../balance'
import { advanceCrawler, CRAWLER_SPEED_KM_S } from '../crawler/movement'
import { TICK_DURATION_MS } from '../tick'
import { driftMarket } from '../economy/market'
import type { Commodity } from '../economy/models'
import { boardStale, generateBoard, type WorldStatic } from '../contracts/generate'
import { pruneBoard, updateActiveContracts } from '../contracts/update'
import {
  advanceEngagement,
  rollSalvage,
  survivingPlayerUnits,
} from '../combat/engagement'
import { addCargo, cargoUsed } from '../economy/market'
import { makeRng } from '../rng'
import { checkEndConditions } from './end-conditions'
import type { EndState, GameEvent, SessionState } from './state'

/** Effective km the crawler covers in one tick at full speed. */
const EFFECTIVE_KM_PER_TICK = CRAWLER_SPEED_KM_S * (TICK_DURATION_MS / 1000)

/** Fuel burned per tick while in transit. */
export const FUEL_BURN_PER_TICK = EFFECTIVE_KM_PER_TICK * FUEL_PER_EFFECTIVE_KM

/** How often the (heavier) bankruptcy check runs while docked. */
const END_CHECK_INTERVAL = 50

export interface TickResult {
  state: SessionState
  events: GameEvent[]
}

export function advanceTick(state: SessionState, world: WorldStatic): TickResult {
  if (state.endState) return { state, events: [] }

  const events: GameEvent[] = []
  const tick = state.tick + 1
  const rng = makeRng(state.rngState)

  let crawler = state.crawler
  let company = state.company
  let markets = state.markets
  let boards = state.boards
  let active = state.active
  let forces = state.forces
  let engagement = state.engagement
  let stats = state.stats

  // ── Movement + fuel ───────────────────────────────────────────────
  const inTransit = crawler.currentRoute !== null
  if (inTransit) {
    if (company.fuel > 0) {
      const wasEnRoute = crawler.currentNode === null
      crawler = advanceCrawler(crawler, world.routes)
      const fuel = Math.max(0, company.fuel - FUEL_BURN_PER_TICK)
      company = { ...company, fuel }

      if (wasEnRoute && crawler.currentNode !== null) {
        const node = world.nodes[crawler.currentNode]
        events.push({
          tick,
          kind: 'arrival',
          message: `DOCKED AT ${node?.name?.toUpperCase() ?? crawler.currentNode}`,
        })
      }
      if (fuel <= 0 && crawler.currentRoute !== null) {
        events.push({
          tick,
          kind: 'fuel-empty',
          message: 'FUEL EXHAUSTED — CRAWLER HALTED',
        })
      }

      // ── Ambush roll (only while actually moving) ──────────────────
      const route = world.routes[state.crawler.currentRoute!]
      if (route && rng.next() < route.danger * AMBUSH_RATE_PER_TICK) {
        const result = applyAmbush(company, rng)
        company = result.company
        stats = { ...stats, ambushes: stats.ambushes + 1 }
        events.push({ tick, kind: 'ambush', message: result.message })
      }
    }
  }

  // ── Engagement ────────────────────────────────────────────────────
  if (engagement && engagement.status === 'active') {
    const result = advanceEngagement(engagement, rng)
    engagement = result.engagement
    for (const e of result.events) {
      events.push({ tick, kind: e.kind, message: e.message })
    }

    if (engagement.status !== 'active') {
      // Surviving mechs return to the roster with their damage.
      forces = survivingPlayerUnits(engagement)
      const contract = active.find((c) => c.id === engagement!.contractId)

      if (engagement.status === 'won') {
        const salvage = rollSalvage(engagement, rng)
        let cargo = company.cargo
        const space = company.cargoCapacity - cargoUsed(company)
        const metal = Math.min(salvage.metal, space)
        if (metal > 0) cargo = addCargo(cargo, 'metal', metal)
        const precision = Math.min(salvage.precision, space - metal)
        if (precision > 0) cargo = addCargo(cargo, 'precision', precision)

        const pay = contract?.pay ?? 0
        company = { ...company, credits: company.credits + pay, cargo }
        if (contract) {
          active = active.filter((c) => c.id !== contract.id)
          stats = {
            ...stats,
            contractsCompleted: stats.contractsCompleted + 1,
            creditsEarned: stats.creditsEarned + pay,
          }
          events.push({
            tick,
            kind: 'contract-completed',
            message: `CONTRACT COMPLETE — ¤${pay} + SALVAGE (${metal} METAL${precision ? `, ${precision} PRECISION` : ''})`,
          })
        }
      } else if (contract) {
        active = active.filter((c) => c.id !== contract.id)
        stats = { ...stats, contractsFailed: stats.contractsFailed + 1 }
      }
      engagement = null
    }
  }

  // ── Contracts: hard deadlines ─────────────────────────────────────
  if (active.length > 0) {
    const result = updateActiveContracts(active, tick)
    if (result.failed.length > 0) {
      active = result.active
      stats = {
        ...stats,
        contractsFailed: stats.contractsFailed + result.failed.length,
      }
      for (const c of result.failed) {
        const what =
          c.type === 'combat'
            ? `CLEAR ${c.hostiles} HOSTILES AT ${c.destination.toUpperCase()}`
            : `${c.quantity} ${c.commodity?.toUpperCase()} TO ${c.destination.toUpperCase()}`
        events.push({
          tick,
          kind: 'contract-failed',
          message: `CONTRACT FAILED — ${what} MISSED DEADLINE`,
        })
      }
    }
  }

  // ── Boards: refresh where docked, prune everywhere on a slow cadence
  if (crawler.currentNode !== null && boardStale(boards[crawler.currentNode], tick)) {
    boards = {
      ...boards,
      [crawler.currentNode]: generateBoard(crawler.currentNode, world, rng, tick),
    }
  }
  if (tick % MARKET_DRIFT_INTERVAL === 0) {
    const pruned: typeof boards = {}
    for (const [nodeId, board] of Object.entries(boards)) {
      pruned[nodeId] = pruneBoard(board, tick)
    }
    boards = pruned

    // ── Market drift ──────────────────────────────────────────────
    const drifted: typeof markets = {}
    for (const nodeId of Object.keys(markets).sort()) {
      drifted[nodeId] = driftMarket(markets[nodeId], rng)
    }
    markets = drifted
  }

  // ── End conditions ────────────────────────────────────────────────
  let endState: EndState | null = state.endState
  const cheapCheck =
    company.credits >= state.params.creditTarget ||
    (crawler.currentRoute !== null && company.fuel <= 0)
  if (cheapCheck || (crawler.currentNode !== null && tick % END_CHECK_INTERVAL === 0)) {
    endState = checkEndConditions({
      tick,
      crawler,
      company,
      markets,
      routes: world.routes,
      active,
      creditTarget: state.params.creditTarget,
    })
    if (endState) {
      events.push({
        tick,
        kind: endState.kind,
        message:
          endState.kind === 'victory'
            ? 'DEBT CLEARED — CONTRACT FULFILLED'
            : endState.kind === 'stranded'
              ? 'CRAWLER STRANDED — NO FUEL, NO FUNDS'
              : 'COMPANY BANKRUPT — ASSETS SEIZED',
      })
    }
  }

  return {
    state: {
      ...state,
      tick,
      rngState: rng.state,
      crawler,
      company,
      markets,
      boards,
      active,
      forces,
      engagement,
      stats,
      endState,
    },
    events,
  }
}

function applyAmbush(
  company: SessionState['company'],
  rng: ReturnType<typeof makeRng>,
): { company: SessionState['company']; message: string } {
  const held = Object.entries(company.cargo).filter(([, qty]) => (qty ?? 0) > 0)

  if (held.length > 0) {
    const fraction = rng.range(AMBUSH_CARGO_LOSS_MIN, AMBUSH_CARGO_LOSS_MAX)
    const cargo = { ...company.cargo }
    const losses: string[] = []
    for (const [c, qty] of held) {
      const lost = Math.max(1, Math.floor((qty ?? 0) * fraction))
      const remaining = (qty ?? 0) - lost
      if (remaining <= 0) delete cargo[c as Commodity]
      else cargo[c as Commodity] = remaining
      losses.push(`${lost} ${c.toUpperCase()}`)
    }
    return {
      company: { ...company, cargo },
      message: `AMBUSH — RAIDERS TOOK ${losses.join(', ')}`,
    }
  }

  const lost = Math.min(company.credits, rng.int(50, AMBUSH_CREDIT_LOSS_MAX))
  return {
    company: { ...company, credits: company.credits - lost },
    message: `AMBUSH — EXTORTED ${lost} CREDITS`,
  }
}
