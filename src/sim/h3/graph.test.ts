import { describe, it, expect } from 'vitest'
import { findPath, type PathSegment } from './graph'
import type { Route } from '../economy/models'

// Simple test network:
//   A --r1-- B --r2-- C --r3-- D
//            |                 |
//           r4                r5
//            |                 |
//            E ------r6------- F
//
const routes: Record<string, Route> = {
  r1: { id: 'r1', from: 'A', to: 'B', path: [[0, 0], [0, 10]], distance: 100, terrain: 0.5 },
  r2: { id: 'r2', from: 'B', to: 'C', path: [[0, 10], [0, 20]], distance: 100, terrain: 0.5 },
  r3: { id: 'r3', from: 'C', to: 'D', path: [[0, 20], [0, 30]], distance: 100, terrain: 0.5 },
  r4: { id: 'r4', from: 'B', to: 'E', path: [[0, 10], [10, 10]], distance: 100, terrain: 0.5 },
  r5: { id: 'r5', from: 'D', to: 'F', path: [[0, 30], [10, 30]], distance: 100, terrain: 0.5 },
  r6: { id: 'r6', from: 'E', to: 'F', path: [[10, 10], [10, 30]], distance: 200, terrain: 0.5 },
}

const positions: Record<string, [number, number]> = {
  A: [0, 0], B: [0, 10], C: [0, 20], D: [0, 30],
  E: [10, 10], F: [10, 30],
}

describe('findPath', () => {
  it('returns empty array for same start and end', () => {
    expect(findPath('A', 'A', routes, positions)).toEqual([])
  })

  it('finds a direct route', () => {
    const path = findPath('A', 'B', routes, positions)
    expect(path).not.toBeNull()
    expect(path!.length).toBe(1)
    expect(path![0].routeId).toBe('r1')
    expect(path![0].reversed).toBe(false)
  })

  it('finds a direct route in reverse', () => {
    const path = findPath('B', 'A', routes, positions)
    expect(path).not.toBeNull()
    expect(path!.length).toBe(1)
    expect(path![0].routeId).toBe('r1')
    expect(path![0].reversed).toBe(true)
  })

  it('finds a multi-hop path', () => {
    const path = findPath('A', 'D', routes, positions)
    expect(path).not.toBeNull()
    expect(path!.length).toBe(3) // A→B→C→D
    expect(path!.map(s => s.routeId)).toEqual(['r1', 'r2', 'r3'])
  })

  it('prefers shorter path over longer one', () => {
    // A→D via top (3 hops, cost 150) vs via bottom (A→B→E→F→D = 4 hops, cost 250)
    const path = findPath('A', 'D', routes, positions)
    expect(path).not.toBeNull()
    expect(path!.map(s => s.routeId)).toEqual(['r1', 'r2', 'r3'])
  })

  it('returns null for unreachable node', () => {
    const path = findPath('A', 'Z', routes, positions)
    expect(path).toBeNull()
  })

  it('returns null for unknown start node', () => {
    const path = findPath('Z', 'A', routes, positions)
    expect(path).toBeNull()
  })

  it('handles bidirectional traversal correctly', () => {
    // E to C: E→B→C (reversed on r4, forward on r2)
    const path = findPath('E', 'C', routes, positions)
    expect(path).not.toBeNull()
    expect(path!.length).toBe(2)
    expect(path![0]).toEqual({ routeId: 'r4', reversed: true })
    expect(path![1]).toEqual({ routeId: 'r2', reversed: false })
  })
})
