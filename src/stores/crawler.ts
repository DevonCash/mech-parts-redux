import { atom } from 'nanostores'
import type { Route } from '../sim/economy/models'

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
  /** Synthetic route for an off-road leg (currentRoute = OVERLAND_ROUTE_ID).
   *  Lives on the crawler because it isn't part of the route network. */
  overlandRoute: Route | null
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
  overlandRoute: null,
}

// Plain atom: writing localStorage every tick is a perf hazard, and
// partial persistence desyncs from the rest of the session. Persistence
// goes through the save system (stores/save.ts) at tick boundaries.
export const crawler = atom<CrawlerState>(defaultCrawler)
