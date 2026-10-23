import { describe, expect, it } from 'vitest'
import { bodyState } from '@/physics/ephemeris'
import { transferFor } from '@/physics/porkchop'
import { norm, sub } from '@/physics/vec'
import { REFERENCE_DESIGN } from './checklist'
import {
  TCM_WINDOWS,
  advanceCruise,
  applyTcm,
  arrive,
  nextTcmWindow,
  predictArrival,
  startCruise,
  tcmCost,
  tcmQuote,
  type CruiseState,
} from './cruise'
import { spacecraftStats } from './spacecraft'

const ZERO = { injectionErrorMs: [0, 0, 0] as [number, number, number] }
const transfer = transferFor(REFERENCE_DESIGN.transfer!.depJd, REFERENCE_DESIGN.transfer!.arrJd)!
const tofDays = transfer.tofDays

/** Every number in the state is finite (no NaN/Infinity leaks, Review Focus 4). */
function expectFinite(c: CruiseState) {
  const nums = [
    c.jd,
    c.arrJd,
    c.depJd,
    c.propellantKg,
    c.dryKg,
    c.ispS,
    c.cruiseScience,
    c.safeModeDays,
    c.shield,
    c.batteryWh,
    ...c.ship.r,
    ...c.ship.v,
    ...c.injectionErrorMs,
    ...c.tcms.flatMap((t) => [t.jd, t.dvMs]),
  ]
  for (const n of nums) expect(Number.isFinite(n)).toBe(true)
}

describe('startCruise', () => {
  it('starts at Earth on the departure date with the Lambert v1 plus the injection error', () => {
    const c = startCruise(REFERENCE_DESIGN, 1, ZERO)
    expect(c.jd).toBe(transfer.depJd)
    expect(c.arrJd).toBe(transfer.arrJd)
    expect(norm(sub(c.ship.r, bodyState('earth', c.jd).r))).toBeLessThan(1)
    expect(norm(sub(c.ship.v, transfer.v1))).toBeLessThan(1e-9)
    const s = spacecraftStats(REFERENCE_DESIGN.spacecraft, transfer.vInfArrKms)
    expect(c.propellantKg).toBeCloseTo(s.propellantKg, 6)
    expect(c.dryKg).toBe(s.dryKg)
    expect(c.ispS).toBe(230)
    expect(c.tcms).toEqual([])
    expect(c.events).toEqual([])
    expect(c.damaged).toEqual([])
    expect(c.instruments.sort()).toEqual(['inst-camera', 'inst-radar', 'inst-spectrometer'])
    expectFinite(c)
  })

  it('draws a seeded injection error of a few m/s (N(0, 2 m/s) per axis), deterministic per seed', () => {
    const a = startCruise(REFERENCE_DESIGN, 1)
    const b = startCruise(REFERENCE_DESIGN, 1)
    const other = startCruise(REFERENCE_DESIGN, 2)
    expect(a.injectionErrorMs).toEqual(b.injectionErrorMs)
    expect(a.injectionErrorMs).not.toEqual(other.injectionErrorMs)
    expect(norm(a.injectionErrorMs)).toBeGreaterThan(0)
    expect(norm(a.injectionErrorMs)).toBeLessThan(20)
    expect(norm(sub(a.ship.v, transfer.v1))).toBeCloseTo(norm(a.injectionErrorMs), 6)
    // Spread over many seeds: sample standard deviation per axis ≈ 2 m/s.
    const xs: number[] = []
    for (let s = 0; s < 400; s++) xs.push(...startCruise(REFERENCE_DESIGN, s).injectionErrorMs)
    const mean = xs.reduce((p, x) => p + x, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((p, x) => p + (x - mean) ** 2, 0) / xs.length)
    expect(Math.abs(mean)).toBeLessThan(0.3)
    expect(sd).toBeGreaterThan(1.7)
    expect(sd).toBeLessThan(2.3)
  })

  it('schedules 2–3 flare events from the seed', () => {
    const c = startCruise(REFERENCE_DESIGN, 1)
    expect(c.schedule.length).toBeGreaterThanOrEqual(2)
    expect(c.schedule.length).toBeLessThanOrEqual(3)
    expect(startCruise(REFERENCE_DESIGN, 1).schedule).toEqual(c.schedule)
  })
})

describe('arrival with a perfect injection', () => {
  it('captures, with an MOI Δv within 5% of the spacecraft budget', () => {
    const c = startCruise(REFERENCE_DESIGN, 1, ZERO)
    const p = predictArrival(c)
    expect(p.missKm).toBeLessThan(1000)
    expect(p.vInfKms).toBeCloseTo(transfer.vInfArrKms, 3)
    const r = arrive(c)
    const s = spacecraftStats(REFERENCE_DESIGN.spacecraft, transfer.vInfArrKms)
    expect(r.captured).toBe(true)
    expect(r.reason).toBeUndefined()
    expect(Math.abs(r.moiDvMs - s.moiDvMs) / s.moiDvMs).toBeLessThan(0.05)
    expect(r.propellantLeftKg).toBeGreaterThan(0)
    expect(r.propellantLeftKg).toBeLessThan(c.propellantKg)
  })
})

describe('trajectory correction maneuvers', () => {
  const c0 = startCruise(REFERENCE_DESIGN, 1)

  it('TCM_WINDOWS are exactly the brief', () => {
    expect(TCM_WINDOWS).toEqual([
      { id: 'TCM-1', dayAfterLaunch: 15 },
      { id: 'TCM-2', dayAfterLaunch: 60 },
      { id: 'TCM-3', daysBeforeArrival: 30 },
    ])
  })

  it('the seeded injection error misses Mars by more than 10,000 km without TCMs', () => {
    expect(predictArrival(c0).missKm).toBeGreaterThan(10_000)
    const r = arrive(c0)
    expect(r.captured).toBe(false)
    expect(r.reason).toBe('miss')
    expect(r.propellantLeftKg).toBe(c0.propellantKg)
  })

  it('an early TCM is cheaper than a late one for the same error', () => {
    const c1 = advanceCruise(c0, 15)
    const c3 = advanceCruise(c0, tofDays - 30)
    const cost1 = tcmCost(c1)
    const cost3 = tcmCost(c3)
    expect(Number.isFinite(cost1)).toBe(true)
    expect(Number.isFinite(cost3)).toBe(true)
    expect(cost1).toBeGreaterThan(0)
    expect(cost1).toBeLessThan(cost3)
  })

  it('applying TCM-1 brings the predicted miss below 10,000 km and spends propellant', () => {
    const c1 = advanceCruise(c0, 15)
    const after = applyTcm(c1)
    if ('error' in after) throw new Error(after.error)
    expect(predictArrival(after).missKm).toBeLessThan(10_000)
    expect(after.tcms).toHaveLength(1)
    expect(after.tcms[0]!.jd).toBe(c1.jd)
    expect(after.tcms[0]!.dvMs).toBeCloseTo(tcmCost(c1), 9)
    expect(after.propellantKg).toBeLessThan(c1.propellantKg)
    expect(after.propellantKg).toBeGreaterThan(0)
    expect(tcmCost(after)).toBeLessThan(0.01)
    // Input untouched.
    expect(c1.tcms).toHaveLength(0)
    expect(arrive(after).captured).toBe(true)
    expectFinite(after)
  })

  it('stays cheap where the ~196° reference arc passes 180° from Mars (TCM-1), then TCM-2 hits Mars', () => {
    // Out-of-plane error only: the worst case for a near-180° Lambert solve (plain Lambert ≈ 750 m/s).
    const z = startCruise(REFERENCE_DESIGN, 1, { injectionErrorMs: [0, 0, 2] })
    for (const day of [10, 14, 15, 16, 20]) expect(tcmCost(advanceCruise(z, day))).toBeLessThan(15)
    const t1 = applyTcm(advanceCruise(c0, 15))
    if ('error' in t1) throw new Error(t1.error)
    const t2 = applyTcm(advanceCruise(t1, 45))
    if ('error' in t2) throw new Error(t2.error)
    expect(t2.tcms[1]!.dvMs).toBeLessThan(5)
    expect(predictArrival(t2).missKm).toBeLessThan(1)
    expect(arrive(t2).captured).toBe(true)
  })

  it('tcmQuote offers an unaffordable TCM as disabled with a reason', () => {
    const c1 = advanceCruise(c0, 15)
    const ok = tcmQuote(c1)
    expect(ok.available).toBe(true)
    expect(ok.propellantKg).toBeGreaterThan(0)
    const broke = tcmQuote({ ...c1, propellantKg: 0 })
    expect(broke.available).toBe(false)
    expect(broke.reason).toMatch(/propellant/i)
  })

  it('nextTcmWindow walks TCM-1 → TCM-2 → TCM-3 → null', () => {
    expect(nextTcmWindow(c0)).toEqual({ id: 'TCM-1', jd: c0.depJd + 15 })
    const at1 = advanceCruise(c0, 15)
    expect(nextTcmWindow(at1)).toEqual({ id: 'TCM-2', jd: c0.depJd + 60 })
    const at2 = advanceCruise(at1, 45)
    expect(nextTcmWindow(at2)).toEqual({ id: 'TCM-3', jd: c0.arrJd - 30 })
    const at3 = advanceCruise(c0, tofDays - 30)
    expect(nextTcmWindow(at3)).toBeNull()
  })
})

describe('advanceCruise', () => {
  const c0 = startCruise(REFERENCE_DESIGN, 1, ZERO)

  it('never advances past arrival and does not mutate its input', () => {
    const before = JSON.stringify(c0)
    const end = advanceCruise(c0, 10_000)
    expect(end.jd).toBe(c0.arrJd)
    expect(JSON.stringify(c0)).toBe(before)
    expect(norm(sub(end.ship.r, bodyState('mars', c0.arrJd).r)) / 1000).toBeLessThan(1000)
    expect(advanceCruise(end, 1).jd).toBe(c0.arrJd)
  })

  it('stepping one day at a time matches one long step', () => {
    let c = c0
    for (let i = 0; i < 30; i++) c = advanceCruise(c, 1)
    const once = advanceCruise(c0, 30)
    expect(c.jd).toBeCloseTo(once.jd, 9)
    expect(norm(sub(c.ship.r, once.ship.r))).toBeLessThan(1)
  })

  it('ignores zero, negative and non-finite steps', () => {
    for (const d of [0, -5, NaN, Infinity]) {
      const c = advanceCruise(c0, d)
      expect(c.jd).toBe(c0.jd)
      expectFinite(c)
    }
  })
})

describe('running out of propellant (Review Focus 4)', () => {
  it('applyTcm reports insufficient propellant and arrival is a flyby, without throwing', () => {
    const c1 = advanceCruise(startCruise(REFERENCE_DESIGN, 1), 15)
    const empty = { ...c1, propellantKg: 0 }
    expect(applyTcm(empty)).toEqual({ error: 'insufficient-propellant' })
    const r = arrive(empty)
    expect(r.captured).toBe(false)
    expect(['propellant', 'miss']).toContain(r.reason)
    for (const n of [r.vInfKms, r.moiDvMs, r.propellantLeftKg, r.missKm]) expect(Number.isFinite(n)).toBe(true)
  })

  it('a perfect injection with an empty tank flies by for lack of propellant', () => {
    const empty = { ...startCruise(REFERENCE_DESIGN, 1, ZERO), propellantKg: 0 }
    const r = arrive(empty)
    expect(r.captured).toBe(false)
    expect(r.reason).toBe('propellant')
    expect(r.propellantLeftKg).toBe(0)
  })

  it('tcmCost is Infinity, not NaN, when no Lambert arc exists (at arrival)', () => {
    const end = advanceCruise(startCruise(REFERENCE_DESIGN, 1), 10_000)
    expect(tcmCost(end)).toBe(Infinity)
    expect(applyTcm(end)).toEqual({ error: 'insufficient-propellant' })
  })
})
