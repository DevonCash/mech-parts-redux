/**
 * Overland (off-road) travel — the crawler is not rail-bound.
 *
 * Routes are infrastructure: graded roads with terrain factor 0.5.
 * Overland legs cut straight across open terrain at factor 1.0 — twice
 * the time and fuel per ground km — but raiders watch the roads, so
 * ambush danger off-road is low. Roads are fast, cheap, and risky;
 * cross-country is slow, thirsty, and quiet.
 */
import { greatCirclePath, pathDistance } from '../h3/pathfinding'
import type { GameNode, Route } from '../economy/models'

/** Synthetic route id for the crawler's current overland leg. */
export const OVERLAND_ROUTE_ID = '__overland__'

/** Open-terrain difficulty (roads run 0.5). */
export const OFFROAD_TERRAIN = 1.0

/** Ambush risk off the road network — raiders camp the roads. */
export const OFFROAD_DANGER = 0.12

/**
 * Build the synthetic route for a direct overland leg between two
 * nodes. Stored on the crawler itself (it isn't part of the network).
 */
export function buildOverlandRoute(from: GameNode, to: GameNode): Route {
  const path = greatCirclePath(from.position, to.position)
  return {
    id: OVERLAND_ROUTE_ID,
    from: from.id,
    to: to.id,
    path,
    distance: pathDistance(path),
    terrain: OFFROAD_TERRAIN,
    danger: OFFROAD_DANGER,
  }
}
