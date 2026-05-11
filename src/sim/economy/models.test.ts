import { describe, it, expect } from 'vitest'
import { NodeSchema, RouteSchema, createNode } from './models'
import { seedNodes } from './seed-nodes'
import { generateSeedRoutes } from './seed-routes'
import { cellToLatLng, getResolution } from '../h3'

describe('NodeSchema', () => {
  it('validates all seed nodes', () => {
    for (const node of seedNodes) {
      const result = NodeSchema.safeParse(node)
      expect(result.success, `Node "${node.id}" failed validation: ${
        !result.success ? JSON.stringify(result.error.issues) : ''
      }`).toBe(true)
    }
  })

  it('rejects a node with an invalid type', () => {
    const bad = {
      id: 'bad',
      name: 'Bad Node',
      position: [0, 0],
      type: 'spaceship',
      h3Cell: 'abc',
    }
    expect(NodeSchema.safeParse(bad).success).toBe(false)
  })
})

describe('createNode', () => {
  it('derives h3Cell at resolution 5 from position', () => {
    const node = createNode({
      id: 'test',
      name: 'Test',
      position: [18.0, -134.0],
      type: 'extraction',
    })
    expect(node.h3Cell).toBeDefined()
    expect(getResolution(node.h3Cell)).toBe(5)
  })

  it('produces an h3Cell whose center is near the input position', () => {
    const node = createNode({
      id: 'test',
      name: 'Test',
      position: [18.0, -134.0],
      type: 'extraction',
    })
    const [cellLat, cellLng] = cellToLatLng(node.h3Cell)
    // H3 res 5 cells are ~5km across, so center should be within ~3km ≈ ~0.1° at this latitude
    expect(Math.abs(cellLat - 18.0)).toBeLessThan(0.5)
    expect(Math.abs(cellLng - (-134.0))).toBeLessThan(0.5)
  })
})

describe('seed nodes', () => {
  it('has at least 10 nodes', () => {
    expect(seedNodes.length).toBeGreaterThanOrEqual(10)
  })

  it('has unique IDs', () => {
    const ids = seedNodes.map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes all five node types', () => {
    const types = new Set(seedNodes.map(n => n.type))
    expect(types).toContain('extraction')
    expect(types).toContain('processing')
    expect(types).toContain('settlement')
    expect(types).toContain('depot')
    expect(types).toContain('terminal')
  })

  it('each node h3Cell matches its position', () => {
    for (const node of seedNodes) {
      expect(getResolution(node.h3Cell)).toBe(5)
      const [cellLat, cellLng] = cellToLatLng(node.h3Cell)
      expect(Math.abs(cellLat - node.position[0])).toBeLessThan(0.5)
      expect(Math.abs(cellLng - node.position[1])).toBeLessThan(0.5)
    }
  })
})

describe('RouteSchema', () => {
  it('validates a well-formed route', () => {
    const route = {
      id: 'r1',
      from: 'a',
      to: 'b',
      path: [[0, 0], [1, 1]] as [number, number][],
      distance: 100,
      terrain: 0.5,
    }
    expect(RouteSchema.safeParse(route).success).toBe(true)
  })

  it('rejects a route missing distance', () => {
    const bad = { id: 'r1', from: 'a', to: 'b', path: [], terrain: 0.5 }
    expect(RouteSchema.safeParse(bad).success).toBe(false)
  })
})

describe('seed routes', () => {
  const routes = generateSeedRoutes(seedNodes)

  it('generates at least as many routes as nodes', () => {
    // With 13 nodes and 3 neighbors each, we should get a decent number
    expect(routes.length).toBeGreaterThanOrEqual(seedNodes.length)
  })

  it('all routes validate against RouteSchema', () => {
    for (const route of routes) {
      const result = RouteSchema.safeParse(route)
      expect(result.success, `Route "${route.id}" failed: ${
        !result.success ? JSON.stringify(result.error.issues) : ''
      }`).toBe(true)
    }
  })

  it('all route endpoints reference valid node IDs', () => {
    const nodeIds = new Set(seedNodes.map(n => n.id))
    for (const route of routes) {
      expect(nodeIds.has(route.from), `Unknown from: ${route.from}`).toBe(true)
      expect(nodeIds.has(route.to), `Unknown to: ${route.to}`).toBe(true)
    }
  })

  it('has no duplicate edges', () => {
    const ids = routes.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all routes have positive distance', () => {
    for (const route of routes) {
      expect(route.distance).toBeGreaterThan(0)
    }
  })
})
