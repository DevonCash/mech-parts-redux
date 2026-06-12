/**
 * Raider bands — live units replacing the old ambush dice.
 *
 * Bands ride technicals (fast, fragile armed trucks) camped beside
 * road segments. Route danger is no longer a stat: a road is dangerous
 * because a band is actually there, and your sensors can see why — or
 * fail to. Route.danger survives only as *banditry potential*, the
 * spawn weight for where camps appear.
 */
import {
  RAIDER_BAND_SIZE_MAX,
  RAIDER_BAND_SIZE_MIN,
  RAIDER_CAMP_THREAT,
  RAIDER_CAMP_THREAT_KM,
  RAIDER_DANGER_BASE,
  TECHNICAL_LEASH_KM,
  CAMP_MECH_LEASH_KM,
  CAMP_MECH_CHANCE,
} from '../balance'
import { marsDistance } from '../constants'
import type { Rng } from '../rng'
import type { GameNode, Route } from '../economy/models'
import { buildUnit } from '../combat/catalog'
import { unitDestroyed } from '../combat/damage'
import { generatePilot } from '../pilots/models'
import type { Unit } from '../combat/models'

export interface WorldLike {
  nodes: Record<string, GameNode>
  routes: Record<string, Route>
}

/**
 * Pick a camp site: a mid-path waypoint of a route chosen by banditry
 * weight, nudged off the road a little.
 */
export function pickCampSite(world: WorldLike, rng: Rng): [number, number] {
  const routes = Object.values(world.routes).sort((a, b) => a.id.localeCompare(b.id))
  const totalWeight = routes.reduce((s, r) => s + r.danger, 0)
  let roll = rng.next() * totalWeight
  let route = routes[routes.length - 1]
  for (const r of routes) {
    roll -= r.danger
    if (roll <= 0) {
      route = r
      break
    }
  }
  // Middle half of the path — camps sit on the open road, not at docks.
  const lo = Math.floor(route.path.length * 0.25)
  const hi = Math.max(lo + 1, Math.floor(route.path.length * 0.75))
  const [lat, lng] = route.path[rng.int(lo, hi - 1)]
  return [lat + rng.range(-0.03, 0.03), lng + rng.range(-0.03, 0.03)]
}

/** Spawn one band at a camp: technicals plus sometimes a guard mech. */
export function spawnBand(
  serial: number,
  camp: [number, number],
  rng: Rng,
): Unit[] {
  const bandId = `band-${serial}`
  const units: Unit[] = []
  const technicals = rng.int(RAIDER_BAND_SIZE_MIN, RAIDER_BAND_SIZE_MAX)

  for (let i = 0; i < technicals; i++) {
    units.push({
      ...buildUnit(
        `${bandId}-t${i}`,
        `TECHNICAL ${i + 1}`,
        'technical',
        'hostile',
        camp[0] + rng.range(-0.01, 0.01),
        camp[1] + rng.range(-0.01, 0.01),
      ),
      bandId,
      spawn: camp,
      leashKm: TECHNICAL_LEASH_KM,
      npcPilot: generatePilot(`${bandId}-tp${i}`, rng, 'raider'),
    })
  }

  if (rng.next() < CAMP_MECH_CHANCE) {
    units.push({
      ...buildUnit(`${bandId}-m`, 'CAMP GUARD', 'raider-scout', 'hostile', camp[0], camp[1]),
      bandId,
      spawn: camp,
      leashKm: CAMP_MECH_LEASH_KM,
      npcPilot: generatePilot(`${bandId}-mp`, rng, 'raider'),
    })
  }

  return units
}

/** Distinct band ids with at least one living unit. */
export function liveBandIds(units: Unit[]): Set<string> {
  const ids = new Set<string>()
  for (const u of units) {
    if (u.bandId && !unitDestroyed(u)) ids.add(u.bandId)
  }
  return ids
}

export interface BandCamp {
  bandId: string
  camp: [number, number]
}

/** Camp anchors of living bands (one per band), tagged with their band id. */
export function liveBandCamps(units: Unit[]): BandCamp[] {
  const seen = new Set<string>()
  const camps: BandCamp[] = []
  for (const u of units) {
    if (!u.bandId || !u.spawn || unitDestroyed(u) || seen.has(u.bandId)) continue
    seen.add(u.bandId)
    camps.push({ bandId: u.bandId, camp: u.spawn })
  }
  return camps
}

/** Camp anchors of living bands (one per band). */
export function liveCamps(units: Unit[]): [number, number][] {
  return liveBandCamps(units).map((c) => c.camp)
}

/**
 * How threatened a route is by camps near its path. Callers iterating
 * several routes should compute `liveCamps(units)` once and pass it.
 */
export function routeLiveDanger(
  route: Route,
  units: Unit[],
  camps: [number, number][] = liveCamps(units),
): number {
  let danger = RAIDER_DANGER_BASE
  for (const camp of camps) {
    // Waypoints sit ~50 km apart — every one must be checked or a camp
    // can fall between samples. Only runs at board generation.
    for (const [lat, lng] of route.path) {
      if (marsDistance(camp[0], camp[1], lat, lng) <= RAIDER_CAMP_THREAT_KM) {
        danger += RAIDER_CAMP_THREAT
        break // one hit per camp
      }
    }
  }
  return Math.min(1, danger)
}

export interface NearbyBand {
  bandId: string
  camp: [number, number]
  size: number
}

/** Living bands camped near any route touching a node — patrol targets. */
export function bandsNearNode(
  world: WorldLike,
  nodeId: string,
  units: Unit[],
  withinKm: number,
): NearbyBand[] {
  const node = world.nodes[nodeId]
  if (!node) return []

  const byBand = new Map<string, { camp: [number, number]; size: number }>()
  for (const u of units) {
    if (!u.bandId || !u.spawn || unitDestroyed(u)) continue
    const entry = byBand.get(u.bandId)
    if (entry) entry.size++
    else byBand.set(u.bandId, { camp: u.spawn, size: 1 })
  }

  const result: NearbyBand[] = []
  for (const [bandId, { camp, size }] of byBand) {
    // Near the node itself, or near any adjacent route's path.
    let near = marsDistance(camp[0], camp[1], node.position[0], node.position[1]) <= withinKm
    if (!near) {
      for (const route of Object.values(world.routes)) {
        if (route.from !== nodeId && route.to !== nodeId) continue
        for (const [lat, lng] of route.path) {
          if (marsDistance(camp[0], camp[1], lat, lng) <= withinKm) {
            near = true
            break
          }
        }
        if (near) break
      }
    }
    if (near) result.push({ bandId, camp, size })
  }
  return result.sort((a, b) => a.bandId.localeCompare(b.bandId))
}
