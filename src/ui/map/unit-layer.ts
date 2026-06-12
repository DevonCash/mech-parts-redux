/**
 * Strategic unit rendering + order input — one layer for everything
 * that moves under command: crawler (large marker), mechs (green),
 * hostiles (red), wrecks (dim).
 *
 * Select-then-command, identical for every unit: click a friendly unit
 * to select it; click ground to issue a direct move; click a hostile to
 * issue an attack. Node clicks fall through to node selection (NodeInfo
 * issues road/direct travel orders).
 */
import type { Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'
import { selectedUnit, setUnitOrder, units } from '../../stores/units'
import { moveCrawlerTo } from '../../stores/travel'
import { CRAWLER_UNIT_ID } from '../../sim/combat/catalog'
import { unitDestroyed } from '../../sim/combat/damage'
import type { Unit } from '../../sim/combat/models'
import { withinSensorRange } from '../../sim/intel/models'

const SOURCE_ID = 'units'
const ORDER_SOURCE_ID = 'unit-orders'
const MARKER_LAYER = 'unit-markers'
const RING_LAYER = 'unit-selection-ring'
const LABEL_LAYER = 'unit-labels'
const ORDER_LAYER = 'unit-order-lines'

type FC = { type: 'FeatureCollection'; features: any[] }

/**
 * Hostiles (and their wrecks) only exist on the map inside the
 * crawler's sensor ring — raider camps are discovered, not given.
 * Player units are always visible.
 */
function visibleUnits(all: Unit[]): Unit[] {
  const crawler = all.find((u) => u.id === CRAWLER_UNIT_ID)
  return all.filter(
    (u) => u.side === 'player' || withinSensorRange(crawler, u.lat, u.lng),
  )
}

function unitsGeoJSON(all: Unit[], selected: string | null): FC {
  return {
    type: 'FeatureCollection',
    features: all.map((u) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [u.lng, u.lat] },
      properties: {
        id: u.id,
        name: u.name,
        side: u.side,
        crawler: u.id === CRAWLER_UNIT_ID,
        dead: unitDestroyed(u),
        selected: u.id === selected,
      },
    })),
  }
}

function ordersGeoJSON(all: Unit[]): FC {
  const features: any[] = []
  for (const u of all) {
    if (u.side !== 'player' || unitDestroyed(u)) continue
    if (u.order.kind === 'move' && u.order.waypoints.length > 0) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [u.lng, u.lat],
            ...u.order.waypoints.map(([lat, lng]) => [lng, lat]),
          ],
        },
        properties: { kind: u.order.mode === 'road' ? 'road' : 'move' },
      })
    } else if (u.order.kind === 'attack') {
      const t = all.find((x) => x.id === (u.order as any).targetId)
      if (t) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [u.lng, u.lat],
              [t.lng, t.lat],
            ],
          },
          properties: { kind: 'attack' },
        })
      }
    }
  }
  return { type: 'FeatureCollection', features }
}

export function addUnitLayer(map: MaplibreMap): () => void {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: unitsGeoJSON(visibleUnits(units.get()), null),
  })
  map.addSource(ORDER_SOURCE_ID, { type: 'geojson', data: ordersGeoJSON(units.get()) })

  map.addLayer({
    id: ORDER_LAYER,
    type: 'line',
    source: ORDER_SOURCE_ID,
    paint: {
      'line-color': [
        'match', ['get', 'kind'],
        'attack', 'rgba(255, 80, 80, 0.6)',
        'road', 'rgba(0, 255, 136, 0.35)',
        'rgba(208, 192, 64, 0.5)',
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
      'circle-radius': ['case', ['get', 'crawler'], 14, 12],
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
      // Zoom expressions must be top-level — nesting the interpolate
      // inside a case gets the whole layer rejected by maplibre.
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        0, ['case', ['get', 'dead'], 4, ['get', 'crawler'], 5, 7],
        5, ['case', ['get', 'dead'], 4, ['get', 'crawler'], 7, 7],
        10, ['case', ['get', 'dead'], 4, ['get', 'crawler'], 10, 7],
      ],
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
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular'],
      'text-size': ['case', ['get', 'crawler'], 10, 9],
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'text-color': [
        'case',
        ['get', 'crawler'], '#00ff88',
        'rgba(255, 255, 255, 0.8)',
      ],
      'text-halo-color': '#0a0a0a',
      'text-halo-width': 1,
    },
  })

  let pending = false
  const refresh = () => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => {
      pending = false
      const all = units.get()
      const sel = selectedUnit.get()
      const source = map.getSource(SOURCE_ID)
      if (source && 'setData' in source) {
        ;(source as any).setData(unitsGeoJSON(visibleUnits(all), sel))
      }
      const orderSource = map.getSource(ORDER_SOURCE_ID)
      if (orderSource && 'setData' in orderSource) {
        ;(orderSource as any).setData(ordersGeoJSON(all))
      }
    })
  }

  const onClick = (e: MapMouseEvent) => {
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

    // Ground click: direct move order for the selected unit. Node
    // clicks fall through to node selection instead.
    const nodeFeatures = map.queryRenderedFeatures(e.point, { layers: ['node-circles'] })
    if (nodeFeatures.length > 0) return
    const sel = selectedUnit.get()
    if (!sel) return
    if (sel === CRAWLER_UNIT_ID) {
      moveCrawlerTo(e.lngLat.lat, e.lngLat.lng)
    } else {
      const unit = units.get().find((u) => u.id === sel)
      if (!unit) return
      setUnitOrder(sel, {
        kind: 'move',
        waypoints: [[e.lngLat.lat, e.lngLat.lng]],
        mode: 'open',
      })
    }
  }
  map.on('click', onClick)

  const unsubs = [units.subscribe(refresh), selectedUnit.subscribe(refresh)]

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
