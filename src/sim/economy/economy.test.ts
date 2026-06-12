import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { seedNodes } from './seed-nodes'
import { generateSeedRoutes } from './seed-routes'
import { seedMarkets } from './seed-market'
import { adjustPrices, econStep, produce, shortage } from './production'
import { moveQuanta, quantaDecisions, quantumPosition, seedQuanta } from './quanta'
import type { Quantum } from './models'

const nodes = Object.fromEntries(seedNodes.map((n) => [n.id, n]))
const routes = Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r]))

function freshMarkets() {
  return seedMarkets(nodes, makeRng(42))
}

describe('production', () => {
  it('extraction sites produce ore or ice', () => {
    const markets = freshMarkets()
    const mine = produce(nodes['olympus-mine'], markets['olympus-mine'])
    expect(mine.inventory.ore).toBeGreaterThan(markets['olympus-mine'].inventory.ore)
    const drill = produce(nodes['polar-ice'], markets['polar-ice'])
    expect(drill.inventory.ice).toBeGreaterThan(markets['polar-ice'].inventory.ice)
  })

  it('processing converts ore to metal, consuming the ore', () => {
    const markets = freshMarkets()
    const before = markets['tharsis-refinery']
    const after = produce(nodes['tharsis-refinery'], before)
    expect(after.inventory.metal).toBeGreaterThan(before.inventory.metal)
    expect(after.inventory.ore).toBeLessThan(before.inventory.ore)
  })

  it('runs fractionally when inputs are short instead of stalling', () => {
    const markets = freshMarkets()
    const market = {
      ...markets['tharsis-refinery'],
      inventory: { ...markets['tharsis-refinery'].inventory, ore: 3 }, // recipe wants 6
    }
    const after = produce(nodes['tharsis-refinery'], market)
    expect(after.inventory.ore).toBe(0)
    expect(after.inventory.metal).toBeGreaterThan(market.inventory.metal)
  })

  it('settlements consume legacy goods with no recipe producing them', () => {
    const markets = freshMarkets()
    const before = markets['valles-hub']
    const stocked = {
      ...before,
      inventory: { ...before.inventory, medical: 10, electronics: 10 },
    }
    const after = produce(nodes['valles-hub'], stocked)
    expect(after.inventory.medical).toBeLessThan(10)
    expect(after.inventory.electronics).toBeLessThan(10)
  })

  it('production respects the inventory cap', () => {
    const markets = freshMarkets()
    let market = markets['olympus-mine']
    for (let i = 0; i < 200; i++) market = produce(nodes['olympus-mine'], market)
    expect(market.inventory.ore).toBeLessThanOrEqual(market.baseInventory.ore * 3)
  })

  it('maintains the node fuel reserve', () => {
    const markets = freshMarkets()
    const drained = {
      ...markets['valles-hub'],
      inventory: { ...markets['valles-hub'].inventory, fuel: 0 },
    }
    let market = drained
    for (let i = 0; i < 30; i++) market = produce(nodes['valles-hub'], market)
    expect(market.inventory.fuel).toBe(market.baseInventory.fuel)
  })
})

describe('pricing', () => {
  it('scarcity raises prices, glut lowers them', () => {
    const markets = freshMarkets()
    const base = markets['valles-hub']

    const scarce = {
      ...base,
      inventory: { ...base.inventory, metal: 0 },
    }
    const scarcePriced = adjustPrices(scarce, makeRng(1))
    expect(scarcePriced.prices.metal).toBeGreaterThan(base.prices.metal * 0.99)

    const glutted = {
      ...base,
      inventory: { ...base.inventory, metal: base.baseInventory.metal * 5 },
    }
    const glutPriced = adjustPrices(glutted, makeRng(1))
    expect(glutPriced.prices.metal).toBeLessThan(base.prices.metal)
  })

  it('prices stay within clamp bounds under sustained pressure', () => {
    const markets = freshMarkets()
    let market = {
      ...markets['valles-hub'],
      inventory: { ...markets['valles-hub'].inventory, metal: 0 },
    }
    const rng = makeRng(5)
    for (let i = 0; i < 300; i++) market = adjustPrices(market, rng)
    expect(market.prices.metal).toBeLessThanOrEqual(market.basePrices.metal * 3)
  })

  it('shortage is 1 when empty, 0 when stocked', () => {
    const markets = freshMarkets()
    const market = markets['valles-hub']
    expect(shortage({ ...market, inventory: { ...market.inventory, metal: 0 } }, 'metal')).toBe(1)
    expect(
      shortage(
        { ...market, inventory: { ...market.inventory, metal: market.baseInventory.metal } },
        'metal',
      ),
    ).toBe(0)
  })

  it('econStep is deterministic', () => {
    const a = econStep(nodes, freshMarkets(), makeRng(9))
    const b = econStep(nodes, freshMarkets(), makeRng(9))
    expect(a).toEqual(b)
  })
})

describe('quanta', () => {
  it('seeding is deterministic and places haulers at nodes', () => {
    const a = seedQuanta(Object.keys(nodes), 10, makeRng(3))
    const b = seedQuanta(Object.keys(nodes), 10, makeRng(3))
    expect(a).toEqual(b)
    for (const q of a) {
      expect(q.location).not.toBeNull()
      expect(nodes[q.location!]).toBeDefined()
    }
  })

  it('haulers buy where cheap and physically remove the stock', () => {
    const markets = freshMarkets()
    const quanta = seedQuanta(Object.keys(nodes), 12, makeRng(3))
    const result = quantaDecisions(quanta, markets, routes, makeRng(7))

    const departed = result.quanta.filter((q) => q.route !== null && q.cargo)
    expect(departed.length).toBeGreaterThan(0)
    for (const q of departed) {
      const origin = quanta.find((x) => x.id === q.id)!.location!
      const before = markets[origin].inventory[q.cargo!.commodity]
      const after = result.markets[origin].inventory[q.cargo!.commodity]
      expect(after).toBeLessThan(before)
    }
  })

  it('movement advances and arrival sells the cargo into the market', () => {
    const markets = freshMarkets()
    let quanta = seedQuanta(Object.keys(nodes), 12, makeRng(3))
    let m = markets
    const rng = makeRng(7)

    const first = quantaDecisions(quanta, m, routes, rng)
    quanta = first.quanta
    m = first.markets
    const traveler = quanta.find((q) => q.route !== null && q.cargo)
    expect(traveler).toBeDefined()
    const destination = traveler!.destination!
    const commodity = traveler!.cargo!.commodity
    const destStockBefore = m[destination].inventory[commodity]

    // Run movement until that hauler docks, then one decision step to sell.
    for (let i = 0; i < 400000; i++) {
      quanta = moveQuanta(quanta, routes)
      const q = quanta.find((x) => x.id === traveler!.id)!
      if (q.location === destination) break
    }
    const arrived = quanta.find((x) => x.id === traveler!.id)!
    expect(arrived.location).toBe(destination)

    const second = quantaDecisions(quanta, m, routes, rng)
    expect(second.markets[destination].inventory[commodity]).toBeGreaterThan(destStockBefore)
  })

  it('quantumPosition interpolates along the route path', () => {
    const route = Object.values(routes)[0]
    const q: Quantum = {
      id: 'q-test',
      kind: 'hauler',
      location: null,
      route: route.id,
      reversed: false,
      progress: 0.5,
      destination: route.to,
      cargo: null,
      credits: 100,
    }
    const pos = quantumPosition(q, routes)
    expect(pos).not.toBeNull()
    expect(Number.isFinite(pos![0])).toBe(true)
    expect(quantumPosition({ ...q, route: null }, routes)).toBeNull()
  })
})
