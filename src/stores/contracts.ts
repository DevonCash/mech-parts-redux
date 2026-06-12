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
import { LOOT_RANGE_KM } from '../sim/balance'
import { CRAWLER_UNIT_ID } from '../sim/combat/catalog'
import { spawnHostiles } from '../sim/combat/strategic'
import { marsDistance } from '../sim/constants'
import { liveBandIds } from '../sim/raiders/bands'
import { makeRng } from '../sim/rng'
import { company } from './company'
import { crawlerDock, units, type ActionResult } from './units'
import { nodes, quanta, wrecks } from './world'
import { reputation } from './reputation'
import { rngState, sessionStats } from './session-stats'
import { tick } from './time'

export const boards = atom<Record<string, Board>>({})

export const activeContracts = atom<Contract[]>([])

/**
 * Accept a contract from the board of the docked node. The cargo is
 * loaded immediately, so free hold space is required.
 */
export function acceptContract(contractId: string): ActionResult {
  const nodeId = crawlerDock.get()
  if (!nodeId) return { ok: false, reason: 'NOT DOCKED' }

  const board = boards.get()[nodeId]
  const contract = board?.contracts.find((c) => c.id === contractId)
  if (!contract) return { ok: false, reason: 'CONTRACT NOT FOUND' }
  if (contract.origin !== nodeId) return { ok: false, reason: 'WRONG ORIGIN' }
  if (contract.deadlineTick !== null && tick.get() >= contract.deadlineTick) {
    return { ok: false, reason: 'DEADLINE PASSED' }
  }

  const active = activeContracts.get()
  if (active.length >= contractSlots(reputation.get())) {
    return { ok: false, reason: 'CONTRACT SLOTS FULL' }
  }

  // Hauling cargo is loaded on accept; combat contracts spawn their
  // garrison at the site; a security target band already lives on the
  // map — accepting just takes the job, so the band must still be
  // standing and not already signed for (two boards can offer the same
  // camp; one bounty per band).
  if (contract.type === 'hauling') {
    const c = company.get()
    if (cargoUsed(c) + contract.quantity > c.cargoCapacity) {
      return { ok: false, reason: 'CARGO FULL' }
    }
    company.set({ ...c, cargo: addCargo(c.cargo, contract.commodity, contract.quantity) })
  } else if (contract.type === 'combat') {
    const site = nodes.get()[contract.destination]
    if (!site) return { ok: false, reason: 'UNKNOWN SITE' }
    const rng = makeRng(rngState.get())
    units.set([...units.get(), ...spawnHostiles(contract, site.position, rng)])
    rngState.set(rng.state)
  } else if (contract.type === 'security') {
    if (!liveBandIds(units.get()).has(contract.bandId)) {
      return { ok: false, reason: 'BAND ALREADY DESTROYED' }
    }
    if (active.some((c) => c.type === 'security' && c.bandId === contract.bandId)) {
      return { ok: false, reason: 'BAND ALREADY UNDER CONTRACT' }
    }
  } else if (contract.type === 'escort') {
    // The convoy must still be assembling here — once it rolls, the
    // charter sails unguarded.
    const q = quanta.get().find((x) => x.id === contract.quantumId)
    if (!q || q.location !== contract.origin) {
      return { ok: false, reason: 'CONVOY ALREADY DEPARTED' }
    }
    if (!liveBandIds(units.get()).has(contract.bandId)) {
      return { ok: false, reason: 'THREAT ALREADY CLEARED' }
    }
    if (active.some((c) => c.type === 'escort' && c.quantumId === contract.quantumId)) {
      return { ok: false, reason: 'CONVOY ALREADY UNDER ESCORT' }
    }
  } else {
    // Salvage: the cargo waits at the wreck — nothing loads on accept.
    const wreck = wrecks.get().find((w) => w.id === contract.wreckId)
    if (!wreck || wreck.cargo.qty < contract.quantity) {
      return { ok: false, reason: 'WRECK ALREADY STRIPPED' }
    }
    if (active.some((c) => c.type === 'salvage' && c.wreckId === contract.wreckId)) {
      return { ok: false, reason: 'WRECK ALREADY UNDER CONTRACT' }
    }
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
  const nodeId = crawlerDock.get()
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

/**
 * Loot a cargo wreck: transfer as much as the hold takes. Works with or
 * without a salvage contract — scavenging the war's leftovers is legal;
 * the contract is just the buyer waiting at a node.
 */
export function lootWreck(wreckId: string): ActionResult {
  const wreck = wrecks.get().find((w) => w.id === wreckId)
  if (!wreck) return { ok: false, reason: 'WRECK NOT FOUND' }

  const crawler = units.get().find((u) => u.id === CRAWLER_UNIT_ID)
  if (!crawler) return { ok: false, reason: 'NO CRAWLER' }
  if (marsDistance(crawler.lat, crawler.lng, wreck.lat, wreck.lng) > LOOT_RANGE_KM) {
    return { ok: false, reason: 'OUT OF RANGE' }
  }

  const c = company.get()
  const space = c.cargoCapacity - cargoUsed(c)
  const qty = Math.min(wreck.cargo.qty, space)
  if (qty <= 0) return { ok: false, reason: 'CARGO FULL' }

  company.set({ ...c, cargo: addCargo(c.cargo, wreck.cargo.commodity, qty) })
  const remaining = wreck.cargo.qty - qty
  wrecks.set(
    remaining > 0
      ? wrecks
          .get()
          .map((w) =>
            w.id === wreckId ? { ...w, cargo: { ...w.cargo, qty: remaining } } : w,
          )
      : wrecks.get().filter((w) => w.id !== wreckId),
  )
  return { ok: true }
}

/** Abandon an active contract — the contract cargo is confiscated. */
export function abandonContract(contractId: string): ActionResult {
  const contract = activeContracts.get().find((c) => c.id === contractId)
  if (!contract) return { ok: false, reason: 'CONTRACT NOT FOUND' }

  const result = simAbandon(company.get(), contract)
  company.set(result.company)
  if (contract.type === 'combat') {
    // The garrison stands down. (Abandoned security targets just keep
    // camping — they live in the world.)
    units.set(units.get().filter((u) => u.contractId !== contract.id))
  }
  activeContracts.set(activeContracts.get().filter((c) => c.id !== contractId))
  reputation.set(adjustReputation(reputation.get(), contract.faction, REP_ABANDONED))
  const stats = sessionStats.get()
  sessionStats.set({ ...stats, contractsFailed: stats.contractsFailed + 1 })
  return { ok: true }
}
