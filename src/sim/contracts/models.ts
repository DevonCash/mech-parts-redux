/**
 * Contract data models — a discriminated union so every consumer
 * narrows on `type` and the compiler enforces field access.
 *
 * Hauling: move commodity cargo origin → destination.
 * Combat: clear hostiles at the destination node (deploy mechs there).
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

export const ContractSchema = z.discriminatedUnion('type', [
  HaulingContractSchema,
  CombatContractSchema,
])
export type Contract = z.infer<typeof ContractSchema>
export type ContractType = Contract['type']

/** A node's contract board with its regeneration bookkeeping. */
export const BoardSchema = z.object({
  generatedTick: z.number(),
  contracts: z.array(ContractSchema),
})
export type Board = z.infer<typeof BoardSchema>

