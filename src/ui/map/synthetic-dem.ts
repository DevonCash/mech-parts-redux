/**
 * Synthetic DEM tiles — rasterizes the procedural heightmap
 * (src/sim/terrain/heightmap.ts) into terrarium-encoded tiles at
 * runtime. Stands in for /data/mars-terrain.pmtiles when the real
 * MOLA tileset isn't present (dev, CI, fresh clones): same encoding,
 * same tile grid, zero data files.
 *
 * Rasterization (~262k heightmap samples per tile) and PNG encoding
 * run in a dedicated worker (dem-worker.ts) so tile generation never
 * blocks the main thread during pan/zoom.
 */
import type { TerrainDemSource } from './terrain-shader'

export const SYNTHETIC_DEM_PROTOCOL = 'synthetic-dem'
export const SYNTHETIC_DEM_TILE_URL = `${SYNTHETIC_DEM_PROTOCOL}://{z}/{x}/{y}`
/** Matches the real pipeline's tileset — higher zooms overzoom z7. */
export const SYNTHETIC_DEM_MAXZOOM = 7

// ── Worker RPC ──────────────────────────────────────────────────────
interface WorkerReply {
  id: number
  bitmap?: ImageBitmap
  data?: ArrayBuffer
  error?: string
}

let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<
  number,
  { resolve: (reply: WorkerReply) => void; reject: (e: Error) => void }
>()

function failAllPending(reason: string): void {
  for (const req of pending.values()) req.reject(new Error(reason))
  pending.clear()
}

function demWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./dem-worker.ts', import.meta.url), {
    type: 'module',
  })
  w.onmessage = (e: MessageEvent<WorkerReply>) => {
    const req = pending.get(e.data.id)
    if (!req) return
    pending.delete(e.data.id)
    if (e.data.error !== undefined) req.reject(new Error(e.data.error))
    else req.resolve(e.data)
  }
  // A worker-level failure (module load error, uncaught throw) would
  // otherwise leave every pending tile promise unsettled forever —
  // terrain just never loads, with no recovery. Reject the in-flight
  // requests and drop the handle so the next request respawns a worker.
  const onFailure = (msg: string) => {
    failAllPending(msg)
    if (worker === w) worker = null
  }
  w.onerror = (e) => onFailure(`DEM worker error: ${e.message || 'unknown'}`)
  w.onmessageerror = () => onFailure('DEM worker message deserialization failed')
  worker = w
  return w
}

function requestTile(
  kind: 'raw' | 'png',
  z: number,
  x: number,
  y: number,
): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++
    pending.set(id, { resolve, reject })
    demWorker().postMessage({ id, kind, z, x, y })
  })
}

/** DEM provider for the hillshade shader — skips the PNG round-trip.
 *  The worker builds and transfers the bitmap, so the main thread does
 *  no per-tile pixel copy. */
export function syntheticDemSource(): TerrainDemSource {
  return {
    maxzoom: SYNTHETIC_DEM_MAXZOOM,
    getTile: async (z, x, y) => (await requestTile('raw', z, x, y)).bitmap ?? null,
  }
}

// PNG-encoded tiles for the raster-dem source. MapLibre caches decoded
// tiles itself; this cache absorbs re-requests across source reloads
// and the dem + hillshade sources asking for the same coordinates.
// PNGs are small (tens of KB) — the raw-pixel cache lives in the worker.
const pngCache = new Map<string, Promise<ArrayBuffer>>()
const PNG_CACHE_MAX = 128

/** MapLibre protocol handler: synthetic-dem://{z}/{x}/{y} → PNG. */
export async function syntheticDemHandler(params: {
  url: string
}): Promise<{ data: ArrayBuffer }> {
  const match = /\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url)
  if (!match) throw new Error(`Invalid tile URL: ${params.url}`)
  const [, z, x, y] = match.map(Number)
  const tz = Math.min(z, SYNTHETIC_DEM_MAXZOOM)

  const key = `${tz}/${x >> (z - tz)}/${y >> (z - tz)}`
  let png = pngCache.get(key)
  if (!png) {
    png = requestTile('png', tz, x >> (z - tz), y >> (z - tz)).then((r) => r.data!)
    if (pngCache.size >= PNG_CACHE_MAX) {
      const oldest = pngCache.keys().next().value
      if (oldest !== undefined) pngCache.delete(oldest)
    }
    pngCache.set(key, png)
  }
  return { data: (await png).slice(0) }
}
