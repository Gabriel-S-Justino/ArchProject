import { describe, expect, it } from 'vitest'
import { DONKI_FLARES } from '@/data/donki'
import { REFERENCE_DESIGN, type MissionDesign } from './checklist'
import { startCruise } from './cruise'
import { EVENT_RULES, eventOptions, resolveEvent, scheduleEvents, type CruiseEvent } from './events'
import { createRng } from './rng'

const withParts = (d: MissionDesign, parts: Record<string, number>): MissionDesign => ({
  ...d,
  spacecraft: { ...d.spacecraft, parts: { ...d.spacecraft.parts, ...parts } },
})

const flareOf = (cls: 'M' | 'X') => DONKI_FLARES.find((f) => f.classType.startsWith(cls))!
const moderate: CruiseEvent = { id: 'EV-1', day: 40, flare: flareOf('M'), severity: 'moderate' }
const severe: CruiseEvent = { id: 'EV-2', day: 120, flare: flareOf('X'), severity: 'severe' }

/** An rng that returns the given values in turn (then repeats the last). */
const fixed = (...xs: number[]) => {
  let i = 0
  return () => xs[Math.min(i++, xs.length - 1)]!
}

describe('EVENT_RULES (game balance)', () => {
  it('carries the brief values', () => {
    expect(EVENT_RULES.baseRisk).toEqual({ moderate: 0.15, severe: 0.4 })
    expect(EVENT_RULES.safeModeRisk).toBe(0.02)
    expect(EVENT_RULES.safeModeDays).toBe(5)
    expect(EVENT_RULES.safeModeMinBatteryWh).toBe(300)
    expect(EVENT_RULES.shieldAttitudeFactor).toBe(0.5)
    expect(EVENT_RULES.shieldAttitudeDvMs).toBe(2)
    expect(EVENT_RULES.observeScience).toEqual({ moderate: 2, severe: 4 })
  })
})

describe('scheduleEvents', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(scheduleEvents(7, 300)).toEqual(scheduleEvents(7, 300))
    const many = new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(scheduleEvents(s, 300))))
    expect(many.size).toBeGreaterThan(10)
  })

  it('draws 2–3 real DONKI flares, ≥ 20 days apart, not in the first 10 days, before arrival', () => {
    const counts = new Set<number>()
    for (let seed = 0; seed < 200; seed++) {
      for (const tof of [100, 200, 300, 500]) {
        const ev = scheduleEvents(seed, tof)
        counts.add(ev.length)
        expect(ev.length).toBeGreaterThanOrEqual(2)
        expect(ev.length).toBeLessThanOrEqual(3)
        expect(new Set(ev.map((e) => e.flare.id)).size).toBe(ev.length)
        expect(new Set(ev.map((e) => e.id)).size).toBe(ev.length)
        for (let i = 0; i < ev.length; i++) {
          const e = ev[i]!
          expect(Number.isInteger(e.day)).toBe(true)
          expect(e.day).toBeGreaterThanOrEqual(10)
          expect(e.day).toBeLessThan(tof)
          if (i > 0) expect(e.day - ev[i - 1]!.day).toBeGreaterThanOrEqual(20)
          expect(DONKI_FLARES).toContain(e.flare)
          expect(e.severity).toBe(e.flare.classType.startsWith('X') ? 'severe' : 'moderate')
        }
      }
    }
    expect(counts).toEqual(new Set([2, 3]))
  })

  it('returns no events for a cruise too short to hold them', () => {
    expect(scheduleEvents(1, 5)).toEqual([])
    expect(scheduleEvents(1, NaN)).toEqual([])
  })
})

describe('eventOptions', () => {
  it('offers all three options on the reference design with brief risks', () => {
    const opts = eventOptions(moderate, REFERENCE_DESIGN)
    expect(opts.map((o) => o.id)).toEqual(['safe-mode', 'keep-observing', 'shield-attitude'])
    for (const o of opts) {
      expect(o.available).toBe(true)
      expect(o.label.length).toBeGreaterThan(0)
      expect(o.cost.length).toBeGreaterThan(0)
    }
    // Reference spacecraft carries shield-radiation (0.5).
    expect(opts[0]!.risk).toBe(0.02)
    expect(opts[1]!.risk).toBeCloseTo(0.15 * 0.5, 12)
    expect(opts[2]!.risk).toBeCloseTo(0.15 * 0.5 * 0.5, 12)
    expect(eventOptions(severe, withParts(REFERENCE_DESIGN, { 'shield-radiation': 0 }))[1]!.risk).toBeCloseTo(0.4, 12)
  })

  it('makes safe mode unavailable with a reason when the battery is under 300 Wh', () => {
    const noBattery = withParts(REFERENCE_DESIGN, { battery: 0 })
    const safe = eventOptions(moderate, noBattery).find((o) => o.id === 'safe-mode')!
    expect(safe.available).toBe(false)
    expect(safe.reason).toMatch(/battery/i)
    expect(safe.reason).toMatch(/300 Wh/)
  })

  it('makes shield attitude unavailable when propellant cannot cover 2 m/s', () => {
    const c = { ...startCruise(REFERENCE_DESIGN, 1), propellantKg: 0 }
    const sa = eventOptions(moderate, REFERENCE_DESIGN, c).find((o) => o.id === 'shield-attitude')!
    expect(sa.available).toBe(false)
    expect(sa.reason).toMatch(/propellant/i)
  })
})

describe('resolveEvent', () => {
  const c0 = startCruise(REFERENCE_DESIGN, 1)

  it('is deterministic for the same rng seed and does not mutate the input', () => {
    const before = JSON.stringify(c0)
    for (const id of ['safe-mode', 'keep-observing', 'shield-attitude'] as const) {
      const a = resolveEvent(c0, severe, id, createRng(42))
      const b = resolveEvent(c0, severe, id, createRng(42))
      expect(a).toEqual(b)
      expect(a.state.events).toHaveLength(1)
      expect(a.state.events[0]!.optionId).toBe(id)
      expect(a.state.events[0]!.outcome).toBe(a.outcome)
    }
    expect(JSON.stringify(c0)).toBe(before)
  })

  it('keep-observing without damage earns +2 (moderate) / +4 (severe) cruise science', () => {
    const m = resolveEvent(c0, moderate, 'keep-observing', fixed(0.99))
    expect(m.state.cruiseScience).toBe(c0.cruiseScience + 2)
    expect(m.state.events[0]!.damaged).toBeNull()
    const s = resolveEvent(c0, severe, 'keep-observing', fixed(0.99))
    expect(s.state.cruiseScience).toBe(c0.cruiseScience + 4)
  })

  it('damage disables one fitted instrument and earns no science', () => {
    const r = resolveEvent(c0, severe, 'keep-observing', fixed(0, 0.5))
    expect(r.state.cruiseScience).toBe(c0.cruiseScience)
    const hit = r.state.events[0]!.damaged
    expect(hit).not.toBeNull()
    expect(c0.instruments).toContain(hit)
    expect(r.state.damaged).toEqual([hit])
    expect(r.outcome).toMatch(/damage/i)
  })

  it('says "no further damage" when every instrument is already damaged', () => {
    const allDown = { ...c0, damaged: [...c0.instruments] }
    const r = resolveEvent(allDown, severe, 'keep-observing', fixed(0))
    expect(r.state.events[0]!.damaged).toBeNull()
    expect(r.state.damaged).toEqual(c0.instruments)
    expect(r.outcome).toMatch(/no further damage/i)
  })

  it('safe mode adds 5 safe-mode days; shield attitude spends 2 m/s of propellant', () => {
    const safe = resolveEvent(c0, moderate, 'safe-mode', fixed(0.99))
    expect(safe.state.safeModeDays).toBe(c0.safeModeDays + 5)
    expect(safe.state.cruiseScience).toBe(c0.cruiseScience)
    const sa = resolveEvent(c0, moderate, 'shield-attitude', fixed(0.99))
    expect(sa.state.propellantKg).toBeLessThan(c0.propellantKg)
    const m0 = c0.dryKg + c0.propellantKg
    expect(c0.propellantKg - sa.state.propellantKg).toBeCloseTo(m0 * (1 - Math.exp(-2 / (230 * 9.80665))), 9)
  })

  it('refuses an unavailable option and an already-resolved event without changing state', () => {
    const empty = { ...c0, propellantKg: 0 }
    const r = resolveEvent(empty, moderate, 'shield-attitude', fixed(0.99))
    expect(r.state).toBe(empty)
    const once = resolveEvent(c0, moderate, 'keep-observing', fixed(0.99)).state
    const twice = resolveEvent(once, moderate, 'keep-observing', fixed(0.99))
    expect(twice.state).toBe(once)
  })
})
