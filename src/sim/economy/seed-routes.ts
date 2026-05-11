/**
 * Auto-generate seed routes connecting nearby nodes.
 *
 * Each node connects to its 2–4 nearest neighbors, producing
 * a plausible transport network without full connectivity.
 */
import { marsDistance } from '../constants'
import { greatCirclePath, pathDistance } from '../h3/pathfinding'
import type { GameNode, Route } from './models'

/**
 * Generate routes for a set of nodes.
 * Connects each node to its nearest neighbors (up to maxNeighbors),
 * avoiding duplicate edges.
 */
export function generateSeedRoutes(
  nodes: GameNode[],
  maxNeighbors = 3,
): Route[] {
  // For each node, find distances to all other nodes
  const edges = new Set<string>()
  const routes: Route[] = []

  for (const node of nodes) {
    // Sort other nodes by distance
    const others = nodes
      .filter(n => n.id !== node.id)
      .map(n => ({
        node: n,
        dist: marsDistance(
          node.position[0], node.position[1],
          n.position[0], n.position[1],
        ),
      }))
      .sort((a, b) => a.dist - b.dist)

    // Connect to nearest neighbors, skipping already-connected pairs
    let connected = 0
    for (const other of others) {
      if (connected >= maxNeighbors) break

      // Canonical edge key (alphabetical order) to avoid duplicates
      const edgeKey = [node.id, other.node.id].sort().join('--')
      if (edges.has(edgeKey)) {
        connected++ // counts toward the limit
        continue
      }

      edges.add(edgeKey)
      connected++

      const path = greatCirclePath(node.position, other.node.position)
      const distance = pathDistance(path)

      routes.push({
        id: edgeKey,
        from: node.id,
        to: other.node.id,
        path,
        distance,
        terrain: 0.5, // stub for M1
      })
    }
  }

  return routes
}
