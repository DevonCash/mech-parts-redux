/**
 * One shared requestAnimationFrame flush for map layer rebuilds.
 *
 * Several layers subscribe to the same stores (units changes every
 * tick during transit); each used to keep a private rAF debounce, so
 * one store write queued four separate animation-frame callbacks.
 * Layers now mark their rebuild dirty here and everything flushes in
 * a single callback per frame.
 */
const dirty = new Set<() => void>()
let rafId = 0

function flush() {
  rafId = 0
  const fns = [...dirty]
  dirty.clear()
  for (const fn of fns) fn()
}

/** Run `fn` on the next shared animation frame (deduped by identity). */
export function scheduleLayerUpdate(fn: () => void): void {
  dirty.add(fn)
  if (!rafId) rafId = requestAnimationFrame(flush)
}

/** Drop a pending rebuild — call from layer cleanup. */
export function cancelLayerUpdate(fn: () => void): void {
  dirty.delete(fn)
}
