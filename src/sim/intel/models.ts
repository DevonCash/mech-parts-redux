/**
 * Intelligence — fog-of-war lite (docs/combat/intelligence.md).
 *
 * The simulation runs fully and honestly; the player sees snapshots.
 * Node locations are public knowledge (settlements don't move), but a
 * node's STATE — inventory, prices — is only as fresh as the last time
 * the crawler observed it: by docking there or passing within sensor
 * range. Everything else is stale data aging toward uncertainty.
 *
 * Confidence percentages, ECM, and sensor components arrive with the
 * crawler-as-unit phase; this phase establishes the knowledge layer.
 */
import { z } from 'zod'
import { marsDistance } from '../constants'
import { NodeMarketSchema } from '../economy/models'

/** What the player knows about one node: a timestamped snapshot. */
export const NodeIntelSchema = z.object({
  observedTick: z.number(),
  market: NodeMarketSchema,
})
export type NodeIntel = z.infer<typeof NodeIntelSchema>

export type IntelMap = Record<string, NodeIntel>

/** Crawler sensor reach until sensors become components on the chassis. */
export const SENSOR_RANGE_KM = 400

/**
 * The one definition of "the crawler can see this point" — every fog
 * filter (units, convoys, sweeps) goes through here so sensor rules
 * evolve in one place.
 */
export function withinSensorRange(
  observer: { lat: number; lng: number } | undefined,
  lat: number,
  lng: number,
): boolean {
  if (!observer) return false
  return marsDistance(observer.lat, observer.lng, lat, lng) <= SENSOR_RANGE_KM
}

/** Ticks between passive sensor sweeps (5 game-seconds). */
export const OBSERVE_INTERVAL = 50

/** Snapshots younger than this read as LIVE in the UI. */
export const FRESH_TICKS = OBSERVE_INTERVAL * 2
