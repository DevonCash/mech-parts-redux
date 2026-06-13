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

let pendingIdleSave = 0

/**
 * Autosave variant: snapshot the (immutable-by-convention) state now,
 * but serialize + write it off the frame, in idle time. A newer
 * deferred save supersedes an unflushed older one.
 */
export function saveGameDeferred(): void {
  const snapshot = gatherSessionState()
  const scheduleIdle: (fn: () => void) => number =
    typeof requestIdleCallback === 'function'
      ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
      : (fn) => window.setTimeout(fn, 0)
  const cancelIdle: (id: number) => void =
    typeof cancelIdleCallback === 'function' ? cancelIdleCallback : clearTimeout
  if (pendingIdleSave) cancelIdle(pendingIdleSave)
  pendingIdleSave = scheduleIdle(() => {
    pendingIdleSave = 0
    try {
      localStorage.setItem(SAVE_KEY, encodeSave(snapshot))
    } catch (e) {
      console.warn('Save failed:', e)
    }
  })
}

/**
 * A save exists AND validates — otherwise the title screen would
 * offer a CONTINUE button that silently does nothing (e.g. after a
 * schema version bump).
 */
export function hasSave(): boolean {
  const raw = localStorage.getItem(SAVE_KEY)
  return raw !== null && decodeSave(raw) !== null
}

/** Load the save slot into the stores. Returns false if absent/corrupt
 *  (and clears a corrupt slot so it stops being offered). */
export function loadGame(): boolean {
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return false
  const state = decodeSave(raw)
  if (!state) {
    console.warn('Save corrupt or incompatible — clearing')
    clearSave()
    return false
  }
  applySessionState(state)
  return true
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
}
