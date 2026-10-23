import { describe, expect, it } from 'vitest'
import { AU, DAY, MU_EARTH, MU_SUN } from './constants'
import { propagate } from './kepler'
import { lambert } from './lambert'
import { cross, norm, sub } from './vec'
import type { Vec3 } from './vec'

function expectVecClose(actual: Vec3, expected: Vec3, tol: number) {
  for (let k = 0; k < 3; k++) expect(Math.abs(actual[k]! - expected[k]!)).toBeLessThanOrEqual(tol)
}

describe('lambert', () => {
  it('reproduces Curtis Example 5.2 (km, km/s, mu = 398600)', () => {
    const sol = lambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600, 398600)!
    expect(sol).not.toBeNull()
    expectVecClose(sol.v1, [-5.9925, 1.9254, 3.2456], 1e-3)
    expectVecClose(sol.v2, [-3.3125, -4.1966, -0.38529], 1e-3)
  })

  it('returns null for tof <= 0 or non-finite', () => {
    const r1: Vec3 = [5000, 10000, 2100]
    const r2: Vec3 = [-14600, 2500, 7000]
    expect(lambert(r1, r2, 0, 398600)).toBeNull()
    expect(lambert(r1, r2, -3600, 398600)).toBeNull()
    expect(lambert(r1, r2, Number.NaN, 398600)).toBeNull()
    expect(lambert(r1, r2, Number.POSITIVE_INFINITY, 398600)).toBeNull()
  })

  it('returns null when r1 and r2 point the same way (transfer angle < 1e-6 rad)', () => {
    expect(lambert([AU, 0, 0], [1.5 * AU, 0, 0], 200 * DAY, MU_SUN)).toBeNull()
    expect(lambert([AU, 0, 0], [1.5 * AU, 1.5 * AU * 1e-7, 0], 200 * DAY, MU_SUN)).toBeNull()
    expect(lambert([AU, 0, 0], [1.5 * AU, -1.5 * AU * 1e-7, 0], 200 * DAY, MU_SUN)).toBeNull()
  })

  it('returns null for an exactly 180° transfer (plane undefined), never Infinity', () => {
    expect(lambert([AU, 0, 0], [-1.5 * AU, 0, 0], 250 * DAY, MU_SUN)).toBeNull()
  })

  it('round-trips through propagate for short-way, long-way, elliptic and hyperbolic arcs', () => {
    const cases: { r1: Vec3; r2: Vec3; tof: number; mu: number }[] = [
      // Short way (Δθ < 180°), Earth-to-Mars-like.
      { r1: [AU, 0, 0], r2: [-0.3 * AU, 1.45 * AU, 0.03 * AU], tof: 200 * DAY, mu: MU_SUN },
      // Long way (cross z < 0 → Δθ > 180°), still prograde.
      { r1: [AU, 0, 0], r2: [-0.3 * AU, -1.45 * AU, 0.03 * AU], tof: 330 * DAY, mu: MU_SUN },
      // Fast, hyperbolic heliocentric arc.
      { r1: [AU, 0, 0], r2: [0, 1.5 * AU, 0], tof: 20 * DAY, mu: MU_SUN },
      // Near-circular quarter orbit around Earth.
      { r1: [7000e3, 0, 0], r2: [0, 7000e3, 10e3], tof: 1450, mu: MU_EARTH },
      // Slightly short of 180°.
      { r1: [AU, 0, 0], r2: [-1.5 * AU, 0.05 * AU, 0], tof: 260 * DAY, mu: MU_SUN },
    ]
    for (const { r1, r2, tof, mu } of cases) {
      const sol = lambert(r1, r2, tof, mu)
      expect(sol).not.toBeNull()
      const end = propagate({ r: r1, v: sol!.v1 }, mu, tof)
      expect(norm(sub(end.r, r2)) / norm(r2)).toBeLessThan(1e-9)
      expect(norm(sub(end.v, sol!.v2)) / norm(sol!.v2)).toBeLessThan(1e-9)
      // Prograde with respect to +z.
      expect(cross(r1, sol!.v1)[2]).toBeGreaterThan(0)
    }
  })

  it('goes prograde the long way when cross(r1, r2) points to -z', () => {
    const r1: Vec3 = [AU, 0, 0]
    const r2: Vec3 = [0, -1.5 * AU, 0] // 90° clockwise → 270° prograde transfer
    const sol = lambert(r1, r2, 400 * DAY, MU_SUN)!
    expect(sol).not.toBeNull()
    expect(cross(r1, sol.v1)[2]).toBeGreaterThan(0)
    expect(sol.v1[1]).toBeGreaterThan(0) // leaves towards +y, i.e. counter-clockwise
  })
})
