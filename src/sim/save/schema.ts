/**
 * Save schema v1 — Zod validation for the full session state.
 *
 * Saves are only written at tick-batch boundaries, so a validated save
 * is always a coherent simulation state. Loading re-derives game time
 * from the tick counter (gameTime = tick × TICK_DURATION_MS).
 */
import { z } from 'zod'
import { Commodity, NodeMarketSchema } from '../economy/models'
import { BoardSchema, ContractSchema } from '../contracts/models'
import type { SessionState } from '../session/state'

export const SAVE_VERSION = 1 as const

const CrawlerStateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  currentNode: z.string().nullable(),
  currentRoute: z.string().nullable(),
  routeProgress: z.number(),
  destination: z.string().nullable(),
  routeReversed: z.boolean(),
  routeQueue: z.array(z.tuple([z.string(), z.boolean()])),
})

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
  kind: z.enum(['victory', 'stranded', 'bankrupt']),
  tick: z.number(),
})

export const SessionStateSchema = z.object({
  tick: z.number(),
  rngState: z.number(),
  crawler: CrawlerStateSchema,
  company: CompanyStateSchema,
  markets: z.record(z.string(), NodeMarketSchema),
  boards: z.record(z.string(), BoardSchema),
  active: z.array(ContractSchema),
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
