import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { startingGarage } from '../combat/catalog'
import { unitDestroyed } from '../combat/damage'
import { advanceUnits, spawnHostiles } from '../combat/strategic'
import type { CombatContract } from '../contracts/models'
import type { Unit } from '../combat/models'
import {
  breakdown,
  effectiveFidelity,
  effectiveJudgment,
  generatePilot,
  growSkills,
  hitChance,
  recoverStress,
  standoffFactor,
  startingPilots,
  type Pilot,
} from './models'

function combatContract(hostiles: number): CombatContract {
  return {
    id: 'c1',
    type: 'combat',
    origin: 'a',
    destination: 'site',
    hostiles,
    pay: 5000,
    faction: 'settler',
    postedTick: 0,
    deadlineTick: null,
    boardExpiryTick: 999999,
    status: 'active',
  }
}

function battlefield(hostiles: number, seed: number, pilots: Pilot[]): Unit[] {
  const garrison = spawnHostiles(combatContract(hostiles), [0, 0], makeRng(seed))
  const lance = startingGarage().map((u, i) => ({ ...u, lat: -0.04, lng: i * 0.01 }))
  return [...lance, ...garrison]
}

function pilot(overrides: Partial<Pilot> = {}): Pilot {
  return {
    id: 'p1',
    name: 'TEST',
    fidelity: 0.6,
    judgment: 0.6,
    aggression: 0.5,
    stress: 0,
    ...overrides,
  }
}

describe('pilot math', () => {
  it('stress degrades fidelity first, judgment after 0.5', () => {
    const calm = pilot()
    const tense = pilot({ stress: 0.4 })
    const fraying = pilot({ stress: 0.8 })

    expect(effectiveFidelity(tense)).toBeLessThan(effectiveFidelity(calm))
    expect(effectiveJudgment(tense)).toBeCloseTo(effectiveJudgment(calm), 5)
    expect(effectiveJudgment(fraying)).toBeLessThan(effectiveJudgment(calm))
  })

  it('hit chance rises with fidelity and falls under stress', () => {
    expect(hitChance(pilot({ fidelity: 0.9 }))).toBeGreaterThan(
      hitChance(pilot({ fidelity: 0.3 })),
    )
    expect(hitChance(pilot({ stress: 0.9 }))).toBeLessThan(hitChance(pilot()))
  })

  it('aggressive pilots close to shorter standoff ranges', () => {
    expect(standoffFactor(pilot({ aggression: 0.9 }))).toBeLessThan(
      standoffFactor(pilot({ aggression: 0.1 })),
    )
  })

  it('breakdowns are trait-dependent at critical stress', () => {
    expect(breakdown(pilot({ stress: 0.9, aggression: 0.8 }))).toBe('berserk')
    expect(breakdown(pilot({ stress: 0.9, aggression: 0.2 }))).toBe('freeze')
    expect(breakdown(pilot({ stress: 0.9, aggression: 0.5 }))).toBeNull()
    expect(breakdown(pilot({ stress: 0.5, aggression: 0.8 }))).toBeNull()
  })

  it('skills grow toward the cap, stress recovers toward zero', () => {
    const grown = growSkills(pilot({ fidelity: 0.94, judgment: 0.5 }))
    expect(grown.fidelity).toBeLessThanOrEqual(0.95)
    expect(grown.judgment).toBeGreaterThan(0.5)

    const rested = recoverStress(pilot({ stress: 0.03 }), 0.05)
    expect(rested.stress).toBe(0)
  })

  it('raider pilots roll worse than regulars', () => {
    const rng = makeRng(1)
    for (let i = 0; i < 20; i++) {
      const raider = generatePilot(`r${i}`, rng, 'raider')
      expect(raider.fidelity).toBeLessThan(0.5)
      expect(raider.aggression).toBeGreaterThanOrEqual(0.5)
    }
  })
})

describe('pilots in strategic combat', () => {
  it('hostile units carry their own pilots; player units use the roster', () => {
    const pilots = startingPilots()
    const units = battlefield(2, 3, pilots)
    for (const u of units) {
      if (u.side === 'hostile') expect(u.npcPilot).toBeDefined()
      else expect(u.pilotId).toBeDefined()
    }
  })

  it('combat accumulates stress on the roster', () => {
    const pilots = startingPilots()
    let units = battlefield(3, 3, pilots)
    let roster = pilots
    const rng = makeRng(42)
    const before = roster.reduce((s, p) => s + p.stress, 0)
    for (let i = 0; i < 3000; i++) {
      const r = advanceUnits(units, roster, rng, true)
      units = r.units
      roster = r.pilots
      if (!units.some((u) => u.side === 'hostile' && !unitDestroyed(u))) break
    }
    const after = roster.reduce((s, p) => s + p.stress, 0)
    expect(after).toBeGreaterThan(before)
  })

  it('strategic combat with pilots remains deterministic', () => {
    const go = () => {
      let units = battlefield(2, 7, startingPilots())
      let roster = startingPilots()
      const rng = makeRng(99)
      for (let i = 0; i < 4000; i++) {
        const r = advanceUnits(units, roster, rng, true)
        units = r.units
        roster = r.pilots
      }
      return { units, roster }
    }
    expect(go()).toEqual(go())
  })

  it('better pilots win more: veteran lance beats rookie lance', () => {
    const fight = (roster: Pilot[], seed: number) => {
      let units = battlefield(3, seed, roster)
      let pilots = roster
      const rng = makeRng(seed + 500)
      for (let i = 0; i < 60000; i++) {
        const r = advanceUnits(units, pilots, rng, true)
        units = r.units
        pilots = r.pilots
        const hostiles = units.some((u) => u.side === 'hostile' && !unitDestroyed(u))
        const players = units.some((u) => u.side === 'player' && !unitDestroyed(u))
        if (!hostiles) return true
        if (!players) return false
      }
      return false
    }

    const winRate = (mod: (p: Pilot) => Pilot) => {
      let wins = 0
      for (let seed = 0; seed < 15; seed++) {
        if (fight(startingPilots().map(mod), seed)) wins++
      }
      return wins
    }

    const veterans = winRate((p) => ({ ...p, fidelity: 0.9, judgment: 0.9 }))
    const rookies = winRate((p) => ({ ...p, fidelity: 0.15, judgment: 0.1 }))
    expect(veterans).toBeGreaterThan(rookies)
  }, 60000)
})
