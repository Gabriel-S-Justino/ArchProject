// Geometry and timing of the Mars approach for the arrival scene (pure; no three.js). Both conics
// share their periapsis, on the +x axis of the orbit plane, and fly prograde (true anomaly ν
// increasing): the incoming hyperbola with e = 1 + r_p·v∞²/μ, and the capture ellipse the burn at
// periapsis puts the spacecraft into. Times come from Kepler's equation, so the drawn spacecraft
// speeds up towards periapsis as the real one would (the scene then compresses time).

export interface Hyperbola {
  /** Periapsis radius, m. */
  rp: number
  /** Hyperbolic excess speed, m/s. */
  vInf: number
  mu: number
  /** Eccentricity, > 1. */
  e: number
  /** Semi-major axis, m (negative for a hyperbola: −μ/v∞²). */
  a: number
  /** Semi-latus rectum, m. */
  p: number
  /** True anomaly of the asymptotes, rad: acos(−1/e). */
  nuInf: number
  /** Speed at periapsis, m/s (vis-viva). */
  vp: number
}

export interface Ellipse {
  rp: number
  ra: number
  mu: number
  a: number
  e: number
  b: number
  p: number
  /** Orbital period, s. */
  period: number
  /** Speed at periapsis, m/s. */
  vp: number
}

/** The approach hyperbola for a periapsis radius (m) and v∞ (m/s). v∞ is floored at 1 m/s. */
export function hyperbola(rp: number, vInfMs: number, mu: number): Hyperbola {
  const vInf = Math.max(1, Number.isFinite(vInfMs) ? vInfMs : 1)
  const e = 1 + (rp * vInf * vInf) / mu
  const a = -mu / (vInf * vInf)
  const p = rp * (1 + e)
  return { rp, vInf, mu, e, a, p, nuInf: Math.acos(-1 / e), vp: Math.sqrt(vInf * vInf + (2 * mu) / rp) }
}

/** The capture ellipse between periapsis and apoapsis radii, m. */
export function ellipse(rp: number, ra: number, mu: number): Ellipse {
  const a = (rp + ra) / 2
  const e = (ra - rp) / (ra + rp)
  return {
    rp,
    ra,
    mu,
    a,
    e,
    b: a * Math.sqrt(1 - e * e),
    p: a * (1 - e * e),
    period: 2 * Math.PI * Math.sqrt((a * a * a) / mu),
    vp: Math.sqrt(mu * (2 / rp - 1 / a)),
  }
}

/** Radius at true anomaly ν on a conic of semi-latus rectum p and eccentricity e. */
export const radiusAt = (c: { p: number; e: number }, nu: number) => c.p / (1 + c.e * Math.cos(nu))

/** Position in the orbit plane (periapsis on +x), m. */
export function pointAt(c: { p: number; e: number }, nu: number): [number, number] {
  const r = radiusAt(c, nu)
  return [r * Math.cos(nu), r * Math.sin(nu)]
}

/** Unit velocity direction in the orbit plane at ν (prograde). */
export function directionAt(c: { e: number }, nu: number): [number, number] {
  // Velocity ∝ (−sin ν, e + cos ν).
  const x = -Math.sin(nu)
  const y = c.e + Math.cos(nu)
  const n = Math.hypot(x, y) || 1
  return [x / n, y / n]
}

/** True anomaly where the hyperbola reaches radius r ≥ rp, on the outgoing side (ν ≥ 0). */
export function nuAtRadius(c: { p: number; e: number }, r: number): number {
  const cos = (c.p / Math.max(r, 1e-9) - 1) / c.e
  return Math.acos(Math.max(-1, Math.min(1, cos)))
}

/** Seconds from periapsis to true anomaly ν on the hyperbola (negative before periapsis). */
export function hyperbolaTime(h: Hyperbola, nu: number): number {
  const F = 2 * Math.atanh(Math.sqrt((h.e - 1) / (h.e + 1)) * Math.tan(nu / 2))
  return Math.sqrt((-h.a) ** 3 / h.mu) * (h.e * Math.sinh(F) - F)
}

/** True anomaly `t` seconds from periapsis on the hyperbola (Newton on e·sinh F − F = M). */
export function hyperbolaNu(h: Hyperbola, t: number): number {
  const M = t / Math.sqrt((-h.a) ** 3 / h.mu)
  let F = Math.asinh(M / h.e)
  for (let i = 0; i < 40; i++) {
    const f = h.e * Math.sinh(F) - F - M
    const d = h.e * Math.cosh(F) - 1
    const step = f / d
    F -= step
    if (Math.abs(step) < 1e-12 * Math.max(1, Math.abs(F))) break
  }
  return 2 * Math.atan(Math.sqrt((h.e + 1) / (h.e - 1)) * Math.tanh(F / 2))
}

/** True anomaly `t` seconds after periapsis on the ellipse (Newton on E − e·sin E = M). */
export function ellipseNu(el: Ellipse, t: number): number {
  const n = (2 * Math.PI) / el.period
  let M = (n * t) % (2 * Math.PI)
  if (M < 0) M += 2 * Math.PI
  let E = el.e < 0.8 ? M : Math.PI
  for (let i = 0; i < 40; i++) {
    const step = (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E))
    E -= step
    if (Math.abs(step) < 1e-12) break
  }
  return 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2))
}

/**
 * How much of the ellipse is flown `t` seconds after periapsis, as a fraction of its samples (which
 * ellipsePoints spaces evenly in true anomaly): ν/2π during the first orbit, 1 once it is complete.
 * The trace then ends at the spacecraft, fast past periapsis and slow at apoapsis.
 */
export function ellipseTraced(el: Ellipse, t: number): number {
  if (!(t > 0)) return 0
  if (t >= el.period) return 1
  let nu = ellipseNu(el, t)
  if (nu < 0) nu += 2 * Math.PI
  return nu / (2 * Math.PI)
}

/**
 * `n` points of the hyperbola between true anomalies nu0 and nu1 (orbit plane, m), written as
 * x, y pairs. Both anomalies are clamped inside the asymptotes.
 */
export function hyperbolaPoints(h: Hyperbola, nu0: number, nu1: number, n: number): Float64Array {
  const lim = h.nuInf * 0.999
  const a = Math.max(-lim, Math.min(lim, nu0))
  const b = Math.max(-lim, Math.min(lim, nu1))
  const out = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) {
    const [x, y] = pointAt(h, a + ((b - a) * i) / Math.max(1, n - 1))
    out[i * 2] = x
    out[i * 2 + 1] = y
  }
  return out
}

/** `n` points of the whole ellipse (closed: the last point repeats the first), m. */
export function ellipsePoints(el: Ellipse, n: number): Float64Array {
  const out = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) {
    const [x, y] = pointAt(el, (2 * Math.PI * i) / Math.max(1, n - 1))
    out[i * 2] = x
    out[i * 2 + 1] = y
  }
  return out
}
