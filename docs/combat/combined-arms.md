# Combined Arms

What units exist beyond mechs, what role does each fill, and how does the player interact with non-mech forces.

---

## Existing foundation

The concept doc says "support assets appear as per-mission resources." The unit model already handles all unit types as chassis+components. This design addresses player control scope and force composition.

---

## Design

The player can maintain standing forces of any type, not just mechs. A good templating system lets the player define standard loadouts for squads and platoons. Contracts can also provide transient assets which may or may not be under player control — a client might send along a militia escort that follows its own orders.

### Role taxonomy

**Mechs** — Mobile striking force. High damage, high survivability, high maintenance cost. They win fights but can't garrison a position indefinitely.

**Infantry** — Holds ground, garrisons positions, operates inside buildings. Low individual combat power against mechs, but essential for occupation, search, and defense of fixed positions. Controlled as squads on the map, with platoon-level maneuver orders available as shorthand (move a platoon and squads maintain formation and spacing automatically).

**Vehicles** — Tanks, APCs, technicals. Cheaper than mechs, less capable, but available in quantity. Same unit model, different chassis.

**Artillery** — Area denial and fire support. Can be a permanent crawler attachment (towed or self-propelled) or fielded as an independent unit in a platoon. Devastating against static targets, vulnerable to flanking.

**Drones** — Disposable recon and strike platforms. Controlled by a drone core component (destroy it and the drone goes offline, no casualties). Cheap, expendable, excellent for scouting and harassment.

**EWAR platforms** — Dedicated ECM/sensor vehicles. Force multipliers that don't fight directly.

### Control model

The player's control model stays the same: draw orders on the topo map, units execute autonomously. The templating system lets the player define standard squad compositions and loadouts for quick deployment without micromanaging every infantry rifle.

### Garrison mechanics

Standing forces at a node contribute to the security component of the influence calculation (see ../world/economy.md). Mechs can't hold ground — infantry and vehicles can.

---

## What's new

- Force templating system: define reusable squad/platoon compositions and loadouts
- Platoon maneuver orders: move a group as a unit, squads maintain formation
- Chassis templates for non-mech unit types (simpler than mech chassis)
- Garrison mechanics: standing forces at a node contribute to the security component of influence calculation
- Transient contract-provided forces with independent or shared control
- Detached forces beyond comm range operate autonomously — pilot quality determines effectiveness. See `../world/communications.md` and `pilot-ai.md`.
