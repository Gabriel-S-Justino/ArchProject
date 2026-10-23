import { describe, expect, it } from 'vitest'
import { AU, C } from './constants'
import {
  DSN_CONTACT_HOURS_PER_DAY,
  dataRateMbps,
  dataVolumeGb,
  signalDelayS,
  solarConjunction,
  solarPowerW,
} from './link'

describe('solarPowerW', () => {
  it('falls off with the square of the distance to the Sun', () => {
    expect(solarPowerW(2000, 1.52)).toBeCloseTo(865.7, 1)
    expect(solarPowerW(6000, 1)).toBe(6000)
  })

  it('returns 0 instead of NaN/Infinity for bad inputs', () => {
    expect(solarPowerW(2000, 0)).toBe(0)
    expect(solarPowerW(2000, -1)).toBe(0)
    expect(solarPowerW(2000, Number.NaN)).toBe(0)
    expect(solarPowerW(Number.NaN, 1.5)).toBe(0)
  })
})

describe('dataRateMbps', () => {
  it('falls off with the square of the Earth distance', () => {
    expect(dataRateMbps(0.9, 1)).toBeCloseTo(0.9, 10)
    expect(dataRateMbps(0.9, 0.59)).toBeCloseTo(2.585, 2) // MRO: 2.6 Mbit/s at 0.59 AU
    expect(dataRateMbps(0.9, 2.5)).toBeCloseTo(0.144, 3)
  })

  it('returns 0 for a zero or non-finite distance', () => {
    expect(dataRateMbps(0.9, 0)).toBe(0)
    expect(dataRateMbps(0.9, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('signalDelayS', () => {
  it('is distance over the speed of light', () => {
    expect(signalDelayS(C)).toBeCloseTo(1, 12)
    expect(signalDelayS(AU)).toBeCloseTo(499.0, 0)
  })

  it('returns 0 for non-finite or negative distances', () => {
    expect(signalDelayS(Number.NaN)).toBe(0)
    expect(signalDelayS(-1)).toBe(0)
  })
})

describe('solarConjunction', () => {
  it('is true only below 3 degrees of Sun-Earth-Mars angle', () => {
    expect(solarConjunction(1)).toBe(true)
    expect(solarConjunction(2.99)).toBe(true)
    expect(solarConjunction(3)).toBe(false)
    expect(solarConjunction(45)).toBe(false)
    expect(solarConjunction(Number.NaN)).toBe(false)
  })
})

describe('dataVolumeGb', () => {
  it('is rate x 8 contact hours per day x days, in Gbit', () => {
    expect(DSN_CONTACT_HOURS_PER_DAY).toBe(8)
    // 1 Mbit/s for 8 h a day over 30 days = 1 × 3600 × 8 × 30 / 1000 = 864 Gbit
    expect(dataVolumeGb(1, 30)).toBeCloseTo(864, 9)
    expect(dataVolumeGb(0.9, 1)).toBeCloseTo(25.92, 9)
  })

  it('returns 0 for non-finite or negative inputs', () => {
    expect(dataVolumeGb(Number.NaN, 30)).toBe(0)
    expect(dataVolumeGb(1, Number.POSITIVE_INFINITY)).toBe(0)
    expect(dataVolumeGb(-1, 30)).toBe(0)
  })
})
