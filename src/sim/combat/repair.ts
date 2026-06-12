/**
 * Repair grades (docs/combat/mechs.md): crude repairs consume metal and
 * ratchet the instance's maxHP down 10% — the weld holds, but it's not
 * as good as original. Precision repairs consume precision components
 * and restore both hp and maxHP to template values.
 */
import type { Commodity } from '../economy/models'
import { addCargo, type CompanyState } from '../economy/market'
import { COMPONENTS } from './catalog'
import type { Unit } from './models'

export const CRUDE_MAXHP_RATCHET = 0.9

/** Metal needed to crude-repair one component. */
export function crudeRepairCost(missingHP: number): number {
  return Math.max(1, Math.ceil(missingHP / 15))
}

export interface RepairQuote {
  /** metal units for a crude pass over every damaged component */
  crudeMetal: number
  /** precision units for a precision pass (1 per damaged component) */
  precisionParts: number
  damagedComponents: number
}

export function quoteRepairs(unit: Unit): RepairQuote {
  let crudeMetal = 0
  let damagedComponents = 0
  for (const stack of Object.values(unit.components)) {
    for (const c of stack) {
      const template = COMPONENTS[c.templateId]
      if (c.hp < c.maxHP || c.maxHP < template.maxHP) {
        damagedComponents++
        crudeMetal += crudeRepairCost(c.maxHP - c.hp)
      }
    }
  }
  return { crudeMetal, precisionParts: damagedComponents, damagedComponents }
}

export type RepairResult =
  | { ok: true; unit: Unit; company: CompanyState }
  | { ok: false; reason: string }

function spend(
  company: CompanyState,
  commodity: Commodity,
  amount: number,
): CompanyState | null {
  if ((company.cargo[commodity] ?? 0) < amount) return null
  return { ...company, cargo: addCargo(company.cargo, commodity, -amount) }
}

/** Crude-repair every damaged component on a unit. */
export function crudeRepairAll(unit: Unit, company: CompanyState): RepairResult {
  const quote = quoteRepairs(unit)
  if (quote.damagedComponents === 0) return { ok: false, reason: 'NO DAMAGE' }
  const paid = spend(company, 'metal', quote.crudeMetal)
  if (!paid) return { ok: false, reason: `NEED ${quote.crudeMetal} METAL` }

  const components: Unit['components'] = {}
  for (const [locationId, stack] of Object.entries(unit.components)) {
    components[locationId] = stack.map((c) => {
      const template = COMPONENTS[c.templateId]
      if (c.hp >= c.maxHP && c.maxHP >= template.maxHP) return c
      const maxHP = Math.max(1, Math.round(c.maxHP * CRUDE_MAXHP_RATCHET))
      return { ...c, maxHP, hp: maxHP }
    })
  }
  return { ok: true, unit: { ...unit, components }, company: paid }
}

/** Precision-repair every damaged component on a unit. */
export function precisionRepairAll(unit: Unit, company: CompanyState): RepairResult {
  const quote = quoteRepairs(unit)
  if (quote.damagedComponents === 0) return { ok: false, reason: 'NO DAMAGE' }
  const paid = spend(company, 'precision', quote.precisionParts)
  if (!paid) return { ok: false, reason: `NEED ${quote.precisionParts} PRECISION` }

  const components: Unit['components'] = {}
  for (const [locationId, stack] of Object.entries(unit.components)) {
    components[locationId] = stack.map((c) => {
      const template = COMPONENTS[c.templateId]
      if (c.hp >= c.maxHP && c.maxHP >= template.maxHP) return c
      return { ...c, maxHP: template.maxHP, hp: template.maxHP }
    })
  }
  return { ok: true, unit: { ...unit, components }, company: paid }
}
