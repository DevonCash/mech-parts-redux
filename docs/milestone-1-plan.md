# Milestone 1 — Strategic Map + Movement: Implementation Plan

Sequenced for a solo developer working through it PR by PR. Each epic produces something visible and testable. Tests use Vitest (set up in Epic 1).

File paths follow the project structure defined in `technical.md`: simulation logic in `src/sim/`, reactive state in `src/stores/`, UI components in `src/ui/`, and the game shell at `src/`.

---

## Epic 1: Foundation — Game Loop, State, and Test Infrastructure

The current `game.ts` uses real-time deltas multiplied by a time scale. The design spec calls for a fixed timestep with variable rendering. This epic replaces the game loop, splits state into domain stores, and sets up Vitest.

### 1.1 Set up Vitest

Add Vitest and configure it for the project. This unblocks testing for everything that follows.

- Install `vitest` and add `"test": "vitest"` to package.json
- Add a vitest config (or extend vite.config.ts) with Svelte support
- Write one trivial test to confirm the runner works
- **Verify:** `pnpm test` runs and passes

### 1.2 Fixed timestep game loop

Replace the current `game.ts` with a fixed-timestep simulation decoupled from rendering.

- Create `src/sim/tick.ts` — the core tick engine. Pure logic, no DOM.
  - Define `TICK_DURATION_MS` constant (e.g. 100ms game-time per tick)
  - Export a `step(realDeltaMs, timeScale)` function that accumulates time and returns the number of ticks to process plus the interpolation remainder
  - `timeScale` controls how fast game time flows relative to real time: 1x = real-time, 10x = 10 ticks per real second, 100x = 100 ticks per real second. 0 = paused (no ticks).
- Create `src/sim/constants.ts` — `MARS_RADIUS_KM`, `MARS_EARTH_RATIO`, `h3EdgeToMars`, `h3AreaToMars`, `marsDistance` (the conversion helpers from `technical.md`)
- Update `src/Game.svelte` to use requestAnimationFrame for rendering and call `step()` to determine simulation ticks per frame. The render loop reads the latest state and interpolation fraction.
- **Test:** `src/sim/tick.test.ts` — calling `step()` with accumulated time produces the expected number of ticks. timeScale=0 produces zero ticks. Fractional accumulation carries over correctly.
- **Test:** `src/sim/constants.test.ts` — `marsDistance` against known Mars landmarks (Olympus Mons to Hellas Basin ≈ ~8,500 km).

### 1.3 Split state into domain stores

Replace the single `atom` with domain-specific nanostores.

- Create `src/stores/time.ts` — gameTime (derived from tick count), tick counter, timeScale
- Create `src/stores/crawler.ts` — position (lat/lng), currentNode (if docked), currentRoute (if moving), routeProgress (0–1), destination, inventory (stub)
- Create `src/stores/world.ts` — nodes, routes (starts empty, populated in Epic 3)
- Create `src/stores/selection.ts` — currently selected node or entity
- Keep localStorage persistence via `@nanostores/persistent` on each store
- Update `src/Game.svelte` and UI components to read from the new stores
- Delete the old `src/lib/game.ts`
- **Verify:** Game starts, time controls work, state persists across page reload

### 1.4 Reorganize existing UI

Move existing Svelte components into the `src/ui/` structure.

- `src/lib/cmp/GameTime.svelte` → `src/ui/hud/GameTime.svelte`
- `src/lib/cmp/PauseMenu.svelte` → `src/ui/menu/PauseMenu.svelte`
- `src/lib/cmp/Button.svelte` → `src/ui/shared/Button.svelte`
- `src/lib/MainMenu.svelte` → `src/ui/menu/MainMenu.svelte`
- `src/lib/mars/MarsMap.svelte` → `src/ui/map/MarsMap.svelte`
- `src/lib/mars/MarsGlobe.svelte` → `src/ui/map/MarsGlobe.svelte`
- Existing mars utilities (`terrain-shader.ts`, `mola.ts`, `contours.ts`, etc.) → `src/ui/map/` (they're rendering concerns, not simulation)
- `src/lib/commands.ts` → `src/commands.ts`
- `src/lib/keybinds.ts` → `src/keybinds.ts`
- Update all import paths
- **Verify:** Game runs identically after the move. No broken imports.

---

## Epic 2: H3 Backend Integration

Set up H3 as the backend spatial index for pathfinding and area queries. H3 is not a player-facing UI element — players interact with the map via lat/lng coordinates, and the backend resolves positions to H3 cells internally.

### 2.1 H3 utility layer

- Add `h3-js` to dependencies
- Create `src/sim/h3/index.ts` — H3 utility functions: `zoomToResolution(zoom)` maps zoom levels to H3 resolutions, `cellsInViewport(bounds, zoom)` returns H3 cell IDs for spatial queries, `cellBoundaryToGeoJSON(cell)` for debug/diagnostic use
- **Test:** `src/sim/h3/index.test.ts` — `cellsInViewport` returns expected cell count for a known bounding box. Resolution selection returns correct res for each zoom range.
- **Verify:** Utility functions work correctly, no UI rendering involved

---

## Epic 3: Nodes and Routes

Place settlements and infrastructure on the map, connect them with routes.

### 3.1 Node data model

Define the node type and create a seed dataset of test nodes placed at real Martian locations.

- Create `src/sim/economy/models.ts` — Zod schema for Node: id, name, position (lat/lng), type (extraction/processing/settlement/depot/terminal), h3Cell (derived from position at res 5)
- Create `src/sim/economy/seed-nodes.ts` — 10–15 hand-placed test nodes at recognizable locations: mining extraction near Olympus Mons, ice drill near the north pole, settlements in Hellas Basin and Valles Marineris, a terminal at a plausible spaceport site, depots at strategic locations. Each has a name, type, and lat/lng.
- On game start, populate `src/stores/world.ts` with seed nodes
- **Test:** `src/sim/economy/models.test.ts` — Zod schema validates seed data. Each node's h3Cell matches its lat/lng.

### 3.2 Node rendering on MapLibre

Display nodes as markers on the map with type-differentiated styling.

- Create `src/ui/map/node-layer.ts` — reads from the world store, generates GeoJSON, manages a MapLibre source with circle + symbol layers
- Render nodes as circle markers with colors by type (extraction=orange, processing=yellow, settlement=green, depot=blue, terminal=white)
- Add symbol labels (node name) visible at appropriate zoom levels
- Style: wireframe aesthetic — simple geometric markers, monospace labels, low-opacity halos
- **Verify:** All seed nodes visible on the map at correct locations, labels readable, markers distinguishable by type

### 3.3 Node info panel

Click a node to see its details.

- Clicking a node marker updates the selection store with the node ID
- Create `src/ui/panels/NodeInfo.svelte` — reads selection store, displays: node name, type, position, H3 cell, elevation (stub)
- Stub fields for future data: inventory, condition, faction influence — show as "---" or "NO DATA"
- Panel dismisses when clicking elsewhere (selection cleared)
- **Verify:** Click a node, see its info. Click elsewhere, panel dismisses.

### 3.4 Route data model and generation

Define routes between nodes and compute paths.

- Add Route to `src/sim/economy/models.ts` — Zod schema: id, from (node id), to (node id), path (array of lat/lng waypoints), distance (km), terrain (0–1 difficulty)
- Create `src/sim/h3/pathfinding.ts` — given two node positions, generate a route path. Initial implementation: great-circle path subdivided into segments. Uses `marsDistance` from `constants.ts` for distance computation.
- Compute `terrain` as a stub (0.5 for all routes initially — real elevation sampling comes later)
- Create `src/sim/economy/seed-routes.ts` — generate routes for the seed nodes: connect nearby nodes into a plausible network (each node connects to 2–4 neighbors, not fully connected)
- Store routes in the world store on game start
- **Test:** `src/sim/h3/pathfinding.test.ts` — route distances are plausible (check a few against known Mars geography). `src/sim/economy/models.test.ts` — Route schema validates seed data.

### 3.5 Route rendering on MapLibre

Draw routes as lines on the map.

- Create `src/ui/map/route-layer.ts` — reads from the world store, generates GeoJSON lines, manages a MapLibre source/layer
- Style: dashed or dotted lines in the wireframe aesthetic, color or opacity varying by terrain difficulty
- Route lines render below node markers but above terrain
- **Verify:** Routes visible connecting nodes, lines follow plausible paths

---

## Epic 4: Crawler Movement

Put the crawler on the map and let it drive between nodes.

### 4.1 Crawler entity and rendering

Place the crawler on the map as a movable marker.

- Initialize crawler position at one of the seed settlements in `src/stores/crawler.ts`
- Create `src/ui/map/crawler-layer.ts` — renders the crawler as a distinct marker on MapLibre (a larger, brighter diamond or chevron shape). Reads position reactively from the crawler store.
- **Verify:** Crawler visible at the starting node, visually distinct from other markers

### 4.2 Movement system

Implement crawler movement along routes.

- Create `src/sim/crawler/movement.ts` — a pure function `advanceCrawler(state, tickDuration, routes)` that advances the crawler along its current route and returns updated state
  - Movement per tick: `(tickDurationSec / route.distance) × crawlerSpeed × (1 / route.terrain)` — progress as a 0–1 fraction
  - `crawlerSpeed` is a constant for now (km per game-second)
  - On arrival (progress ≥ 1.0): set currentNode to destination, clear route/progress
- Hook into the game loop: each simulation tick calls `advanceCrawler` and writes the result to `src/stores/crawler.ts`
- Interpolate crawler position between ticks for smooth rendering (use the interpolation fraction from the tick engine)
- **Test:** `src/sim/crawler/movement.test.ts` — crawler at progress 0 on a 100km route at 10 km/s advances to expected progress after N ticks. Arrival detection at progress ≥ 1.0. Multi-tick advancement doesn't overshoot.

### 4.3 Movement orders

Let the player send the crawler somewhere.

- Click a node while the crawler is docked → "TRAVEL" button appears in NodeInfo panel
- Only offer travel to nodes connected by a route to the current node (direct connections only — multi-hop in 4.4)
- On accepting: set the crawler's destination and current route in the crawler store, movement system takes over
- While moving: crawler marker interpolates along the route path on the map, NodeInfo panel shows ETA based on remaining distance and speed
- Allow canceling movement (for now, snap to nearest node for simplicity)
- **Verify:** Click a connected node, crawler moves along the route, arrives at the destination. Time controls affect movement speed (faster at 10x/100x).

### 4.4 Multi-hop pathfinding

Navigate across multiple routes to reach a distant node.

- Create `src/sim/h3/graph.ts` — build adjacency list from routes, implement A* (nodes are vertices, routes are edges, edge weight = distance × terrain)
- When the player clicks a node that's not directly connected, compute the shortest path and queue the route segments in the crawler store
- Crawler moves along each segment in sequence, passing through intermediate nodes
- Display the full planned path on the map as a highlighted route overlay in `src/ui/map/crawler-layer.ts`
- **Test:** `src/sim/h3/graph.test.ts` — A* correctness on a small test graph (known shortest path). Unreachable node returns no path. `src/sim/crawler/movement.test.ts` — crawler follows a multi-segment path to completion.

---

## Epic 5: Time System and UI Polish

The time display, speed controls, and the wireframe aesthetic for the command terminal.

### 5.1 Mars calendar and time display

Replace the current Earth-date display with a Mars-appropriate time system.

- Add Mars sol constants to `src/sim/constants.ts`: `MARS_SOL_MS = 88_775_244` (24h 37m 22.663s in milliseconds)
- Create `src/sim/time.ts` — pure functions: `tickToSol(tick)`, `solToDisplay(sol)` → "Sol 47, 14:22" format
- Update `src/ui/hud/GameTime.svelte` to use the new format
- Time controls: pause (0x), 1x, 5x, 10x, 50x, 100x — replace the current three-button setup
- Display current speed multiplier
- **Test:** `src/sim/time.test.ts` — sol calculation from tick count. Display formatting for edge cases (sol 0, sol 1000+, hour rollover).

### 5.2 Settlement docking UI

When docked at a settlement, show a context-appropriate panel.

- Expand NodeInfo for docked state: detect if crawler is at the selected node (compare crawler store's currentNode to selection store)
- Show additional section with stub action buttons: "CONTRACTS" (disabled), "TRADE" (disabled), "HIRE" (disabled) — placeholders for Milestone 3
- Show the settlement type and a brief flavor description (hand-written per seed node, or generated from type)
- **Verify:** Dock at a settlement, see the expanded panel with actions. Leave, actions disappear.

### 5.3 HUD and wireframe aesthetic

Establish the command terminal visual language for all UI elements.

- Create `src/ui/shared/theme.css` — CSS custom properties: monospace font stack, color palette (terminal green primary, amber warning, red critical, white neutral), dark backgrounds, border styles (single-pixel, low-opacity), subtle scanline overlay (optional)
- Create `src/ui/shared/Panel.svelte` — reusable terminal-style panel frame with title bar, used by NodeInfo, HexInfo, and future panels
- Apply theme to: header bar, time controls, node info panel, hex info, any overlays
- Replace the current resource display (¤, ⚙, ⏣) with labeled terminal-style readouts (or remove them — resources aren't functional until Milestone 3)
- **Verify:** All UI elements look cohesive and match the wireframe/vector aesthetic. The game feels like a command terminal, not a web app.

---

## Epic 6: Camera and Map Interaction

Quality-of-life for navigating the map as a commander. Independent of other epics after Epic 1.

### 6.1 Focus controls

Quick navigation to important locations.

- Double-click a node → camera flies to it (MapLibre `flyTo`)
- Keyboard shortcut to center on crawler (Home or C key) — add to `src/keybinds.ts`
- Optional "follow" mode while crawler is moving: camera tracks the crawler marker
- **Verify:** Double-click a distant node, camera smoothly flies to it. Press Home, camera returns to crawler.

### 6.2 Zoom-to-detail mapping

As you zoom in, the map transitions from strategic to regional to tactical feel.

- At low zoom (0–3): major contours, region names, nodes as dots
- At mid zoom (4–6): mid contours, feature names, nodes as labeled markers, routes visible
- At high zoom (7+): minor contours, crater names, detailed node rendering
- Mostly tuning existing layers' min/maxzoom and label density
- **Verify:** Zooming in and out feels like a smooth transition between strategic overview and regional detail

---

## Dependency Graph

```
Epic 1 (game loop, state, vitest, file reorg)
  ├──▶ Epic 2 (H3 backend utilities)
  │      └──▶ Epic 3 (nodes & routes)
  │             └──▶ Epic 4 (crawler movement)
  │                    └──▶ Epic 5 (time, docking, HUD)
  │
  └──▶ Epic 6 (camera & map interaction) ── independent after Epic 1
```

Epic 6 can be done at any point after Epic 1. Everything else is sequential.

---

## Verification Criteria

### Per-epic acceptance

- **Epic 1:** Game starts, time flows at variable speeds, state persists across reload, `pnpm test` passes, files organized per `technical.md` structure
- **Epic 2:** H3 utility functions return correct cells for viewport queries and resolution selection
- **Epic 3:** 10+ nodes visible at real Mars locations, connected by route lines, clicking a node shows info
- **Epic 4:** Crawler moves along routes between nodes in real time, speed changes with time scale, multi-hop pathfinding works
- **Epic 5:** Time displayed as Mars sols, speed controls cover 0x–100x, docked UI shows settlement info, HUD looks like a command terminal
- **Epic 6:** Camera flies to clicked nodes, follows crawler, zoom levels feel like a coherent transition

### Smoke tests

**Test 1 — The road trip.** Start a new game. Crawler is at a settlement. Speed up to 10x. Click a node three hops away. Watch the crawler move along the route, passing through intermediate nodes, arriving at the destination. Slow to 1x. The time display shows sols have passed. Click the settlement — see its info panel with docked actions.

**Test 2 — The overview.** Zoom all the way out to see the whole planet. Nodes are dots with region labels. Zoom in on Valles Marineris. Contour lines become more detailed. Route lines appear between nearby nodes. Nomenclature labels shift from regions to features to craters. The crawler is visible as a distinct marker.

### Automated test coverage

| Domain | File | What's tested |
|--------|------|---------------|
| Tick engine | `src/sim/tick.test.ts` | Accumulation, time scale, deterministic stepping |
| Mars math | `src/sim/constants.test.ts` | Distance calculations, H3 conversions |
| H3 | `src/sim/h3/index.test.ts` | Viewport cell computation, resolution selection |
| Pathfinding | `src/sim/h3/graph.test.ts` | A* correctness on test graphs |
| Pathfinding | `src/sim/h3/pathfinding.test.ts` | Route distance plausibility |
| Models | `src/sim/economy/models.test.ts` | Zod validation for nodes and routes |
| Movement | `src/sim/crawler/movement.test.ts` | Progress calculation, arrival, multi-hop |
| Time display | `src/sim/time.test.ts` | Sol calculation, display formatting |

All tests are in `src/sim/` — pure logic, no DOM dependencies.

---

## Out of Scope

These are explicitly not part of Milestone 1 — they're designed but deferred:

- Economy simulation (web worker, quanta, commodity flow) — Milestone 2
- Contracts (generation, discovery, negotiation) — Milestone 3
- Combat (units, damage, orders, pilot AI) — Milestone 4
- Factions (influence, hierarchy, charters) — Milestone 5
- Weather, communications, construction — Milestone 5
- Ink narrative integration — Milestone 5
- Multiplayer — Beyond
- Legacy system — Beyond
- Audio — Beyond
- Elevation-aware pathfinding (A* weighted by DEM) — deferred within M1, use great-circle paths initially
- Real commodity inventories on nodes — stub data only
- Node condition and decay — Milestone 2
