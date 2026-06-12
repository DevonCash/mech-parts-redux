/**
 * Combat data models — Phase 2 subset of docs/combat/mechs.md.
 *
 * Universal chassis+components model: a unit is a chassis (locations
 * with hit weights) plus ordered component stacks (outermost first).
 * Simplifications this phase: single hit weight per location instead of
 * four-facing profiles, no heat/power budgets, no traverse, no pilots.
 */
import { z } from 'zod'
import { PilotSchema } from '../pilots/models'

export const ComponentType = z.enum([
  'weapon',
  'armor',
  'locomotion',
  'cockpit',
  'structure',
])
export type ComponentType = z.infer<typeof ComponentType>

export const ComponentTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ComponentType,
  maxHP: z.number(),
  /** Flat damage reduction per hit: effective = max(0, damage − hardness) */
  hardness: z.number(),
  // Weapons
  damage: z.number().optional(),
  rangeKm: z.number().optional(),
  cooldownTicks: z.number().optional(),
  // Locomotion
  topSpeedKmS: z.number().optional(),
})
export type ComponentTemplate = z.infer<typeof ComponentTemplateSchema>

export const LocationDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Relative cross-section — normalized into hit probability at roll time */
  hitWeight: z.number(),
  /** Overflow damage propagates here when this location is stripped */
  parent: z.string().optional(),
})
export type LocationDef = z.infer<typeof LocationDefSchema>

export const ChassisSchema = z.object({
  id: z.string(),
  name: z.string(),
  locations: z.array(LocationDefSchema),
})
export type Chassis = z.infer<typeof ChassisSchema>

export const ComponentInstanceSchema = z.object({
  templateId: z.string(),
  hp: z.number(),
  /** Instance ceiling — ratchets down with crude repairs */
  maxHP: z.number(),
})
export type ComponentInstance = z.infer<typeof ComponentInstanceSchema>

/**
 * One order vocabulary for every unit on the map — mechs and the
 * crawler alike (universality: same commands, same executor).
 *
 * A move order is a waypoint path. Ground clicks issue a single open
 * waypoint; road travel issues the route polyline with mode 'road'
 * (roads are infrastructure: double ground speed — and raider bands
 * camp beside them, which is the map's problem to show, not a stat's).
 */
export const UnitOrderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hold') }),
  z.object({
    kind: z.literal('move'),
    waypoints: z.array(z.tuple([z.number(), z.number()])),
    mode: z.enum(['open', 'road']),
    /** Dock at this node on arrival (crawler) */
    dockNodeId: z.string().optional(),
  }),
  z.object({ kind: z.literal('attack'), targetId: z.string() }),
])
export type UnitOrder = z.infer<typeof UnitOrderSchema>

export const UnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  chassisId: z.string(),
  side: z.enum(['player', 'hostile']),
  lat: z.number(),
  lng: z.number(),
  /** Component stacks per location id, ordered outermost-first */
  components: z.record(z.string(), z.array(ComponentInstanceSchema)),
  order: UnitOrderSchema,
  /** Remaining cooldown ticks per weapon, keyed `${locationId}:${index}` */
  cooldowns: z.record(z.string(), z.number()),
  /** Roster pilot assigned to this unit (player units) */
  pilotId: z.string().optional(),
  /** NPC pilot carried inline (hostiles) — same model, scrappier rolls */
  npcPilot: PilotSchema.optional(),
  /** Combat contract this unit belongs to (hostile garrisons) */
  contractId: z.string().optional(),
  /** Raider band this unit rides with */
  bandId: z.string().optional(),
  /** Leash anchor — hostiles hunt near here and return when unengaged */
  spawn: z.tuple([z.number(), z.number()]).optional(),
  /** Hunt radius from the spawn anchor (defaults to LEASH_KM) */
  leashKm: z.number().optional(),
})
export type Unit = z.infer<typeof UnitSchema>
