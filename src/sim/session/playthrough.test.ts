/**
 * End-to-end loop playability: a simple bot plays full sessions through
 * the real pipeline — accept best contract, fuel up, travel, deliver,
 * repeat. If this can't win, neither can a player; it guards the
 * balance numbers against regressions.
 */
import { describe, expect, it } from 'vitest'
import { seedNodes } from '../economy/seed-nodes'
import { generateSeedRoutes } from '../economy/seed-routes'
import { quote, addCargo, cargoUsed, executeTrade } from '../economy/market'
import { abandonContract, deliverContract } from '../contracts/update'
import { routeMetrics, type WorldStatic } from '../contracts/generate'
import { buildRoadMoveOrder } from '../combat/orders'
import { CRAWLER_UNIT_ID } from '../combat/catalog'
import { createSession } from './new-game'
import { advanceTick, findCrawler } from './pipeline'
import type { SessionState } from './state'
import { round2 } from '../economy/seed-market'
import {
  EMERGENCY_RESUPPLY_COST,
  EMERGENCY_RESUPPLY_FUEL,
} from '../balance'

const world: WorldStatic = {
  nodes: Object.fromEntries(seedNodes.map((n) => [n.id, n])),
  routes: Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r])),
}

/**
 * Depart toward `destination` one hop at a time via road orders so the
 * bot docks (and refuels) at every intermediate node.
 */
function departOneHop(state: SessionState, destination: string): SessionState | null {
  const from = state.crawlerDock
  if (!from || from === destination) return null
  const full = buildRoadMoveOrder(from, destination, world.nodes, world.routes)
  if (!full) return null
  // Re-build as a single hop: find the first adjacent node along the path.
  const adjacent = Object.values(world.routes)
    .filter((r) => r.from === from || r.to === from)
    .map((r) => (r.from === from ? r.to : r.from))
  // Pick the adjacent node whose road order is a prefix of the full path
  // — cheap approximation: the route hop minimizing remaining metric.
  let best: { node: string; total: number } | null = null
  for (const next of adjacent) {
    const hop = routeMetrics(world, from, next)
    const rest = next === destination ? { effectiveKm: 0 } : routeMetrics(world, next, destination)
    if (!hop || !rest) continue
    const total = hop.effectiveKm + rest.effectiveKm
    if (!best || total < best.total) best = { node: next, total }
  }
  if (!best) return null
  const order = buildRoadMoveOrder(from, best.node, world.nodes, world.routes)
  if (!order) return null
  return {
    ...state,
    crawlerDock: null,
    units: state.units.map((u) => (u.id === CRAWLER_UNIT_ID ? { ...u, order } : u)),
  }
}

/** Bot turn while docked: deliver, then refuel, then accept and depart. */
function dockedTurn(state: SessionState): SessionState {
  const nodeId = state.crawlerDock!
  const market = state.markets[nodeId]
  let company = state.company
  let active = state.active
  let boards = state.boards
  let markets = state.markets

  // Deliver anything due here first — pay funds the refuel. If ambushes
  // ate contract cargo, do what a player does: buy replacements off the
  // local market, and failing that, cut losses and abandon.
  for (const contract of [...active]) {
    if (contract.destination !== nodeId) continue
    if (contract.type !== 'hauling') continue
    let result = deliverContract(company, contract)
    if (!result.ok) {
      const shortfall = contract.quantity - (company.cargo[contract.commodity] ?? 0)
      const buy = executeTrade(company, markets[nodeId], contract.commodity, shortfall, 'buy')
      if (buy.ok) {
        company = buy.company
        markets = { ...markets, [nodeId]: buy.market }
        result = deliverContract(company, contract)
      }
    }
    if (result.ok) {
      company = result.company
      active = active.filter((c) => c.id !== contract.id)
    } else {
      const dropped = abandonContract(company, contract)
      company = dropped.company
      active = active.filter((c) => c.id !== contract.id)
    }
  }

  // Refuel to full, keeping a small credit reserve
  const fuelPrice = quote(market, 'fuel').buy
  const want = Math.floor(company.fuelCapacity - company.fuel)
  const affordable = Math.min(
    want,
    Math.floor(Math.max(0, company.credits - 200) / fuelPrice),
  )
  if (affordable > 0 && market.inventory.fuel > 0) {
    const amount = Math.min(affordable, market.inventory.fuel)
    company = {
      ...company,
      credits: round2(company.credits - amount * fuelPrice),
      fuel: company.fuel + amount,
    }
    markets = {
      ...markets,
      [nodeId]: {
        ...market,
        inventory: { ...market.inventory, fuel: market.inventory.fuel - amount },
      },
    }
  }

  // Accept the most profitable contract the company can actually afford
  // to fuel — a player rule: war chest (credits + tank) must cover the
  // trip's fuel with a reserve.
  const board = boards[nodeId]
  if (board && active.length === 0) {
    const FUEL_PRICE_ESTIMATE = 1.2
    const candidates = board.contracts
      .filter((c) => c.type === 'hauling') // this bot doesn't fight
      .map((c) => {
        const metrics = routeMetrics(world, nodeId, c.destination)
        if (!metrics) return null
        const fuelCost = metrics.effectiveKm * FUEL_PRICE_ESTIMATE
        return { contract: c, net: c.pay - fuelCost, fuelCost }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter(
        ({ contract, fuelCost }) =>
          cargoUsed(company) + contract.quantity <= company.cargoCapacity &&
          company.credits + company.fuel >= fuelCost + 300 &&
          fuelCost > 0,
      )
      .sort((a, b) => b.net - a.net)
    const pick = candidates[0]?.contract
    if (pick) {
      company = { ...company, cargo: addCargo(company.cargo, pick.commodity, pick.quantity) }
      active = [...active, { ...pick, status: 'active' as const }]
      boards = {
        ...boards,
        [nodeId]: { ...board, contracts: board.contracts.filter((c) => c.id !== pick.id) },
      }
    }
  }

  let next = { ...state, company, active, boards, markets }

  // Head one hop toward the active contract's destination
  if (active.length > 0) {
    const departed = departOneHop(next, active[0].destination)
    if (departed) next = departed
  }

  return next
}

function playSession(seed: number, maxTicks: number): SessionState {
  let state = createSession(seed, world)
  let guard = 0

  while (state.tick < maxTicks && !state.endState) {
    if (state.crawlerDock !== null) {
      const before = state
      state = dockedTurn(state)
      // If the bot couldn't act (no contracts, no fuel), let time pass so
      // boards refresh — advance a chunk of ticks.
      if (before === state || state.crawlerDock !== null) {
        for (let i = 0; i < 2000 && !state.endState; i++) {
          state = advanceTick(state, world).state
        }
      }
    } else {
      // In transit — advance in slabs
      for (let i = 0; i < 2000 && !state.endState; i++) {
        state = advanceTick(state, world).state
        if (state.crawlerDock !== null) break
      }
      // Halted dry mid-route: do what the player does — pay for an
      // emergency resupply and keep rolling.
      if (
        findCrawler(state.units)?.order.kind === 'move' &&
        state.company.fuel <= 0 &&
        state.company.credits >= EMERGENCY_RESUPPLY_COST
      ) {
        state = {
          ...state,
          company: {
            ...state.company,
            credits: state.company.credits - EMERGENCY_RESUPPLY_COST,
            fuel: Math.min(EMERGENCY_RESUPPLY_FUEL, state.company.fuelCapacity),
          },
        }
      }
    }
    if (++guard > 20000) break
  }

  return state
}

describe('full-loop playthrough (bot)', () => {
  // ~12 hauls at ~70k ticks each — a session is won inside ~1.5M ticks
  // (≈ 20 real minutes at 100× speed).
  const SESSION_BUDGET = 2_000_000

  it('a contract-following bot wins within a session', () => {
    const result = playSession(2026, SESSION_BUDGET)
    expect(result.endState?.kind).toBe('victory')
  }, 60000)

  it('wins across multiple seeds (balance is not seed-lucky)', () => {
    for (const seed of [1, 7, 42]) {
      const result = playSession(seed, SESSION_BUDGET)
      expect(result.endState?.kind, `seed ${seed}`).toBe('victory')
    }
  }, 120000)

  it('doing nothing eventually loses or stalls but never crashes', () => {
    let state = createSession(99, world)
    for (let i = 0; i < 50_000 && !state.endState; i++) {
      state = advanceTick(state, world).state
    }
    // Docked and idle: should still be alive (credits untouched) — the
    // loop pressures action through opportunity cost, not a doom timer.
    expect(state.crawlerDock).not.toBeNull()
  })
})
