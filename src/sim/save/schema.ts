/**
 * Save schema — Zod validation for the full session state.
 *
 * Saves are only written at tick-batch boundaries, so a validated save
 * is always a coherent simulation state. Loading re-derives game time
 * from the tick counter (gameTime = tick × TICK_DURATION_MS).
 */
import { z } from 'zod'
import { Commodity, NodeMarketSchema, QuantumSchema } from '../economy/models'
import { BoardSchema, ContractSchema } from '../contracts/models'
import { UnitSchema } from '../combat/models'
import { PilotSchema } from '../pilots/models'
import { HirePoolSchema } from '../pilots/hiring'
import { MechLotSchema } from '../combat/sales'
import { FactionId } from '../factions/models'
import { NodeIntelSchema } from '../intel/models'
import type { SessionState } from '../session/state'

export const SAVE_VERSION = 6 as const

const CompanyStateSchema = z.object({
  credits: z.number(),
  fuel: z.number(),
  fuelCapacity: z.number(),
  cargo: z.partialRecord(Commodity, z.number()),
  cargoCapacity: z.number(),
})

const SessionParamsSchema = z.object({
  seed: z.number(),
  startCredits: z.number(),
  creditTarget: z.number(),
})

const SessionStatsSchema = z.object({
  contractsCompleted: z.number(),
  contractsFailed: z.number(),
  ambushes: z.number(),
  creditsEarned: z.number(),
})

const EndStateSchema = z.object({
  kind: z.enum(['victory', 'stranded', 'bankrupt', 'destroyed']),
  tick: z.number(),
})

export const SessionStateSchema = z.object({
  tick: z.number(),
  rngState: z.number(),
  company: CompanyStateSchema,
  markets: z.record(z.string(), NodeMarketSchema),
  boards: z.record(z.string(), BoardSchema),
  active: z.array(ContractSchema),
  units: z.array(UnitSchema),
  garage: z.array(UnitSchema),
  crawlerDock: z.string().nullable(),
  quanta: z.array(QuantumSchema),
  pilots: z.array(PilotSchema),
  // defaults keep pre-recruitment v6 saves loadable
  hirePools: z.record(z.string(), HirePoolSchema).default({}),
  mechLots: z.record(z.string(), MechLotSchema).default({}),
  reputation: z.record(FactionId, z.number()),
  // default({}) keeps pre-intel saves loadable
  intel: z.record(z.string(), NodeIntelSchema).default({}),
  params: SessionParamsSchema,
  stats: SessionStatsSchema,
  endState: EndStateSchema.nullable(),
})

export const SaveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  savedAt: z.number(), // wall-clock ms, informational only
  state: SessionStateSchema,
})
export type SaveFile = z.infer<typeof SaveSchema>

export function encodeSave(state: SessionState): string {
  const save: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), state }
  return JSON.stringify(save)
}

/** Parse and validate a save. Returns null on any corruption/mismatch. */
export function decodeSave(raw: string): SessionState | null {
  try {
    const parsed = SaveSchema.parse(JSON.parse(raw))
    return parsed.state
  } catch {
    return null
  }
}
