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
  /** Is the current route being traversed in reverse? */
  routeReversed: boolean
  /** Queued route segments for multi-hop travel: [routeId, reversed] pairs */
  routeQueue: [string, boolean][]
}

const defaultCrawler: CrawlerState = {
  lat: -12.0,
  lng: -70.0,
  currentNode: 'valles-hub',
  currentRoute: null,
  routeProgress: 0,
  destination: null,
  routeReversed: false,
  routeQueue: [],
}

export const crawler = persistentAtom<CrawlerState>('mech:crawler', defaultCrawler, {
  encode: JSON.stringify,
  decode: JSON.parse,
})
