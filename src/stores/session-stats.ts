/**
 * Session stats atom — its own leaf module so contract actions can
 * bump counters without importing session.ts (which imports the
 * contract stores; keeping this separate avoids the import cycle).
 */
import { atom } from 'nanostores'
import { emptyStats, type SessionStats } from '../sim/session/state'

export const sessionStats = atom<SessionStats>(emptyStats())
