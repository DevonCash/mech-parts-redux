import { describe, expect, it } from 'vitest'
import { seedNodes } from '../economy/seed-nodes'
import { generateSeedRoutes } from '../economy/seed-routes'
import { marsDistance } from '../constants'
import {
  advanceAlongOrder,
  buildDirectMoveOrder,
  buildGroundMoveOrder,
  buildRoadMoveOrder,
  remainingKm,
  ROAD_SPEED_MULT,
  stepToward,
  unitSpeedKmS,
} from './orders'
import { buildCrawlerUnit, buildUnit } from './catalog'
import type { UnitOrder } from './models'

const nodes = Object.fromEntries(seedNodes.map((n) => [n.id, n]))
const routes = Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r]))

describe('order builders', () => {
  it('road orders follow concatenated route polylines and dock', () => {
    const order = buildRoadMoveOrder('valles-hub', 'chryse-landing', nodes, routes)
    expect(order).not.toBeNull()
    expect(order!.kind).toBe('move')
    if (order!.kind !== 'move') return
    expect(order!.mode).toBe('road')
    expect(order!.dockNodeId).toBe('chryse-landing')
    expect(order!.waypoints.length).toBeGreaterThan(2)
    // Path starts at the origin and ends at the destination
    const start = order!.waypoints[0]
    const end = order!.waypoints[order!.waypoints.length - 1]
    expect(marsDistance(start[0], start[1], ...nodes['valles-hub'].position)).toBeLessThan(1)
    expect(marsDistance(end[0], end[1], ...nodes['chryse-landing'].position)).toBeLessThan(1)
  })

  it('road orders return null for unreachable targets', () => {
    expect(buildRoadMoveOrder('valles-hub', 'nowhere', nodes, routes)).toBeNull()
  })

  it('direct orders cut the great circle', () => {
    const order = buildDirectMoveOrder([0, 0], nodes['valles-hub'])
    if (order.kind !== 'move') throw new Error('expected move')
    expect(order.mode).toBe('open')
    expect(order.dockNodeId).toBe('valles-hub')
  })

  it('ground orders carry no dock target', () => {
    const order = buildGroundMoveOrder([0, 0], [1, 1])
    if (order.kind !== 'move') throw new Error('expected move')
    expect(order.dockNodeId).toBeUndefined()
  })
})

describe('advanceAlongOrder', () => {
  const move = (waypoints: [number, number][], mode: 'open' | 'road'): UnitOrder => ({
    kind: 'move',
    waypoints,
    mode,
  })

  it('steps toward the first waypoint at base speed', () => {
    const step = advanceAlongOrder(0, 0, move([[1, 0]], 'open'), 0.5, 0.1)
    const moved = marsDistance(0, 0, step.lat, step.lng)
    expect(moved).toBeCloseTo(0.05, 3)
    expect(step.arrived).toBe(false)
  })

  it('roads without an explicit multiplier (legacy orders) run at the default', () => {
    const open = advanceAlongOrder(0, 0, move([[1, 0]], 'open'), 0.5, 0.1)
    const road = advanceAlongOrder(0, 0, move([[1, 0]], 'road'), 0.5, 0.1)
    const openKm = marsDistance(0, 0, open.lat, open.lng)
    const roadKm = marsDistance(0, 0, road.lat, road.lng)
    expect(roadKm / openKm).toBeCloseTo(ROAD_SPEED_MULT, 2)
  })

  it('road orders honor their terrain-derived speed multiplier', () => {
    const open = advanceAlongOrder(0, 0, move([[1, 0]], 'open'), 0.5, 0.1)
    const rough = advanceAlongOrder(
      0,
      0,
      { kind: 'move', waypoints: [[1, 0]], mode: 'road', roadMult: 1.25 },
      0.5,
      0.1,
    )
    const openKm = marsDistance(0, 0, open.lat, open.lng)
    const roughKm = marsDistance(0, 0, rough.lat, rough.lng)
    expect(roughKm / openKm).toBeCloseTo(1.25, 2)
  })

  it('built road orders carry the reciprocal of the path terrain factor', () => {
    const order = buildRoadMoveOrder('valles-hub', 'chryse-landing', nodes, routes)
    if (!order || order.kind !== 'move') throw new Error('expected road order')
    expect(order.roadMult).toBeDefined()
    // Terrain factors live in [0.5, 0.85] → multipliers in [1.18, 2].
    expect(order.roadMult!).toBeGreaterThanOrEqual(1 / 0.85 - 1e-9)
    expect(order.roadMult!).toBeLessThanOrEqual(2 + 1e-9)
  })

  it('pops waypoints as reached and collapses to hold on arrival', () => {
    // Two waypoints ~0.03 km apart — one tick covers both.
    const tiny = 0.0003
    const step = advanceAlongOrder(
      0,
      0,
      move([[tiny, 0], [tiny * 2, 0]], 'open'),
      0.5,
      0.1,
    )
    expect(step.order.kind).toBe('hold')
    expect(step.arrived).toBe(true)
  })

  it('hold and attack orders do not move', () => {
    const hold = advanceAlongOrder(1, 2, { kind: 'hold' }, 0.5, 0.1)
    expect([hold.lat, hold.lng]).toEqual([1, 2])
    const attack = advanceAlongOrder(1, 2, { kind: 'attack', targetId: 'x' }, 0.5, 0.1)
    expect([attack.lat, attack.lng]).toEqual([1, 2])
  })

  it('a full road trip completes in the expected tick count', () => {
    const order = buildRoadMoveOrder('valles-hub', 'chryse-landing', nodes, routes)!
    if (order.kind !== 'move') throw new Error('expected move')
    const ground = remainingKm(...nodes['valles-hub'].position, order)
    const mult = order.roadMult ?? ROAD_SPEED_MULT
    const expectTicks = Math.ceil(ground / (0.5 * mult * 0.1))

    let [lat, lng] = nodes['valles-hub'].position
    let current: UnitOrder = order
    let ticks = 0
    while (current.kind === 'move' && ticks < expectTicks * 2) {
      const step = advanceAlongOrder(lat, lng, current, 0.5, 0.1)
      lat = step.lat
      lng = step.lng
      current = step.order
      ticks++
    }
    expect(current.kind).toBe('hold')
    expect(ticks).toBeGreaterThan(expectTicks * 0.9)
    expect(ticks).toBeLessThan(expectTicks * 1.1)
    expect(marsDistance(lat, lng, ...nodes['chryse-landing'].position)).toBeLessThan(1)
  })
})

describe('unitSpeedKmS', () => {
  it('crawler runs its track speed; mechs their actuators', () => {
    expect(unitSpeedKmS(buildCrawlerUnit(0, 0))).toBeCloseTo(0.011)
    expect(unitSpeedKmS(buildUnit('m', 'M', 'scout', 'player', 0, 0))).toBeCloseTo(0.03)
  })
})

describe('antimeridian', () => {
  it('stepToward crosses the ±180° seam the short way', () => {
    // From lng 179.9 toward -179.9 — 0.2° apart across the seam.
    const [, lng] = stepToward(0, 179.9, 0, -179.9, 5)
    // Must land near the seam (|lng| ≈ 180), not wander toward 0.
    expect(Math.abs(lng)).toBeGreaterThan(179)
  })

  it('a leg across the antimeridian completes at the true distance', () => {
    // olympus-mine ↔ elysium-mine spans the seam.
    const order = buildRoadMoveOrder('olympus-mine', 'elysium-mine', nodes, routes)
    if (!order || order.kind !== 'move') throw new Error('expected road order')
    const ground = remainingKm(...nodes['olympus-mine'].position, order)
    const mult = order.roadMult ?? ROAD_SPEED_MULT
    const expectTicks = Math.ceil(ground / (0.5 * mult * 0.1))

    let [lat, lng] = nodes['olympus-mine'].position
    let current: UnitOrder = order
    let ticks = 0
    while (current.kind === 'move' && ticks < expectTicks * 1.5) {
      const step = advanceAlongOrder(lat, lng, current, 0.5, 0.1)
      lat = step.lat
      lng = step.lng
      current = step.order
      ticks++
    }
    expect(current.kind).toBe('hold')
    // Within 10% of the straight accounting — no long-way-around drift.
    expect(ticks).toBeLessThan(expectTicks * 1.1)
    expect(marsDistance(lat, lng, ...nodes['elysium-mine'].position)).toBeLessThan(1)
  })
})
