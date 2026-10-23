import { describe, expect, it } from 'vitest'
import { ROLL_MS, shouldRoll } from './RollingText'
import { distanceKm, formatDistanceKm } from './status'

describe('shouldRoll', () => {
  it('rolls a change that comes after the previous roll has finished', () => {
    expect(shouldRoll(-Infinity, 0)).toBe(true)
    expect(shouldRoll(1000, 1000 + ROLL_MS)).toBe(true)
    expect(shouldRoll(1000, 9000)).toBe(true)
  })

  it('swaps in place while changes arrive faster than a roll (time warp: one per frame)', () => {
    expect(shouldRoll(1000, 1016)).toBe(false)
    expect(shouldRoll(1000, 1000 + ROLL_MS - 1)).toBe(false)
  })

  it('rolls when the clock went backwards', () => {
    expect(shouldRoll(2000, 1000)).toBe(true)
  })
})

describe('distanceKm', () => {
  it('never prints a bare 0 for a real distance', () => {
    expect(distanceKm(0.004)).toEqual({ value: '< 0.1', digits: 0 })
    expect(distanceKm(3.26)).toEqual({ value: 3.26, digits: 1 })
    expect(distanceKm(114394)).toEqual({ value: 114394, digits: 0 })
    expect(distanceKm(Number.NaN).digits).toBe(0)
  })

  it('reads the same in running text', () => {
    expect(formatDistanceKm(0.004)).toBe('< 0.1')
    expect(formatDistanceKm(3.26)).toBe('3.3')
    expect(formatDistanceKm(114394)).toBe('114,394')
    expect(formatDistanceKm(Number.POSITIVE_INFINITY)).toBe('–')
  })
})
