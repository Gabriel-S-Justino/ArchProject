import { describe, expect, it } from 'vitest'
import { G0 } from '@/physics/constants'
import { launchTimeline } from '@/physics/launcher'
import { REFERENCE_DESIGN } from './checklist'
import { analyseSpacecraft } from './spacecraft'
import { SCORE_DIFFICULTY_MULTIPLIER, dvLeftMs, failureFromLaunch, scoreMission } from './scoring'

const base = { captured: true, science: 120, budgetLeftM: 300, dvLeftMs: 200, safeModeDays: 0 }

describe('scoreMission (legacy formula, safeTurns → safeModeDays / 10)', () => {
  it('success with ≥ 20% budget left: 3 stars and the legacy score', () => {
    const r = scoreMission(base)
    const raw = 120 * (1 + (300 / 900) * 0.5) * SCORE_DIFFICULTY_MULTIPLIER + 200 / 100
    expect(r).toEqual({ outcome: 'success', score: Math.round(raw), stars: 3 })
  })

  it('success with < 20% budget left: 2 stars', () => {
    expect(scoreMission({ ...base, budgetLeftM: 100 }).stars).toBe(2)
  })

  it('safe mode costs 5 points per 10 days', () => {
    const a = scoreMission(base).score
    const b = scoreMission({ ...base, safeModeDays: 10 }).score
    expect(a - b).toBe(5)
  })

  it('captured below target, or science without capture: partial, 1 star', () => {
    expect(scoreMission({ ...base, science: 50 })).toMatchObject({ outcome: 'partial', stars: 1 })
    expect(scoreMission({ ...base, captured: false, science: 4, failureReason: 'miss' })).toMatchObject({
      outcome: 'partial',
      stars: 1,
      failureReason: 'miss',
    })
  })

  it('nothing achieved: failure, 0 points, 0 stars, with the reason', () => {
    const r = scoreMission({ ...base, captured: false, science: 0, failureReason: 'pad' })
    expect(r).toEqual({ outcome: 'failure', score: 0, stars: 0, failureReason: 'pad' })
  })

  it('never returns NaN for nonsense input', () => {
    const r = scoreMission({ captured: true, science: NaN, budgetLeftM: Infinity, dvLeftMs: NaN, safeModeDays: NaN })
    expect(Number.isFinite(r.score)).toBe(true)
  })
})

describe('failureFromLaunch', () => {
  it('maps the launch timeline to pad / orbit / departure', () => {
    expect(failureFromLaunch({ events: [], reachedOrbit: false, reachedDeparture: false, failure: 'twr' })).toBe('pad')
    expect(failureFromLaunch({ events: [], reachedOrbit: false, reachedDeparture: false, failure: 'dv' })).toBe('orbit')
    expect(failureFromLaunch({ events: [], reachedOrbit: true, reachedDeparture: false, failure: 'dv' })).toBe('departure')
    expect(launchTimeline(REFERENCE_DESIGN.rocket, 1500, 9.2).reachedDeparture).toBe(true)
    expect(failureFromLaunch(launchTimeline(REFERENCE_DESIGN.rocket, 1500, 9.2))).toBeUndefined()
  })
})

describe('dvLeftMs', () => {
  it('is the rocket equation on the propellant left', () => {
    const sc = analyseSpacecraft(REFERENCE_DESIGN.spacecraft, null)
    const isp = sc.propulsion!.ispS!
    const dry = sc.stats.dryKg
    expect(dvLeftMs(REFERENCE_DESIGN, 50)).toBeCloseTo(isp * G0 * Math.log((dry + 50) / dry), 6)
    expect(dvLeftMs(REFERENCE_DESIGN, 0)).toBe(0)
    expect(dvLeftMs(REFERENCE_DESIGN, NaN)).toBe(0)
  })
})
