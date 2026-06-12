import { describe, expect, it } from 'vitest'
import { seedNodes } from '../economy/seed-nodes'
import { generateSeedRoutes } from '../economy/seed-routes'
import { makeRng } from '../rng'
import { marsDistance } from '../constants'
import {
  CAMP_MECH_LEASH_KM,
  RAIDER_BAND_SIZE_MAX,
  RAIDER_BAND_SIZE_MIN,
  TECHNICAL_LEASH_KM,
} from '../balance'
import {
  bandsNearNode,
  liveBandIds,
  liveCamps,
  pickCampSite,
  routeLiveDanger,
  spawnBand,
  type WorldLike,
} from './bands'
import { wreckUnit as wreck } from '../combat/test-helpers'

const world: WorldLike = {
  nodes: Object.fromEntries(seedNodes.map((n) => [n.id, n])),
  routes: Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r])),
}

describe('pickCampSite', () => {
  it('is deterministic per rng state', () => {
    expect(pickCampSite(world, makeRng(3))).toEqual(pickCampSite(world, makeRng(3)))
  })

  it('lands near a route path (mid-road, off the docks)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const camp = pickCampSite(world, makeRng(seed))
      let nearestRouteKm = Infinity
      let nearestNodeKm = Infinity
      for (const route of Object.values(world.routes)) {
        for (const [lat, lng] of route.path) {
          nearestRouteKm = Math.min(nearestRouteKm, marsDistance(camp[0], camp[1], lat, lng))
        }
      }
      for (const node of Object.values(world.nodes)) {
        nearestNodeKm = Math.min(
          nearestNodeKm,
          marsDistance(camp[0], camp[1], node.position[0], node.position[1]),
        )
      }
      // The jitter is ±0.03° (~2 km); camps hug a road…
      expect(nearestRouteKm).toBeLessThan(5)
      // …but sit on the open stretch, not inside a settlement.
      expect(nearestNodeKm).toBeGreaterThan(5)
    }
  })
})

describe('spawnBand', () => {
  it('is deterministic and builds a coherent band', () => {
    const a = spawnBand(7, [10, 20], makeRng(4))
    const b = spawnBand(7, [10, 20], makeRng(4))
    expect(a).toEqual(b)

    const technicals = a.filter((u) => u.chassisId === 'technical')
    expect(technicals.length).toBeGreaterThanOrEqual(RAIDER_BAND_SIZE_MIN)
    expect(technicals.length).toBeLessThanOrEqual(RAIDER_BAND_SIZE_MAX)
    for (const u of a) {
      expect(u.bandId).toBe('band-7')
      expect(u.side).toBe('hostile')
      expect(u.spawn).toEqual([10, 20])
      expect(u.npcPilot).toBeDefined()
      expect(u.leashKm).toBe(
        u.chassisId === 'technical' ? TECHNICAL_LEASH_KM : CAMP_MECH_LEASH_KM,
      )
    }
  })

  it('sometimes anchors the camp with a guard mech', () => {
    let withMech = 0
    for (let seed = 0; seed < 40; seed++) {
      const band = spawnBand(seed, [0, 0], makeRng(seed))
      if (band.some((u) => u.chassisId === 'raider-scout')) withMech++
    }
    expect(withMech).toBeGreaterThan(0)
    expect(withMech).toBeLessThan(40)
  })
})

describe('liveBandIds / liveCamps', () => {
  it('counts only bands with living units', () => {
    const a = spawnBand(1, [0, 0], makeRng(1))
    const b = spawnBand(2, [5, 5], makeRng(2))
    const units = [...a, ...b.map(wreck)]
    expect([...liveBandIds(units)]).toEqual(['band-1'])
    expect(liveCamps(units)).toEqual([[0, 0]])
  })
})

describe('routeLiveDanger', () => {
  it('rises when a camp sits beside the road and stays base otherwise', () => {
    const route = Object.values(world.routes)[0]
    const mid = route.path[Math.floor(route.path.length / 2)]

    const calm = routeLiveDanger(route, [])
    const camped = routeLiveDanger(route, spawnBand(1, [mid[0], mid[1]], makeRng(1)))
    expect(camped).toBeGreaterThan(calm)

    // A camp on the far side of the planet does not threaten this road.
    const far: [number, number] = [-mid[0], mid[1] + 170]
    expect(routeLiveDanger(route, spawnBand(2, far, makeRng(2)))).toBe(calm)
  })

  it('a wrecked band stops mattering', () => {
    const route = Object.values(world.routes)[0]
    const mid = route.path[Math.floor(route.path.length / 2)]
    const band = spawnBand(1, [mid[0], mid[1]], makeRng(1)).map(wreck)
    expect(routeLiveDanger(route, band)).toBe(routeLiveDanger(route, []))
  })
})

describe('bandsNearNode', () => {
  it('finds a band camped on an adjacent route and sizes it correctly', () => {
    const nodeId = Object.keys(world.nodes).sort()[0]
    const route = Object.values(world.routes).find(
      (r) => r.from === nodeId || r.to === nodeId,
    )!
    const nearPoint = route.path[Math.floor(route.path.length / 4)]
    const band = spawnBand(9, [nearPoint[0], nearPoint[1]], makeRng(9))

    const found = bandsNearNode(world, nodeId, band, 60)
    expect(found).toHaveLength(1)
    expect(found[0].bandId).toBe('band-9')
    expect(found[0].size).toBe(band.length)

    // Dead bands are not patrol targets.
    expect(bandsNearNode(world, nodeId, band.map(wreck), 60)).toHaveLength(0)
  })
})
