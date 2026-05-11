import { atom } from 'nanostores'
import { persistentAtom } from '@nanostores/persistent'

/** Game time in milliseconds (accumulated from ticks) */
export const gameTime = persistentAtom<number>('mech:gameTime', 0, {
  encode: JSON.stringify,
  decode: JSON.parse,
})

/** Number of simulation ticks elapsed */
export const tick = atom<number>(0)

/** Time scale: 0 = paused, 1 = real-time, 10 = fast, 100 = very fast */
export const timeScale = persistentAtom<number>('mech:timeScale', 1, {
  encode: JSON.stringify,
  decode: JSON.parse,
})

/** Interpolation fraction (0–1) for smooth rendering between ticks */
export const alpha = atom<number>(0)
