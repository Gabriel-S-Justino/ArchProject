import { describe, expect, it } from 'vitest'
import { jdFromIso } from '@/physics/time'
import { MISSION } from '@/data/mission'
import { launchTimeline, rocketStats } from '@/physics/launcher'
import { transferFor } from '@/physics/porkchop'
import { REFERENCE_DESIGN, type MissionDesign } from './checklist'
import { startCruise, type ArrivalResult } from './cruise'
import { lessons } from './lessons'
import { opsPlanLimits, runOpsTurn, startOps } from './ops'
import { scoreMission } from './scoring'
import { analyseSpacecraft } from './spacecraft'

const transfer = transferFor(REFERENCE_DESIGN.transfer!.depJd, REFERENCE_DESIGN.transfer!.arrJd)!
const wetKg = (d: MissionDesign) => analyseSpacecraft(d.spacecraft, transfer.vInfArrKms).stats.wetKg
const text = (ls: { title: string; text: string }[]) => ls.map((l) => `${l.title} ${l.text}`).join('\n')

describe('lessons', () => {
  it('pad failure: explains TWR with the liftoff number and the 1.1 minimum', () => {
    const heavy: MissionDesign = {
      ...REFERENCE_DESIGN,
      rocket: {
        ...REFERENCE_DESIGN.rocket,
        stages: [
          { tanks: ['tank-k381-ccb', 'tank-k381-ccb'], engineId: 'rd-180', engineCount: 1 },
          ...REFERENCE_DESIGN.rocket.stages.slice(1),
        ],
      },
    }
    const launch = launchTimeline(heavy.rocket, wetKg(heavy), transfer.c3)
    expect(launch.failure).toBe('twr')
    const twr = rocketStats(heavy.rocket, wetKg(heavy)).liftoffTwr
    const result = scoreMission({ captured: false, science: 0, budgetLeftM: 0, dvLeftMs: 0, safeModeDays: 0, failureReason: 'pad' })
    const ls = lessons({ design: heavy, launch, cruise: null, arrival: null, ops: null, result })
    const t = text(ls)
    expect(t).toMatch(/TWR/)
    expect(t).toContain(twr.toFixed(2))
    expect(t).toContain('1.1')
    expect(ls.every((l) => l.id && l.title && l.text)).toBe(true)
  })

  it('miss: mentions TCM and the predicted miss in km', () => {
    const launch = launchTimeline(REFERENCE_DESIGN.rocket, wetKg(REFERENCE_DESIGN), transfer.c3)
    const cruise = startCruise(REFERENCE_DESIGN, 7)
    const arrival: ArrivalResult = {
      captured: false,
      reason: 'miss',
      vInfKms: 2.6,
      moiDvMs: 900,
      missKm: 123_456,
      propellantLeftKg: cruise.propellantKg,
    }
    const result = scoreMission({ captured: false, science: 0, budgetLeftM: 100, dvLeftMs: 0, safeModeDays: 0, failureReason: 'miss' })
    const t = text(lessons({ design: REFERENCE_DESIGN, launch, cruise, arrival, ops: null, result }))
    expect(t).toMatch(/TCM/)
    expect(t).toContain('123,456 km')
  })

  it('success: picks only relevant lessons, with real numbers', () => {
    const launch = launchTimeline(REFERENCE_DESIGN.rocket, wetKg(REFERENCE_DESIGN), transfer.c3)
    const start = startCruise(REFERENCE_DESIGN, 7)
    const tcm = { ...start, tcms: [{ jd: start.depJd + 20, dvMs: 4.2 }] }
    const arrival: ArrivalResult = { captured: true, vInfKms: 2.6, moiDvMs: 900, missKm: 3000, propellantLeftKg: 40 }
    let ops = startOps(transfer.arrJd)
    while (ops.turn < MISSION.opsTurns) {
      ops = runOpsTurn(ops, REFERENCE_DESIGN, [], { instrumentsOn: opsPlanLimits(ops, REFERENCE_DESIGN, []).available })
    }
    const result = scoreMission({ captured: true, science: ops.delivered, budgetLeftM: 100, dvLeftMs: 50, safeModeDays: 0 })
    const ls = lessons({ design: REFERENCE_DESIGN, launch, cruise: tcm, arrival, ops, result })
    const ids = ls.map((l) => l.id)
    expect(ids).not.toContain('pad')
    expect(ids).not.toContain('miss')
    expect(ids).not.toContain('safe-mode')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('success')
    expect(ids).toContain('data-limited') // R27: the reference run is link-limited (1/d²)
  })

  it('safe mode and flare damage get their own lessons', () => {
    const launch = launchTimeline(REFERENCE_DESIGN.rocket, wetKg(REFERENCE_DESIGN), transfer.c3)
    const cruise = { ...startCruise(REFERENCE_DESIGN, 7), safeModeDays: 10, damaged: ['inst-radar'] }
    const arrival: ArrivalResult = { captured: true, vInfKms: 2.6, moiDvMs: 900, missKm: 3000, propellantLeftKg: 40 }
    const result = scoreMission({ captured: true, science: 0, budgetLeftM: 100, dvLeftMs: 50, safeModeDays: 10 })
    const ls = lessons({ design: REFERENCE_DESIGN, launch, cruise, arrival, ops: null, result })
    const safe = ls.find((l) => l.id === 'safe-mode')
    expect(safe?.text).toContain('10 days')
    expect(ls.find((l) => l.id === 'flare-damage')?.text).toMatch(/radar/i)
  })
})

describe('lessons: operations limits', () => {
  const launch = launchTimeline(REFERENCE_DESIGN.rocket, wetKg(REFERENCE_DESIGN), transfer.c3)
  const arrival: ArrivalResult = { captured: true, vInfKms: 2.6, moiDvMs: 900, missKm: 3000, propellantLeftKg: 40 }
  const runAll = (d: MissionDesign) => {
    let ops = startOps(transfer.arrJd)
    while (ops.turn < MISSION.opsTurns) {
      const { available, maxLoadW } = opsPlanLimits(ops, d, [])
      // Greedy: switch on what fits in the power left.
      let w = 0
      const fit: string[] = []
      for (const id of available) {
        const load = analyseSpacecraft({ parts: { [id]: 1 }, tcmReserveMs: 0 }, null).stats.powerLoadW
        if (w + load <= maxLoadW) {
          fit.push(id)
          w += load
        }
      }
      ops = runOpsTurn(ops, d, [], { instrumentsOn: fit })
    }
    return ops
  }

  it('low-gain antenna only: data-limited lesson with the distance in AU and 1/d²', () => {
    const lga: MissionDesign = {
      ...REFERENCE_DESIGN,
      spacecraft: { ...REFERENCE_DESIGN.spacecraft, parts: { ...REFERENCE_DESIGN.spacecraft.parts, 'comms-hga': 0 } },
    }
    const ops = runAll(lga)
    const far = Math.max(...ops.turns.map((t) => t.earthMarsAU))
    const result = scoreMission({ captured: true, science: ops.delivered, budgetLeftM: 100, dvLeftMs: 50, safeModeDays: 0 })
    const l = lessons({ design: lga, launch, cruise: null, arrival, ops, result }).find((x) => x.id === 'data-limited')
    expect(l?.text).toContain(`${far.toFixed(2)} AU`)
    expect(l?.formula).toMatch(/d²/)
  })

  it('RTG instead of arrays: power-limited lesson', () => {
    const rtg: MissionDesign = {
      ...REFERENCE_DESIGN,
      spacecraft: {
        ...REFERENCE_DESIGN.spacecraft,
        parts: { ...REFERENCE_DESIGN.spacecraft.parts, 'solar-large': 0, rtg: 1 },
      },
    }
    const ops = runAll(rtg)
    expect(ops.turns.every((t) => t.powerLimited)).toBe(true)
    const result = scoreMission({ captured: true, science: ops.delivered, budgetLeftM: 100, dvLeftMs: 50, safeModeDays: 0 })
    const l = lessons({ design: rtg, launch, cruise: null, arrival, ops, result }).find((x) => x.id === 'power-limited')
    expect(l?.text).toMatch(/RTG/)
    expect(l?.text).toContain('left 0 W for instruments') // 110 W RTG + 385 W battery < 600 W of other loads
  })
})

describe('lessons: data-limited across the 2028 solar conjunction', () => {
  it('quotes the farthest turn whose link was up, never a 0 Gbit blackout turn', () => {
    // Ops ending on the 21 Mar 2028 conjunction (0.81°): Earth–Mars distance grows every turn, so
    // the blackout turn 6 is the farthest one, with 0 Gbit of capacity.
    const launch = launchTimeline(REFERENCE_DESIGN.rocket, wetKg(REFERENCE_DESIGN), transfer.c3)
    const arrival: ArrivalResult = { captured: true, vInfKms: 2.6, moiDvMs: 900, missKm: 3000, propellantLeftKg: 40 }
    let ops = startOps(jdFromIso('2028-03-21T00:00:00Z') - 5 * MISSION.turnDays)
    while (ops.turn < MISSION.opsTurns) {
      ops = runOpsTurn(ops, REFERENCE_DESIGN, [], { instrumentsOn: opsPlanLimits(ops, REFERENCE_DESIGN, []).available })
    }
    const conj = ops.turns.find((t) => t.conjunction)!
    expect(conj.earthMarsAU).toBe(Math.max(...ops.turns.map((t) => t.earthMarsAU)))
    const up = ops.turns.filter((t) => !t.conjunction)
    const far = up.reduce((a, t) => (t.earthMarsAU > a.earthMarsAU ? t : a))
    const result = scoreMission({ captured: true, science: ops.delivered, budgetLeftM: 100, dvLeftMs: 50, safeModeDays: 0 })
    const l = lessons({ design: REFERENCE_DESIGN, launch, cruise: null, arrival, ops, result }).find((x) => x.id === 'data-limited')
    expect(l).toBeDefined()
    expect(l!.text).not.toContain(' 0.0 Gbit per turn')
    expect(l!.text).toContain(`${far.earthMarsAU.toFixed(2)} AU`)
    expect(l!.text).toContain(`${far.downlinkCapacityGb.toFixed(1)} Gbit per turn`)
  })

  it('no working link at all: no data-limited lesson', () => {
    const mute: MissionDesign = {
      ...REFERENCE_DESIGN,
      spacecraft: { ...REFERENCE_DESIGN.spacecraft, parts: { ...REFERENCE_DESIGN.spacecraft.parts, 'comms-hga': 0, 'comms-lga': 0 } },
    }
    const launch = launchTimeline(mute.rocket, wetKg(mute), transfer.c3)
    let ops = startOps(transfer.arrJd)
    while (ops.turn < MISSION.opsTurns) ops = runOpsTurn(ops, mute, [], { instrumentsOn: opsPlanLimits(ops, mute, []).available })
    expect(ops.dataLostGb).toBeGreaterThan(0)
    const result = scoreMission({ captured: true, science: 0, budgetLeftM: 100, dvLeftMs: 50, safeModeDays: 0 })
    expect(lessons({ design: mute, launch, cruise: null, arrival: null, ops, result }).map((x) => x.id)).not.toContain('data-limited')
  })
})
