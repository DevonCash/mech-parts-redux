/**
 * Seeded contract board generation.
 *
 * Hauling contracts originate at the board's node and target nodes that
 * consume the carried commodity (docs/world/contracts.md: "the economy
 * creates them"). Pay scales with route distance, danger, and commodity
 * value; hard-deadline contracts pay a premium.
 */
import {
  BOARD_REFRESH_TICKS,
  CARGO_CAPACITY,
  COMBAT_CONTRACT_CHANCE,
  COMBAT_PAY_BASE,
  COMBAT_PAY_PER_HOSTILE,
  CONTRACT_BOARD_TTL,
  DEADLINE_SLACK_MAX,
  DEADLINE_SLACK_MIN,
  HARD_DEADLINE_BONUS,
  HAUL_PAY_BASE,
  HAUL_PAY_PER_KM,
} from '../balance'
import { CRAWLER_SPEED_KM_S } from '../crawler/movement'
import {
  COMMODITY_VALUES,
  type GameNode,
  type NodeMarket,
  type Route,
} from '../economy/models'
import { priceFactor } from '../economy/seed-market'
import { shortage } from '../economy/production'
import { findPath } from '../h3/graph'
import { TICK_DURATION_MS } from '../tick'
import type { Rng } from '../rng'
import type { Board, Contract } from './models'

export interface WorldStatic {
  nodes: Record<string, GameNode>
  routes: Record<string, Route>
}

/**
 * Effective km (distance × terrain) and mean danger of the best path
 * between two nodes, or null if unreachable.
 */
export function routeMetrics(
  world: WorldStatic,
  fromId: string,
  toId: string,
): { effectiveKm: number; meanDanger: number } | null {
  const positions: Record<string, [number, number]> = {}
  for (const n of Object.values(world.nodes)) positions[n.id] = n.position

  const segments = findPath(fromId, toId, world.routes, positions)
  if (!segments || segments.length === 0) return null

  let effectiveKm = 0
  let dangerSum = 0
  for (const seg of segments) {
    const route = world.routes[seg.routeId]
    effectiveKm += route.distance * route.terrain
    dangerSum += route.danger
  }
  return { effectiveKm, meanDanger: dangerSum / segments.length }
}

/** Ticks the crawler needs to traverse a path of the given effective length. */
export function travelTicks(effectiveKm: number): number {
  const seconds = effectiveKm / CRAWLER_SPEED_KM_S
  return Math.ceil((seconds * 1000) / TICK_DURATION_MS)
}

/**
 * Generate a fresh board for a node. Consumes rng deterministically.
 * When live market state is provided, hauling contracts target actual
 * shortages at the destination and pay scales with urgency
 * (contracts.md: "the economy creates them").
 */
export function generateBoard(
  nodeId: string,
  world: WorldStatic,
  rng: Rng,
  currentTick: number,
  markets?: Record<string, NodeMarket>,
): Board {
  const origin = world.nodes[nodeId]
  const contracts: Contract[] = []
  if (!origin) return { generatedTick: currentTick, contracts }

  const otherNodes = Object.values(world.nodes)
    .filter((n) => n.id !== nodeId)
    .sort((a, b) => a.id.localeCompare(b.id))

  const count = rng.int(2, 5)
  for (let i = 0; i < count; i++) {
    const destination = rng.pick(otherNodes)
    const metrics = routeMetrics(world, nodeId, destination.id)
    if (!metrics) continue

    // Combat work: clear raiders at the destination node. Best-paid
    // work on the board, and the only answer to ambush pressure.
    if (rng.next() < COMBAT_CONTRACT_CHANCE) {
      const hostiles = rng.int(2, 4)
      const eta = travelTicks(metrics.effectiveKm)
      let pay = COMBAT_PAY_BASE + hostiles * COMBAT_PAY_PER_HOSTILE
      pay = Math.round(pay * rng.range(0.9, 1.15))
      contracts.push({
        id: `${nodeId}-${currentTick}-${i}`,
        type: 'combat',
        origin: nodeId,
        destination: destination.id,
        hostiles,
        pay,
        postedTick: currentTick,
        deadlineTick:
          currentTick + Math.ceil(eta * rng.range(DEADLINE_SLACK_MIN + 1, DEADLINE_SLACK_MAX + 1)),
        boardExpiryTick: currentTick + CONTRACT_BOARD_TTL,
        status: 'available',
      })
      continue
    }

    // Prefer shipping what the destination actually wants. With live
    // market data: weight by real shortage. Without: fall back to the
    // node-type price profile.
    const destMarket = markets?.[destination.id]
    const sample = [
      rng.pick(COMMODITY_KEYS),
      rng.pick(COMMODITY_KEYS),
      rng.pick(COMMODITY_KEYS),
    ]
    const score = (c: (typeof COMMODITY_KEYS)[number]) =>
      destMarket
        ? (shortage(destMarket, c) + 0.1) * COMMODITY_VALUES[c]
        : priceFactor(destination.type, c) * COMMODITY_VALUES[c]
    const commodity = sample.reduce((best, c) => (score(c) > score(best) ? c : best))
    const urgency = destMarket ? shortage(destMarket, commodity) : 0.3

    const quantity = rng.int(5, Math.min(25, CARGO_CAPACITY))
    const eta = travelTicks(metrics.effectiveKm)
    const hardDeadline = rng.next() < 0.6

    let pay =
      HAUL_PAY_BASE +
      metrics.effectiveKm * HAUL_PAY_PER_KM * (1 + metrics.meanDanger) +
      quantity * COMMODITY_VALUES[commodity] * 0.15
    pay *= 1 + urgency * 0.5
    if (hardDeadline) pay *= HARD_DEADLINE_BONUS
    pay = Math.round(pay * rng.range(0.9, 1.15))

    contracts.push({
      id: `${nodeId}-${currentTick}-${i}`,
      type: 'hauling',
      origin: nodeId,
      destination: destination.id,
      commodity,
      quantity,
      pay,
      postedTick: currentTick,
      deadlineTick: hardDeadline
        ? currentTick + Math.ceil(eta * rng.range(DEADLINE_SLACK_MIN, DEADLINE_SLACK_MAX))
        : null,
      boardExpiryTick: currentTick + CONTRACT_BOARD_TTL,
      status: 'available',
    })
  }

  return { generatedTick: currentTick, contracts }
}

const COMMODITY_KEYS = Object.keys(COMMODITY_VALUES) as (keyof typeof COMMODITY_VALUES)[]

/** Should this node's board be regenerated? */
export function boardStale(board: Board | undefined, currentTick: number): boolean {
  if (!board) return true
  return currentTick - board.generatedTick >= BOARD_REFRESH_TICKS
}
