import { describe, expect, it } from 'vitest'
import { MISSION } from '@/data/mission'
import { presetById } from '@/data/presets'
import {
  APPROACH_STOP_DAYS,
  answerEvent,
  autoplay,
  beginCruise,
  burnTcm,
  defaultEventOption,
  defaultOpsPlan,
  flightArrive,
  flightBeginCruise,
  flightLaunch,
  flightOpsTurn,
  instrumentLoadW,
  launchMission,
  missionCostM,
  nextStop,
  pendingDecision,
  playCruise,
  skipTcm,
  tickCruise,
} from './autoplay'
import { REFERENCE_DESIGN, type MissionDesign } from './checklist'
import { tcmQuote, tcmWindows } from './cruise'
import type { EventOption } from './events'
import { opsPlanLimits } from './ops'

const ref = (): MissionDesign => structuredClone(REFERENCE_DESIGN)

describe('launchMission', () => {
  it('launches the reference design to its departure', () => {
    const l = launchMission(ref())
    expect(l.failure).toBeUndefined()
    expect(l.timeline.reachedDeparture).toBe(true)
    expect(l.c3).toBeCloseTo(9.18, 1)
    expect(l.payloadKg).toBeGreaterThan(1000)
  })

  it('reports a pad failure when the stack is too heavy to lift off', () => {
    const d = ref()
    d.spacecraft.parts['inst-camera'] = 1
    d.rocket = structuredClone(presetById('atlas-v-401')!.rocket)
    d.rocket.stages[0]!.engineCount = 1
    d.rocket.stages[0]!.tanks = [...d.rocket.stages[0]!.tanks, ...d.rocket.stages[0]!.tanks, ...d.rocket.stages[0]!.tanks]
    const l = launchMission(d)
    expect(l.failure).toBe('pad')
    const f = flightLaunch(d)
    expect(f.launched).toBe(true)
    expect(f.result?.result.outcome).toBe('failure')
    expect(f.result?.failureReason).toBe('pad')
    expect(flightBeginCruise(f, d, 1)).toBeNull()
  })
})

describe('cruise stops and decisions', () => {
  it('stops exactly at TCM-1 and waits for the decision', () => {
    const d = ref()
    let p = beginCruise(d, 1)
    expect(pendingDecision(p)).toBeNull()
    const first = nextStop(p)!
    const tcm1 = tcmWindows(p.sim)[0]!
    expect(first.jd).toBeLessThanOrEqual(tcm1.jd)
    // Warp far past it: time stops at the first stop, never beyond.
    for (let i = 0; i < 5 && !pendingDecision(p); i++) p = tickCruise(p, 400).progress
    const pending = pendingDecision(p)!
    expect(pending).not.toBeNull()
    expect(p.sim.jd).toBeLessThanOrEqual(tcm1.jd + 1e-6)
    // While a decision is pending, time does not move.
    expect(tickCruise(p, 50).progress).toBe(p)
  })

  it('burnTcm and skipTcm settle the window; a skipped window is never offered again', () => {
    const d = ref()
    let p = beginCruise(d, 1)
    while (pendingDecision(p)?.kind !== 'tcm') {
      const d0 = pendingDecision(p)
      if (d0?.kind === 'event') p = answerEvent(p, d, 1, 'keep-observing')!.progress
      else p = tickCruise(p, 1000).progress
    }
    const burned = burnTcm(p)!
    expect(burned.sim.tcms).toHaveLength(1)
    expect(burned.sim.propellantKg).toBeLessThan(p.sim.propellantKg)
    expect(pendingDecision(burned)?.kind).not.toBe('tcm')
    const skipped = skipTcm(p)!
    expect(skipped.sim.tcms).toHaveLength(0)
    expect(skipped.decidedTcms).toEqual(['TCM-1'])
    expect(pendingDecision(skipped)?.kind).not.toBe('tcm')
    expect(skipTcm(skipped)).toBeNull()
  })

  it('a TCM the ship cannot afford is refused and can only be skipped (Review Focus 4)', () => {
    const d = ref()
    let p = beginCruise(d, 1)
    p = { ...p, sim: { ...p.sim, propellantKg: 0 } }
    while (pendingDecision(p)?.kind !== 'tcm') p = tickCruise(p, 1000).progress
    const q = tcmQuote(p.sim)
    expect(q.available).toBe(false)
    expect(q.reason).toMatch(/Not enough propellant/)
    expect(burnTcm(p)).toBeNull()
    expect(skipTcm(p)).not.toBeNull()
  })

  it('stops 3 days before arrival and at arrival', () => {
    const d = ref()
    const p = playCruise(beginCruise(d, 1), d, 1)
    expect(p.sim.jd).toBe(p.sim.arrJd)
    // Rewind-free check: from a fresh cruise with everything decided, the last two stops are approach and arrival.
    let q = beginCruise(d, 1)
    const kinds: string[] = []
    for (let i = 0; i < 50 && q.sim.jd < q.sim.arrJd; i++) {
      const dec = pendingDecision(q)
      if (dec?.kind === 'tcm') q = skipTcm(q)!
      else if (dec?.kind === 'event') q = answerEvent(q, d, 1, 'keep-observing')!.progress
      else {
        const r = tickCruise(q, 1e6)
        if (r.stopped) kinds.push(r.stopped)
        if (r.stopped === 'approach') expect(r.progress.sim.jd).toBeCloseTo(q.sim.arrJd - APPROACH_STOP_DAYS, 6)
        q = r.progress
      }
    }
    expect(kinds.slice(-2)).toEqual(['approach', 'arrival'])
    expect(kinds.filter((k) => k === 'tcm')).toHaveLength(3)
  })

  it('defaultEventOption prefers safe mode, then the shield attitude, then observing', () => {
    const o = (id: EventOption['id'], available: boolean): EventOption => ({ id, label: id, risk: 0, cost: '', available })
    expect(defaultEventOption([o('safe-mode', true), o('keep-observing', true), o('shield-attitude', true)])).toBe('safe-mode')
    expect(defaultEventOption([o('safe-mode', false), o('keep-observing', true), o('shield-attitude', true)])).toBe('shield-attitude')
    expect(defaultEventOption([o('safe-mode', false), o('keep-observing', true), o('shield-attitude', false)])).toBe('keep-observing')
  })
})

describe('operations plan', () => {
  it('defaultOpsPlan stays within the power limit and skips damaged instruments', () => {
    const d = ref()
    const ops = autoplay(d, 1, 'ops').ops!
    const limits = opsPlanLimits(ops, d, ['inst-radar'])
    const plan = defaultOpsPlan(ops, d, ['inst-radar'])
    expect(plan.instrumentsOn).not.toContain('inst-radar')
    const load = plan.instrumentsOn.reduce((a, id) => a + instrumentLoadW(d, id), 0)
    expect(load).toBeLessThanOrEqual(limits.maxLoadW + 1e-9)
  })

  it('flightOpsTurn refuses an invalid plan instead of throwing', () => {
    const d = ref()
    const f = autoplay(d, 1, 'ops')
    expect(flightOpsTurn(f, d, { instrumentsOn: ['not-a-part'] })).toBeNull()
  })
})

describe('autoplay (R23)', () => {
  it('is deterministic for a seed', () => {
    const a = autoplay(ref(), 7, 'report')
    const b = autoplay(ref(), 7, 'report')
    expect(b).toEqual(a)
  })

  it('different seeds give different flights', () => {
    const a = autoplay(ref(), 1, 'arrival')
    const b = autoplay(ref(), 2, 'arrival')
    expect(a.cruise!.sim.injectionErrorMs).not.toEqual(b.cruise!.sim.injectionErrorMs)
  })

  it('stops at each phase with the state that screen needs', () => {
    const d = ref()
    const cruise = autoplay(d, 1, 'cruise')
    expect(cruise).toMatchObject({ phase: 'cruise', launched: true, arrived: false, arrival: null, ops: null, result: null })
    expect(cruise.cruise!.sim.jd).toBe(cruise.cruise!.sim.depJd)

    const arrival = autoplay(d, 1, 'arrival')
    expect(arrival.phase).toBe('arrival')
    expect(arrival.cruise!.sim.jd).toBe(arrival.cruise!.sim.arrJd)
    expect(arrival.cruise!.decidedTcms).toHaveLength(3)
    expect(arrival.arrival).toBeNull()

    const ops = autoplay(d, 1, 'ops')
    expect(ops).toMatchObject({ phase: 'ops', arrived: true, opsDone: false })
    expect(ops.arrival!.captured).toBe(true)
    expect(ops.ops!.turn).toBe(0)

    const report = autoplay(d, 1, 'report')
    expect(report).toMatchObject({ phase: 'report', opsDone: true })
    expect(report.ops!.turn).toBe(MISSION.opsTurns)
    expect(report.result!.result.outcome).not.toBe('failure')
    expect(report.result!.science).toBeCloseTo(report.ops!.delivered + report.cruise!.sim.cruiseScience, 9)
    expect(report.result!.budgetLeftM).toBeCloseTo(MISSION.budgetM - missionCostM(d), 9)
    expect(report.result!.lessons.length).toBeGreaterThan(0)
  })

  it('skipping every TCM misses Mars and still reaches a report', () => {
    const d = ref()
    let f = flightBeginCruise(flightLaunch(d), d, 1)!
    f = { ...f, cruise: playCruise(f.cruise!, d, 1, { burnTcms: false }) }
    f = flightArrive(f, d)!
    expect(f.arrival!.captured).toBe(false)
    expect(f.arrival!.reason).toBe('miss')
    expect(f.arrived).toBe(false)
    expect(f.result!.failureReason).toBe('miss')
    expect(f.result!.dvLeftMs).toBe(0)
    expect(flightArrive(f, d)).toBeNull()
  })

  it('with no propellant the TCMs are skipped and the flyby reaches a report (Review Focus 4)', () => {
    const d = ref()
    let f = flightBeginCruise(flightLaunch(d), d, 1)!
    f = { ...f, cruise: { ...f.cruise!, sim: { ...f.cruise!.sim, propellantKg: 0 } } }
    f = { ...f, cruise: playCruise(f.cruise!, d, 1) }
    expect(f.cruise!.sim.tcms).toHaveLength(0)
    expect(f.cruise!.log.filter((e) => e.kind === 'skip')).toHaveLength(3)
    f = flightArrive(f, d)!
    expect(f.arrival!.captured).toBe(false)
    expect(f.result).not.toBeNull()
  })

  it('arrival is refused before the arrival date', () => {
    const d = ref()
    const f = autoplay(d, 1, 'cruise')
    expect(flightArrive(f, d)).toBeNull()
  })
})
