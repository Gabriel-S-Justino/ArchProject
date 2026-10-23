import { describe, expect, it } from 'vitest'
import { MISSION } from '@/data/mission'
import { presetById } from '@/data/presets'
import { capacityToC3, rocketStats } from '@/physics/launcher'
import { transferFor } from '@/physics/porkchop'
import { jdFromIso } from '@/physics/time'
import { REFERENCE_DESIGN, canLaunch, launchChecklist, type CheckItem, type MissionDesign } from './checklist'
import { spacecraftStats } from './spacecraft'

const item = (items: CheckItem[], id: CheckItem['id']) => {
  const found = items.find((i) => i.id === id)
  if (!found) throw new Error(`no check item ${id}`)
  return found
}

const withParts = (d: MissionDesign, parts: Record<string, number>): MissionDesign => ({
  ...d,
  spacecraft: { ...d.spacecraft, parts: { ...d.spacecraft.parts, ...parts } },
})

const ALL_IDS: CheckItem['id'][] = [
  'trajectory',
  'rocket-valid',
  'twr',
  'margin',
  'budget',
  'spacecraft',
  'power',
  'comms',
  'instruments',
  'propulsion',
]

describe('REFERENCE_DESIGN', () => {
  it('uses the real best transfer of the window (C3 ≈ 9.18 km²/s²) and the reference launcher', () => {
    expect(REFERENCE_DESIGN.transfer).not.toBeNull()
    const t = transferFor(REFERENCE_DESIGN.transfer!.depJd, REFERENCE_DESIGN.transfer!.arrJd)
    expect(t).not.toBeNull()
    expect(t!.c3).toBeCloseTo(9.18, 1)
    expect(REFERENCE_DESIGN.rocket).toEqual(presetById('reference')!.rocket)
    expect(REFERENCE_DESIGN.spacecraft.tcmReserveMs).toBe(50)
  })

  it('every checklist item is ok and canLaunch is true', () => {
    const items = launchChecklist(REFERENCE_DESIGN)
    expect(items.map((i) => i.id)).toEqual(ALL_IDS)
    for (const i of items) expect(i.ok, `${i.id}: ${i.detail}`).toBe(true)
    expect(canLaunch(REFERENCE_DESIGN)).toBe(true)
  })

  it('every item has a short label and a detail with numbers', () => {
    for (const i of launchChecklist(REFERENCE_DESIGN)) {
      expect(i.label.length).toBeGreaterThan(0)
      expect(i.label.length).toBeLessThanOrEqual(40)
      expect(i.detail.length).toBeGreaterThan(0)
    }
    const margin = item(launchChecklist(REFERENCE_DESIGN), 'margin')
    expect(margin.detail).toMatch(/kg/)
    expect(margin.detail).toMatch(/2,410 kg/)
  })
})

describe('launchChecklist', () => {
  it('transfer null → trajectory not ok, canLaunch false, no NaN in details', () => {
    const d: MissionDesign = { ...REFERENCE_DESIGN, transfer: null }
    const items = launchChecklist(d)
    expect(item(items, 'trajectory').ok).toBe(false)
    expect(item(items, 'margin').ok).toBe(false)
    expect(canLaunch(d)).toBe(false)
    for (const i of items) expect(i.detail, i.id).not.toMatch(/NaN|Infinity/)
  })

  it('dates with no Lambert transfer (TOF out of range) → trajectory not ok', () => {
    const dep = REFERENCE_DESIGN.transfer!.depJd
    const d: MissionDesign = { ...REFERENCE_DESIGN, transfer: { depJd: dep, arrJd: dep + 20 } }
    expect(item(launchChecklist(d), 'trajectory').ok).toBe(false)
    expect(canLaunch(d)).toBe(false)
  })

  it('a higher-C3 transfer flips margin to not ok, and back again (pure recompute, no cache)', () => {
    const hot: MissionDesign = {
      ...REFERENCE_DESIGN,
      transfer: { depJd: jdFromIso('2026-12-15T00:00:00Z'), arrJd: jdFromIso('2027-08-20T00:00:00Z') },
    }
    const t = transferFor(hot.transfer!.depJd, hot.transfer!.arrJd)!
    const wet = spacecraftStats(hot.spacecraft, t.vInfArrKms).wetKg
    expect(wet).toBeGreaterThan(0.9 * capacityToC3(hot.rocket, t.c3))

    expect(item(launchChecklist(REFERENCE_DESIGN), 'margin').ok).toBe(true)
    const hotItems = launchChecklist(hot)
    expect(item(hotItems, 'margin').ok).toBe(false)
    expect(item(hotItems, 'trajectory').ok).toBe(true)
    expect(canLaunch(hot)).toBe(false)
    expect(item(launchChecklist(REFERENCE_DESIGN), 'margin').ok).toBe(true)
    expect(canLaunch(REFERENCE_DESIGN)).toBe(true)
  })

  it('adding mass to the spacecraft re-evaluates margin from the new wet mass', () => {
    // Twelve RTGs add 523 kg dry, which pushes wet mass past 90% of the 2,410 kg capacity.
    const heavy = withParts(REFERENCE_DESIGN, { rtg: 12 })
    expect(item(launchChecklist(heavy), 'margin').ok).toBe(false)
  })

  it('cost over MISSION.budgetM → budget not ok, detail shows both numbers', () => {
    const d = withParts(REFERENCE_DESIGN, { rtg: 3 })
    const sc = spacecraftStats(d.spacecraft, 2.7)
    const total = sc.costM + rocketStats(d.rocket, sc.wetKg).costM
    expect(total).toBeGreaterThan(MISSION.budgetM)
    const budget = item(launchChecklist(d), 'budget')
    expect(budget.ok).toBe(false)
    expect(budget.detail).toContain(`${Math.round(total)}`)
    expect(budget.detail).toContain('900')
    expect(canLaunch(d)).toBe(false)
  })

  it('power: instrument load above generation at Mars + battery coverage → power not ok', () => {
    // RTG only (110 W) and one battery (1,540 Wh / 4 h = 385 W) against bus + every instrument.
    const d = withParts(REFERENCE_DESIGN, {
      'solar-large': 0,
      rtg: 1,
      battery: 1,
      'inst-camera': 1,
      'inst-spectrometer': 1,
      'inst-radar': 1,
      'inst-magnetometer': 1,
    })
    const power = item(launchChecklist(d), 'power')
    expect(power.ok).toBe(false)
    expect(power.detail).toMatch(/W/)
    expect(canLaunch(d)).toBe(false)
  })

  it('missing bus → spacecraft not ok', () => {
    const d = withParts(REFERENCE_DESIGN, { 'sc-core': 0 })
    expect(item(launchChecklist(d), 'spacecraft').ok).toBe(false)
    expect(canLaunch(d)).toBe(false)
  })

  it('no comms, no instruments, no propulsion → each item fails', () => {
    const noComms = withParts(REFERENCE_DESIGN, { 'comms-hga': 0, 'comms-lga': 0 })
    expect(item(launchChecklist(noComms), 'comms').ok).toBe(false)
    const noInst = withParts(REFERENCE_DESIGN, { 'inst-camera': 0, 'inst-spectrometer': 0, 'inst-radar': 0 })
    expect(item(launchChecklist(noInst), 'instruments').ok).toBe(false)
    const noProp = withParts(REFERENCE_DESIGN, { 'prop-monoprop': 0 })
    expect(item(launchChecklist(noProp), 'propulsion').ok).toBe(false)
    expect(canLaunch(noProp)).toBe(false)
  })

  it('an invalid rocket → rocket-valid and margin not ok', () => {
    const d: MissionDesign = { ...REFERENCE_DESIGN, rocket: { stages: [], fairing: 'large' } }
    const items = launchChecklist(d)
    expect(item(items, 'rocket-valid').ok).toBe(false)
    expect(item(items, 'margin').ok).toBe(false)
    for (const i of items) expect(i.detail, i.id).not.toMatch(/NaN|Infinity/)
  })

  it('a rocket too weak to lift off → twr not ok', () => {
    const ref = REFERENCE_DESIGN.rocket
    const weak: MissionDesign = {
      ...REFERENCE_DESIGN,
      rocket: { ...ref, stages: [{ ...ref.stages[0]!, tanks: [...ref.stages[0]!.tanks, ...ref.stages[0]!.tanks] }, ref.stages[1]!] },
    }
    expect(item(launchChecklist(weak), 'twr').ok).toBe(false)
  })

  it('empty spacecraft and null transfer: no NaN/Infinity anywhere', () => {
    const d: MissionDesign = { transfer: null, rocket: { stages: [], fairing: 'small' }, spacecraft: { parts: {}, tcmReserveMs: 0 } }
    const items = launchChecklist(d)
    expect(items.map((i) => i.id)).toEqual(ALL_IDS)
    for (const i of items) expect(i.detail, i.id).not.toMatch(/NaN|Infinity/)
    expect(canLaunch(d)).toBe(false)
  })
})
