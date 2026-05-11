/**
 * Route path generation between two positions on Mars.
 *
 * M1 implementation: great-circle path subdivided into segments.
 * Future: A* over H3 grid weighted by elevation data.
 */
import { marsDistance } from '../constants'

/**
 * Generate a great-circle path between two lat/lng positions,
 * subdivided into roughly equal segments.
 *
 * Returns an array of [lat, lng] waypoints including start and end.
 */
export function greatCirclePath(
  from: [number, number],
  to: [number, number],
  segmentLengthKm = 50,
): [number, number][] {
  const distance = marsDistance(from[0], from[1], to[0], to[1])
  const segments = Math.max(2, Math.ceil(distance / segmentLengthKm))

  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI

  const lat1 = toRad(from[0])
  const lng1 = toRad(from[1])
  const lat2 = toRad(to[0])
  const lng2 = toRad(to[1])

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
    )
  )

  // Degenerate case: same point
  if (d < 1e-10) return [from, to]

  const path: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const f = i / segments

    const a = Math.sin((1 - f) * d) / Math.sin(d)
    const b = Math.sin(f * d) / Math.sin(d)

    const x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2)
    const y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2)
    const z = a * Math.sin(lat1) + b * Math.sin(lat2)

    const lat = Math.atan2(z, Math.sqrt(x ** 2 + y ** 2))
    const lng = Math.atan2(y, x)

    path.push([toDeg(lat), toDeg(lng)])
  }

  return path
}

/**
 * Compute the total path length in km by summing segment distances.
 */
export function pathDistance(path: [number, number][]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += marsDistance(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1])
  }
  return total
}
