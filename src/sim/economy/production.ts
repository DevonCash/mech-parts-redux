/**
 * Node production + supply/demand pricing (economy.md §Simulation tick
 * steps 1–2, simplified: no condition/workforce/power scaling yet).
 *
 * Runs once per ECON interval. Recipes consume inputs and produce
 * outputs per node type; prices respond to inventory vs the node's
 * want/surplus thresholds instead of drifting blindly to baseline.
 * Legacy goods have no recipes anywhere — settlements consume them and
 * only depot stock and salvage replace them. That's the countdown clock.
 */
import type { Rng } from '../rng'
import {
  COMMODITIES,
  type Commodity,
  type GameNode,
  type NodeMarket,
  type NodeType,
} from './models'
import { round2 } from './seed-market'

export interface Recipe {
  inputs: [Commodity, number][]
  outputs: [Commodity, number][]
}

/** Recipes per node type, amounts per ECON interval (5 game-minutes). */
function recipesFor(node: GameNode): Recipe[] {
  switch (node.type) {
    case 'extraction':
      // Ice sites drill ice, the rest mine ore. Crews eat.
      return node.id.includes('ice')
        ? [{ inputs: [['food', 1]], outputs: [['ice', 12]] }]
        : [{ inputs: [['food', 1]], outputs: [['ore', 12]] }]
    case 'processing':
      return [
        { inputs: [['ore', 6], ['food', 1]], outputs: [['metal', 4]] },
        { inputs: [['ice', 6]], outputs: [['water', 3], ['fuel', 40]] },
      ]
    case 'settlement':
      return [
        // Hydroponics feed the region; the population burns legacy goods.
        { inputs: [['water', 2]], outputs: [['food', 6]] },
        { inputs: [['medical', 0.5], ['electronics', 0.25]], outputs: [] },
      ]
    case 'depot':
      return [] // depots store, they don't make
    case 'terminal':
      // Atmospheric fuel cracking keeps the spaceport lit.
      return [{ inputs: [['food', 1]], outputs: [['fuel', 60]] }]
  }
}

/** Inventory ceiling so production can't pile up without bound. */
function inventoryCap(market: NodeMarket, c: Commodity): number {
  return Math.max(market.baseInventory[c] * 3, 30)
}

/**
 * One production step for a node. Recipes run fractionally when inputs
 * are short (half the ore → half the metal), so shortages upstream
 * cascade downstream instead of stalling binary.
 */
export function produce(node: GameNode, market: NodeMarket): NodeMarket {
  const recipes = recipesFor(node)
  if (recipes.length === 0) return market

  const inventory = { ...market.inventory }
  for (const recipe of recipes) {
    // Fraction of the cycle the inputs can support.
    let fraction = 1
    for (const [c, amount] of recipe.inputs) {
      if (amount <= 0) continue
      fraction = Math.min(fraction, (inventory[c] ?? 0) / amount)
    }
    fraction = Math.max(0, Math.min(1, fraction))
    if (fraction === 0 && recipe.inputs.length > 0) continue

    for (const [c, amount] of recipe.inputs) {
      inventory[c] = round2(Math.max(0, (inventory[c] ?? 0) - amount * fraction))
    }
    for (const [c, amount] of recipe.outputs) {
      inventory[c] = round2(
        Math.min(inventoryCap(market, c), (inventory[c] ?? 0) + amount * fraction),
      )
    }
  }

  // Every node maintains a working fuel reserve via local cracking —
  // hard-locking the player out of refueling is never interesting.
  const fuelFloor = market.baseInventory.fuel
  if (inventory.fuel < fuelFloor) {
    inventory.fuel = Math.min(fuelFloor, inventory.fuel + fuelFloor * 0.1)
  }

  return { ...market, inventory }
}

/** Want/surplus thresholds relative to the node's baseline stock. */
const WANT_RATIO = 0.5
const SURPLUS_RATIO = 1.6
const PRICE_RESPONSE = 0.12
const PRICE_RELAX = 0.06
const PRICE_MIN_FACTOR = 0.4
const PRICE_MAX_FACTOR = 3.0
const JITTER = 0.02

/**
 * One price-adjustment step (economy.md step 2): scarcity raises
 * prices proportional to the deficit, glut lowers them, otherwise a
 * gentle relax toward baseline. Clamped to sane bounds.
 */
export function adjustPrices(market: NodeMarket, rng: Rng): NodeMarket {
  const prices = { ...market.prices }
  for (const c of COMMODITIES) {
    const base = market.basePrices[c]
    const reference = Math.max(1, market.baseInventory[c])
    const inv = market.inventory[c] ?? 0
    const want = reference * WANT_RATIO
    const surplus = reference * SURPLUS_RATIO

    let price = prices[c]
    if (inv < want) {
      const deficit = (want - inv) / want // 0–1
      price *= 1 + PRICE_RESPONSE * deficit
    } else if (inv > surplus) {
      price *= 1 - PRICE_RESPONSE * 0.5
    } else {
      price += (base - price) * PRICE_RELAX
    }
    price *= 1 + rng.range(-JITTER, JITTER)
    prices[c] = round2(
      Math.min(base * PRICE_MAX_FACTOR, Math.max(base * PRICE_MIN_FACTOR, price)),
    )
  }
  return { ...market, prices }
}

/** Full econ step for all markets, in sorted order for determinism. */
export function econStep(
  nodes: Record<string, GameNode>,
  markets: Record<string, NodeMarket>,
  rng: Rng,
): Record<string, NodeMarket> {
  const next: Record<string, NodeMarket> = {}
  for (const nodeId of Object.keys(markets).sort()) {
    const node = nodes[nodeId]
    let market = markets[nodeId]
    if (node) market = produce(node, market)
    next[nodeId] = adjustPrices(market, rng)
  }
  return next
}

/** How short a node is on a commodity, 0 (stocked) to 1 (empty). */
export function shortage(market: NodeMarket, c: Commodity): number {
  const reference = Math.max(1, market.baseInventory[c])
  const inv = market.inventory[c] ?? 0
  return Math.max(0, Math.min(1, 1 - inv / reference))
}
