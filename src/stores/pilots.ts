/**
 * The company's pilot roster + hiring.
 */
import { atom } from 'nanostores'
import { startingPilots, type Pilot } from '../sim/pilots/models'
import { hireCost, type HirePools } from '../sim/pilots/hiring'
import { round2 } from '../sim/economy/seed-market'
import { company } from './company'
import { crawlerDock, garage, units, type ActionResult } from './units'

export const pilots = atom<Pilot[]>(startingPilots())

/** Pilots for hire per node — written back from the pipeline. */
export const hirePools = atom<HirePools>({})

/** Sign a candidate from the docked node's pool. */
export function hirePilot(pilotId: string): ActionResult {
  const nodeId = crawlerDock.get()
  if (!nodeId) return { ok: false, reason: 'NOT DOCKED' }
  const pool = hirePools.get()[nodeId]
  const candidate = pool?.pilots.find((p) => p.id === pilotId)
  if (!candidate) return { ok: false, reason: 'CANDIDATE NOT FOUND' }

  const cost = hireCost(candidate)
  const c = company.get()
  if (c.credits < cost) return { ok: false, reason: 'INSUFFICIENT CREDITS' }

  company.set({ ...c, credits: round2(c.credits - cost) })
  pilots.set([...pilots.get(), candidate])
  hirePools.set({
    ...hirePools.get(),
    [nodeId]: { ...pool!, pilots: pool!.pilots.filter((p) => p.id !== pilotId) },
  })
  return { ok: true }
}

/**
 * Let a pilot go. Blocked while their mech is in the field; a garaged
 * mech is simply left without a pilot.
 */
export function dismissPilot(pilotId: string): ActionResult {
  const pilot = pilots.get().find((p) => p.id === pilotId)
  if (!pilot) return { ok: false, reason: 'PILOT NOT FOUND' }

  if (units.get().some((u) => u.side === 'player' && u.pilotId === pilotId)) {
    return { ok: false, reason: 'PILOT IS DEPLOYED' }
  }
  garage.set(
    garage.get().map((u) => (u.pilotId === pilotId ? { ...u, pilotId: undefined } : u)),
  )
  pilots.set(pilots.get().filter((p) => p.id !== pilotId))
  return { ok: true }
}
