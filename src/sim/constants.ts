/** Earth's mean equatorial radius in km (used by H3 internally) */
export const EARTH_RADIUS_KM = 6_371.0

/** Mars's mean equatorial radius in km */
export const MARS_RADIUS_KM = 3_389.5

/** Ratio of Mars radius to Earth radius — apply to H3's Earth-based values */
export const MARS_EARTH_RATIO = MARS_RADIUS_KM / EARTH_RADIUS_KM // ≈ 0.5320

/** One Mars solar day in Earth seconds (24h 37m 22s) */
export const SOL_SECONDS = 88_642

/** Convert an H3 edge length (documented for Earth) to Mars scale */
export function h3EdgeToMars(earthEdgeKm: number): number {
  return earthEdgeKm * MARS_EARTH_RATIO
}

/** Convert an H3 cell area (documented for Earth) to Mars scale */
export function h3AreaToMars(earthAreaKm2: number): number {
  return earthAreaKm2 * MARS_EARTH_RATIO ** 2
}

/** Great-circle distance between two lat/lng points on Mars (Haversine), in km */
export function marsDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * MARS_RADIUS_KM * Math.asin(Math.sqrt(a))
}
