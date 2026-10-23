// The game's single mission, "Red Watch". Constants from the Global Constraints (translated from
// the legacy prototype's js/data/mission.js). Orbit geometry follows real Mars orbiter practice;
// money, science and timing values are game balance and must be labelled as such in the UI.

/** Ascent Δv budget to the 200 km parking orbit incl. gravity and drag losses, m/s. Game balance (tunable in Task 6 only). */
export const ASCENT_DV = 9400

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
  /** Minimum liftoff thrust-to-weight ratio. */
  minLiftoffTwr: 1.2,
  /** Ascent Δv budget, m/s (game balance). */
  ascentDvMs: ASCENT_DV,
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
  'ascentDvMs',
  'opsTurns',
  'turnDays',
  'scienceTarget',
  'bufferGbit',
  'maxCruiseDays',
  'encounterSoiFactor',
]
