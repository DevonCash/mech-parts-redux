/**
 * Seeded, serializable PRNG (mulberry32).
 *
 * All simulation randomness flows through this so that runs are
 * deterministic: same seed + same inputs → same state. The generator's
 * entire state is a single uint32, which is stored in the session state
 * and round-trips through saves.
 */

export interface Rng {
  /** Next float in [0, 1) */
  next(): number
  /** Integer in [min, max] inclusive */
  int(min: number, max: number): number
  /** Float in [min, max) */
  range(min: number, max: number): number
  /** Random element of a non-empty array */
  pick<T>(arr: readonly T[]): T
  /** Current serializable state */
  readonly state: number
}

export function makeRng(state: number): Rng {
  let s = state >>> 0

  return {
    next(): number {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    int(min: number, max: number): number {
      return min + Math.floor(this.next() * (max - min + 1))
    },
    range(min: number, max: number): number {
      return min + this.next() * (max - min)
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(this.next() * arr.length)]
    },
    get state() {
      return s
    },
  }
}

/** Derive a numeric seed from a string (FNV-1a). */
export function seedFromString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
