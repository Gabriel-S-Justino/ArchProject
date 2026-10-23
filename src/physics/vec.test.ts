import { describe, expect, it } from 'vitest'
import { add, cross, dot, norm, normalize, scale, sub } from './vec'
import type { Vec3 } from './vec'

describe('vec', () => {
  const a: Vec3 = [1, 2, 3]
  const b: Vec3 = [4, -5, 6]

  it('adds, subtracts and scales component-wise', () => {
    expect(add(a, b)).toEqual([5, -3, 9])
    expect(sub(a, b)).toEqual([-3, 7, -3])
    expect(scale(a, 2)).toEqual([2, 4, 6])
  })

  it('computes dot and cross products', () => {
    expect(dot(a, b)).toBe(4 - 10 + 18)
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
    expect(cross(a, b)).toEqual([2 * 6 - 3 * -5, 3 * 4 - 1 * 6, 1 * -5 - 2 * 4])
  })

  it('computes length and unit vectors', () => {
    expect(norm([3, 4, 12])).toBe(13)
    const u = normalize([3, 4, 12])
    expect(norm(u)).toBeCloseTo(1, 12)
    expect(u[0]).toBeCloseTo(3 / 13, 12)
  })

  it('returns the zero vector when normalizing the zero vector', () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0])
  })

  it('does not mutate its inputs', () => {
    add(a, b)
    scale(a, 3)
    expect(a).toEqual([1, 2, 3])
  })
})
