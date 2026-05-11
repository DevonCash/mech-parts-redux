# Construction

How the player builds new infrastructure on the map using the crawler's construction module.

---

## Existing foundation

The crawler is a unit with component locations for cargo bays, workshops, crew quarters, reactors, and defensive weapons (`../combat/mechs.md`). Nodes are economic actors on the map with infrastructure, condition, workforce, and faction influence (`economy.md`). Routes between nodes have physical infrastructure that degrades (`economy.md`). Relay towers and sensor posts are part of the communications network (`communications.md`). This design adds a construction module to the crawler and defines what the player can build.

---

## Design

### The construction module

Construction capability comes from a crawler component — a fabrication bay, heavy crane, or deployable construction rig mounted in a cargo/utility slot. Without this component, you can't build. Mounting it costs slots that could be used for cargo, additional workshops, or weapons. It's a company specialization choice.

The construction module consumes commodities (metal, fuel, and sometimes precision components or electronics) and time to produce structures on the map. Larger structures require more of both.

### What you can build

**Small structures** — relay towers, sensor outposts, supply caches. These extend your operational reach. A relay tower expands your comm network. A sensor outpost gives persistent detection coverage in an area. A supply cache is a small unmanned depot where you can pre-position fuel, ammo, and spare parts.

**Field fortifications** — bunkers, minefields, sensor tripwires, prepared fighting positions. Battlefield infrastructure you place before an engagement. Temporary by nature — they degrade fast without maintenance, but they give you a significant tactical advantage in a prepared defense.

**Light infrastructure** — landing pads, refueling stations, waypoints with basic maintenance facilities. Useful along routes you travel frequently. These are waypoints, not full nodes — they provide specific services but don't attract workforce or generate contracts on their own.

**Full nodes** — mining outposts, processing facilities, depots, even small settlements. The largest and most expensive construction projects. A new mining outpost at an untapped ore deposit creates a new economic actor in the simulation. Given time and favorable conditions, it attracts quanta, develops its own workforce, and becomes a self-sustaining part of the world economy.

### Build process

Scale determines the process:

**Small structures and field fortifications** can be built by a dropped construction crew. The crawler delivers materials and personnel to the site, then is free to leave. The crew works autonomously — like any detached unit, they're vulnerable without protection and operate within the constraints of the pilot AI system. A construction crew beyond comm range completes the job and returns to base on their own judgment.

**Full nodes and heavy infrastructure** require the crawler's construction module to be present for the duration. The crawler deploys on-site, the construction module runs, and you're committed until the job is done. This ties up your mobile base — you can't take contracts or travel while building. The time cost is the real constraint on large construction projects.

Construction time scales with structure size and available resources. Having extra metal on hand speeds things up. Having precision components available means building to a higher initial quality (slower initial decay rate). Building with only crude materials is faster and cheaper but produces fragile infrastructure that needs maintenance sooner.

### Construction costs

All construction consumes commodities from the crawler's inventory:

- **Metal** — the primary building material. Every structure needs it.
- **Fuel** — powers the construction module and equipment.
- **Electronics** — required for anything with sensors, comms, or automation (relay towers, sensor posts, powered facilities).
- **Precision components** — optional for most structures, required for high-quality or advanced facilities (fabrication lines, medical bays). Using them improves initial condition and lowers the decay rate.

The scarcity tension applies directly. Building with legacy components produces better infrastructure, but every precision component you pour into a relay tower is one fewer for mech repairs. Crude construction is cheap but fragile.

### Degradation and maintenance

Player-built structures degrade like everything else in the world. They have condition values that decay through weather, use, and neglect. The decay rate depends on build quality (precision components lower it) and environment (lowland structures near water decay faster from flooding, highland structures suffer more from dust and thermal cycling).

Maintenance requires periodic delivery of materials — metal for crude fixes, precision components for proper repairs. A structure with no maintenance eventually fails. This creates an ongoing cost for every piece of infrastructure you build. A sprawling network of relay towers and outposts is powerful but expensive to maintain.

### Integration with the economy

Player-built nodes enter the economy simulation as full participants:

**Workforce attraction.** A new node with jobs and decent conditions attracts quanta through the normal utility-based decision system. A mining outpost near a settlement draws workers who see good pay. An outpost in the middle of nowhere struggles to attract anyone until conditions improve.

**Faction influence.** Player-built nodes start with player influence dominant. Over time, as quanta from various factions work there, influence shifts through the normal computation. The player can try to maintain control through workforce management and reputation, or let it drift.

**Self-sustaining operation.** A well-placed, well-built node can eventually run without player input. It attracts its own workforce, produces goods, trades with neighbors, and maintains itself (if it has enough resources). The player seeded the infrastructure; the world adopted it. This is the long-term payoff for construction investment.

**Contract generation.** Player-built nodes generate contracts like any other node. A mining outpost that needs security posts security contracts. A depot running low on supplies posts hauling contracts. Your own infrastructure creates work — for you or for competitors.

### Strategic implications

Construction is how the player shapes the world beyond contracts and combat. Building a relay tower in a dark zone opens up a region for operations. Establishing a mining outpost at an untapped deposit changes the economic map. A chain of supply caches along a dangerous route makes that route viable for trade.

But everything you build can be targeted. A rival mercenary company or hostile faction can destroy your relay towers, raid your outposts, or contest your mining claims. Building in contested territory means defending what you've built — or accepting the loss.

Construction also interacts with faction politics. Building in a faction's territory without their blessing strains the relationship. Building infrastructure that benefits a faction (a relay tower that connects their settlements) earns goodwill. A charter with a major faction might come with construction rights in their territory.

---

## What's new

- Construction module as a crawler component (occupies utility/cargo slots)
- Buildable structures: relay towers, sensor outposts, supply caches, field fortifications, light infrastructure, full economic nodes
- Two-scale build process: small structures via dropped crews, large structures require crawler presence
- Construction costs from crawler inventory (metal, fuel, electronics, precision components)
- Build quality scales with materials used (precision components improve durability)
- Player-built nodes enter the economy simulation and can become self-sustaining
- All player-built structures degrade without maintenance

---

## Resolved

- **NPC factions can build too.** Behavioral consistency — the player has access to the same tools as every other faction, and vice versa. NPC factions with sufficient resources and need can construct new infrastructure.

## Open questions

- What are the specific build times and material costs? Needs to be tuned so construction is a meaningful investment, not something you do casually.
