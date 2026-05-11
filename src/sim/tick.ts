/**
 * Fixed-timestep simulation engine.
 *
 * The game simulation advances in discrete ticks of fixed duration.
 * The render loop calls `step()` each frame with the real elapsed time
 * and current time scale. `step()` returns how many simulation ticks
 * should be processed and an interpolation fraction for smooth rendering
 * between ticks.
 *
 * This decouples simulation from frame rate:
 * - Deterministic regardless of FPS
 * - Save/load only valid at tick boundaries
 * - Replays become possible (same inputs → same outputs)
 * - timeScale=0 pauses cleanly (no ticks emitted)
 */

/** Duration of one simulation tick in milliseconds of game time */
export const TICK_DURATION_MS = 100

/** Maximum ticks per step call — prevents spiral of death on long frames */
const MAX_TICKS_PER_STEP = 50

export interface StepResult {
  /** Number of simulation ticks to process this frame */
  ticks: number
  /** Interpolation fraction (0–1) between the last processed tick and the next.
   *  Use for smooth rendering: lerp(prevState, nextState, alpha) */
  alpha: number
}

/**
 * Create a stepper that tracks accumulated time between calls.
 *
 * Usage:
 * ```ts
 * const stepper = createStepper()
 * function frame(realDeltaMs: number) {
 *   const { ticks, alpha } = stepper.step(realDeltaMs, timeScale)
 *   for (let i = 0; i < ticks; i++) simulateTick()
 *   render(alpha)
 * }
 * ```
 */
export function createStepper() {
  let accumulator = 0

  return {
    /** Process a frame's worth of real time. Returns tick count and interpolation alpha. */
    step(realDeltaMs: number, timeScale: number): StepResult {
      if (timeScale <= 0 || realDeltaMs <= 0) {
        return { ticks: 0, alpha: 0 }
      }

      accumulator += realDeltaMs * timeScale
      let ticks = Math.floor(accumulator / TICK_DURATION_MS)

      if (ticks > MAX_TICKS_PER_STEP) {
        // Drop excess time rather than spiral
        ticks = MAX_TICKS_PER_STEP
        accumulator = accumulator % TICK_DURATION_MS
      } else {
        accumulator -= ticks * TICK_DURATION_MS
      }

      const alpha = accumulator / TICK_DURATION_MS

      return { ticks, alpha }
    },

    /** Reset the accumulator (e.g. on unpause or load) */
    reset() {
      accumulator = 0
    },

    /** Current accumulator value in ms (for debugging/testing) */
    get accumulated() {
      return accumulator
    },
  }
}
