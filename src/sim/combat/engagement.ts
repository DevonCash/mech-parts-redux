/**
 * Real-time engagement simulation — runs inside the session pipeline,
 * on the same clock as everything else (no separate tactical mode).
 *
 * Per tick each living unit: picks a target (explicit attack order, or
 * auto-acquire nearest in aggro range), closes to weapon range, and
 * fires whatever is off cooldown. Pilot AI is intentionally minimal —
 * skills, stress, and zone orders are a later phase.
 */
import { marsDistance } from '../constants'
import type { Rng } from '../rng'
import { TICK_DURATION_MS } from '../tick'
import { CHASSIS, COMPONENTS, buildUnit } from './catalog'
import { applyHit, unitDestroyed } from './damage'
import type { Engagement, Unit } from './models'

const TICK_S = TICK_DURATION_MS / 1000

/** Auto-acquire range when a unit has no explicit target. */
const AGGRO_RANGE_KM = 3

/** Base hit probability per shot (no pilot skills yet). */
const HIT_CHANCE = 0.85

/** Stand-off fraction of weapon range when closing on a target. */
const STANDOFF = 0.85

/** Mars degrees latitude per km (2πR/360 ≈ 59.2 km per degree). */
const KM_PER_DEG = 59.2

export interface EngagementEvent {
  kind: 'unit-destroyed' | 'engagement-won' | 'engagement-lost'
  message: string
}

export function distanceKm(a: Unit, b: Unit): number {
  return marsDistance(a.lat, a.lng, b.lat, b.lng)
}

function livingWeapons(unit: Unit): { key: string; templateId: string; hpFrac: number }[] {
  const result: { key: string; templateId: string; hpFrac: number }[] = []
  for (const [locationId, stack] of Object.entries(unit.components)) {
    stack.forEach((c, i) => {
      if (c.hp > 0 && COMPONENTS[c.templateId].type === 'weapon') {
        result.push({
          key: `${locationId}:${i}`,
          templateId: c.templateId,
          hpFrac: c.hp / c.maxHP,
        })
      }
    })
  }
  return result
}

function bestWeaponRange(unit: Unit): number {
  let best = 0
  for (const w of livingWeapons(unit)) {
    best = Math.max(best, COMPONENTS[w.templateId].rangeKm ?? 0)
  }
  return best
}

/** Top speed from the unit's own locomotion stack, scaled by damage. */
export function unitSpeedKmS(unit: Unit): number {
  for (const stack of Object.values(unit.components)) {
    for (const c of stack) {
      const template = COMPONENTS[c.templateId]
      if (template.type === 'locomotion' && c.hp > 0) {
        return (template.topSpeedKmS ?? 0) * (c.hp / c.maxHP)
      }
    }
  }
  return 0
}

function stepToward(unit: Unit, lat: number, lng: number, maxKm: number): Unit {
  const dist = marsDistance(unit.lat, unit.lng, lat, lng)
  if (dist <= 0.001 || maxKm <= 0) return unit
  const frac = Math.min(1, maxKm / dist)
  return {
    ...unit,
    lat: unit.lat + (lat - unit.lat) * frac,
    lng: unit.lng + (lng - unit.lng) * frac,
  }
}

/**
 * Advance one tick. Pure: returns a new engagement plus combat events.
 */
export function advanceEngagement(
  engagement: Engagement,
  rng: Rng,
): { engagement: Engagement; events: EngagementEvent[] } {
  if (engagement.status !== 'active') return { engagement, events: [] }

  const events: EngagementEvent[] = []
  const units = new Map(engagement.units.map((u) => [u.id, u]))
  const order = [...units.keys()].sort()

  for (const unitId of order) {
    let unit = units.get(unitId)!
    if (unitDestroyed(unit)) continue

    // Cooldowns tick down regardless of orders.
    if (Object.keys(unit.cooldowns).length > 0) {
      const cooldowns: Record<string, number> = {}
      for (const [key, v] of Object.entries(unit.cooldowns)) {
        if (v > 1) cooldowns[key] = v - 1
      }
      unit = { ...unit, cooldowns }
    }

    // Target: explicit attack order, else nearest living enemy in range.
    let target: Unit | null = null
    if (unit.order.kind === 'attack') {
      const t = units.get(unit.order.targetId)
      if (t && !unitDestroyed(t)) target = t
      else unit = { ...unit, order: { kind: 'hold' } }
    }
    if (!target) {
      // Hostiles hunt the nearest enemy at any range (no stalemates);
      // player units auto-acquire only within aggro range — beyond
      // that, engaging is the commander's call.
      let nearest: Unit | null = null
      let nearestDist = unit.side === 'hostile' ? Infinity : AGGRO_RANGE_KM
      for (const other of units.values()) {
        if (other.side === unit.side || unitDestroyed(other)) continue
        const d = distanceKm(unit, other)
        if (d < nearestDist) {
          nearest = other
          nearestDist = d
        }
      }
      target = nearest
    }

    // Movement.
    const stepKm = unitSpeedKmS(unit) * TICK_S
    if (unit.order.kind === 'move') {
      const arrived = marsDistance(unit.lat, unit.lng, unit.order.lat, unit.order.lng) < 0.05
      unit = arrived
        ? { ...unit, order: { kind: 'hold' } }
        : stepToward(unit, unit.order.lat, unit.order.lng, stepKm)
    } else if (target) {
      const range = bestWeaponRange(unit)
      if (range > 0 && distanceKm(unit, target) > range * STANDOFF) {
        unit = stepToward(unit, target.lat, target.lng, stepKm)
      }
    }

    // Fire everything ready and in range. Damaged weapons cycle slower
    // (cooldown scales inversely with hp fraction — doc: rate of fire
    // scales with currentHP/maxHP).
    if (target) {
      const dist = distanceKm(unit, target)
      for (const w of livingWeapons(unit)) {
        const template = COMPONENTS[w.templateId]
        if ((unit.cooldowns[w.key] ?? 0) > 0) continue
        if (dist > (template.rangeKm ?? 0)) continue

        unit = {
          ...unit,
          cooldowns: {
            ...unit.cooldowns,
            [w.key]: Math.ceil((template.cooldownTicks ?? 10) / Math.max(0.25, w.hpFrac)),
          },
        }

        if (rng.next() > HIT_CHANCE) continue // miss

        const result = applyHit(target, template.damage ?? 0, rng)
        units.set(target.id, result.unit)
        target = result.unit
        if (result.destroyed.length > 0 && unitDestroyed(result.unit)) {
          events.push({
            kind: 'unit-destroyed',
            message: `${result.unit.name} DESTROYED`,
          })
        }
      }
    }

    units.set(unitId, unit)
  }

  // End check.
  const living = [...units.values()].filter((u) => !unitDestroyed(u))
  const playersAlive = living.some((u) => u.side === 'player')
  const hostilesAlive = living.some((u) => u.side === 'hostile')

  let status: Engagement['status'] = 'active'
  if (!hostilesAlive) {
    status = 'won'
    events.push({ kind: 'engagement-won', message: 'SITE CLEARED — HOSTILES ELIMINATED' })
  } else if (!playersAlive) {
    status = 'lost'
    events.push({ kind: 'engagement-lost', message: 'LANCE DOWN — ENGAGEMENT LOST' })
  }

  return {
    engagement: { ...engagement, units: [...units.values()], status },
    events,
  }
}

/**
 * Spawn an engagement at a contract site: player lance south of the
 * node, hostiles north, ~3 km apart.
 */
export function createEngagement(
  contractId: string,
  siteNodeId: string,
  sitePos: [number, number],
  playerForces: Unit[],
  hostileCount: number,
  rng: Rng,
  currentTick: number,
): Engagement {
  const [lat, lng] = sitePos
  const offsetDeg = 1.25 / KM_PER_DEG

  const players = playerForces.map((u, i) => ({
    ...u,
    lat: lat - offsetDeg,
    lng: lng + (i - (playerForces.length - 1) / 2) * offsetDeg * 0.5,
    order: { kind: 'hold' } as Unit['order'],
    cooldowns: {},
  }))

  const hostiles: Unit[] = []
  for (let i = 0; i < hostileCount; i++) {
    const chassisId = rng.next() < 0.7 ? 'raider-scout' : 'raider-trooper'
    hostiles.push(
      buildUnit(
        `hostile-${contractId}-${i}`,
        `RAIDER ${i + 1}`,
        chassisId,
        'hostile',
        lat + offsetDeg,
        lng + (i - (hostileCount - 1) / 2) * offsetDeg * 0.5,
      ),
    )
  }

  return {
    id: `eng-${contractId}`,
    contractId,
    siteNodeId,
    units: [...players, ...hostiles],
    status: 'active',
    startedTick: currentTick,
  }
}

/** Salvage from hostile wrecks: metal plus the odd precision part. */
export function rollSalvage(
  engagement: Engagement,
  rng: Rng,
): { metal: number; precision: number } {
  let metal = 0
  let precision = 0
  for (const unit of engagement.units) {
    if (unit.side !== 'hostile' || !unitDestroyed(unit)) continue
    metal += rng.int(4, 8)
    if (rng.next() < 0.35) precision += 1
  }
  return { metal, precision }
}

/** Surviving player units, ready to be written back to the roster. */
export function survivingPlayerUnits(engagement: Engagement): Unit[] {
  return engagement.units.filter((u) => u.side === 'player' && !unitDestroyed(u))
}

export function chassisLabel(unit: Unit): string {
  return CHASSIS[unit.chassisId]?.name ?? unit.chassisId
}
