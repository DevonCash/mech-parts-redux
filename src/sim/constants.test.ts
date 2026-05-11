import { describe, it, expect } from 'vitest'
import {
  MARS_RADIUS_KM,
  MARS_EARTH_RATIO,
  h3EdgeToMars,
  h3AreaToMars,
  marsDistance,
} from './constants'

describe('MARS_EARTH_RATIO', () => {
  it('is approximately 0.532', () => {
    expect(MARS_EARTH_RATIO).toBeCloseTo(0.532, 3)
  })
})

describe('h3EdgeToMars', () => {
  it('scales an Earth edge length down by the radius ratio', () => {
    const earthEdge = 100
    expect(h3EdgeToMars(earthEdge)).toBeCloseTo(earthEdge * MARS_EARTH_RATIO, 3)
  })
})

describe('h3AreaToMars', () => {
  it('scales an Earth area down by the ratio squared', () => {
    const earthArea = 1000
    expect(h3AreaToMars(earthArea)).toBeCloseTo(earthArea * MARS_EARTH_RATIO ** 2, 3)
  })
})

describe('marsDistance', () => {
  it('returns 0 for the same point', () => {
    expect(marsDistance(0, 0, 0, 0)).toBe(0)
  })

  it('computes antipodal distance as half the Mars circumference', () => {
    // North pole to south pole = π × R
    const expected = Math.PI * MARS_RADIUS_KM
    expect(marsDistance(90, 0, -90, 0)).toBeCloseTo(expected, 0)
  })

  it('gives a reasonable Olympus Mons to Hellas Basin distance', () => {
    // Olympus Mons: ~18.65°N, 226.2°E → -133.8° in signed lng
    // Hellas Basin: ~42.7°S, 70.0°E
    // Expected great-circle distance on Mars: roughly 7,600–8,600 km
    const dist = marsDistance(18.65, -133.8, -42.7, 70.0)
    expect(dist).toBeGreaterThan(7_000)
    expect(dist).toBeLessThan(9_000)
  })

  it('is symmetric', () => {
    const a = marsDistance(10, 20, 30, 40)
    const b = marsDistance(30, 40, 10, 20)
    expect(a).toBeCloseTo(b, 6)
  })
})
