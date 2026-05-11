# NPC Depth

How NPCs develop personality over time and how they're cast into narrative roles.

---

## Existing foundation

Quanta have personality vectors (aggression, ambition, loyalty, adaptability) and per-entity reputation. Pilots are named characters with skills. Ink handles narrative scripting.

---

## Design

### Personality evolution

NPC personality traits shift based on experiences. A pilot who survives several near-death engagements might see their aggression drop (cautious veteran) or rise (adrenaline addiction). A quantum that gets stiffed on payment repeatedly develops lower loyalty toward the offending faction. The shift rate is slow — traits are dispositions, not moods. But over a long campaign, a green recruit might mellow into a steady professional or spiral into recklessness depending on what happened to them.

Implementation: after significant events (combat survival, payment, betrayal, loss of a squadmate), apply a small delta to relevant traits weighted by the event's intensity and the NPC's existing trait profile. High-adaptability NPCs shift faster. High-loyalty NPCs resist shifts that would damage their faction alignment.

### Earned tags

The player doesn't see raw trait values. Instead, NPCs earn readable tags based on their history and trait thresholds — displayed in a personnel file. A pilot might be tagged "Cautious," "Crack Shot," "Unreliable," or "Veteran." Tags are earned through behavior, not assigned at creation. The player reads a dossier, not a spreadsheet. The four underlying dimensions (aggression, ambition, loyalty, adaptability) drive behavior; tags are the player-facing summary.

### Personality-triggered interactions

Trait thresholds trigger potential narrative beats. A pilot whose loyalty drops below 0.3 toward the player's company might consider defecting. A quantum whose aggression exceeds 0.8 after a bad experience might turn raider. These aren't automatic — they're flags that the Ink narrative system can pick up and weave into dialogues, contract complications, or events.

### Parametric Ink casting

Quest templates have role slots instead of named characters. "A veteran pilot with high loyalty approaches you about a personal mission" — the system finds a matching NPC from your roster and casts them. The NPC's specific traits, tags, and history flavor the dialogue through Ink variables.

Casting criteria: trait ranges, tag requirements, minimum reputation toward player, time in service, combat history, faction alignment. A quest about a pilot going rogue casts someone on the edge, not your most loyal veteran.

Scale is managed by tying personal missions to regional stories. A pilot's personal quest might intersect with a faction conflict in the area, keeping things connected rather than feeling like isolated sidequests.

---

## What's new

- Trait delta system: events produce small personality shifts over time
- Tag system: NPCs earn readable labels from trait thresholds and history milestones (personnel file display)
- Ink role-casting: quest templates with parametric character slots filled from the live NPC roster
- NPC history log: significant events tracked per NPC for casting criteria and dialogue flavor

---

## Open questions

- How do Ink narrative scripts interact with the economy simulation? Ink could trigger economic events (embargo, blockade, discovery) and read economic state (faction influence, commodity prices) as variables. Exact integration TBD.
