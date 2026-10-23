import { describe, expect, it } from 'vitest'
import { AU, MU_SUN } from '@/physics/constants'
import { EPHEMERIS_RANGE, bodyState } from '@/physics/ephemeris'
import { transferFor } from '@/physics/porkchop'
import { jdFromIso } from '@/physics/time'
import type { StateVector } from '@/physics/vec'
import {
  ARC_POINTS,
  DISPLAY_RADIUS,
  UNITS_PER_AU,
  bodyBasis,
  clampJd,
  conicPoints,
  ephemerisOrbit,
  exaggeration,
  toScene,
  transferArc,
  writeConic,
  writeLineDistances,
  writeScene,
} from './solarScale'

const len = (a: ArrayLike<number>, i = 0) => Math.hypot(a[i]!, a[i + 1]!, a[i + 2]!)
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!

describe('scale mapping', () => {
  it('maps 1 AU to 100 scene units, ecliptic north to +y', () => {
    const x = toScene([AU, 0, 0])
    expect(x[0]).toBe(UNITS_PER_AU)
    expect(Math.abs(x[1]) + Math.abs(x[2])).toBe(0)
    const n = toScene([0, 0, AU])
    expect(n[1]).toBeCloseTo(100)
    const y = toScene([0, AU, 0])
    expect(y[2]).toBeCloseTo(-100)
  })

  it('keeps handedness: x × y (ecliptic) maps to x × y (scene) = z (ecliptic) image', () => {
    const x = toScene([1, 0, 0])
    const y = toScene([0, 1, 0])
    const z = toScene([0, 0, 1])
    const c = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
    expect(dot(c, z)).toBeGreaterThan(0)
  })

  it('refuses non-finite positions without writing', () => {
    const out = new Float32Array([7, 7, 7])
    expect(writeScene([NaN, 0, 0], out)).toBe(false)
    expect([...out]).toEqual([7, 7, 7])
  })

  it('reports how much the drawn bodies are enlarged', () => {
    expect(exaggeration('earth')).toBeGreaterThan(100)
    expect(exaggeration('sun')).toBeGreaterThan(1)
    expect(DISPLAY_RADIUS.mars).toBeLessThan(DISPLAY_RADIUS.earth)
  })

  it('clamps dates into the ephemeris range', () => {
    expect(clampJd(0)).toBe(EPHEMERIS_RANGE.startJd)
    expect(clampJd(1e9)).toBe(EPHEMERIS_RANGE.endJd)
    expect(clampJd(NaN)).toBe(EPHEMERIS_RANGE.startJd)
  })
})

describe('conic sampling', () => {
  const earth = bodyState('earth', jdFromIso('2026-11-01T00:00:00Z'))

  it('samples a closed Earth orbit near 1 AU, starting at s0', () => {
    const pts = conicPoints(earth, MU_SUN, 365.256 * 86400, 64)
    expect(pts.length).toBe(64 * 3)
    for (let i = 0; i < 64; i++) expect(len(pts, i * 3)).toBeGreaterThan(97)
    const s = toScene(earth.r)
    expect(pts[0]).toBeCloseTo(s[0], 4)
    // After one period the conic is back near where it started (the Earth's own mass is left out).
    expect(Math.hypot(pts[189]! - pts[0]!, pts[190]! - pts[1]!, pts[191]! - pts[2]!)).toBeLessThan(0.5)
  })

  it('drops points the solver cannot converge on', () => {
    const bad: StateVector = { r: [AU, 0, 0], v: [0, 3e4, 0] }
    // A non-finite duration propagates to NaN states: nothing beyond s0 is written.
    const out = new Float32Array(30)
    expect(writeConic(out, bad, MU_SUN, Infinity, 10)).toBe(0)
    const nanState: StateVector = { r: [NaN, 0, 0], v: [0, 0, 0] }
    expect(writeConic(out, nanState, MU_SUN, 1e6, 10)).toBe(0)
  })

  it('respects the buffer capacity', () => {
    const out = new Float32Array(9)
    expect(writeConic(out, earth, MU_SUN, 1e7, 50)).toBe(3)
  })

  it('caches the transfer arc per Transfer and ends at Mars on the arrival date', () => {
    const t = transferFor(jdFromIso('2026-10-31T00:00:00Z'), jdFromIso('2027-08-20T00:00:00Z'))!
    const a = transferArc(t)
    expect(transferArc(t)).toBe(a)
    expect(a.length).toBe(ARC_POINTS * 3)
    const end = toScene(t.r2)
    const k = a.length - 3
    expect(Math.hypot(a[k]! - end[0], a[k + 1]! - end[1], a[k + 2]! - end[2])).toBeLessThan(1e-3)
    const start = toScene(t.r1)
    expect(Math.hypot(a[0]! - start[0], a[1]! - start[1], a[2]! - start[2])).toBeLessThan(1e-4)
  })

  it('cumulative line distances grow monotonically', () => {
    const pts = new Float32Array([0, 0, 0, 3, 4, 0, 3, 4, 2])
    const d = new Float32Array(3)
    writeLineDistances(pts, 3, d)
    expect([...d]).toEqual([0, 5, 7])
  })
})

describe('ephemeris orbits', () => {
  it('draws Mars between its perihelion and aphelion distances', () => {
    const m = ephemerisOrbit('mars', 128)
    expect(m.length).toBe(128 * 3)
    let lo = Infinity
    let hi = 0
    for (let i = 0; i < 128; i++) {
      lo = Math.min(lo, len(m, i * 3))
      hi = Math.max(hi, len(m, i * 3))
    }
    expect(lo).toBeGreaterThan(137)
    expect(lo).toBeLessThan(140)
    expect(hi).toBeGreaterThan(165)
    expect(hi).toBeLessThan(168)
  })
})

describe('body orientation', () => {
  it('gives an orthonormal basis with the pole tilted from the ecliptic (Mars: 25.2° to its orbit, 26.7° to the ecliptic)', () => {
    for (const body of ['earth', 'mars'] as const) {
      const b = bodyBasis(body, jdFromIso('2027-01-01T00:00:00Z'))
      expect(dot(b.x, b.x)).toBeCloseTo(1)
      expect(dot(b.y, b.y)).toBeCloseTo(1)
      expect(dot(b.x, b.y)).toBeCloseTo(0)
      expect(dot(b.z, b.z)).toBeCloseTo(1)
      const tilt = (Math.acos(b.y[1]) * 180) / Math.PI
      expect(tilt).toBeCloseTo(body === 'earth' ? 23.44 : 26.7, 0)
    }
  })

  it('turns the Earth once per sidereal day', () => {
    const jd = jdFromIso('2027-01-01T00:00:00Z')
    const a = bodyBasis('earth', jd)
    const b = bodyBasis('earth', jd + 0.99726958)
    expect(dot(a.x, b.x)).toBeCloseTo(1, 4)
  })
})
