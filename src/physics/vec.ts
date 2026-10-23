// 3D vector helpers on plain tuples. Pure functions; inputs are never mutated.

export type Vec3 = [number, number, number]

/** Position (m) and velocity (m/s) relative to a central body. */
export interface StateVector {
  r: Vec3
  v: Vec3
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])

/** Unit vector along a; the zero vector maps to itself. */
export function normalize(a: Vec3): Vec3 {
  const n = norm(a)
  return n > 0 ? scale(a, 1 / n) : [0, 0, 0]
}
