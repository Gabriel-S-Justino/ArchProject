// Lambert's problem with universal variables (Curtis, Orbital Mechanics for Engineering
// Students, Algorithm 5.2): the conic arc that takes a body from r1 to r2 in a given time.
// Single revolution, prograde with respect to +z (the ecliptic pole for heliocentric work).
// Unit-agnostic: r, tof and mu only need to be consistent (m, s, m³/s² or km, s, km³/s²).
import { stumpffC, stumpffS } from './kepler'
import { add, cross, dot, norm, scale, sub } from './vec'
import type { Vec3 } from './vec'

const MAX_ITERATIONS = 100
/** Convergence on z (relative to max(1, |z|)). */
const TOLERANCE = 1e-12
/** r1 and r2 within this angle (rad) of 0° or 180° give no defined transfer plane. */
const MIN_ANGLE = 1e-6
/** z = 4π² is a full revolution; single-revolution solutions lie below it. */
const Z_MAX = 4 * Math.PI * Math.PI
/** Lowest z tried for very short (strongly hyperbolic) transfers; cosh(√1e5) still fits a double. */
const Z_FLOOR = -1e5
/** Below this |z| the Stumpff derivatives use their Taylor series (the closed forms cancel). */
const DERIV_SERIES_LIMIT = 0.1

/** dC/dz. Closed form (1 − zS − 2C)/(2z); series Σ k(−z)^(k−1)(−1)/(2k+2)! near 0. */
function stumpffCPrime(z: number, C: number, S: number): number {
  if (Math.abs(z) >= DERIV_SERIES_LIMIT) return (1 - z * S - 2 * C) / (2 * z)
  return -1 / 24 + z / 360 - (z * z) / 13440 + (z * z * z) / 907200 - (z * z * z * z) / 95800320
}

/** dS/dz. Closed form (C − 3S)/(2z); series near 0. */
function stumpffSPrime(z: number, C: number, S: number): number {
  if (Math.abs(z) >= DERIV_SERIES_LIMIT) return (C - 3 * S) / (2 * z)
  return -1 / 120 + z / 2520 - (z * z) / 120960 + (z * z * z) / 9979200 - (z * z * z * z) / 1245404160
}

/**
 * Velocities v1 at r1 and v2 at r2 on the single-revolution prograde conic that joins them in
 * `tof`. Returns null when tof is not a positive finite number, when r1 and r2 are (anti)parallel
 * so the transfer plane is undefined (within 1e-6 rad of 0° or 180°), or when the iteration
 * does not converge within 100 steps. Never returns non-finite velocities.
 *
 * The transfer angle Δθ comes from the angle between r1 and r2; if cross(r1, r2) points to −z the
 * prograde arc goes the long way and Δθ = 2π − angle.
 */
export function lambert(r1: Vec3, r2: Vec3, tof: number, mu: number): { v1: Vec3; v2: Vec3 } | null {
  if (!(tof > 0) || !Number.isFinite(tof) || !(mu > 0)) return null
  const r1n = norm(r1)
  const r2n = norm(r2)
  if (!(r1n > 0) || !(r2n > 0)) return null

  const c = cross(r1, r2)
  const angle = Math.atan2(norm(c), dot(r1, r2)) // in [0, π]
  if (!(angle >= MIN_ANGLE && angle <= Math.PI - MIN_ANGLE)) return null
  const longWay = c[2] < 0

  // A = sin Δθ·√(r1·r2 / (1 − cos Δθ)) = ±√(2·r1·r2)·cos(angle/2), negative the long way.
  // This form stays accurate near 0° and 180°.
  const A = (longWay ? -1 : 1) * Math.sqrt(2 * r1n * r2n) * Math.cos(angle / 2)

  const sqrtMu = Math.sqrt(mu)
  const target = sqrtMu * tof
  if (!Number.isFinite(target)) return null

  // F(z) = (y/C)^1.5·S + A·√y − √μ·Δt is increasing in z on (z(y=0), 4π²). Where y ≤ 0 the
  // geometry is impossible, i.e. z is too low: those points report F = −∞.
  const evaluate = (z: number): { F: number; dF: number } => {
    const C = stumpffC(z)
    const S = stumpffS(z)
    const sqrtC = Math.sqrt(C)
    const y = r1n + r2n + (A * (z * S - 1)) / sqrtC
    if (!(y > 0)) return { F: -Infinity, dF: NaN }
    const Cp = stumpffCPrime(z, C, S)
    const Sp = stumpffSPrime(z, C, S)
    const yp = A * ((S + z * Sp) / sqrtC - ((z * S - 1) * Cp) / (2 * C * sqrtC))
    const x = y / C
    const sqrtX = Math.sqrt(x)
    const xp = (yp - x * Cp) / C
    const sqrtY = Math.sqrt(y)
    const F = x * sqrtX * S + A * sqrtY - target
    const dF = 1.5 * sqrtX * xp * S + x * sqrtX * Sp + (A * yp) / (2 * sqrtY)
    return { F, dF }
  }

  // Bracket [lo, hi]: F(hi) > 0 near a full revolution; push lo down until F(lo) < 0.
  let lo = -Z_MAX
  while (!(evaluate(lo).F < 0)) {
    if (lo <= Z_FLOOR) return null
    lo = Math.max(2 * lo, Z_FLOOR)
  }
  let hi = Z_MAX

  // Newton on z, safeguarded by bisection whenever the step would leave the bracket.
  let z = 0
  let converged = false
  for (let k = 0; k < MAX_ITERATIONS; k++) {
    const { F, dF } = evaluate(z)
    if (F === 0) {
      converged = true
      break
    }
    if (F < 0) lo = z
    else hi = z // F > 0, +∞ or NaN (C → 0 as z → 4π²): z is too high
    const newton = z - F / dF
    let next: number
    if (Number.isFinite(F) && Number.isFinite(dF) && dF > 0 && newton > lo && newton < hi) next = newton
    else next = (lo + hi) / 2
    const step = next - z
    z = next
    if (Math.abs(step) <= TOLERANCE * Math.max(1, Math.abs(z)) || hi - lo <= TOLERANCE * Math.max(1, Math.abs(z))) {
      converged = true
      break
    }
  }
  if (!converged) return null

  // Lagrange coefficients (Curtis Eqs. 5.46).
  const C = stumpffC(z)
  const S = stumpffS(z)
  const y = r1n + r2n + (A * (z * S - 1)) / Math.sqrt(C)
  if (!(y > 0)) return null
  const f = 1 - y / r1n
  const g = A * Math.sqrt(y / mu)
  const gDot = 1 - y / r2n
  const v1 = scale(sub(r2, scale(r1, f)), 1 / g)
  const v2 = scale(add(scale(r2, gDot), scale(r1, -1)), 1 / g)
  if (![...v1, ...v2].every(Number.isFinite)) return null
  return { v1, v2 }
}
