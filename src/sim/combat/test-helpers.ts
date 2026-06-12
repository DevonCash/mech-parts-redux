/**
 * Test-only unit helpers shared across suites (not part of the sim).
 */
import type { Unit } from './models'

/** Reduce every component on a unit to scrap — cockpits included. */
export function wreckUnit(unit: Unit): Unit {
  return {
    ...unit,
    components: Object.fromEntries(
      Object.entries(unit.components).map(([loc, stack]) => [
        loc,
        stack.map((c) => ({ ...c, hp: 0 })),
      ]),
    ),
  }
}
