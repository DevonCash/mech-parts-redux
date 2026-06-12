/**
 * Pilots — docs/combat/pilot-ai.md, lite tier.
 *
 * Two independent skill axes (execution fidelity, tactical judgment),
 * one personality trait wired into combat for now (aggression), and
 * stress that degrades fidelity first, judgment second, and triggers
 * trait-dependent breakdowns at critical levels. NPC pilots use the
 * same model — raiders are just low-skill, high-variance rolls.
 */
import { z } from 'zod'
import type { Rng } from '../rng'

export const PilotSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** How accurately orders are executed (aim, fire discipline), 0–1 */
  fidelity: z.number(),
  /** How well the unplanned is handled (targeting, hesitation), 0–1 */
  judgment: z.number(),
  /** Engagement ranges and breakdown behavior, 0–1 */
  aggression: z.number(),
  /** Accumulates in combat, recovers in downtime, 0–1 */
  stress: z.number(),
})
export type Pilot = z.infer<typeof PilotSchema>

// ── Stress → performance ────────────────────────────────────────────

/** Fidelity degrades from the first whiff of stress. */
export function effectiveFidelity(pilot: Pilot): number {
  return pilot.fidelity * (1 - 0.5 * Math.min(1, pilot.stress))
}

/** Judgment holds until stress passes 0.5, then slides. */
export function effectiveJudgment(pilot: Pilot): number {
  return pilot.judgment * (1 - Math.max(0, pilot.stress - 0.5) * 2 * 0.6)
}

/** Stress level at which trait-dependent breakdowns trigger. */
export const BREAKDOWN_STRESS = 0.85

export type Breakdown = 'berserk' | 'freeze' | null

/** At critical stress, aggression decides the failure mode. */
export function breakdown(pilot: Pilot): Breakdown {
  if (pilot.stress < BREAKDOWN_STRESS) return null
  if (pilot.aggression >= 0.6) return 'berserk'
  if (pilot.aggression <= 0.4) return 'freeze'
  return null // middle temperaments just crater via the eff curves
}

// ── Combat math hooks ───────────────────────────────────────────────

/** Per-shot hit probability from effective fidelity. */
export function hitChance(pilot: Pilot): number {
  return 0.6 + 0.3 * effectiveFidelity(pilot)
}

/** Stand-off fraction of weapon range — aggressive pilots close in. */
export function standoffFactor(pilot: Pilot): number {
  return 0.95 - 0.25 * pilot.aggression
}

/** Probability of hesitating (holding fire a beat) per fire chance. */
export function hesitationChance(pilot: Pilot): number {
  return 0.2 * (1 - effectiveJudgment(pilot))
}

// ── Stress accumulation / recovery ──────────────────────────────────

export const STRESS_PER_DAMAGE = 0.004
export const STRESS_ALLY_DESTROYED = 0.15
export const STRESS_PER_COMBAT_TICK = 0.00002
export const STRESS_RECOVERY_DOCKED = 0.04 // per econ interval
export const STRESS_RECOVERY_FIELD = 0.015

export function addStress(pilot: Pilot, amount: number): Pilot {
  return { ...pilot, stress: Math.min(1, pilot.stress + amount) }
}

export function recoverStress(pilot: Pilot, amount: number): Pilot {
  if (pilot.stress <= 0) return pilot
  return { ...pilot, stress: Math.max(0, pilot.stress - amount) }
}

// ── Skill growth ────────────────────────────────────────────────────

export const SKILL_CAP = 0.95

/** Surviving an engagement teaches. */
export function growSkills(pilot: Pilot): Pilot {
  return {
    ...pilot,
    fidelity: Math.min(SKILL_CAP, pilot.fidelity + 0.015),
    judgment: Math.min(SKILL_CAP, pilot.judgment + 0.02),
  }
}

// ── Generation ──────────────────────────────────────────────────────

const FIRST = ['ASH', 'VERA', 'KOJI', 'MARA', 'DUNE', 'SABLE', 'IVO', 'NIKA', 'REZ', 'TALIA', 'ORIN', 'PYX']
const LAST = ['VANCE', 'OKAFOR', 'LIND', 'ARDEN', 'SOLIS', 'KRAY', 'MERIT', 'HALE', 'QUINN', 'VOSS']

export function generatePilot(
  id: string,
  rng: Rng,
  grade: 'regular' | 'raider',
): Pilot {
  const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`
  if (grade === 'raider') {
    return {
      id,
      name,
      fidelity: rng.range(0.2, 0.45),
      judgment: rng.range(0.15, 0.4),
      aggression: rng.range(0.5, 0.95),
      stress: rng.range(0, 0.2),
    }
  }
  return {
    id,
    name,
    fidelity: rng.range(0.5, 0.7),
    judgment: rng.range(0.45, 0.65),
    aggression: rng.range(0.25, 0.7),
    stress: 0,
  }
}

/** The two pilots the company starts with. */
export function startingPilots(): Pilot[] {
  return [
    {
      id: 'pilot-1',
      name: 'JUNO REYES',
      fidelity: 0.65,
      judgment: 0.5,
      aggression: 0.6,
      stress: 0,
    },
    {
      id: 'pilot-2',
      name: 'CASSIUS WEBB',
      fidelity: 0.55,
      judgment: 0.65,
      aggression: 0.3,
      stress: 0,
    },
  ]
}
