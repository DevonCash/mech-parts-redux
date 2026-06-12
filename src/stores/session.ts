/**
 * Session bookkeeping + the bridge between split UI atoms and the
 * sim's SessionState. The pipeline operates on a gathered SessionState;
 * the result is fanned back out so panels subscribe to small atoms.
 */
import { atom } from 'nanostores'
import { CREDIT_TARGET, START_CREDITS } from '../sim/balance'
import type {
  EndState,
  SessionParams,
  SessionState,
} from '../sim/session/state'
import { createSession } from '../sim/session/new-game'
import type { WorldStatic } from '../sim/contracts/generate'
import { TICK_DURATION_MS } from '../sim/tick'
import { company } from './company'
import { markets } from './market'
import { activeContracts, boards } from './contracts'
import { gameTime, tick } from './time'
import { nodes, quanta, routes } from './world'
import { crawlerDock, garage, units } from './units'
import { pilots } from './pilots'
import { reputation } from './reputation'
import { intel } from './intel'
import { rngState, sessionStats } from './session-stats'

export { rngState, sessionStats }

export const sessionParams = atom<SessionParams>({
  seed: 0,
  startCredits: START_CREDITS,
  creditTarget: CREDIT_TARGET,
})

export const endState = atom<EndState | null>(null)

export function getWorld(): WorldStatic {
  return { nodes: nodes.get(), routes: routes.get() }
}

/** Assemble the sim's SessionState from the UI atoms. */
export function gatherSessionState(): SessionState {
  return {
    tick: tick.get(),
    rngState: rngState.get(),
    company: company.get(),
    markets: markets.get(),
    boards: boards.get(),
    active: activeContracts.get(),
    units: units.get(),
    garage: garage.get(),
    crawlerDock: crawlerDock.get(),
    quanta: quanta.get(),
    pilots: pilots.get(),
    reputation: reputation.get(),
    intel: intel.get(),
    params: sessionParams.get(),
    stats: sessionStats.get(),
    endState: endState.get(),
  }
}

/** Fan a SessionState back out to the UI atoms. */
export function applySessionState(state: SessionState): void {
  tick.set(state.tick)
  gameTime.set(state.tick * TICK_DURATION_MS)
  rngState.set(state.rngState)
  company.set(state.company)
  markets.set(state.markets)
  boards.set(state.boards)
  activeContracts.set(state.active)
  units.set(state.units)
  garage.set(state.garage)
  crawlerDock.set(state.crawlerDock)
  quanta.set(state.quanta)
  pilots.set(state.pilots)
  reputation.set(state.reputation)
  intel.set(state.intel)
  sessionParams.set(state.params)
  sessionStats.set(state.stats)
  endState.set(state.endState)
}

/** Start a brand-new run from a seed. */
export function startNewSession(seed: number): void {
  applySessionState(createSession(seed, getWorld()))
}
