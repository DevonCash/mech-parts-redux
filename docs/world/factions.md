# Faction Hierarchy & Identity

How factions relate to each other (parent/child, delegation), what makes a major faction durable, and how unique holdings define faction identity.

---

## Existing foundation

Factions in economy.md are influence-based identities. Quanta align with them via reputation. This design adds vertical structure (subfactions) and horizontal differentiation (signature assets).

---

## Design

### Hierarchy

A major faction is an umbrella that delegates goals to subordinate groups. "Hellas Industrial Consortium" is the major faction. "Hellas Mining Division" and "Hellas Security Services" are subfactions that inherit the parent's broad goals but have their own quanta, influence footprints, and operational autonomy. The Mars Liberation Front is a subfaction of the broader separatist movement.

Hierarchy is an official political affiliation — visible to the player through insignia and public identity. It's not a prerequisite for alliance or collaboration. Bebo's Bandits might be formally unaffiliated but economically loyal to a corporate group that buys their salvage. The hierarchy is what's on the letterhead; the actual web of relationships is more complex.

Implementation: factions have an optional `parentFactionId`. Subfactions inherit parent reputation modifiers (helping a subfaction improves standing with the parent, at a reduced rate) but track their own influence independently. Top-down delegation works through the existing contract system — the parent faction generates strategic objectives ("secure Route 7," "increase influence at Pavonis Station") and the subfaction posts contracts or allocates quanta to achieve them. If the subfaction fails, the parent might withdraw support, and the subfaction weakens or collapses.

### Player affiliation

The player's company can become a subfaction of a major faction by signing a charter. This trades freedom for power — access to the parent's supply lines, intel, and contract pipeline, in exchange for taking orders and sharing revenue. The player can break the charter, but that burns the relationship.

### Signature assets

Not every signature asset is the same magnitude. A working water purification plant is a signature asset for a small settlement — it defines their economic niche and makes them worth protecting. An Earth-era orbital weapons platform is a signature asset for a continent. The system is the same; the scale differs. Signature assets are tagged infrastructure at nodes. Some are unique and irreproducible (Earth-era tech). Others are merely rare and expensive (a functioning fabrication line). Factions gain identity from what they hold.

Knocking out a signature asset doesn't instantly destroy a faction — it destabilizes them. The cascade is emergent from the economy, not scripted. A faction that loses its fabrication line starts consuming legacy stockpiles, which depletes over time, which degrades their equipment, which weakens their military, which makes their other holdings vulnerable.

Industrial sabotage (stealing or destroying a signature asset) is a high-value, high-consequence mission type. A faction that controls an irreproducible capability becomes known for it — that's their identity.

---

## What's new

- `parentFactionId` on faction entities, reputation inheritance rules
- Charter system: player can join a faction hierarchy, trading autonomy for resources
- Strategic goal delegation: parent generates objectives, subfaction executes
- Signature asset tag on infrastructure: `signatureAsset: boolean`, with magnitude emergent from the asset's economic impact

---

## Open questions

- What are the specific major factions — names, lore, starting positions, and signature assets? The economic model defines three behavioral orientations (preservationist, corporate, separatist). Specific identities, geography, and initial holdings are TBD.
