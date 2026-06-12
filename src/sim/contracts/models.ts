/**
 * Contract data models.
 *
 * Hauling: move commodity cargo origin → destination.
 * Combat: clear hostiles at the destination node (deploy mechs there).
 */
import { z } from 'zod'
import { Commodity } from '../economy/models'
import { FactionId } from '../factions/models'

export const ContractType = z.enum(['hauling', 'combat'])
export type ContractType = z.infer<typeof ContractType>

export const ContractStatus = z.enum([
  'available',
  'active',
  'completed',
  'failed',
  'expired',
])
export type ContractStatus = z.infer<typeof ContractStatus>

export const ContractSchema = z.object({
  id: z.string(),
  type: ContractType,
  /** Node where the contract is posted — boards only post local work */
  origin: z.string(),
  /** Hauling: where the cargo is due. Combat: the site to clear. */
  destination: z.string(),
  /** Hauling only */
  commodity: Commodity.optional(),
  quantity: z.number().optional(),
  /** Combat only — number of hostile units at the site */
  hostiles: z.number().optional(),
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
export type Contract = z.infer<typeof ContractSchema>

/** A node's contract board with its regeneration bookkeeping. */
export const BoardSchema = z.object({
  generatedTick: z.number(),
  contracts: z.array(ContractSchema),
})
export type Board = z.infer<typeof BoardSchema>
