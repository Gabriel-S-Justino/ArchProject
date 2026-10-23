import { describe, expect, it } from 'vitest'
import earthFile from '@/data/generated/ephemeris-earth.json'
import marsFile from '@/data/generated/ephemeris-mars.json'
import { AU, DAY, MU_SUN } from './constants'
import { EPHEMERIS_RANGE, bodyState } from './ephemeris'
import type { Body } from './ephemeris'
import { propagate } from './kepler'
import { jdFromIso } from './time'
import { norm, scale, add } from './vec'
import type { StateVector, Vec3 } from './vec'

const FILES = { earth: earthFile, mars: marsFile } as const
const BODIES: Body[] = ['earth', 'mars']

/** Stored row i of a body, converted to SI. */
function storedRow(body: Body, i: number): StateVector {
  const d = FILES[body].data
  const at = (k: number) => (d[6 * i + k] as number) * 1000
  return { r: [at(0), at(1), at(2)], v: [at(3), at(4), at(5)] }
}

const dist = (a: Vec3, b: Vec3) => norm([a[0] - b[0], a[1] - b[1], a[2] - b[2]])

describe('ephemeris data files', () => {
  it('carry provenance, the agreed frame and a consistent flat data array', () => {
    for (const body of BODIES) {
      const f = FILES[body]
      expect(f.body).toBe(body)
      expect(f.source).toMatch(/Horizons/)
      expect(f.url).toMatch(/^https:\/\/ssd\.jpl\.nasa\.gov\/api\/horizons\.api\?/)
      expect(f.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(f.center).toBe('500@10')
      expect(f.frame).toBe('ecliptic J2000')
      expect(f.stepDays).toBe(1)
      expect(f.count).toBeGreaterThan(1000)
      expect(f.data).toHaveLength(6 * f.count)
    }
  })
})

describe('bodyState', () => {
  it('covers the range shared by both files', () => {
    expect(EPHEMERIS_RANGE.startJd).toBe(jdFromIso('2026-07-01T00:00:00Z'))
    expect(EPHEMERIS_RANGE.endJd).toBe(jdFromIso('2029-07-01T00:00:00Z'))
  })

  it('puts Earth between 0.983 and 0.984 AU from the Sun on 2027-01-03 (perihelion season)', () => {
    const r = norm(bodyState('earth', jdFromIso('2027-01-03T00:00:00Z')).r) / AU
    expect(r).toBeGreaterThan(0.983)
    expect(r).toBeLessThan(0.984)
  })

  // The brief's upper bound was 1.666 AU, but the DE441/mar099 Mars reaches 1.666101 AU at its
  // aphelion near 2027-03-05 (minimum 1.381162 AU near 2028-02-12), so the bound is rounded out.
  it('keeps Mars within [1.381, 1.6662] AU of the Sun over the whole range', () => {
    const { startJd, endJd } = EPHEMERIS_RANGE
    for (let jd = startJd; jd <= endJd; jd += 0.25) {
      const r = norm(bodyState('mars', jd).r) / AU
      expect(r).toBeGreaterThanOrEqual(1.381)
      expect(r).toBeLessThanOrEqual(1.6662)
    }
  })

  it('returns the stored row (to 1 m and 1 mm/s) at an exact sample jd', () => {
    for (const body of BODIES) {
      const f = FILES[body]
      for (const i of [0, 1, 400, f.count - 2, f.count - 1]) {
        const s = bodyState(body, f.startJd + i * f.stepDays)
        const row = storedRow(body, i)
        expect(dist(s.r, row.r)).toBeLessThan(1)
        expect(dist(s.v, row.v)).toBeLessThan(1e-3)
      }
    }
  })

  // Reference: average of Sun-only two-body propagation from the left sample (+0.5 d) and the
  // right sample (−0.5 d). That matches Mars to 1 km, but Horizons body 399 is the geocentre,
  // which the Moon swings ~4,700 km around the Earth–Moon barycentre: the lunar pull
  // (~3e-5 m/s²) moves it ~30 km off a Sun-only arc in half a day, on both sides alike, so the
  // average keeps that offset. Earth gets 50 km (measured gap 31–36 km over the whole range);
  // checked against real 12-hourly Horizons vectors, the interpolant is within 94 m (Earth) and
  // 9 m (Mars) of the true midpoints.
  const MIDPOINT_TOLERANCE: Record<Body, number> = { earth: 50e3, mars: 1e3 }

  it('interpolates half a day between samples close to two-body propagation from both neighbours', () => {
    for (const body of BODIES) {
      const f = FILES[body]
      for (let i = 0; i < f.count - 1; i += 7) {
        const jd = f.startJd + i * f.stepDays
        const fromLeft = propagate(storedRow(body, i), MU_SUN, 0.5 * DAY)
        const fromRight = propagate(storedRow(body, i + 1), MU_SUN, -0.5 * DAY)
        const expected = scale(add(fromLeft.r, fromRight.r), 0.5)
        expect(dist(bodyState(body, jd + 0.5).r, expected)).toBeLessThan(MIDPOINT_TOLERANCE[body])
      }
    }
  })

  it('returns a velocity consistent with the interpolated positions', () => {
    const jd = jdFromIso('2027-09-14T07:00:00Z')
    for (const body of BODIES) {
      // Use the JDs actually evaluated: JD ~2.46e6 cannot hold a sub-second offset exactly.
      const jdBefore = jd - 0.01
      const jdAfter = jd + 0.01
      const before = bodyState(body, jdBefore).r
      const after = bodyState(body, jdAfter).r
      const dt = (jdAfter - jdBefore) * DAY
      const numeric: Vec3 = scale([after[0] - before[0], after[1] - before[1], after[2] - before[2]], 1 / dt)
      expect(dist(bodyState(body, jd).v, numeric)).toBeLessThan(1e-3)
    }
  })

  it('accepts both ends of the range and throws RangeError outside it', () => {
    const { startJd, endJd } = EPHEMERIS_RANGE
    expect(() => bodyState('earth', startJd)).not.toThrow()
    expect(() => bodyState('mars', endJd)).not.toThrow()
    expect(() => bodyState('earth', endJd + 1)).toThrow(RangeError)
    expect(() => bodyState('mars', startJd - 1e-6)).toThrow(RangeError)
    expect(() => bodyState('earth', Number.NaN)).toThrow(RangeError)
  })
})
