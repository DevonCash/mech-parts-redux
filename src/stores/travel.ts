/**
 * Travel commands — issue movement orders to the crawler.
 *
 * Supports both direct routes and multi-hop pathfinding.
 */
import { crawler, type CrawlerState } from './crawler'
import { routes, nodes } from './world'
import { findPath } from '../sim/h3/graph'
import { currentRouteOf } from '../sim/crawler/movement'
import { buildOverlandRoute } from '../sim/crawler/overland'
import type { Route } from '../sim/economy/models'

/**
 * Find a direct route between two nodes, if one exists.
 * Routes are bidirectional — checks both from/to orderings.
 */
export function findDirectRoute(
  fromNodeId: string,
  toNodeId: string,
  routeMap: Record<string, Route>,
): { route: Route; reversed: boolean } | null {
  for (const route of Object.values(routeMap)) {
    if (route.from === fromNodeId && route.to === toNodeId) {
      return { route, reversed: false }
    }
    if (route.from === toNodeId && route.to === fromNodeId) {
      return { route, reversed: true }
    }
  }
  return null
}

/**
 * Get all node IDs directly connected to a given node by a route.
 */
export function connectedNodes(
  nodeId: string,
  routeMap: Record<string, Route>,
): string[] {
  const connected: string[] = []
  for (const route of Object.values(routeMap)) {
    if (route.from === nodeId) connected.push(route.to)
    else if (route.to === nodeId) connected.push(route.from)
  }
  return connected
}

/**
 * Order the crawler to travel to a node.
 * Uses direct route if available, otherwise multi-hop A*.
 * Returns false if no path exists or the crawler isn't docked.
 */
export function travelTo(targetNodeId: string): boolean {
  const state = crawler.get()
  if (!state.currentNode) return false
  if (state.currentNode === targetNodeId) return false

  const routeMap = routes.get()

  // Try direct route first
  const direct = findDirectRoute(state.currentNode, targetNodeId, routeMap)
  if (direct) {
    const path = direct.reversed
      ? [...direct.route.path].reverse()
      : direct.route.path
    const startPos = path[0]

    crawler.set({
      lat: startPos[0],
      lng: startPos[1],
      currentNode: null,
      currentRoute: direct.route.id,
      routeReversed: direct.reversed,
      routeProgress: 0,
      destination: targetNodeId,
      routeQueue: [],
      overlandRoute: null,
    })
    return true
  }

  // Multi-hop pathfinding
  const nodeMap = nodes.get()
  const nodePositions: Record<string, [number, number]> = {}
  for (const n of Object.values(nodeMap)) {
    nodePositions[n.id] = n.position
  }

  const segments = findPath(state.currentNode, targetNodeId, routeMap, nodePositions)
  if (!segments || segments.length === 0) return false

  // First segment starts immediately, rest go in the queue
  const [first, ...rest] = segments
  const firstRoute = routeMap[first.routeId]
  if (!firstRoute) return false

  const firstPath = first.reversed
    ? [...firstRoute.path].reverse()
    : firstRoute.path
  const startPos = firstPath[0]

  crawler.set({
    lat: startPos[0],
    lng: startPos[1],
    currentNode: null,
    currentRoute: first.routeId,
    routeReversed: first.reversed,
    routeProgress: 0,
    destination: targetNodeId,
    routeQueue: rest.map(s => [s.routeId, s.reversed] as [string, boolean]),
    overlandRoute: null,
  })

  return true
}

/**
 * Order the crawler straight across open terrain to a node — no roads.
 * Twice the effective distance cost of a road km, but well clear of
 * the ambush corridors raiders watch.
 */
export function travelOverland(targetNodeId: string): boolean {
  const state = crawler.get()
  if (!state.currentNode) return false
  if (state.currentNode === targetNodeId) return false

  const nodeMap = nodes.get()
  const from = nodeMap[state.currentNode]
  const to = nodeMap[targetNodeId]
  if (!from || !to) return false

  const leg = buildOverlandRoute(from, to)
  crawler.set({
    lat: leg.path[0][0],
    lng: leg.path[0][1],
    currentNode: null,
    currentRoute: leg.id,
    routeReversed: false,
    routeProgress: 0,
    destination: targetNodeId,
    routeQueue: [],
    overlandRoute: leg,
  })
  return true
}

/**
 * Cancel current travel — snap to the nearest route endpoint.
 */
export function cancelTravel(): void {
  const state = crawler.get()
  if (!state.currentRoute) return

  const routeMap = routes.get()
  const route = currentRouteOf(state, routeMap)
  if (!route) return

  // Snap to whichever endpoint is closer based on progress
  const nearStart = state.routeProgress < 0.5
  const path = state.routeReversed ? [...route.path].reverse() : route.path
  const snapNode = nearStart
    ? (state.routeReversed ? route.to : route.from)
    : (state.routeReversed ? route.from : route.to)
  const snapPos = nearStart ? path[0] : path[path.length - 1]

  crawler.set({
    lat: snapPos[0],
    lng: snapPos[1],
    currentNode: snapNode,
    currentRoute: null,
    routeReversed: false,
    routeProgress: 0,
    destination: null,
    routeQueue: [],
    overlandRoute: null,
  })
}
