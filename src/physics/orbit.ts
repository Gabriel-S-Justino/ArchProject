// Closed-form two-body relations. Pure functions, SI units, angles in radians.
// Ported from legacy js/physics/orbit.js.
import { cross, dot, norm, scale, sub } from './vec'
import type { StateVector } from './vec'

/** Circular orbit speed: v = √(μ/r). */
export function circularSpeed(mu: number, r: number): number {
  return Math.sqrt(mu / r)
}

/** Vis-viva: v = √(μ·(2/r − 1/a)). */
export function visViva(mu: number, r: number, a: number): number {
  return Math.sqrt(mu * (2 / r - 1 / a))
}

/** Kepler's third law: T = 2π·√(a³/μ). */
export function period(mu: number, a: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / mu)
}

export interface Hohmann {
  /** Transfer ellipse semi-major axis, m. */
  a: number
  /** Burn at r1 to enter the transfer, m/s. */
  dv1: number
  /** Burn at r2 to circularize, m/s. */
  dv2: number
  /** Transfer duration (half the ellipse period), s. */
  time: number
}

/** Hohmann transfer between circular coplanar orbits r1 → r2. */
export function hohmann(mu: number, r1: number, r2: number): Hohmann {
  const a = (r1 + r2) / 2
  return {
    a,
    dv1: visViva(mu, r1, a) - circularSpeed(mu, r1),
    dv2: circularSpeed(mu, r2) - visViva(mu, r2, a),
    time: period(mu, a) / 2,
  }
}

/** Δv to leave a circular parking orbit of radius rPark with hyperbolic excess vInf. */
export function escapeBurn(mu: number, rPark: number, vInf: number): number {
  return Math.sqrt(vInf * vInf + (2 * mu) / rPark) - circularSpeed(mu, rPark)
}

/** Δv at periapsis rp to capture from hyperbolic excess vInf into an rp × ra ellipse. */
export function captureBurn(mu: number, rp: number, ra: number, vInf: number): number {
  return Math.sqrt(vInf * vInf + (2 * mu) / rp) - visViva(mu, rp, (rp + ra) / 2)
}

export interface OrbitalElements {
  /** Semi-major axis, m. Negative for hyperbolas, ±Infinity for an exact parabola. */
  a: number
  /** Eccentricity. */
  e: number
  /** Inclination to the reference xy-plane, rad in [0, π]. 0 for a radial (h = 0) trajectory. */
  i: number
  /** Periapsis radius, m. */
  rp: number
  /** Apoapsis radius, m. Infinity for open orbits (e ≥ 1). */
  ra: number
}

/** Size, shape and tilt of the conic through a state vector. Works for any conic. */
export function orbitalElements(s: StateVector, mu: number): OrbitalElements {
  const r = norm(s.r)
  const v2 = dot(s.v, s.v)
  const h = cross(s.r, s.v)
  const hLen = norm(h)
  const a = 1 / (2 / r - v2 / mu)
  const eVec = scale(sub(scale(s.r, v2 - mu / r), scale(s.v, dot(s.r, s.v))), 1 / mu)
  const e = norm(eVec)
  const i = hLen > 0 ? Math.acos(Math.min(1, Math.max(-1, h[2] / hLen))) : 0
  // Semi-latus rectum p = h²/μ gives rp and ra for every conic, including the parabola.
  const p = (hLen * hLen) / mu
  return { a, e, i, rp: p / (1 + e), ra: e < 1 ? p / (1 - e) : Infinity }
}
