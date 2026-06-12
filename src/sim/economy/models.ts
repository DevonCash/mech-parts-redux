/**
 * Economy data models — Zod schemas and inferred types.
 *
 * Phase 1 scope: nodes, routes, the ten-commodity roster, and per-node
 * markets with static-ish prices. Recipes, condition, and quanta agents
 * (economy.md) arrive with the live economy in a later phase.
 */
import { z } from 'zod'
import { latLngToCell } from '../h3'

// ── Commodities ─────────────────────────────────────────────────────

/**
 * Two tiers (docs/world/economy.md): local commodities are renewable,
 * legacy commodities are finite Earth-era stock. The distinction is
 * cosmetic in Phase 1 (it shapes prices) and becomes mechanical later.
 */
export const Commodity = z.enum([
  // Local (renewable)
  'ore',
  'ice',
  'metal',
  'fuel',
  'water',
  'food',
  // Legacy (finite, depleting)
  'electronics',
  'medical',
  'fabstock',
  'precision',
])
export type Commodity = z.infer<typeof Commodity>

export const COMMODITIES = Commodity.options

/** Baseline credit value per unit — node profiles scale around these. */
export const COMMODITY_VALUES: Record<Commodity, number> = {
  ore: 8,
  ice: 6,
  metal: 25,
  fuel: 1.5,
  water: 4,
  food: 12,
  electronics: 80,
  medical: 60,
  fabstock: 40,
  precision: 120,
}

export const LEGACY_COMMODITIES: readonly Commodity[] = [
  'electronics',
  'medical',
  'fabstock',
  'precision',
]

// ── Node types ──────────────────────────────────────────────────────

export const NodeType = z.enum([
  'extraction',
  'processing',
  'settlement',
  'depot',
  'terminal',
])
export type NodeType = z.infer<typeof NodeType>

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.tuple([z.number(), z.number()]),  // [lat, lng]
  type: NodeType,
  h3Cell: z.string(),                           // H3 cell at res 5, derived from position
  description: z.string().optional(),           // short flavor text
})
export type GameNode = z.infer<typeof NodeSchema>

// ── Route types ─────────────────────────────────────────────────────

export const RouteSchema = z.object({
  id: z.string(),
  from: z.string(),                             // node id
  to: z.string(),                               // node id
  path: z.array(z.tuple([z.number(), z.number()])),  // waypoints [lat, lng]
  distance: z.number(),                         // km (great-circle for M1)
  terrain: z.number(),                          // 0–1 difficulty (stub 0.5 for M1)
  danger: z.number(),                           // 0–1 ambush risk while in transit
})
export type Route = z.infer<typeof RouteSchema>

// ── Markets ─────────────────────────────────────────────────────────

export const NodeMarketSchema = z.object({
  nodeId: z.string(),
  /** Units available for the player to buy */
  inventory: z.record(Commodity, z.number()),
  /** Posted unit buy price; the player sells at price × SELL_MARGIN */
  prices: z.record(Commodity, z.number()),
  /** Node-profile baseline that drift pulls prices back toward */
  basePrices: z.record(Commodity, z.number()),
  /** Inventory level drift regenerates toward */
  baseInventory: z.record(Commodity, z.number()),
})
export type NodeMarket = z.infer<typeof NodeMarketSchema>

// ── Helpers ─────────────────────────────────────────────────────────

/** Create a Node, auto-computing the H3 cell from its position at res 5. */
export function createNode(
  input: Omit<GameNode, 'h3Cell'>,
): GameNode {
  const [lat, lng] = input.position
  return {
    ...input,
    h3Cell: latLngToCell(lat, lng, 5),
  }
}
