// Physics panel cards. Each concept: a formula, one plain-language idea (high-school level), an
// optional analogy, the phases where it is in play, and `live(view)`: the player's own numbers
// plugged in, computed from the real derived stats (never decorative). Translated from the legacy
// prototype (legacy/js/data/concepts.js) and extended for the Lambert / porkchop / modular-rocket
// game. `live` never throws and never prints NaN or Infinity: missing data reads "–" or a hint.
import type { GameView } from '@/app/store'
import { boosterById } from '@/data/boosters'
import { engineById } from '@/data/engines'
import { ASCENT_DV, ASCENT_REFERENCE_TWR, GRAVITY_LOSS_K, GRAVITY_LOSS_MAX_TWR, MISSION } from '@/data/mission'
import { TCM_WINDOWS, INJECTION_ERROR_SIGMA_MS } from '@/game/cruise'
import type { Phase } from '@/game/flow'
import { sunEarthMarsAngleDeg } from '@/game/ops'
import { MARS_MEAN_DISTANCE_AU } from '@/game/spacecraft'
import { AU, C, DAY, G0, MU_EARTH, MU_MARS, MU_SUN, R_MARS, SOI_MARS } from '@/physics/constants'
import { EPHEMERIS_RANGE, bodyState, type Body } from '@/physics/ephemeris'
import { MIN_LIFTOFF_TWR, PARKING_RADIUS_M, UPPER_STAGE_MIN_TWR, ascentDeltaV } from '@/physics/launcher'
import { DSN_CONTACT_HOURS_PER_DAY, dataRateMbps, dataVolumeGb } from '@/physics/link'
import { captureBurn, circularSpeed, escapeBurn, hohmann, orbitalElements, period } from '@/physics/orbit'
import { DEFAULT_PORKCHOP } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import { norm, sub } from '@/physics/vec'

export interface Concept {
  id: string
  title: string
  /** The relation, in Unicode math (rendered in the equation face). */
  formula: string
  /** One idea, in plain words. */
  plain: string
  analogy?: string
  /** Phases whose Physics panel lists this concept. */
  phases: Phase[]
  /** The player's numbers plugged in. Never throws, never NaN/Infinity. */
  live: (view: GameView) => string
}

// ---------------------------------------------------------------------------------------------
// Formatting

const DASH = '–'

/** en-US number with exactly `digits` decimals; "–" for NaN/±Infinity. */
export function fmt(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return DASH
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

/** Scientific notation with a real superscript exponent: 1.327 × 10²⁰. */
export function sci(x: number, digits = 3): string {
  if (!Number.isFinite(x) || x === 0) return fmt(x)
  const exp = Math.floor(Math.log10(Math.abs(x)))
  const mant = x / 10 ** exp
  const sup = String(exp)
    .split('')
    .map((ch) => SUPERSCRIPT[ch] ?? ch)
    .join('')
  return `${fmt(mant, digits)} × 10${sup}`
}

/** A live() wrapper: any exception or a non-finite number in the output becomes a dash. */
function safe(fn: (v: GameView) => string): (v: GameView) => string {
  return (v) => {
    try {
      const s = fn(v)
      return s && !/NaN|Infinity/.test(s) ? s : DASH
    } catch {
      return DASH
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers (ephemeris dates outside the covered range are clamped, so nothing throws)

const clampJd = (jd: number) => Math.min(EPHEMERIS_RANGE.endJd, Math.max(EPHEMERIS_RANGE.startJd, jd))
const sunDistanceAU = (body: Body, jd: number) => norm(bodyState(body, clampJd(jd)).r) / AU
const earthMarsM = (jd: number) => norm(sub(bodyState('mars', clampJd(jd)).r, bodyState('earth', clampJd(jd)).r))
/** Ecliptic longitude of a body, degrees. */
const longitudeDeg = (body: Body, jd: number) => {
  const r = bodyState(body, clampJd(jd)).r
  return (Math.atan2(r[1], r[0]) * 180) / Math.PI
}

const MARS_A_M = MARS_MEAN_DISTANCE_AU * AU
const HOHMANN = hohmann(MU_SUN, AU, MARS_A_M)
const MARS_PERIOD_S = period(MU_SUN, MARS_A_M)
/** Mars' lead over Earth at departure for a Hohmann transfer: 180° − 360° · t / T_Mars. */
const HOHMANN_PHASE_DEG = 180 - (360 * HOHMANN.time) / MARS_PERIOD_S
const CAPTURE_RP = R_MARS + MISSION.capturePeriapsisAltM
const CAPTURE_RA = R_MARS + MISSION.captureApoapsisAltM
const LOW_MARS_ORBIT_RP = R_MARS + MISSION.capturePeriapsisAltM

const stageName = (i: number) => `Stage ${i + 1}`
const tons = (kg: number) => fmt(kg / 1000, 1)

/** Grid size of the default porkchop (same arithmetic as computePorkchop). */
function porkchopDims(): { nDep: number; nArr: number } {
  const s = DEFAULT_PORKCHOP
  return {
    nDep: Math.floor((s.depEndJd - s.depStartJd) / s.depStepDays + 1e-9) + 1,
    nArr: Math.floor((s.arrEndJd - s.arrStartJd) / s.arrStepDays + 1e-9) + 1,
  }
}

const NO_TRANSFER = 'Pick a transfer on the porkchop plot to see your numbers here.'

// ---------------------------------------------------------------------------------------------
// The concepts, in journey order (the panel numbers them like equations in a handbook).

export const CONCEPTS: Concept[] = [
  {
    id: 'gravity',
    title: 'Gravitation',
    formula: 'F = G·M·m / r²',
    plain:
      'Every mass pulls on every other mass. An orbit is a fall that never ends: the spacecraft falls toward the Sun but moves sideways so fast that it keeps missing it.',
    analogy: 'A ball thrown so far that the Earth curves away before it can land.',
    phases: ['select', 'briefing'],
    live: safe((v) => {
      const pull = (rAU: number) => (MU_SUN / (rAU * AU) ** 2) * 1000
      const t = v.transfer
      const marsAU = t ? sunDistanceAU('mars', t.arrJd) : MARS_MEAN_DISTANCE_AU
      const where = t ? `on your arrival date, ${formatJd(t.arrJd)}` : 'at its mean distance'
      return `The Sun's GM is ${sci(MU_SUN)} m³/s². At 1 AU it pulls each kilogram with ${fmt(pull(1), 2)} mN; at Mars (${fmt(marsAU, 2)} AU ${where}) with ${fmt(pull(marsAU), 2)} mN.`
    }),
  },
  {
    id: 'dv-map',
    title: 'Δv map',
    formula: 'Δv_total = Δv_ascent + Δv_departure + Δv_capture',
    plain:
      'Δv ("delta-vee") is how much a spacecraft can change its own speed. It is the currency of spaceflight: every leg of the trip costs a fixed amount.',
    analogy: 'A transit card: each leg of the journey takes a fare off the balance.',
    phases: ['briefing', 'report'],
    live: safe((v) => {
      const twr = v.rocketStats.liftoffTwr
      // Below the minimum the model would still clamp TWR and print a finite ascent: say it cannot fly.
      const liftsOff = Number.isFinite(twr) && twr >= MIN_LIFTOFF_TWR
      const ascent = liftsOff ? ascentDeltaV(twr) : Number.NaN
      const ascentText = liftsOff
        ? `${fmt(ascent)} m/s`
        : Number.isFinite(twr) && twr > 0
          ? `not possible: liftoff TWR ${fmt(twr, 2)} is below ${fmt(MIN_LIFTOFF_TWR, 1)}, so the rocket cannot lift off`
          : 'not possible yet (the rocket cannot lift off)'
      const t = v.transfer
      if (!t) return `Ascent ${ascentText}. Departure and capture appear once you pick a transfer.`
      const dep = escapeBurn(MU_EARTH, PARKING_RADIUS_M, Math.sqrt(t.c3) * 1000)
      const cap = v.spacecraftStats.moiDvMs
      if (!liftsOff) return `Ascent ${ascentText} · departure ${fmt(dep)} m/s · capture ${fmt(cap)} m/s.`
      return `Ascent ${fmt(ascent)} + departure ${fmt(dep)} + capture ${fmt(cap)} = ${fmt(ascent + dep + cap)} m/s.`
    }),
  },
  {
    id: 'hohmann',
    title: 'Hohmann transfer',
    formula: 'a = (r_Earth + r_Mars) / 2',
    plain:
      'The cheapest path between two circular orbits is half an ellipse that touches both: one burn to get on it, one burn to get off.',
    analogy: 'Changing lanes on a roundabout with one smooth curve instead of cutting across.',
    phases: ['briefing', 'design'],
    live: safe((v) => {
      const base = `a = ${fmt(HOHMANN.a / AU, 3)} AU · ${fmt(HOHMANN.time / DAY)} days · ${fmt(HOHMANN.dv1)} m/s faster than Earth at departure.`
      return v.transfer ? `${base} Your transfer takes ${fmt(v.transfer.tofDays)} days.` : base
    }),
  },
  {
    id: 'phase-angle',
    title: 'Phase angle and launch window',
    formula: 'φ = 180° − 360° · (t_transfer / T_Mars)',
    plain:
      'Mars keeps moving while you travel. You have to leave when Mars is the right angle ahead of Earth so that you both reach the same point together. That lines up only every 26 months.',
    analogy: 'Passing a ball to a running teammate: you throw to where they will be.',
    phases: ['briefing', 'design'],
    live: safe((v) => {
      const ideal = `A Hohmann transfer wants Mars ${fmt(HOHMANN_PHASE_DEG, 1)}° ahead`
      const t = v.transfer
      if (!t) return `${ideal}. Pick a transfer to see the angle on your launch date.`
      let lead = longitudeDeg('mars', t.depJd) - longitudeDeg('earth', t.depJd)
      lead = ((lead + 540) % 360) - 180
      return `On ${formatJd(t.depJd)} Mars is ${fmt(lead, 1)}° ahead of Earth. ${ideal}; your Lambert arc makes up the difference.`
    }),
  },
  {
    id: 'lambert',
    title: "Lambert's problem",
    formula: 'r₁, r₂, Δt  →  v₁, v₂',
    plain:
      'Given where you start, where you want to be and how long the trip may take, find the one orbit that connects them. Mission designers solve this for every launch and arrival date they consider.',
    analogy: 'Knowing the hoop and the shot clock, work out exactly how to throw the ball.',
    phases: ['design'],
    live: safe((v) => {
      const t = v.transfer
      if (!t) return 'Each cell of the porkchop plot is one Lambert solve. ' + NO_TRANSFER
      const vEarth = norm(bodyState('earth', clampJd(t.depJd)).v) / 1000
      return `Earth on ${formatJd(t.depJd)} → Mars on ${formatJd(t.arrJd)}, ${fmt(t.tofDays)} days: the solver gives ${fmt(norm(t.v1) / 1000, 2)} km/s around the Sun at departure (Earth itself moves at ${fmt(vEarth, 2)} km/s).`
    }),
  },
  {
    id: 'porkchop',
    title: 'Porkchop plot',
    formula: 'C3(t_dep, t_arr) over a grid of dates',
    plain:
      'Solve Lambert for every pair of departure and arrival dates and colour each cell by the launch energy it needs. The cheap dates form an island; its shape gives the plot its name.',
    analogy: 'A map of ticket prices for every combination of outbound and return flight.',
    phases: ['briefing', 'design'],
    live: safe((v) => {
      const g = v.porkchop
      if (g) {
        return `${fmt(g.nDep)} departure × ${fmt(g.nArr)} arrival dates = ${fmt(g.nDep * g.nArr)} Lambert solves. Lowest C3 ${fmt(g.best.c3, 2)} km²/s², ${formatJd(g.best.depJd)} → ${formatJd(g.best.arrJd)}.`
      }
      const { nDep, nArr } = porkchopDims()
      const s = DEFAULT_PORKCHOP
      return `${fmt(nDep)} × ${fmt(nArr)} dates (departures ${formatJd(s.depStartJd)} to ${formatJd(s.depEndJd)}), computed in your browser on JPL Horizons positions when the plot opens.`
    }),
  },
  {
    id: 'c3',
    title: 'Launch energy C3',
    formula: 'C3 = v∞²',
    plain:
      'C3 is the energy left over after escaping Earth, per kilogram: the square of the speed you still have far from Earth. Rockets are rated by how much mass they can push to a given C3.',
    analogy: 'How hard you must kick a ball so it still rolls fast after leaving the hill.',
    phases: ['design', 'launch', 'report'],
    live: safe((v) => {
      const t = v.transfer
      if (!t) {
        const best = v.porkchop?.best
        return best
          ? `No transfer yet. The lowest C3 of the window is ${fmt(best.c3, 2)} km²/s² (${formatJd(best.depJd)} → ${formatJd(best.arrJd)}).`
          : 'No transfer yet. The porkchop plot finds the lowest C3 of the window once it is computed.'
      }
      return `Your transfer leaves Earth at v∞ = ${fmt(Math.sqrt(t.c3), 2)} km/s, so C3 = ${fmt(t.c3, 2)} km²/s².`
    }),
  },
  {
    id: 'rocket-equation',
    title: 'Rocket equation',
    formula: 'Δv = I_sp · g₀ · ln(m₀ / m_f)',
    plain:
      'A stage’s Δv depends on how efficient its engine is (Isp) and how much of its mass is propellant. Because of the logarithm, doubling the propellant does not double the Δv.',
    analogy: 'Carrying more water on a long hike also makes the backpack heavier to carry.',
    phases: ['design', 'launch'],
    live: safe((v) => {
      const st = v.rocketStats.stages.at(-1)
      if (!st) return 'Build a stage to see the calculation.'
      if (!v.design.rocket.stages[st.index]?.engineId || !(st.ispUsed > 0))
        return `${stageName(st.index)} has no engine on this stage: it adds mass but no Δv. Pick an engine to see the calculation.`
      if (!(st.m0 > st.mf)) return `${stageName(st.index)} carries no propellant: its mass ratio is 1, ln 1 = 0, so it adds no Δv. Add a tank.`
      return `${stageName(st.index)}: ${fmt(st.ispUsed)} s × ${fmt(G0, 2)} × ln(${tons(st.m0)} t / ${tons(st.mf)} t) = ${fmt(st.dv)} m/s.`
    }),
  },
  {
    id: 'twr',
    title: 'Thrust-to-weight ratio',
    formula: 'TWR = F / (m · g₀)',
    plain: `To leave the pad the engines must push harder than the whole rocket weighs (TWR above 1). The game asks for at least ${fmt(MIN_LIFTOFF_TWR, 1)} so there is thrust left to accelerate.`,
    analogy: 'To lift a box you have to push up harder than it weighs.',
    phases: ['design', 'launch'],
    live: safe((v) => {
      const st = v.rocketStats.stages[0]
      if (!st || st.m0 <= 0) return 'Build a first stage to see its TWR.'
      const thrustKn = (st.twr * st.m0 * G0) / 1000
      const verdict = st.twr >= MIN_LIFTOFF_TWR ? 'enough to lift off' : `below the ${fmt(MIN_LIFTOFF_TWR, 1)} minimum`
      return `${fmt(thrustKn)} kN ÷ (${tons(st.m0)} t × ${fmt(G0, 2)}) = ${fmt(st.twr, 2)}, ${verdict}.`
    }),
  },
  {
    id: 'gravity-losses',
    title: 'Gravity losses',
    formula: 'Δv_ascent = 9,400 + 3,000 · (1/TWR − 1/1.5)',
    plain:
      'While a rocket climbs straight up, part of its thrust only holds it up against gravity. A rocket that barely out-pushes its weight climbs slowly and wastes more: low TWR costs extra Δv.',
    analogy: 'Running up stairs burns less energy per step than crawling up them slowly.',
    phases: ['design', 'launch'],
    live: safe((v) => {
      const twr = v.rocketStats.liftoffTwr
      if (!(Number.isFinite(twr) && twr > 0)) return 'Build a first stage that can lift off to see its ascent budget.'
      if (twr < MIN_LIFTOFF_TWR)
        return `Liftoff TWR ${fmt(twr, 2)} is below the ${fmt(MIN_LIFTOFF_TWR, 1)} minimum: the rocket cannot lift off, so there is no ascent budget. More thrust or less mass on stage 1 fixes it.`
      const used = Math.min(GRAVITY_LOSS_MAX_TWR, Math.max(MIN_LIFTOFF_TWR, twr))
      const clamped = used !== twr ? ` (the model counts TWR between ${fmt(MIN_LIFTOFF_TWR, 1)} and ${fmt(GRAVITY_LOSS_MAX_TWR, 1)})` : ''
      return `Liftoff TWR ${fmt(twr, 2)}${clamped} → ${fmt(ASCENT_DV)} + ${fmt(GRAVITY_LOSS_K)} × (1/${fmt(used, 2)} − 1/${fmt(ASCENT_REFERENCE_TWR, 1)}) = ${fmt(ascentDeltaV(twr))} m/s to reach the 200 km parking orbit (game balance, calibrated on NASA LSP curves).`
    }),
  },
  {
    id: 'staging',
    title: 'Staging',
    formula: 'Δv_total = Δv₁ + Δv₂ + Δv₃',
    plain:
      'An empty tank is dead weight. Dropping each stage when it runs dry makes the rest of the rocket lighter, so every following stage gets more Δv from its propellant.',
    analogy: 'Leaving the empty water bottles behind on the trail.',
    phases: ['design', 'launch'],
    live: safe((v) => {
      const s = v.rocketStats.stages
      if (!s.length) return 'No stages yet.'
      return `${s.map((st) => `S${st.index + 1} ${fmt(st.dv)} m/s`).join(' · ')} → total ${fmt(v.rocketStats.totalDv)} m/s.`
    }),
  },
  {
    id: 'parallel-staging',
    title: 'Parallel staging',
    formula: 'F_liftoff = F_core + n · F_booster',
    plain:
      'Strap-on boosters fire together with the core stage from the pad and drop away when empty. They add thrust exactly when the rocket is heaviest.',
    analogy: 'Extra people pushing a stalled car only for the first few metres.',
    phases: ['design', 'launch'],
    live: safe((v) => {
      const s0 = v.design.rocket.stages[0]
      const st0 = v.rocketStats.stages[0]
      if (!s0 || !st0) return 'Build a first stage to add boosters to.'
      const b = s0.boosterId ? boosterById(s0.boosterId) : undefined
      const n = s0.boosterCount ?? 0
      if (!b || n <= 0) {
        const engine = s0.engineId ? engineById(s0.engineId) : undefined
        const core = engine ? `${s0.engineCount} × ${engine.name}` : 'the core'
        return `No strap-on boosters: ${core} lifts off alone at TWR ${fmt(st0.twr, 2)}.`
      }
      return `${n} × ${b.name} add ${fmt((n * b.thrustSL) / 1000)} kN at liftoff (TWR ${fmt(st0.twr, 2)}); stage 1 including boosters delivers ${fmt(st0.dv)} m/s.`
    }),
  },
  {
    id: 'upper-stage-twr',
    title: 'Upper-stage thrust',
    formula: `TWR_ignition = F_vac / (m · g₀) ≥ ${fmt(UPPER_STAGE_MIN_TWR, 2)}`,
    plain:
      'Above the atmosphere a stage no longer has to beat its weight, but a very weak engine burns so long that gravity pulls the rocket back down meanwhile. Each upper stage needs a minimum push.',
    analogy: 'A tiny outboard motor on a big boat moves it, just too slowly to beat the current.',
    phases: ['design', 'launch'],
    live: safe((v) => {
      const upper = v.rocketStats.stages.filter((st) => st.index > 0)
      if (!upper.length) return 'Single-stage stack: there is no upper stage to check.'
      return `${upper.map((st) => `${stageName(st.index)} ignites at TWR ${fmt(st.twr, 2)}`).join(' · ')} (minimum ${fmt(UPPER_STAGE_MIN_TWR, 2)}, game balance).`
    }),
  },
  {
    id: 'launch-margin',
    title: 'Launch margin',
    formula: 'm_spacecraft ≤ 0.9 · capacity(C3)',
    plain:
      'Real missions never fill a rocket to the last kilogram: spacecraft grow during development. The game keeps a 10% margin between your spacecraft and what the rocket can lift to your C3.',
    analogy: 'Packing a suitcase to 90% so it still closes after the souvenirs.',
    phases: ['design', 'report'],
    live: safe((v) => {
      const wet = v.spacecraftStats.wetKg
      const t = v.transfer
      if (!t) return `Spacecraft ${fmt(wet)} kg. Pick a transfer to size the rocket for its C3.`
      const cap = v.capacityKg
      if (cap <= 0) return `NO-GO: spacecraft ${fmt(wet)} kg, but this rocket cannot reach C3 ${fmt(t.c3, 2)} km²/s² at all.`
      const limit = MISSION.launchMargin * cap
      const margin = (1 - wet / cap) * 100
      const verdict = wet <= limit ? 'GO' : 'NO-GO'
      return `${verdict}: spacecraft ${fmt(wet)} kg vs limit ${fmt(limit)} kg (90% of ${fmt(cap)} kg at C3 ${fmt(t.c3, 2)}), margin ${fmt(margin, 1)}% (needs ≥ 10%).`
    }),
  },
  {
    id: 'circular-speed',
    title: 'Orbital speed',
    formula: 'v = √(GM / r)',
    plain: 'Each height has one speed for a circular orbit. The farther out, the slower.',
    analogy: 'The outer planets crawl: Mars takes almost two years to go round once.',
    phases: ['launch', 'ops'],
    live: safe(
      () =>
        `200 km parking orbit: ${fmt(circularSpeed(MU_EARTH, PARKING_RADIUS_M))} m/s. Earth around the Sun: ${fmt(circularSpeed(MU_SUN, AU) / 1000, 1)} km/s; Mars: ${fmt(circularSpeed(MU_SUN, MARS_A_M) / 1000, 1)} km/s.`,
    ),
  },
  {
    id: 'escape',
    title: 'Escape speed',
    formula: 'v = √(v∞² + 2GM / r)',
    plain:
      'To leave Earth with speed to spare (v∞) for the trip, the burn in parking orbit has to take the spacecraft past escape speed.',
    analogy: 'Rolling up a hill with a run-up: whatever speed is left at the top is v∞.',
    phases: ['launch'],
    live: safe((v) => {
      const esc = `Escape speed at 200 km: ${fmt(Math.sqrt((2 * MU_EARTH) / PARKING_RADIUS_M))} m/s.`
      const t = v.transfer
      if (!t) return `${esc} ${NO_TRANSFER}`
      return `${esc} Your departure burn for C3 ${fmt(t.c3, 2)} km²/s²: ${fmt(escapeBurn(MU_EARTH, PARKING_RADIUS_M, Math.sqrt(t.c3) * 1000))} m/s.`
    }),
  },
  {
    id: 'vis-viva',
    title: 'Vis-viva equation',
    formula: 'v² = GM · (2/r − 1/a)',
    plain: 'On an ellipse a spacecraft speeds up as it falls toward the Sun and slows down as it climbs away.',
    analogy: 'A skateboard in a half-pipe: fast at the bottom, slow at the top.',
    phases: ['cruise', 'arrival'],
    live: safe((v) => {
      const t = v.transfer
      if (!t) return NO_TRANSFER
      const el = orbitalElements({ r: t.r1, v: t.v1 }, MU_SUN)
      return `Leaving Earth: r = ${fmt(norm(t.r1) / AU, 3)} AU, v = ${fmt(norm(t.v1) / 1000, 2)} km/s. Reaching Mars: r = ${fmt(norm(t.r2) / AU, 3)} AU, v = ${fmt(norm(t.v2) / 1000, 2)} km/s. Same orbit, a = ${fmt(el.a / AU, 3)} AU.`
    }),
  },
  {
    id: 'apsides',
    title: 'Perihelion and aphelion',
    formula: 'r_p = a(1 − e) · r_a = a(1 + e)',
    plain:
      'The closest point of the ellipse to the Sun is perihelion; the farthest is aphelion. To reach Mars, the orbit has to stretch out to Mars’ distance on arrival day.',
    analogy: 'In Kerbal Space Program: periapsis and apoapsis.',
    phases: ['cruise'],
    live: safe((v) => {
      const t = v.transfer
      if (!t) return NO_TRANSFER
      const el = orbitalElements({ r: t.r1, v: t.v1 }, MU_SUN)
      return `Perihelion ${fmt(el.rp / AU, 3)} AU · aphelion ${fmt(el.ra / AU, 3)} AU · eccentricity ${fmt(el.e, 3)}. Mars is ${fmt(norm(t.r2) / AU, 3)} AU from the Sun when you arrive.`
    }),
  },
  {
    id: 'kepler3',
    title: "Kepler's third law",
    formula: 'T = 2π · √(a³ / GM)',
    plain: 'The time for one lap depends only on the size of the orbit (a). Bigger orbits take far longer.',
    analogy: 'The outside lane of a track is longer, and in space it is also run more slowly.',
    phases: ['cruise', 'ops'],
    live: safe(() => {
      const capture = period(MU_MARS, (CAPTURE_RP + CAPTURE_RA) / 2) / 3600
      return `200 km Earth orbit: ${fmt(period(MU_EARTH, PARKING_RADIUS_M) / 60)} min. Earth: ${fmt(period(MU_SUN, AU) / DAY)} days. Mars: ${fmt(MARS_PERIOD_S / DAY)} days. Your 300 × 33,000 km capture orbit: ${fmt(capture, 1)} h.`
    }),
  },
  {
    id: 'correction',
    title: 'Burn direction',
    formula: 'v_new = v + Δv_prograde + Δv_radial',
    plain:
      'Small burns early in the trip move the arrival point a lot. Prograde (forward) raises the far side of the orbit; radial (outward) rotates the ellipse.',
    analogy: 'Nudging the steering wheel slightly at the start of a long straight road.',
    phases: ['cruise'],
    live: safe((v) => {
      const reserve = v.design.spacecraft.tcmReserveMs
      const moi = v.spacecraftStats.moiDvMs
      if (!v.transfer) return `Your spacecraft keeps ${fmt(reserve)} m/s for corrections; the capture burn appears with a transfer.`
      return `Your spacecraft keeps ${fmt(reserve)} m/s for corrections on top of the ${fmt(moi)} m/s capture burn.`
    }),
  },
  {
    id: 'tcm',
    title: 'Trajectory correction maneuver',
    formula: 'Δv_TCM ≈ miss distance / time to go',
    plain:
      'No launch is perfect, so the arc drifts. A correction made early costs little Δv; the same correction made close to Mars costs much more. Skipping it risks missing the planet.',
    analogy: 'Fixing your aim right after the throw instead of chasing the ball later.',
    phases: ['cruise'],
    live: safe((v) => {
      const t = v.transfer
      const days = TCM_WINDOWS.map((w) => ('dayAfterLaunch' in w ? `day ${w.dayAfterLaunch}` : `${w.daysBeforeArrival} days before arrival`))
      const base = `Launch leaves an aiming error of about ${fmt(INJECTION_ERROR_SIGMA_MS)} m/s per axis (game balance). Correction windows: ${days.join(', ')}`
      if (!t) return `${base}.`
      const dates = TCM_WINDOWS.map((w) =>
        formatJd('dayAfterLaunch' in w ? t.depJd + w.dayAfterLaunch : t.arrJd - w.daysBeforeArrival),
      )
      return `${base} (${dates.join(', ')}).`
    }),
  },
  {
    id: 'soi',
    title: 'Sphere of influence',
    formula: 'r_SOI = a · (m / M)^(2/5)',
    plain:
      'Close to Mars, Mars’ gravity beats the Sun’s. The game switches which body the orbit belongs to when the spacecraft crosses that border (patched conics).',
    analogy: 'Crossing a border: from then on, the other country’s rules apply.',
    phases: ['arrival'],
    live: safe(
      () =>
        `Mars’ sphere of influence reaches ${fmt(SOI_MARS / 1000)} km. The game starts the encounter at ${fmt((MISSION.encounterSoiFactor * SOI_MARS) / 1000)} km (${fmt(MISSION.encounterSoiFactor)}× the SOI, to keep it forgiving).`,
    ),
  },
  {
    id: 'capture',
    title: 'Capture burn',
    formula: 'Δv = √(v∞² + 2GM/r_p) − v_ellipse(r_p)',
    plain:
      'The spacecraft arrives too fast to stay. A burn against the direction of motion at the lowest point turns the fly-by into an orbit.',
    analogy: 'Braking at the right corner to turn into the driveway.',
    phases: ['design', 'arrival', 'report'],
    live: safe((v) => {
      const t = v.transfer
      if (!t) return 'The capture burn depends on the arrival v∞. ' + NO_TRANSFER
      const circ = captureBurn(MU_MARS, LOW_MARS_ORBIT_RP, LOW_MARS_ORBIT_RP, t.vInfArrKms * 1000)
      return `v∞ ${fmt(t.vInfArrKms, 2)} km/s → capture into 300 × 33,000 km costs ${fmt(v.spacecraftStats.moiDvMs)} m/s. A low circular orbit would cost ${fmt(circ)} m/s.`
    }),
  },
  {
    id: 'inverse-square',
    title: 'Inverse-square law',
    formula: 'P ∝ 1 / d²',
    plain:
      'Light and radio spread out in every direction. At twice the distance the same energy covers four times the area, so only a quarter arrives.',
    analogy: 'A torch lights the wall more dimly as you step back.',
    phases: ['design', 'ops', 'report'],
    live: safe((v) => {
      const t = v.transfer
      const r = t ? sunDistanceAU('mars', t.arrJd) : MARS_MEAN_DISTANCE_AU
      const solar = `At ${fmt(r, 2)} AU solar panels get ${fmt(100 / (r * r))}% of their power at Earth: your arrays give ${fmt(v.spacecraftStats.powerGenAtMarsW)} W at Mars.`
      if (!t) return solar
      const d = earthMarsM(t.arrJd) / AU
      return `${solar} Earth is ${fmt(d, 2)} AU away on arrival, so the radio carries ${fmt(100 / (d * d))}% of its 1 AU rate.`
    }),
  },
  {
    id: 'link-budget',
    title: 'Link budget',
    formula: 'R(d) = R_1AU / d²',
    plain:
      'A radio link has a fixed budget of power. As Earth and Mars drift apart, the signal weakens with the square of the distance and the data rate falls with it.',
    analogy: 'Two people talking across a field speak slower the farther apart they stand.',
    phases: ['design', 'ops'],
    live: safe((v) => {
      const r1 = v.spacecraftStats.rateMbpsAt1AU
      if (!(r1 > 0)) return 'No antenna fitted: Earth would never hear the spacecraft.'
      const t = v.transfer
      if (!t) return `Your antennas: ${fmt(r1, 2)} Mbit/s at 1 AU. ${NO_TRANSFER}`
      const d = earthMarsM(t.arrJd) / AU
      const rate = dataRateMbps(r1, d)
      return `${fmt(r1, 2)} Mbit/s at 1 AU → ${fmt(rate, 3)} Mbit/s at ${fmt(d, 2)} AU on arrival. One ${fmt(DSN_CONTACT_HOURS_PER_DAY)} h Deep Space Network pass a day returns ${fmt(dataVolumeGb(rate, 1), 1)} Gbit.`
    }),
  },
  {
    id: 'light-delay',
    title: 'Signal delay',
    formula: 't = d / c',
    plain: 'Even radio is not instant. Commands take minutes to reach Mars, so spacecraft must look after themselves.',
    analogy: 'Writing letters instead of making a phone call.',
    phases: ['cruise', 'ops'],
    live: safe((v) => {
      const t = v.transfer
      if (!t) return 'Between about 3 and 22 minutes one way, depending on where the planets are. ' + NO_TRANSFER
      const dM = earthMarsM(t.arrJd)
      const min = dM / C / 60
      return `On arrival Earth is ${fmt(dM / 1e9, 0)} million km away: ${fmt(min, 1)} minutes one way, ${fmt(2 * min, 1)} for a reply.`
    }),
  },
  {
    id: 'solar-conjunction',
    title: 'Solar conjunction',
    formula: 'angle(Sun, Earth, Mars) < 3° → no link',
    plain:
      'About every 26 months Mars passes behind the Sun as seen from Earth. Hot solar plasma scrambles the radio, so missions stop sending commands for a couple of weeks.',
    analogy: 'Trying to read a sign with the Sun right behind it.',
    phases: ['ops'],
    live: safe((v) => {
      const t = v.transfer
      if (!t) return 'Blackout whenever Mars is within 3° of the Sun as seen from Earth. ' + NO_TRANSFER
      const days = MISSION.opsTurns * MISSION.turnDays
      let minAngle = Infinity
      for (let d = 0; d <= days; d++) minAngle = Math.min(minAngle, sunEarthMarsAngleDeg(t.arrJd + d))
      const end = formatJd(t.arrJd + days)
      const verdict = minAngle < 3 ? 'a blackout falls inside your operations' : 'no blackout (it starts below 3°)'
      return `During operations (${formatJd(t.arrJd)} → ${end}) Mars comes within ${fmt(minAngle, 1)}° of the Sun as seen from Earth: ${verdict}.`
    }),
  },
]

/** Concepts listed for a phase, in journey order. */
export function conceptsFor(phase: Phase): Concept[] {
  return CONCEPTS.filter((c) => c.phases.includes(phase))
}

/** Equation number of a concept (its position in CONCEPTS, from 1). */
export function conceptNumber(id: string): number {
  return CONCEPTS.findIndex((c) => c.id === id) + 1
}

/**
 * "How the game simplifies" (shown on the Data sources screen). Constants, planets and engine
 * specs are real; these are the places the game departs from a full mission analysis.
 */
export const SIMPLIFICATIONS: string[] = [
  'Two-body patched conics: near a planet only that planet pulls the spacecraft; far from it, only the Sun.',
  'Burns are instantaneous (impulsive): the velocity changes at one point instead of over minutes.',
  'Single-revolution transfers without gravity assists.',
  `The ascent from the pad is not flown. Reaching the 200 km parking orbit costs a Δv budget of ${fmt(ASCENT_DV)} m/s at liftoff TWR ${fmt(ASCENT_REFERENCE_TWR, 1)}, plus ${fmt(GRAVITY_LOSS_K)} × (1/TWR − 1/${fmt(ASCENT_REFERENCE_TWR, 1)}) m/s of gravity losses (game balance, calibrated against NASA Launch Services Program payload curves).`,
  `Every upper stage must ignite at a thrust-to-weight of at least ${fmt(UPPER_STAGE_MIN_TWR, 2)} (game balance), standing in for the gravity losses of long, weak burns.`,
  `Radio data rate falls as 1/d² from each antenna’s rate at 1 AU, with one ${fmt(DSN_CONTACT_HOURS_PER_DAY)}-hour Deep Space Network pass per day (game balance).`,
  `Part prices, science points, flare effects and the US$ ${fmt(MISSION.budgetM)} M budget are game balance. Physical constants, planet positions, engine specs and launch-vehicle curves are real.`,
]
