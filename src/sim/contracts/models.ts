/**
 * Contract data models — Phase 1 covers hauling only.
 *
 * Security/combat types arrive with the combat slice; the schema keeps
 * the type field an enum so they slot in without a migration.
 */
import { z } from 'zod'
import { Commodity } from '../economy/models'

export const ContractType = z.enum(['hauling'])
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
  /** Node where the cargo is loaded — boards only post local pickups */
  origin: z.string(),
  /** Node where the cargo is due */
  destination: z.string(),
  commodity: Commodity,
  quantity: z.number(),
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
