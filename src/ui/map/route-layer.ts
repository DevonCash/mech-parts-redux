/**
 * Route rendering layer for MapLibre.
 *
 * Reads routes from the world store, converts to GeoJSON lines,
 * and manages a dashed-line layer on the map.
 */
import type { Map as MaplibreMap } from 'maplibre-gl'
import { routes } from '../../stores/world'
import type { Route } from '../../sim/economy/models'

const SOURCE_ID = 'routes'
const LINE_LAYER = 'route-lines'

function routesToGeoJSON(routeMap: Record<string, Route>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.values(routeMap).map(route => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.path.map(([lat, lng]) => [lng, lat]), // GeoJSON is [lng, lat]
      },
      properties: {
        id: route.id,
        from: route.from,
        to: route.to,
        distance: route.distance,
        terrain: route.terrain,
      },
    })),
  }
}

/**
 * Add route layers to a MapLibre map.
 * Should be called before addNodeLayer so routes render below nodes.
 * Returns a cleanup function.
 */
export function addRouteLayer(map: MaplibreMap): () => void {
  const data = routesToGeoJSON(routes.get())

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data,
  })

  map.addLayer({
    id: LINE_LAYER,
    type: 'line',
    source: SOURCE_ID,
    minzoom: 2,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': 'rgba(255, 255, 255, 0.5)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 6, 2, 10, 3],
      'line-dasharray': [3, 2],
    },
  })

  // Update when the store changes
  const unsubscribe = routes.subscribe(routeMap => {
    const source = map.getSource(SOURCE_ID)
    if (source && 'setData' in source) {
      (source as any).setData(routesToGeoJSON(routeMap))
    }
  })

  return () => {
    unsubscribe()
    if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  }
}
