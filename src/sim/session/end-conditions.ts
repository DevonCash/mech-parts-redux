/**
 * Win/loss detection — pure check over session state.
 *
 * victory   — credits reached the debt target.
 * destroyed — the crawler's server core is gone. The player IS that
 *             component (docs/characters/player.md).
 * stranded  — out of fuel mid-move and can't afford emergency resupply.
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
import type { Contract } from '../contracts/models'
import type { Unit } from '../combat/models'
import { unitDestroyed } from '../combat/damage'
import type { EndState } from './state'

export interface EndCheckInput {
  tick: number
  /** The crawler unit, if it still exists */
  crawler: Unit | undefined
  crawlerDock: string | null
  company: CompanyState
  markets: Record<string, NodeMarket>
  routes: Record<string, Route>
  active: Contract[]
  /** A deployable mech exists — fightable contracts are real income */
  canFight: boolean
  creditTarget: number
}

export function checkEndConditions(input: EndCheckInput): EndState | null {
  const {
    tick,
    crawler,
    crawlerDock,
    company,
    markets,
    routes,
    active,
    canFight,
    creditTarget,
  } = input

  if (!crawler || unitDestroyed(crawler)) {
    return { kind: 'destroyed', tick }
  }

  if (company.credits >= creditTarget) {
    return { kind: 'victory', tick }
  }

  // Stranded: halted mid-move with no way to buy an emergency resupply.
  if (crawler.order.kind === 'move' && company.fuel <= 0) {
    if (company.credits < EMERGENCY_RESUPPLY_COST) {
      return { kind: 'stranded', tick }
    }
    return null // can still click EMERGENCY RESUPPLY
  }

  // Bankrupt: docked and immobile with nothing left to leverage.
  if (crawlerDock !== null) {
    const market = markets[crawlerDock]
    if (!market) return null

    // A deliverable (or genuinely fightable) contract means income is
    // within reach. Fightable requires a deployable mech — mechs walk
    // fuel-free, so the crawler being dry doesn't bar that income, but
    // a wrecked or pilotless garage does.
    const deliverableHere = active.some(
      (c) =>
        c.type !== 'hauling'
          ? canFight
          : c.destination === crawlerDock &&
            (company.cargo[c.commodity] ?? 0) >= c.quantity,
    )
    if (deliverableHere) return null

    const cheapestHopFuel = cheapestAdjacentHopFuel(crawlerDock, routes)
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

/** Fuel needed for the cheapest single road hop out of a node. */
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
