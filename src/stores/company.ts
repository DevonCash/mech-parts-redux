import { atom } from 'nanostores'
import type { CompanyState } from '../sim/economy/market'
import {
  CARGO_CAPACITY,
  FUEL_CAPACITY,
  START_CREDITS,
  START_FUEL,
} from '../sim/balance'

export const defaultCompany: CompanyState = {
  credits: START_CREDITS,
  fuel: START_FUEL,
  fuelCapacity: FUEL_CAPACITY,
  cargo: {},
  cargoCapacity: CARGO_CAPACITY,
}

/** Company finances, fuel, and hold. Plain atom — persistence goes through saves. */
export const company = atom<CompanyState>(defaultCompany)
