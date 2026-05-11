import { atom } from 'nanostores'
import type { GameNode, Route } from '../sim/economy/models'
import { seedNodes } from '../sim/economy/seed-nodes'
import { generateSeedRoutes } from '../sim/economy/seed-routes'

/**
 * World state stores — nodes and routes.
 *
 * Populated with seed data on import. In M2 the economy worker
 * will post periodic snapshots here for the UI to read.
 */

const seedRoutes = generateSeedRoutes(seedNodes)

/** All known nodes, keyed by ID */
export const nodes = atom<Record<string, GameNode>>(
  Object.fromEntries(seedNodes.map(n => [n.id, n]))
)

/** All known routes, keyed by ID */
export const routes = atom<Record<string, Route>>(
  Object.fromEntries(seedRoutes.map(r => [r.id, r]))
)
