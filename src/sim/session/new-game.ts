/**
 * Create a fresh session from a seed — pure, deterministic.
 */
import {
  CARGO_CAPACITY,
  CREDIT_TARGET,
  FUEL_CAPACITY,
  START_CREDITS,
  START_FUEL,
} from '../balance'
import { seedMarkets } from '../economy/seed-market'
import { generateBoard, type WorldStatic } from '../contracts/generate'
import { makeRng } from '../rng'
import { emptyStats, type SessionState } from './state'

export const START_NODE = 'valles-hub'

export function createSession(seed: number, world: WorldStatic): SessionState {
  const rng = makeRng(seed)
  const markets = seedMarkets(world.nodes, rng)

  const startNode = world.nodes[START_NODE] ? START_NODE : Object.keys(world.nodes).sort()[0]
  const [lat, lng] = world.nodes[startNode].position

  const state: SessionState = {
    tick: 0,
    rngState: rng.state,
    crawler: {
      lat,
      lng,
      currentNode: startNode,
      currentRoute: null,
      routeProgress: 0,
      destination: null,
      routeReversed: false,
      routeQueue: [],
    },
    company: {
      credits: START_CREDITS,
      fuel: START_FUEL,
      fuelCapacity: FUEL_CAPACITY,
      cargo: {},
      cargoCapacity: CARGO_CAPACITY,
    },
    markets,
    boards: {},
    active: [],
    params: {
      seed,
      startCredits: START_CREDITS,
      creditTarget: CREDIT_TARGET,
    },
    stats: emptyStats(),
    endState: null,
  }

  // Starting node gets an immediate board so the first dock isn't empty.
  state.boards[startNode] = generateBoard(startNode, world, rng, 0)
  state.rngState = rng.state

  return state
}
