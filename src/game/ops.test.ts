import { describe, expect, it } from 'vitest'
import { MISSION } from '@/data/mission'
import { AU } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import { jdFromIso } from '@/physics/time'
import { norm, sub } from '@/physics/vec'
import { REFERENCE_DESIGN } from './checklist'
import { opsPlanLimits, runOpsTurn, startOps, sunEarthMarsAngleDeg, type OpsState } from './ops'

const ARR = REFERENCE_DESIGN.transfer!.arrJd

function expectFinite(s: OpsState) {
  const nums = [
    s.turn,
    s.startJd,
    s.bufferGb,
    s.collected,
    s.delivered,
    ...s.turns.flatMap((t) => [
      t.jd,
      t.earthMarsAU,
      t.delayMin,
      t.powerGenW,
      t.powerLoadW,
      t.dataCollectedGb,
      t.dataDownlinkedGb,
      t.scienceDelivered,
    ]),
  ]
  for (const n of nums) expect(Number.isFinite(n)).toBe(true)
}

/** Runs every remaining turn with all available instruments on. */
function runAll(s: OpsState, damaged: string[] = []): OpsState {
  let state = s
  while (state.turn < MISSION.opsTurns) {
    const { available } = opsPlanLimits(state, REFERENCE_DESIGN, damaged)
    state = runOpsTurn(state, REFERENCE_DESIGN, damaged, { instrumentsOn: available })
  }
  return state
}

/** The date of the 2028 Mars solar conjunction (≈ 21 Mar 2028) (smallest Sun–Earth–Mars angle), JD. */
function conjunctionJd(): number {
  let best = jdFromIso('2027-12-01T00:00:00Z')
  for (let jd = best; jd < jdFromIso('2028-06-01T00:00:00Z'); jd += 1) {
    if (sunEarthMarsAngleDeg(jd) < sunEarthMarsAngleDeg(best)) best = jd
  }
  return best
}

describe('startOps', () => {
  it('starts at turn 0 on the arrival date with empty storage', () => {
    const s = startOps(ARR)
    expect(s).toMatchObject({ turn: 0, startJd: ARR, bufferGb: 0, collected: 0, delivered: 0, turns: [] })
  })
})

describe('opsPlanLimits', () => {
  it('lists fitted, undamaged instruments and the power left for them', () => {
    const s = startOps(ARR)
    const all = opsPlanLimits(s, REFERENCE_DESIGN, [])
    expect(all.available.sort()).toEqual(['inst-camera', 'inst-radar', 'inst-spectrometer'])
    expect(all.maxLoadW).toBeGreaterThan(145.8) // all three instruments fit at Mars
    const hurt = opsPlanLimits(s, REFERENCE_DESIGN, ['inst-radar'])
    expect(hurt.available).not.toContain('inst-radar')
  })
})

describe('runOpsTurn', () => {
  it('uses the real Earth–Mars distance and Sun–Earth–Mars angle from bodyState', () => {
    const s = runOpsTurn(startOps(ARR), REFERENCE_DESIGN, [], { instrumentsOn: ['inst-camera'] })
    const r = s.turns[0]!
    const d = norm(sub(bodyState('mars', ARR).r, bodyState('earth', ARR).r))
    expect(r.jd).toBe(ARR)
    expect(r.earthMarsAU).toBeCloseTo(d / AU, 9)
    expect(r.delayMin).toBeCloseTo(d / 299792458 / 60, 6)
    expect(r.conjunction).toBe(sunEarthMarsAngleDeg(ARR) < 3)
    expect(s.turn).toBe(1)
    const next = runOpsTurn(s, REFERENCE_DESIGN, [], { instrumentsOn: [] })
    expect(next.turns[1]!.jd).toBe(ARR + MISSION.turnDays)
  })

  it('never mutates its input', () => {
    const s = startOps(ARR)
    const copy = structuredClone(s)
    runOpsTurn(s, REFERENCE_DESIGN, [], { instrumentsOn: ['inst-camera', 'inst-radar'] })
    expect(s).toEqual(copy)
  })

  it('balance check: the reference design with every instrument on delivers ≥ 100 science in 6 turns', () => {
    const s = runAll(startOps(ARR))
    expect(s.turns).toHaveLength(MISSION.opsTurns)
    expect(s.delivered).toBeGreaterThanOrEqual(MISSION.scienceTarget)
    expectFinite(s)
  })

  // Ruling R27: the radio link is a real constraint on the reference run.
  const withParts = (parts: Record<string, number>) => ({
    ...REFERENCE_DESIGN,
    spacecraft: { ...REFERENCE_DESIGN.spacecraft, parts: { ...REFERENCE_DESIGN.spacecraft.parts, ...parts } },
  })
  const runDesign = (d: typeof REFERENCE_DESIGN) => {
    let state = startOps(ARR)
    while (state.turn < MISSION.opsTurns) {
      state = runOpsTurn(state, d, [], { instrumentsOn: opsPlanLimits(state, d, []).available })
    }
    return state
  }

  it('R27 (a): the high-gain reference is data-limited in the farther turns', () => {
    const s = runDesign(REFERENCE_DESIGN)
    const last = s.turns[s.turns.length - 1]!
    expect(last.dataDownlinkedGb).toBeLessThan(last.dataCollectedGb)
    expect(s.turns.filter((t) => t.dataDownlinkedGb < t.dataCollectedGb).length).toBeGreaterThanOrEqual(2)
    expect(s.delivered).toBeLessThan(s.collected)
    expect(last.notes.join(' ')).toMatch(/link-limited/i)
  })

  it('R27 (b): with only the low-gain antenna it delivers ≤ 60% of the reference', () => {
    const ref = runDesign(REFERENCE_DESIGN).delivered
    const lga = runDesign(withParts({ 'comms-hga': 0 })).delivered
    expect(lga).toBeLessThanOrEqual(0.6 * ref)
  })

  it('R27 (c): a laser terminal removes the data limit', () => {
    const s = runDesign(withParts({ 'comms-optical': 1 }))
    expect(s.turns.every((t) => t.dataDownlinkedGb === t.dataCollectedGb)).toBe(true)
    expect(s.delivered).toBeCloseTo(s.collected, 9)
    expect(s.delivered).toBeGreaterThan(runDesign(REFERENCE_DESIGN).delivered)
  })

  it('R27 (d): a smaller recorder overflows on the reference run and says so', () => {
    expect(runDesign(REFERENCE_DESIGN).dataLostGb).toBe(0)
    const small = runDesign(withParts({ 'storage-ssr': 0, 'storage-ssr-small': 1 }))
    expect(small.dataLostGb).toBeGreaterThan(0)
    expect(small.turns.some((t) => t.dataLostGb > 0 && /lost/i.test(t.notes.join(' ')))).toBe(true)
  })

  // R28: storage overflow costs delivered science when the link later has spare capacity for the
  // backlog. While the link is the bottleneck every turn (as on the reference run), each stored
  // Gbit carries the same science, so overflow only drops data that would never have gone down.
  // A solar conjunction is where storage pays off: the blackout turn's observations wait on board
  // and go down afterwards. Ops start 30 days before the 21 Mar 2028 conjunction, so turn 2 is the
  // blackout (the only conjunction inside the ephemeris range).
  const smallSsr = { 'storage-ssr': 0, 'storage-ssr-small': 1 } // 32 + 40 Gbit vs 160 + 40 Gbit
  const runFrom = (d: typeof REFERENCE_DESIGN, startJd: number, plan: (turn: number, available: string[]) => string[]) => {
    let state = startOps(startJd)
    while (state.turn < MISSION.opsTurns) {
      const { available } = opsPlanLimits(state, d, [])
      state = runOpsTurn(state, d, [], { instrumentsOn: plan(state.turn, available) })
    }
    return state
  }

  it('R28: across a conjunction a small recorder loses science a large one keeps (high-gain, catch-up turn)', () => {
    const start = conjunctionJd() - MISSION.turnDays
    // Everything on, except the turn after the blackout, spent downlinking the backlog.
    const plan = (turn: number, available: string[]) => (turn === 2 ? [] : available)
    const large = runFrom(REFERENCE_DESIGN, start, plan)
    const small = runFrom(withParts(smallSsr), start, plan)
    expect(large.turns[1]!.conjunction).toBe(true)
    expect(small.turns[1]!.dataLostGb).toBeGreaterThan(large.turns[1]!.dataLostGb)
    expect(small.turns[1]!.notes.join(' ')).toMatch(/lost/i)
    expect(small.delivered).toBeLessThan(large.delivered - 1)
  })

  it('R28: with a laser terminal and every instrument on, the small recorder delivers less', () => {
    const start = conjunctionJd() - MISSION.turnDays
    const all = (_turn: number, available: string[]) => available
    const large = runFrom(withParts({ 'comms-optical': 1 }), start, all)
    const small = runFrom(withParts({ 'comms-optical': 1, ...smallSsr }), start, all)
    expect(large.dataLostGb).toBe(0)
    expect(large.delivered).toBeCloseTo(large.collected, 9)
    expect(small.dataLostGb).toBeGreaterThan(0)
    expect(small.delivered).toBeLessThan(large.delivered - 1)
  })

  it('downlinks nothing during a solar conjunction and keeps the data on board', () => {
    const jd = conjunctionJd()
    expect(sunEarthMarsAngleDeg(jd)).toBeLessThan(3)
    const s = runOpsTurn(startOps(jd), REFERENCE_DESIGN, [], { instrumentsOn: ['inst-spectrometer', 'inst-radar'] })
    const r = s.turns[0]!
    expect(r.conjunction).toBe(true)
    expect(r.dataDownlinkedGb).toBe(0)
    expect(r.scienceDelivered).toBe(0)
    expect(r.dataCollectedGb).toBe(60)
    expect(s.bufferGb).toBe(60)
    expect(s.collected).toBe(14)
    // The stored data (and its science) go down on the next turn out of conjunction.
    const later = runOpsTurn({ ...s, startJd: s.startJd - 60 }, REFERENCE_DESIGN, [], { instrumentsOn: [] })
    expect(later.turns[1]!.conjunction).toBe(false)
    expect(later.turns[1]!.dataDownlinkedGb).toBe(60)
    expect(later.delivered).toBeCloseTo(14, 9)
    expect(later.bufferGb).toBe(0)
  })

  it('rejects a plan over the power limit with RangeError (not silently dropped)', () => {
    // No solar array: bus + antennas + recorder + propulsion already exceed the battery's cover.
    const dark = {
      ...REFERENCE_DESIGN,
      spacecraft: { ...REFERENCE_DESIGN.spacecraft, parts: { ...REFERENCE_DESIGN.spacecraft.parts, 'solar-large': 0 } },
    }
    const s = startOps(ARR)
    expect(opsPlanLimits(s, dark, []).maxLoadW).toBe(0)
    expect(() => runOpsTurn(s, dark, [], { instrumentsOn: ['inst-camera'] })).toThrow(RangeError)
    expect(() => runOpsTurn(s, dark, [], { instrumentsOn: [] })).not.toThrow()
  })

  it('rejects damaged, unfitted or unknown instruments and turns past the last', () => {
    const s = startOps(ARR)
    expect(() => runOpsTurn(s, REFERENCE_DESIGN, ['inst-radar'], { instrumentsOn: ['inst-radar'] })).toThrow(RangeError)
    expect(() => runOpsTurn(s, REFERENCE_DESIGN, [], { instrumentsOn: ['inst-magnetometer'] })).toThrow(RangeError)
    expect(() => runOpsTurn(s, REFERENCE_DESIGN, [], { instrumentsOn: ['nope'] })).toThrow(RangeError)
    const done = runAll(s)
    expect(() => runOpsTurn(done, REFERENCE_DESIGN, [], { instrumentsOn: [] })).toThrow(RangeError)
  })

  it('loses data that does not fit in storage and says so', () => {
    // Without antennas or recorder nothing goes down; 180 Gbit per turn meets 40 Gbit of storage.
    const mute = {
      ...REFERENCE_DESIGN,
      spacecraft: {
        ...REFERENCE_DESIGN.spacecraft,
        parts: { ...REFERENCE_DESIGN.spacecraft.parts, 'comms-hga': 0, 'comms-lga': 0, 'storage-ssr': 0 },
      },
    }
    let s = startOps(ARR)
    for (let i = 0; i < 3; i++) s = runOpsTurn(s, mute, [], { instrumentsOn: ['inst-camera', 'inst-spectrometer', 'inst-radar'] })
    expect(s.delivered).toBe(0)
    expect(s.bufferGb).toBe(MISSION.bufferGbit) // 540 Gbit collected, 40 Gbit kept
    expect(s.turns[1]!.notes.join(' ')).toMatch(/lost/i)
    expectFinite(s)
  })
})
