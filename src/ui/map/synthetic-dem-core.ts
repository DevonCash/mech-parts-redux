/**
 * Synthetic DEM rasterization core — pure pixel math shared by the
 * DEM worker (the normal path) and any main-thread fallback. Kept
 * dependency-light so it loads in a worker: it imports only the pure
 * seeded heightmap.
 */
import { marsElevation } from '../../sim/terrain/heightmap'

export const TILE_SIZE = 512

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
export function syntheticTilePixels(
  z: number,
  x: number,
  y: number,
): Uint8ClampedArray<ArrayBuffer> {
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
  return data
}
