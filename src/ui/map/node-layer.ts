/**
 * Node rendering layer for MapLibre.
 *
 * Reads nodes from the world store, converts to GeoJSON,
 * and manages circle + label layers on the map.
 */
import type { Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'
import { nodes } from '../../stores/world'
import { selectNode, clearSelection } from '../../stores/selection'
import type { GameNode, NodeType } from '../../sim/economy/models'

const SOURCE_ID = 'nodes'
const CIRCLE_LAYER = 'node-circles'
const LABEL_LAYER = 'node-labels'

/** Color per node type — wireframe palette */
const NODE_COLORS: Record<NodeType, string> = {
  extraction: '#e08030',   // orange
  processing: '#d0c040',   // yellow
  settlement: '#40c060',   // green
  depot:      '#4080d0',   // blue
  terminal:   '#e0e0e0',   // white
}

function nodesToGeoJSON(nodeMap: Record<string, GameNode>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.values(nodeMap).map(node => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [node.position[1], node.position[0]], // GeoJSON is [lng, lat]
      },
      properties: {
        id: node.id,
        name: node.name,
        type: node.type,
      },
    })),
  }
}

/**
 * Add node layers to a MapLibre map.
 * Returns a cleanup function that removes the layers and unsubscribes from store updates.
 */
export function addNodeLayer(map: MaplibreMap): () => void {
  const data = nodesToGeoJSON(nodes.get())

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data,
  })

  // Circle markers — color by type
  map.addLayer({
    id: CIRCLE_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 5, 5, 10, 8],
      'circle-color': [
        'match', ['get', 'type'],
        'extraction', NODE_COLORS.extraction,
        'processing', NODE_COLORS.processing,
        'settlement', NODE_COLORS.settlement,
        'depot',      NODE_COLORS.depot,
        'terminal',   NODE_COLORS.terminal,
        '#888',
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255, 255, 255, 0.4)',
      'circle-opacity': 0.9,
    },
  })

  // Labels — node name, visible at mid zoom+
  map.addLayer({
    id: LABEL_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: 4,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 12],
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': 'rgba(255, 255, 255, 0.7)',
      'text-halo-color': '#0a0a0a',
      'text-halo-width': 1,
    },
  })

  // Click to select a node
  const onClick = (e: MapMouseEvent) => {
    const features = map.queryRenderedFeatures(e.point, { layers: [CIRCLE_LAYER] })
    if (features.length > 0) {
      const id = features[0].properties?.id
      if (id) selectNode(id)
    } else {
      clearSelection()
    }
  }
  map.on('click', onClick)

  // Pointer cursor on hover
  const onMouseEnter = () => { map.getCanvas().style.cursor = 'pointer' }
  const onMouseLeave = () => { map.getCanvas().style.cursor = '' }
  map.on('mouseenter', CIRCLE_LAYER, onMouseEnter)
  map.on('mouseleave', CIRCLE_LAYER, onMouseLeave)

  // Update GeoJSON when the store changes
  const unsubscribe = nodes.subscribe(nodeMap => {
    const source = map.getSource(SOURCE_ID)
    if (source && 'setData' in source) {
      (source as any).setData(nodesToGeoJSON(nodeMap))
    }
  })

  return () => {
    unsubscribe()
    map.off('click', onClick)
    map.off('mouseenter', CIRCLE_LAYER, onMouseEnter)
    map.off('mouseleave', CIRCLE_LAYER, onMouseLeave)
    if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER)
    if (map.getLayer(CIRCLE_LAYER)) map.removeLayer(CIRCLE_LAYER)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  }
}
