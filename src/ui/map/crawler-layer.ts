/**
 * Crawler rendering layer for MapLibre.
 *
 * Renders the player's crawler as a bright marker.
 * Interpolates position every frame using the alpha fraction
 * for smooth movement between simulation ticks.
 */
import type { Map as MaplibreMap } from 'maplibre-gl'
import { crawler } from '../../stores/crawler'
import { routes } from '../../stores/world'
import { alpha } from '../../stores/time'
import { interpolateRoutePath, CRAWLER_SPEED_KM_S } from '../../sim/crawler/movement'
import { TICK_DURATION_MS } from '../../sim/tick'

const SOURCE_ID = 'crawler'
const MARKER_LAYER = 'crawler-marker'
const LABEL_LAYER = 'crawler-label'

const TICK_DURATION_S = TICK_DURATION_MS / 1000

function crawlerGeoJSON(lat: number, lng: number): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      properties: { name: 'CRAWLER' },
    }],
  }
}

/**
 * Compute the interpolated display position for the crawler.
 * Advances the stored progress by alpha × progressPerTick
 * so the marker moves smoothly between simulation ticks.
 */
function displayPosition(): [number, number] {
  const state = crawler.get()
  if (!state.currentRoute) return [state.lat, state.lng]

  const routeMap = routes.get()
  const route = routeMap[state.currentRoute]
  if (!route) return [state.lat, state.lng]

  const progressPerTick = (CRAWLER_SPEED_KM_S * TICK_DURATION_S) / (route.distance * route.terrain)
  const displayProgress = Math.min(state.routeProgress + alpha.get() * progressPerTick, 1.0)

  const path = state.routeReversed ? [...route.path].reverse() : route.path
  return interpolateRoutePath(path, displayProgress)
}

function updateSource(map: MaplibreMap) {
  const source = map.getSource(SOURCE_ID)
  if (!source || !('setData' in source)) return
  const [lat, lng] = displayPosition()
  ;(source as any).setData(crawlerGeoJSON(lat, lng))
}

/**
 * Add crawler layer to a MapLibre map.
 * Returns a cleanup function.
 */
export function addCrawlerLayer(map: MaplibreMap): () => void {
  const [lat, lng] = displayPosition()

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: crawlerGeoJSON(lat, lng),
  })

  map.addLayer({
    id: MARKER_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 5, 7, 10, 10],
      'circle-color': '#00ff88',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 1,
    },
  })

  map.addLayer({
    id: LABEL_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': 'CRAWLER',
      'text-font': ['Open Sans Regular'],
      'text-size': 10,
      'text-offset': [0, 1.8],
      'text-anchor': 'top',
      'text-letter-spacing': 0.1,
    },
    paint: {
      'text-color': '#00ff88',
      'text-halo-color': '#0a0a0a',
      'text-halo-width': 1.5,
    },
  })

  // Update on every alpha change (every render frame) for smooth interpolation
  const unsubAlpha = alpha.subscribe(() => updateSource(map))
  // Also update when the crawler state changes (route start/end)
  const unsubCrawler = crawler.subscribe(() => updateSource(map))

  return () => {
    unsubAlpha()
    unsubCrawler()
    if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER)
    if (map.getLayer(MARKER_LAYER)) map.removeLayer(MARKER_LAYER)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  }
}
