import { describe, expect, it } from 'vitest'
import { G0 } from './constants'
import { deltaV, propellantFor } from './rocket'

describe('rocket', () => {
  it('applies the Tsiolkovsky equation', () => {
    expect(deltaV(300, 2, 1)).toBeCloseTo(300 * G0 * Math.log(2), 9)
  })

  it('returns 0 delta-v for impossible mass ratios', () => {
    expect(deltaV(300, 1, 1)).toBe(0)
    expect(deltaV(300, 1, 2)).toBe(0)
    expect(deltaV(300, 1, 0)).toBe(0)
  })

  it('computes the propellant needed for a burn (dry * (e^(dv/(isp*g0)) - 1))', () => {
    // 1000 * (exp(1000 / (320 * 9.80665)) - 1) = 375.285 kg. The brief listed 374.7,
    // which does not satisfy its own formula; see task-2-report.md.
    expect(propellantFor(1000, 320, 1000)).toBeCloseTo(375.3, 0)
  })

  it('is the inverse of deltaV', () => {
    const dry = 850
    const prop = propellantFor(1500, 320, dry)
    expect(deltaV(320, dry + prop, dry)).toBeCloseTo(1500, 6)
  })

  it('needs no propellant for a zero burn and infinite propellant with no engine', () => {
    expect(propellantFor(0, 320, 1000)).toBe(0)
    expect(propellantFor(-5, 320, 1000)).toBe(0)
    expect(propellantFor(100, 0, 1000)).toBe(Infinity)
  })
})
