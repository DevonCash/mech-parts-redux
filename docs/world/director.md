# AI Director

A meta-system that disrupts stable equilibria to keep the world dynamic.

---

## Existing foundation

The economy simulation already generates emergent events. The AI director doesn't replace that — it prevents the simulation from settling into a boring steady state.

---

## Design

The director's job is disruption, not pacing. It monitors system stability: are trade routes running smoothly? Is a faction's power unchallenged? Has a region been peaceful for too long? When it detects equilibrium, it introduces perturbations.

### Disruption types

- Resource discovery: a prospector finds a new deposit, changing the economics of a region
- Resource depletion: a mine or well dries up, collapsing a supply chain that depended on it
- Technology introduction: someone unearths an advanced piece of Earth-era equipment, shifting the balance of power
- Infrastructure failure: a critical system breaks down at the worst time
- Political upheaval: a subfaction breaks from its parent, a leader is assassinated (by the sim, not fabricated), a long-standing alliance fractures
- Earth-origin events: a faction loses control of an orbital asset, or a dormant satellite comes online
- Transfer window events: every ~26 months (the Earth-Mars synodic period), a transfer window opens. Nothing arrives in the base game, but the political tension is real — preservationists hold their breath, separatists use the disappointment to recruit. The director can use transfer windows as a catalyst for political upheaval

### What it doesn't do

The director never provides relief. If the player is under pressure, they can move somewhere else — that's a player decision, not a system handout. The director also never fabricates game state. It adjusts probability weights on events that the simulation already supports. The world stays honest.

### Stability detection

The director doesn't need to understand the game in narrative terms. It tracks variance in key metrics: commodity prices, faction influence deltas, combat frequency, route danger. When variance drops below a threshold in a region or globally, the director increases perturbation probability for that area. Once sufficient instability exists (variance rises), the director backs off. It's a thermostat for chaos.

### Locality

Disruptions are local. Sometimes Bebo the Bandit finds a gun. Sometimes Earth interests lose control of their orbital weapons platform. Sometimes a dust storm buries a critical road. The director picks where to apply pressure based on where stability has set in, not based on where the player is.

### Invisibility

The director is invisible to the player. Events always feel organic — indistinguishable from the simulation's natural output.

---

## What's new

- Stability metrics per region (H3 cell clusters): price variance, influence deltas, event frequency
- Perturbation probability scaling: inversely proportional to regional stability
- Disruption event catalog: parameterized events the director can trigger through the existing event system
