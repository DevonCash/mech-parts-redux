# Contracts

How the player finds, negotiates, executes, and completes work. Contracts are the primary decision surface between fights — where you decide what kind of company you're running.

---

## Existing foundation

The economy simulation generates contracts from unmet needs at nodes (economy.md §7). Five base types exist: hauling, security, repair, salvage, combat. Contracts have a faction source, pay scale based on urgency, and reputation implications. This design covers the player-facing system built on top of that generation logic.

---

## Design

### Contract types

All contracts originate from simulation state. The economy creates them; the player sees a curated view.

**Hauling** — deliver X units of commodity Y from node A to node B. Pay scales with distance, danger, and urgency. The simplest contract type and often the most available. Good bread-and-butter work.

**Security** — escort a convoy on a route, or patrol/garrison a node for a duration. Generated when route danger is high or a node is under threat. Often has a hard deadline ("convoy departs in 12 hours"). May involve combat, may not — sometimes your presence is the deterrent.

**Repair** — deliver specific components (usually precision components or electronics) to a node with failing infrastructure. A hauling contract with higher stakes — the node is degrading while you're in transit.

**Salvage** — investigate a location for recoverable legacy goods. Generated from exploration intel, satellite data, or faction tips. Open-ended — the contract points you to a site, but what you find (and how much you keep vs. turn over) depends on the situation. Soft expiry.

**Combat** — assault, defend, or raid a specific target. Generated from faction conflicts over node control. The most dangerous and best-paid work. Almost always has a hard deadline tied to the tactical situation.

These are the economy's base types. Ink narrative scripts can dress them up — a hauling contract might involve smuggling, a security contract might be protecting a defector. The underlying mechanical structure is the same.

### Discovery

Three channels, each revealing different slices of the contract pool:

**Local boards.** When your crawler is docked at a settlement, you see contracts posted by the dominant faction at that node and nearby nodes. This is the baseline — always available, no relationship required. The selection reflects local economic conditions.

**Faction contacts.** Factions you have reputation with proactively relay contract offers. Higher reputation means more offers, better terms, and visibility into distant work you wouldn't see from a local board. A faction contact might tell you about a lucrative combat contract three days' travel away — work you'd never find by browsing boards. This is the primary reward for building faction relationships beyond raw pay.

**Intel.** Some contracts aren't posted anywhere. A salvage site you spotted on satellite imagery. A convoy route you know is vulnerable because you've been watching the sensor feeds. A node whose infrastructure is failing, which you noticed from economic data. These are opportunities you create through the intelligence system — they become contracts when you act on the information (approach the relevant faction with what you know, or just go do the work and sell what you find).

The player's contract visibility is a function of location, reputation, and intel investment. A well-connected company with good sensors sees far more opportunity than an isolated one.

### Competition

Contracts exist in the simulation as open needs. Multiple mercenary companies — player and NPC — can pursue the same contract simultaneously. First to complete the objective gets paid. If you're escorting a convoy and a rival company clears the route before you arrive, the work is done and you wasted travel time.

This creates natural pressure to act on good contracts quickly, and to invest in intel so you know which contracts are being pursued by competitors. An NPC mercenary company docked at the same settlement is looking at the same board you are.

### Negotiation

Contracts are posted with default terms. Before accepting, you can push on a few levers:

**Pay.** Ask for more. Your leverage depends on the faction's urgency (high urgency = more willing to pay up), your reputation with them (trusted companies get more slack), and competition (if another outfit is available, your leverage drops). You can also offer to work for less to undercut a competitor.

**Deadline.** Request more time. Some contracts flex, some don't — a convoy escort departs when it departs. Urgency-driven contracts are less flexible.

**Support assets.** Request faction-provided forces. Some contracts come with attached assets by default (a militia platoon for a garrison contract, a supply truck for a long haul). For others, you can ask — the faction provides support but takes a cut of your pay, or the support is free but the contract terms tighten. Better-funded factions offer better assets. What you get is transient — you command these forces for the duration of the contract but don't keep them.

**Scope.** On rare occasions, propose adjusting what the contract covers. "I'll clear the raiders, but I want salvage rights on what I destroy." This is a high-reputation interaction — factions don't negotiate scope with unknowns.

Negotiation is lightweight. A few exchanges, not a haggling minigame. The simulation provides the inputs (urgency, competition, relationship), and the player makes one or two asks. Accept and go.

### Execution

Once accepted, the contract becomes an active objective tracked in your company management UI. The objective maps directly to simulation state — "deliver 20 units of electronics to Pavonis Station" succeeds when 20 electronics arrive at that node from your inventory.

**Hard deadlines** apply to time-sensitive work: security escorts, combat operations, emergency repairs. Miss the deadline and it's a failure.

**Soft expiry** applies to hauling, salvage, and non-urgent work. The contract doesn't fail on a timer — it becomes irrelevant when the economic situation shifts. If someone else delivers the electronics, or the node collapses before you arrive, the contract dissolves. Pay may decrease as urgency fades.

The player juggles multiple active contracts simultaneously, limited by reputation. Low-reputation companies can hold one or two active contracts. High reputation expands the pipeline. Charter members (subfaction of a major faction) get the largest allocation — their parent faction trusts them with more concurrent work.

### Outcomes

Most contracts are pass/fail. You completed the objective or you didn't. The pay was agreed up front.

In some cases — generally authored through Ink rather than generated — contracts have branching outcomes or partial completion states. A security escort discovers the convoy is carrying contraband. A salvage expedition finds something politically sensitive. An assault contract's target surrenders mid-fight and offers a side deal. These are narrative moments built on the contract framework, not the baseline mechanical behavior.

Partial completion ("delivered 60% of the convoy") is handled case-by-case. The default is failure — you agreed to deliver the convoy, and you didn't. But a faction with high urgency might pay proportionally for what they received. This emerges from the simulation's reaction to the outcome, not from a graduated pay scale on every contract.

### Failure and abandonment

Failing or abandoning a contract costs reputation with the issuing faction. No abstract financial penalty — the consequence is relational. A company that fails contracts stops getting offered good ones.

The simulation handles the rest naturally. If you abandon a convoy escort and it gets destroyed, the faction loses those goods, the destination node's shortage worsens, and whoever was raiding the route profits. If you fail to defend a node, the attacking faction gains influence. The world reacts to what happened, not to the abstract fact that you failed a contract.

Abandonment is worse than failure. Failing means you tried. Abandoning means you quit. The reputation hit reflects this.

### Support assets

Three modes, depending on the contract and the faction:

**Included.** The faction provides forces as part of the contract terms. A garrison contract comes with a militia platoon already stationed at the node. A major combat operation includes artillery support. These assets are factored into the contract's pay — you're not paying for them, but the contract wouldn't exist without them.

**Requested for a cut.** You ask for support during negotiation. The faction provides assets but reduces your pay, or imposes tighter terms. The quality depends on the faction's resources — a well-funded corporate faction might lend you a sensor drone network, while a struggling settlement offers a few armed technicals.

**Player's own forces.** You bring what you have. Most contracts assume this is the baseline. Contracts that require more firepower than a single mech lance are priced accordingly — they expect you to either have the forces or negotiate for support.

Support assets are transient. You command them for the contract's duration. When the contract ends, they return to the faction. If they're destroyed, that's the faction's loss (and a potential reputation complication).

---

## What's new

- Contract discovery via three channels: local boards, faction contacts, intel-generated
- Light negotiation system: pay, deadline, support assets, scope
- Parallel competition: multiple companies pursue the same contract
- Active contract limit scaled by reputation and charter status
- Support asset allocation: included, requested-for-a-cut, or player-provided
- Hard deadlines for urgent work, soft expiry for economic contracts
- Failure costs reputation, consequences emerge from simulation
- Ink integration for branching outcomes on authored contracts

---

## Open questions

- How does the contract UI present the negotiation levers? The design says "a few exchanges, not a haggling minigame" — but the specific interaction pattern (sliders? dialogue? offer/counteroffer?) is unresolved.
- What's the reputation threshold curve for active contract slots? Linear scaling, or discrete tiers (1 slot at neutral, 2 at friendly, 4 at allied, unlimited for charter)?
- How do intel-generated contracts work mechanically? The player spots an opportunity through sensors — do they pitch it to a faction for a formal contract, or just act on it independently and sell the results?
