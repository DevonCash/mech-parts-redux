# Intelligence & Detection

Fog of war, sensor mechanics, electronic warfare, and the player's relationship to information.

---

## Existing foundation

The economy doc describes an "information gap" — the player sees filtered, stale, and potentially deceptive intel rather than ground truth. The unit model has sensor components (`sensorRange`, `sensorDetail`) and ECM (`ecmRadius`, `ecmStrength`). This design connects them into a unified detection system.

---

## Design

The world is fully simulated but the player only sees what their sensors can reach. Everything outside sensor range is stale data aging toward uncertainty. The strategic map shows your last-known state for every node and route, with a visible timestamp. Old data fades or gets marked unreliable.

Detection operates at two scales:

### Strategic detection

Your crawler's sensors, any satellite coverage you have access to, and intel from friendly factions give you awareness of the strategic map. Satellites are Earth-era infrastructure — no faction on Mars can launch new ones. Controlling the ground station for a satellite constellation is a major strategic asset (see ../world/factions.md). Satellite coverage provides broad but shallow detection (you know something is at a location, not what it is). Ground-level sensors provide narrow but deep detection (you know exactly what's in range). Faction intel is filtered through their interests — they tell you what benefits them.

### Tactical detection

In combat, each unit's sensor components determine what it can see and how much detail it gets. A unit with high `sensorRange` spots contacts at distance. High `sensorDetail` tells you what the contact is (mech vs. vehicle vs. infantry), its loadout, and its damage state. Low detail gives you a blip on the map with an estimated tonnage.

ECM creates dead zones. A unit running ECM reduces the effective `sensorRange` and `sensorDetail` of enemies within its `ecmRadius`. A mech with strong ECM protecting a lance means the enemy is shooting at ghosts until they close to visual range. Counter-play: dedicated sensor platforms can burn through ECM if their `sensorDetail` exceeds the ECM's `ecmStrength`.

### Sensor presentation

Contacts are auto-resolved but presented with confidence percentages rather than clean icons. A distant radar return might read "72% — convoy, 3-5 vehicles" or "41% — mech lance OR heavy vehicle platoon." Better sensors and skilled sensor operators push confidence higher. The player reads a data feed, not a perfect map — but they don't have to solve a minigame to do it. Investing in recon (sending scouts, deploying sensor drones, tapping satellite feeds) is how you turn uncertainty into actionable intel.

### Multiplayer

Each player has independent detection state. The server simulates ground truth; each client receives only what their sensors can see.

---

## What's new

- Detection state per entity: what does this unit/node know, and when did it last update?
- Sensor resolution mechanic: `sensorRange` × `sensorDetail` vs. target's ECM and signature
- Confidence percentage display: contacts presented with classification probability, not binary identification
- Stale data model: information ages and becomes unreliable
- Satellite access as a strategic asset (Earth-era, not launchable)
- Detection is constrained by the communications network — you only receive sensor data from units within comm range. See `../world/communications.md`.

---

## Open questions

- How visible should the economy be to the player through the detection system? The information gap design means filtered, stale, potentially deceptive intel rather than ground truth. Specific UI for economic data (prices, inventories, faction influence) is TBD.
