import { describe, expect, it } from 'vitest'
import { AU, DAY, MU_EARTH, MU_MARS, MU_SUN, R_EARTH, R_MARS } from './constants'
import {
  captureBurn,
  circularSpeed,
  escapeBurn,
  hohmann,
  orbitalElements,
  period,
  visViva,
} from './orbit'

// Values ported from legacy/tests/orbit.test.js (which pass on the legacy code).
const rLeo = R_EARTH + 200e3
const t = hohmann(MU_SUN, AU, 1.52371 * AU)

describe('orbit (legacy values)', () => {
  it('LEO circular speed is about 7788 m/s', () => {
    expect(circularSpeed(MU_EARTH, rLeo)).toBeCloseTo(7788, -1)
  })

  it('Earth orbital period is about 365.25 days', () => {
    expect(period(MU_SUN, AU) / DAY).toBeCloseTo(365.25, 1)
  })

  it('Earth to Mars Hohmann transfer takes about 258.9 days', () => {
    expect(t.time / DAY).toBeCloseTo(258.9, 0)
    expect(t.a).toBe((AU + 1.52371 * AU) / 2)
  })

  it('departure burn from LEO is about 3613 m/s', () => {
    expect(escapeBurn(MU_EARTH, rLeo, t.dv1)).toBeCloseTo(3613, -1)
  })

  it('elliptical capture at Mars is about 907 m/s', () => {
    expect(captureBurn(MU_MARS, R_MARS + 300e3, R_MARS + 33000e3, t.dv2)).toBeCloseTo(907, -1)
  })
})

describe('visViva', () => {
  it('equals circular speed when r = a', () => {
    expect(visViva(MU_SUN, AU, AU)).toBeCloseTo(circularSpeed(MU_SUN, AU), 9)
  })
})

describe('orbitalElements', () => {
  it('recovers a circular equatorial orbit', () => {
    const v = circularSpeed(MU_SUN, AU)
    const el = orbitalElements({ r: [AU, 0, 0], v: [0, v, 0] }, MU_SUN)
    expect(el.a / AU).toBeCloseTo(1, 9)
    expect(el.e).toBeLessThan(1e-9)
    expect(el.i).toBeCloseTo(0, 12)
    expect(el.rp / AU).toBeCloseTo(1, 9)
    expect(el.ra / AU).toBeCloseTo(1, 9)
  })

  it('recovers periapsis, apoapsis and inclination of an inclined ellipse', () => {
    const rp = R_MARS + 300e3
    const ra = R_MARS + 33000e3
    const vp = visViva(MU_MARS, rp, (rp + ra) / 2)
    const inc = (30 * Math.PI) / 180
    const el = orbitalElements(
      { r: [rp, 0, 0], v: [0, vp * Math.cos(inc), vp * Math.sin(inc)] },
      MU_MARS,
    )
    expect(Math.abs(el.rp - rp)).toBeLessThan(1)
    expect(Math.abs(el.ra - ra)).toBeLessThan(1)
    expect(el.e).toBeCloseTo((ra - rp) / (ra + rp), 9)
    expect(el.i).toBeCloseTo(inc, 12)
  })

  it('reports a < 0, e > 1 and ra = Infinity for a hyperbola', () => {
    const rp = R_EARTH + 200e3
    const vp = Math.sqrt((MU_EARTH * (1 + 1.5)) / rp)
    const el = orbitalElements({ r: [rp, 0, 0], v: [0, vp, 0] }, MU_EARTH)
    expect(el.a).toBeLessThan(0)
    expect(el.e).toBeCloseTo(1.5, 9)
    expect(Math.abs(el.rp - rp)).toBeLessThan(1e-3)
    expect(el.ra).toBe(Infinity)
  })

  it('gives a retrograde orbit an inclination near 180 degrees', () => {
    const v = circularSpeed(MU_EARTH, rLeo)
    const el = orbitalElements({ r: [rLeo, 0, 0], v: [0, -v, 0] }, MU_EARTH)
    expect(el.i).toBeCloseTo(Math.PI, 12)
  })
})
