/**
 * The company's pilot roster.
 */
import { atom } from 'nanostores'
import { startingPilots, type Pilot } from '../sim/pilots/models'

export const pilots = atom<Pilot[]>(startingPilots())
