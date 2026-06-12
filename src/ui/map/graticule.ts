/**
 * Runtime-generated graticule (lat/lng grid) so the globe reads as a
 * planet when terrain data is unavailable. Lines are densified so they
 * curve correctly under the globe projection.
 */

interface GraticuleFeature {
  type: "Feature";
  properties: { kind: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface GraticuleCollection {
  type: "FeatureCollection";
  features: GraticuleFeature[];
}

const STEP_DEG = 15;
const DENSIFY_DEG = 2;

export function buildGraticule(): GraticuleCollection {
  const features: GraticuleFeature[] = [];

  // Parallels
  for (let lat = -75; lat <= 75; lat += STEP_DEG) {
    const coords: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += DENSIFY_DEG) {
      coords.push([lng, lat]);
    }
    features.push({
      type: "Feature",
      properties: { kind: lat === 0 ? "equator" : "parallel" },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  // Meridians
  for (let lng = -180; lng < 180; lng += STEP_DEG) {
    const coords: [number, number][] = [];
    for (let lat = -88; lat <= 88; lat += DENSIFY_DEG) {
      coords.push([lng, lat]);
    }
    features.push({
      type: "Feature",
      properties: { kind: lng === 0 ? "meridian0" : "meridian" },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  return { type: "FeatureCollection", features };
}
