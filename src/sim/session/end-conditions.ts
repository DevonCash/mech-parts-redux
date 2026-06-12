/**
 * Win/loss detection — pure check over session state.
 *
 * victory   — credits reached the debt target.
 * stranded  — out of fuel mid-route and can't afford emergency resupply.
 * bankrupt  — docked but immobile: can't fuel the cheapest hop out even
 *             after liquidating cargo, and no active contract can be
 *             delivered here to raise funds.
 */
import {
  EMERGENCY_RESUPPLY_COST,
  FUEL_PER_EFFECTIVE_KM,
  MIN_VIABLE_NET_WORTH,
} from '../balance'
import { cargoValue, quote, type CompanyState } from '../economy/market'
import type { NodeMarket, Route } from '../economy/models'
import type { CrawlerState } from '../../stores/crawler'
import type { Contract } from '../contracts/models'
import type { EndState } from './state'

export interface EndCheckInput {
  tick: number
  crawler: CrawlerState
  company: CompanyState
  markets: Record<string, NodeMarket>
  routes: Record<string, Route>
  active: Contract[]
  creditTarget: number
}

export function checkEndConditions(input: EndCheckInput): EndState | null {
  const { tick, crawler, company, markets, routes, active, creditTarget } = input

  if (company.credits >= creditTarget) {
    return { kind: 'victory', tick }
  }

  // Stranded: halted mid-route with no way to buy an emergency resupply.
  if (crawler.currentRoute !== null && company.fuel <= 0) {
    if (company.credits < EMERGENCY_RESUPPLY_COST) {
      return { kind: 'stranded', tick }
    }
    return null // can still click EMERGENCY RESUPPLY
  }

  // Bankrupt: docked and immobile with nothing left to leverage.
  if (crawler.currentNode !== null) {
    const market = markets[crawler.currentNode]
    if (!market) return null

    // A deliverable (or fightable) contract here means income is one
    // click away.
    const deliverableHere = active.some(
      (c) =>
        c.destination === crawler.currentNode &&
        (c.type === 'combat' || (company.cargo[c.commodity] ?? 0) >= c.quantity),
    )
    if (deliverableHere) return null

    const cheapestHopFuel = cheapestAdjacentHopFuel(crawler.currentNode, routes)
    if (cheapestHopFuel === null) return null // isolated node — shouldn't happen
    if (company.fuel >= cheapestHopFuel) return null // can still move

    // Everything liquidated, can we cover the fuel deficit?
    const fuelDeficit = cheapestHopFuel - company.fuel
    const fuelCost = fuelDeficit * quote(market, 'fuel').buy
    const liquid = company.credits + cargoValue(company, market)
    if (liquid >= fuelCost + MIN_VIABLE_NET_WORTH) return null

    return { kind: 'bankrupt', tick }
  }

  return null
}

/** Fuel needed for the cheapest single hop out of a node. */
export function cheapestAdjacentHopFuel(
  nodeId: string,
  routes: Record<string, Route>,
): number | null {
  let cheapest: number | null = null
  for (const route of Object.values(routes)) {
    if (route.from !== nodeId && route.to !== nodeId) continue
    const fuel = route.distance * route.terrain * FUEL_PER_EFFECTIVE_KM
    if (cheapest === null || fuel < cheapest) cheapest = fuel
  }
  return cheapest
}
