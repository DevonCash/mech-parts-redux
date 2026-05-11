/**
 * Economy data models — Zod schemas and inferred types.
 *
 * Milestone 1 scope: just the fields needed for map rendering and pathfinding.
 * Full economy fields (inventory, condition, recipes, prices, etc.) are added in M2.
 */
import { z } from 'zod'
import { latLngToCell } from '../h3'

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
})
export type Route = z.infer<typeof RouteSchema>

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
