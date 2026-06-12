/**
 * Hauler quanta — the visible bloodstream of the economy.
 *
 * Each hauler docked at a node scans direct neighbors for the best
 * price spread, buys stock from the local market, drives it over (slower
 * than the player's crawler), and sells at the destination. Their trades
 * mutate node inventories, which the pricing step turns into moving
 * spreads — and their dots on the map make the world feel inhabited.
 */
import { SELL_MARGIN } from '../balance'
import { TICK_DURATION_MS } from '../tick'
import { interpolateRoutePath } from '../crawler/movement'
import type { Rng } from '../rng'
import {
  COMMODITIES,
  type Commodity,
  type NodeMarket,
  type Quantum,
  type Route,
} from './models'
import { round2 } from './seed-market'

/** Hauler truck ground speed in km per game-second: ~80 km/h. */
export const QUANTUM_SPEED_KM_S = 0.022

const TICK_S = TICK_DURATION_MS / 1000

/** Max units a hauler carries per trip. */
const HAUL_CAPACITY = 15

/** Estimated fuel cost per effective km, in credits, for utility math. */
const HAUL_COST_PER_KM = 0.15

/** Minimum projected profit before a hauler bothers. */
const MIN_PROFIT = 25

/** Quanta don't trade fuel — node reserves are gameplay-critical. */
const TRADABLE = COMMODITIES.filter((c) => c !== 'fuel')

export function seedQuanta(nodeIds: string[], count: number, rng: Rng): Quantum[] {
  const sorted = [...nodeIds].sort()
  const quanta: Quantum[] = []
  for (let i = 0; i < count; i++) {
    quanta.push({
      id: `q-${i}`,
      kind: 'hauler',
      location: rng.pick(sorted),
      route: null,
      reversed: false,
      progress: 0,
      destination: null,
      cargo: null,
      credits: 2000,
      materialized: false,
    })
  }
  return quanta
}

/**
 * Refill the hauler population toward `target` (ECON cadence, one per
 * step): a raided convoy is one outfit's tragedy, not a demographic
 * collapse — fresh outfits dock and pick up the slack.
 */
export function refillQuanta(
  quanta: Quantum[],
  nodeIds: string[],
  target: number,
  rng: Rng,
): Quantum[] {
  if (quanta.length >= target) return quanta
  let maxSerial = -1
  for (const q of quanta) {
    const n = Number(q.id.slice(2))
    if (Number.isFinite(n) && n > maxSerial) maxSerial = n
  }
  const sorted = [...nodeIds].sort()
  return [
    ...quanta,
    {
      id: `q-${maxSerial + 1}`,
      kind: 'hauler',
      location: rng.pick(sorted),
      route: null,
      reversed: false,
      progress: 0,
      destination: null,
      cargo: null,
      credits: 2000,
      materialized: false,
    },
  ]
}

export interface Adjacency {
  routeId: string
  reversed: boolean
  neighbor: string
  effectiveKm: number
}

export function neighborsOf(nodeId: string, routes: Record<string, Route>): Adjacency[] {
  const result: Adjacency[] = []
  for (const route of Object.values(routes)) {
    if (route.from === nodeId) {
      result.push({
        routeId: route.id,
        reversed: false,
        neighbor: route.to,
        effectiveKm: route.distance * route.terrain,
      })
    } else if (route.to === nodeId) {
      result.push({
        routeId: route.id,
        reversed: true,
        neighbor: route.from,
        effectiveKm: route.distance * route.terrain,
      })
    }
  }
  return result.sort((a, b) => a.routeId.localeCompare(b.routeId))
}

export interface QuantaStepResult {
  quanta: Quantum[]
  markets: Record<string, NodeMarket>
}

export interface PlannedRun {
  adj: Adjacency
  commodity: Commodity
  qty: number
  profit: number
}

/**
 * The hauler's brain: best profitable neighbor run from `loc` given the
 * local market and a credit budget. Shared by the decision step and by
 * escort offer generation (a chartered convoy hauls what it would have
 * hauled anyway).
 */
export function pickBestRun(
  loc: string,
  markets: Record<string, NodeMarket>,
  routes: Record<string, Route>,
  credits: number,
): PlannedRun | null {
  const market = markets[loc]
  if (!market) return null
  let best: PlannedRun | null = null
  for (const adj of neighborsOf(loc, routes)) {
    const there = markets[adj.neighbor]
    if (!there) continue
    for (const c of TRADABLE) {
      const buy = market.prices[c]
      const sell = there.prices[c] * SELL_MARGIN
      const stock = Math.floor(market.inventory[c] ?? 0)
      const qty = Math.min(HAUL_CAPACITY, stock, Math.floor(credits / Math.max(0.01, buy)))
      if (qty <= 0) continue
      const profit = (sell - buy) * qty - adj.effectiveKm * HAUL_COST_PER_KM
      if (profit > MIN_PROFIT && (!best || profit > best.profit)) {
        best = { adj, commodity: c, qty, profit }
      }
    }
  }
  return best
}

/**
 * Per-tick movement for quanta in transit. Cheap: a progress add per
 * moving hauler; arrival unloading happens in the decision step.
 */
export function moveQuanta(
  quanta: Quantum[],
  routes: Record<string, Route>,
  tick: number,
): Quantum[] {
  let changed = false
  const next = quanta.map((q) => {
    // Escort charters: hold at the node until the scheduled departure.
    if (q.location && q.holdUntilTick !== undefined && q.forcedRoute) {
      if (tick < q.holdUntilTick) return q
      changed = true
      return {
        ...q,
        location: null,
        route: q.forcedRoute.routeId,
        reversed: q.forcedRoute.reversed,
        progress: 0,
        destination: q.forcedRoute.destination,
        holdUntilTick: undefined,
        forcedRoute: undefined,
      }
    }
    if (!q.route || q.materialized) return q
    const route = routes[q.route]
    if (!route) return q
    changed = true
    const progressPerTick =
      (QUANTUM_SPEED_KM_S * TICK_S) / (route.distance * route.terrain)
    const progress = q.progress + progressPerTick
    if (progress >= 1) {
      return { ...q, location: q.destination, route: null, reversed: false, progress: 0, destination: null }
    }
    return { ...q, progress }
  })
  return changed ? next : quanta
}

/**
 * Decision step (ECON cadence): docked haulers sell what they carry,
 * then chase the best neighbor spread, or idle-hop with low probability
 * so nobody rusts in place.
 */
export function quantaDecisions(
  quanta: Quantum[],
  markets: Record<string, NodeMarket>,
  routes: Record<string, Route>,
  rng: Rng,
): QuantaStepResult {
  let nextMarkets = markets
  const nextQuanta = quanta.map((quantum) => {
    let q = quantum
    const loc = q.location
    if (!loc || q.materialized || q.holdUntilTick !== undefined) return q
    const here = nextMarkets[loc]
    if (!here) return q

    // Sell whatever we hauled in.
    if (q.cargo) {
      const { commodity, qty } = q.cargo
      const revenue = round2(here.prices[commodity] * SELL_MARGIN * qty)
      nextMarkets = {
        ...nextMarkets,
        [loc]: {
          ...here,
          inventory: {
            ...here.inventory,
            [commodity]: (here.inventory[commodity] ?? 0) + qty,
          },
        },
      }
      q = { ...q, cargo: null, credits: round2(q.credits + revenue) }
    }

    // Scan neighbor spreads for the next run.
    const market = nextMarkets[loc]
    const adjacent = neighborsOf(loc, routes)
    const best = pickBestRun(loc, nextMarkets, routes, q.credits)

    if (best) {
      const cost = round2(market.prices[best.commodity] * best.qty)
      nextMarkets = {
        ...nextMarkets,
        [loc]: {
          ...market,
          inventory: {
            ...market.inventory,
            [best.commodity]: (market.inventory[best.commodity] ?? 0) - best.qty,
          },
        },
      }
      return {
        ...q,
        credits: round2(q.credits - cost),
        cargo: { commodity: best.commodity, qty: best.qty, paid: cost },
        location: null,
        route: best.adj.routeId,
        reversed: best.adj.reversed,
        progress: 0,
        destination: best.adj.neighbor,
      }
    }

    // Nothing profitable: occasionally drift to a neighbor empty so the
    // map keeps moving and the hauler finds fresh spreads.
    if (adjacent.length > 0 && rng.next() < 0.25) {
      const adj = rng.pick(adjacent)
      return {
        ...q,
        location: null,
        route: adj.routeId,
        reversed: adj.reversed,
        progress: 0,
        destination: adj.neighbor,
      }
    }
    return q
  })

  return { quanta: nextQuanta, markets: nextMarkets }
}

/** Display position for a quantum in transit (for the map layer). */
export function quantumPosition(
  q: Quantum,
  routes: Record<string, Route>,
): [number, number] | null {
  if (!q.route) return null
  const route = routes[q.route]
  if (!route || route.path.length === 0) return null
  const path = q.reversed ? [...route.path].reverse() : route.path
  return interpolateRoutePath(path, q.progress)
}
