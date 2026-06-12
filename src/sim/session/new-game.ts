/**
 * Create a fresh session from a seed — pure, deterministic.
 */
import {
  CARGO_CAPACITY,
  CREDIT_TARGET,
  FUEL_CAPACITY,
  QUANTA_COUNT,
  START_CREDITS,
  START_FUEL,
} from '../balance'
import { seedMarkets } from '../economy/seed-market'
import { seedQuanta } from '../economy/quanta'
import { generateBoard, type WorldStatic } from '../contracts/generate'
import { buildCrawlerUnit, startingGarage } from '../combat/catalog'
import { pickCampSite, spawnBand } from '../raiders/bands'
import { RAIDER_BAND_TARGET, RAIDER_RESPAWN_TICKS } from '../balance'
import { generateMechLot } from '../combat/sales'
import { startingPilots } from '../pilots/models'
import { generateHirePool } from '../pilots/hiring'
import { emptyReputation } from '../factions/models'
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
    units: [buildCrawlerUnit(lat, lng)],
    garage: startingGarage(),
    crawlerDock: startNode,
    quanta: seedQuanta(Object.keys(world.nodes), QUANTA_COUNT, rng),
    wrecks: [],
    bandRaids: {},
    pilots: startingPilots(),
    hirePools: {},
    mechLots: {},
    raiderRespawnAt: RAIDER_RESPAWN_TICKS,
    raiderSerial: 0,
    reputation: emptyReputation(),
    intel: {},
    params: {
      seed,
      startCredits: START_CREDITS,
      creditTarget: CREDIT_TARGET,
    },
    stats: emptyStats(),
    endState: null,
  }

  // Seed the world's raider bands — camps weighted by banditry.
  for (let i = 0; i < RAIDER_BAND_TARGET; i++) {
    state.units.push(...spawnBand(i, pickCampSite(world, rng), rng))
    state.raiderSerial = i + 1
  }

  // Starting node gets an immediate board, hiring pool, and dealer lot
  // so the first dock isn't empty, and the company knows its home port.
  state.boards[startNode] = generateBoard(startNode, world, rng, 0, markets, undefined, state.units)
  state.hirePools[startNode] = generateHirePool(world.nodes[startNode], rng, 0)
  state.mechLots[startNode] = generateMechLot(world.nodes[startNode], rng, 0)
  state.intel[startNode] = { observedTick: 0, market: markets[startNode] }
  state.rngState = rng.state

  return state
}
