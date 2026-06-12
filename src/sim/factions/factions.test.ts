import { describe, expect, it } from 'vitest'
import { seedNodes } from '../economy/seed-nodes'
import { generateSeedRoutes } from '../economy/seed-routes'
import { seedMarkets } from '../economy/seed-market'
import { generateBoard, type WorldStatic } from '../contracts/generate'
import { makeRng } from '../rng'
import { advanceTick } from '../session/pipeline'
import { createSession } from '../session/new-game'
import {
  adjustReputation,
  contractSlots,
  emptyReputation,
  nodeFaction,
  payModifier,
  REP_FAILED,
} from './models'

const world: WorldStatic = {
  nodes: Object.fromEntries(seedNodes.map((n) => [n.id, n])),
  routes: Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r])),
}

describe('faction model', () => {
  it('assigns every node a faction by type', () => {
    expect(nodeFaction(world.nodes['pavonis-terminal'])).toBe('preservationist')
    expect(nodeFaction(world.nodes['syrtis-depot'])).toBe('preservationist')
    expect(nodeFaction(world.nodes['olympus-mine'])).toBe('corporate')
    expect(nodeFaction(world.nodes['tharsis-refinery'])).toBe('corporate')
    expect(nodeFaction(world.nodes['valles-hub'])).toBe('settler')
  })

  it('reputation clamps to [-1, 1]', () => {
    let rep = emptyReputation()
    for (let i = 0; i < 50; i++) rep = adjustReputation(rep, 'settler', 0.1)
    expect(rep.settler).toBe(1)
    for (let i = 0; i < 100; i++) rep = adjustReputation(rep, 'settler', -0.1)
    expect(rep.settler).toBe(-1)
  })

  it('contract slots scale with the best relationship', () => {
    expect(contractSlots(emptyReputation())).toBe(2)
    expect(contractSlots({ ...emptyReputation(), corporate: 0.25 })).toBe(3)
    expect(contractSlots({ ...emptyReputation(), corporate: 0.6 })).toBe(4)
    // Hostility with everyone doesn't go below the floor.
    expect(
      contractSlots({ preservationist: -0.8, corporate: -0.5, settler: -0.9 }),
    ).toBe(2)
  })

  it('trusted companies get better pay on that faction\'s boards', () => {
    const trusted = { ...emptyReputation(), settler: 0.6 }
    expect(payModifier(trusted, 'settler')).toBeGreaterThan(1)
    expect(payModifier(trusted, 'corporate')).toBe(1)

    // Same seed, different rep → settler board pays more for trusted.
    const markets = seedMarkets(world.nodes, makeRng(1))
    const cold = generateBoard('valles-hub', world, makeRng(5), 0, markets, emptyReputation())
    const warm = generateBoard('valles-hub', world, makeRng(5), 0, markets, trusted)
    const coldTotal = cold.contracts.reduce((s, c) => s + c.pay, 0)
    const warmTotal = warm.contracts.reduce((s, c) => s + c.pay, 0)
    expect(warmTotal).toBeGreaterThan(coldTotal)
  })

  it('boards stamp contracts with the origin faction', () => {
    const board = generateBoard('valles-hub', world, makeRng(2), 0)
    for (const c of board.contracts) expect(c.faction).toBe('settler')
  })
})

describe('reputation through the pipeline', () => {
  it('a missed hard deadline costs standing with the issuer', () => {
    let s = createSession(1, world)
    s = {
      ...s,
      active: [
        {
          id: 'c-late',
          type: 'hauling' as const,
          origin: 'valles-hub',
          destination: 'chryse-landing',
          commodity: 'metal' as const,
          quantity: 5,
          pay: 1000,
          faction: 'corporate' as const,
          postedTick: 0,
          deadlineTick: s.tick + 1, // due immediately
          boardExpiryTick: 999999,
          status: 'active' as const,
        },
      ],
    }
    const before = s.reputation.corporate
    for (let i = 0; i < 5; i++) s = advanceTick(s, world).state
    expect(s.active).toHaveLength(0)
    expect(s.reputation.corporate).toBeCloseTo(before + REP_FAILED, 5)
  })
})
