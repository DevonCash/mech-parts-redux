/**
 * Session state — the complete, serializable state of one run.
 *
 * Everything the pipeline touches lives here as plain data. The stores
 * layer holds the same data split into atoms for the UI; it is gathered
 * into a SessionState for tick batches and saves, then written back.
 */
import type { CrawlerState } from '../../stores/crawler'
import type { CompanyState } from '../economy/market'
import type { NodeMarket } from '../economy/models'
import type { Board, Contract } from '../contracts/models'

export type EndKind = 'victory' | 'stranded' | 'bankrupt'

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
  crawler: CrawlerState
  company: CompanyState
  markets: Record<string, NodeMarket>
  boards: Record<string, Board>
  active: Contract[]
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
  | 'victory'
  | 'stranded'
  | 'bankrupt'

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
