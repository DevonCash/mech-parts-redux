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

// ── Terrain ─────────────────────────────────────────────────────────
// The planet is a fixed procedural heightmap (src/sim/terrain) — the
// same world in every session, so the seed is a constant, not the
// session seed. Roads are priced by the ground they cross.

/** World seed for the synthetic heightmap */
export const TERRAIN_SEED = 8421

/** Best route terrain factor — a graded road across a plain
 *  (effectiveKm = distance × terrain; speed mult = 1/terrain) */
export const TERRAIN_FACTOR_MIN = 0.5

/** Worst route terrain factor — switchbacks through highlands; must
 *  stay below overland's implicit 1.0 so roads always win */
export const TERRAIN_FACTOR_MAX = 0.85

/** Mean local relief (m) at which a route hits TERRAIN_FACTOR_MAX.
 *  Seeded-network route means run ~70–440 m at the 40 km sample ring. */
export const TERRAIN_ROUGHNESS_FULL_M = 400

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

// ── Raiders ─────────────────────────────────────────────────────────
// Route danger is live: bands of technicals camp beside roads chosen
// by banditry weight (Route.danger). The old ambush dice are gone.

/** Live bands the world maintains (respawn keeps pressure on) */
export const RAIDER_BAND_TARGET = 5

/** Technicals per band */
export const RAIDER_BAND_SIZE_MIN = 2
export const RAIDER_BAND_SIZE_MAX = 3

/** Chance a band also has a scavenged mech guarding the camp */
export const CAMP_MECH_CHANCE = 0.4

/** Ticks between band respawns when under target (~1.7 game-hours) */
export const RAIDER_RESPAWN_TICKS = 60000

/** Interception radius — technicals chase anything this close to camp */
export const TECHNICAL_LEASH_KM = 10

/** The camp guard mech stays home */
export const CAMP_MECH_LEASH_KM = 6

/** Route danger floor when no camp threatens the road */
export const RAIDER_DANGER_BASE = 0.05

/** Danger added per camp within threat range of a route's path */
export const RAIDER_CAMP_THREAT = 0.35

/** A camp threatens road traffic within this of the path */
export const RAIDER_CAMP_THREAT_KM = 30

// ── Security contracts ──────────────────────────────────────────────

/** Flat component of a patrol contract */
export const SECURITY_PAY_BASE = 800

/** Pay per raider unit in the target band */
export const SECURITY_PAY_PER_RAIDER = 1200

/** Bands within this of a node (or its roads) appear on its board */
export const SECURITY_OFFER_RANGE_KM = 60

/** Patrol deadline — generous, the target band doesn't move (~22 game-hours) */
export const SECURITY_DEADLINE_TICKS = 800000

// ── Convoy war ──────────────────────────────────────────────────────
// Raiders prey on NPC hauler convoys: a band sorties on a passing
// convoy when its raid cooldown has expired (deterministic — no dice).
// Escorts guard named convoys; wrecks feed the salvage business.

/** Ticks between convoy threat scans (~1.1 km of convoy motion) */
export const CONVOY_THREAT_INTERVAL = 500

/** Convoys materialize as units within this of a hungry camp
 *  (== TECHNICAL_LEASH_KM so a materialized convoy is engageable) */
export const CONVOY_THREAT_RADIUS_KM = 10

/** Minimum ticks between sorties per band (~2.5 game-hours) */
export const RAID_COOLDOWN_TICKS = 90_000

/** Share of a raided convoy's cargo the band hauls back to camp */
export const RAID_LOOT_FRACTION = 0.4

/** Convoys also materialize this close to a player unit (piracy reach) */
export const PIRACY_RANGE_KM = 3

/** Ticks between an escort offer's posting and the convoy's departure
 *  (1 game-hour to pre-position or pre-clear) */
export const ESCORT_DEPART_DELAY_TICKS = 36_000

/** Escort offers per board refresh */
export const ESCORT_OFFERS_MAX = 1

/** Flat component of escort pay */
export const ESCORT_PAY_BASE = 600

/** Escort pay per raider in the named band */
export const ESCORT_PAY_PER_RAIDER = 600

/** Escort pay as a fraction of the shipment's credit value */
export const ESCORT_PAY_VALUE_FACTOR = 0.4

/** Wrecks within this of a node appear on its board as salvage work */
export const SALVAGE_OFFER_RANGE_KM = 80

/** Salvage pay as a fraction of the recovered cargo's credit value */
export const SALVAGE_PAY_VALUE_FACTOR = 0.5

/** Unlooted wreck lifetime (~6.7 game-hours) */
export const WRECK_TTL_TICKS = 240_000

/** Crawler must be this close to loot a wreck (matches recall range) */
export const LOOT_RANGE_KM = 2

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
