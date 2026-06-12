/**
 * The company's mech roster + repair actions (docked workshop work).
 */
import { atom } from 'nanostores'
import type { Unit } from '../sim/combat/models'
import { startingForces } from '../sim/combat/catalog'
import { crudeRepairAll, precisionRepairAll } from '../sim/combat/repair'
import { company } from './company'
import { crawler } from './crawler'
import { engagement } from './combat-state'
import type { ActionResult } from './market'

export const forces = atom<Unit[]>(startingForces())

function repairWith(
  unitId: string,
  fn: typeof crudeRepairAll,
): ActionResult {
  if (!crawler.get().currentNode) {
    return { ok: false, reason: 'WORKSHOP NEEDS DOCK' }
  }
  // Deployed units are copies inside the engagement; repairing the
  // roster mid-fight would burn materials on state that gets
  // overwritten by the post-battle write-back.
  if (engagement.get()?.status === 'active') {
    return { ok: false, reason: 'LANCE DEPLOYED' }
  }
  const unit = forces.get().find((u) => u.id === unitId)
  if (!unit) return { ok: false, reason: 'UNIT NOT FOUND' }

  const result = fn(unit, company.get())
  if (!result.ok) return result

  company.set(result.company)
  forces.set(forces.get().map((u) => (u.id === unitId ? result.unit : u)))
  return { ok: true }
}

export function crudeRepair(unitId: string): ActionResult {
  return repairWith(unitId, crudeRepairAll)
}

export function precisionRepair(unitId: string): ActionResult {
  return repairWith(unitId, precisionRepairAll)
}
