/**
 * Hit resolution — docs/combat/mechs.md steps 4–9, simplified to a
 * single hit weight per location (no facing profiles this phase).
 *
 * Roll a location by weight → hit the outermost component → apply
 * hardness → propagate overflow inward → overflow a stripped location
 * to its parent. All randomness via the seeded rng.
 */
import type { Rng } from '../rng'
import { CHASSIS, COMPONENTS } from './catalog'
import type { Unit } from './models'

/** A location is destroyed when every component in its stack is at 0. */
export function locationDestroyed(unit: Unit, locationId: string): boolean {
  const stack = unit.components[locationId]
  if (!stack || stack.length === 0) return true
  return stack.every((c) => c.hp <= 0)
}

/** Unit is out of the fight when every cockpit is destroyed. */
export function unitDestroyed(unit: Unit): boolean {
  let cockpits = 0
  let dead = 0
  for (const stack of Object.values(unit.components)) {
    for (const c of stack) {
      if (COMPONENTS[c.templateId].type === 'cockpit') {
        cockpits++
        if (c.hp <= 0) dead++
      }
    }
  }
  return cockpits > 0 && cockpits === dead
}

/** Performance fraction of the first living component of a type. */
export function componentFraction(unit: Unit, type: string): number {
  for (const stack of Object.values(unit.components)) {
    for (const c of stack) {
      if (COMPONENTS[c.templateId].type === type && c.maxHP > 0) {
        return Math.max(0, c.hp) / c.maxHP
      }
    }
  }
  return 0
}

export interface HitResult {
  unit: Unit
  locationId: string
  /** Component names destroyed by this hit */
  destroyed: string[]
  deflected: boolean
}

/**
 * Apply one hit to a unit. Returns a new unit (inputs not mutated).
 */
export function applyHit(unit: Unit, damage: number, rng: Rng): HitResult {
  const chassis = CHASSIS[unit.chassisId]

  // Roll location among non-stripped locations by hit weight.
  const candidates = chassis.locations.filter((l) => !locationDestroyed(unit, l.id))
  if (candidates.length === 0) {
    return { unit, locationId: 'none', destroyed: [], deflected: true }
  }
  const totalWeight = candidates.reduce((sum, l) => sum + l.hitWeight, 0)
  let roll = rng.next() * totalWeight
  let location = candidates[candidates.length - 1]
  for (const l of candidates) {
    roll -= l.hitWeight
    if (roll <= 0) {
      location = l
      break
    }
  }

  const components = { ...unit.components }
  const destroyed: string[] = []
  let remaining = damage
  let locationId: string = location.id
  let deflected = true

  // Walk inward through the stack; overflow to parent locations.
  while (remaining > 0 && locationId) {
    const stack = components[locationId]
    if (!stack || stack.every((c) => c.hp <= 0)) {
      const parent = chassis.locations.find((l) => l.id === locationId)?.parent
      if (!parent) break
      locationId = parent
      continue
    }

    const newStack = [...stack]
    for (let i = 0; i < newStack.length && remaining > 0; i++) {
      const c = newStack[i]
      if (c.hp <= 0) continue
      const template = COMPONENTS[c.templateId]
      const effective = Math.max(0, remaining - template.hardness)
      if (effective <= 0) {
        remaining = 0 // deflected by hardness
        break
      }
      deflected = false
      const absorbed = Math.min(c.hp, effective)
      newStack[i] = { ...c, hp: c.hp - absorbed }
      if (newStack[i].hp <= 0) destroyed.push(template.name)
      remaining = effective - absorbed
    }
    components[locationId] = newStack
  }

  return {
    unit: { ...unit, components },
    locationId: location.id,
    destroyed,
    deflected,
  }
}
