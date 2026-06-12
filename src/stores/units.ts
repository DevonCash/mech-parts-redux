/**
 * Strategic units — the one place every actor on the map lives.
 *
 * `units` holds the crawler, deployed mechs, and hostile garrisons;
 * `garage` holds mechs the crawler is carrying. All units take the
 * same orders through setUnitOrder (select-then-command, identical to
 * combat). Persistence goes through the save system at tick boundaries.
 */
import { atom } from 'nanostores'
import type { Unit, UnitOrder } from '../sim/combat/models'
import {
  buildCrawlerUnit,
  buildUnit,
  CRAWLER_UNIT_ID,
  startingGarage,
} from '../sim/combat/catalog'
import type { MechLots } from '../sim/combat/sales'
import { unitDestroyed } from '../sim/combat/damage'
import { crudeRepairAll, precisionRepairAll } from '../sim/combat/repair'
import { marsDistance } from '../sim/constants'
import { round2 } from '../sim/economy/seed-market'
import { company } from './company'
import { tick } from './time'

export const units = atom<Unit[]>([buildCrawlerUnit(0, 0)])

export const garage = atom<Unit[]>(startingGarage())

/** Node id while the crawler sits docked at a node */
export const crawlerDock = atom<string | null>(null)

/** Unit id selected on the map for order input */
export const selectedUnit = atom<string | null>(null)

export type ActionResult = { ok: true } | { ok: false; reason: string }

export function crawlerUnit(): Unit | undefined {
  return units.get().find((u) => u.id === CRAWLER_UNIT_ID)
}

/** Recall range — a mech must be alongside the crawler to re-garage. */
export const RECALL_RANGE_KM = 2

/** Issue an order to one of your units (crawler included). */
export function setUnitOrder(unitId: string, order: UnitOrder): ActionResult {
  const all = units.get()
  const unit = all.find((u) => u.id === unitId)
  if (!unit || unit.side !== 'player') return { ok: false, reason: 'NOT YOUR UNIT' }
  if (unitDestroyed(unit)) return { ok: false, reason: 'UNIT DOWN' }

  // Any move order takes the crawler off the dock.
  if (unitId === CRAWLER_UNIT_ID && order.kind === 'move') {
    crawlerDock.set(null)
  }
  units.set(all.map((u) => (u.id === unitId ? { ...u, order } : u)))
  return { ok: true }
}

/** Field a garaged mech beside the crawler. Cockpits need pilots. */
export function deploy(mechId: string): ActionResult {
  const stored = garage.get().find((u) => u.id === mechId)
  if (!stored) return { ok: false, reason: 'NOT IN GARAGE' }
  if (unitDestroyed(stored)) return { ok: false, reason: 'UNIT DOWN' }
  if (!stored.pilotId) return { ok: false, reason: 'NO PILOT ASSIGNED' }
  const crawler = crawlerUnit()
  if (!crawler) return { ok: false, reason: 'NO CRAWLER' }

  garage.set(garage.get().filter((u) => u.id !== mechId))
  units.set([
    ...units.get(),
    {
      ...stored,
      lat: crawler.lat + 0.01,
      lng: crawler.lng + (units.get().length % 2 === 0 ? 0.01 : -0.01),
      order: { kind: 'hold' },
      cooldowns: {},
    },
  ])
  return { ok: true }
}

/** Re-garage a fielded mech standing alongside the crawler. */
export function recall(mechId: string): ActionResult {
  const fielded = units.get().find((u) => u.id === mechId)
  if (!fielded || fielded.id === CRAWLER_UNIT_ID || fielded.side !== 'player') {
    return { ok: false, reason: 'NOT A FIELDED MECH' }
  }
  const crawler = crawlerUnit()
  if (!crawler) return { ok: false, reason: 'NO CRAWLER' }
  if (marsDistance(fielded.lat, fielded.lng, crawler.lat, crawler.lng) > RECALL_RANGE_KM) {
    return { ok: false, reason: 'TOO FAR FROM CRAWLER' }
  }

  units.set(units.get().filter((u) => u.id !== mechId))
  garage.set([...garage.get(), { ...fielded, order: { kind: 'hold' }, cooldowns: {} }])
  if (selectedUnit.get() === mechId) selectedUnit.set(null)
  return { ok: true }
}

// ── Acquisition ─────────────────────────────────────────────────────

/** Mechs for sale per node — written back from the pipeline. */
export const mechLots = atom<MechLots>({})

/** Buy a frame off the docked node's lot into the garage (no pilot). */
export function buyMech(offerIndex: number): ActionResult {
  const nodeId = crawlerDock.get()
  if (!nodeId) return { ok: false, reason: 'NOT DOCKED' }
  const lot = mechLots.get()[nodeId]
  const offer = lot?.offers[offerIndex]
  if (!offer) return { ok: false, reason: 'OFFER NOT FOUND' }

  const c = company.get()
  if (c.credits < offer.price) return { ok: false, reason: 'INSUFFICIENT CREDITS' }

  const id = `mech-${nodeId}-${tick.get()}-${offerIndex}`
  company.set({ ...c, credits: round2(c.credits - offer.price) })
  garage.set([
    ...garage.get(),
    buildUnit(id, `${offer.chassisId.toUpperCase()}-${garage.get().length + 1}`, offer.chassisId, 'player', 0, 0),
  ])
  mechLots.set({
    ...mechLots.get(),
    [nodeId]: { ...lot!, offers: lot!.offers.filter((_, i) => i !== offerIndex) },
  })
  return { ok: true }
}

/** Assign (or clear) a pilot on a garaged mech. Steals from others. */
export function assignPilot(mechId: string, pilotId: string | null): ActionResult {
  const stored = garage.get().find((u) => u.id === mechId)
  if (!stored) return { ok: false, reason: 'MECH MUST BE GARAGED' }

  garage.set(
    garage.get().map((u) => {
      if (u.id === mechId) return { ...u, pilotId: pilotId ?? undefined }
      // One body, one cockpit.
      if (pilotId && u.pilotId === pilotId) return { ...u, pilotId: undefined }
      return u
    }),
  )
  return { ok: true }
}

// ── Workshop repairs (garaged mechs, docked crawler) ────────────────

function repairWith(unitId: string, fn: typeof crudeRepairAll): ActionResult {
  if (crawlerDock.get() === null) {
    return { ok: false, reason: 'WORKSHOP NEEDS DOCK' }
  }
  const unit = garage.get().find((u) => u.id === unitId)
  if (!unit) return { ok: false, reason: 'MECH MUST BE GARAGED' }

  const result = fn(unit, company.get())
  if (!result.ok) return result

  company.set(result.company)
  garage.set(garage.get().map((u) => (u.id === unitId ? result.unit : u)))
  return { ok: true }
}

export function crudeRepair(unitId: string): ActionResult {
  return repairWith(unitId, crudeRepairAll)
}

export function precisionRepair(unitId: string): ActionResult {
  return repairWith(unitId, precisionRepairAll)
}
