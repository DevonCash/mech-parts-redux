# Pilot AI & Order Execution

How pilots interpret orders, make autonomous decisions, and break down under pressure. This is the system that turns your drawn plans into messy, human reality.

---

## Existing foundation

The concept doc describes the plan/execute/adjust cycle: the player draws orders on the topo map, pilots execute autonomously, and the player adjusts when things break down. NPC personality traits (aggression, ambition, loyalty, adaptability) are defined in `../characters/npcs.md`. The unit model in `mechs.md` provides the mechanical substrate — damage, heat, ammo, power. This design connects all of those into a behavioral system.

---

## Design

### Orders

Orders are what the player draws on the map. Two layers of granularity, following the opt-in complexity principle:

**Zone orders** (default). Paint an area on the map and assign a behavior: attack, defend, overwatch, patrol. Pilots figure out their own paths, positions, and engagement decisions within the zone. This is the accessible layer — casual players or time-pressured moments use zone orders exclusively.

**Waypoint orders** (opt-in). Drop waypoints along a specific path and assign behavior at each point. "Move to A, hold at B, overwatch arc C, fall back to D on trigger." This is the invested-player layer — detailed multi-phase plans with precise positioning. A waypoint order overrides zone behavior for that unit.

Both layers coexist. You might give most of your lance a zone order ("attack this ridge") while giving your sniper a specific waypoint route to a firing position. The system resolves conflicts by specificity: waypoint orders override zone orders for the units they're assigned to.

**Fire arcs.** Drawn on the map as directional cones or sectors. A unit with a fire arc engages targets within that arc and ignores (or deprioritizes) targets outside it. Used for overwatch positions, ambush setups, and coordinated fire plans.

**Engagement rules.** Per-unit or per-group settings: weapons free, weapons hold (fire only if fired upon), weapons tight (fire only at designated targets). Combined with fire arcs, these define how aggressive a unit's autonomous targeting is.

### Contingencies

Units have a **stance** that governs how they react to unplanned situations — anything the player's orders didn't explicitly cover.

**Aggressive** — advance toward threats, pursue retreating enemies, prioritize offense over self-preservation. A unit in aggressive stance that takes unexpected contact pushes toward it.

**Cautious** — seek cover, maintain distance, prioritize self-preservation. A unit in cautious stance that takes unexpected contact pulls back to the nearest defensible position.

**Hold** — stay on the assigned position or path regardless. React to threats but don't reposition. The disciplined default.

On top of the default stance, the player can place **triggers** on the map — conditional orders that fire when a condition is met:

"If a contact enters this zone → execute plan B (fall back to rally point)."
"If this unit drops below 30% structure → retreat to the crawler."
"If all contacts in sector are destroyed → advance to phase line."

Triggers are drawn on the map as zones with attached conditions and response orders. They're the "invested player" tool — you don't need them, but a well-prepared commander has contingencies queued so they're not scrambling when the plan breaks.

### Pilot skills

Two separate axes determine how well a pilot performs in combat:

**Execution fidelity** — how accurately the pilot follows orders. High fidelity means crisp waypoint adherence, timely responses to new orders, clean fire discipline. Low fidelity means literal drift from waypoints, delayed reactions, shooting when they shouldn't or not shooting when they should. This is the "green pilot wanders off the route" axis.

**Tactical judgment** — how well the pilot handles situations the orders didn't cover. High judgment means reading terrain for cover, managing heat and ammo, picking good engagement ranges, repositioning intelligently when the plan breaks down. Low judgment means standing in the open, dumping ammo at max range, overheating, freezing when surprised. This is the "sloppy but brilliant vs. disciplined but unimaginative" axis.

Both skills improve through deployment. A pilot who survives many engagements develops both, but not necessarily equally — a pilot who's always given precise waypoint orders improves fidelity faster. One who's regularly thrown into chaotic situations with zone orders develops judgment.

A pilot can be disciplined but unimaginative (high fidelity, low judgment) — they'll execute your plan to the letter but fall apart when it breaks. Or sloppy but brilliant (low fidelity, high judgment) — they'll ignore your careful waypoints but make good calls on their own. The best veterans are high on both. Green recruits are low on both.

### Personality in combat

All four traits from the NPC system affect combat behavior:

**Aggression** — biases engagement decisions. High-aggression pilots pick closer engagement ranges, pursue retreating enemies, prioritize damage over safety, and are more likely to break cautious orders to press an attack. Low-aggression pilots hang back, disengage early, and prefer overwatch positions.

**Loyalty** — determines how reliably the pilot follows orders under stress. High-loyalty pilots stick to the plan even when it's going badly. Low-loyalty pilots are more likely to break orders when they judge the situation is deteriorating — they might retreat without permission or refuse a suicide advance.

**Adaptability** — governs how quickly the pilot adjusts to changing conditions. High-adaptability pilots react fast to new contacts, shift position when flanked, and handle plan breakdowns smoothly. Low-adaptability pilots stick to their last order even when it's clearly wrong, take longer to respond to new commands, and struggle with fluid situations.

**Ambition** — influences risk-taking. High-ambition pilots take aggressive positions for kills, volunteer for dangerous tasks, and are more likely to break formation to pursue a high-value target. Low-ambition pilots play it safe, stick to the group, and never overextend.

These don't produce isolated effects — they blend into a behavioral profile. A high-aggression, low-loyalty pilot charges in and bails when it goes wrong. A low-aggression, high-loyalty pilot holds a defensive position until you explicitly tell them to leave. The player learns each pilot's personality through observation and their earned tags, then plans accordingly.

### Targeting

Pilots pick their own targets based on autonomous threat assessment. The player sets the frame — fire arcs, engagement rules, target priorities — and the pilot makes specific decisions within that frame.

**Target priorities.** The player can set group-level priorities: focus on armor, prioritize vehicles over infantry, ignore drones, concentrate fire on the nearest threat. These are guidelines, not target locks.

**Threat assessment.** Each pilot evaluates visible contacts based on: range (closer = more threatening), damage potential (what can hurt me), damage state (wounded targets are easier kills), and positioning (flanking contacts are urgent). Skill (tactical judgment) determines how well the pilot weighs these factors. A high-judgment pilot focuses fire on the most dangerous target. A low-judgment pilot shoots at whatever's closest or most visible.

**Fire discipline.** Governed by the engagement rules (weapons free/hold/tight) and the pilot's execution fidelity. A weapons-hold order means "fire only if fired upon" — but a low-fidelity pilot with high aggression might open up early. Fire discipline is where the player feels the difference between a professional lance and a ragged one.

### Stress

Pilots have a **stress** value that functions like a component in the universal model — it has a current value and a max capacity. Stress accumulates during combat and degrades performance when high.

**Stress sources:**
- Taking damage (proportional to severity)
- Seeing an allied unit destroyed (proportional to relationship — a squadmate's death hits harder than a stranger's)
- Operating a critically damaged mech (constant low-level stress from alarms, failing systems)
- Prolonged combat without resolution
- Being targeted by something they can't see (ECM, long-range artillery)

**Stress effects:**
At low stress, no mechanical effect. As stress rises, execution fidelity degrades first (shaky aim, delayed reactions, sloppy positioning). At high stress, tactical judgment degrades too (tunnel vision, target fixation, failure to use cover). At critical stress, the pilot's personality traits determine what happens:

- High aggression → berserk (ignores orders, charges the nearest threat)
- Low aggression → freeze (stops executing, hunkers down)
- High loyalty → holds position but combat effectiveness craters
- Low loyalty → breaks and runs

These aren't random — the player can predict how each pilot will break based on their known traits and tags. "Don't put Vasquez on point — she's tagged 'Reckless' and she'll charge if she gets stressed" is the kind of planning this enables.

**Stress recovery:**
Stress decreases between engagements during downtime. Rate depends on available rest facilities (crew quarters quality on the crawler), medical attention, and time. A pilot pushed through back-to-back contracts without rest accumulates residual stress that doesn't fully clear — their effective stress capacity shrinks until they get proper downtime. This is the mechanical pressure behind "don't burn out your pilots."

### Communication

The player receives three layers of information during combat:

**Map data.** Unit positions, movement vectors, contact markers with confidence percentages, fire arcs, order status. This is the ground truth layer — clean wireframe data on the topo map. Always available, always accurate for what your sensors can see.

**Pilot comms.** Text callouts from pilots reporting what they're experiencing. "Taking fire from the ridge." "Lost visual on contact." "Mech is running hot, pulling back." "They're flanking left." Comms are colored by personality — a high-aggression pilot reports threats as opportunities ("Got a clear shot on the lead mech"), a cautious pilot emphasizes danger ("Heavy contact, requesting permission to fall back"). Comms convey the human context that map markers can't: morale, confusion, urgency.

**System alerts.** Automated warnings from your command AI systems. Damage reports, ammo states, thermal warnings, power failures, component destruction. These are the mechanical facts: "Unit 3: reactor output at 40%." "Unit 1: ammo critical." Alerts escalate in urgency — a yellow caution becomes a red warning becomes a critical failure notification.

The three layers are designed to be scanned at different speeds. Map data is always there. Comms scroll in a feed. Alerts interrupt. A skilled commander reads all three simultaneously. A new player can focus on the map and let comms and alerts wash over them.

---

## What's new

- Two-layer order system: zone orders (default) and waypoint orders (opt-in)
- Fire arcs and engagement rules (weapons free/hold/tight)
- Contingency system: default stance (aggressive/cautious/hold) plus player-authored map triggers
- Two pilot skill axes: execution fidelity and tactical judgment, improving independently through deployment
- All four personality traits affect combat behavior with specific mechanical expressions
- Autonomous targeting with player-set priorities and engagement frames
- Stress as a component: accumulates in combat, degrades performance, triggers trait-dependent breakdowns
- Stress recovery tied to downtime and facilities
- Three-layer combat feedback: map data, pilot comms (personality-colored), system alerts

---

## Resolved

- **NPC pilots use the same AI.** Enemy and allied NPC pilots run the same behavior system with their own traits and skills. NPC merc companies feel authentic because they are — same execution fidelity variance, same trait-driven breakdowns, same stress accumulation. Computation cost is managed by LOD: full AI for units within the player's sensor range, simplified tick for distant engagements the player can't observe.

## Open questions

- How does the trigger UI work? Drawing conditional zones on the map with attached if/then rules is powerful but could be clunky. What's the interaction pattern — dropdown menus on placed markers, a scripting interface, preset trigger templates?
- What are the specific numeric ranges for skill and stress? How fast do skills improve, how quickly does stress accumulate, what are the thresholds for degradation and breakdown? All require playtesting.
