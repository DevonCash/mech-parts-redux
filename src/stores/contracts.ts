/**
 * Contract boards, active contracts, and player contract actions.
 */
import { atom } from 'nanostores'
import { cargoUsed, addCargo } from '../sim/economy/market'
import type { Board, Contract } from '../sim/contracts/models'
import {
  abandonContract as simAbandon,
  deliverContract as simDeliver,
} from '../sim/contracts/update'
import {
  adjustReputation,
  contractSlots,
  REP_ABANDONED,
  REP_COMPLETED,
} from '../sim/factions/models'
import { company } from './company'
import { crawler } from './crawler'
import { reputation } from './reputation'
import { sessionStats } from './session-stats'
import type { ActionResult } from './market'

export const boards = atom<Record<string, Board>>({})

export const activeContracts = atom<Contract[]>([])

/**
 * Accept a contract from the board of the docked node. The cargo is
 * loaded immediately, so free hold space is required.
 */
export function acceptContract(contractId: string): ActionResult {
  const nodeId = crawler.get().currentNode
  if (!nodeId) return { ok: false, reason: 'NOT DOCKED' }

  const board = boards.get()[nodeId]
  const contract = board?.contracts.find((c) => c.id === contractId)
  if (!contract) return { ok: false, reason: 'CONTRACT NOT FOUND' }
  if (contract.origin !== nodeId) return { ok: false, reason: 'WRONG ORIGIN' }

  const active = activeContracts.get()
  if (active.length >= contractSlots(reputation.get())) {
    return { ok: false, reason: 'CONTRACT SLOTS FULL' }
  }

  // Hauling cargo is loaded on accept; combat contracts carry nothing.
  if (contract.type === 'hauling' && contract.commodity && contract.quantity) {
    const c = company.get()
    if (cargoUsed(c) + contract.quantity > c.cargoCapacity) {
      return { ok: false, reason: 'CARGO FULL' }
    }
    company.set({ ...c, cargo: addCargo(c.cargo, contract.commodity, contract.quantity) })
  }
  activeContracts.set([...active, { ...contract, status: 'active' }])
  boards.set({
    ...boards.get(),
    [nodeId]: { ...board, contracts: board.contracts.filter((x) => x.id !== contractId) },
  })
  return { ok: true }
}

/** Deliver an active contract at its destination (must be docked there). */
export function deliverContract(contractId: string): ActionResult {
  const nodeId = crawler.get().currentNode
  const contract = activeContracts.get().find((c) => c.id === contractId)
  if (!contract) return { ok: false, reason: 'CONTRACT NOT FOUND' }
  if (!nodeId || nodeId !== contract.destination) {
    return { ok: false, reason: 'NOT AT DESTINATION' }
  }

  const result = simDeliver(company.get(), contract)
  if (!result.ok) return result

  company.set(result.company)
  activeContracts.set(activeContracts.get().filter((c) => c.id !== contractId))
  reputation.set(adjustReputation(reputation.get(), contract.faction, REP_COMPLETED))
  const stats = sessionStats.get()
  sessionStats.set({
    ...stats,
    contractsCompleted: stats.contractsCompleted + 1,
    creditsEarned: stats.creditsEarned + contract.pay,
  })
  return { ok: true }
}

/** Abandon an active contract — the contract cargo is confiscated. */
export function abandonContract(contractId: string): ActionResult {
  const contract = activeContracts.get().find((c) => c.id === contractId)
  if (!contract) return { ok: false, reason: 'CONTRACT NOT FOUND' }

  const result = simAbandon(company.get(), contract)
  company.set(result.company)
  activeContracts.set(activeContracts.get().filter((c) => c.id !== contractId))
  reputation.set(adjustReputation(reputation.get(), contract.faction, REP_ABANDONED))
  const stats = sessionStats.get()
  sessionStats.set({ ...stats, contractsFailed: stats.contractsFailed + 1 })
  return { ok: true }
}
