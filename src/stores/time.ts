import { atom } from 'nanostores'

/**
 * Game time in milliseconds. Derived from the tick counter
 * (gameTime = tick × TICK_DURATION_MS) — kept as its own atom for
 * cheap HUD subscription. Plain atoms: persistence goes through the
 * save system so time can never desync from the rest of the session.
 */
export const gameTime = atom<number>(0)

/** Number of simulation ticks elapsed */
export const tick = atom<number>(0)

/**
 * Tick rounded down to 1 game-second (10-tick) buckets. UI that only
 * displays durations/countdowns should subscribe here instead of
 * `tick`: nanostores skips equal values, so this notifies once per
 * game-second instead of once per tick batch. Pure function of the
 * tick counter — no wall clock involved.
 */
export const tickCoarse = atom<number>(0)

/** Time scale: 0 = paused, 1 = real-time, 10 = fast, 100 = very fast */
export const timeScale = atom<number>(1)

/** Interpolation fraction (0–1) for smooth rendering between ticks */
export const alpha = atom<number>(0)
