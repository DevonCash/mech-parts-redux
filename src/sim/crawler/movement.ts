/**
 * Crawler movement simulation — pure functions, no DOM or stores.
 *
 * advanceCrawler processes one tick of movement. The game loop calls it
 * each tick and writes the result back to the crawler store.
 */
import type { CrawlerState } from '../../stores/crawler'
import type { Route } from '../economy/models'
import { TICK_DURATION_MS } from '../tick'

/** Crawler speed in km per game-second */
export const CRAWLER_SPEED_KM_S = 0.5  // ~30 km/min, ~1800 km/hr at 1x — fast for gameplay

/** Duration of one tick in game-seconds */
const TICK_DURATION_S = TICK_DURATION_MS / 1000

/**
 * Get the effective path for a route, respecting reversal.
 */
function effectivePath(route: Route, reversed: boolean): [number, number][] {
  return reversed ? [...route.path].reverse() : route.path
}

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

/**
 * Advance the crawler by one simulation tick.
 *
 * Returns a new CrawlerState (does not mutate the input).
 * If the crawler is not on a route, returns the state unchanged.
 */
export function advanceCrawler(
  state: CrawlerState,
  routes: Record<string, Route>,
): CrawlerState {
  if (!state.currentRoute) return state

  const route = routes[state.currentRoute]
  if (!route) return state

  const path = effectivePath(route, state.routeReversed)

  // Progress per tick = speed × tickDuration / routeDistance, scaled by terrain
  const progressPerTick = (CRAWLER_SPEED_KM_S * TICK_DURATION_S) / (route.distance * route.terrain)
  const newProgress = state.routeProgress + progressPerTick

  if (newProgress >= 1.0) {
    // Arrived at route endpoint
    const endPos = path[path.length - 1]
    // The arrival node is the one we're heading toward on this segment
    const arrivalNode = state.routeReversed ? route.from : route.to

    // Check if there are more route segments queued
    if (state.routeQueue.length > 0) {
      const [[nextRouteId, nextReversed], ...remainingQueue] = state.routeQueue
      const nextRoute = routes[nextRouteId]

      if (nextRoute) {
        const nextPath = effectivePath(nextRoute, nextReversed)
        const startPos = nextPath[0]
        return {
          lat: startPos[0],
          lng: startPos[1],
          currentNode: null,
          currentRoute: nextRouteId,
          routeReversed: nextReversed,
          routeProgress: 0,
          destination: state.destination,
          routeQueue: remainingQueue,
        }
      }
    }

    // No more segments — we've arrived at the final destination
    return {
      lat: endPos[0],
      lng: endPos[1],
      currentNode: arrivalNode,
      currentRoute: null,
      routeReversed: false,
      routeProgress: 0,
      destination: null,
      routeQueue: [],
    }
  }

  // Still in transit — update position along the path
  const [lat, lng] = interpolateRoutePath(path, newProgress)

  return {
    ...state,
    lat,
    lng,
    routeProgress: newProgress,
  }
}
