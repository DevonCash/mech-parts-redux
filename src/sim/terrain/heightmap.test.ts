import { describe, expect, it } from 'vitest'
import {
  TERRAIN_FACTOR_MAX,
  TERRAIN_FACTOR_MIN,
} from '../balance'
import { seedNodes } from '../economy/seed-nodes'
import { generateSeedRoutes } from '../economy/seed-routes'
import { marsElevation, routeTerrainFactor, terrainRoughness } from './heightmap'

describe('marsElevation', () => {
  it('is deterministic — the planet is a constant', () => {
    for (const [lat, lng] of [[0, 0], [-42, 66], [16, -128], [70, 170], [-88, -3]]) {
      expect(marsElevation(lat, lng)).toBe(marsElevation(lat, lng))
    }
  })

  it('stays inside the clamp range everywhere sampled', () => {
    for (let lat = -85; lat <= 85; lat += 8.5) {
      for (let lng = -180; lng < 180; lng += 12) {
        const e = marsElevation(lat, lng)
        expect(e).toBeGreaterThanOrEqual(-8000)
        expect(e).toBeLessThanOrEqual(14000)
      }
    }
  })

  it('is continuous across the antimeridian (sphere noise has no seam)', () => {
    for (let lat = -60; lat <= 60; lat += 15) {
      const west = marsElevation(lat, 179.999)
      const east = marsElevation(lat, -179.999)
      expect(Math.abs(west - east)).toBeLessThan(50)
    }
  })

  it('shows the crustal dichotomy: southern highlands over northern lowlands', () => {
    let south = 0
    let north = 0
    let count = 0
    for (let lat = 25; lat <= 65; lat += 10) {
      for (let lng = -180; lng < 180; lng += 20) {
        north += marsElevation(lat, lng)
        south += marsElevation(-lat, lng)
        count++
      }
    }
    expect(south / count).toBeGreaterThan(north / count + 2000)
  })

  it('carves the great basin and raises the volcano', () => {
    // Basin center far below its surroundings; volcano far above.
    expect(marsElevation(-42, 66)).toBeLessThan(marsElevation(-42, 100) - 3000)
    expect(marsElevation(16, -128)).toBeGreaterThan(8000)
  })
})

describe('terrainRoughness / routeTerrainFactor', () => {
  it('roughness is non-negative and deterministic', () => {
    const r = terrainRoughness(-30, 45)
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBe(terrainRoughness(-30, 45))
  })

  it('every seeded route lands inside the factor band', () => {
    const routes = generateSeedRoutes(seedNodes)
    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(route.terrain).toBeGreaterThanOrEqual(TERRAIN_FACTOR_MIN)
      expect(route.terrain).toBeLessThanOrEqual(TERRAIN_FACTOR_MAX)
    }
  })

  it('the seeded network is not flat — geography actually prices roads', () => {
    const routes = generateSeedRoutes(seedNodes)
    const factors = routes.map((r) => r.terrain)
    expect(Math.max(...factors) - Math.min(...factors)).toBeGreaterThan(0.02)
  })

  it('routeTerrainFactor is deterministic per path', () => {
    const routes = generateSeedRoutes(seedNodes)
    expect(routeTerrainFactor(routes[0].path)).toBe(routeTerrainFactor(routes[0].path))
  })
})
