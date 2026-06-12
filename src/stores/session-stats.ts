/**
 * Session stats + rng state atoms — their own leaf module so contract
 * and combat actions can use them without importing session.ts (which
 * imports those stores; keeping these separate avoids import cycles).
 */
import { atom } from 'nanostores'
import { emptyStats, type SessionStats } from '../sim/session/state'

export const sessionStats = atom<SessionStats>(emptyStats())

/** Serialized PRNG state — actions that consume randomness thread it through here. */
export const rngState = atom<number>(0)

/** Raider band respawn bookkeeping (pipeline-owned). */
export const raiderRespawnAt = atom<number>(0)
export const raiderSerial = atom<number>(0)

/** Last sortie tick per raider band — the raid cooldown clock. */
export const bandRaids = atom<Record<string, number>>({})
