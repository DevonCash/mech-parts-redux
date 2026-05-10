# Economy Simulation

The economy is the causal backbone of the game world. Factions don't fight because a script says so — they fight because their material interests collide. Settlements don't die because of a story event — they die because their supply lines failed. Every political relationship, every contract, every convoy on the map traces back to the flow of commodities through a network of economic nodes.

The simulation runs in a web worker, independent of the render loop. It ticks once per game-second, processing a few hundred lightweight agents ("quanta") doing arithmetic against a node graph. The main thread receives periodic state snapshots for rendering and UI.

---

## Setting context

Mars was halfway through a corporate-backed colonization boom when Earth pulled back. The reasons are distant and political — what matters is the effect: a world built on infinite imports now has to sustain itself from what's already here. Infrastructure was built fast and cheap by competing interests, gold-rush style. Some boom towns grew into hubs. Others are half-abandoned. Nobody planned for self-sufficiency.

The population spans generations. Some people remember Earth. Some were born on Mars and have never known anything else. Faith in Earth's return — or lack of it — is the primary political fault line.

---

## Commodities

Ten tradeable commodities in two tiers.

### Local production (renewable)

These form the survival backbone. Mars can produce all of them indefinitely given functioning infrastructure.

- **Ore** — raw minerals from extraction sites. Feedstock for metal refining.
- **Ice** — water ice from polar or subsurface deposits. Processed into water and fuel.
- **Metal** — refined from ore. Used for construction, repairs, fabrication. The universal building material — crude and heavy compared to Earth-era alternatives, but reproducible.
- **Fuel** — hydrogen or methane, cracked from ice or atmospheric processing. Powers everything: crawlers, mechs, settlement generators, fabrication lines.
- **Water** — processed from ice. Life support essential. Also consumed by hydroponics and some industrial processes.
- **Food** — from hydroponic operations. Requires water, power, and functioning agricultural infrastructure. Some settlements are net food producers; most are not.

### Legacy stockpile (finite, depleting)

Earth-era goods that Mars cannot yet manufacture. Every unit consumed is one fewer in the world. This is the countdown clock.

- **Electronics** — circuit boards, processors, sensors, communication equipment. Required to maintain and repair anything computerized, which is almost everything.
- **Medical** — pharmaceuticals, surgical supplies, biotech. Settlements consume steadily. Shortages mean people die.
- **Fabrication stock** — specialized feedstock for advanced manufacturing: carbon fiber, aerospace-grade alloys, precision polymers. The "advanced ore" — useless without a fabrication line, invaluable with one. A node with functioning fabrication equipment and fabstock can produce precision components.
- **Precision components** — bearings, actuators, optics, sealed mechanisms. The things that make Earth-era equipment work at spec. Produced from fabrication stock at equipped nodes, or salvaged from decommissioned/destroyed infrastructure. The alternative is crude metal replacements that work but degrade faster, run hotter, and perform worse.

### Design notes

The two-tier structure creates the core tension. Local production sustains life. Legacy goods determine quality of life and operational capability. A settlement with ore and ice survives. A settlement with electronics and precision components thrives. The player's mechs face the same tradeoff: crude metal repairs keep you running, precision components keep you competitive.

Power is not a traded commodity — it's a node property (solar, nuclear, geothermal capacity) that constrains what a node can do. A refinery without sufficient power output operates at reduced capacity.

---

## Nodes

Nodes are the economic actors — physical locations on the Martian surface that produce, consume, store, and trade commodities.

### Data model

```typescript
interface Node {
  id: string;
  name: string;
  position: [number, number];           // lat, lng on Mars

  type: 'extraction' | 'processing' | 'settlement' | 'depot' | 'terminal';

  infrastructure: Infrastructure[];      // equipment present
  condition: number;                     // 0–1, overall infrastructure health
  decayRate: number;                     // condition lost per tick under full load
  powerCapacity: number;                 // max power output
  powerDraw: number;                     // current power consumption

  inventory: Record<Commodity, number>;
  recipes: Recipe[];                     // production rules

  workforce: number;                     // current workers (quanta at this node)
  workforceCapacity: number;
  population: number;                    // non-worker residents (settlements only)

  influence: Record<FactionId, number>;  // computed each tick, 0–1 per faction
  prices: Record<Commodity, number>;     // local buy/sell prices

  wantThresholds: Partial<Record<Commodity, number>>;  // below this, price rises
  surplusThresholds: Partial<Record<Commodity, number>>; // above this, price falls
}
```

### Node types

**Extraction** — mines, ice drills, atmospheric processors. Consume fuel and power. Produce ore or ice. Located near deposits. Simple infrastructure, relatively easy to maintain.

**Processing** — refineries, fabricators, workshops. Consume raw materials, produce finished goods. The critical middle of the supply chain. A refinery turns ore into metal. A fabrication line turns fabstock into precision components. Quality and output depend on condition and power.

**Settlement** — where people live. Consume food, water, medical. Provide workforce for nearby nodes. Generate contracts. The population creates baseline demand that must be met or people leave (or die). Larger settlements have more infrastructure variety — a big settlement might have a workshop, medical bay, and hydroponics all in one.

**Depot** — legacy stockpile sites. Warehouses, mothballed facilities, emergency caches. Don't produce anything — just store finite legacy goods. Strategically valuable. Some are known, some are discovered through exploration or intel. Stripping a depot for parts is a one-time gain.

**Terminal** — the old Earth-facing spaceports and orbital infrastructure. Politically contested because they represent the possibility of renewed Earth contact. May still receive a trickle of imports on rare occasions. Their real value is the concentration of legacy infrastructure and stockpiles.

### Recipes

A recipe defines one production cycle at a node:

```typescript
interface Recipe {
  inputs: [Commodity, number][];   // what's consumed per tick
  outputs: [Commodity, number][];  // what's produced per tick
  infrastructure: Infrastructure;  // what equipment is required
  powerCost: number;               // power consumed per tick
}
```

Example recipes:
- **Mine:** `[] → [ore, 10]` (consumes fuel implicitly via power)
- **Ice drill:** `[] → [ice, 8]`
- **Refinery:** `[ore, 5] → [metal, 3]`
- **Ice processor:** `[ice, 5] → [water, 3] + [fuel, 2]`
- **Hydroponics:** `[water, 2] → [food, 4]`
- **Fabrication line:** `[fabstock, 1] → [precision, 1]` (requires fabrication infrastructure)
- **Workshop:** `[metal, 2] → crude repairs` (not a commodity — directly restores condition)

### Condition and degradation

Condition is a float from 0 to 1. It affects a node in two ways:

- **Output scaling:** production output multiplied by condition. A refinery at 0.5 produces half as much metal.
- **Failure threshold:** below ~0.2, random breakdowns become frequent. Below ~0.1, the node is effectively non-functional.

Condition degrades through two mechanisms:

- **Background decay:** each tick, condition decreases by `decayRate × (productionLoad)`. A node running at full capacity decays faster than one that's idle. This creates constant maintenance pressure.
- **Events:** discrete incidents — equipment failures, dust storms, raids, accidents — cause sharp condition drops. Probability of events increases as condition decreases (worn-out equipment breaks more often).

Repair consumes commodities:

- **Crude repair** (metal): partially restores condition but doesn't slow the decay rate. Equivalent of welding a patch on a cracked pipe.
- **Proper repair** (precision components): fully restores condition and resets decay rate. Uses Earth-era replacement parts. Better but finite.

This creates a ratchet: every node is slowly getting worse unless someone feeds it precision components. Crude repairs buy time. The long-term trajectory of every node is downward unless the legacy supply holds out.

---

## Quanta

Quanta are lightweight NPC agents that populate the economy. Each one is a data point — no rendering, no pathfinding, just a struct that makes decisions and moves between nodes.

### Data model

```typescript
type Job = 'idle' | 'mining' | 'refining' | 'hauling' | 'farming'
         | 'security' | 'raiding' | 'salvaging' | 'maintenance';

interface Quantum {
  id: string;
  job: Job;
  location: string;                  // node id (if at a node)
  route: string | null;              // route id (if in transit)
  progress: number;                  // 0–1 along current route
  destination: string | null;        // target node id

  inventory: Partial<Record<Commodity, number>>;
  credits: number;

  reputation: Record<string, number>; // per-entity reputation (faction ids, player id, node ids...)
  traits: {
    aggression: number;              // 0–1, willingness to raid/fight
    ambition: number;                // 0–1, preference for high-pay/high-risk
    loyalty: number;                 // 0–1, weight of reputation in decisions
    adaptability: number;            // 0–1, willingness to change jobs/relocate
  };
  proficiencies: Partial<Record<Job, number>>;  // 0–1 skill multipliers
}
```

### Decision-making

Each tick, idle quanta at a node evaluate available jobs using perceived utility:

```
perceivedUtility = basePay
                 × proficiencyMultiplier
                 × traitAlignment
                 × reputationBonus
                 / riskPenalty
```

Where:
- **basePay** — derived from commodity prices at the relevant nodes. A hauling job pays the price difference between source and destination minus fuel cost. A mining job pays the local ore price.
- **proficiencyMultiplier** — how good this quantum is at the job (0.5–1.5). Better miners extract more ore per tick.
- **traitAlignment** — how well the job matches personality. A high-aggression quantum perceives raiding as more lucrative than it is. A high-loyalty quantum overweights jobs that benefit their faction.
- **reputationBonus** — derived from the quantum's reputation toward the entity offering the job. A quantum with high reputation toward Hellas Mining weights their contracts more favorably. Replaces a single faction loyalty — quanta build individual histories with every entity they interact with.
- **riskPenalty** — danger level of the route or location. High-ambition quanta discount this less.

The quantum picks the highest-utility job and commits to it. They don't re-evaluate every tick — they finish the current job (deliver the cargo, complete the shift) before looking again, modified by adaptability (high adaptability quanta abandon unprofitable jobs faster).

### Quantum types by behavior

Quanta aren't hard-typed, but trait distributions create natural archetypes:

- **Haulers** — low aggression, moderate ambition, responsive to price signals. They move goods between nodes along routes.
- **Workers** — low aggression, low ambition, high loyalty. They staff nodes — mining, refining, farming. Steady and predictable.
- **Raiders** — high aggression, high ambition, low loyalty. They attack convoys and poorly-defended nodes. Emerge when legitimate work doesn't pay enough.
- **Mercenaries** — moderate aggression, high ambition, low loyalty. They take security contracts. Compete with the player for work.
- **Salvagers** — moderate everything, high adaptability. They pick through depots and abandoned nodes for legacy goods.

The key insight from the Quanta model: these aren't classes, they're emergent behaviors from the trait distribution. A hauler whose regular route becomes too dangerous might take a security job instead. A worker at a dying settlement might turn to raiding. The simulation doesn't script these transitions — they fall out of the utility calculation.

### Reputation and the information gap

Quanta don't have a single faction loyalty — they carry a per-entity reputation vector built from their history of interactions. Getting paid reliably builds positive reputation toward the payer. Getting sent into danger without adequate support builds negative reputation. The same event produces different reputation shifts across different quanta because each quantum's traits act as need-based multipliers on the delta: a financially desperate quantum weights a payment default more heavily than a comfortable one; a risk-averse quantum reacts more strongly to being put in danger.

This system serves a dual purpose:

**Emergent faction character.** A faction that consistently underpays builds a bad workforce reputation organically — they struggle to hire, output degrades, desperation increases. This isn't scripted; it falls out of individual quanta decisions.

**The information gap.** The player never sees the simulation's ground truth. What they see is filtered through imperfect intelligence:

- **Staleness** — information ages. Prices, inventories, and faction influence reflect the last time the player (or their intel sources) observed a node. The world changes between visits.
- **Incompleteness** — the player sees effects (a settlement is struggling to hire) without seeing causes (the underlying reputation distribution). Pattern recognition is rewarded.
- **Active deception** — factions and NPCs can relay false information to manipulate the player's behavior. A faction might claim fuel shortages to inflate prices, or understate raider activity on a route they want the player to travel.

The simulation runs fully and honestly. The intelligence layer between the sim and the player determines what gets revealed, how accurately, and how stale it is. This makes scouting, faction relationships, and intel-gathering into meaningful gameplay rather than UI navigation.

---

## Routes

Routes are edges in the node graph — the paths commodities travel between nodes.

```typescript
interface Route {
  id: string;
  from: string;                     // node id
  to: string;                       // node id
  path: [number, number][];         // waypoints (lat, lng) along the route
  distance: number;                 // derived from path length + terrain
  terrain: number;                  // 0–1 difficulty, derived from elevation profile
  danger: number;                   // computed each tick from raider activity
}
```

Routes store their geometry because the path is the input to computing distance and difficulty. When a route is generated, the path is traced between two nodes (following low-elevation corridors, avoiding extreme slopes), then the DEM is sampled along it to derive:

- **distance** — actual ground distance accounting for elevation changes, not great-circle
- **terrain** — aggregate difficulty from elevation gain, slope severity, and rough terrain along the path. Affects travel speed and fuel cost.

These values are baked in at generation time — terrain doesn't change. Danger is recomputed each tick from raider quanta activity along the route. Higher danger means haulers demand more pay, prices rise at the destination, and settlements at the end of dangerous routes suffer.

The path is also used for rendering convoys on the map and determining which routes are affected by regional events (dust storms, raider hotspots).

---

## Factions

Factions are not containers that own things. They're identities that quanta align with, and their "territory" is the set of nodes where they have dominant influence.

### Influence computation

Each tick, for each node, influence is recomputed from four signals:

- **Workforce reputation** (40%) — the faction reputations of quanta working at this node. A node staffed by workers who have strong positive reputation toward the settler faction has strong settler influence.
- **Supply dependency** (25%) — who provided the commodities this node consumed this tick? If corporate haulers are the sole ore supply, corporate influence rises.
- **Trade volume** (20%) — who's buying the output? The customer has leverage.
- **Security presence** (15%) — who's protecting the routes to this node? The faction providing security gets influence even without economic ties.

Weights are tunable. The result is a continuous value per faction per node, normalized to sum to 1.0. Dominant influence determines which faction "controls" the node for purposes of contracts, political events, and player reputation effects.

### Faction archetypes

Based on the setting — a post-Earth-pullback Mars with varying faith in Earth's return:

Factions are not yet fully defined, but the economic model implies at least three orientations:

- **Preservationist** — believe Earth will return, want to maintain existing infrastructure and social order. Tend to control terminals and established settlements. Hoard legacy stockpiles. Conservative economic policy.
- **Pragmatist / Corporate** — don't care whether Earth returns, focused on extracting value now. Control extraction and processing nodes. Trade aggressively. Willing to deal with anyone.
- **Separatist / Settler** — done with Earth, building a Mars-first identity. Want to develop local manufacturing capability. Willing to cannibalize Earth-era infrastructure for parts to build something new. Control the frontier settlements.

### Faction agency

Factions are economic agents with goals, not just passive labels. Every faction — including separatists — actively works to maximize influence over nodes critical to their survival. A separatist faction doesn't want to dominate Mars; they want enough influence over their water supply, their refinery, and the routes between them that nobody else can cut them off.

Each tick, factions evaluate their strategic position:

- **Identify dependencies** — which nodes do we rely on that we don't have strong influence over? Those are vulnerabilities.
- **Allocate incentives** — offer better pay to attract haulers to undersupplied nodes, post security contracts on vulnerable routes, steer loyal quanta toward strategically important jobs.
- **React to threats** — if influence at a critical node is slipping, escalate: raise pay, post contracts, or — if desperate enough — sanction raids on the competitor's supply lines.

This creates emergent faction behavior. A preservationist faction with dwindling influence doesn't become aggressive because a script says so — it becomes aggressive because its economic options are narrowing and the utility calculation for aggressive action starts winning.

---

## Simulation tick

What happens each game-second in the worker:

### 1. Node production

For each node with active recipes:
- Check if inputs are in inventory
- If yes: consume inputs, produce outputs scaled by `condition × (workforce / workforceCapacity)`
- Deduct condition by `decayRate × productionLoad`
- Deduct fuel proportional to power draw

### 2. Price adjustment

For each commodity at each node:
- If inventory < wantThreshold: price increases (rate proportional to deficit)
- If inventory > surplusThreshold: price decreases
- Otherwise: price drifts toward a regional baseline
- Clamp to min/max bounds

### 3. Quanta in transit

For each quantum on a route:
- Advance progress by `1 / (route.distance × route.terrain)`
- If progress >= 1.0: arrive at destination node, deliver cargo, collect payment
- Raid check: if raider quanta are active on this route, probability of interception based on danger level. Intercepted quanta lose cargo (partial or full).

### 4. Quanta job evaluation

For each idle quantum at a node:
- Scan available jobs: hauling contracts (price differentials across routes), node work (mining, refining, etc.), security postings, raiding opportunities
- Compute perceived utility for each
- Take the best option
- If no option exceeds a minimum threshold, remain idle (or migrate to a different node if adaptability is high)

### 5. Events

Low-probability rolls per tick:
- **Equipment failure** — condition drops sharply at a node. Probability increases as condition decreases.
- **Dust storm** — affects a region. Condition drop + route slowdown for several ticks.
- **Supply ship** — rare. A trickle of legacy goods arrives at a terminal. Creates a political event (who gets the cargo?).
- **Discovery** — a salvager quantum finds a cache of legacy goods. Creates a depot node or adds inventory to an existing one.

### 6. Influence update

For each node, recompute faction influence from the four signals (workforce, supply, trade, security). Smooth the update to prevent oscillation — new influence = lerp(old, computed, 0.1).

### 7. Contract generation

Nodes with unmet needs generate contracts:
- **Hauling** — "deliver X units of Y to this node, pay Z" — price based on urgency
- **Security** — "escort convoys on route A–B" or "clear raiders from route" — generated when danger is high
- **Repair** — "deliver precision components to node X" — generated when condition is critical
- **Salvage** — "investigate site X for legacy goods" — generated from exploration/intel
- **Combat** — "assault/defend node X" — generated from faction conflicts over influence

Contracts have a faction source (the dominant faction at the requesting node), a pay scale based on urgency, and reputation implications.

---

## Worker architecture

The simulation runs in a dedicated web worker.

### Worker → main thread (state snapshots)

The worker posts periodic snapshots to the main thread for rendering:

```typescript
interface EconomySnapshot {
  tick: number;
  nodes: NodeSnapshot[];         // id, position, inventory, prices, condition, influence
  routes: RouteSnapshot[];       // id, from, to, danger, active convoys
  contracts: Contract[];         // available contracts for the player
  events: GameEvent[];           // recent events for the news feed / notifications
}
```

Snapshot frequency is independent of tick rate — maybe every 10 ticks or on significant changes.

### Main thread → worker (player actions)

The main thread sends messages for player interactions:

- `{ type: 'accept-contract', contractId }` — player takes a job
- `{ type: 'deliver', nodeId, commodity, amount }` — player delivers goods
- `{ type: 'arrive', nodeId }` — player's crawler reaches a node
- `{ type: 'set-timescale', scale }` — sync timescale with game clock

The worker integrates these into the next tick. The player is effectively another quantum with special privileges (player-controlled decisions instead of utility-based AI).

---

## Spatial indexing (H3)

The simulation uses H3 hexagonal cells as a spatial index. Nodes, route segments, and quanta positions are tagged with their H3 cell, enabling efficient spatial queries:

- **Regional events** — a dust storm or raider hotspot affects a set of H3 cells. All routes and quanta in those cells are found instantly without geometric intersection tests.
- **Faction influence mapping** — influence can be aggregated and visualized per-cell as a map overlay, giving the player a readable view of faction territory.
- **Danger computation** — raider activity is tracked per-cell. A route's danger is the sum of raider presence in the cells it passes through.
- **Proximity queries** — "which quanta are near this node" becomes a cell adjacency lookup.

Resolution TBD during implementation. Likely two tiers: coarse (res 3–4, ~100–300km hexes) for faction territory and weather, finer (res 5–6) for route danger and convoy tracking.

---

## What this answers from the concept doc

- **What are the major factions?** — Three orientations (preservationist, corporate, separatist) whose behavior emerges from economic incentives rather than scripts.
- **What does a "contract" contain?** — Objective, commodity, source/destination nodes, pay, danger level, faction source, reputation implications. Generated from simulation state.
- **How does the crawler's capacity constrain your roster?** — Deferred, but the economy gives context: your crawler consumes fuel and needs maintenance like any other node. Your carrying capacity for trade goods and salvage is a strategic constraint.

## Deferred

- **Specific faction definitions** — names, lore, starting positions. The economic model defines their behavioral archetypes; flavor is layered on top.
- **Mech economy integration** — how mech parts map to the commodity model. Likely: mechs consume metal (crude repairs) and precision components (proper repairs). Salvaged mech parts are a form of precision component.
- **Map placement** — where specific nodes go on Mars. Extraction sites near real geological features (Olympus Mons mining, polar ice extraction, Valles Marineris salvage sites).
- **Balancing** — commodity ratios, decay rates, price elasticity, quantum population counts. All require playtesting.
- ~~**Crawler as a node**~~ — **Resolved: yes.** Crawlers are mobile nodes. The player's crawler has inventory, workforce (pilots/crew), infrastructure (workshop, medbay), and faction influence like any other node. NPC mercenary companies and rival players are also crawler nodes, participating in the economy identically — competing for labor, parts, and contracts at whatever settlement they're docked at.
- **Ink narrative integration** — how story events interact with the economy. Ink scripts could trigger economic events (embargo, blockade, discovery) and read economic state (faction influence, commodity prices) as variables.

## Open questions

- How many quanta does the simulation need to feel alive? Hundreds? Low thousands?
- How visible should the economy be to the player? Answered in part by the information gap design — the player sees filtered, stale, and potentially deceptive intel rather than ground truth. Specific UI for this TBD.
- Should the player be able to invest in nodes (fund repairs, upgrade infrastructure) for long-term returns?
