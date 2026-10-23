import { describe, expect, it } from 'vitest'
import { AU, DAY, MU_EARTH, MU_SUN, R_EARTH } from './constants'
import { propagate, sampleTrajectory, stumpffC, stumpffS } from './kepler'
import { circularSpeed, orbitalElements, period, visViva } from './orbit'
import { cross, norm, sub } from './vec'
import type { StateVector } from './vec'

const energy = (s: StateVector, mu: number) => (norm(s.v) ** 2) / 2 - mu / norm(s.r)
const angularMomentum = (s: StateVector) => norm(cross(s.r, s.v))

const vEarth = circularSpeed(MU_SUN, AU)
const circular: StateVector = { r: [AU, 0, 0], v: [0, vEarth, 0] }

// Earth -> Mars Hohmann transfer ellipse, tilted slightly out of plane.
const vDepart = visViva(MU_SUN, AU, (AU + 1.52371 * AU) / 2)
const transfer: StateVector = { r: [AU, 0, 0], v: [0, vDepart * 0.9998, vDepart * 0.02] }

// Hyperbolic escape from LEO with e = 1.5, inclined 28.5 degrees.
const rpHyp = R_EARTH + 200e3
const vpHyp = Math.sqrt((MU_EARTH * (1 + 1.5)) / rpHyp)
const incl = (28.5 * Math.PI) / 180
const hyperbola: StateVector = {
  r: [rpHyp, 0, 0],
  v: [0, vpHyp * Math.cos(incl), vpHyp * Math.sin(incl)],
}

describe('propagate', () => {
  it('returns the same state for dt = 0', () => {
    const s = propagate(transfer, MU_SUN, 0)
    expect(s.r).toEqual(transfer.r)
    expect(s.v).toEqual(transfer.v)
  })

  it('returns to start within 1 km after one period of a circular 1 AU orbit', () => {
    const s = propagate(circular, MU_SUN, period(MU_SUN, AU))
    expect(norm(sub(s.r, circular.r))).toBeLessThan(1000)
    expect(norm(sub(s.v, circular.v))).toBeLessThan(1e-3)
  })

  it('moves a quarter turn in a quarter period', () => {
    const s = propagate(circular, MU_SUN, period(MU_SUN, AU) / 4)
    expect(norm(sub(s.r, [0, AU, 0]))).toBeLessThan(1000)
    expect(norm(sub(s.v, [-vEarth, 0, 0]))).toBeLessThan(1e-3)
  })

  it('handles negative dt and several periods', () => {
    const T = period(MU_SUN, AU)
    const s = propagate(circular, MU_SUN, -3.25 * T)
    expect(norm(sub(s.r, [0, -AU, 0]))).toBeLessThan(1000)
  })

  it('reaches aphelion of the Hohmann ellipse after half a period', () => {
    const a = (AU + 1.52371 * AU) / 2
    const s = propagate({ r: [AU, 0, 0], v: [0, vDepart, 0] }, MU_SUN, period(MU_SUN, a) / 2)
    expect(norm(sub(s.r, [-1.52371 * AU, 0, 0]))).toBeLessThan(1000)
  })

  it('round-trips a hyperbolic (e = 1.5) state forward then back within 1 m', () => {
    for (const dt of [600, 3 * 3600, 2 * DAY, 30 * DAY]) {
      const out = propagate(hyperbola, MU_EARTH, dt)
      expect(orbitalElements(out, MU_EARTH).e).toBeCloseTo(1.5, 9)
      const back = propagate(out, MU_EARTH, -dt)
      expect(norm(sub(back.r, hyperbola.r))).toBeLessThan(1)
      expect(norm(sub(back.v, hyperbola.v))).toBeLessThan(1e-3)
    }
  })

  it('propagates an inbound hyperbolic leg (before periapsis)', () => {
    const inbound = propagate(hyperbola, MU_EARTH, -DAY)
    expect(norm(inbound.r)).toBeGreaterThan(1e8)
    const atPeri = propagate(inbound, MU_EARTH, DAY)
    expect(norm(sub(atPeri.r, hyperbola.r))).toBeLessThan(1)
  })

  it('converges on long near-parabolic and very eccentric hyperbolic legs', () => {
    for (const e of [1.0001, 1.01, 10]) {
      const vp = Math.sqrt((MU_EARTH * (1 + e)) / rpHyp)
      const s0: StateVector = { r: [rpHyp, 0, 0], v: [0, vp, 0] }
      for (const dt of [365 * DAY, -365 * DAY, 3650 * DAY]) {
        const out = propagate(s0, MU_EARTH, dt)
        expect(Number.isFinite(norm(out.r))).toBe(true)
        expect(norm(out.r)).toBeLessThan(1e13)
        expect(orbitalElements(out, MU_EARTH).e).toBeCloseTo(e, 6)
        const back = propagate(out, MU_EARTH, -dt)
        expect(norm(sub(back.r, s0.r)) / norm(out.r)).toBeLessThan(1e-9)
      }
    }
  })

  it('round-trips a highly eccentric ellipse (e = 0.9)', () => {
    const rp = R_EARTH + 300e3
    const a = rp / (1 - 0.9)
    const s0: StateVector = { r: [rp, 0, 0], v: [0, visViva(MU_EARTH, rp, a), 0] }
    const dt = 0.37 * period(MU_EARTH, a)
    const back = propagate(propagate(s0, MU_EARTH, dt), MU_EARTH, -dt)
    expect(norm(sub(back.r, s0.r))).toBeLessThan(1)
  })

  it('round-trips a parabolic (e = 1) state', () => {
    const rp = R_EARTH + 200e3
    const s0: StateVector = { r: [rp, 0, 0], v: [0, Math.sqrt((2 * MU_EARTH) / rp), 0] }
    const out = propagate(s0, MU_EARTH, DAY)
    expect(norm(out.r)).toBeGreaterThan(rp * 10)
    const back = propagate(out, MU_EARTH, -DAY)
    expect(norm(sub(back.r, s0.r))).toBeLessThan(1)
  })

  it('conserves energy to 1e-9 relative over 200 days', () => {
    const e0 = energy(transfer, MU_SUN)
    const h0 = angularMomentum(transfer)
    let chained = transfer
    for (let day = 10; day <= 200; day += 10) {
      const direct = propagate(transfer, MU_SUN, day * DAY)
      chained = propagate(chained, MU_SUN, 10 * DAY)
      for (const s of [direct, chained]) {
        expect(Math.abs((energy(s, MU_SUN) - e0) / e0)).toBeLessThan(1e-9)
        expect(Math.abs((angularMomentum(s) - h0) / h0)).toBeLessThan(1e-9)
      }
    }
  })
})

describe('stumpffC / stumpffS', () => {
  it('are continuous across the series switch at |z| = 1e-3 (both sides agree to ~1e-12 relative)', () => {
    const below = 1e-3 * (1 - 1e-15) // series branch
    const above = 1e-3 // closed-form branch
    for (const sign of [1, -1]) {
      for (const f of [stumpffC, stumpffS]) {
        const a = f(sign * below)
        const b = f(sign * above)
        expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(1e-12) // measured ≤ 3.9e-13
      }
    }
  })

  it('match the closed forms at z = 0 and z = ±1', () => {
    expect(stumpffC(0)).toBe(1 / 2)
    expect(stumpffS(0)).toBe(1 / 6)
    expect(stumpffC(1)).toBeCloseTo(1 - Math.cos(1), 15)
    expect(stumpffS(-1)).toBeCloseTo(Math.sinh(1) - 1, 15)
  })
})

describe('propagate (absolute hyperbolic timing)', () => {
  it('reaches r = a(1 − e·cosh H) at t = √((−a)³/μ)·(e·sinh H − H) after periapsis', () => {
    const e = 1.8
    const rp = R_EARTH + 500e3
    const a = rp / (1 - e) // < 0
    const vp = Math.sqrt((MU_EARTH * (1 + e)) / rp)
    const s0: StateVector = { r: [rp, 0, 0], v: [0, vp, 0] }
    for (const H of [0.3, 1.2, 3, -2]) {
      const t = Math.sqrt((-a) ** 3 / MU_EARTH) * (e * Math.sinh(H) - H)
      const expected = a * (1 - e * Math.cosh(H))
      const s = propagate(s0, MU_EARTH, t)
      expect(Math.abs(norm(s.r) - expected) / expected).toBeLessThan(1e-6)
      // Position in the perifocal frame: x = a(cosh H − e), y = −a·√(e² − 1)·sinh H.
      const x = a * (Math.cosh(H) - e)
      const y = -a * Math.sqrt(e * e - 1) * Math.sinh(H)
      expect(norm(sub(s.r, [x, y, 0])) / expected).toBeLessThan(1e-6)
    }
  })
})

describe('propagate non-convergence', () => {
  // The 50-step cap itself was not reached by 200k fuzzed states (r 6.6e3–6.6e7 km, speeds
  // 0.03–30 × circular, 10% radial, |dt| up to 1e20 s); it stays as a backstop that also
  // returns the NaN state. Overflowing √μ·dt used to come back as a finite, wrong state.
  it('returns a NaN state instead of a wrong one when it cannot solve (√μ·dt overflows)', () => {
    for (const dt of [Number.MAX_VALUE, -Number.MAX_VALUE, Infinity, NaN]) {
      const s = propagate(hyperbola, MU_EARTH, dt)
      expect(s.r.every(Number.isNaN)).toBe(true)
      expect(s.v.every(Number.isNaN)).toBe(true)
    }
  })
})

describe('sampleTrajectory', () => {
  it('returns n points from t = 0 to t = duration inclusive', () => {
    const duration = 200 * DAY
    const pts = sampleTrajectory(transfer, MU_SUN, duration, 41)
    expect(pts).toHaveLength(41)
    expect(pts[0]).toEqual(transfer.r)
    const end = propagate(transfer, MU_SUN, duration).r
    const last = pts[40]
    expect(last).toBeDefined()
    expect(norm(sub(last!, end))).toBeLessThan(1e-3)
  })

  it('handles degenerate sample counts', () => {
    expect(sampleTrajectory(transfer, MU_SUN, DAY, 0)).toEqual([])
    expect(sampleTrajectory(transfer, MU_SUN, DAY, 1)).toEqual([transfer.r])
  })
})
