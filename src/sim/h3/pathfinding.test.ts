import { describe, it, expect } from 'vitest'
import { greatCirclePath, pathDistance } from './pathfinding'
import { marsDistance } from '../constants'

describe('greatCirclePath', () => {
  it('returns start and end points', () => {
    const path = greatCirclePath([0, 0], [10, 10])
    expect(path[0][0]).toBeCloseTo(0, 5)
    expect(path[0][1]).toBeCloseTo(0, 5)
    expect(path[path.length - 1][0]).toBeCloseTo(10, 5)
    expect(path[path.length - 1][1]).toBeCloseTo(10, 5)
  })

  it('produces at least 3 points for a non-trivial distance', () => {
    const path = greatCirclePath([0, 0], [30, 60])
    expect(path.length).toBeGreaterThanOrEqual(3)
  })

  it('handles identical start and end', () => {
    const path = greatCirclePath([15, -70], [15, -70])
    expect(path.length).toBe(2)
  })
})

describe('pathDistance', () => {
  it('closely matches direct great-circle distance', () => {
    const from: [number, number] = [18.0, -134.0]  // Olympus Mons area
    const to: [number, number] = [-12.0, -70.0]     // Valles Marineris area

    const direct = marsDistance(from[0], from[1], to[0], to[1])
    const path = greatCirclePath(from, to)
    const segmented = pathDistance(path)

    // Segmented path should be very close to direct (within 1%)
    expect(Math.abs(segmented - direct) / direct).toBeLessThan(0.01)
  })

  it('produces plausible Mars distances', () => {
    // Olympus Mons to Valles Marineris is roughly 2000-3000 km on Mars
    const path = greatCirclePath([18.0, -134.0], [-12.0, -70.0])
    const dist = pathDistance(path)
    expect(dist).toBeGreaterThan(1500)
    expect(dist).toBeLessThan(5000)
  })
})
