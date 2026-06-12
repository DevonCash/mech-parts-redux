/**
 * Save/load — one localStorage slot, validated by the Zod save schema.
 *
 * saveGame must only be called at tick-batch boundaries (the game loop
 * and UI actions guarantee this) so saves are always coherent states.
 */
import { decodeSave, encodeSave } from '../sim/save/schema'
import { applySessionState, gatherSessionState } from './session'

const SAVE_KEY = 'mech:save'

export function saveGame(): void {
  try {
    localStorage.setItem(SAVE_KEY, encodeSave(gatherSessionState()))
  } catch (e) {
    console.warn('Save failed:', e)
  }
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null
}

/** Load the save slot into the stores. Returns false if absent/corrupt. */
export function loadGame(): boolean {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return false
  const state = decodeSave(raw)
  if (!state) {
    console.warn('Save corrupt or incompatible — ignoring')
    return false
  }
  applySessionState(state)
  return true
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
}
