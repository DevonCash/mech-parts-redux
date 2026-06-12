/**
 * The per-tick simulation pipeline.
 *
 * advanceTick is a pure function: SessionState in, new SessionState and
 * any events out. The game loop runs N ticks per frame through it and
 * writes the result back to the stores. Order matters and is fixed:
 * units (movement + combat) → fuel/ambush → contract resolution →
 * deadlines → boards/economy → sensor sweep → end check.
 *
 * Runs up to a few thousand times per second at 100× speed — keep every
 * stage cheap and allocation-light on the no-op path.
 */
import {
  CONVOY_THREAT_INTERVAL,
  ECON_INTERVAL,
  FUEL_PER_EFFECTIVE_KM,
  QUANTA_COUNT,
  RAID_LOOT_FRACTION,
  RAIDER_BAND_TARGET,
  RAIDER_RESPAWN_TICKS,
  SALVAGE_MECH_CHANCE,
  WRECK_TTL_TICKS,
} from '../balance'
import { TICK_DURATION_MS } from '../tick'
import { CRAWLER_SPEED_KM_S } from '../crawler/movement'
import { quantumIdOfHauler, scanConvoys } from '../economy/convoys'
import { econStep } from '../economy/production'
import { moveQuanta, quantaDecisions, refillQuanta } from '../economy/quanta'
import type { Commodity } from '../economy/models'
import {
  boardStale,
  generateBoard,
  generateEscortOffers,
  type WorldStatic,
} from '../contracts/generate'
import { pruneBoard, updateActiveContracts } from '../contracts/update'
import { CHASSIS, CRAWLER_UNIT_ID } from '../combat/catalog'
import { liveBandIds, pickCampSite, spawnBand } from '../raiders/bands'
import { generateMechLot, mechLotStale } from '../combat/sales'
import { generateHirePool, hirePoolStale } from '../pilots/hiring'
import { unitDestroyed } from '../combat/damage'
import { advanceUnits, rollSalvage, LEASH_KM } from '../combat/strategic'
import {
  growSkills,
  recoverStress,
  STRESS_RECOVERY_DOCKED,
  STRESS_RECOVERY_FIELD,
} from '../pilots/models'
import {
  adjustReputation,
  nodeFaction,
  REP_COMPLETED,
  REP_FAILED,
  REP_PIRACY,
} from '../factions/models'
import { addCargo, cargoUsed } from '../economy/market'
import { makeRng } from '../rng'
import { marsDistance } from '../constants'
import { OBSERVE_INTERVAL, SENSOR_RANGE_KM } from '../intel/models'
import { checkEndConditions } from './end-conditions'
import type { EndState, GameEvent, SessionState } from './state'
import type { Unit } from '../combat/models'

const TICK_S = TICK_DURATION_MS / 1000

/** Fuel burned per tick while the crawler executes a move order.
 *  Flat per tick: roads move twice the ground per tick at the same
 *  burn, which is exactly the old effective-km accounting. Derives
 *  from the crawler's base speed, so per-trip fuel cost is
 *  speed-invariant. */
export const FUEL_BURN_PER_TICK = CRAWLER_SPEED_KM_S * TICK_S * FUEL_PER_EFFECTIVE_KM

/** A combat contract is "engaged" (deadline-exempt) when a player unit
 *  is this close to its site. */
const ENGAGED_KM = LEASH_KM + 2

/** How often the (heavier) bankruptcy check runs while docked. */
const END_CHECK_INTERVAL = 50

export interface TickResult {
  state: SessionState
  events: GameEvent[]
}

export function findCrawler(units: Unit[]): Unit | undefined {
  return units.find((u) => u.id === CRAWLER_UNIT_ID)
}

export function advanceTick(state: SessionState, world: WorldStatic): TickResult {
  if (state.endState) return { state, events: [] }

  const events: GameEvent[] = []
  const tick = state.tick + 1
  const rng = makeRng(state.rngState)

  let company = state.company
  let markets = state.markets
  let boards = state.boards
  let active = state.active
  let units = state.units
  let garage = state.garage
  let crawlerDock = state.crawlerDock
  let quanta = state.quanta
  let wrecks = state.wrecks
  let bandRaids = state.bandRaids
  let pilots = state.pilots
  let hirePools = state.hirePools
  let mechLots = state.mechLots
  let raiderRespawnAt = state.raiderRespawnAt
  let raiderSerial = state.raiderSerial
  let reputation = state.reputation
  let intel = state.intel
  let stats = state.stats

  // ── Units: movement + combat on the shared clock ──────────────────
  const crawlerBefore = findCrawler(units)
  const crawlerMoving = crawlerBefore?.order.kind === 'move'
  const crawlerCanMove = company.fuel > 0

  const needsAdvance =
    units.length > 1 || crawlerMoving || (crawlerBefore && unitDestroyed(crawlerBefore))
  if (needsAdvance) {
    const result = advanceUnits(units, pilots, rng, crawlerCanMove)
    units = result.units
    pilots = result.pilots

    for (const e of result.events) {
      if (e.kind === 'combat-contact') {
        // One per tick is plenty for the UI throttle.
        if (!events.some((x) => x.kind === 'combat-contact')) {
          events.push({ tick, kind: 'combat-contact', message: e.message })
        }
        continue
      }
      events.push({ tick, kind: e.kind, message: e.message })

      // Stats: the old ambush counter now tallies raiders destroyed.
      if (e.kind === 'unit-destroyed' && e.side === 'hostile') {
        stats = { ...stats, ambushes: stats.ambushes + 1 }
      }

      // A dead player mech takes its pilot with it (cockpit rule).
      if (e.kind === 'unit-destroyed' && e.side === 'player' && e.unitId !== CRAWLER_UNIT_ID) {
        const dead = units.find((u) => u.id === e.unitId)
        const pilot = dead?.pilotId ? pilots.find((p) => p.id === dead.pilotId) : undefined
        if (pilot) {
          pilots = pilots.filter((p) => p.id !== pilot.id)
          events.push({ tick, kind: 'pilot-kia', message: `${pilot.name} KIA` })
        }
        units = units.filter((u) => u.id !== e.unitId)
      }

      // A dead convoy collapses to a cargo wreck: the unit and its
      // quantum go, the cargo (less the raiders' cut) stays on the
      // ground for whoever salvages it.
      if (e.kind === 'unit-destroyed' && e.side === 'neutral' && e.unitId) {
        const quantumId = quantumIdOfHauler(e.unitId)
        const q = quantumId ? quanta.find((x) => x.id === quantumId) : undefined
        const dead = units.find((u) => u.id === e.unitId)
        if (q && dead) {
          if (q.cargo) {
            const keep = e.attackerSide === 'hostile' ? 1 - RAID_LOOT_FRACTION : 1
            const qty = Math.floor(q.cargo.qty * keep)
            if (qty > 0) {
              wrecks = [
                ...wrecks,
                {
                  id: `wreck-${q.id}-${tick}`,
                  lat: dead.lat,
                  lng: dead.lng,
                  cargo: { commodity: q.cargo.commodity, qty },
                  createdTick: tick,
                },
              ]
            }
          }
          quanta = quanta.filter((x) => x.id !== q.id)
          units = units.filter((u) => u.id !== e.unitId)

          const escort = active.find((c) => c.type === 'escort' && c.quantumId === q.id)
          if (escort) {
            active = active.filter((c) => c.id !== escort.id)
            reputation = adjustReputation(reputation, escort.faction, REP_FAILED)
            stats = { ...stats, contractsFailed: stats.contractsFailed + 1 }
            events.push({
              tick,
              kind: 'contract-failed',
              message: `CONTRACT FAILED — ESCORTED CONVOY ${q.id.toUpperCase()} LOST`,
            })
          }

          if (e.attackerSide === 'player') {
            // The shipment's buyer remembers who shot the trucks.
            const buyer = q.destination ? world.nodes[q.destination] : undefined
            if (buyer) {
              reputation = adjustReputation(reputation, nodeFaction(buyer), REP_PIRACY)
            }
            events.push({
              tick,
              kind: 'piracy',
              message: `PIRACY — CONVOY ${q.id.toUpperCase()} DESTROYED BY YOUR LANCE`,
            })
          } else {
            events.push({
              tick,
              kind: 'convoy-lost',
              message: `CONVOY ${q.id.toUpperCase()} LOST TO RAIDERS`,
            })
          }
        }
      }
    }

    for (const dock of result.docked) {
      if (dock.unitId === CRAWLER_UNIT_ID) {
        crawlerDock = dock.nodeId
        const node = world.nodes[dock.nodeId]
        events.push({
          tick,
          kind: 'arrival',
          message: `DOCKED AT ${node?.name?.toUpperCase() ?? dock.nodeId}`,
        })
      }
    }
  }

  // ── Crawler fuel ──────────────────────────────────────────────────
  // Route risk is no longer dice — raider bands are live units that
  // the strategic stage above handles like everything else.
  if (crawlerMoving && crawlerCanMove) {
    const fuel = Math.max(0, company.fuel - FUEL_BURN_PER_TICK)
    company = { ...company, fuel }
    if (fuel <= 0 && findCrawler(units)?.order.kind === 'move') {
      events.push({ tick, kind: 'fuel-empty', message: 'FUEL EXHAUSTED — CRAWLER HALTED' })
    }
  }

  // ── Combat/security resolution: last hostile down → paid ──────────
  for (const contract of active) {
    if (contract.type !== 'combat' && contract.type !== 'security') continue
    const tagged =
      contract.type === 'combat'
        ? units.filter((u) => u.contractId === contract.id)
        : units.filter((u) => u.bandId === contract.bandId)
    if (contract.type === 'combat' && tagged.length === 0) continue // never spawned
    if (tagged.some((u) => !unitDestroyed(u))) continue
    // (A security target band fully despawned counts as cleared.)

    // One wreck is sometimes towable — it joins the garage as-is,
    // dead components and all, needing real repairs before it fights.
    let wrecks = tagged
    if (rng.next() < SALVAGE_MECH_CHANCE && tagged.length > 0) {
      const prize = tagged[0]
      const recovered: Unit = {
        ...prize,
        id: `salv-${contract.id}`,
        name: `SALVAGE ${CHASSIS[prize.chassisId]?.name.split(' ').pop()?.toUpperCase() ?? 'FRAME'}`,
        side: 'player',
        order: { kind: 'hold' },
        cooldowns: {},
        contractId: undefined,
        npcPilot: undefined,
        spawn: undefined,
      }
      garage = [...garage, recovered]
      wrecks = tagged.slice(1)
      events.push({
        tick,
        kind: 'salvage-recovered',
        message: `WRECK RECOVERED — ${recovered.name} TOWED TO GARAGE`,
      })
    }

    const salvage = rollSalvage(wrecks, rng)
    let cargo = company.cargo
    const space = company.cargoCapacity - cargoUsed(company)
    const metal = Math.min(salvage.metal, space)
    if (metal > 0) cargo = addCargo(cargo, 'metal', metal)
    const precision = Math.min(salvage.precision, space - metal)
    if (precision > 0) cargo = addCargo(cargo, 'precision', precision)

    company = { ...company, credits: company.credits + contract.pay, cargo }
    units = units.filter((u) =>
      contract.type === 'combat'
        ? u.contractId !== contract.id
        : u.bandId !== contract.bandId,
    )
    active = active.filter((c) => c.id !== contract.id)
    reputation = adjustReputation(reputation, contract.faction, REP_COMPLETED)
    stats = {
      ...stats,
      contractsCompleted: stats.contractsCompleted + 1,
      creditsEarned: stats.creditsEarned + contract.pay,
    }
    events.push({
      tick,
      kind: 'contract-completed',
      message: `CONTRACT COMPLETE — ¤${contract.pay} + SALVAGE (${metal} METAL${precision ? `, ${precision} PRECISION` : ''})`,
    })
    // Surviving the fight teaches everyone still in the field.
    const deployedPilotIds = new Set(
      units.filter((u) => u.pilotId && !unitDestroyed(u)).map((u) => u.pilotId),
    )
    pilots = pilots.map((p) => (deployedPilotIds.has(p.id) ? growSkills(p) : p))
  }

  // ── Escort resolution: chartered convoy docked at its destination ─
  for (const contract of active) {
    if (contract.type !== 'escort') continue
    const q = quanta.find((x) => x.id === contract.quantumId)
    if (!q) {
      // Convoy gone without a death event this tick — defensive: fail.
      active = active.filter((c) => c.id !== contract.id)
      reputation = adjustReputation(reputation, contract.faction, REP_FAILED)
      stats = { ...stats, contractsFailed: stats.contractsFailed + 1 }
      events.push({
        tick,
        kind: 'contract-failed',
        message: `CONTRACT FAILED — CONVOY ${contract.quantumId.toUpperCase()} LOST`,
      })
      continue
    }
    if (q.location !== contract.destination) continue
    company = { ...company, credits: company.credits + contract.pay }
    active = active.filter((c) => c.id !== contract.id)
    reputation = adjustReputation(reputation, contract.faction, REP_COMPLETED)
    stats = {
      ...stats,
      contractsCompleted: stats.contractsCompleted + 1,
      creditsEarned: stats.creditsEarned + contract.pay,
    }
    events.push({
      tick,
      kind: 'convoy-arrived',
      message: `CONVOY ${q.id.toUpperCase()} ARRIVED SAFELY — ¤${contract.pay}`,
    })
  }

  // ── Contracts: hard deadlines ─────────────────────────────────────
  // Combat contracts with player units at the site are exempt — the
  // fight in progress decides them, not the clock.
  if (active.length > 0) {
    const playerUnits = units.filter((u) => u.side === 'player' && !unitDestroyed(u))
    const engagedIds = active
      .filter((c) => {
        if (c.type !== 'combat' && c.type !== 'security') return false
        const site =
          c.type === 'security' ? c.site : world.nodes[c.destination]?.position
        if (!site) return false
        return playerUnits.some(
          (u) => marsDistance(u.lat, u.lng, site[0], site[1]) <= ENGAGED_KM,
        )
      })
      .map((c) => c.id)

    let failed: typeof active = []
    for (const c of active) {
      if (engagedIds.includes(c.id)) continue
      const result = updateActiveContracts([c], tick)
      if (result.failed.length > 0) failed = [...failed, ...result.failed]
    }
    if (failed.length > 0) {
      const failedIds = new Set(failed.map((c) => c.id))
      active = active.filter((c) => !failedIds.has(c.id))
      stats = { ...stats, contractsFailed: stats.contractsFailed + failed.length }
      for (const c of failed) {
        reputation = adjustReputation(reputation, c.faction, REP_FAILED)
        // Failed combat garrisons stand down; a failed patrol's band
        // just keeps camping — it lives in the world either way.
        if (c.type === 'combat') {
          units = units.filter((u) => u.contractId !== c.id)
        }
        const what =
          c.type === 'combat'
            ? `CLEAR ${c.hostiles} HOSTILES AT ${c.destination.toUpperCase()}`
            : c.type === 'security'
              ? `PATROL — DESTROY BAND (${c.hostiles})`
              : `${c.quantity} ${c.commodity.toUpperCase()} TO ${c.destination.toUpperCase()}`
        events.push({
          tick,
          kind: 'contract-failed',
          message: `CONTRACT FAILED — ${what} MISSED DEADLINE`,
        })
      }
    }
  }

  // ── Boards, hiring pools, dealer lots: refresh where docked ──────
  if (crawlerDock !== null && boardStale(boards[crawlerDock], tick)) {
    let board = generateBoard(
      crawlerDock,
      world,
      rng,
      tick,
      markets,
      reputation,
      units,
      wrecks,
    )
    // Escort charters mutate the world (shipment pre-bought, departure
    // scheduled), so they merge in from their own generator.
    const charters = generateEscortOffers(
      crawlerDock,
      world,
      quanta,
      markets,
      units,
      rng,
      tick,
      reputation,
    )
    if (charters.offers.length > 0) {
      board = { ...board, contracts: [...board.contracts, ...charters.offers] }
      quanta = charters.quanta
      markets = charters.markets
    }
    boards = { ...boards, [crawlerDock]: board }
  }
  if (crawlerDock !== null && hirePoolStale(hirePools[crawlerDock], tick)) {
    const node = world.nodes[crawlerDock]
    if (node) {
      hirePools = { ...hirePools, [crawlerDock]: generateHirePool(node, rng, tick) }
      mechLots = { ...mechLots, [crawlerDock]: generateMechLot(node, rng, tick) }
    }
  }

  // ── Quanta in transit (every tick — it's one progress add each) ──
  quanta = moveQuanta(quanta, world.routes, tick)

  // ── Convoy war: materialize/dematerialize passing convoys ─────────
  if (tick % CONVOY_THREAT_INTERVAL === 0) {
    const escortedBands = new Map<string, string>()
    for (const c of active) {
      if (c.type === 'escort') escortedBands.set(c.quantumId, c.bandId)
    }
    const scan = scanConvoys(quanta, units, world.routes, tick, bandRaids, escortedBands)
    quanta = scan.quanta
    units = scan.units
    bandRaids = scan.bandRaids
    for (const raid of scan.attacked) {
      events.push({
        tick,
        kind: 'convoy-attacked',
        message: `RAIDERS SORTIE — CONVOY ${raid.quantumId.toUpperCase()} UNDER ATTACK`,
      })
    }
  }

  // ── Economy step: production, pricing, quanta decisions ──────────
  if (tick % ECON_INTERVAL === 0) {
    const liveBands = liveBandIds(units)
    const wreckIds = new Set(wrecks.map((w) => w.id))
    const contractedWrecks = new Set(
      active.filter((c) => c.type === 'salvage').map((c) => c.wreckId),
    )
    const quantaById = new Map(quanta.map((q) => [q.id, q]))
    const pruned: typeof boards = {}
    for (const [nodeId, board] of Object.entries(boards)) {
      const base = pruneBoard(board, tick)
      // Drop offers whose subject is gone: patrols on dead bands,
      // escorts whose convoy departed/died or whose threat evaporated,
      // salvage on vanished or already-contracted wrecks.
      const kept = base.contracts.filter((c) => {
        if (c.type === 'security') return liveBands.has(c.bandId)
        if (c.type === 'escort') {
          const q = quantaById.get(c.quantumId)
          return (
            q !== undefined &&
            q.location === c.origin &&
            q.holdUntilTick !== undefined &&
            liveBands.has(c.bandId)
          )
        }
        if (c.type === 'salvage') {
          return wreckIds.has(c.wreckId) && !contractedWrecks.has(c.wreckId)
        }
        return true
      })
      pruned[nodeId] =
        kept.length === base.contracts.length ? base : { ...base, contracts: kept }
    }
    boards = pruned

    // Cargo wrecks rust away unlooted — unless somebody holds the
    // salvage contract on them.
    const keptWrecks = wrecks.filter(
      (w) =>
        w.cargo.qty > 0 &&
        (tick - w.createdTick <= WRECK_TTL_TICKS || contractedWrecks.has(w.id)),
    )
    if (keptWrecks.length !== wrecks.length) wrecks = keptWrecks

    // The hauler population self-heals — predation is pressure on the
    // markets, not a demographic collapse.
    quanta = refillQuanta(quanta, Object.keys(world.nodes), QUANTA_COUNT, rng)

    // Raid cooldown bookkeeping dies with its band.
    if (Object.keys(bandRaids).some((id) => !liveBands.has(id))) {
      bandRaids = Object.fromEntries(
        Object.entries(bandRaids).filter(([id]) => liveBands.has(id)),
      )
    }

    // Battlefield decay: hostile wrecks nobody holds a contract on rust
    // away — without this, every uncontracted band kill grows units[]
    // forever. Wrecks of live or contracted bands stay (salvage rolls
    // off them at contract completion).
    const securityBands = new Set(
      active.filter((c) => c.type === 'security').map((c) => c.bandId),
    )
    const combatIds = new Set(active.filter((c) => c.type === 'combat').map((c) => c.id))
    const decayed = units.filter((u) => {
      if (u.side !== 'hostile' || !unitDestroyed(u)) return true
      if (u.contractId && combatIds.has(u.contractId)) return true
      if (u.bandId && (liveBands.has(u.bandId) || securityBands.has(u.bandId))) return true
      return false
    })
    if (decayed.length !== units.length) units = decayed

    markets = econStep(world.nodes, markets, rng)
    const result = quantaDecisions(quanta, markets, world.routes, rng)
    quanta = result.quanta
    markets = result.markets

    // Pilots wind down between fights — faster docked at a barracks.
    // (Combat stress inflow dwarfs this rate, so no in-combat guard.)
    if (pilots.some((p) => p.stress > 0)) {
      const rate = crawlerDock !== null ? STRESS_RECOVERY_DOCKED : STRESS_RECOVERY_FIELD
      pilots = pilots.map((p) => recoverStress(p, rate))
    }

    // Raider band maintenance: the world never pacifies.
    if (tick >= raiderRespawnAt && liveBands.size < RAIDER_BAND_TARGET) {
      const camp = pickCampSite(world, rng)
      units = [...units, ...spawnBand(raiderSerial, camp, rng)]
      raiderSerial = raiderSerial + 1
      raiderRespawnAt = tick + RAIDER_RESPAWN_TICKS
    }
  }

  // ── Sensor sweep: snapshot every node within range ────────────────
  if (tick % OBSERVE_INTERVAL === 0) {
    const crawlerNow = findCrawler(units)
    if (crawlerNow) {
      let next: typeof intel | null = null
      for (const node of Object.values(world.nodes)) {
        const inRange =
          crawlerDock === node.id ||
          marsDistance(crawlerNow.lat, crawlerNow.lng, node.position[0], node.position[1]) <=
            SENSOR_RANGE_KM
        if (!inRange) continue
        const market = markets[node.id]
        if (!market) continue
        if (!next) next = { ...intel }
        next[node.id] = { observedTick: tick, market }
      }
      if (next) intel = next
    }
  }

  // ── End conditions ────────────────────────────────────────────────
  let endState: EndState | null = state.endState
  const crawlerNow = findCrawler(units)
  const crawlerDestroyed = !crawlerNow || unitDestroyed(crawlerNow)
  const cheapCheck =
    crawlerDestroyed ||
    company.credits >= state.params.creditTarget ||
    (crawlerNow?.order.kind === 'move' && company.fuel <= 0)
  if (cheapCheck || (crawlerDock !== null && tick % END_CHECK_INTERVAL === 0)) {
    const canFight =
      units.some(
        (u) => u.side === 'player' && u.id !== CRAWLER_UNIT_ID && !unitDestroyed(u),
      ) ||
      garage.some(
        (u) => !unitDestroyed(u) && u.pilotId && pilots.some((p) => p.id === u.pilotId),
      )
    endState = checkEndConditions({
      tick,
      crawler: crawlerNow,
      crawlerDock,
      company,
      markets,
      routes: world.routes,
      active,
      canFight,
      creditTarget: state.params.creditTarget,
    })
    if (endState) {
      events.push({
        tick,
        kind: endState.kind,
        message:
          endState.kind === 'victory'
            ? 'DEBT CLEARED — CONTRACT FULFILLED'
            : endState.kind === 'destroyed'
              ? 'SERVER CORE DESTROYED — SIGNAL LOST'
              : endState.kind === 'stranded'
                ? 'CRAWLER STRANDED — NO FUEL, NO FUNDS'
                : 'COMPANY BANKRUPT — ASSETS SEIZED',
      })
    }
  }

  return {
    state: {
      ...state,
      tick,
      rngState: rng.state,
      company,
      markets,
      boards,
      active,
      units,
      garage,
      crawlerDock,
      quanta,
      wrecks,
      bandRaids,
      pilots,
      hirePools,
      mechLots,
      raiderRespawnAt,
      raiderSerial,
      reputation,
      intel,
      stats,
      endState,
    },
    events,
  }
}
