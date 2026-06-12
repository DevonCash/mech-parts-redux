import { describe, expect, it } from 'vitest'
import {
  CONVOY_THREAT_INTERVAL,
  ECON_INTERVAL,
  QUANTA_COUNT,
  RAID_COOLDOWN_TICKS,
  RAID_LOOT_FRACTION,
  WRECK_TTL_TICKS,
} from '../balance'
import { buildUnit } from '../combat/catalog'
import type { Unit } from '../combat/models'
import { wreckUnit } from '../combat/test-helpers'
import { marsDistance } from '../constants'
import { generateBoard, generateEscortOffers, type WorldStatic } from '../contracts/generate'
import type { EscortContract, SalvageContract } from '../contracts/models'
import { interpolateRoutePath } from '../crawler/movement'
import { nodeFaction } from '../factions/models'
import { spawnBand } from '../raiders/bands'
import { makeRng } from '../rng'
import { decodeSave, encodeSave } from '../save/schema'
import { createSession, START_NODE } from '../session/new-game'
import { advanceTick } from '../session/pipeline'
import type { SessionState } from '../session/state'
import {
  haulerUnitId,
  haulerProgress,
  materializeQuantum,
  scanConvoys,
  unitHullFrac,
  type CargoWreck,
} from './convoys'
import type { Quantum, Route } from './models'
import { seedNodes } from './seed-nodes'
import { generateSeedRoutes } from './seed-routes'

const world: WorldStatic = {
  nodes: Object.fromEntries(seedNodes.map((n) => [n.id, n])),
  routes: Object.fromEntries(generateSeedRoutes(seedNodes).map((r) => [r.id, r])),
}

const someRoute = (): Route =>
  Object.values(world.routes).find((r) => r.path.length >= 4)!

/** Far-future sentinel: keeps the pipeline from respawning random bands
 *  mid-test (staged encounters must be the only ones possible). */
const NEVER = Number.MAX_SAFE_INTEGER

function transitQuantum(route: Route, progress: number, overrides: Partial<Quantum> = {}): Quantum {
  return {
    id: 'q-77',
    kind: 'hauler',
    location: null,
    route: route.id,
    reversed: false,
    progress,
    destination: route.to,
    cargo: { commodity: 'metal', qty: 10, paid: 100 },
    credits: 500,
    materialized: false,
    ...overrides,
  }
}

function runTicks(state: SessionState, n: number): SessionState {
  let s = state
  for (let i = 0; i < n; i++) s = advanceTick(s, world).state
  return s
}

function runUntil(
  state: SessionState,
  done: (s: SessionState) => boolean,
  cap: number,
): SessionState {
  let s = state
  for (let i = 0; i < cap && !done(s); i++) s = advanceTick(s, world).state
  return s
}

/**
 * A session with a single in-transit quantum sitting at a staged camp's
 * doorstep — the first threat scan decides its fate. World bands are
 * stripped and respawn is parked so only the staged band can act.
 */
function predationSession(seed: number, withBand: boolean): {
  state: SessionState
  route: Route
  bandId: string
} {
  const base = createSession(seed, world)
  const route = someRoute()
  const camp = interpolateRoutePath(route.path, 0.5)
  const band = withBand ? spawnBand(900, camp, makeRng(seed)) : []
  return {
    state: {
      ...base,
      units: [...base.units.filter((u) => !u.bandId), ...band],
      quanta: [transitQuantum(route, 0.5)],
      raiderRespawnAt: NEVER,
    },
    route,
    bandId: 'band-900',
  }
}

describe('materialization round-trip', () => {
  it('embodies a transiting quantum at its interpolated position with the remaining path', () => {
    const route = someRoute()
    const q = transitQuantum(route, 0.4)
    const unit = materializeQuantum(q, route)

    const [lat, lng] = interpolateRoutePath(route.path, 0.4)
    expect(unit.lat).toBeCloseTo(lat, 8)
    expect(unit.lng).toBeCloseTo(lng, 8)
    expect(unit.side).toBe('neutral')
    expect(unit.order.kind).toBe('move')
    if (unit.order.kind === 'move') {
      expect(unit.order.mode).toBe('road')
      expect(unit.order.roadMult).toBeCloseTo(1 / route.terrain, 8)
      const segIndex = Math.floor(0.4 * (route.path.length - 1))
      expect(unit.order.waypoints).toEqual(route.path.slice(segIndex + 1))
    }
  })

  it('haulerProgress inverts materializeQuantum within epsilon', () => {
    const route = someRoute()
    for (const p of [0.1, 0.37, 0.5, 0.82]) {
      const q = transitQuantum(route, p)
      const unit = materializeQuantum(q, route)
      expect(haulerProgress(unit, q, route)).toBeCloseTo(p, 3)
    }
  })

  it('carries hull damage in and out via hullFrac', () => {
    const route = someRoute()
    const q = transitQuantum(route, 0.3, { hullFrac: 0.5 })
    const unit = materializeQuantum(q, route)
    expect(unitHullFrac(unit)).toBeCloseTo(0.5, 1)
    for (const stack of Object.values(unit.components)) {
      for (const c of stack) expect(c.hp).toBeGreaterThan(0)
    }
  })
})

describe('scanConvoys', () => {
  function staged(progress = 0.5) {
    const route = someRoute()
    const camp = interpolateRoutePath(route.path, progress)
    const band = spawnBand(900, camp, makeRng(3))
    const q = transitQuantum(route, progress)
    return { route, band, q }
  }

  it('a hungry band sorties on a passing convoy and stamps its raid clock', () => {
    const { band, q } = staged()
    const result = scanConvoys([q], band, world.routes, 1000, {}, new Map())
    expect(result.quanta[0].materialized).toBe(true)
    expect(result.units.some((u) => u.id === haulerUnitId(q.id))).toBe(true)
    expect(result.bandRaids['band-900']).toBe(1000)
    expect(result.attacked).toEqual([{ quantumId: q.id, bandId: 'band-900' }])
  })

  it('a sated band lets the convoy pass', () => {
    const { band, q } = staged()
    const raids = { 'band-900': 1000 - RAID_COOLDOWN_TICKS / 2 }
    const result = scanConvoys([q], band, world.routes, 1000, raids, new Map())
    expect(result.quanta[0].materialized).toBe(false)
    expect(result.attacked).toEqual([])
  })

  it('an escorted convoy is sortied on even by a sated band', () => {
    const { band, q } = staged()
    const raids = { 'band-900': 1000 - RAID_COOLDOWN_TICKS / 2 }
    const escorted = new Map([[q.id, 'band-900']])
    const result = scanConvoys([q], band, world.routes, 1000, raids, escorted)
    expect(result.quanta[0].materialized).toBe(true)
    expect(result.attacked).toEqual([{ quantumId: q.id, bandId: 'band-900' }])
  })

  it('a nearby player unit materializes a convoy without any sortie (piracy reach)', () => {
    const { route, q } = staged()
    const [lat, lng] = interpolateRoutePath(route.path, 0.5)
    const player = buildUnit('mech-x', 'PIRATE', 'scout', 'player', lat, lng)
    const result = scanConvoys([q], [player], world.routes, 1000, {}, new Map())
    expect(result.quanta[0].materialized).toBe(true)
    expect(result.attacked).toEqual([])
    expect(result.bandRaids).toEqual({})
  })

  it('a sortie halts the convoy; killing the raiders lets it melt back into transit', () => {
    const { band, q } = staged()
    const first = scanConvoys([q], band, world.routes, 1000, {}, new Map())
    const embodied = first.units.find((u) => u.id === haulerUnitId(q.id))!
    expect(embodied.order.kind).toBe('hold') // roadblocked, not fleeing

    // The cavalry wins: every raider dead → next scan resumes transit.
    const cleared = first.units.map((u) => (u.bandId ? wreckUnit(u) : u))
    const second = scanConvoys(
      first.quanta,
      cleared,
      world.routes,
      1000 + CONVOY_THREAT_INTERVAL,
      first.bandRaids,
      new Map(),
    )
    const back = second.quanta[0]
    expect(back.materialized).toBe(false)
    expect(back.progress).toBe(q.progress) // it stood still under fire
    expect(back.hullFrac).toBeDefined()
    expect(second.units.some((u) => u.id === haulerUnitId(q.id))).toBe(false)
  })

  it('a piracy-reach materialization keeps the convoy driving', () => {
    const { route, q } = staged()
    const [lat, lng] = interpolateRoutePath(route.path, 0.5)
    const player = buildUnit('mech-x', 'PIRATE', 'scout', 'player', lat, lng)
    const result = scanConvoys([q], [player], world.routes, 1000, {}, new Map())
    const embodied = result.units.find((u) => u.id === haulerUnitId(q.id))!
    expect(embodied.order.kind).toBe('move')
  })
})

describe('convoy predation (pipeline)', () => {
  it('an unescorted convoy past a hungry camp dies and leaves a wreck missing the raiders’ cut', () => {
    const { state, bandId } = predationSession(11, true)
    const end = runUntil(state, (s) => s.wrecks.length > 0, 12_000)

    expect(end.quanta.some((x) => x.id === 'q-77')).toBe(false)
    expect(end.units.some((u) => u.id === haulerUnitId('q-77'))).toBe(false)
    expect(end.bandRaids[bandId]).toBeGreaterThan(0)
    expect(end.wrecks).toHaveLength(1)
    expect(end.wrecks[0].cargo).toEqual({
      commodity: 'metal',
      qty: Math.floor(10 * (1 - RAID_LOOT_FRACTION)),
    })
  })

  it('with no band on the road the convoy is never touched', () => {
    const { state } = predationSession(11, false)
    const end = runTicks(state, 10_000)
    expect(end.wrecks).toHaveLength(0)
    expect(end.quanta.some((x) => x.id === 'q-77')).toBe(true)
  })

  it('save round-trip mid-encounter is exact and continues identically', () => {
    const { state } = predationSession(11, true)
    const s = runUntil(state, (x) => x.quanta.some((q) => q.materialized), 12_000)
    expect(s.quanta.some((q) => q.materialized)).toBe(true)

    const loaded = decodeSave(encodeSave(s))
    expect(loaded).toEqual(s)
    expect(runTicks(loaded!, 1000)).toEqual(runTicks(s, 1000))
  })

  it('determinism holds across a full encounter', () => {
    const { state } = predationSession(11, true)
    expect(runTicks(state, 6000)).toEqual(runTicks(state, 6000))
  })

  it('the hauler population refills toward QUANTA_COUNT after losses', () => {
    const base = createSession(3, world)
    const thinned = { ...base, quanta: base.quanta.slice(0, QUANTA_COUNT - 2) }
    const end = runTicks(thinned, ECON_INTERVAL * 2 + 1)
    expect(end.quanta.length).toBe(QUANTA_COUNT)
    expect(new Set(end.quanta.map((q) => q.id)).size).toBe(QUANTA_COUNT)
  })
})

describe('escort contracts', () => {
  const adjacentRoutes = Object.values(world.routes).filter(
    (r) => r.from === START_NODE || r.to === START_NODE,
  )

  /** Bands camped on every road out of the node — whichever run the
   *  charter picks, it's threatened. Same seed → same bands each call. */
  const campEverything = (seed: number) =>
    adjacentRoutes.flatMap((r, i) =>
      spawnBand(910 + i, interpolateRoutePath(r.path, 0.5), makeRng(seed)),
    )

  /** Stage a docked hauler and generate its escort charter. */
  function chartered(seed: number) {
    const base = createSession(seed, world)
    const docked: Quantum = {
      ...base.quanta[0],
      id: 'q-50',
      location: START_NODE,
      route: null,
      reversed: false,
      progress: 0,
      destination: null,
      cargo: null,
      credits: 2000,
      materialized: false,
    }
    const probe = generateEscortOffers(
      START_NODE,
      world,
      [docked],
      base.markets,
      campEverything(seed),
      makeRng(seed),
      100,
    )
    return { base, probe }
  }

  it('charters a docked hauler when its run is threatened: cargo pre-bought, departure scheduled', () => {
    const { base, probe } = chartered(5)
    expect(probe.offers).toHaveLength(1)
    const offer = probe.offers[0] as EscortContract
    expect(offer.type).toBe('escort')
    expect(offer.quantumId).toBe('q-50')
    expect(offer.pay).toBeGreaterThan(0)
    expect(offer.boardExpiryTick).toBe(offer.departTick)

    const q = probe.quanta.find((x) => x.id === 'q-50')!
    expect(q.holdUntilTick).toBe(offer.departTick)
    expect(q.forcedRoute?.routeId).toBe(offer.routeId)
    expect(q.cargo?.commodity).toBe(offer.commodity)
    expect(q.cargo?.qty).toBe(offer.quantity)
    // The shipment came out of the market, not thin air.
    expect(probe.markets[START_NODE].inventory[offer.commodity]).toBe(
      base.markets[START_NODE].inventory[offer.commodity] - offer.quantity,
    )
  })

  it('offers nothing when no band threatens the road', () => {
    const base = createSession(5, world)
    const docked: Quantum = {
      ...base.quanta[0],
      id: 'q-50',
      location: START_NODE,
      route: null,
      cargo: null,
      credits: 2000,
      materialized: false,
    }
    const result = generateEscortOffers(
      START_NODE, world, [docked], base.markets, [], makeRng(5), 100,
    )
    expect(result.offers).toHaveLength(0)
  })

  /** Active-escort session: staged bands (optionally pre-wrecked), the
   *  chartered hauler, no other bands, respawn parked. */
  function escortRun(seed: number, preCleared: boolean) {
    const { base, probe } = chartered(seed)
    const offer = probe.offers[0] as EscortContract
    const bands = campEverything(seed)
    const state: SessionState = {
      ...base,
      units: [
        ...base.units.filter((u) => !u.bandId),
        ...(preCleared ? bands.map(wreckUnit) : bands),
      ],
      quanta: probe.quanta,
      markets: probe.markets,
      active: [{ ...offer, status: 'active' as const }],
      raiderRespawnAt: NEVER,
    }
    return { base, offer, state }
  }

  /** Run to departure, then fast-forward the (unmaterialized) convoy to
   *  the given progress — full transits are hundreds of km. */
  function departAndJumpTo(
    state: SessionState,
    offer: EscortContract,
    progress: number,
  ): SessionState {
    const inTransit = (s: SessionState) => {
      const q = s.quanta.find((x) => x.id === offer.quantumId)
      return !!q && q.route === offer.routeId && !q.materialized
    }
    // Departing from the player's own dock the convoy may materialize
    // in piracy reach; wait out the scans until it's a quantum again.
    const s = runUntil(state, inTransit, offer.departTick + 10_000)
    expect(inTransit(s)).toBe(true)
    return {
      ...s,
      quanta: s.quanta.map((q) =>
        q.id === offer.quantumId ? { ...q, progress } : q,
      ),
    }
  }

  it('pre-clearing the named band lets the convoy arrive and pays out', () => {
    const { base, offer, state } = escortRun(5, true)
    const jumped = departAndJumpTo(state, offer, 0.999)
    const end = runUntil(jumped, (s) => s.active.length === 0, 5000)

    expect(end.active).toHaveLength(0)
    expect(end.company.credits).toBe(base.company.credits + offer.pay)
    expect(end.stats.contractsCompleted).toBe(1)
    expect(end.quanta.some((x) => x.id === offer.quantumId)).toBe(true)
  })

  it('losing the convoy fails the contract with a reputation hit', () => {
    const { base, offer, state } = escortRun(5, false)
    // Drop it just short of the named band's camp at mid-route.
    const jumped = departAndJumpTo(state, offer, 0.47)
    const end = runUntil(jumped, (s) => s.active.length === 0, 30_000)

    expect(end.active).toHaveLength(0)
    expect(end.company.credits).toBe(base.company.credits)
    expect(end.stats.contractsFailed).toBe(1)
    expect(end.reputation[offer.faction]).toBeLessThan(base.reputation[offer.faction])
    expect(end.quanta.some((x) => x.id === offer.quantumId)).toBe(false)
    expect(end.wrecks.length).toBeGreaterThan(0)
  })
})

describe('salvage contracts and wreck lifecycle', () => {
  const wreck: CargoWreck = {
    id: 'wreck-q-9-500',
    lat: world.nodes[START_NODE].position[0] + 0.1,
    lng: world.nodes[START_NODE].position[1],
    cargo: { commodity: 'metal', qty: 8 },
    createdTick: 500,
  }

  it('a nearby wreck posts a salvage offer on the node board', () => {
    const base = createSession(5, world)
    const board = generateBoard(
      START_NODE, world, makeRng(5), 1000, base.markets, undefined, [], [wreck],
    )
    const offer = board.contracts.find((c) => c.type === 'salvage') as SalvageContract
    expect(offer).toBeDefined()
    expect(offer.wreckId).toBe(wreck.id)
    expect(offer.quantity).toBe(8)
    expect(offer.commodity).toBe('metal')
    expect(offer.destination).toBe(START_NODE)
    expect(offer.pay).toBeGreaterThan(0)
  })

  it('uncontracted wrecks rust away after WRECK_TTL_TICKS; contracted wrecks survive', () => {
    const base = createSession(5, world)
    const old: CargoWreck = { ...wreck, createdTick: 0 }
    const atExpiry: SessionState = {
      ...base,
      tick: WRECK_TTL_TICKS + ECON_INTERVAL,
      wrecks: [old],
      raiderRespawnAt: NEVER,
    }
    expect(runTicks(atExpiry, ECON_INTERVAL + 1).wrecks).toHaveLength(0)

    const contracted: SessionState = {
      ...atExpiry,
      active: [
        {
          id: 'sal-1',
          type: 'salvage',
          origin: START_NODE,
          destination: START_NODE,
          wreckId: old.id,
          site: [old.lat, old.lng],
          commodity: 'metal',
          quantity: 8,
          faction: nodeFaction(world.nodes[START_NODE]),
          pay: 500,
          postedTick: 0,
          deadlineTick: null,
          boardExpiryTick: 99,
          status: 'active',
        },
      ],
    }
    expect(runTicks(contracted, ECON_INTERVAL + 1).wrecks).toHaveLength(1)
  })
})

describe('piracy', () => {
  it('a player kill leaves the full cargo, costs reputation with the buyer, and fails any escort', () => {
    const base = createSession(7, world)
    const route = someRoute()
    const q = transitQuantum(route, 0.5, { materialized: true })
    const hauler = materializeQuantum(q, route)
    // A deployed mech sitting on the convoy with kill orders.
    const mech = {
      ...base.garage[1],
      lat: hauler.lat,
      lng: hauler.lng,
      order: { kind: 'attack' as const, targetId: hauler.id },
    }
    const state: SessionState = {
      ...base,
      units: [...base.units.filter((u) => !u.bandId), mech, hauler],
      garage: base.garage.filter((g) => g.id !== mech.id),
      quanta: [q],
      raiderRespawnAt: NEVER,
    }
    const buyerFaction = nodeFaction(world.nodes[q.destination!])
    const end = runUntil(state, (s) => s.wrecks.length > 0, 6000)

    expect(end.quanta).toHaveLength(0)
    expect(end.units.some((u) => u.id === hauler.id)).toBe(false)
    expect(end.wrecks).toHaveLength(1)
    expect(end.wrecks[0].cargo.qty).toBe(10) // pirates leave no cut for a band
    expect(end.reputation[buyerFaction]).toBeLessThan(base.reputation[buyerFaction])
  })
})

describe('quiet-world preservation with neutrals', () => {
  it('a lone convoy in transit far from camps moves on the zero-rng fast path', () => {
    const base = createSession(5, world)
    const route = someRoute()
    const q = transitQuantum(route, 0.1, { materialized: true })
    const hauler = materializeQuantum(q, route)
    const state: SessionState = {
      ...base,
      // No bands at all: the world is quiet, the convoy still drives.
      units: [...base.units.filter((u) => !u.bandId), hauler],
      quanta: [q],
      raiderRespawnAt: NEVER,
    }
    const before = state.rngState
    // Inside one ECON window and below the first threat scan: any rng
    // spent here would mean the full combat pass ran.
    const end = runTicks(state, 400)
    expect(end.rngState).toBe(before)
    const moved = end.units.find((u) => u.id === hauler.id)!
    expect(
      marsDistance(moved.lat, moved.lng, hauler.lat, hauler.lng),
    ).toBeGreaterThan(0)
  })
})
