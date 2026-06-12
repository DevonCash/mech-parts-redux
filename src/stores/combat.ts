/**
 * Engagement state + combat actions: deploy at a contract site and
 * issue move/attack orders to deployed units.
 */
import type { UnitOrder } from '../sim/combat/models'
import { createEngagement } from '../sim/combat/engagement'
import { unitDestroyed } from '../sim/combat/damage'
import { makeRng } from '../sim/rng'
import { activeContracts } from './contracts'
import { crawler } from './crawler'
import { forces } from './forces'
import { pilots } from './pilots'
import { nodes } from './world'
import { engagement, selectedUnit } from './combat-state'
import { rngState } from './session-stats'
import { timeScale, tick } from './time'
import type { ActionResult } from './market'

export { engagement, selectedUnit }

/**
 * Deploy the lance against an active combat contract at the docked
 * node. Drops the clock to 1× — you can't freeze the world, but you
 * get to watch this one at combat speed.
 */
export function deploy(contractId: string): ActionResult {
  const nodeId = crawler.get().currentNode
  if (!nodeId) return { ok: false, reason: 'NOT DOCKED' }
  if (engagement.get()) return { ok: false, reason: 'ALREADY ENGAGED' }

  const contract = activeContracts.get().find((c) => c.id === contractId)
  if (!contract || contract.type !== 'combat') {
    return { ok: false, reason: 'NO COMBAT CONTRACT' }
  }
  if (contract.destination !== nodeId) {
    return { ok: false, reason: 'NOT AT SITE' }
  }

  const lance = forces.get().filter((u) => !unitDestroyed(u))
  if (lance.length === 0) return { ok: false, reason: 'NO OPERATIONAL MECHS' }

  const node = nodes.get()[nodeId]
  const rng = makeRng(rngState.get())
  engagement.set(
    createEngagement(
      contract.id,
      nodeId,
      node.position,
      lance,
      pilots.get(),
      contract.hostiles,
      rng,
      tick.get(),
    ),
  )
  rngState.set(rng.state)
  selectedUnit.set(null)
  timeScale.set(1)
  return { ok: true }
}

/** Issue an order to one of your deployed units. */
export function setUnitOrder(unitId: string, order: UnitOrder): ActionResult {
  const eng = engagement.get()
  if (!eng || eng.status !== 'active') return { ok: false, reason: 'NO ENGAGEMENT' }
  const unit = eng.units.find((u) => u.id === unitId)
  if (!unit || unit.side !== 'player') return { ok: false, reason: 'NOT YOUR UNIT' }
  if (unitDestroyed(unit)) return { ok: false, reason: 'UNIT DOWN' }

  engagement.set({
    ...eng,
    units: eng.units.map((u) => (u.id === unitId ? { ...u, order } : u)),
  })
  return { ok: true }
}
