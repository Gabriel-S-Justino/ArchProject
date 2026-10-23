// Scale and sampling for the solar-system scenes (pure; no three.js). Heliocentric ecliptic J2000
// positions in metres map to scene units at 1 AU = 100 units, with ecliptic north as the scene's +y:
// (x, y, z) → (x, z, −y), a proper rotation. Orbits and arcs are written into flat Float32Arrays so
// the scenes can fill GPU buffers in place; points the Kepler solver could not converge on (NaN) are
// skipped, never drawn.
import { AU, MU_SUN, R_EARTH, R_MARS } from '@/physics/constants'
import { EPHEMERIS_RANGE, bodyState, type Body } from '@/physics/ephemeris'
import { propagate } from '@/physics/kepler'
import type { Transfer } from '@/physics/porkchop'
import { J2000_JD } from '@/physics/time'
import type { StateVector, Vec3 } from '@/physics/vec'

export const UNITS_PER_AU = 100
/** Scene units per metre. */
export const UNITS_PER_M = UNITS_PER_AU / AU
const DAY_S = 86400

/** Sidereal periods, days (NASA planetary fact sheets): one orbit line each. */
export const ORBIT_PERIOD_DAYS: Record<Body, number> = { earth: 365.256, mars: 686.98 }

/** Real radii, m (the Sun: IAU nominal 695,700 km). */
const REAL_RADIUS_M = { sun: 695_700e3, earth: R_EARTH, mars: R_MARS }

/** Drawn Earth radius, scene units. */
const EARTH_DRAWN = 1.5

/**
 * Drawn radii, scene units. Not to scale: at 1 AU = 100 units the Earth would be 0.004 units wide,
 * so both planets are enlarged by the same factor (about 350 times, keeping Mars at 0.53 of the
 * Earth's size) and the Sun about thirteen times, to be seen at all.
 */
export const DISPLAY_RADIUS = { sun: 6, earth: EARTH_DRAWN, mars: (EARTH_DRAWN * R_MARS) / R_EARTH } as const

/** Scene units per metre of spacecraft in the solar view: the model is drawn ~90 million times larger. */
export const SHIP_SCALE = 0.06

/** How many times larger than real each body is drawn. */
export function exaggeration(body: keyof typeof DISPLAY_RADIUS): number {
  return DISPLAY_RADIUS[body] / (REAL_RADIUS_M[body] * UNITS_PER_M)
}

/** Rounds an enlargement factor for display: two significant figures. */
export function roundFactor(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return NaN
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1)
  return Math.round(x / p) * p
}

/**
 * The "not to scale" line: one factor for both planets (they share it), the Sun's, and with
 * `ship` the spacecraft's. Every factor is the drawn size over the real size.
 */
export function scaleNote(ship: boolean): string {
  const fmt = (x: number) => x.toLocaleString('en-US')
  const planets = roundFactor(exaggeration('earth'))
  const sun = roundFactor(exaggeration('sun'))
  const sc = roundFactor(SHIP_SCALE / UNITS_PER_M)
  return `To scale except sizes: planets ×${fmt(planets)}, Sun ×${fmt(sun)}${ship ? `, spacecraft ×${fmt(sc / 1e6)} million` : ''}.`
}

/**
 * Writes the flown part of a sampled arc into `out`: the samples passed at fraction `frac` of the
 * flight (whole segments only, never beyond), then one last point exactly at `end` (the ship's
 * scene position; without it, the point interpolated at `frac`). Returns the point count.
 * Capacity: arc points + 1.
 */
export function writeTrail(arc: Float32Array, frac: number, end: ArrayLike<number> | null, out: Float32Array): number {
  const n = Math.floor(arc.length / 3)
  if (n < 2 || out.length < 6) return 0
  const f = Math.min(1, Math.max(0, Number.isFinite(frac) ? frac : 0))
  const seg = n - 1
  const k = Math.min(seg, Math.floor(seg * f + 1e-9))
  const cap = Math.floor(out.length / 3)
  const keep = Math.min(k + 1, cap - 1)
  out.set(arc.subarray(0, keep * 3), 0)
  let ex: number, ey: number, ez: number
  if (end) {
    ex = end[0]!
    ey = end[1]!
    ez = end[2]!
  } else {
    const u = k < seg ? seg * f - k : 0
    const a = k * 3
    const b = Math.min(seg, k + 1) * 3
    ex = arc[a]! + (arc[b]! - arc[a]!) * u
    ey = arc[a + 1]! + (arc[b + 1]! - arc[a + 1]!) * u
    ez = arc[a + 2]! + (arc[b + 2]! - arc[a + 2]!) * u
  }
  if (!Number.isFinite(ex) || !Number.isFinite(ey) || !Number.isFinite(ez)) return keep
  const l = (keep - 1) * 3
  if (Math.hypot(ex - out[l]!, ey - out[l + 1]!, ez - out[l + 2]!) < 1e-6) return keep
  out[keep * 3] = ex
  out[keep * 3 + 1] = ey
  out[keep * 3 + 2] = ez
  return keep + 1
}

/**
 * Writes the scene position of heliocentric `r` (m) into out[offset..offset+2]. Returns false and
 * writes nothing when any component is not finite.
 */
export function writeScene(r: readonly number[], out: Float32Array | number[], offset = 0): boolean {
  const x = r[0]!
  const y = r[1]!
  const z = r[2]!
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
  out[offset] = x * UNITS_PER_M
  out[offset + 1] = z * UNITS_PER_M
  out[offset + 2] = -y * UNITS_PER_M
  return true
}

/** Scene position of heliocentric `r` (m), as a new tuple (NaN in, NaN out). */
export function toScene(r: readonly number[]): [number, number, number] {
  return [r[0]! * UNITS_PER_M, r[2]! * UNITS_PER_M, -r[1]! * UNITS_PER_M]
}

/**
 * Fills `out` with up to `n` scene points of the two-body conic through `s0` from t = 0 to
 * `durationS` (evenly spaced in time, each propagated directly from s0), skipping points the
 * solver returned as NaN. Capacity is out.length / 3. Returns the number of points written.
 */
export function writeConic(out: Float32Array, s0: StateVector, mu: number, durationS: number, n: number): number {
  const cap = Math.min(n, Math.floor(out.length / 3))
  if (cap <= 0 || !Number.isFinite(durationS)) return 0
  let k = 0
  for (let i = 0; i < cap; i++) {
    const t = cap === 1 ? 0 : (i / (cap - 1)) * durationS
    const s = t === 0 ? s0 : propagate(s0, mu, t)
    if (writeScene(s.r, out, k * 3)) k++
  }
  return k
}

/** The finite scene points of a conic, trimmed to their count (see writeConic). */
export function conicPoints(s0: StateVector, mu: number, durationS: number, n: number): Float32Array {
  const buf = new Float32Array(Math.max(0, n) * 3)
  const k = writeConic(buf, s0, mu, durationS, n)
  return buf.slice(0, k * 3)
}

/** Points per transfer arc: smooth at any zoom of the solar view, < 1 ms to sample. */
export const ARC_POINTS = 181

const arcCache = new WeakMap<Transfer, Float32Array>()

/**
 * The transfer's heliocentric arc from (r1, v1) over its time of flight, in scene units, NaN
 * points dropped. Cached per Transfer object (the porkchop plot hands out one object per cell), so
 * hovering back and forth samples each cell once.
 */
export function transferArc(t: Transfer): Float32Array {
  const hit = arcCache.get(t)
  if (hit) return hit
  const pts = conicPoints({ r: t.r1, v: t.v1 }, MU_SUN, t.tofDays * DAY_S, ARC_POINTS)
  arcCache.set(t, pts)
  return pts
}

/**
 * One orbit of a body from the JPL Horizons ephemeris itself (not a conic): `n` dates spread over
 * one sidereal period from the start of the file, clamped to its range. Scene units.
 */
export function ephemerisOrbit(body: Body, n = 256): Float32Array {
  const span = Math.min(ORBIT_PERIOD_DAYS[body], EPHEMERIS_RANGE.endJd - EPHEMERIS_RANGE.startJd)
  const out = new Float32Array(n * 3)
  let k = 0
  for (let i = 0; i < n; i++) {
    // n points over one period, the last one short of closing (drawn as a loop).
    const jd = EPHEMERIS_RANGE.startJd + (i / n) * span
    if (writeScene(bodyState(body, jd).r, out, k * 3)) k++
  }
  return out.slice(0, k * 3)
}

/** The mission date clamped into the ephemeris range (bodyState throws outside it). */
export const clampJd = (jd: number) =>
  Number.isFinite(jd) ? Math.min(EPHEMERIS_RANGE.endJd, Math.max(EPHEMERIS_RANGE.startJd, jd)) : EPHEMERIS_RANGE.startJd

/**
 * Cumulative distance along a polyline (for dashed lines), written into `out` (length ≥ count).
 */
export function writeLineDistances(points: Float32Array, count: number, out: Float32Array): void {
  let d = 0
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      const a = (i - 1) * 3
      const b = i * 3
      d += Math.hypot(points[b]! - points[a]!, points[b + 1]! - points[a + 1]!, points[b + 2]! - points[a + 2]!)
    }
    out[i] = d
  }
}

// ---------------------------------------------------------------------------------------------
// Body orientation (IAU WGCCRE 2015 rotation elements, simplified to their constant and linear
// terms), as an orthonormal basis in scene coordinates: local +y is the north pole, local +x the
// prime meridian on the equator. The textures put longitude 0 at the centre (three.js sphere +x).

/** Obliquity of the ecliptic at J2000, rad. */
export const OBLIQUITY = (23.4392911 * Math.PI) / 180

/** ICRF (equatorial J2000) unit vector → ecliptic J2000. */
function eqToEcl(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY)
  const s = Math.sin(OBLIQUITY)
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]
}

const ROT = {
  // Earth: pole at the ICRF pole; W is the Greenwich sidereal angle.
  earth: { ra: 0, dec: 90, w0: 190.147, wd: 360.9856235 },
  mars: { ra: 317.68143, dec: 52.8865, w0: 176.63, wd: 350.89198226 },
} as const

export interface Basis {
  x: [number, number, number]
  y: [number, number, number]
  z: [number, number, number]
}

/** The body's axes in scene coordinates at a Julian Date. */
export function bodyBasis(body: Body, jd: number): Basis {
  const r = ROT[body]
  const deg = Math.PI / 180
  const ra = r.ra * deg
  const dec = r.dec * deg
  const pole: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
  // Ascending node of the body's equator on the ICRF equator (ICRF x for the Earth).
  const node: Vec3 = r.dec >= 90 ? [1, 0, 0] : [-Math.sin(ra), Math.cos(ra), 0]
  const q: Vec3 = [pole[1] * node[2] - pole[2] * node[1], pole[2] * node[0] - pole[0] * node[2], pole[0] * node[1] - pole[1] * node[0]]
  const W = ((r.w0 + r.wd * (jd - J2000_JD)) % 360) * deg
  // Prime meridian: rotate the node by W about the pole (right-handed).
  const pm: Vec3 = [
    Math.cos(W) * node[0] + Math.sin(W) * q[0],
    Math.cos(W) * node[1] + Math.sin(W) * q[1],
    Math.cos(W) * node[2] + Math.sin(W) * q[2],
  ]
  const toS = (v: Vec3): [number, number, number] => {
    const e = eqToEcl(v)
    return [e[0], e[2], -e[1]]
  }
  const x = toS(pm)
  const y = toS(pole)
  // z = x × y keeps the basis right-handed (three.js: x × y = z).
  const z: [number, number, number] = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
  return { x, y, z }
}
