/**
 * Synthetic DEM tiles — rasterizes the procedural heightmap
 * (src/sim/terrain/heightmap.ts) into terrarium-encoded tiles at
 * runtime. Stands in for /data/mars-terrain.pmtiles when the real
 * MOLA tileset isn't present (dev, CI, fresh clones): same encoding,
 * same tile grid, zero data files.
 */
import { marsElevation } from '../../sim/terrain/heightmap'
import type { TerrainDemSource } from './terrain-shader'

export const SYNTHETIC_DEM_PROTOCOL = 'synthetic-dem'
export const SYNTHETIC_DEM_TILE_URL = `${SYNTHETIC_DEM_PROTOCOL}://{z}/{x}/{y}`
/** Matches the real pipeline's tileset — higher zooms overzoom z7. */
export const SYNTHETIC_DEM_MAXZOOM = 7

const TILE_SIZE = 512

/** Inverse Web Mercator for a tile pixel row. */
function tileLat(z: number, y: number, py: number): number {
  const n = 1 << z
  const mercY = (y + py / TILE_SIZE) / n
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY))) * 180) / Math.PI
}

function tileLng(z: number, x: number, px: number): number {
  const n = 1 << z
  return ((x + px / TILE_SIZE) / n) * 360 - 180
}

/**
 * Rasterize one DEM tile. Terrarium encoding, matching the shader and
 * maplibre raster-dem decoder: elevation = (R*256 + G + B/256) − 32768.
 */
export function syntheticTileImageData(z: number, x: number, y: number): ImageData {
  const data = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
  for (let j = 0; j < TILE_SIZE; j++) {
    const lat = tileLat(z, y, j + 0.5)
    for (let i = 0; i < TILE_SIZE; i++) {
      const lng = tileLng(z, x, i + 0.5)
      const v = Math.round(marsElevation(lat, lng)) + 32768
      const o = (j * TILE_SIZE + i) * 4
      data[o] = v >> 8
      data[o + 1] = v & 255
      data[o + 2] = 0
      data[o + 3] = 255
    }
  }
  return new ImageData(data, TILE_SIZE, TILE_SIZE)
}

// PNG-encoded tiles for the raster-dem source. MapLibre caches tiles
// itself; this small cache only absorbs the dem + hillshade sources
// both asking for the same coordinates.
const pngCache = new Map<string, Promise<ArrayBuffer>>()
const PNG_CACHE_MAX = 64

async function encodePng(imageData: ImageData): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height)
  canvas.getContext('2d')!.putImageData(imageData, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return blob.arrayBuffer()
}

/** DEM provider for the hillshade shader — skips the PNG round-trip. */
export function syntheticDemSource(): TerrainDemSource {
  return {
    maxzoom: SYNTHETIC_DEM_MAXZOOM,
    getTile: (z, x, y) => createImageBitmap(syntheticTileImageData(z, x, y)),
  }
}

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
    png = encodePng(syntheticTileImageData(tz, x >> (z - tz), y >> (z - tz)))
    if (pngCache.size >= PNG_CACHE_MAX) {
      const oldest = pngCache.keys().next().value
      if (oldest !== undefined) pngCache.delete(oldest)
    }
    pngCache.set(key, png)
  }
  return { data: (await png).slice(0) }
}
