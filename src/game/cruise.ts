// The cruise from Earth to Mars: the ship flies a heliocentric two-body orbit from the departure
// date to the arrival date, starting from the real Lambert transfer plus a seeded launch-vehicle
// injection error. Trajectory correction maneuvers re-solve Lambert from the ship's current state to
// Mars' real position (JPL Horizons) on the arrival date; at arrival the ship either brakes into
// the capture orbit or flies by. Patched conics: only the Sun's gravity acts during cruise (Earth's
// and Mars' pulls are ignored until arrival), the standard first-order model for interplanetary
// targeting. Flare events are in ./events.ts.
//
// Every function returns a new state object and never mutates its input, so the UI can store each
// state as-is. Numbers in a CruiseState are always finite (Review Focus 4).
// Framework-free: no React, Three.js or DOM.
import { MISSION } from '@/data/mission'
import { DAY, MU_MARS, MU_SUN, R_MARS } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import { propagate } from '@/physics/kepler'
import { lambert } from '@/physics/lambert'
import { captureBurn } from '@/physics/orbit'
import { transferFor } from '@/physics/porkchop'
import { propellantFromMass } from '@/physics/rocket'
import { formatJd } from '@/physics/time'
import { add, cross, dot, norm, normalize, scale, sub } from '@/physics/vec'
import type { StateVector, Vec3 } from '@/physics/vec'
import { spacecraftPartById } from '@/data/spacecraftParts'
import type { MissionDesign } from './checklist'
import { scheduleEvents, type CruiseEvent, type ResolvedEvent } from './events'
import { createRng } from './rng'
import { analyseSpacecraft } from './spacecraft'

export interface CruiseState {
  /** Current date, Julian Date. */
  jd: number
  /** Launch (departure) date, JD. */
  depJd: number
  /** Planned arrival date, JD. The cruise never advances past it. */
  arrJd: number
  /** Heliocentric state, SI (m, m/s, ecliptic J2000 like the ephemerides). */
  ship: StateVector
  propellantKg: number
  dryKg: number
  /** Isp of the propulsion system, s (0 = none fitted: every burn is impossible). */
  ispS: number
  /** Launch-vehicle injection error added to the Lambert departure velocity, m/s. */
  injectionErrorMs: Vec3
  tcms: { jd: number; dvMs: number }[]
  events: ResolvedEvent[]
  /** Part ids of instruments disabled by flares. */
  damaged: string[]
  /** Cruise science points (game balance). */
  cruiseScience: number
  /** Days spent in safe mode (game balance). */
  safeModeDays: number
  log: string[]
  /** The flare events of this cruise (seeded), in time order. */
  schedule: CruiseEvent[]
  /** Part ids of the instruments fitted at launch. */
  instruments: string[]
  /** Flare damage risk removed by shielding, 0..1 (spacecraftStats.shield). */
  shield: number
  /** Stored battery energy, Wh (spacecraftStats.batteryWh). */
  batteryWh: number
}

/** Trajectory correction windows: early, mid-cruise and final approach (game schedule). */
export const TCM_WINDOWS = [
  { id: 'TCM-1', dayAfterLaunch: 15 },
  { id: 'TCM-2', dayAfterLaunch: 60 },
  { id: 'TCM-3', daysBeforeArrival: 30 },
] as const

export type TcmWindowId = (typeof TCM_WINDOWS)[number]['id']

/** Standard deviation of the injection error per axis, m/s (game balance, typical of upper stages). */
export const INJECTION_ERROR_SIGMA_MS = 2

/** Capture is possible only if the predicted distance from the aim point (Mars' centre) on the arrival date is within this, km. */
export const CAPTURE_MAX_MISS_KM = 10_000

/** Dates closer than this (days, ≈ 0.09 s) count as equal, so float round-off never repeats a window. */
const JD_EPS = 1e-6

const finite = (x: number, fallback = 0) => (Number.isFinite(x) ? x : fallback)

/** One standard normal from two uniforms (Box–Muller). u1 ∈ (0, 1] so the log is finite. */
function normalPair(rng: () => number): [number, number] {
  const u1 = 1 - rng()
  const u2 = rng()
  const r = Math.sqrt(-2 * Math.log(u1))
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)]
}

/** Three independent N(0, σ) components from the seeded generator. */
function injectionError(seed: number): Vec3 {
  const rng = createRng(seed)
  const [a, b] = normalPair(rng)
  const [c] = normalPair(rng)
  const s = INJECTION_ERROR_SIGMA_MS
  return [a * s, b * s, c * s]
}

/** Propellant needed for dvMs from the ship's current mass (dry + propellant), kg. */
export const burnPropellantKg = (c: CruiseState, dvMs: number) =>
  propellantFromMass(dvMs, c.ispS, c.dryKg + c.propellantKg)

/**
 * The cruise right after launch: the ship at Earth's position on the departure date with the
 * Lambert v1 plus the injection error (default: seeded, N(0, 2 m/s) per axis). Propellant is what
 * the spacecraft budget loaded (capture burn + TCM reserve). Throws RangeError when the design has
 * no transfer — the launch checklist guarantees one before launch.
 */
export function startCruise(design: MissionDesign, seed: number, opts?: { injectionErrorMs?: Vec3 }): CruiseState {
  const t = design.transfer ? transferFor(design.transfer.depJd, design.transfer.arrJd) : null
  if (!t) throw new RangeError('startCruise: the design has no valid Earth → Mars transfer')
  const sc = analyseSpacecraft(design.spacecraft, t.vInfArrKms)
  const err: Vec3 = opts?.injectionErrorMs ? [...opts.injectionErrorMs] : injectionError(seed)
  const instruments = Object.entries(design.spacecraft.parts)
    .filter(([id, n]) => Number.isFinite(n) && n > 0 && spacecraftPartById(id)?.category === 'instrument')
    .map(([id]) => id)
  return {
    jd: t.depJd,
    depJd: t.depJd,
    arrJd: t.arrJd,
    ship: { r: [...t.r1], v: add(t.v1, err) },
    propellantKg: finite(sc.stats.propellantKg),
    dryKg: finite(sc.stats.dryKg),
    ispS: finite(sc.propulsion?.ispS ?? 0),
    injectionErrorMs: err,
    tcms: [],
    events: [],
    damaged: [],
    cruiseScience: 0,
    safeModeDays: 0,
    log: [`${formatJd(t.depJd)} Launch: injection error ${norm(err).toFixed(2)} m/s`],
    schedule: scheduleEvents(seed, t.tofDays),
    instruments,
    shield: finite(sc.stats.shield),
    batteryWh: finite(sc.stats.batteryWh),
  }
}

/**
 * The state `days` later (clamped so it never passes arrJd). One two-body propagation about the
 * Sun from the current state, so it is O(1) and cheap enough for every animation frame. Zero,
 * negative and non-finite steps return the input unchanged.
 */
export function advanceCruise(c: CruiseState, days: number): CruiseState {
  if (!Number.isFinite(days) || days <= 0 || c.jd >= c.arrJd) return c
  const target = Math.min(c.jd + days, c.arrJd)
  const ship = propagate(c.ship, MU_SUN, (target - c.jd) * DAY)
  if (!ship.r.every(Number.isFinite) || !ship.v.every(Number.isFinite)) return c
  return { ...c, jd: target, ship }
}

/** The TCM windows of this cruise as dates, in time order, keeping only those inside the cruise. */
export function tcmWindows(c: CruiseState): { id: TcmWindowId; jd: number }[] {
  return TCM_WINDOWS.map((w) => ({
    id: w.id,
    jd: 'dayAfterLaunch' in w ? c.depJd + w.dayAfterLaunch : c.arrJd - w.daysBeforeArrival,
  }))
    .filter((w) => w.jd > c.depJd && w.jd < c.arrJd)
    .sort((a, b) => a.jd - b.jd)
}

/**
 * The first TCM window strictly after the current date, or null. The UI advances by at most
 * `jd − c.jd` so time warp stops exactly on it, then offers the TCM.
 */
export function nextTcmWindow(c: CruiseState): { id: TcmWindowId; jd: number } | null {
  return tcmWindows(c).find((w) => w.jd > c.jd + JD_EPS) ?? null
}

/**
 * Within this angle of a 180° transfer the Lambert plane (r1 × r2) is ill-defined: an out-of-plane
 * correction costs ∝ 1/sin Δθ (≈ 940 m/s at TCM-1 of the reference transfer, whose ~196° arc
 * passes 180° from Mars' arrival point on day ~15, versus ≈ 6 m/s five days later). There the TCM
 * corrects in the ship's current orbital plane only, the way navigators treat near-180° transfers,
 * and the small out-of-plane miss left over is removed by the next TCM. sin 5° ≈ 0.087 keeps the
 * out-of-plane amplification below ~11×.
 */
export const NEAR_180_DEG = 5

/**
 * The point the TCM aims at: Mars' position on the arrival date, projected onto the ship's current
 * orbital plane when the transfer angle is within NEAR_180_DEG of 180°.
 */
function aimPoint(c: CruiseState): Vec3 {
  const mars = bodyState('mars', c.arrJd).r
  const cosAngle = dot(c.ship.r, mars) / (norm(c.ship.r) * norm(mars))
  if (!(cosAngle < -Math.cos((NEAR_180_DEG * Math.PI) / 180))) return mars
  const n = normalize(cross(c.ship.r, c.ship.v))
  return sub(mars, scale(n, dot(n, mars)))
}

/** Lambert v1 from the ship's position to the aim point on the arrival date, or null when there is none. */
function retarget(c: CruiseState): Vec3 | null {
  const tof = (c.arrJd - c.jd) * DAY
  if (!(tof > 0)) return null
  const sol = lambert(c.ship.r, aimPoint(c), tof, MU_SUN)
  if (!sol || !sol.v1.every(Number.isFinite)) return null
  return sol.v1
}

/**
 * Δv of a TCM now, m/s: the change from the current velocity to the Lambert velocity that hits
 * Mars' position on the arrival date. Infinity (never NaN) when no Lambert arc exists.
 */
export function tcmCost(c: CruiseState): number {
  const v1 = retarget(c)
  if (!v1) return Infinity
  const dv = norm(sub(v1, c.ship.v))
  return Number.isFinite(dv) ? dv : Infinity
}

/** What a TCM now would cost, for the UI: offered disabled with a reason when unaffordable. */
export function tcmQuote(c: CruiseState): { dvMs: number; propellantKg: number; available: boolean; reason?: string } {
  const dvMs = tcmCost(c)
  if (!Number.isFinite(dvMs)) {
    return { dvMs: 0, propellantKg: 0, available: false, reason: 'No correction trajectory to Mars from here' }
  }
  const kg = burnPropellantKg(c, dvMs)
  if (!(kg <= c.propellantKg)) {
    const need = Number.isFinite(kg) ? `${kg.toFixed(1)} kg` : 'a working engine'
    return {
      dvMs,
      propellantKg: 0,
      available: false,
      reason: `Not enough propellant: needs ${need}, ${c.propellantKg.toFixed(1)} kg left`,
    }
  }
  return { dvMs, propellantKg: kg, available: true }
}

/**
 * Performs a TCM now: sets the velocity to the Lambert v1 that hits Mars on the arrival date and
 * burns the propellant for it (rocket equation on the current mass). Returns an error, with the
 * state unchanged, when the propellant (or the engine) cannot deliver the Δv or no arc exists.
 */
export function applyTcm(c: CruiseState): CruiseState | { error: 'insufficient-propellant' } {
  const v1 = retarget(c)
  if (!v1) return { error: 'insufficient-propellant' }
  const dvMs = norm(sub(v1, c.ship.v))
  const kg = burnPropellantKg(c, dvMs)
  if (!Number.isFinite(dvMs) || !(kg <= c.propellantKg)) return { error: 'insufficient-propellant' }
  return {
    ...c,
    ship: { r: [...c.ship.r], v: v1 },
    propellantKg: Math.max(0, c.propellantKg - kg),
    tcms: [...c.tcms, { jd: c.jd, dvMs }],
    log: [...c.log, `${formatJd(c.jd)} TCM ${dvMs.toFixed(2)} m/s (${kg.toFixed(1)} kg propellant)`],
  }
}

/**
 * Where the ship will be on the arrival date if nothing changes: distance from Mars' centre (km)
 * and speed relative to Mars (km/s, the arrival v∞ in the patched-conic model). Infinity miss and
 * 0 v∞ if the propagation fails (never NaN).
 */
export function predictArrival(c: CruiseState): { missKm: number; vInfKms: number } {
  const s = propagate(c.ship, MU_SUN, (c.arrJd - c.jd) * DAY)
  const mars = bodyState('mars', c.arrJd)
  const missKm = norm(sub(s.r, mars.r)) / 1000
  const vInfKms = norm(sub(s.v, mars.v)) / 1000
  if (!Number.isFinite(missKm) || !Number.isFinite(vInfKms)) return { missKm: Infinity, vInfKms: 0 }
  return { missKm, vInfKms }
}

export interface ArrivalResult {
  captured: boolean
  /** Arrival v∞ relative to Mars, km/s. */
  vInfKms: number
  /** Mars orbit insertion Δv at that v∞ into the MISSION capture orbit, m/s. */
  moiDvMs: number
  reason?: 'miss' | 'propellant'
  /** Distance from the aim point (Mars' centre) on the arrival date, km (R34; finite, capped at 1e12 if unknown). Not a closest approach. */
  missKm: number
  /** Propellant left after arrival (MOI subtracted on capture), kg — for scoring. */
  propellantLeftKg: number
}

/**
 * Arrival at Mars. Capture iff the distance from the aim point (Mars' centre) on the arrival date
 * (R34, not a closest approach) is ≤ 10,000 km and the propellant covers the
 * capture burn into the 300 km × 33,000 km orbit at the actual v∞ (rocket equation on the current
 * mass); otherwise a flyby, with the reason ('miss' takes precedence).
 */
export function arrive(c: CruiseState): ArrivalResult {
  const p = predictArrival(c)
  const rp = R_MARS + MISSION.capturePeriapsisAltM
  const ra = R_MARS + MISSION.captureApoapsisAltM
  const moiDvMs = finite(captureBurn(MU_MARS, rp, ra, p.vInfKms * 1000))
  const base = { vInfKms: p.vInfKms, moiDvMs, missKm: Math.min(p.missKm, 1e12) }
  if (!(p.missKm <= CAPTURE_MAX_MISS_KM)) {
    return { ...base, captured: false, reason: 'miss', propellantLeftKg: c.propellantKg }
  }
  const kg = burnPropellantKg(c, moiDvMs)
  if (!(kg <= c.propellantKg)) {
    return { ...base, captured: false, reason: 'propellant', propellantLeftKg: c.propellantKg }
  }
  return { ...base, captured: true, propellantLeftKg: Math.max(0, c.propellantKg - kg) }
}
