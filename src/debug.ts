/**
 * Dev-only debug handle: exposes stores and actions on window.__mech
 * so headless browser tests (and console poking) can drive the game
 * without going through every UI affordance. Stripped from production
 * builds by the import.meta.env.DEV guard at the call site.
 */
import { company } from './stores/company'
import { buyFuel, emergencyResupply, markets, tradeCommodity } from './stores/market'
import { boards, activeContracts, acceptContract } from './stores/contracts'
import {
  assignPilot,
  buyMech,
  crawlerDock,
  deploy,
  garage,
  mechLots,
  recall,
  selectedUnit,
  setUnitOrder,
  units,
} from './stores/units'
import { hirePilot, hirePools, pilots } from './stores/pilots'
import { endState, sessionParams, startNewSession } from './stores/session'
import { tick, timeScale } from './stores/time'
import { travelTo, travelOverland, moveCrawlerTo, cancelTravel } from './stores/travel'
import { nodes, quanta, routes } from './stores/world'
import { openPanel } from './stores/ui'
import { quantumPosition } from './sim/economy/quanta'

export function installDebugHandle(): void {
  ;(window as any).__mech = {
    stores: {
      company,
      markets,
      boards,
      activeContracts,
      units,
      garage,
      crawlerDock,
      selectedUnit,
      pilots,
      hirePools,
      mechLots,
      endState,
      sessionParams,
      tick,
      timeScale,
      nodes,
      routes,
      quanta,
      openPanel,
    },
    helpers: {
      quantumPosition,
    },
    actions: {
      startNewSession,
      travelTo,
      travelOverland,
      moveCrawlerTo,
      cancelTravel,
      acceptContract,
      deploy,
      recall,
      setUnitOrder,
      hirePilot,
      buyMech,
      assignPilot,
      buyFuel,
      tradeCommodity,
      emergencyResupply,
    },
  }
}
