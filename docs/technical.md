# mech.parts — Technical Decisions

Foundational choices that shape how the game gets built. Each one is here because it eliminates a class of problems or makes a hard thing straightforward.

---

## Spatial: H3 Hexagonal Grid

**What:** Uber's H3 — a hierarchical hexagonal grid system that tiles a sphere at multiple resolutions.
**Why:** One coordinate system for the entire game. Strategic map, tactical combat, and everything in between are just different zoom levels of the same hex grid over Mars.
**Package:** `h3-js`

**Mars adaptation:** H3 assumes Earth's equatorial radius (6,371.0 km). Mars's equatorial radius is 3,389.5 km — a ratio of **0.5320**. H3's topology, indexing, and neighbor math are all radius-independent, so everything works as-is. Only the physical dimensions change:

- Cell **areas** scale by r² → multiply documented Earth areas by **0.2830**
- Cell **edge lengths** scale by r → multiply documented Earth edges by **0.5320**
- **Distances** between cell centers scale by r → same factor

Mars-scale hex dimensions at each resolution:

| Res | Mars area (km²) | Mars edge (km) | Use |
|-----|-----------------|----------------|-----|
| 2   | ~24,569         | ~97 km         | Faction territories, strategic regions |
| 3   | ~3,508          | ~37 km         | Strategic sub-regions |
| 4   | ~501            | ~14 km         | Crawler movement, broad positioning |
| 5   | ~71.6           | ~5.2 km        | Settlements, contract locations |
| 6   | ~10.2           | ~2.0 km        | Tactical area of operations |
| 7   | ~1.46           | ~750 m         | Tactical maneuvering |
| 8   | ~0.21           | ~280 m         | Unit positioning, fire arcs |

All resolutions nest — a res-5 hex contains exactly 7 res-6 children, 49 res-7, etc.
Hex neighbors, distances, rings, and pathfinding are all built-in via `h3-js`.

**Conversion helpers** (for use throughout the codebase):
```typescript
const EARTH_RADIUS_KM = 6_371.0;
const MARS_RADIUS_KM = 3_389.5;
const MARS_EARTH_RATIO = MARS_RADIUS_KM / EARTH_RADIUS_KM; // 0.5320

/** Convert an H3 edge length (documented for Earth) to Mars scale */
const h3EdgeToMars = (earthEdgeKm: number) => earthEdgeKm * MARS_EARTH_RATIO;

/** Convert an H3 cell area (documented for Earth) to Mars scale */
const h3AreaToMars = (earthAreaKm2: number) => earthAreaKm2 * MARS_EARTH_RATIO ** 2;

/** Great-circle distance between two lat/lng points on Mars (Haversine) */
function marsDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * MARS_RADIUS_KM * Math.asin(Math.sqrt(a));
}
```

---

## Terrain: MOLA Elevation Data

**What:** NASA's Mars Orbiter Laser Altimeter dataset — a global elevation map of Mars.
**Why:** Real topography rendered as contour lines gives us the aesthetic *and* gameplay-relevant terrain for free. No hand-authored heightmaps needed for the strategic layer.
**Source:** PDS Geosciences Node (public domain, no license restrictions)

The dataset is gridded at ~460m/pixel globally. For the strategic map we'd downsample heavily. For tactical zoom we can use the full resolution, which roughly aligns with our combat hex scale.

**Pipeline:** MOLA GeoTIFF → sample elevation at H3 cell centers → store as a sparse map of hex→elevation → render as contour lines on canvas.

---

## Narrative: Ink

**What:** Inkle's Ink scripting language — purpose-built for branching interactive narrative with state tracking.
**Why:** Contracts, dialogue, faction events, and story beats are all branching-narrative problems. Ink handles conditionals, state variables, and thread management natively. Writing a new contract or event is authoring an `.ink` file, not writing game code.
**Package:** `inkjs` (official JS runtime)

Integration points:
- Ink reads game state as external variables (reputation scores, pilot names, resource levels, current location)
- Ink writes back narrative flags and triggers (quest state, faction attitude shifts, unlocked content)
- Contract generation can mix hand-authored Ink scripts with procedural selection based on game state

---

## State Management: Nanostores

**What:** Already in the project. Lightweight reactive atoms with persistence and subscriptions.
**Why:** The game needs a central reactive state that multiple systems read from — the UI, the simulation tick, the Ink runtime, the save system. Nanostores does this without the overhead of Redux or similar. The `@nanostores/persistent` plugin gives us localStorage saves for free.

**Evolution path:** The current `atom` holding all game state as one object will need to split into domain-specific stores (company, mechs, pilots, map state, active mission) as complexity grows. Nanostores supports this naturally — each store is independent and composable.

---

## Simulation: Fixed Timestep with Variable Rendering

**What:** Decouple the game simulation tick from the render frame rate.
**Why:** The variable timescale is core to the game. A fixed simulation step (e.g., 100ms game-time per tick) running at a rate controlled by the timescale slider gives deterministic behavior at any speed. The renderer interpolates between ticks for smooth visuals.

This is more robust than the current approach in `game.ts` (which multiplies real delta by timeScale). A fixed timestep means:
- Simulation is deterministic regardless of frame rate
- Saving/loading mid-mission is straightforward (state is only valid at tick boundaries)
- Replays become possible (same inputs → same outputs)
- Near-zero timescale works correctly (ticks just arrive very slowly)

---

## Map Rendering: MapLibre GL JS Globe

**What:** MapLibre GL JS with globe projection, contour data served as GeoJSON.
**Why:** WebGL-accelerated rendering. Globe projection renders Mars as a rotatable sphere — no flat-map distortion. Contour geometry is pre-computed at build time so the browser does zero marching-squares work at runtime.
**Package:** `maplibre-gl`

Architecture:
- MapLibre renders Mars as a globe with `projection: { type: "globe" }`
- Contour lines are pre-computed at build time from MOLA data (marching squares → traced polylines → GeoJSON)
- Three contour tiers with zoom-dependent visibility: major (2000m, always visible), mid (1000m, zoom 2+), minor (500m, zoom 4+)
- Unit markers, routes, etc. layer on top as MapLibre sources/layers
- Zoom levels naturally map to H3 resolution levels

Build pipeline (`npm run build:contours`):
```
MOLA binary → marching squares → trace polylines → GeoJSON
```

**Evolution path:** If the GeoJSON file size becomes a problem (loading the full planet at once), graduate to PMTiles vector tiles — the preprocessing is the same, just add a tiling + encoding step at the end. This will matter more once we have higher-resolution tactical data.

---

## Schema Validation: Zod

**What:** Already in the project. Runtime type validation for TypeScript.
**Why:** Game data — mech chassis definitions, part catalogs, contract templates, save files — needs validation at the boundaries (loading from disk, deserializing saves, parsing Ink output). Zod schemas serve as both runtime validators and TypeScript type sources.

Define a mech chassis schema once → get the TypeScript type for free → validate save data on load → validate modded content if we ever support it.

---

## Build: Vite + Svelte 5

**What:** Already in the project.
**Why:** Svelte 5's runes (`$state`, `$derived`, `$effect`) are a natural fit for reactive game UI — HUD elements, menus, and management screens that respond to game state changes. Vite gives fast iteration. The game canvas renders independently; Svelte handles everything around it (HUD overlays, menus, management screens, the refit interface).

---

## Project Structure

Domain-organized, with a shared simulation core that's environment-agnostic (no DOM, no Svelte, runnable in workers or main thread).

```
src/
  main.ts                       # Vite entry point
  App.svelte                    # Root component
  Game.svelte                   # Wires stores to UI, starts the loop
  keybinds.ts
  commands.ts

  sim/                          # Simulation core (pure TypeScript, no DOM)
    types.ts                    # Shared type definitions
    tick.ts                     # Fixed timestep loop
    constants.ts                # Mars radius, H3 scaling, conversions
    h3/                         # H3 utilities, pathfinding
    economy/                    # Node, route, commodity, quanta simulation
    combat/                     # Unit model, damage, pilot AI, orders
    world/                      # Factions, weather, comms, director
    crawler/                    # Crawler state, movement, construction

  workers/                      # Thin entry points for web workers
    economy-worker.ts           # Imports sim/economy, handles messages
    combat-worker.ts            # Future

  stores/                       # Nanostores — bridge between sim and UI
    time.ts                     # gameTime, tick, timeScale
    crawler.ts                  # Position, route, destination, inventory
    world.ts                    # Nodes, routes, factions (from snapshots)
    selection.ts                # Selected node/unit
    contracts.ts                # Available and active contracts

  ui/                           # Svelte components (presentation only)
    hud/                        # Header, time controls, alert feed
    panels/                     # Node info, contracts, company management
    map/                        # MapLibre map, marker layers
    menu/                       # Main menu, pause menu
    shared/                     # Button, Panel, theme.css
```

**Key boundaries:**

- `sim/` imports nothing from `ui/`, `stores/`, or `workers/`. All game logic lives here. Testable without a DOM.
- `workers/` are thin wrappers — import from `sim/`, set up message passing.
- `stores/` is the only shared mutable state between simulation and rendering. The game loop writes to stores; Svelte components read from them.
- `ui/` reads from stores, never imports from `sim/` directly.
- Domain folders inside `sim/` mirror the design docs: `sim/economy/` ↔ `docs/world/economy.md`, `sim/combat/` ↔ `docs/combat/`.

Folders are created as needed per milestone, not all at once.

---

## Not Yet Decided

- **Pathfinding** — A* over the H3 graph is the obvious choice, but we may want hierarchical pathfinding (HPA*) for strategic-scale routes across the whole planet. Decide once we know how crawler movement feels.
- **Audio** — Web Audio API is fine for a terminal-aesthetic game (synth bleeps, static, radio chatter). No decision needed yet.
- **Persistence** — localStorage works for now. If save files get large (full planet state), we may need IndexedDB. Cross that bridge later.
- **Testing** — Vitest is the natural fit for the Vite stack. Set up once we have simulation logic worth testing.
