import { describe, it, expect } from 'vitest'
import { interpolateRoutePath } from './movement'

describe('interpolateRoutePath', () => {
  const path: [number, number][] = [[0, 0], [10, 0], [10, 10]]

  it('returns start at progress 0', () => {
    expect(interpolateRoutePath(path, 0)).toEqual([0, 0])
  })

  it('returns end at progress 1', () => {
    expect(interpolateRoutePath(path, 1)).toEqual([10, 10])
  })

  it('returns midpoint at progress 0.5', () => {
    const [lat, lng] = interpolateRoutePath(path, 0.5)
    expect(lat).toBeCloseTo(10, 5)
    expect(lng).toBeCloseTo(0, 5)
  })

  it('interpolates within a segment', () => {
    const [lat, lng] = interpolateRoutePath(path, 0.25)
    expect(lat).toBeCloseTo(5, 5)
    expect(lng).toBeCloseTo(0, 5)
  })

  it('clamps below 0 and above 1', () => {
    expect(interpolateRoutePath(path, -0.5)).toEqual([0, 0])
    expect(interpolateRoutePath(path, 1.5)).toEqual([10, 10])
  })

  it('handles an empty path', () => {
    expect(interpolateRoutePath([], 0.5)).toEqual([0, 0])
  })
})
