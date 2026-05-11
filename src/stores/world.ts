import { atom } from 'nanostores'

/**
 * World state stores — nodes, routes, factions.
 *
 * Starts empty. Populated in Epic 3 when we add the node/route data model.
 * The economy worker will post periodic snapshots here for the UI to read.
 */

/** All known nodes, keyed by ID */
export const nodes = atom<Record<string, unknown>>({})

/** All known routes, keyed by ID */
export const routes = atom<Record<string, unknown>>({})
