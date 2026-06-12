/**
 * Contract data models — a discriminated union so every consumer
 * narrows on `type` and the compiler enforces field access.
 *
 * Hauling: move commodity cargo origin → destination.
 * Combat: clear a garrison at the destination node.
 * Security: destroy a raider band camped near the issuing node.
 * Escort: see a chartered convoy safely past a named band.
 * Salvage: recover cargo from a convoy wreck and deliver it here.
 */
import { z } from 'zod'
import { Commodity } from '../economy/models'
import { FactionId } from '../factions/models'

export const ContractStatus = z.enum([
  'available',
  'active',
  'completed',
  'failed',
  'expired',
])
export type ContractStatus = z.infer<typeof ContractStatus>

const ContractBase = z.object({
  id: z.string(),
  /** Node where the contract is posted — boards only post local work */
  origin: z.string(),
  /** Hauling: where the cargo is due. Combat: the site to clear. */
  destination: z.string(),
  /** Issuing faction — the dominant faction at the origin node */
  faction: FactionId,
  pay: z.number(),
  postedTick: z.number(),
  /** Hard deadline tick; null = soft expiry (never auto-fails once active) */
  deadlineTick: z.number().nullable(),
  /** Tick at which an unaccepted contract leaves the board */
  boardExpiryTick: z.number(),
  status: ContractStatus,
})

export const HaulingContractSchema = ContractBase.extend({
  type: z.literal('hauling'),
  commodity: Commodity,
  quantity: z.number(),
})
export type HaulingContract = z.infer<typeof HaulingContractSchema>

export const CombatContractSchema = ContractBase.extend({
  type: z.literal('combat'),
  /** Number of hostile units at the site */
  hostiles: z.number(),
})
export type CombatContract = z.infer<typeof CombatContractSchema>

export const SecurityContractSchema = ContractBase.extend({
  type: z.literal('security'),
  /** The raider band to destroy (a live world band, not spawned) */
  bandId: z.string(),
  /** Band size at posting (pay basis + UI) */
  hostiles: z.number(),
  /** The band's camp, for the map/UI */
  site: z.tuple([z.number(), z.number()]),
})
export type SecurityContract = z.infer<typeof SecurityContractSchema>

export const EscortContractSchema = ContractBase.extend({
  type: z.literal('escort'),
  /** The chartered convoy (quantum id) */
  quantumId: z.string(),
  /** Its fixed route — destination is the route's far node */
  routeId: z.string(),
  /** The named threat: this band always sorties on the convoy */
  bandId: z.string(),
  /** Band size at posting (pay basis + UI) */
  hostiles: z.number(),
  /** Convoy departs at this tick (boardExpiryTick == departTick) */
  departTick: z.number(),
  /** The shipment, for pay basis + UI */
  commodity: Commodity,
  quantity: z.number(),
})
export type EscortContract = z.infer<typeof EscortContractSchema>

export const SalvageContractSchema = ContractBase.extend({
  type: z.literal('salvage'),
  /** The wreck holding the cargo */
  wreckId: z.string(),
  /** Wreck position, for the map/UI */
  site: z.tuple([z.number(), z.number()]),
  /** Cargo to recover and deliver to the issuing node */
  commodity: Commodity,
  quantity: z.number(),
})
export type SalvageContract = z.infer<typeof SalvageContractSchema>

export const ContractSchema = z.discriminatedUnion('type', [
  HaulingContractSchema,
  CombatContractSchema,
  SecurityContractSchema,
  EscortContractSchema,
  SalvageContractSchema,
])
export type Contract = z.infer<typeof ContractSchema>
export type ContractType = Contract['type']

/** A node's contract board with its regeneration bookkeeping. */
export const BoardSchema = z.object({
  generatedTick: z.number(),
  contracts: z.array(ContractSchema),
})
export type Board = z.infer<typeof BoardSchema>

