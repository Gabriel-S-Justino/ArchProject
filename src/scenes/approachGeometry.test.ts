import { describe, expect, it } from 'vitest'
import { MU_MARS, R_MARS } from '@/physics/constants'
import { captureBurn } from '@/physics/orbit'
import {
  directionAt,
  ellipse,
  ellipseNu,
  ellipseTraced,
  ellipsePoints,
  hyperbola,
  hyperbolaNu,
  hyperbolaPoints,
  hyperbolaTime,
  nuAtRadius,
  pointAt,
  radiusAt,
} from './approachGeometry'

const RP = R_MARS + 300e3
const RA = R_MARS + 33_000e3

describe('approach hyperbola', () => {
  const h = hyperbola(RP, 2650, MU_MARS)

  it('has e = 1 + rp·v∞²/μ and periapsis at rp', () => {
    expect(h.e).toBeCloseTo(1 + (RP * 2650 ** 2) / MU_MARS, 12)
    expect(radiusAt(h, 0)).toBeCloseTo(RP, 3)
    expect(pointAt(h, 0)[1]).toBeCloseTo(0)
    expect(h.nuInf).toBeCloseTo(Math.acos(-1 / h.e))
    expect(h.nuInf).toBeGreaterThan(Math.PI / 2)
  })

  it('times and anomalies invert each other, symmetric about periapsis', () => {
    for (const nu of [-2, -1, -0.2, 0.3, 1.5]) {
      const t = hyperbolaTime(h, nu)
      expect(hyperbolaNu(h, t)).toBeCloseTo(nu, 9)
    }
    expect(hyperbolaTime(h, -1)).toBeCloseTo(-hyperbolaTime(h, 1), 6)
    expect(hyperbolaTime(h, 0)).toBe(0)
  })

  it('finds the anomaly at a radius', () => {
    const nu = nuAtRadius(h, 30e6)
    expect(radiusAt(h, nu)).toBeCloseTo(30e6, -1)
    expect(nuAtRadius(h, RP)).toBeCloseTo(0)
  })

  it('flies prograde, perpendicular to the radius at periapsis', () => {
    const [x, y] = directionAt(h, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(1)
  })

  it('samples inside the asymptotes and floors a zero v∞', () => {
    const pts = hyperbolaPoints(h, -10, 10, 50)
    expect(pts.every(Number.isFinite)).toBe(true)
    expect(hyperbola(RP, 0, MU_MARS).e).toBeGreaterThan(1)
    expect(hyperbola(RP, NaN, MU_MARS).e).toBeGreaterThan(1)
  })
})

describe('capture ellipse', () => {
  const el = ellipse(RP, RA, MU_MARS)

  it('is the 300 × 33,000 km orbit with a period near 24 h', () => {
    expect(radiusAt(el, 0)).toBeCloseTo(RP, 0)
    expect(radiusAt(el, Math.PI)).toBeCloseTo(RA, 0)
    expect(el.period / 3600).toBeGreaterThan(23)
    expect(el.period / 3600).toBeLessThan(25)
  })

  it('the speed change at the shared periapsis is the capture burn', () => {
    const v = 2650
    const h = hyperbola(RP, v, MU_MARS)
    expect(h.vp - el.vp).toBeCloseTo(captureBurn(MU_MARS, RP, RA, v), 6)
  })

  it('Kepler timing: periapsis at t = 0, apoapsis at half a period, repeats each period', () => {
    expect(ellipseNu(el, 0)).toBeCloseTo(0)
    expect(Math.abs(ellipseNu(el, el.period / 2))).toBeCloseTo(Math.PI, 6)
    expect(ellipseNu(el, el.period * 2 + 1000)).toBeCloseTo(ellipseNu(el, 1000), 9)
    // Fast near periapsis: the first tenth of the period covers far more than a tenth of the angle.
    expect(ellipseNu(el, el.period * 0.1)).toBeGreaterThan(Math.PI * 0.6)
  })

  it('samples a closed ring', () => {
    const pts = ellipsePoints(el, 65)
    expect(pts[0]).toBeCloseTo(pts[128]!, 3)
    expect(pts[1]).toBeCloseTo(pts[129]!, 3)
  })
})

describe('ellipse trace', () => {
  const el = ellipse(RP, RA, MU_MARS)
  const SEG = 240 // segments of the 241-point ellipse the arrival scene draws

  it('ends at the spacecraft (within one sample) all through the first orbit', () => {
    for (const k of [0.02, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.99]) {
      const t = k * el.period
      const drawn = Math.round(SEG * ellipseTraced(el, t))
      const endNu = (2 * Math.PI * drawn) / SEG
      let ship = ellipseNu(el, t)
      if (ship < 0) ship += 2 * Math.PI
      expect(Math.abs(endNu - ship)).toBeLessThanOrEqual((2 * Math.PI) / SEG)
    }
  })

  it('is empty before periapsis and complete after one orbit', () => {
    expect(ellipseTraced(el, 0)).toBe(0)
    expect(ellipseTraced(el, -10)).toBe(0)
    expect(ellipseTraced(el, el.period)).toBe(1)
    expect(ellipseTraced(el, 3 * el.period)).toBe(1)
  })

  it('runs ahead of the time fraction early (fast past periapsis) and behind it late', () => {
    expect(ellipseTraced(el, 0.1 * el.period)).toBeGreaterThan(0.1)
    expect(ellipseTraced(el, 0.9 * el.period)).toBeLessThan(0.9)
  })
})
