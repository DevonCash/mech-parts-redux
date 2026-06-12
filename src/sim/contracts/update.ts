/**
 * Per-tick contract bookkeeping and event-driven completion.
 *
 * Pure functions: deadline failures and board expiry run every tick;
 * delivery runs when the player docks and chooses to hand over cargo.
 */
import { addCargo, type CompanyState } from '../economy/market'
import type { Board, Contract } from './models'

export interface ContractTickResult {
  active: Contract[]
  /** Contracts that failed their hard deadline this tick */
  failed: Contract[]
}

/**
 * Fail active contracts whose hard deadline has passed. A contract the
 * player is currently fighting (`excludeId`) is left alone — the
 * engagement's own outcome decides it, not the clock.
 */
export function updateActiveContracts(
  active: Contract[],
  currentTick: number,
  excludeId: string | null = null,
): ContractTickResult {
  const failed = active.filter(
    (c) =>
      c.id !== excludeId &&
      c.deadlineTick !== null &&
      currentTick > c.deadlineTick,
  )
  if (failed.length === 0) return { active, failed }
  return {
    active: active.filter((c) => !failed.includes(c)),
    failed: failed.map((c) => ({ ...c, status: 'failed' as const })),
  }
}

/**
 * Drop unaccepted contracts that have sat on a board too long, or
 * whose hard deadline has already passed (they can no longer be
 * completed, so offering them would be a trap).
 */
export function pruneBoard(board: Board, currentTick: number): Board {
  const kept = board.contracts.filter(
    (c) =>
      currentTick <= c.boardExpiryTick &&
      (c.deadlineTick === null || currentTick <= c.deadlineTick),
  )
  if (kept.length === board.contracts.length) return board
  return { ...board, contracts: kept }
}

export type DeliveryResult =
  | { ok: true; company: CompanyState; contract: Contract }
  | { ok: false; reason: string }

/**
 * Hand over a contract's cargo at its destination. The caller verifies
 * the crawler is docked there; this verifies the hold.
 */
export function deliverContract(
  company: CompanyState,
  contract: Contract,
): DeliveryResult {
  if (contract.type !== 'hauling') {
    return { ok: false, reason: 'NOT A DELIVERY CONTRACT' }
  }
  const held = company.cargo[contract.commodity] ?? 0
  if (held < contract.quantity) {
    return {
      ok: false,
      reason: `NEED ${contract.quantity} ${contract.commodity.toUpperCase()}, HOLD HAS ${held}`,
    }
  }
  return {
    ok: true,
    company: {
      ...company,
      credits: company.credits + contract.pay,
      cargo: addCargo(company.cargo, contract.commodity, -contract.quantity),
    },
    contract: { ...contract, status: 'completed' },
  }
}

/**
 * Abandon an active contract. The contract cargo (as much of it as is
 * still in the hold) is confiscated — otherwise accept→sell→abandon
 * would print free credits.
 */
export function abandonContract(
  company: CompanyState,
  contract: Contract,
): { company: CompanyState; contract: Contract } {
  if (contract.type !== 'hauling') {
    return { company, contract: { ...contract, status: 'failed' } }
  }
  const held = company.cargo[contract.commodity] ?? 0
  const confiscated = Math.min(held, contract.quantity)
  return {
    company: {
      ...company,
      cargo: addCargo(company.cargo, contract.commodity, -confiscated),
    },
    contract: { ...contract, status: 'failed' },
  }
}
