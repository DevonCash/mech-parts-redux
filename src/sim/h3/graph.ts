/**
 * Route network graph and A* pathfinding.
 *
 * Nodes are vertices, routes are edges.
 * Edge weight = distance × terrain.
 */
import type { Route } from '../economy/models'
import { marsDistance } from '../constants'

export interface PathSegment {
  routeId: string
  reversed: boolean  // true if traversing from route.to → route.from
}

/**
 * Build an adjacency list from a route map.
 * Each node ID maps to its neighbors with the connecting route and direction.
 */
function buildAdjacency(
  routes: Record<string, Route>,
): Map<string, { neighbor: string; routeId: string; reversed: boolean; cost: number }[]> {
  const adj = new Map<string, { neighbor: string; routeId: string; reversed: boolean; cost: number }[]>()

  for (const route of Object.values(routes)) {
    const cost = route.distance * route.terrain

    if (!adj.has(route.from)) adj.set(route.from, [])
    adj.get(route.from)!.push({ neighbor: route.to, routeId: route.id, reversed: false, cost })

    if (!adj.has(route.to)) adj.set(route.to, [])
    adj.get(route.to)!.push({ neighbor: route.from, routeId: route.id, reversed: true, cost })
  }

  return adj
}

/**
 * Find the shortest path between two nodes using A*.
 *
 * Returns an array of PathSegments (route IDs with direction),
 * or null if no path exists.
 *
 * nodePositions is needed for the A* heuristic (great-circle distance).
 */
export function findPath(
  fromNodeId: string,
  toNodeId: string,
  routes: Record<string, Route>,
  nodePositions: Record<string, [number, number]>,
): PathSegment[] | null {
  if (fromNodeId === toNodeId) return []

  const adj = buildAdjacency(routes)
  if (!adj.has(fromNodeId) || !adj.has(toNodeId)) return null

  const toPos = nodePositions[toNodeId]
  if (!toPos) return null

  // A* with great-circle heuristic
  const gScore = new Map<string, number>()
  const fScore = new Map<string, number>()
  const cameFrom = new Map<string, { node: string; routeId: string; reversed: boolean }>()

  gScore.set(fromNodeId, 0)
  const startPos = nodePositions[fromNodeId]
  fScore.set(fromNodeId, startPos
    ? marsDistance(startPos[0], startPos[1], toPos[0], toPos[1])
    : 0
  )

  // Simple priority queue (fine for <100 nodes)
  const open = new Set<string>([fromNodeId])

  while (open.size > 0) {
    // Pick node with lowest fScore
    let current = ''
    let bestF = Infinity
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity
      if (f < bestF) { bestF = f; current = id }
    }

    if (current === toNodeId) {
      // Reconstruct path
      const path: PathSegment[] = []
      let node = toNodeId
      while (cameFrom.has(node)) {
        const prev = cameFrom.get(node)!
        path.push({ routeId: prev.routeId, reversed: prev.reversed })
        node = prev.node
      }
      path.reverse()
      return path
    }

    open.delete(current)
    const neighbors = adj.get(current) ?? []

    for (const edge of neighbors) {
      const tentativeG = (gScore.get(current) ?? Infinity) + edge.cost

      if (tentativeG < (gScore.get(edge.neighbor) ?? Infinity)) {
        cameFrom.set(edge.neighbor, { node: current, routeId: edge.routeId, reversed: edge.reversed })
        gScore.set(edge.neighbor, tentativeG)

        const neighborPos = nodePositions[edge.neighbor]
        const h = neighborPos
          ? marsDistance(neighborPos[0], neighborPos[1], toPos[0], toPos[1])
          : 0
        fScore.set(edge.neighbor, tentativeG + h)

        open.add(edge.neighbor)
      }
    }
  }

  return null  // no path found
}
