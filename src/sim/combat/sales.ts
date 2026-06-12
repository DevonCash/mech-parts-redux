/**
 * Mech dealers — settlements and terminals keep a couple of mil-spec
 * frames on the lot. Refreshes on the recruitment cadence. The cheap
 * route is salvage: cleared garrisons sometimes leave a towable wreck.
 */
import { z } from 'zod'
import { MECH_PRICES, RECRUIT_REFRESH_TICKS } from '../balance'
import type { Rng } from '../rng'
import type { GameNode } from '../economy/models'

export const MechOfferSchema = z.object({
  chassisId: z.string(),
  price: z.number(),
})
export type MechOffer = z.infer<typeof MechOfferSchema>

export const MechLotSchema = z.object({
  generatedTick: z.number(),
  offers: z.array(MechOfferSchema),
})
export type MechLot = z.infer<typeof MechLotSchema>

export type MechLots = Record<string, MechLot>

const SOLD_CHASSIS = Object.keys(MECH_PRICES)

export function generateMechLot(
  node: GameNode,
  rng: Rng,
  currentTick: number,
): MechLot {
  const count =
    node.type === 'settlement' || node.type === 'terminal' ? rng.int(0, 2) : 0
  const offers: MechOffer[] = []
  for (let i = 0; i < count; i++) {
    const chassisId = rng.pick(SOLD_CHASSIS)
    offers.push({
      chassisId,
      price: Math.round(MECH_PRICES[chassisId] * rng.range(0.9, 1.15)),
    })
  }
  return { generatedTick: currentTick, offers }
}

export function mechLotStale(lot: MechLot | undefined, currentTick: number): boolean {
  if (!lot) return true
  return currentTick - lot.generatedTick >= RECRUIT_REFRESH_TICKS
}
