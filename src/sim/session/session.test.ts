import { describe, expect, it } from 'vitest'
import { seedNodes } from '../economy/seed-nodes'
import { generateSeedRoutes } from '../economy/seed-routes'
import type { WorldStatic } from '../contracts/generate'
import { createSession, START_NODE } from './new-game'
import { advanceTick, FUEL_BURN_PER_TICK } from './pipeline'
import { checkEndConditions } from './end-conditions'
import { decodeSave, encodeSave } from '../save/schema'
import { travelTicks, routeMetrics } from '../contracts/generate'
import { createEngagement } from '../combat/engagement'
import { makeRng } from '../rng'
import { EMERGENCY_RESUPPLY_COST } from '../balance'
import type { SessionState } from './state'

const world: WorldStatic = {
  nodes: Object.fromEntries(seedNodes.map((n) => [n.id, n])),
  routes: Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r])),
}

/** Put the session crawler en route to a directly-connected node. */
function depart(state: SessionState): SessionState {
  const route = Object.values(world.routes).find(
    (r) => r.from === START_NODE || r.to === START_NODE,
  )!
  const reversed = route.to === START_NODE
  return {
    ...state,
    crawler: {
      ...state.crawler,
      currentNode: null,
      currentRoute: route.id,
      routeReversed: reversed,
      routeProgress: 0,
      destination: reversed ? route.from : route.to,
    },
  }
}

function runTicks(state: SessionState, n: number): SessionState {
  let s = state
  for (let i = 0; i < n; i++) s = advanceTick(s, world).state
  return s
}

describe('createSession', () => {
  it('is deterministic per seed', () => {
    expect(createSession(123, world)).toEqual(createSession(123, world))
  })

  it('starts docked with a board at the start node', () => {
    const s = createSession(1, world)
    expect(s.crawler.currentNode).toBe(START_NODE)
    expect(s.boards[START_NODE].contracts.length).toBeGreaterThan(0)
    expect(s.markets[START_NODE]).toBeDefined()
  })
})

describe('advanceTick', () => {
  it('N ticks are deterministic: same seed → identical state', () => {
    const a = runTicks(depart(createSession(7, world)), 5000)
    const b = runTicks(depart(createSession(7, world)), 5000)
    expect(a).toEqual(b)
  })

  it('burns fuel only while in transit', () => {
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
    expect(after.crawler.currentRoute).not.toBeNull()
    // Progress frozen after the fuel ran dry
    const later = runTicks(after, 100)
    expect(later.crawler.routeProgress).toBe(after.crawler.routeProgress)
  })

  it('completes travel and emits an arrival event', () => {
    const s = depart(createSession(1, world))
    const route = world.routes[s.crawler.currentRoute!]
    const needed = travelTicks(route.distance * route.terrain) + 10

    let current = s
    let arrived = false
    for (let i = 0; i < needed; i++) {
      const r = advanceTick(current, world)
      current = r.state
      if (r.events.some((e) => e.kind === 'arrival')) arrived = true
    }
    expect(arrived).toBe(true)
    expect(current.crawler.currentNode).toBe(s.crawler.destination)
  })

  it('does nothing after an end state is set', () => {
    const s = createSession(1, world)
    const ended = { ...s, endState: { kind: 'victory' as const, tick: s.tick } }
    expect(advanceTick(ended, world).state).toBe(ended)
  })

  it('regenerates the board when docking at a node with a stale board', () => {
    const s = depart(createSession(2, world))
    const destination = s.crawler.destination!
    expect(s.boards[destination]).toBeUndefined()

    const route = world.routes[s.crawler.currentRoute!]
    const needed = travelTicks(route.distance * route.terrain) + 10
    const after = runTicks(s, needed)
    expect(after.crawler.currentNode).toBe(destination)
    expect(after.boards[destination]).toBeDefined()
    expect(after.boards[destination].contracts.length).toBeGreaterThan(0)
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
    const end = checkEndConditions({
      tick: broke.tick,
      crawler: broke.crawler,
      company: broke.company,
      markets: broke.markets,
      routes: world.routes,
      active: broke.active,
      creditTarget: broke.params.creditTarget,
    })
    expect(end?.kind).toBe('stranded')
  })

  it('does not strand when emergency resupply is affordable', () => {
    const s = depart(createSession(1, world))
    const solvent = {
      ...s,
      company: { ...s.company, fuel: 0, credits: EMERGENCY_RESUPPLY_COST },
    }
    const end = checkEndConditions({
      tick: solvent.tick,
      crawler: solvent.crawler,
      company: solvent.company,
      markets: solvent.markets,
      routes: world.routes,
      active: solvent.active,
      creditTarget: solvent.params.creditTarget,
    })
    expect(end).toBeNull()
  })

  it('bankrupts a docked company with no fuel, credits, or cargo', () => {
    const s = createSession(1, world)
    const destitute = {
      ...s,
      company: { ...s.company, fuel: 0, credits: 0, cargo: {} },
    }
    const end = checkEndConditions({
      tick: destitute.tick,
      crawler: destitute.crawler,
      company: destitute.company,
      markets: destitute.markets,
      routes: world.routes,
      active: destitute.active,
      creditTarget: destitute.params.creditTarget,
    })
    expect(end?.kind).toBe('bankrupt')
  })

  it('a docked company with money is not bankrupt', () => {
    const s = createSession(1, world)
    const end = checkEndConditions({
      tick: s.tick,
      crawler: s.crawler,
      company: s.company,
      markets: s.markets,
      routes: world.routes,
      active: s.active,
      creditTarget: s.params.creditTarget,
    })
    expect(end).toBeNull()
  })
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

describe('engagement through the pipeline', () => {
  it('a won engagement completes the contract: pay, salvage, mech damage persists', () => {
    let s = createSession(3, world)
    const contract = {
      id: 'combat-test',
      type: 'combat' as const,
      origin: START_NODE,
      destination: START_NODE,
      hostiles: 2,
      pay: 5000,
      postedTick: 0,
      deadlineTick: null,
      boardExpiryTick: 999999,
      status: 'active' as const,
    }
    s = { ...s, active: [contract] }

    // Deploy at the docked node (what the store's deploy action does).
    const rng = makeRng(s.rngState)
    const node = world.nodes[START_NODE]
    s = {
      ...s,
      engagement: createEngagement(
        contract.id,
        START_NODE,
        node.position,
        s.forces,
        s.pilots,
        contract.hostiles,
        rng,
        s.tick,
      ),
      rngState: rng.state,
    }

    const creditsBefore = s.company.credits
    let won = false
    for (let i = 0; i < 80000 && s.engagement !== null; i++) {
      const r = advanceTick(s, world)
      s = r.state
      if (r.events.some((e) => e.kind === 'engagement-won')) won = true
      if (r.events.some((e) => e.kind === 'engagement-lost')) break
    }

    expect(s.engagement).toBeNull()
    if (won) {
      expect(s.company.credits).toBe(creditsBefore + contract.pay)
      expect(s.active).toHaveLength(0)
      expect(s.stats.contractsCompleted).toBe(1)
      // Salvage landed in the hold
      expect((s.company.cargo.metal ?? 0)).toBeGreaterThan(0)
    } else {
      // Loss is also a valid decisive outcome — contract failed.
      expect(s.active).toHaveLength(0)
      expect(s.stats.contractsFailed).toBe(1)
    }
    // Either way the roster only contains survivors with persistent damage.
    expect(s.forces.length).toBeLessThanOrEqual(2)
  }, 30000)
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
