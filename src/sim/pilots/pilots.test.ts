import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { startingForces } from '../combat/catalog'
import { advanceEngagement, createEngagement } from '../combat/engagement'
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

describe('pilots in engagements', () => {
  it('engagements carry pilot state for both sides', () => {
    const eng = createEngagement(
      'c1',
      'site',
      [0, 0],
      startingForces(),
      startingPilots(),
      2,
      makeRng(3),
      0,
    )
    const playerUnits = eng.units.filter((u) => u.side === 'player')
    const hostileUnits = eng.units.filter((u) => u.side === 'hostile')
    for (const u of playerUnits) expect(eng.pilots[u.id]).toBeDefined()
    for (const u of hostileUnits) expect(eng.pilots[u.id]).toBeDefined()
  })

  it('combat accumulates stress on pilots taking fire', () => {
    let eng = createEngagement(
      'c1',
      'site',
      [0, 0],
      startingForces(),
      startingPilots(),
      3,
      makeRng(3),
      0,
    )
    const rng = makeRng(42)
    const before = Object.values(eng.pilots).reduce((s, p) => s + p.stress, 0)
    for (let i = 0; i < 3000 && eng.status === 'active'; i++) {
      eng = advanceEngagement(eng, rng).engagement
    }
    const after = Object.values(eng.pilots).reduce((s, p) => s + p.stress, 0)
    expect(after).toBeGreaterThan(before)
  })

  it('engagements with pilots remain deterministic', () => {
    const run = () => {
      let eng = createEngagement(
        'c1',
        'site',
        [0, 0],
        startingForces(),
        startingPilots(),
        2,
        makeRng(7),
        0,
      )
      const rng = makeRng(99)
      for (let i = 0; i < 4000 && eng.status === 'active'; i++) {
        eng = advanceEngagement(eng, rng).engagement
      }
      return eng
    }
    expect(run()).toEqual(run())
  })

  it('better pilots win more: veteran lance beats raider-grade lance', () => {
    // Same mechs both runs; only pilot quality differs.
    const veterans = startingPilots().map((p) => ({ ...p, fidelity: 0.9, judgment: 0.9 }))
    const rookies = startingPilots().map((p) => ({ ...p, fidelity: 0.15, judgment: 0.1 }))

    const winRate = (pilots: typeof veterans) => {
      let wins = 0
      for (let seed = 0; seed < 15; seed++) {
        let eng = createEngagement(
          'c1',
          'site',
          [0, 0],
          startingForces(),
          pilots,
          3,
          makeRng(seed),
          0,
        )
        const rng = makeRng(seed + 500)
        for (let i = 0; i < 60000 && eng.status === 'active'; i++) {
          eng = advanceEngagement(eng, rng).engagement
        }
        if (eng.status === 'won') wins++
      }
      return wins
    }

    expect(winRate(veterans)).toBeGreaterThan(winRate(rookies))
  }, 60000)
})
