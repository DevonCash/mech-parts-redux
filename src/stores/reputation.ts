/**
 * Per-faction standing. Leaf module — contract actions adjust it
 * without importing session.ts.
 */
import { atom } from 'nanostores'
import { emptyReputation, type Reputation } from '../sim/factions/models'

export const reputation = atom<Reputation>(emptyReputation())
