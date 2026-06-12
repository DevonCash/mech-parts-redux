/**
 * Market state + player trade actions.
 *
 * Actions validate via the pure sim functions and write both sides
 * (company, market) back atomically. All require the crawler docked.
 */
import { atom } from 'nanostores'
import {
  EMERGENCY_RESUPPLY_COST,
  EMERGENCY_RESUPPLY_FUEL,
} from '../sim/balance'
import { executeTrade, quote } from '../sim/economy/market'
import type { Commodity, NodeMarket } from '../sim/economy/models'
import { round2 } from '../sim/economy/seed-market'
import { company } from './company'
import { crawlerDock, crawlerUnit, type ActionResult } from './units'

export const markets = atom<Record<string, NodeMarket>>({})

export type { ActionResult }

function dockedMarket(): { nodeId: string; market: NodeMarket } | null {
  const nodeId = crawlerDock.get()
  if (!nodeId) return null
  const market = markets.get()[nodeId]
  return market ? { nodeId, market } : null
}

export function tradeCommodity(
  commodity: Commodity,
  qty: number,
  side: 'buy' | 'sell',
): ActionResult {
  const docked = dockedMarket()
  if (!docked) return { ok: false, reason: 'NOT DOCKED' }

  const result = executeTrade(company.get(), docked.market, commodity, qty, side)
  if (!result.ok) return result

  company.set(result.company)
  markets.set({ ...markets.get(), [docked.nodeId]: result.market })
  return { ok: true }
}

/** Buy fuel straight into the tank (not the cargo hold). */
export function buyFuel(qty: number): ActionResult {
  const docked = dockedMarket()
  if (!docked) return { ok: false, reason: 'NOT DOCKED' }
  if (qty <= 0 || !Number.isFinite(qty)) return { ok: false, reason: 'INVALID QUANTITY' }

  const c = company.get()
  const space = c.fuelCapacity - c.fuel
  const amount = Math.min(qty, space)
  if (amount <= 0) return { ok: false, reason: 'TANK FULL' }

  const stock = docked.market.inventory.fuel
  if (stock < amount) return { ok: false, reason: 'INSUFFICIENT STOCK' }

  const cost = round2(quote(docked.market, 'fuel').buy * amount)
  if (c.credits < cost) return { ok: false, reason: 'INSUFFICIENT CREDITS' }

  company.set({ ...c, credits: round2(c.credits - cost), fuel: c.fuel + amount })
  markets.set({
    ...markets.get(),
    [docked.nodeId]: {
      ...docked.market,
      inventory: { ...docked.market.inventory, fuel: stock - amount },
    },
  })
  return { ok: true }
}

/**
 * Emergency resupply for a crawler halted mid-route: a steep flat fee
 * for enough fuel to limp to the next node.
 */
export function emergencyResupply(): ActionResult {
  const crawler = crawlerUnit()
  const c = company.get()
  if (crawler?.order.kind !== 'move' || c.fuel > 0) {
    return { ok: false, reason: 'NOT STRANDED' }
  }
  if (c.credits < EMERGENCY_RESUPPLY_COST) {
    return { ok: false, reason: 'INSUFFICIENT CREDITS' }
  }
  company.set({
    ...c,
    credits: c.credits - EMERGENCY_RESUPPLY_COST,
    fuel: Math.min(EMERGENCY_RESUPPLY_FUEL, c.fuelCapacity),
  })
  return { ok: true }
}
