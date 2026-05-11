# Player Identity & Legacy

Who is the player in the fiction, what happens when they "die," and how does one playthrough connect to the next.

---

## Existing foundation

The concept doc says "you run a mercenary outfit." This design answers: are you a person who can be killed, or something that persists?

---

## Design

### Player as AI

The player is a command AI — a pre-Earth-pullback military coordination system installed on the crawler. Other origins may be possible in the future, but AI is the default.

**Why can't you die in combat?** You're not physically there. You're the crawler's command system, issuing orders through radio and data links. Your pilots are the ones in danger.

**Why are you omniscient about your own forces?** You're networked to every mech in your company. Sensor data, ammo counts, damage status — it feeds back through the data link. If a mech's comms go down (ECM, damage), you lose that feed until it's restored.

**Why do factions trust you?** You're a known quantity — an AI with a track record, bound to a crawler, not going anywhere. Your reputation is your persistent identity.

**Your vulnerability:** Your crawler. The crawler's cockpit equivalent is your server core — a component in the unit model, targetable, destructible. Lose the crawler, lose the game (or trigger legacy).

### Other command AIs

You're not the only one. A small number of other command AIs exist on Mars — one or two per playthrough, depending on how the world generates. These are NPC mercenary companies run by AIs rather than human commanders, operating crawlers just like yours.

They're peers, not copies. Each has its own behavioral profile, reputation history, and operational style. They compete for the same contracts, dock at the same settlements, and operate under the same rules (behavioral consistency). A rival AI might be a cautious logistics-focused operator who undercuts you on hauling contracts, or an aggressive combat specialist who takes the high-risk work you passed on.

What makes AI-run companies different from human-run NPC merc outfits: they don't have the limitations of human commanders. Their pilots still have stress, personality, and skill — but the AI coordinating them doesn't panic, doesn't get tired, and doesn't make emotional decisions. They're methodical in the way you are. Fighting one feels different from fighting a human-led company because the coordination is tighter and the planning is more deliberate.

AI commanders are rare because command AIs are Earth-era military hardware — expensive, complex, and irreproducible. Most mercenary companies are run by people. The few AI-run outfits are notable entities in the world, recognized by factions and feared or respected accordingly. Encountering one is a significant event, not a routine occurrence.

They can also be destroyed permanently. An AI whose crawler is killed is gone — no legacy faction, no continuation. The server core is shattered. One fewer command AI in the world.

### Legacy system

The simulation world is a persistent timeline, Dwarf Fortress-style. When your crawler is destroyed (or you choose to retire), you can continue in the same world after a random span of years has passed. Your old company becomes an NPC faction — with your reputation, territory, remaining mechs and pilots, all running on the quanta AI. The faction retains a behavioral profile derived from your strategic tendencies (aggressive, defensive, trade-focused) so it acts in accordance with the pattern of its former commander's will.

Alternatively, you can start a completely new world/timeline from scratch.

The full world state carries over if you continue: economic conditions, node states, technology progression, faction positions, everything. Multiple legacy factions from multiple playthroughs accumulate in the same timeline. Named pilots from your old company appear as NPCs. Your old signature holdings are controlled by your ghost faction.

---

## What's new

- Player entity modeled as a component on the crawler (server core — destruction = game-over or legacy trigger)
- Other command AIs: one or two NPC AI-run mercenary companies per playthrough, rare Earth-era hardware, permanently destroyable
- World timeline persistence: save the full simulation state at game-end
- Legacy faction generation: snapshot player company into NPC faction with behavioral profile
- Time-skip: advance the simulation by a random number of years between playthroughs
- Multi-legacy accumulation: previous playthroughs stack in the same timeline
