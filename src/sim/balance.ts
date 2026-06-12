/**
 * Gameplay balance constants — the single tuning surface for the
 * Phase 1 loop. All values that shape the economy's difficulty curve
 * live here so playtesting adjustments touch one file.
 */

// ── Session ─────────────────────────────────────────────────────────

/** Credits the company starts with */
export const START_CREDITS = 2000

/** Credits required to pay off the company debt and win */
export const CREDIT_TARGET = 20000

/** Fuel the crawler starts with */
export const START_FUEL = 2000

/** Crawler fuel tank capacity */
export const FUEL_CAPACITY = 3000

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

/** Ticks between market price/inventory drift steps (5 game-minutes) */
export const MARKET_DRIFT_INTERVAL = 3000

/** Per-step fraction prices move back toward their node baseline */
export const MARKET_DRIFT_RATE = 0.1

/** Max relative jitter applied to prices each drift step */
export const MARKET_DRIFT_JITTER = 0.05

// ── Contracts ───────────────────────────────────────────────────────

/** Ticks after which a node's contract board regenerates (~25 game-min) */
export const BOARD_REFRESH_TICKS = 15000

/** Ticks an unaccepted contract stays on a board before expiring */
export const CONTRACT_BOARD_TTL = 45000

/** Flat component of hauling pay */
export const HAUL_PAY_BASE = 300

/** Pay per effective km of the delivery route */
export const HAUL_PAY_PER_KM = 1.6

/** Extra pay multiplier for hard-deadline contracts */
export const HARD_DEADLINE_BONUS = 1.35

/** Deadline slack: deadline = ETA × this factor (rolled within range) */
export const DEADLINE_SLACK_MIN = 1.8
export const DEADLINE_SLACK_MAX = 2.6

// ── Route risk ──────────────────────────────────────────────────────

/** Per-tick ambush probability per unit of route danger while in transit */
export const AMBUSH_RATE_PER_TICK = 8e-6

/** Fraction of carried cargo lost in an ambush (rolled within range) */
export const AMBUSH_CARGO_LOSS_MIN = 0.05
export const AMBUSH_CARGO_LOSS_MAX = 0.2

/** Credits lost in an ambush when there is no cargo to take */
export const AMBUSH_CREDIT_LOSS_MAX = 300

// ── End conditions ──────────────────────────────────────────────────

/** Net worth below which a docked, immobile company is bankrupt */
export const MIN_VIABLE_NET_WORTH = 25
