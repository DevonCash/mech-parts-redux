/**
 * Gameplay balance constants — the single tuning surface for the
 * Phase 1 loop. All values that shape the economy's difficulty curve
 * live here so playtesting adjustments touch one file.
 */

// ── Session ─────────────────────────────────────────────────────────

/** Credits the company starts with */
export const START_CREDITS = 2000

/** Credits required to pay off the company debt and win */
export const CREDIT_TARGET = 50000

/** Fuel the crawler starts with */
export const START_FUEL = 3000

/** Crawler fuel tank capacity — covers a mid-length haul; the longest
 *  routes (~5000+ effective km) require a refuel stop along the way */
export const FUEL_CAPACITY = 5000

/** Crawler cargo capacity in commodity units */
export const CARGO_CAPACITY = 60

/** Maximum simultaneously active contracts (reputation scaling is Phase 3) */
export const ACTIVE_CONTRACT_SLOTS = 3

// ── Fuel ────────────────────────────────────────────────────────────

/** Fuel burned per effective km traveled (route distance × terrain) */
export const FUEL_PER_EFFECTIVE_KM = 1.0

/** Flat credit cost of an emergency resupply when stranded mid-route */
export const EMERGENCY_RESUPPLY_COST = 800

/** Fuel granted by an emergency resupply — enough to limp to a node */
export const EMERGENCY_RESUPPLY_FUEL = 600

// ── Markets ─────────────────────────────────────────────────────────

/** Player sell price as a fraction of the posted buy price */
export const SELL_MARGIN = 0.85

/** Ticks between economy steps: production, pricing, quanta decisions
 *  (5 game-minutes) */
export const ECON_INTERVAL = 3000

/** Hauler quanta populating the trade network */
export const QUANTA_COUNT = 24

// ── Contracts ───────────────────────────────────────────────────────

/** Ticks after which a node's contract board regenerates (~25 game-min) */
export const BOARD_REFRESH_TICKS = 15000

/** Ticks an unaccepted contract stays on a board before expiring */
export const CONTRACT_BOARD_TTL = 45000

/** Flat component of hauling pay */
export const HAUL_PAY_BASE = 300

/** Pay per effective km of the delivery route. Fuel costs ~1¤/km, so
 *  this sets the gross margin on distance */
export const HAUL_PAY_PER_KM = 1.2

/** Extra pay multiplier for hard-deadline contracts */
export const HARD_DEADLINE_BONUS = 1.35

/** Deadline slack: deadline = ETA × this factor (rolled within range) */
export const DEADLINE_SLACK_MIN = 1.8
export const DEADLINE_SLACK_MAX = 2.6

// ── Combat contracts ────────────────────────────────────────────────

/** Flat component of combat contract pay */
export const COMBAT_PAY_BASE = 1200

/** Pay per hostile unit at the site */
export const COMBAT_PAY_PER_HOSTILE = 1800

/** Chance a board slot rolls a combat contract instead of a haul */
export const COMBAT_CONTRACT_CHANCE = 0.3

// ── Route risk ──────────────────────────────────────────────────────

/** Ambush risk while moving off the road network — raiders camp roads */
export const OFFROAD_DANGER = 0.12

/** Per-tick ambush probability per unit of route danger while in transit */
export const AMBUSH_RATE_PER_TICK = 8e-6

/** Fraction of carried cargo lost in an ambush (rolled within range) */
export const AMBUSH_CARGO_LOSS_MIN = 0.05
export const AMBUSH_CARGO_LOSS_MAX = 0.2

/** Credits lost in an ambush when there is no cargo to take */
export const AMBUSH_CREDIT_LOSS_MAX = 300

// ── Recruitment & acquisition ───────────────────────────────────────

/** Flat component of a pilot's signing bonus */
export const HIRE_COST_BASE = 400

/** Signing bonus per point of mean skill (fidelity+judgment)/2 */
export const HIRE_COST_PER_SKILL = 4000

/** Ticks before a node's hiring pool / mech offers refresh */
export const RECRUIT_REFRESH_TICKS = 45000

/** Sticker prices for mil-spec chassis at dealers */
export const MECH_PRICES: Record<string, number> = {
  scout: 7500,
  trooper: 12000,
}

/** Chance a cleared garrison leaves one towable wreck for the garage */
export const SALVAGE_MECH_CHANCE = 0.25

// ── End conditions ──────────────────────────────────────────────────

/** Net worth below which a docked, immobile company is bankrupt */
export const MIN_VIABLE_NET_WORTH = 25
