/**
 * Synthetic Mars heightmap — a fixed procedural planet.
 *
 * The real MOLA pipeline produces multi-GB tiles that can't live in the
 * repo, so the world's elevation is a pure function instead: seeded
 * value-noise fBm sampled on the unit sphere (no antimeridian seams, no
 * pole pinch), shaped Mars-fashion — southern highlands, northern
 * lowlands, a couple of great basins, one big shield volcano.
 *
 * One function serves both consumers: the map renderer rasterizes it
 * into terrarium DEM tiles (src/ui/map/synthetic-dem.ts), and route
 * generation prices roads by the ground they cross (terrainRoughness →
 * Route.terrain). Deterministic everywhere — CI needs no data files.
 */
import {
  TERRAIN_FACTOR_MAX,
  TERRAIN_FACTOR_MIN,
  TERRAIN_ROUGHNESS_FULL_M,
  TERRAIN_SEED,
} from '../balance'
import { marsDistance } from '../constants'

// ── Seeded 3D value noise ───────────────────────────────────────────

/** Integer-lattice hash → [0, 1). Pure 32-bit ops — identical output
 *  on every platform, which is what makes the planet a constant. */
function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683)) | 0
  h = (h + Math.imul(TERRAIN_SEED, 144665)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Trilinear value noise in [-1, 1]. */
function valueNoise3(x: number, y: number, z: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const tx = smooth(x - x0)
  const ty = smooth(y - y0)
  const tz = smooth(z - z0)

  let result = 0
  for (let dx = 0; dx <= 1; dx++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dz = 0; dz <= 1; dz++) {
        const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz)
        if (w === 0) continue
        result += w * hash3(x0 + dx, y0 + dy, z0 + dz)
      }
    }
  }
  return result * 2 - 1
}

/** Fractal Brownian motion over valueNoise3, roughly [-1, 1]. */
function fbm(x: number, y: number, z: number, octaves: number): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq)
    amp *= 0.5
    freq *= 2
  }
  return sum
}

// ── Planet shape ────────────────────────────────────────────────────

const DEG = Math.PI / 180

/** Hand-placed great basins (Hellas-flavored) and one shield volcano.
 *  Coordinates avoid the seeded settlement band where possible. */
const BASINS: { lat: number; lng: number; radiusKm: number; depthM: number }[] = [
  { lat: -42, lng: 66, radiusKm: 1100, depthM: 6800 },
  { lat: -47, lng: -94, radiusKm: 650, depthM: 3800 },
]
const VOLCANO = { lat: 16, lng: -128, radiusKm: 800, heightM: 14000 }

/** Smoothstep falloff 1 → 0 over [0, 1]. */
function falloff(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - c * c * (3 - 2 * c)
}

/**
 * Elevation in meters at a point — the one source of terrain truth.
 */
export function marsElevation(lat: number, lng: number): number {
  const latR = lat * DEG
  const lngR = lng * DEG
  const cx = Math.cos(latR) * Math.cos(lngR)
  const cy = Math.cos(latR) * Math.sin(lngR)
  const cz = Math.sin(latR)

  // Crustal dichotomy: southern highlands vs northern lowlands, with a
  // noise-warped boundary so it reads as geography, not a parallel.
  const warp = fbm(cx * 1.6 + 11.3, cy * 1.6 + 11.3, cz * 1.6 + 11.3, 3)
  const dichotomy = Math.tanh(3 * (-cz + 0.55 * warp)) * 2600

  // Broad uplands and local relief.
  const continents = fbm(cx * 2.2, cy * 2.2, cz * 2.2, 4) * 2400
  const detail = fbm(cx * 9 + 47.0, cy * 9 + 47.0, cz * 9 + 47.0, 5) * 1300

  let elevation = dichotomy + continents + detail

  for (const b of BASINS) {
    const d = marsDistance(lat, lng, b.lat, b.lng)
    if (d < b.radiusKm * 1.25) {
      // Bowl with a modest rim just outside the rim line.
      const t = d / b.radiusKm
      elevation -= b.depthM * falloff(t)
      elevation += b.depthM * 0.12 * Math.max(0, 1 - Math.abs(t - 1) * 4)
    }
  }

  {
    const d = marsDistance(lat, lng, VOLCANO.lat, VOLCANO.lng)
    if (d < VOLCANO.radiusKm) {
      const t = d / VOLCANO.radiusKm
      elevation += VOLCANO.heightM * falloff(t) * falloff(t)
    }
  }

  return Math.max(-8000, Math.min(14000, elevation))
}

// ── Roughness → route terrain factor ────────────────────────────────

/** Sample spacing for local relief — the scale a road winds through
 *  (finer rings only see the last noise octave and flatten the band). */
const ROUGHNESS_RING_KM = 40
const KM_PER_DEG = 59.2

/**
 * Mean absolute relief (m) around a point — how much the ground rises
 * and falls at road scale.
 */
export function terrainRoughness(lat: number, lng: number): number {
  const center = marsElevation(lat, lng)
  const dLat = ROUGHNESS_RING_KM / KM_PER_DEG
  const dLng = ROUGHNESS_RING_KM / (KM_PER_DEG * Math.max(0.2, Math.cos(lat * DEG)))
  let sum = 0
  sum += Math.abs(marsElevation(lat + dLat, lng) - center)
  sum += Math.abs(marsElevation(lat - dLat, lng) - center)
  sum += Math.abs(marsElevation(lat, lng + dLng) - center)
  sum += Math.abs(marsElevation(lat, lng - dLng) - center)
  return sum / 4
}

/**
 * Terrain cost factor for a road along `path` (route polyline).
 * effectiveKm = distance × factor; the road speed multiplier is its
 * reciprocal. Flat plains grade to TERRAIN_FACTOR_MIN (today's global
 * stub), mountain crossings approach TERRAIN_FACTOR_MAX.
 */
export function routeTerrainFactor(path: [number, number][]): number {
  if (path.length === 0) return TERRAIN_FACTOR_MIN
  // Every ~4th waypoint (~200 km spacing) is plenty for a route mean.
  let sum = 0
  let count = 0
  for (let i = 0; i < path.length; i += 4) {
    sum += terrainRoughness(path[i][0], path[i][1])
    count++
  }
  const mean = sum / count
  const t = Math.min(1, mean / TERRAIN_ROUGHNESS_FULL_M)
  return TERRAIN_FACTOR_MIN + t * (TERRAIN_FACTOR_MAX - TERRAIN_FACTOR_MIN)
}
