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
  ESCORT_DEPART_DELAY_TICKS,
  ESCORT_OFFERS_MAX,
  ESCORT_PAY_BASE,
  ESCORT_PAY_PER_RAIDER,
  ESCORT_PAY_VALUE_FACTOR,
  HARD_DEADLINE_BONUS,
  HAUL_PAY_BASE,
  HAUL_PAY_PER_KM,
  RAIDER_CAMP_THREAT_KM,
  SALVAGE_OFFER_RANGE_KM,
  SALVAGE_PAY_VALUE_FACTOR,
  SECURITY_DEADLINE_TICKS,
  SECURITY_OFFER_RANGE_KM,
  SECURITY_PAY_BASE,
  SECURITY_PAY_PER_RAIDER,
} from '../balance'
import { marsDistance } from '../constants'
import { CRAWLER_SPEED_KM_S } from '../crawler/movement'
import type { CargoWreck } from '../economy/convoys'
import { pickBestRun } from '../economy/quanta'
import {
  COMMODITY_VALUES,
  type GameNode,
  type NodeMarket,
  type Quantum,
  type Route,
} from '../economy/models'
import { priceFactor, round2 } from '../economy/seed-market'
import { shortage } from '../economy/production'
import {
  nodeFaction,
  payModifier,
  type Reputation,
} from '../factions/models'
import { bandsNearNode, liveCamps, routeLiveDanger } from '../raiders/bands'
import { findPath } from '../h3/graph'
import { unitDestroyed } from '../combat/damage'
import type { Unit } from '../combat/models'
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
  units: Unit[] = [],
): { effectiveKm: number; meanDanger: number } | null {
  const positions: Record<string, [number, number]> = {}
  for (const n of Object.values(world.nodes)) positions[n.id] = n.position

  const segments = findPath(fromId, toId, world.routes, positions)
  if (!segments || segments.length === 0) return null

  const camps = liveCamps(units)
  let effectiveKm = 0
  let dangerSum = 0
  for (const seg of segments) {
    const route = world.routes[seg.routeId]
    effectiveKm += route.distance * route.terrain
    // Live danger: how raider-camped the road actually is right now.
    dangerSum += routeLiveDanger(route, units, camps)
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
  reputation?: Reputation,
  units: Unit[] = [],
  wrecks: CargoWreck[] = [],
): Board {
  const origin = world.nodes[nodeId]
  const contracts: Contract[] = []
  if (!origin) return { generatedTick: currentTick, contracts }

  const faction = nodeFaction(origin)
  const repPay = reputation ? payModifier(reputation, faction) : 1

  // Patrol work: bands camped near this node's roads are a problem the
  // locals will pay to remove (one offer per nearby band).
  for (const band of bandsNearNode(world, nodeId, units, SECURITY_OFFER_RANGE_KM)) {
    const pay = Math.round(
      (SECURITY_PAY_BASE + band.size * SECURITY_PAY_PER_RAIDER) * repPay * rng.range(0.9, 1.15),
    )
    contracts.push({
      id: `${nodeId}-${currentTick}-sec-${band.bandId}`,
      type: 'security',
      origin: nodeId,
      destination: nodeId,
      bandId: band.bandId,
      hostiles: band.size,
      site: band.camp,
      faction,
      pay,
      postedTick: currentTick,
      deadlineTick: currentTick + SECURITY_DEADLINE_TICKS,
      boardExpiryTick: currentTick + CONTRACT_BOARD_TTL,
      status: 'available',
    })
  }

  // Salvage work: convoy wrecks near this node are cargo on the ground
  // somebody here will pay to see recovered (one offer per wreck).
  for (const wreck of wrecks) {
    const [nLat, nLng] = origin.position
    const distKm = marsDistance(nLat, nLng, wreck.lat, wreck.lng)
    if (distKm > SALVAGE_OFFER_RANGE_KM || wreck.cargo.qty <= 0) continue
    const pay = Math.round(
      (wreck.cargo.qty * COMMODITY_VALUES[wreck.cargo.commodity] * SALVAGE_PAY_VALUE_FACTOR +
        distKm * HAUL_PAY_PER_KM) *
        repPay *
        rng.range(0.9, 1.15),
    )
    contracts.push({
      id: `${nodeId}-${currentTick}-sal-${wreck.id}`,
      type: 'salvage',
      origin: nodeId,
      destination: nodeId,
      wreckId: wreck.id,
      site: [wreck.lat, wreck.lng],
      commodity: wreck.cargo.commodity,
      quantity: wreck.cargo.qty,
      faction,
      pay,
      postedTick: currentTick,
      deadlineTick: null,
      boardExpiryTick: currentTick + CONTRACT_BOARD_TTL,
      status: 'available',
    })
  }

  const otherNodes = Object.values(world.nodes)
    .filter((n) => n.id !== nodeId)
    .sort((a, b) => a.id.localeCompare(b.id))

  const count = rng.int(2, 5)
  for (let i = 0; i < count; i++) {
    const destination = rng.pick(otherNodes)
    const metrics = routeMetrics(world, nodeId, destination.id, units)
    if (!metrics) continue

    // Combat work: clear raiders at the destination node. Best-paid
    // work on the board, and the only answer to ambush pressure.
    if (rng.next() < COMBAT_CONTRACT_CHANCE) {
      const hostiles = rng.int(2, 4)
      const eta = travelTicks(metrics.effectiveKm)
      let pay = COMBAT_PAY_BASE + hostiles * COMBAT_PAY_PER_HOSTILE
      pay = Math.round(pay * repPay * rng.range(0.9, 1.15))
      contracts.push({
        id: `${nodeId}-${currentTick}-${i}`,
        type: 'combat',
        origin: nodeId,
        destination: destination.id,
        hostiles,
        faction,
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
    pay = Math.round(pay * repPay * rng.range(0.9, 1.15))

    contracts.push({
      id: `${nodeId}-${currentTick}-${i}`,
      type: 'hauling',
      origin: nodeId,
      destination: destination.id,
      commodity,
      quantity,
      faction,
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

export interface EscortOffersResult {
  offers: Contract[]
  quanta: Quantum[]
  markets: Record<string, NodeMarket>
}

/**
 * Charter escort work for haulers docked at this node. Unlike
 * generateBoard this is not a pure read: a charter pre-buys the
 * shipment (market inventory down, hauler loaded) and schedules the
 * departure, so the contract can honestly say what's being moved and
 * when it leaves — and the convoy sails on schedule whether or not
 * anyone signs on to guard it.
 *
 * Offers only exist where the work does: the hauler's chosen route must
 * pass a living band's camp. That band is named on the contract and
 * always sorties on this convoy.
 */
export function generateEscortOffers(
  nodeId: string,
  world: WorldStatic,
  quanta: Quantum[],
  markets: Record<string, NodeMarket>,
  units: Unit[],
  rng: Rng,
  currentTick: number,
  reputation?: Reputation,
): EscortOffersResult {
  const origin = world.nodes[nodeId]
  const result: EscortOffersResult = { offers: [], quanta, markets }
  if (!origin) return result

  const faction = nodeFaction(origin)
  const repPay = reputation ? payModifier(reputation, faction) : 1

  // Living bands with camp + size, for threat matching and pay.
  const bands = new Map<string, { camp: [number, number]; size: number }>()
  for (const u of units) {
    if (!u.bandId || !u.spawn || unitDestroyed(u)) continue
    const entry = bands.get(u.bandId)
    if (entry) entry.size++
    else bands.set(u.bandId, { camp: u.spawn, size: 1 })
  }
  if (bands.size === 0) return result

  const docked = quanta
    .filter(
      (q) =>
        q.location === nodeId &&
        !q.materialized &&
        q.holdUntilTick === undefined &&
        q.cargo === null,
    )
    .sort((a, b) => a.id.localeCompare(b.id))

  for (const q of docked) {
    if (result.offers.length >= ESCORT_OFFERS_MAX) break
    const run = pickBestRun(nodeId, result.markets, world.routes, q.credits)
    if (!run) continue
    const route = world.routes[run.adj.routeId]
    if (!route) continue

    // The chosen road must actually pass a camp — no threat, no charter.
    let threat: { bandId: string; size: number } | null = null
    for (const [bandId, { camp, size }] of [...bands.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const camped = route.path.some(
        ([lat, lng]) => marsDistance(camp[0], camp[1], lat, lng) <= RAIDER_CAMP_THREAT_KM,
      )
      if (camped) {
        threat = { bandId, size }
        break
      }
    }
    if (!threat) continue

    // Pre-buy the shipment and schedule the departure.
    const market = result.markets[nodeId]
    const cost = round2(market.prices[run.commodity] * run.qty)
    const departTick = currentTick + ESCORT_DEPART_DELAY_TICKS
    result.markets = {
      ...result.markets,
      [nodeId]: {
        ...market,
        inventory: {
          ...market.inventory,
          [run.commodity]: (market.inventory[run.commodity] ?? 0) - run.qty,
        },
      },
    }
    result.quanta = result.quanta.map((it) =>
      it.id === q.id
        ? {
            ...it,
            credits: round2(it.credits - cost),
            cargo: { commodity: run.commodity, qty: run.qty, paid: cost },
            holdUntilTick: departTick,
            forcedRoute: {
              routeId: run.adj.routeId,
              reversed: run.adj.reversed,
              destination: run.adj.neighbor,
            },
          }
        : it,
    )

    const cargoValue = run.qty * COMMODITY_VALUES[run.commodity]
    const pay = Math.round(
      (ESCORT_PAY_BASE +
        threat.size * ESCORT_PAY_PER_RAIDER +
        cargoValue * ESCORT_PAY_VALUE_FACTOR) *
        repPay *
        rng.range(0.9, 1.15),
    )
    result.offers.push({
      id: `${nodeId}-${currentTick}-esc-${q.id}`,
      type: 'escort',
      origin: nodeId,
      destination: run.adj.neighbor,
      quantumId: q.id,
      routeId: run.adj.routeId,
      bandId: threat.bandId,
      hostiles: threat.size,
      departTick,
      commodity: run.commodity,
      quantity: run.qty,
      faction,
      pay,
      postedTick: currentTick,
      deadlineTick: null,
      boardExpiryTick: departTick,
      status: 'available',
    })
  }

  return result
}

/** Should this node's board be regenerated? */
export function boardStale(board: Board | undefined, currentTick: number): boolean {
  if (!board) return true
  return currentTick - board.generatedTick >= BOARD_REFRESH_TICKS
}
