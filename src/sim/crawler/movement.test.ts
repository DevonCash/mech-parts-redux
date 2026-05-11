import { describe, it, expect } from 'vitest'
import { advanceCrawler, interpolateRoutePath, CRAWLER_SPEED_KM_S } from './movement'
import { TICK_DURATION_MS } from '../tick'
import type { CrawlerState } from '../../stores/crawler'
import type { Route } from '../economy/models'

const TICK_DURATION_S = TICK_DURATION_MS / 1000

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'r1',
    from: 'a',
    to: 'b',
    path: [[0, 0], [10, 10]],
    distance: 100,
    terrain: 0.5,
    ...overrides,
  }
}

function makeCrawlerOnRoute(overrides: Partial<CrawlerState> = {}): CrawlerState {
  return {
    lat: 0,
    lng: 0,
    currentNode: null,
    currentRoute: 'r1',
    routeProgress: 0,
    destination: 'b',
    routeReversed: false,
    routeQueue: [],
    ...overrides,
  }
}

describe('interpolateRoutePath', () => {
  const path: [number, number][] = [[0, 0], [10, 0], [10, 10]]

  it('returns start at progress 0', () => {
    expect(interpolateRoutePath(path, 0)).toEqual([0, 0])
  })

  it('returns end at progress 1', () => {
    expect(interpolateRoutePath(path, 1)).toEqual([10, 10])
  })

  it('returns midpoint at progress 0.5', () => {
    const [lat, lng] = interpolateRoutePath(path, 0.5)
    expect(lat).toBeCloseTo(10, 5)
    expect(lng).toBeCloseTo(0, 5)
  })

  it('interpolates within a segment', () => {
    const [lat, lng] = interpolateRoutePath(path, 0.25)
    expect(lat).toBeCloseTo(5, 5)
    expect(lng).toBeCloseTo(0, 5)
  })

  it('clamps below 0', () => {
    expect(interpolateRoutePath(path, -0.5)).toEqual([0, 0])
  })

  it('clamps above 1', () => {
    expect(interpolateRoutePath(path, 1.5)).toEqual([10, 10])
  })
})

describe('advanceCrawler', () => {
  it('does nothing when not on a route', () => {
    const state: CrawlerState = {
      lat: 5, lng: 5,
      currentNode: 'a',
      currentRoute: null,
      routeProgress: 0,
      destination: null,
      routeReversed: false,
    routeQueue: [],
    }
    const result = advanceCrawler(state, {})
    expect(result).toEqual(state)
  })

  it('advances progress along a route', () => {
    const route = makeRoute({ distance: 100, terrain: 0.5 })
    const state = makeCrawlerOnRoute({ routeProgress: 0 })
    const routes = { r1: route }

    const result = advanceCrawler(state, routes)

    const expectedProgress = (CRAWLER_SPEED_KM_S * TICK_DURATION_S) / (100 * 0.5)
    expect(result.routeProgress).toBeCloseTo(expectedProgress, 10)
    expect(result.currentRoute).toBe('r1')
    expect(result.currentNode).toBeNull()
  })

  it('arrives at destination when progress reaches 1.0', () => {
    const route = makeRoute()
    const state = makeCrawlerOnRoute({ routeProgress: 0.999 })
    const routes = { r1: route }

    // Give it enough progress to cross 1.0
    let result = state
    for (let i = 0; i < 1000; i++) {
      result = advanceCrawler(result, routes)
      if (result.currentNode !== null) break
    }

    expect(result.currentNode).toBe('b')
    expect(result.currentRoute).toBeNull()
    expect(result.routeProgress).toBe(0)
    expect(result.destination).toBeNull()
  })

  it('does not overshoot — progress stays at 0 after arrival', () => {
    const route = makeRoute({ distance: 1 }) // very short route
    const state = makeCrawlerOnRoute()
    const routes = { r1: route }

    const result = advanceCrawler(state, routes)
    // Should arrive immediately (or close to)
    if (result.currentNode) {
      expect(result.routeProgress).toBe(0)
    }
  })

  it('follows multi-hop queue', () => {
    const r1 = makeRoute({ id: 'r1', from: 'a', to: 'b', distance: 1, path: [[0, 0], [5, 5]] })
    const r2 = makeRoute({ id: 'r2', from: 'b', to: 'c', distance: 1, path: [[5, 5], [10, 10]] })
    const routes = { r1, r2 }

    const state = makeCrawlerOnRoute({
      routeProgress: 0.99,
      destination: 'c',
      routeQueue: [['r2', false]],
    })

    // Advance until we cross into r2
    let result = state
    for (let i = 0; i < 100; i++) {
      result = advanceCrawler(result, routes)
      if (result.currentRoute === 'r2') break
    }

    expect(result.currentRoute).toBe('r2')
    expect(result.routeQueue).toEqual([])
    expect(result.destination).toBe('c')
  })

  it('arrives at final destination after multi-hop', () => {
    const r1 = makeRoute({ id: 'r1', from: 'a', to: 'b', distance: 1, path: [[0, 0], [5, 5]] })
    const r2 = makeRoute({ id: 'r2', from: 'b', to: 'c', distance: 1, path: [[5, 5], [10, 10]] })
    const routes = { r1, r2 }

    let state = makeCrawlerOnRoute({
      routeProgress: 0,
      destination: 'c',
      routeQueue: [['r2', false]],
    })

    // Run enough ticks to complete both routes
    for (let i = 0; i < 10000; i++) {
      state = advanceCrawler(state, routes)
      if (state.currentNode === 'c') break
    }

    expect(state.currentNode).toBe('c')
    expect(state.currentRoute).toBeNull()
    expect(state.destination).toBeNull()
    expect(state.routeQueue).toEqual([])
  })
})
