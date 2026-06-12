/**
 * Engagement unit rendering + order input.
 *
 * Player units green, hostiles red, wrecks dim. Click a friendly unit
 * to select it; click ground to issue a move order; click a hostile to
 * issue an attack order. Order lines show each selected unit's intent.
 */
import type { Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'
import { engagement, selectedUnit, setUnitOrder } from '../../stores/combat'
import { unitDestroyed } from '../../sim/combat/damage'
import type { Engagement } from '../../sim/combat/models'

const SOURCE_ID = 'units'
const ORDER_SOURCE_ID = 'unit-orders'
const MARKER_LAYER = 'unit-markers'
const RING_LAYER = 'unit-selection-ring'
const LABEL_LAYER = 'unit-labels'
const ORDER_LAYER = 'unit-order-lines'

type FC = { type: 'FeatureCollection'; features: any[] }

function unitsGeoJSON(eng: Engagement | null, selected: string | null): FC {
  if (!eng) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: eng.units.map((u) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [u.lng, u.lat] },
      properties: {
        id: u.id,
        name: u.name,
        side: u.side,
        dead: unitDestroyed(u),
        selected: u.id === selected,
      },
    })),
  }
}

function ordersGeoJSON(eng: Engagement | null): FC {
  if (!eng) return { type: 'FeatureCollection', features: [] }
  const features: any[] = []
  for (const u of eng.units) {
    if (u.side !== 'player' || unitDestroyed(u)) continue
    let target: [number, number] | null = null
    let kind = u.order.kind
    if (u.order.kind === 'move') target = [u.order.lng, u.order.lat]
    if (u.order.kind === 'attack') {
      const t = eng.units.find((x) => x.id === (u.order as any).targetId)
      if (t) target = [t.lng, t.lat]
    }
    if (target) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[u.lng, u.lat], target] },
        properties: { kind },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export function addUnitLayer(map: MaplibreMap): () => void {
  map.addSource(SOURCE_ID, { type: 'geojson', data: unitsGeoJSON(null, null) })
  map.addSource(ORDER_SOURCE_ID, { type: 'geojson', data: ordersGeoJSON(null) })

  map.addLayer({
    id: ORDER_LAYER,
    type: 'line',
    source: ORDER_SOURCE_ID,
    paint: {
      'line-color': [
        'match', ['get', 'kind'],
        'attack', 'rgba(255, 80, 80, 0.6)',
        'rgba(0, 255, 136, 0.5)',
      ],
      'line-width': 1.5,
      'line-dasharray': [2, 2],
    },
  })

  map.addLayer({
    id: RING_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'selected'], true],
    paint: {
      'circle-radius': 12,
      'circle-color': 'transparent',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  })

  map.addLayer({
    id: MARKER_LAYER,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['case', ['get', 'dead'], 4, 7],
      'circle-color': [
        'case',
        ['get', 'dead'], 'rgba(120, 120, 120, 0.5)',
        ['==', ['get', 'side'], 'player'], '#00ff88',
        '#ff5050',
      ],
      'circle-stroke-color': '#0a0a0a',
      'circle-stroke-width': 1.5,
    },
  })

  map.addLayer({
    id: LABEL_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: 9,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular'],
      'text-size': 9,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': 'rgba(255, 255, 255, 0.8)',
      'text-halo-color': '#0a0a0a',
      'text-halo-width': 1,
    },
  })

  const refresh = () => {
    const eng = engagement.get()
    const sel = selectedUnit.get()
    const source = map.getSource(SOURCE_ID)
    if (source && 'setData' in source) (source as any).setData(unitsGeoJSON(eng, sel))
    const orderSource = map.getSource(ORDER_SOURCE_ID)
    if (orderSource && 'setData' in orderSource) {
      ;(orderSource as any).setData(ordersGeoJSON(eng))
    }
  }

  const onClick = (e: MapMouseEvent) => {
    const eng = engagement.get()
    if (!eng || eng.status !== 'active') return

    const unitFeatures = map.queryRenderedFeatures(e.point, { layers: [MARKER_LAYER] })
    if (unitFeatures.length > 0) {
      const props = unitFeatures[0].properties
      if (props?.dead) return
      if (props?.side === 'player') {
        selectedUnit.set(props.id)
      } else if (props?.side === 'hostile') {
        const sel = selectedUnit.get()
        if (sel) setUnitOrder(sel, { kind: 'attack', targetId: props.id })
      }
      return
    }

    // Ground click: move order for the selected unit (unless a node was
    // the actual click target — let node selection handle that).
    const nodeFeatures = map.queryRenderedFeatures(e.point, { layers: ['node-circles'] })
    if (nodeFeatures.length > 0) return
    const sel = selectedUnit.get()
    if (sel) {
      setUnitOrder(sel, { kind: 'move', lat: e.lngLat.lat, lng: e.lngLat.lng })
    }
  }
  map.on('click', onClick)

  const unsubs = [engagement.subscribe(refresh), selectedUnit.subscribe(refresh)]

  return () => {
    unsubs.forEach((u) => u())
    map.off('click', onClick)
    for (const layer of [LABEL_LAYER, MARKER_LAYER, RING_LAYER, ORDER_LAYER]) {
      if (map.getLayer(layer)) map.removeLayer(layer)
    }
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    if (map.getSource(ORDER_SOURCE_ID)) map.removeSource(ORDER_SOURCE_ID)
  }
}
