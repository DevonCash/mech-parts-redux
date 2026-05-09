# mech.parts

**Genre:** Real-time tactics + mercenary company management
**Touchstones:** Mount & Blade (roaming a living map, building reputation, faction politics), football playcalling (plan, execute, adjust — you're the coach, not the quarterback), BattleTech (mech salvage/refit culture)
**Setting:** Mars, late colonization era
**Tone:** Hard sci-fi. Grounded, lived-in, politically messy.
**Aesthetic:** Wireframe/vector display — topographic maps, neon linework on black. Think military terminal UI crossed with an engineering schematic. The strategic map uses real Martian topography (MOLA elevation data).

---

## Premise

Mars is halfway terraformed and already fought over. Orbital corporations, settler coalitions, and the remnants of a failed UN governance project all compete for territory, water rights, and mineral claims. None of them have standing armies — they hire mercenary outfits.

You run one of those outfits. You pick contracts, maintain your mechs, keep your pilots alive, and try to stay solvent in a place where replacement parts ship from Earth on a 6-month delay.

---

## Core Loop

The game flows between two equally weighted layers:

**The Company (Strategic Layer — Real-Time)**
Your base of operations is a mobile crawler — a converted mining rig that serves as hangar, workshop, and barracks. Time flows continuously on the strategic layer. You drive your crawler across Mars, picking up contracts, trading at settlements, and positioning yourself for work. The map is alive: factions expand and clash, supply convoys move on schedules, and opportunities appear and expire.

Key decisions: where to move, which contracts to accept, how to outfit your force, when to spend vs. save, who to hire/fire, which factions to align with or antagonize.

**The Mission (Tactical Layer — Real-Time)**
Contracts play out as real-time engagements on the Martian surface. You deploy a force into terrain shaped by Mars — canyons, dust plains, lava tubes, half-built colony infrastructure. Positioning matters. Elevation matters. The thin atmosphere affects ballistics and heat dissipation differently than Earth-standard.

Combat works like calling plays. The tactical loop has three phases:

*Planning* — With the timescale pulled low, you draw up orders on the topo map: movement routes, fire arcs, overwatch zones, fallback positions, contingency triggers. This is where strategy lives. The wireframe display is your playbook — you're sketching directly on the tactical readout. Casual players can use preset plays or simple attack-move orders. Invested players draw detailed multi-phase plans and set conditional triggers.

*Execution* — You push the timescale up and watch the play unfold. Your pilots and squad leaders execute based on their skills and judgment. A veteran runs a flanking route clean. A green pilot drifts off their waypoint, hesitates at the wrong moment, or blows fire discipline. The enemy does something unexpected and the plan starts fraying.

*Adjustment* — When the play breaks down, you pull the timescale back and call audibles. This is the skill expression: recognizing *when* a plan is broken and issuing the right corrections under pressure. A well-prepared commander has contingency orders already set and just activates them. A scrambling one is drawing new routes in slow-mo while their force takes fire.

The quality of your plan matters as much as the quality of your units. A great play with mediocre pilots can beat a sloppy one with elites.

**Unified time system.** Both layers share a single continuous timeline with a variable timescale. On the strategic map, you might run at 100x while cruising between settlements. In combat, you slow to 1x or lower. There's no hard pause — instead, you can drag the timescale down to near-zero, giving yourself all the thinking time you need while the world keeps breathing. Dust drifts, heat gauges creep, damaged systems flicker. The display never goes dead.

This means combat legibility is something you earn. A well-prepared force with good recon and the right composition feels manageable at normal speed. An underequipped force caught in a bad position feels like it's slipping away from you — which is the point.

Missions feed back into the company layer: salvage from the field becomes your upgrade pipeline, pilot injuries cost time and money, and the outcome of each contract shifts your standing with the factions involved.

---

## What Makes It Interesting

**Scarcity as a design constraint.** Mars is far from supply. You can't just buy the best loadout — you work with what you've salvaged, what you can trade for, and what the next supply ship might carry. Every refit is a tradeoff.

**Consequences that compound.** Taking a lucrative corporate contract might blacklist you with the settler coalition. Losing a pilot mid-campaign means fielding a green replacement. Pushing a damaged mech through one more mission risks losing it entirely. Decisions ripple.

**The aesthetic sells the fiction.** The wireframe/vector display isn't just a style choice — it's diegetic. You're looking at the same tactical readouts your commander would see. Topo-maps for terrain, wire-model silhouettes for mech status, clean data displays for company finances. The UI *is* the game world.

---

## Systems at a Glance

- **Contracts** — Jobs sourced from factions with varying pay, difficulty, objectives, and political implications.
- **Mechs** — The primary player surface. Modular chassis assembled from salvaged and purchased parts. Weapons, armor, mobility, sensors — all swappable, all degradable. These are what you own, maintain, name, and care about. Customization is opt-in: auto-refit handles the basics, but manual tuning rewards you with real advantages (tighter heat curves, better weight distribution, situational loadouts). The depth is there for players who want it, invisible to those who don't.
- **Pilots** — Named characters with skills that improve through deployment. Injuries, morale, and relationships matter.
- **Support Assets** — Mechs are your core, but missions aren't mech-only. Drones, infantry detachments, artillery support, electronic warfare — these appear as per-mission resources. Some come with the contract (the client provides a militia escort), some you can hire locally before deploying, some you unlock through faction reputation or crawler upgrades. You don't maintain a standing infantry platoon — you leverage what's available. The combined arms texture comes from how you integrate these assets into your plans, not from building a full army.
- **Factions** — Corporate interests, settler groups, independent operators. Reputation with each opens and closes doors.
- **Economy** — Cash flow management. Payroll, maintenance, fuel, parts procurement. The supply chain from Earth is slow and expensive.
- **Combat** — Real-time with variable timescale. High-level orders, not micro. Terrain, elevation, atmosphere, heat, ammo, and structural integrity all factor in. Pilot skill determines how well orders are executed.
- **Campaign** — Hybrid structure built on Ink (inkle's narrative scripting language). Ink scripts drive dialogue, contracts, faction events, and story beats, with access to game state (reputation, pilot status, resources) as variables. Hand-authored narrative threads weave through a procedurally active world. The world has a story, but your path through it is emergent.
- **The Crawler** — Your mobile base. It's where repairs happen, where pilots rest, and where you plot your next move on the Martian surface. Upgrading it expands your operational capacity.

---

## Design Principles

- **Opt-in complexity.** Every system has a competent default. Auto-refit your mechs, auto-assign pilots, let the game suggest contracts. But players who dig into the details — hand-tuning loadouts, reading faction politics, optimizing their lance composition — get meaningfully rewarded for it. The game never punishes you for not engaging with a subsystem, but it always rewards you for doing so.
- **Mechs are the star, support is the spice.** Your mechs are the persistent, personal core of your company. Support assets — drones, infantry, artillery — come and go per mission, adding tactical variety without diluting the focus on mech ownership and customization.
- **Single-player focus.** No multiplayer considerations. Every design decision optimizes for the solo experience.

---

## Resolved Notes

- **Support asset types:** All of infantry, light vehicles, recon drones, artillery, electronic warfare, engineering/demolition. Exact balance TBD through playtesting.
- **Support sourcing:** All channels — contract-provided, locally hired, faction-unlocked, crawler-deployed. Which are available depends on context.
- **Map scale:** The entire planet. MOLA elevation data covers the full Martian surface. At the strategic layer's abstraction level this is feasible — settlements, routes, and regions of interest provide structure.
- **Ink integration:** Details TBD during implementation. Ink reads game state variables (reputation, pilot status, resources, location) and writes back narrative flags and triggers.

## Open Questions

- What are the major factions, and what do they want?
- What does a mech chassis look like as a data model? (Slots, hardpoints, weight classes, or something else?)
- What does a "contract" contain? (Objectives, terrain, opposition, pay, support assets offered, faction implications?)
- How does the crawler's capacity constrain your roster? (Max mechs, max pilots, storage for salvage/parts?)
