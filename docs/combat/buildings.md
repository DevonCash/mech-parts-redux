# Building-Scale Combat

Tactical combat at building and facility scale — multi-building complexes and interior operations.

---

## Existing foundation

The unit model handles infantry as chassis+components. The concept doc emphasizes progressive enhancement. The brainstorm references the Ronler Acres Intel campus as a scale reference.

---

## Design

This is a scope expansion structured as progressive enhancement. Stages are ordered by what requires new UI.

### Stage 1 — Abstracted interiors

Buildings are nodes with garrison stats. Attacking a building is a contract objective resolved through the existing combat system. The player doesn't see inside. This works with everything already designed.

### Stage 2 — Multi-building complexes

An industrial campus, military base, or settlement has multiple buildings, exterior spaces, vehicle access points, and infrastructure connections. At this scale, mechs operate between buildings while infantry operates around and between structures. The strategic map zooms to show building footprints, walls, gates, and open ground. This is mech-scale combat with terrain complexity — no new interior UI required.

A raid on a fabrication complex might involve breaching the perimeter wall with mechs, suppressing defenders in exterior positions, securing vehicle access points, and holding the perimeter while an objective is completed. The Ronler Acres reference works here — a layout complex enough to support multi-phase tactical plans at a scale where mechs are the right tool.

### Stage 3 — Interior floor plans

For high-value targets (command centers, sealed labs, data vaults), infantry enters buildings and operates on 2D floor plans. Multiple floors have multiple floor plans — no 3D interiors. Walls block line of sight and provide cover (hardness for structural components). Doors are chokepoints. The same order-drawing interface works inside.

The transition between exterior and interior should feel like the same map if possible — smooth zoom from the strategic view through the complex layout down to the floor plan, rather than a discrete mode switch.

### Layout generation

High-impact or iconic locations get hand-authored layouts. Everything else is procedurally generated.

### Buildings as units

Buildings use the same chassis+component model as everything else. A building is a chassis with structural locations (walls, floors, roof, foundation) and components bolted on: power systems, comms equipment, doors, defensive emplacements, sensor arrays, storage, life support. Damage walks through the component stack the same way it does for mechs — breach the exterior wall (outer armor), then you're hitting interior components.

This means buildings are targetable, damageable, and repairable through the same systems. A mech can punch through a wall (damage the armor component at that location). A building's reactor can be destroyed, cutting power to everything inside. A reinforced door is a high-hardness component at a chokepoint. Interior walls are structural components with their own HP.

Building components also connect to the economy. A fabrication line inside a factory is a component — destroy it and the node loses that production capability. A comm relay mounted on a settlement building is a component in the communications network. Repairing building components consumes the same commodities as repairing anything else: metal for crude fixes, precision components for proper restoration.

The scale change is in the map and camera, not the simulation.

---

## What's new (per stage)

- Stage 1: Nothing new — contract objective types only
- Stage 2: Building complex layouts (footprints, walls, gates, open ground), mech-scale tactical maps
- Stage 3: Interior floor plan data model, multi-floor support, LOS in enclosed spaces, smooth zoom transition from exterior to interior
- Hybrid generation: hand-authored iconic layouts + procedural generation for everything else
