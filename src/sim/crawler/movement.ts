/**
 * Route path interpolation — used to render quanta (and anything else)
 * moving along route polylines. Crawler movement itself goes through
 * the unified order executor in src/sim/combat/orders.ts.
 */

/** Crawler base ground speed in km per game-second (open terrain).
 *  Roads double it (ROAD_SPEED_MULT in combat/orders.ts). */
export const CRAWLER_SPEED_KM_S = 0.5

/**
 * Interpolate a position along a route path at a given progress fraction (0–1).
 */
export function interpolateRoutePath(
  path: [number, number][],
  progress: number,
): [number, number] {
  if (path.length === 0) return [0, 0]
  if (progress <= 0) return path[0]
  if (progress >= 1) return path[path.length - 1]

  // Map progress to a segment
  const totalSegments = path.length - 1
  const exactSegment = progress * totalSegments
  const segIndex = Math.floor(exactSegment)
  const segFraction = exactSegment - segIndex

  const i = Math.min(segIndex, totalSegments - 1)
  const from = path[i]
  const to = path[i + 1]

  return [
    from[0] + (to[0] - from[0]) * segFraction,
    from[1] + (to[1] - from[1]) * segFraction,
  ]
}
