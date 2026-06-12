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
  ECON_INTERVAL,
  FUEL_PER_EFFECTIVE_KM,
} from '../balance'
import { advanceCrawler, CRAWLER_SPEED_KM_S } from '../crawler/movement'
import { TICK_DURATION_MS } from '../tick'
import { econStep } from '../economy/production'
import { moveQuanta, quantaDecisions } from '../economy/quanta'
import type { Commodity } from '../economy/models'
import { boardStale, generateBoard, type WorldStatic } from '../contracts/generate'
import { pruneBoard, updateActiveContracts } from '../contracts/update'
import {
  advanceEngagement,
  rollSalvage,
  survivingPlayerUnits,
} from '../combat/engagement'
import {
  growSkills,
  recoverStress,
  STRESS_RECOVERY_DOCKED,
  STRESS_RECOVERY_FIELD,
} from '../pilots/models'
import {
  adjustReputation,
  REP_COMPLETED,
  REP_FAILED,
} from '../factions/models'
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
  let quanta = state.quanta
  let pilots = state.pilots
  let reputation = state.reputation
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
      // Surviving mechs return to the roster with their damage; their
      // pilots come back with their stress (and lessons, if they won).
      // Pilots of destroyed mechs died with the cockpit.
      const survivors = survivingPlayerUnits(engagement)
      const survivorPilotIds = new Set(
        survivors.map((u) => u.pilotId).filter(Boolean),
      )
      const won = engagement.status === 'won'
      const nextPilots: typeof pilots = []
      for (const pilot of pilots) {
        const wasDeployed = engagement.units.some(
          (u) => u.side === 'player' && u.pilotId === pilot.id,
        )
        if (!wasDeployed) {
          nextPilots.push(pilot)
          continue
        }
        if (!survivorPilotIds.has(pilot.id)) {
          events.push({
            tick,
            kind: 'pilot-kia',
            message: `${pilot.name} KIA`,
          })
          continue
        }
        const unitId = engagement.units.find(
          (u) => u.side === 'player' && u.pilotId === pilot.id,
        )?.id
        let updated = (unitId && engagement.pilots[unitId]) || pilot
        if (won) updated = growSkills(updated)
        nextPilots.push(updated)
      }
      pilots = nextPilots
      forces = survivors
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
          reputation = adjustReputation(reputation, contract.faction, REP_COMPLETED)
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
        reputation = adjustReputation(reputation, contract.faction, REP_FAILED)
        stats = { ...stats, contractsFailed: stats.contractsFailed + 1 }
      }
      engagement = null
    }
  }

  // ── Contracts: hard deadlines ─────────────────────────────────────
  // The contract being fought right now is exempt — its engagement's
  // outcome decides it, not the clock.
  if (active.length > 0) {
    const engagedId =
      engagement && engagement.status === 'active' ? engagement.contractId : null
    const result = updateActiveContracts(active, tick, engagedId)
    if (result.failed.length > 0) {
      active = result.active
      stats = {
        ...stats,
        contractsFailed: stats.contractsFailed + result.failed.length,
      }
      for (const c of result.failed) {
        reputation = adjustReputation(reputation, c.faction, REP_FAILED)
        const what =
          c.type === 'combat'
            ? `CLEAR ${c.hostiles} HOSTILES AT ${c.destination.toUpperCase()}`
            : `${c.quantity} ${c.commodity.toUpperCase()} TO ${c.destination.toUpperCase()}`
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
      [crawler.currentNode]: generateBoard(
        crawler.currentNode,
        world,
        rng,
        tick,
        markets,
        reputation,
      ),
    }
  }
  // ── Quanta in transit (every tick — it's one progress add each) ──
  quanta = moveQuanta(quanta, world.routes)

  // ── Economy step: production, pricing, quanta decisions ──────────
  if (tick % ECON_INTERVAL === 0) {
    const pruned: typeof boards = {}
    for (const [nodeId, board] of Object.entries(boards)) {
      pruned[nodeId] = pruneBoard(board, tick)
    }
    boards = pruned

    markets = econStep(world.nodes, markets, rng)
    const result = quantaDecisions(quanta, markets, world.routes, rng)
    quanta = result.quanta
    markets = result.markets

    // Pilots wind down between fights — faster docked at a barracks.
    if (!engagement && pilots.some((p) => p.stress > 0)) {
      const rate =
        crawler.currentNode !== null ? STRESS_RECOVERY_DOCKED : STRESS_RECOVERY_FIELD
      pilots = pilots.map((p) => recoverStress(p, rate))
    }
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
      quanta,
      pilots,
      reputation,
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
