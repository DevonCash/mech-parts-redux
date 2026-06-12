/**
 * Convoy predation — where the raider war touches the economy.
 *
 * Quanta stay lightweight progress-fractions until something can
 * actually happen to them: passing a hungry band's camp (or a player
 * close enough to turn pirate) embodies the convoy as a real strategic
 * unit; surviving the encounter melts it back into a progress fraction.
 * A killed convoy leaves a cargo wreck — pure data, never a unit — that
 * feeds the salvage business.
 *
 * Determinism: materialization is gated by per-band raid cooldowns, not
 * dice. No rng is consumed anywhere in this module.
 */
import { z } from 'zod'
import {
  CONVOY_THREAT_RADIUS_KM,
  PIRACY_RANGE_KM,
  RAID_COOLDOWN_TICKS,
} from '../balance'
import { buildUnit } from '../combat/catalog'
import { unitDestroyed } from '../combat/damage'
import type { Unit } from '../combat/models'
import { KM_PER_DEG, marsDistance } from '../constants'
import { interpolateRoutePath } from '../crawler/movement'
import { Commodity, type Quantum, type Route } from './models'

export const CargoWreckSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  cargo: z.object({ commodity: Commodity, qty: z.number() }),
  createdTick: z.number(),
})
export type CargoWreck = z.infer<typeof CargoWreckSchema>

export const HAULER_UNIT_PREFIX = 'hauler-'

export function haulerUnitId(quantumId: string): string {
  return `${HAULER_UNIT_PREFIX}${quantumId}`
}

export function quantumIdOfHauler(unitId: string): string | null {
  return unitId.startsWith(HAULER_UNIT_PREFIX)
    ? unitId.slice(HAULER_UNIT_PREFIX.length)
    : null
}

/** A materialized convoy this close to its road's end has arrived. */
const ARRIVED_EPS_KM = 1

/**
 * Embody a transiting quantum as a strategic unit at its interpolated
 * position. Under a raider sortie (`halted`) the convoy stops — trucks
 * don't outrun a roadblock; the fight happens where the road was cut.
 * Otherwise it keeps driving the rest of its route. Progress maps to
 * waypoints with the same segment-uniform convention as
 * interpolateRoutePath, so the round-trip back to a fraction is
 * lossless.
 */
export function materializeQuantum(q: Quantum, route: Route, halted = false): Unit {
  const path = q.reversed ? [...route.path].reverse() : route.path
  const [lat, lng] = interpolateRoutePath(path, q.progress)
  const totalSegments = path.length - 1
  const segIndex = Math.min(
    Math.floor(q.progress * totalSegments),
    totalSegments - 1,
  )
  const unit = buildUnit(
    haulerUnitId(q.id),
    `CONVOY ${q.id.toUpperCase()}`,
    'hauler',
    'neutral',
    lat,
    lng,
  )
  if (q.hullFrac !== undefined && q.hullFrac < 1) {
    for (const stack of Object.values(unit.components)) {
      for (const c of stack) {
        c.hp = Math.max(1, Math.round(c.maxHP * q.hullFrac))
      }
    }
  }
  unit.order = halted
    ? { kind: 'hold' }
    : {
        kind: 'move',
        waypoints: path.slice(segIndex + 1),
        mode: 'road',
        // Ground speed 0.022 × (1/terrain) == the quantum's effective
        // speed, so transit time is invariant across the boundary.
        roadMult: 1 / route.terrain,
      }
  return unit
}

/** Mean component hp fraction — the single number damage carries home in. */
export function unitHullFrac(unit: Unit): number {
  let hp = 0
  let max = 0
  for (const stack of Object.values(unit.components)) {
    for (const c of stack) {
      hp += c.hp
      max += c.maxHP
    }
  }
  return max > 0 ? hp / max : 0
}

/** Inverse of materializeQuantum's waypoint slice: unit → progress. */
export function haulerProgress(unit: Unit, q: Quantum, route: Route): number {
  if (unit.order.kind !== 'move' || unit.order.waypoints.length === 0) return 1
  const path = q.reversed ? [...route.path].reverse() : route.path
  const totalSegments = path.length - 1
  if (totalSegments <= 0) return 1
  const remaining = unit.order.waypoints.length
  const segIndex = totalSegments - remaining // segment being traversed
  const segStart = path[segIndex]
  const segEnd = path[segIndex + 1]
  const segLen = marsDistance(segStart[0], segStart[1], segEnd[0], segEnd[1])
  const toNext = marsDistance(unit.lat, unit.lng, segEnd[0], segEnd[1])
  const frac = segLen > 0 ? Math.min(1, Math.max(0, 1 - toNext / segLen)) : 0
  return Math.min(1, Math.max(0, (segIndex + frac) / totalSegments))
}

interface BandCamp {
  bandId: string
  camp: [number, number]
}

function livingBandCamps(units: Unit[]): BandCamp[] {
  const seen = new Set<string>()
  const camps: BandCamp[] = []
  for (const u of units) {
    if (!u.bandId || !u.spawn || unitDestroyed(u) || seen.has(u.bandId)) continue
    seen.add(u.bandId)
    camps.push({ bandId: u.bandId, camp: u.spawn })
  }
  return camps
}

function near(
  lat: number,
  lng: number,
  point: [number, number],
  km: number,
): boolean {
  // Latitude lower-bounds great-circle distance — cheap reject first.
  if (Math.abs(lat - point[0]) * KM_PER_DEG > km) return false
  return marsDistance(lat, lng, point[0], point[1]) <= km
}

export interface ConvoyScanResult {
  quanta: Quantum[]
  units: Unit[]
  bandRaids: Record<string, number>
  /** Convoys that materialized under raider threat this scan */
  attacked: { quantumId: string; bandId: string }[]
  /** Materialized convoys that arrived at their destination this scan */
  arrived: string[]
}

/**
 * One materialize/dematerialize pass (CONVOY_THREAT_INTERVAL cadence).
 * `escortedBands` maps quantumId → bandId for active escort contracts:
 * the named band always sorties on its convoy, cooldown be damned — an
 * accepted escort is never free money.
 */
export function scanConvoys(
  quanta: Quantum[],
  units: Unit[],
  routes: Record<string, Route>,
  tick: number,
  bandRaids: Record<string, number>,
  escortedBands: Map<string, string>,
): ConvoyScanResult {
  const camps = livingBandCamps(units)
  const players = units.filter((u) => u.side === 'player' && !unitDestroyed(u))
  const unitById = new Map(units.map((u) => [u.id, u]))

  let nextQuanta = quanta
  let nextUnits = units
  let nextRaids = bandRaids
  const attacked: ConvoyScanResult['attacked'] = []
  const arrived: string[] = []

  quanta.forEach((q, i) => {
    const setQuantum = (next: Quantum) => {
      if (nextQuanta === quanta) nextQuanta = [...quanta]
      nextQuanta[i] = next
    }

    if (q.materialized) {
      const unit = unitById.get(haulerUnitId(q.id))
      // Killed convoys are resolved by the pipeline's death branch the
      // tick they die; if we see one here mid-window, leave it alone.
      if (!unit || unitDestroyed(unit)) return
      const route = q.route ? routes[q.route] : null
      const path = route
        ? q.reversed
          ? [...route.path].reverse()
          : route.path
        : null
      // A completed move order collapses to hold — but so does a halt
      // under fire, so arrival is a position check, not an order check.
      const endPoint = path ? path[path.length - 1] : null
      const done =
        !route ||
        (unit.order.kind !== 'move' &&
          endPoint !== null &&
          near(unit.lat, unit.lng, endPoint, ARRIVED_EPS_KM))
      const safe =
        !camps.some(({ camp }) =>
          near(unit.lat, unit.lng, camp, CONVOY_THREAT_RADIUS_KM),
        ) &&
        !players.some((p) => near(unit.lat, unit.lng, [p.lat, p.lng], PIRACY_RANGE_KM))
      if (!done && !safe) return
      const hullFrac = unitHullFrac(unit)
      nextUnits = nextUnits.filter((u) => u.id !== unit.id)
      if (done) {
        setQuantum({
          ...q,
          materialized: false,
          hullFrac,
          location: q.destination,
          route: null,
          reversed: false,
          progress: 0,
          destination: null,
        })
        arrived.push(q.id)
      } else {
        setQuantum({
          ...q,
          materialized: false,
          hullFrac,
          // A convoy halted under fire never moved; a driving one did.
          progress:
            unit.order.kind === 'move' ? haulerProgress(unit, q, route!) : q.progress,
        })
      }
      return
    }

    // Materialization triggers only apply to convoys in transit.
    if (!q.route) return
    const route = routes[q.route]
    if (!route || route.path.length < 2) return
    const [lat, lng] = interpolateRoutePath(
      q.reversed ? [...route.path].reverse() : route.path,
      q.progress,
    )

    const escortedBy = escortedBands.get(q.id)
    let sortie: string | null = null
    for (const { bandId, camp } of camps) {
      if (!near(lat, lng, camp, CONVOY_THREAT_RADIUS_KM)) continue
      const hungry = tick - (bandRaids[bandId] ?? -Infinity) >= RAID_COOLDOWN_TICKS
      if (hungry || bandId === escortedBy) {
        sortie = bandId
        break
      }
    }
    const pirateable =
      sortie === null &&
      players.some((p) => near(lat, lng, [p.lat, p.lng], PIRACY_RANGE_KM))
    if (sortie === null && !pirateable) return

    nextUnits = [...nextUnits, materializeQuantum(q, route, sortie !== null)]
    setQuantum({ ...q, materialized: true })
    if (sortie !== null) {
      nextRaids = { ...nextRaids, [sortie]: tick }
      attacked.push({ quantumId: q.id, bandId: sortie })
    }
  })

  return {
    quanta: nextQuanta,
    units: nextUnits,
    bandRaids: nextRaids,
    attacked,
    arrived,
  }
}
