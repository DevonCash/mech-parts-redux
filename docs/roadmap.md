# Development Roadmap

Solo side project, ~10–15 hours/week. Milestones are layered — each one builds on the last and produces something playable (or at least demonstrable). The design docs are the spec; this is the build order.

---

## Milestone 1 — Strategic Map + Movement

**Goal:** Drive a crawler across Mars. The "feeling of the world" milestone.

**What exists:** Terrain renderer (MapLibre GL + MOLA elevation + hillshade shader + contours), globe view, basic game shell (main menu, pause menu, game time component), data pipeline.

**What's needed:**

- H3 backend spatial index (pathfinding, area queries — not a visible UI layer)
- Node data model and placement — a handful of test nodes on the map (settlements, extraction sites, depots) with basic info display
- Route generation between nodes — pathfind along low-elevation corridors, render as lines on the map
- Crawler entity — position on the map, movement along routes, arrival at nodes
- Time system — continuous clock, 1x–100x speed control, time displayed in the UI
- Settlement docking — arrive at a node, see basic info (name, type, inventory stub)
- Wireframe/vector UI foundations — the command terminal aesthetic for panels, text, data displays

**Design docs:** `technical.md` (H3, MapLibre), `world/economy.md` (nodes, routes)

**Estimate:** 2–3 months

---

## Milestone 2 — Economy Simulation

**Goal:** The world is alive. Convoys move, prices shift, nodes produce and consume. You watch it happen from your crawler.

**What's needed:**

- Web worker economy sim — tick loop processing nodes, quanta, routes
- Commodity model — ten commodities in two tiers, inventory per node, price computation
- Quanta — lightweight NPC agents making utility-based job decisions, moving between nodes
- Route traffic — convoys visible on the map as quanta haul goods
- Node condition — degradation over time, crude vs. precision repair distinction
- Route condition — infrastructure decay from traffic, weather, neglect
- State snapshots — worker posts periodic snapshots to main thread for rendering
- Contract generation — nodes with unmet needs produce contracts (display only, not yet interactive)
- Economic data display — prices, inventories, faction influence at visited nodes (filtered through the information gap — stale data, not ground truth)

**Design docs:** `world/economy.md` (primary), `world/technology.md`

**Estimate:** 2–3 months

---

## Milestone 3 — Contracts + Company Management

**Goal:** The core loop without combat. Move, take a job, do the job, get paid, manage your company.

**What's needed:**

- Contract UI — browse available contracts at settlements, see terms, accept
- Contract discovery — local boards at docked settlements, faction contacts relay distant work (simplified — full intel-generated contracts come later)
- Light negotiation — push on pay, deadline, support terms before accepting
- Active contract tracking — objectives mapped to simulation state, completion detection
- Contract competition — NPC merc companies (simplified) pursuing the same contracts
- Company finances — credits, expenses, income tracking
- Crawler inventory — cargo management, commodity trading at nodes
- Basic crew/pilot roster — hire at settlements, assign to roles, personnel file display
- Reputation system — per-faction standing, contract slot limits

**Design docs:** `world/contracts.md`, `world/economy.md` (player actions), `world/factions.md` (reputation)

**Estimate:** 1–2 months

---

## Milestone 4 — Units + Basic Combat

**Goal:** Plan, execute, adjust. The first real fight.

**What's needed:**

- Unit data model — chassis + component stack, template/instance pattern, damage resolution
- Mech rendering — wireframe silhouettes on the topo map, position tracking
- Order system — zone orders (attack/defend/hold/overwatch), fire arcs, engagement rules
- Pilot AI (basic) — units move within zones, pick targets autonomously, execute orders with skill-based fidelity
- Damage model — outside-in component stack traversal, HP/hardness resolution, component destruction consequences
- Pilot skills — execution fidelity and tactical judgment as two axes, affecting behavior
- Stress system — accumulation during combat, performance degradation, trait-dependent breakdowns
- Combat feedback — map markers, pilot comms (text callouts), system alerts
- Salvage — destroyed units leave component stacks on the field, recoverable after engagement
- Mech maintenance — crude repairs (metal) vs. precision repairs (precision components), workshop on crawler
- Economy integration — fuel consumption, ammo as commodity, repair costs

**Design docs:** `combat/mechs.md`, `combat/pilot-ai.md`, `combat/combined-arms.md` (mechs only at first)

**Estimate:** 3–4 months

---

## Milestone 5 — The Living World

**Goal:** The world pushes back. Factions compete, weather rolls in, infrastructure crumbles, information becomes currency.

**What's needed:**

- Faction system — hierarchy, subfactions, influence computation, charter mechanics
- AI director — stability monitoring, perturbation events, transfer window political catalyst
- Weather simulation — fluid sim on H3 grid, dust storms, seasonal cycles, sensor/combat effects
- Communications network — relay towers, mobile relays, command range limit, autonomous operation for out-of-range units
- Intelligence system — confidence percentages on contacts, stale data model, ECM, satellite orbits
- NPC personality — trait evolution from events, earned tags, personality-triggered narrative flags
- Construction — crawler module, buildable structures (relay towers through full nodes), degradation
- Waypoint orders — opt-in detailed control for invested players, contingency triggers
- Combined arms — infantry, vehicles, drones, artillery as additional unit types
- Ink integration — narrative scripts reading game state, parametric NPC casting, story beats

**Design docs:** Everything in `world/` and `characters/`, `combat/intelligence.md`, `combat/buildings.md`

**Estimate:** 3–4 months (and the hardest to scope-control — each subsystem here could expand)

---

## Beyond

Not planned in detail. Possible directions once the core is solid:

- Building-scale combat (stages 2 and 3 from `combat/buildings.md`)
- Legacy system — death/retirement, NPC faction generation, timeline persistence, multi-playthrough accumulation
- Multiplayer — the architecture supports it by design, but the netcode and server infrastructure are their own project
- Specific faction identities — names, lore, starting positions, signature assets for the three orientations
- World generation — node placement against real Martian geology, initial faction territories, starting conditions
- Audio — the wireframe aesthetic suggests a particular sound design direction (data-feed chirps, radio static, mechanical hum)

---

## Principles for the build

- **Playable at every milestone.** Each step produces something you can run and interact with. No "build three systems in the dark and hope they integrate."
- **Simulation first, presentation second.** Get the model running correctly, then worry about how it looks. The wireframe aesthetic is forgiving — clean data display works even with placeholder visuals.
- **Cut scope per milestone, not milestones.** If milestone 4 is taking too long, ship it with fewer unit types or simpler AI, not by skipping to milestone 5. Each layer needs to be solid before building on it.
- **Design docs are the spec.** The open questions in each doc are the known unknowns. Everything else is decided. Build from the docs, update the docs when you learn something from implementation.
