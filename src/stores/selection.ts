import { atom } from 'nanostores'

export interface Selection {
  /** Selected H3 cell index, or null */
  hex: string | null
  /** Selected node ID, or null */
  node: string | null
  /** Selected entity ID (crawler, unit, etc.), or null */
  entity: string | null
}

export const selection = atom<Selection>({
  hex: null,
  node: null,
  entity: null,
})
