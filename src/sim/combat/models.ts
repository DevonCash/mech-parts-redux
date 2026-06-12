/**
 * Combat data models — Phase 2 subset of docs/combat/mechs.md.
 *
 * Universal chassis+components model: a unit is a chassis (locations
 * with hit weights) plus ordered component stacks (outermost first).
 * Simplifications this phase: single hit weight per location instead of
 * four-facing profiles, no heat/power budgets, no traverse, no pilots.
 */
import { z } from 'zod'

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

export const UnitOrderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hold') }),
  z.object({ kind: z.literal('move'), lat: z.number(), lng: z.number() }),
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
})
export type Unit = z.infer<typeof UnitSchema>

export const EngagementSchema = z.object({
  id: z.string(),
  contractId: z.string(),
  siteNodeId: z.string(),
  units: z.array(UnitSchema),
  status: z.enum(['active', 'won', 'lost']),
  startedTick: z.number(),
})
export type Engagement = z.infer<typeof EngagementSchema>
