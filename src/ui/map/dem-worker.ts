/**
 * Synthetic DEM tile worker — runs the per-pixel heightmap
 * rasterization (~262k marsElevation samples per 512² tile) and PNG
 * encoding off the main thread so map panning never blocks on tile
 * generation. Same seeded math, identical bytes.
 */
import { syntheticTilePixels, TILE_SIZE } from './synthetic-dem-core'

interface TileRequest {
  id: number
  kind: 'raw' | 'png'
  z: number
  x: number
  y: number
}

// The hillshade-shader source and the raster-dem source ask for the
// same coordinates — compute each tile once and serve both kinds.
const pixelCache = new Map<string, Uint8ClampedArray<ArrayBuffer>>()
const PIXEL_CACHE_MAX = 32

function tilePixels(z: number, x: number, y: number): Uint8ClampedArray<ArrayBuffer> {
  const key = `${z}/${x}/${y}`
  const hit = pixelCache.get(key)
  if (hit) return hit
  const pixels = syntheticTilePixels(z, x, y)
  if (pixelCache.size >= PIXEL_CACHE_MAX) {
    const oldest = pixelCache.keys().next().value
    if (oldest !== undefined) pixelCache.delete(oldest)
  }
  pixelCache.set(key, pixels)
  return pixels
}

self.onmessage = async (e: MessageEvent<TileRequest>) => {
  const { id, kind, z, x, y } = e.data
  const port = self as unknown as Worker
  try {
    const pixels = tilePixels(z, x, y)
    // ImageData wraps the cached buffer by reference; createImageBitmap and
    // putImageData only read it, so the cache entry stays valid.
    const image = new ImageData(pixels, TILE_SIZE, TILE_SIZE)
    if (kind === 'raw') {
      // Build the bitmap here and transfer it — the main thread skips the
      // ~1 MB ImageData copy + decode it used to do per tile.
      const bitmap = await createImageBitmap(image)
      port.postMessage({ id, bitmap }, [bitmap])
    } else {
      const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE)
      canvas.getContext('2d')!.putImageData(image, 0, 0)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      const png = await blob.arrayBuffer()
      port.postMessage({ id, data: png }, [png])
    }
  } catch (err) {
    port.postMessage({ id, error: String(err) })
  }
}
