/**
 * Seed per-node markets from node-type profiles.
 *
 * Each node type produces some commodities (cheap, well stocked) and
 * consumes others (expensive, scarce) — that spread is what makes both
 * hauling contracts and freelance arbitrage profitable. Prices get a
 * small seeded jitter so no two runs look identical.
 */
import type { Rng } from '../rng'
import {
  COMMODITIES,
  COMMODITY_VALUES,
  type Commodity,
  type GameNode,
  type NodeMarket,
  type NodeType,
} from './models'

/** Price factor: produces = cheap, consumes = dear, neutral in between. */
interface MarketProfile {
  produces: readonly Commodity[]
  consumes: readonly Commodity[]
}

const PROFILES: Record<NodeType, MarketProfile> = {
  extraction: {
    produces: ['ore', 'ice'],
    consumes: ['food', 'medical', 'precision', 'fuel'],
  },
  processing: {
    produces: ['metal', 'fuel', 'fabstock'],
    consumes: ['ore', 'ice', 'food', 'electronics'],
  },
  settlement: {
    produces: ['food', 'water'],
    consumes: ['metal', 'electronics', 'medical', 'fabstock'],
  },
  depot: {
    produces: ['electronics', 'medical', 'precision', 'fabstock'],
    consumes: ['food', 'water'],
  },
  terminal: {
    produces: ['fuel', 'electronics'],
    consumes: ['ore', 'metal', 'food', 'precision'],
  },
}

const PRODUCER_FACTOR = 0.6
const CONSUMER_FACTOR = 1.4
const NEUTRAL_FACTOR = 1.0

const PRODUCER_STOCK: [number, number] = [80, 200]
const NEUTRAL_STOCK: [number, number] = [10, 40]
const CONSUMER_STOCK: [number, number] = [0, 8]

export function priceFactor(type: NodeType, commodity: Commodity): number {
  const profile = PROFILES[type]
  if (profile.produces.includes(commodity)) return PRODUCER_FACTOR
  if (profile.consumes.includes(commodity)) return CONSUMER_FACTOR
  return NEUTRAL_FACTOR
}

export function seedMarket(node: GameNode, rng: Rng): NodeMarket {
  const prices = {} as Record<Commodity, number>
  const basePrices = {} as Record<Commodity, number>
  const inventory = {} as Record<Commodity, number>
  const baseInventory = {} as Record<Commodity, number>

  const profile = PROFILES[node.type]

  for (const c of COMMODITIES) {
    const base = COMMODITY_VALUES[c] * priceFactor(node.type, c)
    basePrices[c] = base
    prices[c] = round2(base * rng.range(0.9, 1.1))

    const stockRange = profile.produces.includes(c)
      ? PRODUCER_STOCK
      : profile.consumes.includes(c)
        ? CONSUMER_STOCK
        : NEUTRAL_STOCK
    const stock = rng.int(stockRange[0], stockRange[1])
    baseInventory[c] = stock
    inventory[c] = stock
  }

  // Fuel is sold nearly everywhere — guarantee a working minimum so the
  // player is never hard-locked out of refueling at a dock.
  inventory.fuel = Math.max(inventory.fuel, 400)
  baseInventory.fuel = Math.max(baseInventory.fuel, 400)

  return { nodeId: node.id, inventory, prices, basePrices, baseInventory }
}

export function seedMarkets(
  nodes: Record<string, GameNode>,
  rng: Rng,
): Record<string, NodeMarket> {
  const markets: Record<string, NodeMarket> = {}
  // Sort for determinism — object iteration order is insertion order,
  // but don't depend on how the node map was built.
  for (const id of Object.keys(nodes).sort()) {
    markets[id] = seedMarket(nodes[id], rng)
  }
  return markets
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
