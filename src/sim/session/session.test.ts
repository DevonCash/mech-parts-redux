import { describe, expect, it } from 'vitest'
import { seedNodes } from '../economy/seed-nodes'
import { generateSeedRoutes } from '../economy/seed-routes'
import type { WorldStatic } from '../contracts/generate'
import { createSession, START_NODE } from './new-game'
import { advanceTick, findCrawler, FUEL_BURN_PER_TICK } from './pipeline'
import { checkEndConditions } from './end-conditions'
import { decodeSave, encodeSave } from '../save/schema'
import { travelTicks, routeMetrics } from '../contracts/generate'
import { buildRoadMoveOrder } from '../combat/orders'
import { spawnHostiles } from '../combat/strategic'
import { unitDestroyed } from '../combat/damage'
import { CRAWLER_UNIT_ID } from '../combat/catalog'
import { makeRng } from '../rng'
import { EMERGENCY_RESUPPLY_COST, RAIDER_BAND_TARGET, RAIDER_RESPAWN_TICKS, ECON_INTERVAL } from '../balance'
import { liveBandIds } from '../raiders/bands'
import type { CombatContract, SecurityContract } from '../contracts/models'
import type { SessionState } from './state'

const world: WorldStatic = {
  nodes: Object.fromEntries(seedNodes.map((n) => [n.id, n])),
  routes: Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r])),
}

/** Issue a road move order from the start node to a connected node. */
function depart(state: SessionState, targetNodeId = 'chryse-landing'): SessionState {
  const order = buildRoadMoveOrder(START_NODE, targetNodeId, world.nodes, world.routes)
  if (!order) throw new Error('no road path')
  return {
    ...state,
    crawlerDock: null,
    units: state.units.map((u) =>
      u.id === CRAWLER_UNIT_ID ? { ...u, order } : u,
    ),
  }
}

/**
 * Place the crawler ~5 km out from a node with a dock-targeted move —
 * arrival/dock/board/intel mechanics in a few thousand ticks instead
 * of a multi-day full trip (trips are 20–40 game-hours at plausible
 * crawler speeds; full-trip integration lives in the bot playthrough).
 */
function shortLegTo(state: SessionState, nodeId: string): SessionState {
  const [lat, lng] = world.nodes[nodeId].position
  return {
    ...state,
    crawlerDock: null,
    units: state.units.map((u) =>
      u.id === CRAWLER_UNIT_ID
        ? {
            ...u,
            lat: lat - 5 / 59.2,
            lng,
            order: {
              kind: 'move' as const,
              waypoints: [[lat, lng] as [number, number]],
              mode: 'open' as const,
              dockNodeId: nodeId,
            },
          }
        : u,
    ),
  }
}

function runTicks(state: SessionState, n: number): SessionState {
  let s = state
  for (let i = 0; i < n; i++) s = advanceTick(s, world).state
  return s
}

function endCheckInput(s: SessionState) {
  return {
    tick: s.tick,
    crawler: findCrawler(s.units),
    crawlerDock: s.crawlerDock,
    company: s.company,
    markets: s.markets,
    routes: world.routes,
    active: s.active,
    creditTarget: s.params.creditTarget,
  }
}

describe('createSession', () => {
  it('is deterministic per seed', () => {
    expect(createSession(123, world)).toEqual(createSession(123, world))
  })

  it('starts docked with a board, a crawler unit, and a garaged lance', () => {
    const s = createSession(1, world)
    expect(s.crawlerDock).toBe(START_NODE)
    expect(findCrawler(s.units)).toBeDefined()
    expect(s.garage).toHaveLength(2)
    expect(s.boards[START_NODE].contracts.length).toBeGreaterThan(0)
  })

  it('seeds the world with the target number of raider bands', () => {
    const s = createSession(1, world)
    expect(liveBandIds(s.units).size).toBe(RAIDER_BAND_TARGET)
    expect(s.raiderSerial).toBe(RAIDER_BAND_TARGET)
    // The crawler is the only player unit on the map at start.
    expect(s.units.filter((u) => u.side === 'player')).toHaveLength(1)
    for (const u of s.units) {
      if (u.side !== 'hostile') continue
      expect(u.bandId).toBeDefined()
      expect(u.spawn).toBeDefined()
      expect(u.leashKm).toBeGreaterThan(0)
      expect(u.npcPilot).toBeDefined()
    }
  })
})

describe('advanceTick', () => {
  it('N ticks are deterministic: same seed → identical state', () => {
    const a = runTicks(depart(createSession(7, world)), 5000)
    const b = runTicks(depart(createSession(7, world)), 5000)
    expect(a).toEqual(b)
  })

  it('burns fuel only while the crawler executes a move order', () => {
    const docked = createSession(1, world)
    expect(runTicks(docked, 100).company.fuel).toBe(docked.company.fuel)

    const moving = depart(docked)
    const after = runTicks(moving, 100)
    expect(after.company.fuel).toBeCloseTo(docked.company.fuel - 100 * FUEL_BURN_PER_TICK, 5)
  })

  it('halts the crawler when fuel runs out', () => {
    const s = { ...depart(createSession(1, world)) }
    s.company = { ...s.company, fuel: 10 * FUEL_BURN_PER_TICK }
    const after = runTicks(s, 100)
    expect(after.company.fuel).toBe(0)
    const crawler = findCrawler(after.units)!
    expect(crawler.order.kind).toBe('move')
    // Position frozen after the fuel ran dry
    const later = runTicks(after, 100)
    const crawlerLater = findCrawler(later.units)!
    expect(crawlerLater.lat).toBe(crawler.lat)
  })

  it('completes a leg: docks, emits arrival, regenerates the board', () => {
    const s = shortLegTo(createSession(2, world), 'chryse-landing')

    let current = s
    let arrived = false
    for (let i = 0; i < 30000; i++) {
      const r = advanceTick(current, world)
      current = r.state
      if (r.events.some((e) => e.kind === 'arrival')) arrived = true
      if (current.crawlerDock) break
    }
    expect(arrived).toBe(true)
    expect(current.crawlerDock).toBe('chryse-landing')
    expect(findCrawler(current.units)!.order.kind).toBe('hold')
    expect(current.boards['chryse-landing']).toBeDefined()
    expect(current.boards['chryse-landing'].contracts.length).toBeGreaterThan(0)
  })

  it('does nothing after an end state is set', () => {
    const s = createSession(1, world)
    const ended = { ...s, endState: { kind: 'victory' as const, tick: s.tick } }
    expect(advanceTick(ended, world).state).toBe(ended)
  })

  it('declares victory when credits reach the target', () => {
    const s = createSession(1, world)
    const rich = { ...s, company: { ...s.company, credits: s.params.creditTarget } }
    const r = advanceTick(rich, world)
    expect(r.state.endState?.kind).toBe('victory')
    expect(r.events.some((e) => e.kind === 'victory')).toBe(true)
  })
})

describe('checkEndConditions', () => {
  it('strands a fuel-less crawler that cannot afford resupply', () => {
    const s = depart(createSession(1, world))
    const broke = {
      ...s,
      company: { ...s.company, fuel: 0, credits: EMERGENCY_RESUPPLY_COST - 1 },
    }
    expect(checkEndConditions(endCheckInput(broke))?.kind).toBe('stranded')
  })

  it('does not strand when emergency resupply is affordable', () => {
    const s = depart(createSession(1, world))
    const solvent = {
      ...s,
      company: { ...s.company, fuel: 0, credits: EMERGENCY_RESUPPLY_COST },
    }
    expect(checkEndConditions(endCheckInput(solvent))).toBeNull()
  })

  it('bankrupts a docked company with no fuel, credits, or cargo', () => {
    const s = createSession(1, world)
    const destitute = {
      ...s,
      company: { ...s.company, fuel: 0, credits: 0, cargo: {} },
    }
    expect(checkEndConditions(endCheckInput(destitute))?.kind).toBe('bankrupt')
  })

  it('reports destroyed when the crawler unit is gone', () => {
    const s = createSession(1, world)
    const headless = { ...s, units: s.units.filter((u) => u.id !== CRAWLER_UNIT_ID) }
    expect(checkEndConditions(endCheckInput(headless))?.kind).toBe('destroyed')
  })

  it('a docked company with money is not bankrupt', () => {
    const s = createSession(1, world)
    expect(checkEndConditions(endCheckInput(s))).toBeNull()
  })
})

describe('strategic combat through the pipeline', () => {
  function withCombatContract(seed: number, hostiles: number): SessionState {
    let s = createSession(seed, world)
    const contract: CombatContract = {
      id: 'combat-test',
      type: 'combat',
      origin: START_NODE,
      destination: START_NODE,
      hostiles,
      pay: 5000,
      faction: 'settler',
      postedTick: 0,
      deadlineTick: null,
      boardExpiryTick: 999999,
      status: 'active',
    }
    const rng = makeRng(s.rngState)
    const site = world.nodes[START_NODE]
    s = {
      ...s,
      active: [contract],
      units: [...s.units, ...spawnHostiles(contract, site.position, rng)],
      rngState: rng.state,
      // Field the lance at the site
      garage: [],
    }
    s = {
      ...s,
      units: [
        ...s.units,
        ...createSession(seed, world).garage.map((u, i) => ({
          ...u,
          lat: site.position[0] - 0.02,
          lng: site.position[1] + i * 0.01,
        })),
      ],
    }
    return s
  }

  it('clearing the garrison completes the contract: pay, salvage, rep', () => {
    let s = withCombatContract(3, 2)
    const creditsBefore = s.company.credits
    const repBefore = s.reputation.settler

    let completed = false
    for (let i = 0; i < 80000; i++) {
      const r = advanceTick(s, world)
      s = r.state
      if (r.events.some((e) => e.kind === 'contract-completed')) {
        completed = true
        break
      }
      if (!s.units.some((u) => u.side === 'player' && !unitDestroyed(u))) break
    }

    if (completed) {
      expect(s.company.credits).toBeGreaterThanOrEqual(creditsBefore + 5000)
      expect(s.active).toHaveLength(0)
      expect(s.reputation.settler).toBeGreaterThan(repBefore)
      expect(s.units.every((u) => u.side !== 'hostile')).toBe(true)
      expect(s.stats.contractsCompleted).toBe(1)
    } else {
      // A lost fight is also decisive — the run must not stall.
      expect(s.units.some((u) => u.side === 'hostile')).toBe(true)
    }
  }, 30000)

  it('an engaged combat contract does not fail its deadline mid-fight', () => {
    let s = withCombatContract(3, 2)
    s = {
      ...s,
      active: s.active.map((c) => ({ ...c, deadlineTick: s.tick + 1 })),
    }
    for (let i = 0; i < 10; i++) s = advanceTick(s, world).state
    // Player units are at the site → exempt; contract still active
    // (unless it completed within 10 ticks, which it cannot).
    expect(s.active.map((c) => c.id)).toEqual(['combat-test'])
    expect(s.stats.contractsFailed).toBe(0)
  })

  it('an unengaged combat contract fails its deadline and the garrison stands down', () => {
    let s = createSession(5, world)
    const contract: CombatContract = {
      id: 'combat-far',
      type: 'combat',
      origin: START_NODE,
      destination: 'elysium-mine', // far from the docked crawler
      hostiles: 2,
      pay: 5000,
      faction: 'corporate',
      postedTick: 0,
      deadlineTick: s.tick + 1,
      boardExpiryTick: 999999,
      status: 'active',
    }
    const rng = makeRng(s.rngState)
    s = {
      ...s,
      active: [contract],
      units: [...s.units, ...spawnHostiles(contract, world.nodes['elysium-mine'].position, rng)],
      rngState: rng.state,
    }
    for (let i = 0; i < 5; i++) s = advanceTick(s, world).state
    expect(s.active).toHaveLength(0)
    expect(s.stats.contractsFailed).toBe(1)
    expect(s.units.some((u) => u.contractId === 'combat-far')).toBe(false)
  })
})

describe('raider bands through the pipeline', () => {
  /** Reduce every component on a unit to scrap. */
  function wreckUnit(u: SessionState['units'][number]) {
    return {
      ...u,
      components: Object.fromEntries(
        Object.entries(u.components).map(([loc, stack]) => [
          loc,
          stack.map((c) => ({ ...c, hp: 0 })),
        ]),
      ),
    }
  }

  it('respawns bands on the econ cadence back up to the target', () => {
    let s = createSession(1, world)
    const gone = [...liveBandIds(s.units)][0]
    s = { ...s, units: s.units.filter((u) => u.bandId !== gone), raiderRespawnAt: 0 }
    expect(liveBandIds(s.units).size).toBe(RAIDER_BAND_TARGET - 1)

    s = runTicks(s, ECON_INTERVAL + 1)
    expect(liveBandIds(s.units).size).toBe(RAIDER_BAND_TARGET)
    expect(s.raiderSerial).toBe(RAIDER_BAND_TARGET + 1)
    // The next respawn is pushed out — bands trickle back, not flood.
    expect(s.raiderRespawnAt).toBe(ECON_INTERVAL + RAIDER_RESPAWN_TICKS)
  })

  it('a security contract completes when its band is destroyed: pay, rep, cleanup', () => {
    let s = createSession(1, world)
    const target = [...liveBandIds(s.units)][0]
    const band = s.units.filter((u) => u.bandId === target)
    const contract: SecurityContract = {
      id: 'sec-test',
      type: 'security',
      origin: START_NODE,
      destination: START_NODE,
      bandId: target,
      hostiles: band.length,
      site: band[0].spawn!,
      faction: 'settler',
      pay: 4000,
      postedTick: 0,
      deadlineTick: null,
      boardExpiryTick: 999999,
      status: 'active',
    }
    s = {
      ...s,
      active: [contract],
      units: s.units.map((u) => (u.bandId === target ? wreckUnit(u) : u)),
    }
    const credits = s.company.credits
    const rep = s.reputation.settler

    const r = advanceTick(s, world)
    expect(r.events.some((e) => e.kind === 'contract-completed')).toBe(true)
    expect(r.state.company.credits).toBeGreaterThanOrEqual(credits + 4000)
    expect(r.state.reputation.settler).toBeGreaterThan(rep)
    expect(r.state.active).toHaveLength(0)
    expect(r.state.units.some((u) => u.bandId === target)).toBe(false)
    expect(r.state.stats.contractsCompleted).toBe(1)
  })

  it('a docked crawler far from any camp is unmolested — no dice, only units', () => {
    let s = createSession(1, world)
    const before = findCrawler(s.units)!.components
    s = runTicks(s, 2000)
    expect(findCrawler(s.units)!.components).toEqual(before)
  })

  it('band tags survive the save round-trip', () => {
    const s = createSession(3, world)
    const decoded = decodeSave(encodeSave(s))!
    expect(decoded).toEqual(s)
    const banded = decoded.units.filter((u) => u.bandId)
    expect(banded.length).toBeGreaterThan(0)
    expect(banded[0].leashKm).toBeGreaterThan(0)
    expect(banded[0].spawn).toBeDefined()
  })
})

describe('recruitment & acquisition', () => {
  it('the home port starts with a hiring pool (settlement) and dealer lot', () => {
    const s = createSession(1, world)
    expect(s.hirePools[START_NODE]).toBeDefined()
    expect(s.hirePools[START_NODE].pilots.length).toBeGreaterThanOrEqual(1)
    expect(s.mechLots[START_NODE]).toBeDefined()
  })

  it('docking at a new node generates its pool and lot', () => {
    const s = shortLegTo(createSession(2, world), 'chryse-landing')
    expect(s.hirePools['chryse-landing']).toBeUndefined()
    const after = runTicks(s, 30000)
    expect(after.crawlerDock).toBe('chryse-landing')
    expect(after.hirePools['chryse-landing']).toBeDefined()
    expect(after.mechLots['chryse-landing']).toBeDefined()
  })

  it('a cleared garrison sometimes leaves a towable wreck in the garage', () => {
    // Scan seeds until the salvage roll lands; assert the wreck's shape.
    let found = false
    for (let seed = 0; seed < 30 && !found; seed++) {
      let s = createSession(seed, world)
      const contract: CombatContract = {
        id: `salv-test-${seed}`,
        type: 'combat',
        origin: START_NODE,
        destination: START_NODE,
        hostiles: 2,
        pay: 5000,
        faction: 'settler',
        postedTick: 0,
        deadlineTick: null,
        boardExpiryTick: 999999,
        status: 'active',
      }
      const rng = makeRng(s.rngState)
      const site = world.nodes[START_NODE]
      s = {
        ...s,
        active: [contract],
        units: [...s.units, ...spawnHostiles(contract, site.position, rng)],
        rngState: rng.state,
      }
      // Field the lance at the site
      s = {
        ...s,
        garage: [],
        units: [
          ...s.units,
          ...createSession(seed, world).garage.map((u, i) => ({
            ...u,
            lat: site.position[0] - 0.02,
            lng: site.position[1] + i * 0.01,
          })),
        ],
      }
      for (let i = 0; i < 60000; i++) {
        const r = advanceTick(s, world)
        s = r.state
        if (r.events.some((e) => e.kind === 'salvage-recovered')) {
          found = true
          const wreck = s.garage.find((u) => u.id === `salv-${contract.id}`)!
          expect(wreck).toBeDefined()
          expect(wreck.side).toBe('player')
          expect(wreck.contractId).toBeUndefined()
          expect(wreck.npcPilot).toBeUndefined()
          // It's a wreck — dead cockpit, not deployable until repaired.
          expect(unitDestroyed(wreck)).toBe(true)
          // And it round-trips through the save.
          expect(decodeSave(encodeSave(s))).toEqual(s)
          break
        }
        if (r.events.some((e) => e.kind === 'contract-completed')) break
        if (!s.units.some((u) => u.side === 'player' && !unitDestroyed(u))) break
      }
    }
    expect(found).toBe(true)
  }, 60000)
})

describe('save round-trip', () => {
  it('encode → decode reproduces the exact state', () => {
    const s = runTicks(depart(createSession(11, world)), 2500)
    const decoded = decodeSave(encodeSave(s))
    expect(decoded).toEqual(s)
  })

  it('a loaded save continues identically to an unsaved run', () => {
    const start = depart(createSession(13, world))
    const half = runTicks(start, 1000)
    const loaded = decodeSave(encodeSave(half))!
    expect(runTicks(loaded, 1000)).toEqual(runTicks(half, 1000))
  })

  it('rejects corrupt and versionless saves', () => {
    expect(decodeSave('not json')).toBeNull()
    expect(decodeSave('{}')).toBeNull()
    expect(decodeSave(JSON.stringify({ version: 99, state: {} }))).toBeNull()
  })
})

describe('intel — fog of war', () => {
  it('starts knowing only the home port', () => {
    const s = createSession(1, world)
    expect(Object.keys(s.intel)).toEqual([START_NODE])
    expect(s.intel[START_NODE].observedTick).toBe(0)
  })

  it('the docked node is re-observed on the sweep cadence', () => {
    let s = createSession(1, world)
    s = runTicks(s, 200)
    expect(s.intel[START_NODE].observedTick).toBeGreaterThan(0)
  })

  it('intel for distant nodes stays stale until visited', () => {
    let s = createSession(1, world)
    expect(s.intel['elysium-mine']).toBeUndefined()
    s = runTicks(s, 500)
    expect(s.intel['elysium-mine']).toBeUndefined()
  })

  it('arrival at a node yields fresh intel for it', () => {
    const s = shortLegTo(createSession(1, world), 'chryse-landing')
    expect(s.intel['chryse-landing']).toBeUndefined()

    const after = runTicks(s, 30000)
    expect(after.crawlerDock).toBe('chryse-landing')
    expect(after.intel['chryse-landing']).toBeDefined()
    expect(after.intel['chryse-landing'].observedTick).toBeGreaterThan(0)
  })

  it('an observed snapshot does not change while out of range', () => {
    const s = shortLegTo(createSession(1, world), 'chryse-landing')
    const arrived = runTicks(s, 30000)
    expect(arrived.crawlerDock).toBe('chryse-landing')

    const homeSnapshot = arrived.intel[START_NODE]
    const later = runTicks(arrived, 500)
    expect(later.intel[START_NODE]).toBe(homeSnapshot)
  })
})

describe('route metrics sanity', () => {
  it('every seeded node can reach every other node', () => {
    const ids = Object.keys(world.nodes)
    for (const from of ids) {
      for (const to of ids) {
        if (from === to) continue
        expect(routeMetrics(world, from, to), `${from} → ${to}`).not.toBeNull()
      }
    }
  })
})
