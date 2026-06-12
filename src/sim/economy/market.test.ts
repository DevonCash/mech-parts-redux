import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import {
  addCargo,
  cargoUsed,
  driftMarket,
  executeTrade,
  quote,
  type CompanyState,
} from './market'
import { seedMarket } from './seed-market'
import { createNode, type NodeMarket } from './models'
import { SELL_MARGIN } from '../balance'

const node = createNode({
  id: 'test-settlement',
  name: 'Test Settlement',
  position: [0, 0],
  type: 'settlement',
})

function freshMarket(): NodeMarket {
  return seedMarket(node, makeRng(42))
}

function freshCompany(): CompanyState {
  return {
    credits: 1000,
    fuel: 500,
    fuelCapacity: 1000,
    cargo: {},
    cargoCapacity: 60,
  }
}

describe('quote', () => {
  it('sell price is buy price × SELL_MARGIN', () => {
    const market = freshMarket()
    const q = quote(market, 'ore')
    expect(q.sell).toBeCloseTo(q.buy * SELL_MARGIN, 1)
  })
})

describe('executeTrade — buy', () => {
  it('moves credits and cargo', () => {
    const market = freshMarket()
    const company = freshCompany()
    const q = quote(market, 'food')

    const result = executeTrade(company, market, 'food', 5, 'buy')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.credits).toBeCloseTo(1000 - q.buy * 5, 1)
    expect(result.company.cargo.food).toBe(5)
    expect(result.market.inventory.food).toBe(market.inventory.food - 5)
  })

  it('rejects overspend', () => {
    const market = freshMarket()
    const company = { ...freshCompany(), credits: 1 }
    const result = executeTrade(company, market, 'food', 5, 'buy')
    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT CREDITS' })
  })

  it('rejects buying past cargo capacity', () => {
    const market = freshMarket()
    const company = { ...freshCompany(), credits: 100000, cargo: { ore: 58 } }
    const result = executeTrade(company, market, 'food', 5, 'buy')
    expect(result).toEqual({ ok: false, reason: 'CARGO FULL' })
  })

  it('rejects buying more than market stock', () => {
    const market = freshMarket()
    market.inventory.precision = 2
    const company = { ...freshCompany(), credits: 100000 }
    const result = executeTrade(company, market, 'precision', 3, 'buy')
    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT STOCK' })
  })

  it('rejects zero and negative quantities', () => {
    const market = freshMarket()
    const company = freshCompany()
    expect(executeTrade(company, market, 'food', 0, 'buy').ok).toBe(false)
    expect(executeTrade(company, market, 'food', -5, 'sell').ok).toBe(false)
  })
})

describe('executeTrade — sell', () => {
  it('moves credits and cargo at the sell margin', () => {
    const market = freshMarket()
    const company = { ...freshCompany(), cargo: { metal: 10 } }
    const q = quote(market, 'metal')

    const result = executeTrade(company, market, 'metal', 10, 'sell')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.credits).toBeCloseTo(1000 + q.sell * 10, 1)
    expect(result.company.cargo.metal).toBeUndefined()
    expect(result.market.inventory.metal).toBe(market.inventory.metal + 10)
  })

  it('rejects selling cargo you do not hold', () => {
    const market = freshMarket()
    const company = freshCompany()
    const result = executeTrade(company, market, 'metal', 1, 'sell')
    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT CARGO' })
  })
})

describe('cargo helpers', () => {
  it('cargoUsed sums all commodities', () => {
    expect(cargoUsed({ ...freshCompany(), cargo: { ore: 5, food: 3 } })).toBe(8)
  })

  it('addCargo removes the key at zero', () => {
    expect(addCargo({ ore: 5 }, 'ore', -5)).toEqual({})
    expect(addCargo({}, 'ore', 5)).toEqual({ ore: 5 })
  })
})

describe('driftMarket', () => {
  it('pulls prices toward the baseline', () => {
    const market = freshMarket()
    market.prices.ore = market.basePrices.ore * 3 // shocked price

    let drifted = market
    const rng = makeRng(7)
    for (let i = 0; i < 50; i++) drifted = driftMarket(drifted, rng)

    const deviation = Math.abs(drifted.prices.ore - market.basePrices.ore)
    expect(deviation).toBeLessThan(market.basePrices.ore * 0.2)
  })

  it('regenerates inventory toward baseline', () => {
    const market = freshMarket()
    market.inventory.fuel = 0

    let drifted = market
    const rng = makeRng(7)
    for (let i = 0; i < 60; i++) drifted = driftMarket(drifted, rng)

    expect(drifted.inventory.fuel).toBe(market.baseInventory.fuel)
  })

  it('is deterministic for a given rng state', () => {
    const a = driftMarket(freshMarket(), makeRng(99))
    const b = driftMarket(freshMarket(), makeRng(99))
    expect(a).toEqual(b)
  })
})
