/**
 * Session state — the complete, serializable state of one run.
 *
 * Everything the pipeline touches lives here as plain data. The stores
 * layer holds the same data split into atoms for the UI; it is gathered
 * into a SessionState for tick batches and saves, then written back.
 */
import type { CompanyState } from '../economy/market'
import type { NodeMarket, Quantum } from '../economy/models'
import type { Board, Contract } from '../contracts/models'
import type { Unit } from '../combat/models'
import type { Pilot } from '../pilots/models'
import type { HirePools } from '../pilots/hiring'
import type { MechLots } from '../combat/sales'
import type { Reputation } from '../factions/models'
import type { IntelMap } from '../intel/models'

export type EndKind = 'victory' | 'stranded' | 'bankrupt' | 'destroyed'

export interface EndState {
  kind: EndKind
  tick: number
}

export interface SessionParams {
  seed: number
  startCredits: number
  creditTarget: number
}

export interface SessionStats {
  contractsCompleted: number
  contractsFailed: number
  ambushes: number
  creditsEarned: number
}

export interface SessionState {
  tick: number
  rngState: number
  company: CompanyState
  markets: Record<string, NodeMarket>
  boards: Record<string, Board>
  active: Contract[]
  /** Every strategic actor on the map: crawler, deployed mechs,
   *  hostile garrisons (and their wrecks until salvaged) */
  units: Unit[]
  /** Mechs carried by the crawler — the crawler is their transport */
  garage: Unit[]
  /** Node id while the crawler sits docked at a node */
  crawlerDock: string | null
  /** NPC economy agents */
  quanta: Quantum[]
  /** The company's pilot roster */
  pilots: Pilot[]
  /** Pilots for hire per node */
  hirePools: HirePools
  /** Mechs for sale per node */
  mechLots: MechLots
  /** Band respawn bookkeeping: next allowed spawn tick + id serial */
  raiderRespawnAt: number
  raiderSerial: number
  /** Standing with each faction, −1..1 */
  reputation: Reputation
  /** What the player has observed of each node, by node id */
  intel: IntelMap
  params: SessionParams
  stats: SessionStats
  endState: EndState | null
}

export type GameEventKind =
  | 'arrival'
  | 'ambush'
  | 'fuel-empty'
  | 'emergency-resupply'
  | 'contract-completed'
  | 'contract-failed'
  | 'unit-destroyed'
  | 'combat-contact'
  | 'pilot-kia'
  | 'salvage-recovered'
  | 'victory'
  | 'stranded'
  | 'bankrupt'
  | 'destroyed'

export interface GameEvent {
  tick: number
  kind: GameEventKind
  message: string
}

export function emptyStats(): SessionStats {
  return {
    contractsCompleted: 0,
    contractsFailed: 0,
    ambushes: 0,
    creditsEarned: 0,
  }
}
