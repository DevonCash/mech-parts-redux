/**
 * Seed node dataset — hand-placed at real Martian locations.
 *
 * Coordinates are [lat, lng] in degrees. Locations chosen for:
 * - Geological plausibility (mining near volcanic regions, ice near poles)
 * - Gameplay diversity (spread across the planet, mix of types)
 * - Recognizable Mars geography (players who know Mars should nod)
 */
import { createNode, type GameNode } from './models'

export const seedNodes: GameNode[] = [
  // ── Extraction ────────────────────────────────────────────────────

  createNode({
    id: 'olympus-mine',
    name: 'Olympus Extraction',
    position: [17.5, -134.5],
    type: 'extraction',
    description: 'Ore mining on the lower flanks of Olympus Mons.',
  }),

  createNode({
    id: 'elysium-mine',
    name: 'Elysium Bore',
    position: [22.0, 147.0],
    type: 'extraction',
    description: 'Deep-core mineral extraction at Elysium Planitia.',
  }),

  createNode({
    id: 'polar-ice',
    name: 'Boreal Ice Station',
    position: [78.0, -50.0],
    type: 'extraction',
    description: 'Ice drilling operation on the north polar cap.',
  }),

  createNode({
    id: 'hellas-ice',
    name: 'Hellas Ice Works',
    position: [-40.0, 65.0],
    type: 'extraction',
    description: 'Subsurface ice extraction in the Hellas Basin lowlands.',
  }),

  // ── Processing ────────────────────────────────────────────────────

  createNode({
    id: 'tharsis-refinery',
    name: 'Tharsis Refinery',
    position: [5.0, -105.0],
    type: 'processing',
    description: 'Ore-to-metal refinery on the Tharsis plateau.',
  }),

  createNode({
    id: 'isidis-fab',
    name: 'Isidis Fabrication',
    position: [15.0, 87.0],
    type: 'processing',
    description: 'Precision component fabrication in Isidis Planitia.',
  }),

  // ── Settlements ───────────────────────────────────────────────────

  createNode({
    id: 'valles-hub',
    name: 'Marineris Central',
    position: [-12.0, -70.0],
    type: 'settlement',
    description: 'The largest settlement on Mars, deep in Valles Marineris.',
  }),

  createNode({
    id: 'hellas-town',
    name: 'Hellas Basin Settlement',
    position: [-35.0, 70.0],
    type: 'settlement',
    description: 'Frontier settlement in the basin lowlands. Thin air, cheap rent.',
  }),

  createNode({
    id: 'chryse-landing',
    name: 'Chryse Landing',
    position: [24.0, -34.0],
    type: 'settlement',
    description: 'Historic first-landing site turned trade hub.',
  }),

  createNode({
    id: 'amazonis-outpost',
    name: 'Amazonis Outpost',
    position: [20.0, -160.0],
    type: 'settlement',
    description: 'Remote western outpost. Self-sufficient, barely.',
  }),

  // ── Depots ────────────────────────────────────────────────────────

  createNode({
    id: 'syrtis-depot',
    name: 'Syrtis Cache',
    position: [10.0, 70.0],
    type: 'depot',
    description: 'Mothballed supply depot from the colonial expansion era.',
  }),

  createNode({
    id: 'argyre-depot',
    name: 'Argyre Stockpile',
    position: [-50.0, -43.0],
    type: 'depot',
    description: 'Emergency reserves in the Argyre Basin. Half-looted.',
  }),

  // ── Terminals ─────────────────────────────────────────────────────

  createNode({
    id: 'pavonis-terminal',
    name: 'Pavonis Terminal',
    position: [0.5, -113.0],
    type: 'terminal',
    description: 'Equatorial spaceport on Pavonis Mons. Politically contested.',
  }),
]
