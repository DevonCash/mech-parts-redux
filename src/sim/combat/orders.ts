/**
 * Shared movement executor + order builders — every unit on the map,
 * the crawler included, moves through this one path (universality:
 * identical commands, identical execution).
 */
import { marsDistance } from '../constants'
import { greatCirclePath, pathDistance } from '../h3/pathfinding'
import { findPath } from '../h3/graph'
import { OFFROAD_DANGER } from '../balance'
import { COMPONENTS } from './catalog'
import type { GameNode, Route } from '../economy/models'
import type { Unit, UnitOrder } from './models'

/** Road infrastructure doubles ground speed (ex-terrain factor 0.5). */
export const ROAD_SPEED_MULT = 2

/** Within this of a waypoint counts as reached. */
const ARRIVE_KM = 0.05

/** Wrap a longitude into [-180, 180]. */
function wrapLng(lng: number): number {
  if (lng > 180) return lng - 360
  if (lng < -180) return lng + 360
  return lng
}

export function stepToward(
  lat: number,
  lng: number,
  toLat: number,
  toLng: number,
  maxKm: number,
): [number, number] {
  const dist = marsDistance(lat, lng, toLat, toLng)
  if (dist <= ARRIVE_KM || maxKm <= 0) return [toLat, toLng]
  const frac = Math.min(1, maxKm / dist)
  // Interpolate longitude the short way around — linear lng deltas
  // across the ±180° antimeridian would otherwise send the unit the
  // long way around the planet.
  const dLng = wrapLng(toLng - lng)
  return [lat + (toLat - lat) * frac, wrapLng(lng + dLng * frac)]
}

export interface MoveStep {
  lat: number
  lng: number
  order: UnitOrder
  /** Completed the full waypoint path this tick */
  arrived: boolean
}

/**
 * Advance one tick along a move order. Pops waypoints as they are
 * reached; on completing the path the order collapses to hold and
 * `arrived` reports it (the caller handles docking via dockNodeId).
 */
export function advanceAlongOrder(
  lat: number,
  lng: number,
  order: UnitOrder,
  baseSpeedKmS: number,
  tickS: number,
): MoveStep {
  if (order.kind !== 'move' || order.waypoints.length === 0) {
    return { lat, lng, order, arrived: false }
  }

  const speed = baseSpeedKmS * (order.mode === 'road' ? ROAD_SPEED_MULT : 1)
  let budget = speed * tickS
  let waypoints = order.waypoints
  let pos: [number, number] = [lat, lng]

  while (budget > 0 && waypoints.length > 0) {
    const [wLat, wLng] = waypoints[0]
    const dist = marsDistance(pos[0], pos[1], wLat, wLng)
    if (dist <= Math.max(budget, ARRIVE_KM)) {
      pos = [wLat, wLng]
      budget -= dist
      waypoints = waypoints.slice(1)
    } else {
      pos = stepToward(pos[0], pos[1], wLat, wLng, budget)
      budget = 0
    }
  }

  if (waypoints.length === 0) {
    return { lat: pos[0], lng: pos[1], order: { kind: 'hold' }, arrived: true }
  }
  return {
    lat: pos[0],
    lng: pos[1],
    order: { ...order, waypoints },
    arrived: false,
  }
}

/** Remaining ground km of a move order from a position. */
export function remainingKm(lat: number, lng: number, order: UnitOrder): number {
  if (order.kind !== 'move' || order.waypoints.length === 0) return 0
  let total = marsDistance(lat, lng, order.waypoints[0][0], order.waypoints[0][1])
  total += pathDistance(order.waypoints)
  return total
}

// ── Order builders (pure — stores and tests share them) ─────────────

/**
 * Road move order: concatenated route polylines along the A* path,
 * mean route danger, dock at the target. Requires starting at a node —
 * roads begin at nodes.
 */
export function buildRoadMoveOrder(
  fromNodeId: string,
  targetNodeId: string,
  nodes: Record<string, GameNode>,
  routes: Record<string, Route>,
): UnitOrder | null {
  const positions: Record<string, [number, number]> = {}
  for (const n of Object.values(nodes)) positions[n.id] = n.position

  const segments = findPath(fromNodeId, targetNodeId, routes, positions)
  if (!segments || segments.length === 0) return null

  const waypoints: [number, number][] = []
  let dangerSum = 0
  for (const seg of segments) {
    const route = routes[seg.routeId]
    const path = seg.reversed ? [...route.path].reverse() : route.path
    // Skip the shared endpoint between consecutive segments.
    for (const point of waypoints.length === 0 ? path : path.slice(1)) {
      waypoints.push(point)
    }
    dangerSum += route.danger
  }

  return {
    kind: 'move',
    waypoints,
    mode: 'road',
    danger: dangerSum / segments.length,
    dockNodeId: targetNodeId,
  }
}

/** Direct overland move to a node from anywhere; docks on arrival. */
export function buildDirectMoveOrder(
  from: [number, number],
  target: GameNode,
): UnitOrder {
  return {
    kind: 'move',
    waypoints: greatCirclePath(from, target.position),
    mode: 'open',
    danger: OFFROAD_DANGER,
    dockNodeId: target.id,
  }
}

/** Free move to an arbitrary point (ground click). */
export function buildGroundMoveOrder(
  from: [number, number],
  to: [number, number],
): UnitOrder {
  return {
    kind: 'move',
    waypoints: greatCirclePath(from, to),
    mode: 'open',
    danger: OFFROAD_DANGER,
  }
}

/** Top speed from the unit's own locomotion stack, scaled by damage. */
export function unitSpeedKmS(unit: Unit): number {
  for (const stack of Object.values(unit.components)) {
    for (const c of stack) {
      const template = COMPONENTS[c.templateId]
      if (template?.type === 'locomotion' && c.hp > 0) {
        return (template.topSpeedKmS ?? 0) * (c.hp / c.maxHP)
      }
    }
  }
  return 0
}
