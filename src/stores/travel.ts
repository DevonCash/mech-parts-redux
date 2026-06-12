/**
 * Crawler travel — thin wrappers that build move orders (the same
 * order type every unit takes) and issue them through setUnitOrder.
 */
import { nodes, routes } from './world'
import {
  buildDirectMoveOrder,
  buildGroundMoveOrder,
  buildRoadMoveOrder,
} from '../sim/combat/orders'
import { CRAWLER_UNIT_ID } from '../sim/combat/catalog'
import { crawlerDock, crawlerUnit, setUnitOrder, type ActionResult } from './units'

/** Follow the road network to a node (fast, cheap, watched). */
export function travelTo(targetNodeId: string): boolean {
  const from = crawlerDock.get()
  if (!from || from === targetNodeId) return false

  const order = buildRoadMoveOrder(from, targetNodeId, nodes.get(), routes.get())
  if (!order) return false
  return setUnitOrder(CRAWLER_UNIT_ID, order).ok
}

/** Straight across open terrain to a node (slow, thirsty, quiet). */
export function travelOverland(targetNodeId: string): boolean {
  const crawler = crawlerUnit()
  const target = nodes.get()[targetNodeId]
  if (!crawler || !target) return false
  if (crawlerDock.get() === targetNodeId) return false

  return setUnitOrder(
    CRAWLER_UNIT_ID,
    buildDirectMoveOrder([crawler.lat, crawler.lng], target),
  ).ok
}

/** Free move to an arbitrary map point (ground click). */
export function moveCrawlerTo(lat: number, lng: number): ActionResult {
  const crawler = crawlerUnit()
  if (!crawler) return { ok: false, reason: 'NO CRAWLER' }
  return setUnitOrder(
    CRAWLER_UNIT_ID,
    buildGroundMoveOrder([crawler.lat, crawler.lng], [lat, lng]),
  )
}

/** Stop where we are. */
export function cancelTravel(): void {
  setUnitOrder(CRAWLER_UNIT_ID, { kind: 'hold' })
}
