/**
 * Pilot hiring — settlements have people looking for cockpit work.
 *
 * Each node keeps a small seeded pool of candidates that refreshes on
 * the same cadence as contract boards. Signing bonuses scale with
 * skill: green hands are cheap, veterans cost real money.
 */
import { z } from 'zod'
import {
  HIRE_COST_BASE,
  HIRE_COST_PER_SKILL,
  RECRUIT_REFRESH_TICKS,
} from '../balance'
import type { Rng } from '../rng'
import type { GameNode } from '../economy/models'
import { generatePilot, PilotSchema, type Pilot } from './models'

export const HirePoolSchema = z.object({
  generatedTick: z.number(),
  pilots: z.array(PilotSchema),
})
export type HirePool = z.infer<typeof HirePoolSchema>

export type HirePools = Record<string, HirePool>

/** Signing bonus for a candidate. */
export function hireCost(pilot: Pilot): number {
  const skill = (pilot.fidelity + pilot.judgment) / 2
  return Math.round(HIRE_COST_BASE + skill * HIRE_COST_PER_SKILL)
}

/** Candidates available at a node: settlements teem, outposts trickle. */
export function generateHirePool(
  node: GameNode,
  rng: Rng,
  currentTick: number,
): HirePool {
  const count =
    node.type === 'settlement' ? rng.int(1, 3) : node.type === 'terminal' ? rng.int(0, 2) : rng.int(0, 1)
  const pilots: Pilot[] = []
  for (let i = 0; i < count; i++) {
    pilots.push(generatePilot(`hire-${node.id}-${currentTick}-${i}`, rng, 'regular'))
  }
  return { generatedTick: currentTick, pilots }
}

export function hirePoolStale(pool: HirePool | undefined, currentTick: number): boolean {
  if (!pool) return true
  return currentTick - pool.generatedTick >= RECRUIT_REFRESH_TICKS
}
