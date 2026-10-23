import { describe, expect, it } from 'vitest'
import { REFERENCE_DESIGN } from '@/game/checklist'
import { REFERENCE_SPACECRAFT, spacecraftStats } from '@/game/spacecraft'
import { jdFromIso } from '@/physics/time'
import {
  CATEGORIES,
  dataPerTurnGb,
  earthMarsDistanceAU,
  partsIn,
  powerVerdict,
  propulsionId,
  setPartCount,
  setPropulsion,
  setReserve,
} from './spacecraftEdit'

describe('spacecraft edits', () => {
  it('covers every catalog category', () => {
    const all = CATEGORIES.flatMap((c) => partsIn(c.id))
    expect(all.length).toBeGreaterThan(10)
  })

  it('clamps part counts to the part max and removes zero counts', () => {
    const d = { parts: {}, tcmReserveMs: 50 }
    expect(setPartCount(d, 'sc-core', 3).parts['sc-core']).toBe(1)
    expect(setPartCount(d, 'battery', 2).parts.battery).toBe(2)
    expect('battery' in setPartCount(setPartCount(d, 'battery', 2), 'battery', 0).parts).toBe(false)
    expect(setPartCount(d, 'nope', 2).parts).toEqual({})
    expect(d.parts).toEqual({})
  })

  it('keeps exactly one propulsion system', () => {
    const a = setPropulsion({ parts: { 'sc-core': 1 }, tcmReserveMs: 0 }, 'prop-monoprop')
    const b = setPropulsion(a, 'prop-biprop')
    expect(b.parts).toEqual({ 'sc-core': 1, 'prop-biprop': 1 })
    expect(propulsionId(b)).toBe('prop-biprop')
    expect(propulsionId(setPropulsion(b, null))).toBeNull()
  })

  it('clamps the TCM reserve to 0–150 m/s', () => {
    const d = { parts: {}, tcmReserveMs: 50 }
    expect(setReserve(d, 400).tcmReserveMs).toBe(150)
    expect(setReserve(d, -5).tcmReserveMs).toBe(0)
    expect(setReserve(d, Number.NaN).tcmReserveMs).toBe(0)
  })

  it('power is not applicable without a bus, and judged with the battery otherwise', () => {
    const empty = { parts: {}, tcmReserveMs: 0 }
    expect(powerVerdict(empty, spacecraftStats(empty, null)).kind).toBe('n/a')
    const ref = REFERENCE_SPACECRAFT
    const v = powerVerdict(ref, spacecraftStats(ref, 2.6, 1.6))
    expect(v.kind).toBe('ok')
    const noArray = setPartCount(ref, 'solar-large', 0)
    expect(powerVerdict(noArray, spacecraftStats(noArray, 2.6, 1.6)).kind).toBe('bad')
  })

  it('Earth–Mars distance on the reference arrival date is a planetary distance', () => {
    const d = earthMarsDistanceAU(REFERENCE_DESIGN.transfer!.arrJd)
    expect(d).toBeGreaterThan(0.4)
    expect(d).toBeLessThan(2.7)
    expect(earthMarsDistanceAU(jdFromIso('2027-08-20T00:00:00Z'))).toBeCloseTo(d, 10)
  })

  it('sums instrument data per turn', () => {
    expect(dataPerTurnGb(REFERENCE_SPACECRAFT)).toBe(180)
  })
})
