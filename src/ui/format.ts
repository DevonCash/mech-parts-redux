/**
 * Shared display formatting for the terminal-style HUD.
 */
import { TICK_DURATION_MS } from '../sim/tick'

/** Game-time duration from a tick count: "45s", "12m", "3.4h" */
export function formatTickDuration(ticks: number): string {
  const seconds = (ticks * TICK_DURATION_MS) / 1000
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

/** Credits with thousands separators: "12,450" */
export function formatCredits(credits: number): string {
  return Math.floor(credits).toLocaleString('en-US')
}
