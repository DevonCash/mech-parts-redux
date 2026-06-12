/**
 * Engagement state atoms — their own leaf module so stores that need
 * to check combat status (e.g. forces.ts blocking workshop repairs
 * mid-fight) can do so without importing combat.ts's actions, which
 * import those stores back (cycle).
 */
import { atom } from 'nanostores'
import type { Engagement } from '../sim/combat/models'

export const engagement = atom<Engagement | null>(null)

/** Unit id selected on the map for order input */
export const selectedUnit = atom<string | null>(null)
