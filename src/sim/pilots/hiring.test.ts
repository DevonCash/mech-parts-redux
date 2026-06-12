import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { seedNodes } from '../economy/seed-nodes'
import { RECRUIT_REFRESH_TICKS, MECH_PRICES } from '../balance'
import { generateHirePool, hireCost, hirePoolStale } from './hiring'
import { generateMechLot, mechLotStale } from '../combat/sales'
import type { Pilot } from './models'

const byId = Object.fromEntries(seedNodes.map((n) => [n.id, n]))

function pilot(fidelity: number, judgment: number): Pilot {
  return { id: 'p', name: 'P', fidelity, judgment, aggression: 0.5, stress: 0 }
}

describe('hiring', () => {
  it('pool generation is deterministic', () => {
    const a = generateHirePool(byId['valles-hub'], makeRng(9), 100)
    const b = generateHirePool(byId['valles-hub'], makeRng(9), 100)
    expect(a).toEqual(b)
  })

  it('settlements always have at least one candidate; outposts may not', () => {
    for (let seed = 0; seed < 10; seed++) {
      const pool = generateHirePool(byId['valles-hub'], makeRng(seed), 0)
      expect(pool.pilots.length).toBeGreaterThanOrEqual(1)
      expect(pool.pilots.length).toBeLessThanOrEqual(3)
    }
    const counts = new Set<number>()
    for (let seed = 0; seed < 20; seed++) {
      counts.add(generateHirePool(byId['olympus-mine'], makeRng(seed), 0).pilots.length)
    }
    expect(Math.max(...counts)).toBeLessThanOrEqual(1)
  })

  it('signing bonus scales with skill', () => {
    expect(hireCost(pilot(0.8, 0.8))).toBeGreaterThan(hireCost(pilot(0.4, 0.4)))
    expect(hireCost(pilot(0.5, 0.5))).toBeGreaterThan(0)
  })

  it('pools go stale on the refresh cadence', () => {
    const pool = generateHirePool(byId['valles-hub'], makeRng(1), 1000)
    expect(hirePoolStale(undefined, 0)).toBe(true)
    expect(hirePoolStale(pool, 1000)).toBe(false)
    expect(hirePoolStale(pool, 1000 + RECRUIT_REFRESH_TICKS)).toBe(true)
  })
})

describe('mech dealer', () => {
  it('lot generation is deterministic with bounded prices', () => {
    const a = generateMechLot(byId['valles-hub'], makeRng(3), 0)
    const b = generateMechLot(byId['valles-hub'], makeRng(3), 0)
    expect(a).toEqual(b)
    for (const offer of a.offers) {
      const base = MECH_PRICES[offer.chassisId]
      expect(offer.price).toBeGreaterThanOrEqual(Math.floor(base * 0.9))
      expect(offer.price).toBeLessThanOrEqual(Math.ceil(base * 1.15))
    }
  })

  it('only settlements and terminals sell mechs', () => {
    for (let seed = 0; seed < 10; seed++) {
      expect(generateMechLot(byId['olympus-mine'], makeRng(seed), 0).offers).toHaveLength(0)
      expect(generateMechLot(byId['syrtis-depot'], makeRng(seed), 0).offers).toHaveLength(0)
    }
    let any = 0
    for (let seed = 0; seed < 20; seed++) {
      any += generateMechLot(byId['valles-hub'], makeRng(seed), 0).offers.length
    }
    expect(any).toBeGreaterThan(0)
  })

  it('lots go stale on the refresh cadence', () => {
    const lot = generateMechLot(byId['valles-hub'], makeRng(1), 500)
    expect(mechLotStale(undefined, 0)).toBe(true)
    expect(mechLotStale(lot, 500)).toBe(false)
    expect(mechLotStale(lot, 500 + RECRUIT_REFRESH_TICKS)).toBe(true)
  })
})
