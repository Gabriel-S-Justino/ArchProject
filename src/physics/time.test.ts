import { describe, expect, it } from 'vitest'
import { J2000_JD, dateFromJd, formatJd, jdFromDate, jdFromIso } from './time'

describe('time', () => {
  it('maps the J2000 epoch to JD 2451545', () => {
    expect(J2000_JD).toBe(2451545.0)
    expect(jdFromIso('2000-01-01T12:00:00Z')).toBe(2451545)
    expect(jdFromDate(new Date(Date.UTC(2000, 0, 1, 12)))).toBe(2451545)
  })

  it('maps the Unix epoch to JD 2440587.5', () => {
    expect(jdFromDate(new Date(0))).toBe(2440587.5)
  })

  it('round-trips Date -> JD -> Date to the millisecond', () => {
    const d = new Date(Date.UTC(2026, 10, 16, 7, 30, 15, 250))
    expect(Math.abs(dateFromJd(jdFromDate(d)).getTime() - d.getTime())).toBeLessThanOrEqual(1)
  })

  it('formats a JD as "D Mon YYYY" in UTC', () => {
    expect(formatJd(jdFromIso('2026-11-16T00:00:00Z'))).toBe('16 Nov 2026')
    expect(formatJd(jdFromIso('2026-11-16T23:59:00Z'))).toBe('16 Nov 2026')
    expect(formatJd(jdFromIso('2028-03-05T12:00:00Z'))).toBe('5 Mar 2028')
    expect(formatJd(J2000_JD)).toBe('1 Jan 2000')
  })

  it('returns NaN for an unparseable ISO string and formats it as "Invalid date"', () => {
    expect(jdFromIso('not a date')).toBeNaN()
    expect(formatJd(Number.NaN)).toBe('Invalid date')
  })
})
