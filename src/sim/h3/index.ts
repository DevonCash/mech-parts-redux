/**
 * H3 hexagonal grid utilities for Mars.
 *
 * Wraps h3-js with Mars-specific resolution selection and viewport queries.
 * All functions here are pure — no DOM, no stores.
 */
import {
  latLngToCell,
  cellToBoundary,
  cellToLatLng,
  getResolution,
  polygonToCells,
} from 'h3-js'

export { latLngToCell, cellToBoundary, cellToLatLng, getResolution }

/**
 * Map zoom level → H3 resolution.
 *
 * | Map zoom | H3 res | Mars edge | Use                          |
 * |----------|--------|-----------|------------------------------|
 * | 0–3      | 2      | ~97 km    | Faction territories          |
 * | 3–5      | 3      | ~37 km    | Strategic sub-regions        |
 * | 5–7      | 4      | ~14 km    | Crawler movement             |
 * | 7–9      | 5      | ~5.2 km   | Settlements, contracts       |
 * | 9–11     | 6      | ~2.0 km   | Tactical area of operations  |
 * | 11–13    | 7      | ~750 m    | Tactical maneuvering         |
 * | 13+      | 8      | ~280 m    | Unit positioning             |
 */
export function zoomToResolution(zoom: number): number {
  if (zoom < 3) return 2
  if (zoom < 5) return 3
  if (zoom < 7) return 4
  if (zoom < 9) return 5
  if (zoom < 11) return 6
  if (zoom < 13) return 7
  return 8
}

export interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

/**
 * Get all H3 cells visible within a map viewport.
 *
 * Converts the bounding box to a polygon and fills it with cells
 * at the resolution appropriate for the current zoom level.
 */
export function cellsInViewport(bounds: Bounds, zoom: number): string[] {
  const res = zoomToResolution(zoom)

  // Clamp latitude to valid range
  const north = Math.min(bounds.north, 90)
  const south = Math.max(bounds.south, -90)

  // Build polygon ring (closed, lat/lng pairs for h3-js)
  // h3-js polygonToCells expects [lat, lng] coordinate pairs
  const polygon = [
    [north, bounds.west],
    [north, bounds.east],
    [south, bounds.east],
    [south, bounds.west],
    [north, bounds.west], // close the ring
  ] as [number, number][]

  try {
    return polygonToCells([polygon], res)
  } catch {
    // polygonToCells can fail for very large or pole-crossing polygons
    // Fall back to empty — the map will just show no hexes until zoomed in
    return []
  }
}

/**
 * Convert an H3 cell boundary to a GeoJSON-compatible coordinate ring.
 * H3 returns [lat, lng] but GeoJSON uses [lng, lat].
 */
export function cellBoundaryToGeoJSON(cell: string): [number, number][] {
  const boundary = cellToBoundary(cell)
  // Close the ring and flip to [lng, lat] for GeoJSON
  const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number])
  coords.push(coords[0]) // close ring
  return coords
}
