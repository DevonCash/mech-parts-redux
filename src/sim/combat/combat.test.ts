import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { buildUnit, COMPONENTS, startingForces } from './catalog'
import { applyHit, locationDestroyed, unitDestroyed } from './damage'
import {
  advanceEngagement,
  createEngagement,
  distanceKm,
  rollSalvage,
  survivingPlayerUnits,
  unitSpeedKmS,
} from './engagement'
import { crudeRepairAll, precisionRepairAll, quoteRepairs } from './repair'
import { startingPilots } from '../pilots/models'
import type { CompanyState } from '../economy/market'
import type { Engagement, Unit } from './models'

function scout(id = 'u1', side: Unit['side'] = 'player'): Unit {
  return buildUnit(id, id.toUpperCase(), 'scout', side, 0, 0)
}

function company(overrides: Partial<CompanyState> = {}): CompanyState {
  return {
    credits: 1000,
    fuel: 500,
    fuelCapacity: 1000,
    cargo: {},
    cargoCapacity: 60,
    ...overrides,
  }
}

describe('applyHit — damage propagation', () => {
  it('hardness deflects weak hits entirely', () => {
    const unit = scout()
    // Force hits onto the torso (light plate, hardness 4) by removing
    // every other location's components.
    const torsoOnly: Unit = {
      ...unit,
      components: { torso: unit.components.torso },
    }
    const result = applyHit(torsoOnly, 3, makeRng(1))
    expect(result.deflected).toBe(true)
    expect(result.unit.components.torso[0].hp).toBe(60)
  })

  it('applies damage minus hardness to the outermost component', () => {
    const unit = scout()
    const torsoOnly: Unit = { ...unit, components: { torso: unit.components.torso } }
    const result = applyHit(torsoOnly, 25, makeRng(1))
    // plate-light: hardness 4 → 21 effective
    expect(result.unit.components.torso[0].hp).toBe(60 - 21)
    expect(result.unit.components.torso[1].hp).toBe(25) // gyro untouched
  })

  it('overflows through a destroyed component into the next inward', () => {
    const unit = scout()
    const torso = [
      { templateId: 'plate-light', hp: 5, maxHP: 60 },
      { templateId: 'gyro', hp: 25, maxHP: 25 },
    ]
    const target: Unit = { ...unit, components: { torso } }
    const result = applyHit(target, 30, makeRng(1))
    // 30 − 4 hardness = 26; plate absorbs 5 and dies; 21 carries to
    // gyro: 21 − 1 hardness = 20 → gyro at 5.
    expect(result.unit.components.torso[0].hp).toBe(0)
    expect(result.unit.components.torso[1].hp).toBe(5)
    expect(result.destroyed).toContain('Light Plate')
  })

  it('overflows a stripped location to its parent', () => {
    const unit = scout()
    const target: Unit = {
      ...unit,
      components: {
        left_arm: [{ templateId: 'autocannon', hp: 1, maxHP: 20 }],
        torso: [{ templateId: 'gyro', hp: 25, maxHP: 25 }],
      },
    }
    // Only left_arm and torso exist; force the arm hit by zeroing the
    // torso/legs weights is not possible — instead roll until arm is
    // hit, deterministically scanning seeds.
    let hitArm = false
    for (let seed = 0; seed < 50; seed++) {
      const result = applyHit(target, 30, makeRng(seed))
      if (result.locationId === 'left_arm') {
        hitArm = true
        // 30 hits autocannon (hardness 0): absorbs 1, 29 overflow →
        // torso gyro: 29 − 1 = 28 ≥ 25 → gyro destroyed.
        expect(result.unit.components.left_arm[0].hp).toBe(0)
        expect(result.unit.components.torso[0].hp).toBeLessThanOrEqual(0)
        break
      }
    }
    expect(hitArm).toBe(true)
  })

  it('unit dies when its cockpit reaches 0', () => {
    const unit = scout()
    const dying: Unit = {
      ...unit,
      components: {
        ...unit.components,
        head: [{ templateId: 'cockpit', hp: 1, maxHP: 15 }],
      },
    }
    expect(unitDestroyed(dying)).toBe(false)
    let killed = false
    for (let seed = 0; seed < 100; seed++) {
      const result = applyHit(dying, 10, makeRng(seed))
      if (result.locationId === 'head') {
        expect(unitDestroyed(result.unit)).toBe(true)
        killed = true
        break
      }
    }
    expect(killed).toBe(true)
  })

  it('never hits a stripped location', () => {
    const unit = scout()
    const target: Unit = {
      ...unit,
      components: {
        ...unit.components,
        torso: unit.components.torso.map((c) => ({ ...c, hp: 0 })),
      },
    }
    expect(locationDestroyed(target, 'torso')).toBe(true)
    for (let seed = 0; seed < 40; seed++) {
      const result = applyHit(target, 10, makeRng(seed))
      expect(result.locationId).not.toBe('torso')
    }
  })
})

describe('engagement', () => {
  function smallEngagement(seed = 5): Engagement {
    return createEngagement(
      'c1',
      'test-site',
      [0, 0],
      startingForces(),
      startingPilots(),
      2,
      makeRng(seed),
      0,
    )
  }

  it('creation is deterministic per rng seed', () => {
    expect(smallEngagement(9)).toEqual(smallEngagement(9))
  })

  it('spawns sides ~3 km apart', () => {
    const eng = smallEngagement()
    const player = eng.units.find((u) => u.side === 'player')!
    const hostile = eng.units.find((u) => u.side === 'hostile')!
    const d = distanceKm(player, hostile)
    expect(d).toBeGreaterThan(2)
    expect(d).toBeLessThan(4.5)
  })

  it('units close distance and a full run ends decisively', () => {
    let eng = smallEngagement()
    const rng = makeRng(123)
    const before = distanceKm(
      eng.units.find((u) => u.side === 'player')!,
      eng.units.find((u) => u.side === 'hostile')!,
    )

    let ticks = 0
    while (eng.status === 'active' && ticks < 60000) {
      eng = advanceEngagement(eng, rng).engagement
      ticks++
      if (ticks === 300) {
        const after = distanceKm(
          eng.units.find((u) => u.side === 'player')!,
          eng.units.find((u) => u.side === 'hostile')!,
        )
        expect(after).toBeLessThan(before)
      }
    }
    expect(eng.status).not.toBe('active')
    expect(ticks).toBeLessThan(60000)
  }, 20000)

  it('full engagement runs are deterministic', () => {
    const run = () => {
      let eng = smallEngagement(7)
      const rng = makeRng(99)
      for (let i = 0; i < 5000 && eng.status === 'active'; i++) {
        eng = advanceEngagement(eng, rng).engagement
      }
      return eng
    }
    expect(run()).toEqual(run())
  })

  it('move orders are followed and clear on arrival', () => {
    // One player unit, one hostile a full degree away (outside aggro
    // range) so movement runs undisturbed by combat.
    const mover = scout('mover')
    const distant = buildUnit('far', 'FAR', 'scout', 'hostile', 1, 1)
    const destLat = -0.05
    let eng: Engagement = {
      id: 'e1',
      contractId: 'c1',
      siteNodeId: 's1',
      units: [
        { ...mover, order: { kind: 'move', lat: destLat, lng: 0 } },
        distant,
      ],
      pilots: {},
      status: 'active',
      startedTick: 0,
    }
    const rng = makeRng(1)
    let arrived = false
    for (let i = 0; i < 2000; i++) {
      eng = advanceEngagement(eng, rng).engagement
      const u = eng.units.find((x) => x.id === 'mover')!
      if (u.order.kind === 'hold') {
        arrived = true
        break
      }
    }
    const u = eng.units.find((x) => x.id === 'mover')!
    expect(arrived).toBe(true)
    expect(Math.abs(u.lat - destLat)).toBeLessThan(0.002)
  })

  it('salvage comes only from destroyed hostiles', () => {
    let eng = smallEngagement()
    expect(rollSalvage(eng, makeRng(1))).toEqual({ metal: 0, precision: 0 })

    // Kill all hostiles outright.
    eng = {
      ...eng,
      units: eng.units.map((u) =>
        u.side === 'hostile'
          ? {
              ...u,
              components: Object.fromEntries(
                Object.entries(u.components).map(([loc, stack]) => [
                  loc,
                  stack.map((c) => ({ ...c, hp: 0 })),
                ]),
              ),
            }
          : u,
      ),
    }
    const salvage = rollSalvage(eng, makeRng(1))
    expect(salvage.metal).toBeGreaterThanOrEqual(8)
    expect(survivingPlayerUnits(eng)).toHaveLength(2)
  })

  it('damaged locomotion slows the unit', () => {
    const unit = scout()
    const fullSpeed = unitSpeedKmS(unit)
    const limping: Unit = {
      ...unit,
      components: {
        ...unit.components,
        legs: [{ templateId: 'actuator-biped', hp: 20, maxHP: 40 }],
      },
    }
    expect(unitSpeedKmS(limping)).toBeCloseTo(fullSpeed / 2)
  })
})

describe('repair', () => {
  function damagedScout(): Unit {
    const unit = scout()
    return {
      ...unit,
      components: {
        ...unit.components,
        torso: [
          { templateId: 'plate-light', hp: 10, maxHP: 60 },
          { templateId: 'gyro', hp: 25, maxHP: 25 },
        ],
      },
    }
  }

  it('quotes costs only for damaged components', () => {
    const quote = quoteRepairs(damagedScout())
    expect(quote.damagedComponents).toBe(1)
    expect(quote.crudeMetal).toBe(Math.ceil(50 / 15))
    expect(quoteRepairs(scout()).damagedComponents).toBe(0)
  })

  it('crude repair restores hp but ratchets maxHP down', () => {
    const result = crudeRepairAll(damagedScout(), company({ cargo: { metal: 10 } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const plate = result.unit.components.torso[0]
    expect(plate.maxHP).toBe(54) // 60 × 0.9
    expect(plate.hp).toBe(54)
    expect(result.company.cargo.metal).toBe(10 - Math.ceil(50 / 15))
  })

  it('repeated crude repairs keep ratcheting', () => {
    let unit = damagedScout()
    let c = company({ cargo: { metal: 50 } })
    for (let i = 0; i < 3; i++) {
      const result = crudeRepairAll(
        { ...unit, components: { ...unit.components, torso: [{ ...unit.components.torso[0], hp: 1 }, unit.components.torso[1]] } },
        c,
      )
      if (!result.ok) break
      unit = result.unit
      c = result.company
    }
    expect(unit.components.torso[0].maxHP).toBeLessThan(54)
  })

  it('precision repair restores to template values', () => {
    const battered: Unit = {
      ...damagedScout(),
    }
    battered.components.torso[0] = { templateId: 'plate-light', hp: 10, maxHP: 40 }
    const result = precisionRepairAll(battered, company({ cargo: { precision: 5 } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.unit.components.torso[0].hp).toBe(COMPONENTS['plate-light'].maxHP)
    expect(result.unit.components.torso[0].maxHP).toBe(COMPONENTS['plate-light'].maxHP)
    expect(result.company.cargo.precision).toBe(4)
  })

  it('rejects repairs without materials', () => {
    expect(crudeRepairAll(damagedScout(), company()).ok).toBe(false)
    expect(precisionRepairAll(damagedScout(), company()).ok).toBe(false)
  })
})
