/**
 * Market trading — pure functions over company and market state.
 *
 * The player buys at the posted price and sells at price × SELL_MARGIN.
 * Trades never mutate inputs; failures return a reason string so the UI
 * can explain the rejection.
 */
import { SELL_MARGIN } from '../balance'
import { type Commodity, type NodeMarket } from './models'
import { round2 } from './seed-market'

export interface CompanyState {
  credits: number
  fuel: number
  fuelCapacity: number
  cargo: Partial<Record<Commodity, number>>
  cargoCapacity: number
}

export function cargoUsed(company: CompanyState): number {
  let used = 0
  for (const qty of Object.values(company.cargo)) used += qty ?? 0
  return used
}

/** Local liquidation value of everything in the hold. */
export function cargoValue(company: CompanyState, market: NodeMarket): number {
  let value = 0
  for (const [c, qty] of Object.entries(company.cargo)) {
    value += (qty ?? 0) * quote(market, c as Commodity).sell
  }
  return value
}

export function quote(
  market: NodeMarket,
  commodity: Commodity,
): { buy: number; sell: number } {
  const buy = market.prices[commodity]
  return { buy, sell: round2(buy * SELL_MARGIN) }
}

export type TradeResult =
  | { ok: true; company: CompanyState; market: NodeMarket }
  | { ok: false; reason: string }

export function executeTrade(
  company: CompanyState,
  market: NodeMarket,
  commodity: Commodity,
  qty: number,
  side: 'buy' | 'sell',
): TradeResult {
  if (qty <= 0 || !Number.isFinite(qty)) {
    return { ok: false, reason: 'INVALID QUANTITY' }
  }
  const { buy, sell } = quote(market, commodity)

  if (side === 'buy') {
    const cost = round2(buy * qty)
    if (market.inventory[commodity] < qty) {
      return { ok: false, reason: 'INSUFFICIENT STOCK' }
    }
    if (company.credits < cost) {
      return { ok: false, reason: 'INSUFFICIENT CREDITS' }
    }
    if (cargoUsed(company) + qty > company.cargoCapacity) {
      return { ok: false, reason: 'CARGO FULL' }
    }
    return {
      ok: true,
      company: {
        ...company,
        credits: round2(company.credits - cost),
        cargo: addCargo(company.cargo, commodity, qty),
      },
      market: {
        ...market,
        inventory: { ...market.inventory, [commodity]: market.inventory[commodity] - qty },
      },
    }
  }

  // sell
  const held = company.cargo[commodity] ?? 0
  if (held < qty) {
    return { ok: false, reason: 'INSUFFICIENT CARGO' }
  }
  return {
    ok: true,
    company: {
      ...company,
      credits: round2(company.credits + sell * qty),
      cargo: addCargo(company.cargo, commodity, -qty),
    },
    market: {
      ...market,
      inventory: { ...market.inventory, [commodity]: market.inventory[commodity] + qty },
    },
  }
}

export function addCargo(
  cargo: Partial<Record<Commodity, number>>,
  commodity: Commodity,
  delta: number,
): Partial<Record<Commodity, number>> {
  const next = { ...cargo }
  const value = (next[commodity] ?? 0) + delta
  if (value <= 0) delete next[commodity]
  else next[commodity] = value
  return next
}

// Price/inventory evolution lives in production.ts (econStep): real
// recipes and supply/demand pricing replaced the old drift-to-baseline.
