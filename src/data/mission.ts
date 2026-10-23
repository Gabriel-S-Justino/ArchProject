// The game's single mission, "Red Watch". Constants from the Global Constraints (translated from
// the legacy prototype's js/data/mission.js). Orbit geometry follows real Mars orbiter practice;
// money, science and timing values are game balance and must be labelled as such in the UI.

// Ascent Δv model (game balance, calibrated in Task 6). Reaching the 200 km parking orbit costs the
// orbital speed plus gravity, drag and steering losses. Gravity loss dominates and depends on
// liftoff thrust-to-weight: a rocket that barely out-pushes its weight climbs slowly, so it spends
// longer fighting gravity before it can pitch over (to first order the loss scales with 1/TWR).
// The budget is therefore
//   ascentΔv(TWR) = ASCENT_DV + GRAVITY_LOSS_K × (1/TWR_liftoff − 1/ASCENT_REFERENCE_TWR)
// with ASCENT_DV the budget of a TWR-1.5 rocket. Calibration against the NASA LSP payload-vs-C3
// curves (src/physics/launcher.test.ts): with a single fixed budget, Atlas V 401 (TWR 1.17) needs
// ≈ 10,000 m/s while Falcon Heavy and Vulcan VC4 (TWR ≈ 1.6) need ≈ 9,100–9,400 m/s; no single
// value fits all three within 15%. ASCENT_DV 9,400 with K 3,000 m/s fits all three curves within 8%.
/** Ascent Δv budget to the 200 km parking orbit for a liftoff TWR of 1.5, m/s. Game balance. */
export const ASCENT_DV = 9400
/** Gravity-loss coefficient of the ascent budget, m/s per unit of 1/TWR. Game balance (LSP-calibrated). */
export const GRAVITY_LOSS_K = 3000
/** Liftoff TWR at which the ascent budget equals ASCENT_DV. */
export const ASCENT_REFERENCE_TWR = 1.5
/**
 * Upper end of the TWR used in the gravity-loss term (game balance). Beyond ~2.5 real rockets gain
 * little: drag, max-Q throttling and steering losses take over, so the ascent budget stops shrinking
 * (without the clamp a TWR-8 stack would need only 7,776 m/s). The lower end is MISSION.minLiftoffTwr.
 */
export const GRAVITY_LOSS_MAX_TWR = 2.5
/**
 * Minimum ignition TWR of every upper stage (vacuum thrust over everything it lifts, payload
 * included). Game balance: a long low-thrust burn on a suborbital or escape trajectory loses energy
 * to gravity that the Δv budget does not model, so tiny-engine upper stages would otherwise win.
 * Real upper stages ignite at 0.3–0.8 (Centaur V ≈ 0.3, Centaur ≈ 0.4, Falcon upper ≈ 0.8).
 */
export const UPPER_STAGE_MIN_TWR = 0.25

export const MISSION = {
  id: 'red-watch',
  name: 'Red Watch',
  briefing:
    'Put an orbiter around Mars to map the surface and search for buried ice. Pick a launch date on the porkchop plot, build a rocket that can deliver the spacecraft, design the spacecraft itself, then fly it: correct the course during cruise, survive solar storms, brake into orbit and return as much science as you can within the budget.',
  /** US$ M. Game balance. */
  budgetM: 900,
  /** Circular parking orbit altitude, m. */
  parkingAltitudeM: 200e3,
  /** Capture orbit periapsis altitude, m. */
  capturePeriapsisAltM: 300e3,
  /** Capture orbit apoapsis altitude, m. */
  captureApoapsisAltM: 33_000e3,
  /** Minimum liftoff thrust-to-weight ratio. Game balance: 1.1 lets the real Atlas V 401 (≈ 1.17) fly. */
  minLiftoffTwr: 1.1,
  /** Ascent Δv budget at liftoff TWR 1.5, m/s (game balance; see GRAVITY_LOSS_K). */
  ascentDvMs: ASCENT_DV,
  /** Gravity-loss coefficient of the ascent budget, m/s (game balance, LSP-calibrated). */
  gravityLossKMs: GRAVITY_LOSS_K,
  /** Minimum ignition TWR of upper stages (game balance). */
  upperStageMinTwr: UPPER_STAGE_MIN_TWR,
  /** Launch margin rule: spacecraft wet mass ≤ launchMargin × rocket capacity at the chosen C3. */
  launchMargin: 0.9,
  /** Science operations: number of turns (game balance). */
  opsTurns: 6,
  /** Days per operations turn (game balance). */
  turnDays: 30,
  /** Science points for full success (game balance). */
  scienceTarget: 100,
  /** Built-in onboard data buffer, Gbit (game balance; storage parts add to it). */
  bufferGbit: 40,
  /** Longest cruise the game simulates, days (legacy value, game balance). */
  maxCruiseDays: 600,
  /** Encounter zone = this × Mars sphere of influence (legacy value, game balance). */
  encounterSoiFactor: 2,
} as const

/** Which MISSION fields are game balance rather than physics or real practice (for UI labels). */
export const MISSION_GAME_BALANCE: readonly (keyof typeof MISSION)[] = [
  'budgetM',
  'minLiftoffTwr',
  'ascentDvMs',
  'gravityLossKMs',
  'upperStageMinTwr',
  'opsTurns',
  'turnDays',
  'scienceTarget',
  'bufferGbit',
  'maxCruiseDays',
  'encounterSoiFactor',
]
