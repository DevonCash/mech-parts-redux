# mech.parts

**Genre:** Real-time strategy + mercenary company management
**Touchstones:** Mount & Blade (roaming a living map, building reputation, faction politics), football playcalling (plan, execute, adjust — you're the coach, not the quarterback), BattleTech (mech salvage/refit culture), Starsector (irreplaceable tech, faction identity from holdings), Dwarf Fortress (persistent world, legacy timelines), Highfleet (sensor data as gameplay)
**Setting:** Mars, post-Earth-pullback. Partially terraformed — breathable in lowlands, marginal on plateaus, hostile at altitude. Liquid water in basins and seasonal rivers. The infrastructure of a colonization boom, abandoned by its backers.
**Tone:** Hard sci-fi. Grounded, lived-in, politically messy.
**Aesthetic:** Wireframe/vector display — topographic maps, neon linework on black. Think military terminal UI crossed with an engineering schematic. The strategic map uses real Martian topography (MOLA elevation data) with 3D terrain, contour lines, and geologic overlays.

---

## Premise

Mars was halfway through a corporate-backed colonization boom when Earth pulled back. The reasons are distant and political — what matters is the effect: a world built on infinite imports now has to sustain itself from what's already here. Orbital corporations, settler coalitions, and the remnants of a failed UN governance project all compete for territory, water rights, and mineral claims. None of them have standing armies — they hire mercenary outfits.

You are a command AI — a pre-Earth-pullback military coordination system installed on a mobile crawler. You pick contracts, maintain your mechs, keep your pilots alive, and try to stay solvent in a place where the supply chain from Earth has collapsed and every precision component consumed is one fewer in the world. Your pilots fight. You plan.

---

## Core Loop

The game flows between two equally weighted layers:

**The Company (Strategic Layer — Real-Time)**
Your base of operations is a mobile crawler — a converted mining rig that serves as hangar, workshop, and barracks. The crawler is a unit in the same system as your mechs: a chassis with component locations for cargo bays, workshops, crew quarters, reactors, and defensive weapons. Lose the crawler, lose everything — including your server core. Time flows continuously on the strategic layer. You drive your crawler across Mars, picking up contracts, trading at settlements, and positioning yourself for work. The map is alive: factions expand and clash, supply convoys move on schedules, weather systems roll across the surface, and opportunities appear and expire.

Key decisions: where to move, which contracts to accept, how to outfit your force, when to spend vs. save, who to hire/fire, which factions to align with or antagonize, whether to sign a charter with a major faction or stay independent.

**Combat (Real-Time, Same Map)**
There is no separate tactical mode. Combat happens on the strategic map, in real time, at whatever timescale the world is running. You draw orders on the topo map — movement routes, fire arcs, overwatch zones, fallback positions, contingency triggers — and your units execute them autonomously based on their skills and judgment.

The plan/execute/adjust cycle drives the experience:

*Planning* — Before an engagement, you draw up orders on the topo map. Movement routes, fire arcs, overwatch zones, contingency triggers. The wireframe display is your playbook. Casual players can use preset plays or simple attack-move orders. Invested players draw detailed multi-phase plans with conditional triggers. Planning depth is rewarded because you can't freeze the world to think once shooting starts. Good recon — sending scouts, deploying sensor drones, tapping satellite feeds — is how you turn the map from fog into a plan.

*Execution* — Your pilots carry out the plan in real time. A veteran runs a flanking route clean. A green pilot drifts off their waypoint, hesitates at the wrong moment, or blows fire discipline. The enemy does something unexpected and the plan starts fraying. You watch this happen on the same map where convoys are moving and settlements are trading.

*Adjustment* — When the plan breaks down, you issue new orders into a live situation. This is the skill expression: reading the battle from your commander's perspective (sensor feeds, pilot comms, map markers) and reacting fast enough to matter. A well-prepared commander has contingency orders already queued. A scrambling one is drawing new routes while their force takes fire.

The quality of your plan matters as much as the quality of your units. A great play with mediocre pilots can beat a sloppy one with elites. But you don't get the luxury of infinite thinking time — the world keeps moving.

**Unified time system.** Everything runs on one continuous clock. In single player, you can speed time up to 100x while cruising between settlements, and slow to 1x during combat. The floor is real-time — you can't pause or slow below 1x. This is a deliberate constraint: combat legibility is something you earn through preparation.

**Multiplayer-compatible by default.** Because combat runs on the same clock as everything else and doesn't require pausing or phase-switching, two player companies can fight each other (or operate near each other) without any special synchronization. Both commanders are issuing orders into the same live world. In multiplayer, the server sets the tick rate and clients can't slow below it. The same architecture handles both single and multiplayer — the only difference is who controls the clock.

Engagements feed back into the company: salvage from the field becomes your upgrade pipeline, pilot injuries cost time and money, and the outcome of each contract shifts your standing with the factions involved.

---

## What Makes It Interesting

**Scarcity as a design constraint.** Earth pulled back. Legacy stockpiles of electronics, medical supplies, and precision components are finite and depleting. Local manufacturing is possible but crude, expensive, and fragile — a single commodity might take an entire playthrough to bootstrap from legacy-only to locally produced. Every refit is a tradeoff between what you have, what you can scavenge, and what you're willing to pay.

**Information is the most valuable commodity.** The world is fully simulated, but you only see what your sensors can reach. Everything else is stale data aging toward uncertainty. Contacts show up as confidence percentages, not clean icons. ECM creates dead zones. Satellites are Earth-era infrastructure — controlling one is a strategic asset. Good recon turns fog into opportunity. Bad recon gets you killed.

**Consequences that compound.** Taking a lucrative corporate contract might blacklist you with the settler coalition. Losing a pilot mid-campaign means fielding a green replacement — or watching a veteran spiral into recklessness after their squadmate died. Pushing a damaged mech through one more mission risks losing it entirely. Signing a faction charter gives you resources but costs you freedom. Decisions ripple.

**The world doesn't wait.** An AI director monitors regional stability and disrupts equilibria — a mine dries up, a dormant satellite comes online, a subfaction breaks from its parent. The director never provides relief and never fabricates events. It adjusts probability weights so that settled regions don't stay settled. If you're under pressure, you can move somewhere else. Nobody's going to hand you a break.

**The aesthetic sells the fiction.** The wireframe/vector display isn't just a style choice — it's diegetic. You're a command AI looking at the same tactical readouts your systems produce. Topo-maps for terrain, wire-model silhouettes for mech status, confidence percentages on sensor contacts, clean data displays for company finances. The UI *is* the game world.

---

## Systems at a Glance

- **Units** — Everything uses the same model: a chassis with component locations, and components bolted on in an ordered stack. Mechs, tanks, drones, infantry, vehicles, crawlers, even people. Damage walks outside-in through the component stack. Performance scales with HP. See `combat/mechs.md`.
- **Combined Arms** — Mechs are the player's primary attachment, but you can maintain standing forces of any type. Infantry holds ground, artillery provides fire support, drones scout, EWAR platforms jam sensors. Squad-level control with platoon maneuver shorthand. Contracts can also provide transient forces. See `combat/combined-arms.md`.
- **Intelligence** — Fog of war driven by sensor components and ECM. Contacts presented with confidence percentages, not binary identification. Stale data ages toward uncertainty. Satellites are Earth-era strategic assets. See `combat/intelligence.md`.
- **Contracts** — Jobs sourced from factions with varying pay, difficulty, objectives, and political implications. Generated from simulation state. Found through local boards, faction contacts, and intel. Multiple companies compete in parallel. Light negotiation on terms. Active contract slots scale with reputation. See `world/contracts.md`.
- **Communications** — Physical relay network across Mars: node comms, standalone relay towers, mobile relays. Command authority requires a comm link — units beyond range fall back to autonomous operation based on pilot judgment. ECM and weather disrupt comms. Satellite orbits trackable with ground station access. See `world/communications.md`.
- **Pilots & NPCs** — Named characters with skills that improve through deployment. Personality traits shift based on experiences. NPCs earn readable tags ("Cautious," "Crack Shot," "Unreliable") displayed in personnel files. Ink quest templates cast NPCs from your roster into narrative roles based on their traits and history. See `characters/npcs.md`.
- **Factions** — Hierarchical: major factions delegate goals to subfactions. Hierarchy is official political affiliation, visible through insignia. Alliances and collaboration are separate from hierarchy. The player can sign a charter with a major faction, trading autonomy for resources. Factions gain identity from signature assets — unique holdings that define their economic niche. See `world/factions.md`.
- **Economy** — A commodity simulation running in a web worker. Ten commodities in two tiers: local production (renewable) and legacy stockpile (finite, depleting). Hundreds of lightweight NPC agents ("quanta") haul goods, staff nodes, and make utility-based decisions. The player sees filtered, stale, potentially deceptive intel — not ground truth. See `world/economy.md`.
- **Technology** — No tech tree, no research screen. Local manufacturing improves through sustained economic investment — skilled workforce, functioning infrastructure, raw materials. Knowledge spreads through worker movement. One or two commodities might transition from legacy to local per playthrough. See `world/technology.md`.
- **Weather** — Continuous fluid simulation over the H3 grid. Dust storms, seasonal cycles, rain in lowlands, fog in valleys. Sand obscures sensors, storms ground drones and deflect artillery, polarized dust jams ECM. Liquid water in basins with seasonal flooding. See `world/weather.md`.
- **AI Director** — A chaos thermostat. Monitors regional stability metrics and disrupts equilibria by adjusting event probabilities. Never provides relief, never fabricates state. Invisible to the player. See `world/director.md`.
- **Pilot AI** — Pilots execute orders autonomously with two skill axes: execution fidelity (following orders accurately) and tactical judgment (handling what orders don't cover). Personality traits bias combat decisions. Stress accumulates in combat and triggers trait-dependent breakdowns. See `combat/pilot-ai.md`.
- **Combat** — Real-time on the strategic map, no separate tactical mode. Zone orders for casual play, waypoint orders for invested players. Fire arcs, engagement rules, and contingency triggers. Terrain, elevation, atmosphere, heat, ammo, and structural integrity all factor in. Scales from open-field mech engagements down to multi-building complex raids and eventually interior floor plans. See `combat/buildings.md`.
- **Campaign** — Hybrid structure built on Ink. Ink scripts drive dialogue, contracts, faction events, and story beats, with access to game state as variables. Quest templates cast NPCs parametrically from the live roster. Hand-authored narrative threads weave through a procedurally active world.
- **Player & Legacy** — You are a command AI installed on your crawler. Your server core is a targetable component — lose the crawler, lose the game. The world is a persistent Dwarf Fortress-style timeline. On death or retirement, your company becomes an NPC faction. Continue in the same world years later, or start fresh. Multiple legacy factions accumulate across playthroughs. See `characters/player.md`.
- **Construction** — The crawler can mount a construction module that builds new infrastructure on the map: relay towers, sensor outposts, supply caches, fortifications, and full economic nodes. Small structures can be built by dropped crews; large structures require the crawler on-site. Player-built nodes enter the economy and can become self-sustaining. Everything degrades without maintenance. See `world/construction.md`.
- **The Crawler** — Your mobile base, modeled as both an economy node and a unit. It produces (workshop repairs), consumes (fuel, food, water), stores inventory, employs a workforce (your pilots and crew), mounts weapons and defenses, and carries your server core. NPC mercenary companies are also crawler nodes. A rival docked at a settlement competes for the same labor pool and parts supply.

---

## Design Principles

- **Opt-in complexity.** Every system has a competent default. Auto-refit your mechs, auto-assign pilots, let the game suggest contracts. But players who dig into the details — hand-tuning loadouts, reading faction politics, interpreting sensor data, managing their industrial investments — get meaningfully rewarded for it. The game never punishes you for not engaging with a subsystem, but it always rewards you for doing so.
- **Mechs are the star, combined arms is the depth.** Your mechs are the persistent, personal core of your company. Non-mech forces — infantry, vehicles, artillery, drones — add tactical depth and strategic options. You can maintain standing forces of any type, but mechs are what you name, customize, and care about.
- **Emergent over scripted.** Consequences emerge from simulation, not lookup tables. A reactor at 0 HP means no power. A faction that loses its fabrication line starts a slow economic collapse. A pilot who survives too many close calls changes. The simulation is honest; the drama is emergent.
- **Universality.** One model, applied everywhere. Chassis+components describes mechs, tanks, drones, people, buildings, crawlers. Stress works like HP. Comm range governs orders the same way for the player and every NPC faction. When a concept works, extend it as broadly as possible rather than building parallel systems. Fewer rules that apply everywhere beat many rules that apply narrowly.
- **Behavioral consistency.** The player has access to the same tools as every other faction in the world, and vice versa. NPC mercenary companies use the same pilot AI, the same construction capability, the same contract system, the same comm network. If the player can build a relay tower, so can a faction. If an NPC pilot can break orders under stress, so can the player's pilots. No mechanic is player-exclusive or NPC-exclusive. The simulation is one system with one set of rules; the player is a participant, not a special case.
- **Multiplayer-compatible architecture.** Single player is the primary experience, but nothing in the design precludes multiplayer. Combat runs on the same clock as the economy, there's no pause-the-world tactical mode, and player actions are messages into a simulation that doesn't care how many players are connected.

---

## Resolved Notes

- **Player identity:** Command AI. Server core on the crawler. See `characters/player.md`.
- **Unit model:** Universal chassis+components for all entity types. See `combat/mechs.md`.
- **Support assets:** Standing forces allowed, not just per-mission. Templating system for squad/platoon compositions. See `combat/combined-arms.md`.
- **Faction structure:** Hierarchical with subfactions, charters, signature assets. See `world/factions.md`.
- **Detection model:** Confidence percentages, stale data, ECM dead zones. See `combat/intelligence.md`.
- **Technology progression:** Economic process, no research screen. See `world/technology.md`.
- **Setting:** Partially terraformed, post-Earth-pullback, liquid water in lowlands.
- **Map scale:** The entire planet. MOLA elevation data covers the full Martian surface.
- **Ink integration:** Parametric role-casting from live NPC roster. Ink reads game state variables and writes narrative flags.
- **Legacy system:** Persistent world timeline, NPC faction generation on death/retirement. See `characters/player.md`.

## Open Questions

Open questions now live in the relevant design docs. See `docs/README.md` for the index.
