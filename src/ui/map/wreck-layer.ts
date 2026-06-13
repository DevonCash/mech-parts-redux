/**
 * Cargo wreck rendering — killed convoys leave amber diamond markers
 * holding their cargo. Fogged like everything else: only wrecks within
 * sensor range render. Clicking a wreck in loot range transfers cargo
 * to the crawler hold.
 */
import type { Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'
import { wrecks } from '../../stores/world'
import { crawlerUnit, units } from '../../stores/units'
import { lootWreck } from '../../stores/contracts'
import { pushEvents } from '../../stores/events'
import { tick } from '../../stores/time'
import { withinSensorRange } from '../../sim/intel/models'
import { marsDistance } from '../../sim/constants'
import { cancelLayerUpdate, scheduleLayerUpdate } from './layer-scheduler'

const SOURCE_ID = 'wrecks'
const LAYER_ID = 'wreck-markers'
const LABEL_LAYER_ID = 'wreck-labels'

function wreckGeoJSON() {
  const crawler = crawlerUnit()
  const features: any[] = []
  for (const w of wrecks.get()) {
    if (!withinSensorRange(crawler, w.lat, w.lng)) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
      properties: {
        id: w.id,
        label: `${w.cargo.qty} ${w.cargo.commodity.toUpperCase()}`,
      },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}

export function addWreckLayer(map: MaplibreMap): () => void {
  map.addSource(SOURCE_ID, { type: 'geojson', data: wreckGeoJSON() })

  map.addLayer({
    id: LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 5, 3.5, 10, 5],
      'circle-color': 'rgba(0, 0, 0, 0)',
      'circle-stroke-color': 'rgba(208, 160, 64, 0.9)',
      'circle-stroke-width': 1.5,
    },
  })

  map.addLayer({
    id: LABEL_LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: 5,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 10,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': 'rgba(208, 160, 64, 0.9)',
      'text-halo-color': 'rgba(0, 0, 0, 0.8)',
      'text-halo-width': 1,
    },
  })

  const onClick = (e: MapMouseEvent) => {
    const feats = map.queryRenderedFeatures(e.point, { layers: [LAYER_ID] })
    const id = feats[0]?.properties?.id
    if (!id) return
    const label = feats[0]?.properties?.label ?? 'CARGO'
    const result = lootWreck(String(id))
    if (result.ok) {
      pushEvents([
        { tick: tick.get(), kind: 'salvage-recovered', message: `WRECK LOOTED — ${label}` },
      ])
    }
  }
  map.on('click', onClick)

  // Crawler position only matters for the fog edge — rebuild when the
  // wreck list itself changes, or the crawler has moved >1 km (visual
  // tolerance; markers fade in at worst one km late).
  let lastWrecks: unknown = null
  let lastLat = NaN
  let lastLng = NaN
  const rebuild = () => {
    const source = map.getSource(SOURCE_ID)
    if (!source || !('setData' in source)) return
    const w = wrecks.get()
    const c = crawlerUnit()
    const moved =
      !!c &&
      (Number.isNaN(lastLat) || marsDistance(c.lat, c.lng, lastLat, lastLng) > 1)
    if (w === lastWrecks && !moved) return
    lastWrecks = w
    if (c) {
      lastLat = c.lat
      lastLng = c.lng
    }
    ;(source as any).setData(wreckGeoJSON())
  }
  const refresh = () => scheduleLayerUpdate(rebuild)
  const unsubs = [wrecks.subscribe(refresh), units.subscribe(refresh)]

  return () => {
    unsubs.forEach((u) => u())
    cancelLayerUpdate(rebuild)
    map.off('click', onClick)
    if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID)
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  }
}
