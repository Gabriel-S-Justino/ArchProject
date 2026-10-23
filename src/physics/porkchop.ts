// Earth → Mars transfers on real ephemerides, and the porkchop grid of launch C3 and arrival v∞
// over departure × arrival dates. Every cell is one Lambert solve between JPL Horizons states.
import { DAY, MU_SUN } from './constants'
import { EPHEMERIS_RANGE, bodyState } from './ephemeris'
import { lambert } from './lambert'
import { jdFromIso } from './time'
import { norm, sub } from './vec'
import type { StateVector, Vec3 } from './vec'

/** One Earth → Mars Lambert transfer. r/v in SI (m, m/s, heliocentric ecliptic J2000). */
export interface Transfer {
  depJd: number
  arrJd: number
  tofDays: number
  r1: Vec3
  v1: Vec3
  r2: Vec3
  v2: Vec3
  /** Hyperbolic excess velocity leaving Earth, m/s. */
  vInfDep: Vec3
  /** Hyperbolic excess velocity arriving at Mars, m/s. */
  vInfArr: Vec3
  /** Launch energy |vInfDep|², km²/s². */
  c3: number
  /** |vInfArr|, km/s. */
  vInfArrKms: number
}

export interface PorkchopSpec {
  depStartJd: number
  depEndJd: number
  depStepDays: number
  arrStartJd: number
  arrEndJd: number
  arrStepDays: number
  /** Inclusive time-of-flight limits, days. */
  minTofDays: number
  maxTofDays: number
}

export interface PorkchopGrid {
  spec: PorkchopSpec
  nDep: number
  nArr: number
  /** C3 (km²/s²), row-major [iArr * nDep + iDep]; NaN = no valid transfer. */
  c3: Float32Array
  /** Arrival v∞ (km/s), same layout; NaN exactly where c3 is NaN. */
  vInf: Float32Array
  /** Minimum-C3 valid cell (always finite: computePorkchop throws when no cell is valid). */
  best: { depJd: number; arrJd: number; c3: number }
}

/** Worker message in: `{ spec }` (default grid when omitted). Out: a PorkchopGrid. */
export interface PorkchopRequest {
  spec?: PorkchopSpec
}

const jd = (iso: string) => jdFromIso(`${iso}T00:00:00Z`)

/** The late-2026 Earth → Mars opportunity. */
export const DEFAULT_PORKCHOP: PorkchopSpec = {
  depStartJd: jd('2026-09-01'),
  depEndJd: jd('2027-01-31'),
  depStepDays: 2,
  arrStartJd: jd('2027-04-01'),
  arrEndJd: jd('2028-03-31'),
  arrStepDays: 3,
  minTofDays: 100,
  maxTofDays: 500,
}

export type TofLimits = Pick<PorkchopSpec, 'minTofDays' | 'maxTofDays'>

const inEphemeris = (t: number) => t >= EPHEMERIS_RANGE.startJd && t <= EPHEMERIS_RANGE.endJd

/** Shared by transferFor and computePorkchop so a grid cell and its transfer are bit-identical. */
function solveTransfer(
  depJd: number,
  arrJd: number,
  earth: StateVector,
  mars: StateVector,
  limits: TofLimits,
): Transfer | null {
  const tofDays = arrJd - depJd
  if (!(tofDays > 0 && tofDays >= limits.minTofDays && tofDays <= limits.maxTofDays)) return null
  const sol = lambert(earth.r, mars.r, tofDays * DAY, MU_SUN)
  if (!sol) return null
  const vInfDep = sub(sol.v1, earth.v)
  const vInfArr = sub(sol.v2, mars.v)
  const c3 = (norm(vInfDep) / 1000) ** 2
  const vInfArrKms = norm(vInfArr) / 1000
  // The grid stores Float32: a value that would round to Infinity there is no usable transfer.
  if (!Number.isFinite(Math.fround(c3)) || !Number.isFinite(Math.fround(vInfArrKms))) return null
  return { depJd, arrJd, tofDays, r1: earth.r, v1: sol.v1, r2: mars.r, v2: sol.v2, vInfDep, vInfArr, c3, vInfArrKms }
}

/**
 * The Earth → Mars transfer departing at depJd and arriving at arrJd, or null when there is none:
 * arrival not after departure, TOF outside `limits` (default: DEFAULT_PORKCHOP's 100–500 d,
 * inclusive), a date outside EPHEMERIS_RANGE, or no Lambert solution. Exactly the cells that
 * computePorkchop stores as NaN map to null here.
 */
export function transferFor(depJd: number, arrJd: number, limits: TofLimits = DEFAULT_PORKCHOP): Transfer | null {
  if (!inEphemeris(depJd) || !inEphemeris(arrJd)) return null
  return solveTransfer(depJd, arrJd, bodyState('earth', depJd), bodyState('mars', arrJd), limits)
}

/** Number of grid points from start to end inclusive in steps of `step` (tolerant of FP error). */
function axisLength(start: number, end: number, step: number): number {
  return Math.floor((end - start) / step + 1e-9) + 1
}

/**
 * C3 and arrival v∞ for every departure × arrival date of the spec. Cells whose TOF is outside
 * [minTofDays, maxTofDays] or that have no Lambert solution are NaN in both arrays, never
 * Infinity. Throws RangeError for a malformed spec, a spec outside EPHEMERIS_RANGE, or a spec
 * with no valid cell (so `best` is always a real transfer).
 */
export function computePorkchop(spec: PorkchopSpec = DEFAULT_PORKCHOP): PorkchopGrid {
  const { depStartJd, depEndJd, depStepDays, arrStartJd, arrEndJd, arrStepDays } = spec
  const finite = Object.values(spec).every((v) => Number.isFinite(v))
  if (!finite || !(depStepDays > 0) || !(arrStepDays > 0) || depEndJd < depStartJd || arrEndJd < arrStartJd) {
    throw new RangeError(`Malformed porkchop spec: ${JSON.stringify(spec)}`)
  }
  if (![depStartJd, depEndJd, arrStartJd, arrEndJd].every(inEphemeris)) {
    throw new RangeError(
      `Porkchop spec outside ephemeris coverage ${EPHEMERIS_RANGE.startJd}–${EPHEMERIS_RANGE.endJd}`,
    )
  }

  const nDep = axisLength(depStartJd, depEndJd, depStepDays)
  const nArr = axisLength(arrStartJd, arrEndJd, arrStepDays)
  const depJds = Array.from({ length: nDep }, (_, i) => depStartJd + i * depStepDays)
  const earth = depJds.map((t) => bodyState('earth', t))
  const c3 = new Float32Array(nDep * nArr).fill(Number.NaN)
  const vInf = new Float32Array(nDep * nArr).fill(Number.NaN)
  let best: PorkchopGrid['best'] | null = null

  for (let iArr = 0; iArr < nArr; iArr++) {
    const arrJd = arrStartJd + iArr * arrStepDays
    const mars = bodyState('mars', arrJd)
    for (let iDep = 0; iDep < nDep; iDep++) {
      const t = solveTransfer(depJds[iDep]!, arrJd, earth[iDep]!, mars, spec)
      if (!t) continue
      const k = iArr * nDep + iDep
      c3[k] = t.c3
      vInf[k] = t.vInfArrKms
      if (!best || t.c3 < best.c3) best = { depJd: t.depJd, arrJd, c3: t.c3 }
    }
  }
  if (!best) throw new RangeError('Porkchop spec contains no valid transfer')
  return { spec, nDep, nArr, c3, vInf, best }
}
