import { describe, expect, it } from 'vitest'
import { CLICK_GUARD_MS, clickAllowed } from './clickGuard'

describe('clickAllowed', () => {
  it('ignores a click inside the guard window after arming (the second click of a double-click)', () => {
    expect(clickAllowed(1000, 1000)).toBe(false)
    expect(clickAllowed(1000, 1150)).toBe(false)
    expect(clickAllowed(1000, 1000 + CLICK_GUARD_MS - 1)).toBe(false)
  })

  it('accepts a click once the window has passed', () => {
    expect(clickAllowed(1000, 1000 + CLICK_GUARD_MS)).toBe(true)
    expect(clickAllowed(1000, 5000)).toBe(true)
  })

  it('accepts clicks before any arming and on a clock that went backwards', () => {
    expect(clickAllowed(-Infinity, 0)).toBe(true)
    expect(clickAllowed(2000, 1000)).toBe(true)
  })

  it('takes a custom window', () => {
    expect(clickAllowed(0, 90, 100)).toBe(false)
    expect(clickAllowed(0, 100, 100)).toBe(true)
  })
})
