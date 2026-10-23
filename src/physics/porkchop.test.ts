import { beforeAll, describe, expect, it } from 'vitest'
import { DAY, MU_SUN } from './constants'
import { bodyState } from './ephemeris'
import { propagate } from './kepler'
import { DEFAULT_PORKCHOP, computePorkchop, transferFor } from './porkchop'
import type { PorkchopGrid } from './porkchop'
import { jdFromIso } from './time'
import { norm, sub } from './vec'

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

  // Real best on the JPL Horizons ephemerides (src/data/generated), recorded 2026-10-22:
  //   C3 = 9.1835 km²/s², depart 31 Oct 2026 (JD 2461344.5), arrive 20 Aug 2027 (JD 2461637.5),
  //   TOF 293 d, arrival v∞ 2.712 km/s. Lowest C3 with TOF < 250 d: C3 = 11.95,
  //   12 Nov 2026 → 18 Jul 2027. Lowest arrival v∞: 2.565 km/s, 6 Nov 2026 → 7 Sep 2027.
  //   Within the brief's [7, 14] bound, so it was not widened.
  it('finds the minimum-C3 cell with C3 in [7, 14] km²/s² and departure in Oct–Dec 2026', () => {
    const { best } = grid
    expect(best.c3).toBeGreaterThanOrEqual(7)
    expect(best.c3).toBeLessThanOrEqual(14)
    expect(best.depJd).toBeGreaterThanOrEqual(jd('2026-10-01'))
    expect(best.depJd).toBeLessThan(jd('2027-01-01'))
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
