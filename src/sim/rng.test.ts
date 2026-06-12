import { describe, expect, it } from 'vitest'
import { makeRng, seedFromString } from './rng'

describe('makeRng', () => {
  it('is deterministic: same seed → same sequence', () => {
    const a = makeRng(12345)
    const b = makeRng(12345)
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('produces different sequences for different seeds', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('serializes state: resuming from .state continues the sequence', () => {
    const a = makeRng(999)
    a.next()
    a.next()
    const resumed = makeRng(a.state)
    const cont = makeRng(999)
    cont.next()
    cont.next()
    for (let i = 0; i < 20; i++) {
      expect(resumed.next()).toBe(cont.next())
    }
  })

  it('next() stays in [0, 1)', () => {
    const rng = makeRng(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int(min, max) is inclusive on both ends', () => {
    const rng = makeRng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 3))
    expect([...seen].sort()).toEqual([1, 2, 3])
  })

  it('seedFromString is stable and uint32', () => {
    expect(seedFromString('mars')).toBe(seedFromString('mars'))
    expect(seedFromString('mars')).not.toBe(seedFromString('marz'))
    expect(seedFromString('mars')).toBeGreaterThanOrEqual(0)
    expect(seedFromString('mars')).toBeLessThanOrEqual(0xffffffff)
  })
})
