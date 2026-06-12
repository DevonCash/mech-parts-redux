/**
 * Strategic unit simulation — there is no tactical mode.
 *
 * Every unit on the map (the crawler, deployed mechs, hostile
 * garrisons) runs through this once per tick on the shared clock:
 * orders execute, weapons fire at will, damage propagates, pilots
 * stress and break. Combat is simply what happens where enemies meet.
 *
 * Future (noted, not built): comm-range limits on orders, mech fuel,
 * raider quanta as live units replacing the road-ambush dice.
 */
import { marsDistance } from '../constants'
import type { Rng } from '../rng'
import { TICK_DURATION_MS } from '../tick'
import {
  addStress,
  breakdown,
  generatePilot,
  hesitationChance,
  hitChance,
  standoffFactor,
  STRESS_ALLY_DESTROYED,
  STRESS_PER_COMBAT_TICK,
  STRESS_PER_DAMAGE,
  type Pilot,
} from '../pilots/models'
import { COMPONENTS, buildUnit, CRAWLER_UNIT_ID } from './catalog'
import { applyHit, unitDestroyed } from './damage'
import { advanceAlongOrder, stepToward, unitSpeedKmS } from './orders'
import type { CombatContract } from '../contracts/models'
import type { Unit } from './models'

const TICK_S = TICK_DURATION_MS / 1000

/** Player units auto-acquire (fire at will) within this range. */
export const AGGRO_RANGE_KM = 3

/** Hostiles hunt enemies within this radius of their spawn anchor. */
export const LEASH_KM = 6

const DEFAULT_PILOT: Pilot = {
  id: 'default',
  name: 'AUTOPILOT',
  fidelity: 0.5,
  judgment: 0.5,
  aggression: 0.5,
  stress: 0,
}

export interface StrategicEvent {
  kind: 'unit-destroyed' | 'combat-contact'
  message: string
  /** Set for unit-destroyed */
  unitId?: string
  side?: Unit['side']
}

export interface StrategicResult {
  units: Unit[]
  /** Player roster with combat stress applied */
  pilots: Pilot[]
  events: StrategicEvent[]
  /** Units that completed a dock-targeted move this tick */
  docked: { unitId: string; nodeId: string }[]
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

export function distanceKm(a: Unit, b: Unit): number {
  return marsDistance(a.lat, a.lng, b.lat, b.lng)
}

/**
 * Advance every unit one tick. Pure. `crawlerCanMove` lets the
 * pipeline gate the crawler on fuel without this stage knowing about
 * the company ledger.
 */
export function advanceUnits(
  inputUnits: Unit[],
  roster: Pilot[],
  rng: Rng,
  crawlerCanMove: boolean,
): StrategicResult {
  const events: StrategicEvent[] = []
  const docked: { unitId: string; nodeId: string }[] = []
  const units = new Map(inputUnits.map((u) => [u.id, u]))
  const rosterById = new Map(roster.map((p) => [p.id, p]))
  const anyHostiles = inputUnits.some((u) => u.side === 'hostile' && !unitDestroyed(u))
  const order = [...units.keys()].sort()

  const pilotOf = (unit: Unit): Pilot =>
    (unit.pilotId && rosterById.get(unit.pilotId)) || unit.npcPilot || DEFAULT_PILOT

  const updatePilot = (unit: Unit, pilot: Pilot) => {
    if (unit.pilotId && rosterById.has(unit.pilotId)) {
      rosterById.set(unit.pilotId, pilot)
    } else if (unit.npcPilot) {
      units.set(unit.id, { ...units.get(unit.id)!, npcPilot: pilot })
    }
  }

  for (const unitId of order) {
    let unit = units.get(unitId)!
    if (unitDestroyed(unit)) continue

    let pilot = pilotOf(unit)
    // Prolonged contact grinds everyone down a little.
    if (anyHostiles && unit.side === 'player') {
      pilot = addStress(pilot, STRESS_PER_COMBAT_TICK)
    }
    const failure = breakdown(pilot)

    // Cooldowns tick down regardless of orders.
    if (Object.keys(unit.cooldowns).length > 0) {
      const cooldowns: Record<string, number> = {}
      for (const [key, v] of Object.entries(unit.cooldowns)) {
        if (v > 1) cooldowns[key] = v - 1
      }
      unit = { ...unit, cooldowns }
    }

    // ── Target selection ──────────────────────────────────────────
    // Explicit attack order wins (berserkers ignore it and charge).
    let target: Unit | null = null
    if (failure !== 'berserk' && unit.order.kind === 'attack') {
      const t = units.get(unit.order.targetId)
      if (t && !unitDestroyed(t)) target = t
      else unit = { ...unit, order: { kind: 'hold' } }
    }
    if (!target) {
      // Hostiles hunt anything inside the leash radius of their spawn
      // anchor; player units auto-acquire within aggro range but do
      // not chase uncommanded — engaging beyond weapons range is the
      // commander's call (select-then-command).
      let nearest: Unit | null = null
      let nearestDist =
        failure === 'berserk' || unit.side === 'hostile' ? Infinity : AGGRO_RANGE_KM
      for (const other of units.values()) {
        if (other.side === unit.side || unitDestroyed(other)) continue
        if (
          unit.side === 'hostile' &&
          failure !== 'berserk' &&
          unit.spawn &&
          marsDistance(unit.spawn[0], unit.spawn[1], other.lat, other.lng) > LEASH_KM
        ) {
          continue // outside the patch this garrison defends
        }
        const d = distanceKm(unit, other)
        if (d < nearestDist) {
          nearest = other
          nearestDist = d
        }
      }
      target = nearest
    }

    // ── Movement ──────────────────────────────────────────────────
    const canMove =
      failure !== 'freeze' && (unit.id !== CRAWLER_UNIT_ID || crawlerCanMove)
    const speed = unitSpeedKmS(unit)

    if (canMove && unit.order.kind === 'move') {
      const step = advanceAlongOrder(unit.lat, unit.lng, unit.order, speed, TICK_S)
      const dockNodeId = unit.order.dockNodeId
      unit = { ...unit, lat: step.lat, lng: step.lng, order: step.order }
      if (step.arrived && dockNodeId) {
        docked.push({ unitId: unit.id, nodeId: dockNodeId })
      }
    } else if (canMove && target && (unit.order.kind === 'attack' || unit.side === 'hostile' || failure === 'berserk')) {
      // Chase to standoff range (explicit attack, hostile hunt, berserk).
      const range = bestWeaponRange(unit)
      if (range > 0 && distanceKm(unit, target) > range * standoffFactor(pilot)) {
        const [lat, lng] = stepToward(unit.lat, unit.lng, target.lat, target.lng, speed * TICK_S)
        unit = { ...unit, lat, lng }
      }
    } else if (
      canMove &&
      !target &&
      unit.side === 'hostile' &&
      unit.spawn &&
      unit.order.kind === 'hold' &&
      marsDistance(unit.lat, unit.lng, unit.spawn[0], unit.spawn[1]) > 0.5
    ) {
      // Unengaged hostiles drift back to their post.
      const [lat, lng] = stepToward(unit.lat, unit.lng, unit.spawn[0], unit.spawn[1], speed * TICK_S)
      unit = { ...unit, lat, lng }
    }

    // ── Fire everything ready and in range (weapons free) ─────────
    if (target) {
      const dist = distanceKm(unit, target)
      for (const w of livingWeapons(unit)) {
        const template = COMPONENTS[w.templateId]
        if ((unit.cooldowns[w.key] ?? 0) > 0) continue
        if (dist > (template.rangeKm ?? 0)) continue

        if (rng.next() < hesitationChance(pilot)) {
          unit = { ...unit, cooldowns: { ...unit.cooldowns, [w.key]: 5 } }
          continue
        }

        unit = {
          ...unit,
          cooldowns: {
            ...unit.cooldowns,
            [w.key]: Math.ceil((template.cooldownTicks ?? 10) / Math.max(0.25, w.hpFrac)),
          },
        }

        if (unit.side === 'player' || target.side === 'player') {
          events.push({ kind: 'combat-contact', message: 'WEAPONS FIRE' })
        }

        if (rng.next() > hitChance(pilot)) continue // miss

        const result = applyHit(target, template.damage ?? 0, rng)
        units.set(target.id, result.unit)
        const targetPilot = pilotOf(result.unit)
        updatePilot(result.unit, addStress(targetPilot, (template.damage ?? 0) * STRESS_PER_DAMAGE))
        target = units.get(target.id)!
        if (result.destroyed.length > 0 && unitDestroyed(target)) {
          events.push({
            kind: 'unit-destroyed',
            message: `${target.name} DESTROYED`,
            unitId: target.id,
            side: target.side,
          })
          // Watching an ally die is worse than taking a hit.
          for (const other of units.values()) {
            if (other.side === target.side && other.id !== target.id && !unitDestroyed(other)) {
              updatePilot(other, addStress(pilotOf(other), STRESS_ALLY_DESTROYED))
            }
          }
        }
      }
    }

    updatePilot(unit, pilot)
    units.set(unitId, unit)
  }

  return {
    units: [...units.values()],
    pilots: roster.map((p) => rosterById.get(p.id) ?? p),
    events,
    docked,
  }
}

// ── Hostile spawning & salvage ──────────────────────────────────────

const KM_PER_DEG = 59.2

/** Spawn a combat contract's garrison at its site (called on accept). */
export function spawnHostiles(
  contract: CombatContract,
  sitePos: [number, number],
  rng: Rng,
): Unit[] {
  const [lat, lng] = sitePos
  const offsetDeg = 1.25 / KM_PER_DEG
  const hostiles: Unit[] = []
  for (let i = 0; i < contract.hostiles; i++) {
    const chassisId = rng.next() < 0.7 ? 'raider-scout' : 'raider-trooper'
    const spawnAt: [number, number] = [
      lat + offsetDeg,
      lng + (i - (contract.hostiles - 1) / 2) * offsetDeg * 0.5,
    ]
    hostiles.push({
      ...buildUnit(
        `hostile-${contract.id}-${i}`,
        `RAIDER ${i + 1}`,
        chassisId,
        'hostile',
        spawnAt[0],
        spawnAt[1],
      ),
      npcPilot: generatePilot(`raider-pilot-${contract.id}-${i}`, rng, 'raider'),
      contractId: contract.id,
      spawn: spawnAt,
    })
  }
  return hostiles
}

/** Salvage from hostile wrecks: metal plus the odd precision part. */
export function rollSalvage(
  wrecks: Unit[],
  rng: Rng,
): { metal: number; precision: number } {
  let metal = 0
  let precision = 0
  for (const unit of wrecks) {
    if (!unitDestroyed(unit)) continue
    metal += rng.int(4, 8)
    if (rng.next() < 0.35) precision += 1
  }
  return { metal, precision }
}
