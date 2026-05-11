import { describe, it, expect } from 'vitest'
import { createStepper, TICK_DURATION_MS } from './tick'

describe('createStepper', () => {
  it('produces zero ticks when paused (timeScale=0)', () => {
    const stepper = createStepper()
    const result = stepper.step(1000, 0)
    expect(result.ticks).toBe(0)
    expect(result.alpha).toBe(0)
  })

  it('produces zero ticks for zero delta', () => {
    const stepper = createStepper()
    const result = stepper.step(0, 1)
    expect(result.ticks).toBe(0)
  })

  it('produces one tick after exactly TICK_DURATION_MS at 1x', () => {
    const stepper = createStepper()
    const result = stepper.step(TICK_DURATION_MS, 1)
    expect(result.ticks).toBe(1)
    expect(result.alpha).toBeCloseTo(0, 6)
  })

  it('accumulates fractional time across calls', () => {
    const stepper = createStepper()

    // Two half-tick frames should produce 1 tick total
    const r1 = stepper.step(TICK_DURATION_MS / 2, 1)
    expect(r1.ticks).toBe(0)
    expect(r1.alpha).toBeCloseTo(0.5, 6)

    const r2 = stepper.step(TICK_DURATION_MS / 2, 1)
    expect(r2.ticks).toBe(1)
    expect(r2.alpha).toBeCloseTo(0, 6)
  })

  it('scales with timeScale', () => {
    const stepper = createStepper()
    // At 10x, 10ms real = 100ms game = 1 tick
    const result = stepper.step(10, 10)
    expect(result.ticks).toBe(1)
  })

  it('handles large time scales producing multiple ticks', () => {
    const stepper = createStepper()
    // At 100x, 100ms real = 10,000ms game = 100 ticks
    // But capped at MAX_TICKS_PER_STEP (50)
    const result = stepper.step(100, 100)
    expect(result.ticks).toBe(50)
  })

  it('caps ticks to prevent spiral of death', () => {
    const stepper = createStepper()
    // Huge delta — should cap at 50
    const result = stepper.step(100_000, 1)
    expect(result.ticks).toBe(50)
  })

  it('produces correct alpha for partial ticks', () => {
    const stepper = createStepper()
    // 150ms at 1x = 1 tick + 50ms remainder → alpha = 0.5
    const result = stepper.step(150, 1)
    expect(result.ticks).toBe(1)
    expect(result.alpha).toBeCloseTo(0.5, 6)
  })

  it('resets the accumulator', () => {
    const stepper = createStepper()
    stepper.step(TICK_DURATION_MS / 2, 1)
    expect(stepper.accumulated).toBeGreaterThan(0)

    stepper.reset()
    expect(stepper.accumulated).toBe(0)
  })

  it('produces negative-delta safety (no ticks)', () => {
    const stepper = createStepper()
    const result = stepper.step(-16, 1)
    expect(result.ticks).toBe(0)
  })
})
