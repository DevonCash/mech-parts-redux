/**
 * Recent game events for the HUD ticker/toasts.
 *
 * The game loop pushes pipeline events here after each tick batch.
 * Only a short tail is kept — this is a notification feed, not a log.
 */
import { atom } from 'nanostores'
import type { GameEvent } from '../sim/session/state'

const MAX_EVENTS = 8

export interface FeedEvent extends GameEvent {
  /** Monotonic id for keyed rendering */
  id: number
  /** Wall-clock arrival, for toast expiry */
  receivedAt: number
}

export const eventFeed = atom<FeedEvent[]>([])

let nextId = 1

export function pushEvents(events: GameEvent[]): void {
  if (events.length === 0) return
  const now = Date.now()
  const incoming = events.map((e) => ({ ...e, id: nextId++, receivedAt: now }))
  eventFeed.set([...eventFeed.get(), ...incoming].slice(-MAX_EVENTS))
}

export function clearEvents(): void {
  eventFeed.set([])
}
