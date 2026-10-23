import { beforeAll, describe, expect, it } from 'vitest'
import { DAY, MU_SUN } from './constants'
import { bodyState } from './ephemeris'
import { propagate } from './kepler'
import { DEFAULT_PORKCHOP, computePorkchop, transferFor } from './porkchop'
import type { PorkchopGrid } from './porkchop'
import { jdFromIso } from './time'
import { cross, norm, sub } from './vec'

const jd = (iso: string) => jdFromIso(`${iso}T00:00:00Z`)

describe('DEFAULT_PORKCHOP', () => {
  it('spans departures 2026-09-01 → 2027-01-31 (2 d) and arrivals 2027-04-01 → 2028-03-31 (3 d), TOF 100–500 d', () => {
    expect(DEFAULT_PORKCHOP).toEqual({
      depStartJd: jd('2026-09-01'),
      depEndJd: jd('2027-01-31'),
      depStepDays: 2,
      arrStartJd: jd('2027-04-01'),
      arrEndJd: jd('2028-03-31'),
      arrStepDays: 3,
      minTofDays: 100,
      maxTofDays: 500,
    })
  })
})

describe('transferFor', () => {
  it('round-trips: propagating (r1, v1) for the TOF lands within 10 km of r2', () => {
    const t = transferFor(jd('2026-11-15'), jd('2027-09-01'))!
    expect(t).not.toBeNull()
    expect(t.tofDays).toBe(290)
    const end = propagate({ r: t.r1, v: t.v1 }, MU_SUN, t.tofDays * DAY)
    expect(norm(sub(end.r, t.r2))).toBeLessThan(10e3)
  })

  it('anchors r1/r2 on Earth and Mars and derives v∞, C3 (km²/s²) and arrival v∞ (km/s)', () => {
    const dep = jd('2026-11-15')
    const arr = jd('2027-09-01')
    const t = transferFor(dep, arr)!
    const earth = bodyState('earth', dep)
    const mars = bodyState('mars', arr)
    expect(t.depJd).toBe(dep)
    expect(t.arrJd).toBe(arr)
    expect(t.r1).toEqual(earth.r)
    expect(t.r2).toEqual(mars.r)
    expect(norm(sub(t.vInfDep, sub(t.v1, earth.v)))).toBeLessThan(1e-9)
    expect(norm(sub(t.vInfArr, sub(t.v2, mars.v)))).toBeLessThan(1e-9)
    expect(t.c3).toBeCloseTo((norm(t.vInfDep) / 1000) ** 2, 9)
    expect(t.vInfArrKms).toBeCloseTo(norm(t.vInfArr) / 1000, 9)
  })

  it('returns null for TOF outside the default 100–500 d, for arrival before departure and outside the ephemeris', () => {
    expect(transferFor(jd('2026-11-15'), jd('2027-02-01'))).toBeNull() // 78 d
    expect(transferFor(jd('2026-09-01'), jd('2028-03-31'))).toBeNull() // 577 d
    expect(transferFor(jd('2027-09-01'), jd('2026-11-15'))).toBeNull()
    expect(transferFor(jd('2026-11-15'), jd('2026-11-15'))).toBeNull()
    expect(transferFor(jd('2020-07-30'), jd('2021-02-18'))).toBeNull()
    expect(transferFor(jd('2029-01-01'), jd('2030-01-01'))).toBeNull()
  })

  it('accepts custom TOF limits', () => {
    expect(transferFor(jd('2026-11-15'), jd('2027-02-01'), { minTofDays: 50, maxTofDays: 600 })).not.toBeNull()
  })
})

describe('computePorkchop on the default grid (real Horizons ephemerides)', () => {
  let grid: PorkchopGrid
  let elapsedMs: number

  beforeAll(() => {
    const t0 = performance.now()
    grid = computePorkchop(DEFAULT_PORKCHOP)
    elapsedMs = performance.now() - t0
  })

  it('runs in under 3 s in Node', () => {
    expect(elapsedMs).toBeLessThan(3000)
  })

  it('has a row-major [iArr * nDep + iDep] grid of the spec size', () => {
    expect(grid.spec).toEqual(DEFAULT_PORKCHOP)
    expect(grid.nDep).toBe(77) // 152 d / 2 + 1
    expect(grid.nArr).toBe(122) // 365 d / 3 + 1 (2028-03-29 is the last 3-day step)
    expect(grid.c3).toBeInstanceOf(Float32Array)
    expect(grid.vInf).toBeInstanceOf(Float32Array)
    expect(grid.c3.length).toBe(grid.nDep * grid.nArr)
    expect(grid.vInf.length).toBe(grid.nDep * grid.nArr)
    const iDep = 37
    const iArr = 55
    const dep = DEFAULT_PORKCHOP.depStartJd + iDep * DEFAULT_PORKCHOP.depStepDays
    const arr = DEFAULT_PORKCHOP.arrStartJd + iArr * DEFAULT_PORKCHOP.arrStepDays
    const t = transferFor(dep, arr)!
    expect(t).not.toBeNull()
    expect(grid.c3[iArr * grid.nDep + iDep]).toBe(Math.fround(t.c3))
    expect(grid.vInf[iArr * grid.nDep + iDep]).toBe(Math.fround(t.vInfArrKms))
  })

  // Validation against a published reference (spec §6).
  //
  // Reference: L. M. Burke, R. D. Falck, M. L. McGuire, "Interplanetary Mission Design Handbook:
  // Earth-to-Mars Mission Opportunities 2026 to 2045", NASA/TM-2010-216764, NASA Glenn Research
  // Center, Oct 2010. https://ntrs.nasa.gov/citations/20100037210 — Table 2 "Earth to Mars—2026
  // Opportunity—Energy Minima" (p. 12) and Table 1 (p. 10: 2026 optimum C3 9.144, Type II).
  // Conditions: ballistic (no deep-space manoeuvre), Mars flyby arrival (no weight on arrival v∞),
  // MIDAS patched-conic optimiser, departure/arrival dates searched in 2-day increments, values
  // printed to two decimals (p. 11). Type I = transfer angle < 180°, Type II = 180°–360° (p. 3).
  //
  // Ours: default grid (2 d × 3 d), JPL Horizons DE441/mar099 vectors, recorded 2026-10-23.
  //
  //   minimum of            reference (NASA/TM-2010-216764)            ours
  //   C3, Type II          9.144  2026-10-31 → 2027-08-19 (292 d)     9.1835  2026-10-31 → 2027-08-20 (293 d)
  //   C3, Type I           11.11  2026-11-14 → 2027-08-09 (268 d)     10.906  2026-11-14 → 2027-08-11 (270 d)
  //   arrival v∞, Type II  2.565  2026-11-06 → 2027-09-08 (306 d)     2.5646  2026-11-06 → 2027-09-07 (305 d)
  //
  // Tolerances: C3 ±0.3 km²/s², v∞ ±0.05 km/s, each date ±3 days. Dates: our grid steps (2 d
  // departure, 3 d arrival) put the cell up to 1–1.5 d off the true optimum, and the handbook's own
  // 2-day search adds up to 1 d. Values: different ephemeris generations (the handbook predates
  // DE441), MIDAS's two-decimal output (the handbook notes rounding ties between dates), and the
  // grid quantisation along the minimum's valley. Worst measured difference: C3 −0.20 (Type I).
  const REF = {
    typeII: { c3: 9.144, vInfKms: 2.729, dep: '2026-10-31', arr: '2027-08-19' },
    typeI: { c3: 11.11, vInfKms: 2.915, dep: '2026-11-14', arr: '2027-08-09' },
    typeIIMinVInf: { c3: 9.646, vInfKms: 2.565, dep: '2026-11-06', arr: '2027-09-08' },
  }
  const C3_TOL = 0.3
  const VINF_TOL = 0.05
  const DATE_TOL_DAYS = 3

  /** Per-type minima over the grid. Type II = prograde long way (cross(r1, r2) points to −z). */
  function minima() {
    const s = DEFAULT_PORKCHOP
    type Cell = { c3: number; vInfKms: number; depJd: number; arrJd: number }
    let typeI: Cell | null = null
    let typeII: Cell | null = null
    let typeIIMinVInf: Cell | null = null
    for (let iArr = 0; iArr < grid.nArr; iArr++) {
      for (let iDep = 0; iDep < grid.nDep; iDep++) {
        if (Number.isNaN(grid.c3[iArr * grid.nDep + iDep]!)) continue
        const t = transferFor(s.depStartJd + iDep * s.depStepDays, s.arrStartJd + iArr * s.arrStepDays)!
        const cell = { c3: t.c3, vInfKms: t.vInfArrKms, depJd: t.depJd, arrJd: t.arrJd }
        if (cross(t.r1, t.r2)[2] >= 0) {
          if (!typeI || cell.c3 < typeI.c3) typeI = cell
        } else {
          if (!typeII || cell.c3 < typeII.c3) typeII = cell
          if (!typeIIMinVInf || cell.vInfKms < typeIIMinVInf.vInfKms) typeIIMinVInf = cell
        }
      }
    }
    return { typeI: typeI!, typeII: typeII!, typeIIMinVInf: typeIIMinVInf! }
  }

  function expectMatches(ours: { c3: number; vInfKms: number; depJd: number; arrJd: number }, ref: (typeof REF)['typeII']) {
    expect(Math.abs(ours.c3 - ref.c3)).toBeLessThanOrEqual(C3_TOL)
    expect(Math.abs(ours.vInfKms - ref.vInfKms)).toBeLessThanOrEqual(VINF_TOL)
    expect(Math.abs(ours.depJd - jd(ref.dep))).toBeLessThanOrEqual(DATE_TOL_DAYS)
    expect(Math.abs(ours.arrJd - jd(ref.arr))).toBeLessThanOrEqual(DATE_TOL_DAYS)
  }

  it('overall minimum C3 matches the NASA handbook 2026 optimum (Type II, 9.144 km²/s², 31 Oct 2026 → 19 Aug 2027)', () => {
    const { typeII } = minima()
    expect(grid.best.c3).toBe(typeII.c3) // the 2026 optimum is Type II, in the handbook and here
    expect(grid.best.depJd).toBe(typeII.depJd)
    expect(grid.best.arrJd).toBe(typeII.arrJd)
    expectMatches(typeII, REF.typeII)
  })

  it('Type I minimum C3 matches the NASA handbook (11.11 km²/s², 14 Nov 2026 → 9 Aug 2027)', () => {
    expectMatches(minima().typeI, REF.typeI)
  })

  it('Type II minimum arrival v∞ matches the NASA handbook (2.565 km/s, 6 Nov 2026 → 8 Sep 2027)', () => {
    expectMatches(minima().typeIIMinVInf, REF.typeIIMinVInf)
  })


  it('best is the minimum over valid cells and carries no NaN/Infinity', () => {
    const { best } = grid
    for (const v of [best.depJd, best.arrJd, best.c3]) expect(Number.isFinite(v)).toBe(true)
    let min = Infinity
    for (const v of grid.c3) if (!Number.isNaN(v) && v < min) min = v
    expect(Math.fround(best.c3)).toBe(min)
    const t = transferFor(best.depJd, best.arrJd)!
    expect(t).not.toBeNull()
    expect(t.c3).toBe(best.c3)
  })

  it('stores NaN (in both arrays) for TOF outside [min, max] and never Infinity; transferFor agrees', () => {
    const s = DEFAULT_PORKCHOP
    let nanCells = 0
    let validCells = 0
    for (let iArr = 0; iArr < grid.nArr; iArr++) {
      for (let iDep = 0; iDep < grid.nDep; iDep++) {
        const k = iArr * grid.nDep + iDep
        const c3 = grid.c3[k]!
        const vInf = grid.vInf[k]!
        expect(c3).not.toBe(Infinity)
        expect(c3).not.toBe(-Infinity)
        expect(vInf).not.toBe(Infinity)
        expect(vInf).not.toBe(-Infinity)
        expect(Number.isNaN(c3)).toBe(Number.isNaN(vInf))
        const dep = s.depStartJd + iDep * s.depStepDays
        const arr = s.arrStartJd + iArr * s.arrStepDays
        const tof = arr - dep
        if (tof < s.minTofDays || tof > s.maxTofDays) expect(c3).toBeNaN()
        if (Number.isNaN(c3)) {
          nanCells++
          expect(transferFor(dep, arr)).toBeNull()
        } else {
          validCells++
          expect(c3).toBeGreaterThan(0)
          expect(vInf).toBeGreaterThan(0)
        }
      }
    }
    expect(nanCells).toBeGreaterThan(0)
    expect(validCells).toBeGreaterThan(nanCells)
  })
})

describe('computePorkchop edge cases', () => {
  it('throws when the spec has no valid cell (best would be undefined)', () => {
    expect(() =>
      computePorkchop({ ...DEFAULT_PORKCHOP, minTofDays: 900, maxTofDays: 1000 }),
    ).toThrow(RangeError)
  })

  it('throws on a spec outside the ephemeris or with non-positive steps', () => {
    expect(() => computePorkchop({ ...DEFAULT_PORKCHOP, depStartJd: jd('2020-01-01') })).toThrow(RangeError)
    expect(() => computePorkchop({ ...DEFAULT_PORKCHOP, depStepDays: 0 })).toThrow(RangeError)
    expect(() => computePorkchop({ ...DEFAULT_PORKCHOP, arrEndJd: DEFAULT_PORKCHOP.arrStartJd - 1 })).toThrow(RangeError)
  })

  it('computes a small custom grid', () => {
    const g = computePorkchop({
      depStartJd: jd('2026-11-01'),
      depEndJd: jd('2026-11-11'),
      depStepDays: 5,
      arrStartJd: jd('2027-08-01'),
      arrEndJd: jd('2027-08-21'),
      arrStepDays: 10,
      minTofDays: 100,
      maxTofDays: 500,
    })
    expect(g.nDep).toBe(3)
    expect(g.nArr).toBe(3)
    expect(g.c3.length).toBe(9)
    expect(g.c3.every((v) => Number.isFinite(v))).toBe(true)
  })
})
