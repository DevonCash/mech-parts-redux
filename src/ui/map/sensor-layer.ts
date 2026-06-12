/**
 * Sensor range ring around the crawler — the visible edge of what the
 * company can currently observe. Everything outside is stale intel.
 */
import type { Map as MaplibreMap } from 'maplibre-gl'
import { crawlerUnit, units } from '../../stores/units'
import { SENSOR_RANGE_KM } from '../../sim/intel/models'
import { MARS_RADIUS_KM } from '../../sim/constants'

const SOURCE_ID = 'sensor-ring'
const LAYER_ID = 'sensor-ring-line'

const SEGMENTS = 72

/** Small circle of the given radius around a point, on the Mars sphere. */
function ringGeoJSON(latDeg: number, lngDeg: number) {
  const lat = (latDeg * Math.PI) / 180
  const lng = (lngDeg * Math.PI) / 180
  const angular = SENSOR_RANGE_KM / MARS_RADIUS_KM

  const coords: [number, number][] = []
  for (let i = 0; i <= SEGMENTS; i++) {
    const bearing = (2 * Math.PI * i) / SEGMENTS
    const pLat = Math.asin(
      Math.sin(lat) * Math.cos(angular) +
        Math.cos(lat) * Math.sin(angular) * Math.cos(bearing),
    )
    const pLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
        Math.cos(angular) - Math.sin(lat) * Math.sin(pLat),
      )
    coords.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI])
  }

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: coords },
        properties: {},
      },
    ],
  }
}

export function addSensorLayer(map: MaplibreMap): () => void {
  const crawler = crawlerUnit()
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: ringGeoJSON(crawler?.lat ?? 0, crawler?.lng ?? 0),
  })

  map.addLayer({
    id: LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    paint: {
      'line-color': 'rgba(0, 255, 136, 0.25)',
      'line-width': 1,
      'line-dasharray': [3, 3],
    },
  })

  let pending = false
  const refresh = () => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => {
      pending = false
      const source = map.getSource(SOURCE_ID)
      if (source && 'setData' in source) {
        const c = crawlerUnit()
        if (c) (source as any).setData(ringGeoJSON(c.lat, c.lng))
      }
    })
  }
  const unsubscribe = units.subscribe(refresh)

  return () => {
    unsubscribe()
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  }
}
