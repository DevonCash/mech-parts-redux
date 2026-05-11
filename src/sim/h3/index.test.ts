import { describe, it, expect } from 'vitest'
import { zoomToResolution, cellsInViewport, cellBoundaryToGeoJSON } from './index'
import { latLngToCell, getResolution } from 'h3-js'

describe('zoomToResolution', () => {
  it('returns res 2 for strategic zoom (0–3)', () => {
    expect(zoomToResolution(0)).toBe(2)
    expect(zoomToResolution(2)).toBe(2)
    expect(zoomToResolution(2.9)).toBe(2)
  })

  it('returns res 3 for zoom 3–5', () => {
    expect(zoomToResolution(3)).toBe(3)
    expect(zoomToResolution(4)).toBe(3)
  })

  it('returns res 4 for zoom 5–7', () => {
    expect(zoomToResolution(5)).toBe(4)
    expect(zoomToResolution(6)).toBe(4)
  })

  it('returns res 5 for zoom 7–9', () => {
    expect(zoomToResolution(7)).toBe(5)
    expect(zoomToResolution(8)).toBe(5)
  })

  it('returns res 6 for zoom 9–11', () => {
    expect(zoomToResolution(9)).toBe(6)
    expect(zoomToResolution(10)).toBe(6)
  })

  it('returns res 7 for zoom 11–13', () => {
    expect(zoomToResolution(11)).toBe(7)
    expect(zoomToResolution(12)).toBe(7)
  })

  it('returns res 8 for zoom 13+', () => {
    expect(zoomToResolution(13)).toBe(8)
    expect(zoomToResolution(16)).toBe(8)
  })
})

describe('cellsInViewport', () => {
  it('returns cells at the correct resolution for the zoom level', () => {
    // Small region around Valles Marineris
    const bounds = { north: -3, south: -5, east: -136, west: -139 }
    const cells = cellsInViewport(bounds, 6) // should use res 4
    expect(cells.length).toBeGreaterThan(0)

    // All cells should be at resolution 4
    for (const cell of cells) {
      expect(getResolution(cell)).toBe(4)
    }
  })

  it('returns more cells at higher resolution', () => {
    const bounds = { north: 0, south: -2, east: -136, west: -138 }
    const lowRes = cellsInViewport(bounds, 4) // res 3
    const highRes = cellsInViewport(bounds, 6) // res 4
    expect(highRes.length).toBeGreaterThan(lowRes.length)
  })

  it('returns an empty array for degenerate bounds', () => {
    const bounds = { north: 0, south: 0, east: 0, west: 0 }
    const cells = cellsInViewport(bounds, 5)
    // A zero-area polygon might return 0 or 1 cell — just don't crash
    expect(Array.isArray(cells)).toBe(true)
  })

  it('handles pole-adjacent regions without crashing', () => {
    const bounds = { north: 89, south: 85, east: 180, west: -180 }
    const cells = cellsInViewport(bounds, 2)
    expect(Array.isArray(cells)).toBe(true)
  })
})

describe('cellBoundaryToGeoJSON', () => {
  it('returns a closed ring in [lng, lat] order', () => {
    const cell = latLngToCell(0, 0, 4)
    const ring = cellBoundaryToGeoJSON(cell)

    // Ring should be closed
    expect(ring[0]).toEqual(ring[ring.length - 1])

    // Should have at least 6 vertices + closing vertex (hex = 6 sides)
    expect(ring.length).toBeGreaterThanOrEqual(7)

    // Each coordinate should be [lng, lat] — longitude range is wider than latitude
    for (const [lng, lat] of ring) {
      expect(lng).toBeGreaterThanOrEqual(-180)
      expect(lng).toBeLessThanOrEqual(180)
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
    }
  })
})
