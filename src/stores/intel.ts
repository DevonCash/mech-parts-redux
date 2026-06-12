/**
 * The player's observed knowledge of node state — the only node data
 * the UI is allowed to render. Written back from the pipeline.
 */
import { atom } from 'nanostores'
import type { IntelMap } from '../sim/intel/models'

export const intel = atom<IntelMap>({})
