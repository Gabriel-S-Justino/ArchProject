import { describe, expect, it } from 'vitest'
import { createRng } from './rng'

const take = (next: () => number, n: number) => Array.from({ length: n }, () => next())

describe('createRng (mulberry32)', () => {
  it('gives the same first 5 numbers twice for the same seed', () => {
    expect(take(createRng(1), 5)).toEqual(take(createRng(1), 5))
  })

  it('matches the reference mulberry32 output for seed 1', () => {
    expect(createRng(1)()).toBeCloseTo(0.6270739405881613, 15)
  })

  it('returns numbers in [0, 1)', () => {
    for (const x of take(createRng(42), 1000)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('differs between seeds', () => {
    expect(take(createRng(1), 5)).not.toEqual(take(createRng(2), 5))
  })

  it('treats a non-finite seed as 0 instead of producing NaN', () => {
    expect(take(createRng(Number.NaN), 3)).toEqual(take(createRng(0), 3))
  })
})
