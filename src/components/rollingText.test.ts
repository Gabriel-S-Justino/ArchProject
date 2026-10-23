import { describe, expect, it } from 'vitest'
import { ROLL_MS, shouldRoll } from './RollingText'

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
