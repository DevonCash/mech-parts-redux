import { atom } from 'nanostores'

/**
 * Selection state — what the player has clicked on.
 *
 * Only one thing can be selected at a time. Set to null to deselect.
 */

export type Selection =
  | { kind: 'node'; id: string }
  | null

export const selection = atom<Selection>(null)

export function selectNode(id: string) {
  selection.set({ kind: 'node', id })
}

export function clearSelection() {
  selection.set(null)
}
