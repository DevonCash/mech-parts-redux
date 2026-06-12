import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { buildCrawlerUnit, buildUnit, startingGarage, CRAWLER_UNIT_ID } from './catalog'
import { unitDestroyed } from './damage'
import { buildGroundMoveOrder } from './orders'
import {
  advanceUnits,
  AGGRO_RANGE_KM,
  distanceKm,
  LEASH_KM,
  rollSalvage,
  spawnHostiles,
} from './strategic'
import { startingPilots } from '../pilots/models'
import type { CombatContract } from '../contracts/models'
import type { Unit } from './models'

function combatContract(hostiles = 2): CombatContract {
  return {
    id: 'c1',
    type: 'combat',
    origin: 'a',
    destination: 'site',
    hostiles,
    pay: 5000,
    faction: 'settler',
    postedTick: 0,
    deadlineTick: null,
    boardExpiryTick: 999999,
    status: 'active',
  }
}

/** Player lance deployed near a hostile garrison at [0,0]. */
function battlefield(hostiles = 2, seed = 5): { units: Unit[]; pilots: ReturnType<typeof startingPilots> } {
  const garrison = spawnHostiles(combatContract(hostiles), [0, 0], makeRng(seed))
  const lance = startingGarage().map((u, i) => ({
    ...u,
    lat: -0.04, // ~2.4 km south
    lng: i * 0.01,
  }))
  return { units: [...lance, ...garrison], pilots: startingPilots() }
}

function run(units: Unit[], pilots: ReturnType<typeof startingPilots>, seed: number, maxTicks: number) {
  const rng = makeRng(seed)
  let u = units
  let p = pilots
  let ticks = 0
  while (ticks < maxTicks) {
    const r = advanceUnits(u, p, rng, true)
    u = r.units
    p = r.pilots
    ticks++
    const hostilesAlive = u.some((x) => x.side === 'hostile' && !unitDestroyed(x))
    const playersAlive = u.some((x) => x.side === 'player' && !unitDestroyed(x))
    if (!hostilesAlive || !playersAlive) break
  }
  return { units: u, pilots: p, ticks }
}

describe('spawnHostiles', () => {
  it('is deterministic and tags units with contract and spawn anchor', () => {
    const a = spawnHostiles(combatContract(3), [10, 20], makeRng(7))
    const b = spawnHostiles(combatContract(3), [10, 20], makeRng(7))
    expect(a).toEqual(b)
    expect(a).toHaveLength(3)
    for (const u of a) {
      expect(u.contractId).toBe('c1')
      expect(u.spawn).toBeDefined()
      expect(u.npcPilot).toBeDefined()
      expect(u.side).toBe('hostile')
    }
  })
})

describe('advanceUnits — strategic combat', () => {
  it('a fight near the site resolves decisively', () => {
    const { units, pilots } = battlefield(2)
    const result = run(units, pilots, 99, 60000)
    expect(result.ticks).toBeLessThan(60000)
  }, 20000)

  it('is deterministic over a full fight', () => {
    const go = () => {
      const { units, pilots } = battlefield(3, 11)
      return run(units, pilots, 42, 8000)
    }
    expect(go()).toEqual(go())
  })

  it('hostiles ignore enemies outside their leash', () => {
    const contract = combatContract(1)
    const garrison = spawnHostiles(contract, [0, 0], makeRng(1))
    // Player far outside the leash
    const distant = { ...startingGarage()[0], lat: 0.5, lng: 0 } // ~30 km away
    let units = [distant, ...garrison]
    let pilots = startingPilots()
    const rng = makeRng(2)
    for (let i = 0; i < 500; i++) {
      const r = advanceUnits(units, pilots, rng, true)
      units = r.units
      pilots = r.pilots
    }
    const hostile = units.find((u) => u.side === 'hostile')!
    // Garrison stayed home instead of marching across the map.
    expect(
      distanceKm(hostile, { ...hostile, lat: hostile.spawn![0], lng: hostile.spawn![1] }),
    ).toBeLessThan(LEASH_KM)
    const player = units.find((u) => u.side === 'player')!
    expect(unitDestroyed(player)).toBe(false)
  })

  it('player units hold fire beyond aggro range without orders', () => {
    const contract = combatContract(1)
    const garrison = spawnHostiles(contract, [0, 0], makeRng(1))
    const watcher = {
      ...startingGarage()[0],
      lat: (AGGRO_RANGE_KM + 2) / 59.2,
      lng: 0,
    }
    let units = [watcher, ...garrison]
    let pilots = startingPilots()
    const rng = makeRng(2)
    for (let i = 0; i < 200; i++) {
      const r = advanceUnits(units, pilots, rng, true)
      units = r.units
      pilots = r.pilots
    }
    // Nobody died — the watcher observed, the garrison never reached it
    // (it is outside the leash too).
    expect(units.every((u) => !unitDestroyed(u))).toBe(true)
  })

  it('move orders execute while combat happens around the unit', () => {
    const { units, pilots } = battlefield(2)
    const mover = units.find((u) => u.side === 'player')!
    const ordered = units.map((u) =>
      u.id === mover.id
        ? { ...u, order: buildGroundMoveOrder([u.lat, u.lng], [u.lat - 0.2, u.lng]) }
        : u,
    )
    const rng = makeRng(3)
    let current = ordered
    let p = pilots
    for (let i = 0; i < 400; i++) {
      const r = advanceUnits(current, p, rng, true)
      current = r.units
      p = r.pilots
    }
    const after = current.find((u) => u.id === mover.id)!
    expect(after.lat).toBeLessThan(mover.lat) // heading south as ordered
  })

  it('the crawler can be shot and destroyed (server core)', () => {
    // Cannon-armed troopers — autocannons (6 dmg) correctly cannot
    // penetrate hull plating (hardness 10); it takes real guns.
    const troopers: Unit[] = [0, 1, 2].map((i) => ({
      ...buildUnit(`raider-${i}`, `RAIDER ${i}`, 'raider-trooper', 'hostile', 0.01 * i, 0.01),
      npcPilot: {
        id: `rp-${i}`,
        name: 'RAIDER',
        fidelity: 0.6,
        judgment: 0.6,
        aggression: 0.8,
        stress: 0,
      },
      contractId: 'c1',
      spawn: [0, 0] as [number, number],
    }))
    // A lone crawler parked inside the garrison's leash, no escorts.
    const crawler = buildCrawlerUnit(0.02, 0)
    let units = [crawler, ...troopers]
    let pilots = startingPilots()
    const rng = makeRng(9)
    let destroyed = false
    for (let i = 0; i < 120000; i++) {
      const r = advanceUnits(units, pilots, rng, false)
      units = r.units
      pilots = r.pilots
      const c = units.find((u) => u.id === CRAWLER_UNIT_ID)!
      if (unitDestroyed(c)) {
        destroyed = true
        break
      }
    }
    expect(destroyed).toBe(true)
  }, 30000)

  it('docking is reported when a dock-targeted move completes', () => {
    const crawler = {
      ...buildCrawlerUnit(0, 0),
      order: {
        kind: 'move' as const,
        waypoints: [[0.001, 0]] as [number, number][],
        mode: 'open' as const,
        danger: 0,
        dockNodeId: 'port',
      },
    }
    const rng = makeRng(1)
    let units: Unit[] = [crawler]
    let dockedAt: string | null = null
    for (let i = 0; i < 50; i++) {
      const r = advanceUnits(units, startingPilots(), rng, true)
      units = r.units
      const dock = r.docked.find((d) => d.unitId === CRAWLER_UNIT_ID)
      if (dock) {
        dockedAt = dock.nodeId
        break
      }
    }
    expect(dockedAt).toBe('port')
  })
})

describe('rollSalvage', () => {
  it('only wrecks yield salvage', () => {
    const garrison = spawnHostiles(combatContract(2), [0, 0], makeRng(1))
    expect(rollSalvage(garrison, makeRng(1))).toEqual({ metal: 0, precision: 0 })

    const wrecks = garrison.map((u) => ({
      ...u,
      components: Object.fromEntries(
        Object.entries(u.components).map(([loc, stack]) => [
          loc,
          stack.map((c) => ({ ...c, hp: 0 })),
        ]),
      ),
    }))
    const salvage = rollSalvage(wrecks, makeRng(1))
    expect(salvage.metal).toBeGreaterThanOrEqual(8)
  })
})
