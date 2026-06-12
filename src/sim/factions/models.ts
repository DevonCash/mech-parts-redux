/**
 * Factions lite — docs/world/factions.md + economy.md §Factions.
 *
 * Three behavioral orientations with static node affiliations for now.
 * Live influence computation (workforce/supply/trade/security signals)
 * arrives with the full faction phase; what matters this phase is that
 * contracts have an issuer, failing them has a relational cost, and
 * reputation gates how much concurrent work you're trusted with
 * (contracts.md: "active contract slots scale with reputation").
 */
import { z } from 'zod'
import type { GameNode } from '../economy/models'

export const FactionId = z.enum(['preservationist', 'corporate', 'settler'])
export type FactionId = z.infer<typeof FactionId>

export const FACTION_IDS = FactionId.options

export interface FactionMeta {
  id: FactionId
  name: string
  /** Terminal-UI accent for chips and map tints */
  color: string
}

export const FACTIONS: Record<FactionId, FactionMeta> = {
  preservationist: {
    id: 'preservationist',
    name: 'EARTH RETURN AUTHORITY',
    color: '#6aa9ff',
  },
  corporate: {
    id: 'corporate',
    name: 'THARSIS COMBINE',
    color: '#d0c040',
  },
  settler: {
    id: 'settler',
    name: 'FREE MARS COALITION',
    color: '#ff8c5a',
  },
}

/**
 * Static dominant faction per node: Earth-facing infrastructure
 * (terminals, depots) belongs to the preservationists, industry to the
 * corporates, and the places people live to the settlers.
 */
export function nodeFaction(node: GameNode): FactionId {
  switch (node.type) {
    case 'terminal':
    case 'depot':
      return 'preservationist'
    case 'extraction':
    case 'processing':
      return 'corporate'
    case 'settlement':
      return 'settler'
  }
}

// ── Reputation ──────────────────────────────────────────────────────

export type Reputation = Record<FactionId, number>

export function emptyReputation(): Reputation {
  return { preservationist: 0, corporate: 0, settler: 0 }
}

export const REP_MIN = -1
export const REP_MAX = 1

/** Completing a contract builds trust with the issuer. */
export const REP_COMPLETED = 0.05
/** Failing means you tried; the hit is real but survivable. */
export const REP_FAILED = -0.06
/** Abandoning means you quit. Worse (contracts.md). */
export const REP_ABANDONED = -0.1

export function adjustReputation(
  reputation: Reputation,
  faction: FactionId,
  delta: number,
): Reputation {
  return {
    ...reputation,
    [faction]: Math.max(REP_MIN, Math.min(REP_MAX, reputation[faction] + delta)),
  }
}

/**
 * Concurrent contract slots from your best relationship: unknowns get
 * two, trusted companies get more.
 */
export function contractSlots(reputation: Reputation): number {
  const best = Math.max(...FACTION_IDS.map((f) => reputation[f]))
  if (best >= 0.5) return 4
  if (best >= 0.2) return 3
  return 2
}

/** Issuer pay adjustment: trusted companies get better terms. */
export function payModifier(reputation: Reputation, faction: FactionId): number {
  return 1 + reputation[faction] * 0.15
}
