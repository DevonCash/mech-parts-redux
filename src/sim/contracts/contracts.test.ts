import { describe, expect, it } from 'vitest'
import { seedNodes } from '../economy/seed-nodes'
import { generateSeedRoutes } from '../economy/seed-routes'
import { makeRng } from '../rng'
import { boardStale, generateBoard, routeMetrics, type WorldStatic } from './generate'
import {
  abandonContract,
  deliverContract,
  pruneBoard,
  updateActiveContracts,
} from './update'
import type { Contract } from './models'
import type { CompanyState } from '../economy/market'
import { BOARD_REFRESH_TICKS, CONTRACT_BOARD_TTL } from '../balance'

const world: WorldStatic = {
  nodes: Object.fromEntries(seedNodes.map((n) => [n.id, n])),
  routes: Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r])),
}

function company(overrides: Partial<CompanyState> = {}): CompanyState {
  return {
    credits: 1000,
    fuel: 500,
    fuelCapacity: 1000,
    cargo: {},
    cargoCapacity: 60,
    ...overrides,
  }
}

function haulContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c1',
    type: 'hauling',
    origin: 'valles-hub',
    destination: 'chryse-landing',
    commodity: 'metal',
    quantity: 10,
    pay: 1500,
    faction: 'settler',
    postedTick: 0,
    deadlineTick: 1000,
    boardExpiryTick: 45000,
    status: 'active',
    ...overrides,
  }
}

describe('generateBoard', () => {
  it('is deterministic: same seed → identical board', () => {
    const a = generateBoard('valles-hub', world, makeRng(42), 100)
    const b = generateBoard('valles-hub', world, makeRng(42), 100)
    expect(a).toEqual(b)
  })

  it('produces 2–5 well-formed contracts originating at the node', () => {
    const board = generateBoard('valles-hub', world, makeRng(1), 0)
    expect(board.contracts.length).toBeGreaterThanOrEqual(2)
    expect(board.contracts.length).toBeLessThanOrEqual(5)
    for (const c of board.contracts) {
      expect(c.origin).toBe('valles-hub')
      expect(c.destination).not.toBe('valles-hub')
      expect(c.status).toBe('available')
      expect(c.pay).toBeGreaterThan(0)
      if (c.type === 'hauling') {
        expect(c.quantity).toBeGreaterThan(0)
        expect(c.commodity).toBeDefined()
      } else {
        expect(c.hostiles).toBeGreaterThanOrEqual(2)
        expect(c.deadlineTick).not.toBeNull()
      }
    }
  })

  it('boards mix hauling and combat work across seeds', () => {
    let hauling = 0
    let combat = 0
    for (let seed = 0; seed < 30; seed++) {
      const board = generateBoard('valles-hub', world, makeRng(seed), 0)
      for (const c of board.contracts) {
        if (c.type === 'hauling') hauling++
        else combat++
      }
    }
    expect(hauling).toBeGreaterThan(0)
    expect(combat).toBeGreaterThan(0)
  })

  it('pays more for longer hauls', () => {
    // Average across seeds to wash out qty/commodity noise.
    const near = world.nodes['chryse-landing']
    const farId = 'elysium-mine'
    const nearKm = routeMetrics(world, 'valles-hub', near.id)!.effectiveKm
    const farKm = routeMetrics(world, 'valles-hub', farId)!.effectiveKm
    expect(farKm).toBeGreaterThan(nearKm * 1.5)

    let nearPay = 0
    let farPay = 0
    let nearCount = 0
    let farCount = 0
    for (let seed = 0; seed < 60; seed++) {
      const board = generateBoard('valles-hub', world, makeRng(seed), 0)
      for (const c of board.contracts) {
        const perUnitPay = c.pay / 1 // pay already mostly distance-driven
        if (c.destination === near.id) {
          nearPay += perUnitPay
          nearCount++
        }
        if (c.destination === farId) {
          farPay += perUnitPay
          farCount++
        }
      }
    }
    expect(nearCount).toBeGreaterThan(0)
    expect(farCount).toBeGreaterThan(0)
    expect(farPay / farCount).toBeGreaterThan(nearPay / nearCount)
  })

  it('hard deadlines leave enough time to make the trip', () => {
    const board = generateBoard('valles-hub', world, makeRng(5), 1000)
    for (const c of board.contracts) {
      if (c.deadlineTick === null) continue
      const metrics = routeMetrics(world, c.origin, c.destination)!
      const eta = (metrics.effectiveKm / 0.5) * 10 // ticks at 0.5 km/s, 100ms ticks
      expect(c.deadlineTick - 1000).toBeGreaterThan(eta)
    }
  })

  it('boardStale respects the refresh interval', () => {
    const board = generateBoard('valles-hub', world, makeRng(1), 1000)
    expect(boardStale(undefined, 0)).toBe(true)
    expect(boardStale(board, 1000)).toBe(false)
    expect(boardStale(board, 1000 + BOARD_REFRESH_TICKS)).toBe(true)
  })
})

describe('updateActiveContracts', () => {
  it('fails contracts past their hard deadline', () => {
    const active = [haulContract({ deadlineTick: 100 })]
    const result = updateActiveContracts(active, 101)
    expect(result.active).toHaveLength(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].status).toBe('failed')
  })

  it('keeps soft-expiry contracts forever once active', () => {
    const active = [haulContract({ deadlineTick: null })]
    const result = updateActiveContracts(active, 10_000_000)
    expect(result.active).toHaveLength(1)
    expect(result.failed).toHaveLength(0)
  })

  it('returns the same array when nothing fails (no-op path)', () => {
    const active = [haulContract({ deadlineTick: 1000 })]
    const result = updateActiveContracts(active, 500)
    expect(result.active).toBe(active)
  })
})

describe('pruneBoard', () => {
  it('drops contracts past board expiry', () => {
    const board = {
      generatedTick: 0,
      contracts: [
        haulContract({ status: 'available', boardExpiryTick: 100 }),
        haulContract({ id: 'c2', status: 'available', boardExpiryTick: CONTRACT_BOARD_TTL }),
      ],
    }
    const pruned = pruneBoard(board, 200)
    expect(pruned.contracts.map((c) => c.id)).toEqual(['c2'])
  })
})

describe('deliverContract', () => {
  it('pays out and removes the cargo', () => {
    const result = deliverContract(company({ cargo: { metal: 12 } }), haulContract())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.credits).toBe(2500)
    expect(result.company.cargo.metal).toBe(2)
    expect(result.contract.status).toBe('completed')
  })

  it('rejects when the hold is short (e.g. after ambush losses)', () => {
    const result = deliverContract(company({ cargo: { metal: 4 } }), haulContract())
    expect(result.ok).toBe(false)
  })
})

describe('abandonContract', () => {
  it('confiscates the contract cargo so abandon cannot print credits', () => {
    const result = abandonContract(company({ cargo: { metal: 10 } }), haulContract())
    expect(result.company.cargo.metal).toBeUndefined()
    expect(result.company.credits).toBe(1000)
    expect(result.contract.status).toBe('failed')
  })

  it('confiscates only what is still held', () => {
    const result = abandonContract(company({ cargo: { metal: 3 } }), haulContract())
    expect(result.company.cargo.metal).toBeUndefined()
  })
})
