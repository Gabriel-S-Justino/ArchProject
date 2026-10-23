import { describe, expect, it } from 'vitest'
import { presetById } from '@/data/presets'
import { launchTimeline, rocketStats, type RocketDesign } from '@/physics/launcher'
import {
  ascentPath,
  buildSchedule,
  burnoutTime,
  burningStage,
  dvAt,
  eventTime,
  realTimeAt,
  shotAt,
  stageBurns,
} from './launchTiming'

const rocket = (id: string): RocketDesign => presetById(id)!.rocket
const PAYLOAD = 2000
const C3 = 10

describe('buildSchedule', () => {
  it('plays a Falcon Heavy-class flight in about 25 s and spreads the three events at 151 s', () => {
    const tl = launchTimeline(rocket('falcon-heavy-exp'), PAYLOAD, C3)
    const s = buildSchedule(tl.events)
    expect(s.endA).toBeGreaterThan(22)
    expect(s.endA).toBeLessThan(29)
    const at151 = s.events.filter((e) => Math.abs(e.t - tl.events[1]!.t) < 0.5)
    expect(at151.map((e) => e.kind)).toEqual(['booster-sep', 'stage-sep', 'fairing-sep'])
    expect(at151[1]!.a - at151[0]!.a).toBeCloseTo(0.6)
    expect(at151[2]!.a - at151[1]!.a).toBeCloseTo(0.6)
    // The mission clock holds at 151 s while the three play out, so the HUD matches the event list.
    for (const e of at151) expect(realTimeAt(s, e.a)).toBeCloseTo(tl.events[1]!.t, 6)
    // Every timeline event appears once, with its index.
    expect(s.events.filter((e) => e.index !== undefined).map((e) => e.index)).toEqual(tl.events.map((_, i) => i))
  })

  it('keeps distinct events apart and the display order monotonic', () => {
    for (const id of ['atlas-v-401', 'falcon-heavy-exp', 'vulcan-vc4', 'falcon-9']) {
      const s = buildSchedule(launchTimeline(rocket(id), PAYLOAD, C3).events)
      for (let i = 1; i < s.events.length; i++) {
        const [p, q] = [s.events[i - 1]!, s.events[i]!]
        expect(q.a).toBeGreaterThanOrEqual(p.a)
        expect(q.t).toBeGreaterThanOrEqual(p.t)
        if (p.kind !== 'ignition' && q.t - p.t >= 0.5) expect(q.a - p.a).toBeGreaterThanOrEqual(1.5 - 1e-9)
      }
      expect(s.endA).toBeGreaterThan(20)
      expect(s.endA).toBeLessThan(30)
    }
  })

  it('maps animation time back to real time monotonically, through every event', () => {
    const tl = launchTimeline(rocket('vulcan-vc4'), PAYLOAD, C3)
    const s = buildSchedule(tl.events)
    let prev = -1
    for (let a = 0; a <= s.endA + 1; a += 0.01) {
      const t = realTimeAt(s, a)
      expect(t).toBeGreaterThanOrEqual(prev)
      expect(Number.isFinite(t)).toBe(true)
      prev = t
    }
    expect(realTimeAt(s, 0)).toBe(0)
    expect(realTimeAt(s, s.liftoffA)).toBe(0)
    for (const k of s.knots) expect(realTimeAt(s, k.a)).toBeCloseTo(k.t, 6)
    expect(realTimeAt(s, s.endA)).toBe(s.tEnd)
    // The first seconds play slowly (near the pad), the upper-stage burn fast.
    const early = realTimeAt(s, s.liftoffA + 1)
    expect(early).toBeLessThan(8)
  })

  it('holds a pad abort on the pad: ignition, release point, abort', () => {
    const s = buildSchedule([{ t: 0, kind: 'liftoff' }], { failure: 'pad' })
    expect(s.events.map((e) => e.kind)).toEqual(['ignition', 'liftoff', 'abort'])
    expect(s.tEnd).toBe(0)
    for (let a = 0; a < s.endA; a += 0.25) expect(realTimeAt(s, a)).toBe(0)
    expect(shotAt(s, 5).shot).toBe('pad')
  })

  it('ends a Δv failure with an engine cut-off at burnout', () => {
    const s = buildSchedule(
      [
        { t: 0, kind: 'liftoff' },
        { t: 200, kind: 'stage-sep', stage: 0 },
      ],
      { failure: 'orbit', burnoutT: 650 },
    )
    expect(s.events.at(-1)).toMatchObject({ kind: 'cutoff', t: 650 })
    expect(s.tEnd).toBe(650)
  })

  it('survives non-finite times', () => {
    const s = buildSchedule([{ t: 0, kind: 'liftoff' }, { t: Number.NaN, kind: 'orbit' }])
    expect(Number.isFinite(s.endA)).toBe(true)
  })
})

describe('Δv spent', () => {
  it('follows the stages: 0 at liftoff, stage 1 Δv at separation, the total at burnout', () => {
    const r = rocket('atlas-v-401')
    const stats = rocketStats(r, PAYLOAD)
    const tl = launchTimeline(r, PAYLOAD, C3)
    const burns = stageBurns(tl.events, stats)
    expect(burns).toHaveLength(2)
    const sep = tl.events.find((e) => e.kind === 'stage-sep')!.t
    expect(dvAt(burns, 0)).toBe(0)
    expect(dvAt(burns, sep)).toBeCloseTo(stats.stages[0]!.dv, 6)
    expect(dvAt(burns, burnoutTime(burns))).toBeCloseTo(stats.totalDv, 6)
    let prev = -1
    for (let t = 0; t < burnoutTime(burns); t += 5) {
      const dv = dvAt(burns, t)
      expect(dv).toBeGreaterThanOrEqual(prev)
      prev = dv
    }
    expect(burningStage(burns, 10)).toBe(0)
    expect(burningStage(burns, sep + 1)).toBe(1)
    // The rocket equation: the second half of a burn gains more than the first.
    const half = (sep + burnoutTime(burns)) / 2
    expect(dvAt(burns, burnoutTime(burns)) - dvAt(burns, half)).toBeGreaterThan(dvAt(burns, half) - dvAt(burns, sep))
  })

  it('reaches about the required Δv at the departure event', () => {
    const r = rocket('atlas-v-401')
    const stats = rocketStats(r, PAYLOAD)
    const tl = launchTimeline(r, PAYLOAD, C3)
    const burns = stageBurns(tl.events, stats)
    const dep = tl.events.find((e) => e.kind === 'departure-burn')!
    const orbit = tl.events.find((e) => e.kind === 'orbit')!
    expect(dvAt(burns, dep.t)).toBeGreaterThan(dvAt(burns, orbit.t))
    expect(dvAt(burns, dep.t)).toBeLessThan(stats.totalDv)
  })

  it('burns nothing on a pad abort and nothing for a too-weak upper stage', () => {
    const stats = rocketStats(rocket('atlas-v-401'), PAYLOAD)
    expect(stageBurns([{ t: 0, kind: 'liftoff' }], stats, 'pad')).toEqual([])
    const weak = { stages: stats.stages.map((s) => (s.index === 1 ? { ...s, twr: 0.01 } : s)) }
    const burns = stageBurns(
      [
        { t: 0, kind: 'liftoff' },
        { t: 220, kind: 'stage-sep', stage: 0 },
      ],
      weak,
      'orbit',
    )
    expect(burns[1]).toMatchObject({ dv: 0, start: 220, end: 220 })
    expect(dvAt(burns, 10_000)).toBeCloseTo(stats.stages[0]!.dv)
  })
})

describe('shotAt', () => {
  it('opens at the pad, chases, frames the separations, and cuts wide for orbit', () => {
    const s = buildSchedule(launchTimeline(rocket('falcon-heavy-exp'), PAYLOAD, C3).events)
    expect(shotAt(s, 0).shot).toBe('pad')
    expect(shotAt(s, s.liftoffA + 1).shot).toBe('pad')
    expect(shotAt(s, s.liftoffA + 4).shot).toBe('chase')
    expect(shotAt(s, eventTime(s, 'stage-sep', 0)).shot).toBe('sep')
    expect(shotAt(s, eventTime(s, 'orbit') + 0.1).shot).toBe('wide')
    expect(shotAt(s, s.endA).shot).toBe('wide')
  })
})

describe('ascentPath', () => {
  it('rises vertically, then pitches over toward horizontal by orbit', () => {
    const p = ascentPath(850, 1.17, 1100)
    expect(p(5).pitch).toBe(0)
    expect(p(5).x).toBeCloseTo(0)
    expect(p(850).pitch).toBeGreaterThan(1.4)
    let prev = -1
    for (let t = 0; t <= 1100; t += 10) {
      const s = p(t)
      expect(s.y).toBeGreaterThanOrEqual(prev)
      prev = s.y
    }
    // Clears a ~100 m tower within the first ~15 s and is far above the pad by stage separation.
    expect(p(15).y).toBeGreaterThan(100)
    expect(p(220).y).toBeGreaterThan(20_000)
  })
})
