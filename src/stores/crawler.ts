import { persistentAtom } from '@nanostores/persistent'

export interface CrawlerState {
  /** Current latitude on Mars */
  lat: number
  /** Current longitude on Mars */
  lng: number
  /** Node ID if docked, null if in transit */
  currentNode: string | null
  /** Route ID if moving along a route, null if stationary */
  currentRoute: string | null
  /** Progress along current route, 0–1 */
  routeProgress: number
  /** Destination node ID, null if none */
  destination: string | null
}

const defaultCrawler: CrawlerState = {
  lat: -4.5, // Near Valles Marineris
  lng: -137.4,
  currentNode: null,
  currentRoute: null,
  routeProgress: 0,
  destination: null,
}

export const crawler = persistentAtom<CrawlerState>('mech:crawler', defaultCrawler, {
  encode: JSON.stringify,
  decode: JSON.parse,
})
