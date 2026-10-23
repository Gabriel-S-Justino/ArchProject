// Two-body propagation with universal variables (Curtis, Orbital Mechanics for Engineering
// Students, Algorithms 3.3 and 3.4). One formulation covers ellipses, parabolas and hyperbolas.
import { add, cross, dot, norm, scale } from './vec'
import type { StateVector, Vec3 } from './vec'

const MAX_ITERATIONS = 50
const TOLERANCE = 1e-10
/** Below this |z| the Stumpff functions use their Taylor series to avoid cancellation. */
const SERIES_LIMIT = 1e-3
/** Below this |α·r0| the orbit is treated as parabolic when picking the first guess. */
const PARABOLIC_LIMIT = 1e-9
/** Relative padding on the analytic bounds of χ. */
const BOUND_PAD = 1e-6

/** Stumpff function C(z). */
export function stumpffC(z: number): number {
  if (Math.abs(z) < SERIES_LIMIT) return 1 / 2 - z / 24 + (z * z) / 720 - (z * z * z) / 40320
  if (z > 0) return (1 - Math.cos(Math.sqrt(z))) / z
  return (Math.cosh(Math.sqrt(-z)) - 1) / -z
}

/** Stumpff function S(z). */
export function stumpffS(z: number): number {
  if (Math.abs(z) < SERIES_LIMIT) return 1 / 6 - z / 120 + (z * z) / 5040 - (z * z * z) / 362880
  if (z > 0) {
    const sz = Math.sqrt(z)
    return (sz - Math.sin(sz)) / (sz * sz * sz)
  }
  const sz = Math.sqrt(-z)
  return (Math.sinh(sz) - sz) / (sz * sz * sz)
}

/** First guess for χ (Vallado, Algorithm 8), falling back to √μ·Δt/r0 when it is unusable. */
function initialChi(r0: number, rv: number, mu: number, alpha: number, dt: number): number {
  const sqrtMu = Math.sqrt(mu)
  const fallback = (sqrtMu * dt) / r0
  if (Math.abs(alpha * r0) < PARABOLIC_LIMIT) return fallback
  if (alpha > 0) return sqrtMu * alpha * dt
  const a = 1 / alpha
  const sign = Math.sign(dt)
  const ratio = (-2 * mu * alpha * dt) / (rv + sign * Math.sqrt(-mu * a) * (1 - r0 * alpha))
  const guess = sign * Math.sqrt(-a) * Math.log(ratio)
  return Number.isFinite(guess) && ratio > 0 ? guess : fallback
}

/**
 * Solves the universal Kepler equation F(χ) = 0 (Curtis Algorithm 3.3) by Newton iteration,
 * safeguarded with bisection as in Numerical Recipes' rtsafe.
 *
 * F is strictly increasing (dF/dχ = r > 0), so each evaluation tightens a bracket [lo, hi]
 * around the root. The root has the sign of dt, |χ| ≤ √μ·|dt|/rp because dχ/dt = √μ/r ≤ √μ/rp,
 * and |χ| < 2π·√a for a bound orbit with |dt| < T. Bisection replaces Newton when the step
 * would leave the bracket or is not halving: plain Newton crawls back from an overshoot into
 * the cosh/sinh region of a long hyperbolic leg at only ~√|a| per step.
 */
function solveChi(r0: number, vr0: number, mu: number, alpha: number, rp: number, dt: number): number {
  const sqrtMu = Math.sqrt(mu)
  const c1 = (r0 * vr0) / sqrtMu
  const c2 = 1 - alpha * r0
  const evaluate = (chi: number): [number, number] => {
    const chi2 = chi * chi
    const z = alpha * chi2
    const C = stumpffC(z)
    const S = stumpffS(z)
    const F = c1 * chi2 * C + c2 * chi2 * chi * S + r0 * chi - sqrtMu * dt
    const dF = c1 * chi * (1 - z * S) + c2 * chi2 * C + r0
    return [F, dF]
  }

  // Both bounds are exact for a circular orbit, so pad them to keep the root strictly inside.
  const bound = alpha > 0 ? (2 * Math.PI) / Math.sqrt(alpha) : Infinity
  const limit = Math.min((sqrtMu * Math.abs(dt)) / rp, bound) * (1 + BOUND_PAD)
  let lo = dt > 0 ? 0 : -limit
  let hi = dt > 0 ? limit : 0
  const inside = (x: number) => Number.isFinite(x) && x >= lo && x <= hi
  const bisect = () => {
    if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2
    return Number.isFinite(lo) ? 2 * lo + 1 : 2 * hi - 1 // radial orbit: no rp bound yet
  }

  let chi = initialChi(r0, r0 * vr0, mu, alpha, dt)
  if (!inside(chi)) chi = bisect()
  let dx = hi - lo
  let dxOld = dx
  for (let k = 0; k < MAX_ITERATIONS; k++) {
    const [F, dF] = evaluate(chi)
    if (F === 0) return chi
    if (!Number.isFinite(F) || !Number.isFinite(dF)) {
      // Overflow: |χ| is far past the root on the side of dt.
      if (chi > 0) hi = chi
      else lo = chi
    } else if (F < 0) lo = chi
    else hi = chi

    const newton = chi - F / dF
    dxOld = dx
    if (!inside(newton) || Math.abs(2 * F) > Math.abs(dxOld * dF)) {
      dx = (hi - lo) / 2
      chi = bisect()
    } else {
      // Converged only on a small Newton step: its error is quadratic, a bisection step's is not.
      dx = F / dF
      chi = newton
      if (Math.abs(dx) <= TOLERANCE * Math.max(1, Math.abs(chi))) break
    }
  }
  return chi
}

/**
 * State after `dt` seconds (negative for backwards) on the two-body conic through `s0`.
 * Works for any conic. Bound orbits are first reduced modulo one period for precision.
 */
export function propagate(s0: StateVector, mu: number, dt: number): StateVector {
  if (dt === 0) return { r: [...s0.r], v: [...s0.v] }
  const r0 = norm(s0.r)
  const vr0 = dot(s0.r, s0.v) / r0
  const alpha = 2 / r0 - dot(s0.v, s0.v) / mu // = 1/a
  let t = dt
  if (alpha > 0) {
    const T = 2 * Math.PI * Math.sqrt(1 / (alpha * alpha * alpha * mu))
    t = dt % T
  }

  // Periapsis radius from p = h²/μ and e² = 1 − α·p; bounds χ in solveChi.
  const h = cross(s0.r, s0.v)
  const p = dot(h, h) / mu
  const rp = p / (1 + Math.sqrt(Math.max(0, 1 - alpha * p)))

  const sqrtMu = Math.sqrt(mu)
  const chi = solveChi(r0, vr0, mu, alpha, rp, t)
  const chi2 = chi * chi
  const z = alpha * chi2
  const C = stumpffC(z)
  const S = stumpffS(z)

  // Lagrange coefficients (Curtis Algorithm 3.4).
  const f = 1 - (chi2 / r0) * C
  const g = t - ((chi2 * chi) / sqrtMu) * S
  const r: Vec3 = add(scale(s0.r, f), scale(s0.v, g))
  const rLen = norm(r)
  const fDot = (sqrtMu / (rLen * r0)) * (z * chi * S - chi)
  const gDot = 1 - (chi2 / rLen) * C
  return { r, v: add(scale(s0.r, fDot), scale(s0.v, gDot)) }
}

/**
 * `n` positions evenly spaced in time from t = 0 to t = duration inclusive, each propagated
 * directly from s0 (no error accumulation). n ≤ 0 gives [], n = 1 gives [s0.r].
 */
export function sampleTrajectory(s0: StateVector, mu: number, duration: number, n: number): Vec3[] {
  if (n <= 0) return []
  if (n === 1) return [[...s0.r]]
  const points: Vec3[] = []
  for (let k = 0; k < n; k++) points.push(propagate(s0, mu, (k / (n - 1)) * duration).r)
  return points
}
