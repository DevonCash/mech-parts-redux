/**
 * NPC convoy rendering — hauler quanta in transit show as small dim
 * dots crawling the route network. Fogged: only contacts within the
 * crawler's sensor range render — the economy runs everywhere, but you
 * only see the slice your sensors reach. Updates are throttled to
 * animation frames via the quanta store subscription.
 */
import type { Map as MaplibreMap } from 'maplibre-gl'
import { quanta, routes } from '../../stores/world'
import { crawlerUnit, units } from '../../stores/units'
import { quantumPosition } from '../../sim/economy/quanta'
import { withinSensorRange } from '../../sim/intel/models'

const SOURCE_ID = 'quanta'
const LAYER_ID = 'quanta-dots'

function quantaGeoJSON() {
  const routeMap = routes.get()
  const crawler = crawlerUnit()
  const features: any[] = []
  for (const q of quanta.get()) {
    // Materialized convoys are real units — the unit layer draws them.
    if (q.materialized) continue
    const pos = quantumPosition(q, routeMap)
    if (!pos) continue
    if (!withinSensorRange(crawler, pos[0], pos[1])) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pos[1], pos[0]] },
      properties: { cargo: q.cargo?.commodity ?? null },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}

export function addQuantaLayer(map: MaplibreMap): () => void {
  map.addSource(SOURCE_ID, { type: 'geojson', data: quantaGeoJSON() })

  map.addLayer({
    id: LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 1.5, 5, 2.5, 10, 4],
      // Loaded convoys glow faintly amber; deadheads are dim gray.
      'circle-color': [
        'case',
        ['!=', ['get', 'cargo'], null],
        'rgba(208, 192, 64, 0.75)',
        'rgba(180, 180, 180, 0.45)',
      ],
    },
  })

  // setData at most once per animation frame regardless of tick rate.
  let pending = false
  const refresh = () => {
    if (pending) return
    pending = true
    requestAnimationFrame(() => {
      pending = false
      const source = map.getSource(SOURCE_ID)
      if (source && 'setData' in source) (source as any).setData(quantaGeoJSON())
    })
  }
  // Crawler position gates visibility, so its movement re-fogs too.
  const unsubs = [quanta.subscribe(refresh), units.subscribe(refresh)]

  return () => {
    unsubs.forEach((u) => u())
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  }
}
