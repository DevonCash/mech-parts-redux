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
import { KM_PER_DEG, marsDistance } from '../constants'
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
  /** Who fired the killing shot — piracy attribution */
  attackerSide?: Unit['side']
}

/**
 * One predation rule for the whole sim: hostiles prey on everyone,
 * players auto-acquire hostiles only (attacking a neutral takes an
 * explicit order — that's piracy), neutrals never fight.
 */
function isEnemy(unit: Unit, other: Unit): boolean {
  if (unit.side === 'neutral') return false
  if (unit.side === 'hostile') return other.side !== 'hostile'
  return other.side === 'hostile'
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

/** Hostiles ignore enemies more than this far inside their own deadzone. */
const DRIFT_DEADZONE_KM = 0.5

function hasCooldowns(unit: Unit): boolean {
  for (const _ in unit.cooldowns) return true
  return false
}

/**
 * True when no interaction is possible this tick: every living hostile
 * is parked at its camp with cold guns and no enemy inside its leash,
 * and every living player unit is order-quiet with a steady pilot.
 * Under these conditions the full pass would do nothing but execute
 * player move orders — and consume no rng — so advanceUnits can take
 * a cheap movement-only path. Transit is almost always quiet; this is
 * what keeps 16 permanent units affordable at 1000× compression.
 */
function quietWorld(
  inputUnits: Unit[],
  roster: Pilot[],
  destroyedIds: Set<string>,
  livingPrey: Unit[],
): boolean {
  for (const u of inputUnits) {
    if (destroyedIds.has(u.id)) continue
    if (u.order.kind === 'attack' || hasCooldowns(u)) return false

    if (u.side !== 'hostile') {
      // Player and neutral units: order-quiet with a steady pilot.
      if (u.side === 'player' && u.pilotId) {
        const pilot = roster.find((p) => p.id === u.pilotId)
        if (pilot && breakdown(pilot) !== null) return false
      }
      continue
    }

    if (u.order.kind !== 'hold' || !u.spawn) return false
    // Settled at camp? (Otherwise it owes a drift-home step.)
    if (Math.abs(u.lat - u.spawn[0]) * KM_PER_DEG > DRIFT_DEADZONE_KM) return false
    if (marsDistance(u.lat, u.lng, u.spawn[0], u.spawn[1]) > DRIFT_DEADZONE_KM) return false
    // Any prey inside the leash wakes the band — players and convoys
    // alike; the war runs whether or not anyone is watching.
    const leash = u.leashKm ?? LEASH_KM
    for (const p of livingPrey) {
      if (Math.abs(u.spawn[0] - p.lat) * KM_PER_DEG > leash) continue
      if (marsDistance(u.spawn[0], u.spawn[1], p.lat, p.lng) <= leash) return false
    }
  }
  return true
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
  // Classify once per tick — unitDestroyed walks every component stack,
  // so the quiet check, the quiet fast path, and the full pass below
  // all share this single classification. Maintained on kills below.
  const destroyedIds = new Set<string>()
  // Side-partitioned target candidates, in inputUnits order so the
  // nearest-tie winner ("first seen at min distance") is unchanged.
  // Ids, not objects: the scan must see positions updated mid-tick.
  const livingPrey: Unit[] = []
  const hostileIds: string[] = []
  const preyIds: string[] = []
  for (const u of inputUnits) {
    if (unitDestroyed(u)) {
      destroyedIds.add(u.id)
      continue
    }
    if (u.side === 'hostile') {
      hostileIds.push(u.id)
    } else {
      livingPrey.push(u)
      preyIds.push(u.id)
    }
  }

  if (quietWorld(inputUnits, roster, destroyedIds, livingPrey)) {
    const docked: { unitId: string; nodeId: string }[] = []
    let units = inputUnits
    inputUnits.forEach((unit, i) => {
      if (unit.side === 'hostile' || unit.order.kind !== 'move') return
      if (unit.id === CRAWLER_UNIT_ID && !crawlerCanMove) return
      if (destroyedIds.has(unit.id)) return
      const step = advanceAlongOrder(unit.lat, unit.lng, unit.order, unitSpeedKmS(unit), TICK_S)
      const dockNodeId = unit.order.dockNodeId
      if (units === inputUnits) units = [...inputUnits]
      units[i] = { ...unit, lat: step.lat, lng: step.lng, order: step.order }
      if (step.arrived && dockNodeId) docked.push({ unitId: unit.id, nodeId: dockNodeId })
    })
    return { units, pilots: roster, events: [], docked }
  }
  const events: StrategicEvent[] = []
  const docked: { unitId: string; nodeId: string }[] = []
  const units = new Map(inputUnits.map((u) => [u.id, u]))
  const rosterById = new Map(roster.map((p) => [p.id, p]))
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
    if (destroyedIds.has(unitId)) continue

    let pilot = pilotOf(unit)
    const failure = breakdown(pilot)

    // Cooldowns tick down regardless of orders.
    if (hasCooldowns(unit)) {
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
      const leash = unit.leashKm ?? LEASH_KM
      // isEnemy depends only on sides, which never change mid-tick —
      // the side-partitioned lists ARE the isEnemy filter.
      const candidateIds =
        unit.side === 'hostile' ? preyIds : unit.side === 'player' ? hostileIds : []
      for (const otherId of candidateIds) {
        if (destroyedIds.has(otherId)) continue
        const other = units.get(otherId)!
        // Latitude lower-bounds the great-circle distance (1° ≈ 59.2 km)
        // — a cheap reject before the haversine for the common case of
        // far-apart units.
        // Hostiles never leave their patch, berserk or not — a band
        // that survives a fight must not pursue across the planet
        // (npc stress has no recovery path).
        if (unit.side === 'hostile' && unit.spawn) {
          if (Math.abs(unit.spawn[0] - other.lat) * KM_PER_DEG > leash) continue
          if (marsDistance(unit.spawn[0], unit.spawn[1], other.lat, other.lng) > leash) {
            continue // outside the patch this unit defends
          }
        }
        if (Math.abs(unit.lat - other.lat) * KM_PER_DEG > nearestDist) continue
        const d = distanceKm(unit, other)
        if (d < nearestDist) {
          nearest = other
          nearestDist = d
        }
      }
      target = nearest
    }

    // Live contact grinds a pilot down — engaged means having a target,
    // not sharing a planet with hostiles (bands camp permanently now).
    if (target && unit.side === 'player') {
      pilot = addStress(pilot, STRESS_PER_COMBAT_TICK)
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
          destroyedIds.add(target.id)
          events.push({
            kind: 'unit-destroyed',
            message: `${target.name} DESTROYED`,
            unitId: target.id,
            side: target.side,
            attackerSide: unit.side,
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
