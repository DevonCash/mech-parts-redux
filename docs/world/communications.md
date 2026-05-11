# Communications Network

How information physically travels across Mars, and what happens when it can't.

---

## Existing foundation

The intelligence system (`../combat/intelligence.md`) defines what you can detect. The economy (`economy.md`) moves quanta and goods along routes between nodes. This design adds the physical communication layer that constrains both: you can only see what your sensors reach AND what your comms can relay back to you, and you can only command units within your communication range.

---

## Design

### The network

Communication on Mars travels through a physical network of relay infrastructure. Three types of links:

**Node comms.** Settlements and major installations have built-in communication equipment as a node component. A settlement's comms capability depends on the quality of that component — a well-maintained hub with Earth-era electronics has long range and high bandwidth. A struggling outpost with jury-rigged gear has short range and drops signals. Destroying or degrading a node's comm component cuts it from the network.

**Standalone relay towers.** In remote areas between settlements, relay towers extend the network across terrain that would otherwise be dark. These are independent structures on the map — targetable, capturable, and buildable. A relay tower on a high ridge might cover hundreds of kilometers of lowland. Destroying one creates a hole in the network that isolates everything behind it.

**Mobile relays.** The player's crawler can mount a comm relay component, making it a mobile link in the network. Other units (mechs, vehicles) can mount smaller relay components with shorter range. A mech lance deep in hostile territory might keep comms open by leaving one unit on a ridge as a relay back to the crawler.

The network is a graph. Each relay point (node comms, standalone tower, mobile relay) has a range based on its component quality and local terrain. Two points within range of each other form a link. Messages route through the graph. If there's no path from you to a destination, that destination is dark — you can't see its contract board, faction contacts there can't reach you, and any units you have there are beyond your command authority.

### Command range

Your ability to issue orders to units depends on having a communication path between your crawler and the unit. This is a hard limit.

**In range:** Full command authority. You see the unit's sensor data in real time, can issue new orders, and the unit's contingency triggers are active (they can phone home to confirm conditions).

**Out of range:** The unit becomes a fully autonomous agent. It doesn't freeze or wait for orders — it attempts to accomplish its assigned task and return to base. The pilot uses everything they have: their last orders, their stance, their pre-loaded contingency triggers, and their own judgment to complete the mission.

The quality of autonomous operation depends on the pilot:

- **Tactical judgment** determines how well they adapt when the mission doesn't go as planned. A high-judgment pilot reads the situation, adjusts the approach, and makes good calls independently. A low-judgment pilot follows the original plan rigidly even when it's clearly wrong.
- **Execution fidelity** still matters — a sloppy pilot drifts off the plan even when following it would have worked.
- **Personality traits** drive the decisions the player can't make for them. A high-aggression pilot might push an attack that a cautious player would have called off. A low-loyalty pilot might abandon the mission early if it gets dangerous.

The player has no visibility into what's happening — no sensor feeds, no comms, no map updates. The unit is a black box until it either re-enters comm range, reaches a relay, or returns to the crawler. When contact is restored, you get the full debrief: what happened, what they did, what it cost.

This creates real cost to splitting forces. Sending a lance on a detached mission beyond comm range means trusting those pilots to complete it on their own judgment. You send your best — high judgment, reliable personality, good equipment — on detached ops. Green pilots stay where you can manage them. The planning you do before they leave (detailed orders, contingency triggers, clear objectives) is all the influence you get.

Restoring comms (moving your crawler closer, repairing a relay tower, the unit moving to higher ground) immediately restores full command authority and sensor feeds.

### Comm disruption

ECM doesn't just affect sensors — it can jam communications. A strong ECM source between your crawler and a detached unit can sever the comm link even if relay infrastructure exists. This makes EWAR platforms a strategic threat beyond their tactical sensor-jamming role — an enemy ECM unit positioned on a ridge can cut your force in half by blocking the relay chain.

Dust storms degrade comm signals. A major storm over a relay tower reduces its effective range. Severe storms can temporarily black out regions of the network entirely — another reason weather matters strategically.

### Satellites

Satellites are Earth-era communication and observation infrastructure in Mars orbit. They follow real orbital paths — not geostationary, so coverage moves.

**Tracking.** If you (or an allied faction) control the ground station for a satellite constellation, you can see orbital predictions — when each satellite passes over which region, how long the coverage window lasts. This lets you plan operations around satellite passes: launch an assault when you'll have overhead intel, avoid moving through open terrain when enemy satellite coverage is overhead.

**Without ground station access,** satellite coverage appears as intermittent, unpredictable windows. You notice when you suddenly get better intel for a region, but you can't plan around it.

**Dual role.** Satellites provide both observation (intel) and communication (relay). A satellite overhead can serve as a relay link between two ground points that are otherwise out of comm range, enabling temporary command authority over distant units during a pass.

### Strategic implications

Comms infrastructure becomes a strategic target class:

- **Cutting comms** isolates a region. Destroy the relay towers around a settlement and it goes dark — the faction there can't coordinate, the player can't see contracts there, and any detached units in the area are on their own.
- **Controlling comms** is a form of soft power. If your crawler is the only relay link between two settlements, you see all the traffic (intel advantage) and both settlements depend on you for network access.
- **Building comms** opens up dark regions. Placing a relay tower in uncovered territory lets you see what's there — contracts, resources, threats. Exploration is partly a comms infrastructure problem.

---

## What's new

- Physical communication network: node comms, standalone relay towers, mobile relay components
- Hard command range limit: units beyond comm reach fall back to autonomous operation
- Autonomous capability scales with pilot tactical judgment
- ECM disrupts comms as well as sensors
- Weather degrades comm signals
- Satellite orbits trackable with ground station control, unpredictable without
- Satellites serve dual observation/communication role
- Comms infrastructure as a strategic target and soft power tool

---

## Open questions

- What's the base comm range for different equipment tiers? Needs to be tuned against map scale so that splitting forces is a meaningful decision, not something that happens every time you leave a settlement.
- How does comm bandwidth work? Is it binary (connected or not) or does bandwidth matter — e.g. you can send simple orders over a degraded link but can't receive full sensor feeds?
