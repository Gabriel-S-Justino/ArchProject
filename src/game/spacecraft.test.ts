import { describe, expect, it } from 'vitest'
import { MU_MARS, R_MARS } from '@/physics/constants'
import { captureBurn } from '@/physics/orbit'
import { propellantFor } from '@/physics/rocket'
import { solarPowerW } from '@/physics/link'
import {
  BATTERY_COVER_HOURS,
  MARS_MEAN_DISTANCE_AU,
  REFERENCE_SPACECRAFT,
  spacecraftStats,
  type SpacecraftDesign,
  type SpacecraftStats,
} from './spacecraft'

function expectAllFinite(s: SpacecraftStats, label: string) {
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'number') expect(Number.isFinite(v), `${label}: ${k} = ${v}`).toBe(true)
  }
}

const minimal: SpacecraftDesign = {
  parts: { 'sc-core': 1, 'solar-small': 1, 'comms-hga': 1, 'inst-camera': 1, 'prop-monoprop': 1 },
  tcmReserveMs: 0,
}

describe('spacecraftStats', () => {
  it('MOI Δv at v∞ 2.65 km/s with no reserve is about 907 m/s (legacy capture test)', () => {
    const s = spacecraftStats(minimal, 2.65)
    expect(Math.abs(s.moiDvMs - 907)).toBeLessThanOrEqual(10)
  })

  it('MOI Δv does not depend on the engine Isp', () => {
    const bi = spacecraftStats({ ...minimal, parts: { ...minimal.parts, 'prop-monoprop': 0, 'prop-biprop': 1 } }, 2.65)
    expect(bi.moiDvMs).toBeCloseTo(spacecraftStats(minimal, 2.65).moiDvMs, 9)
  })

  it('propellant covers the capture burn plus the TCM reserve at the propulsion Isp', () => {
    const d: SpacecraftDesign = { ...minimal, tcmReserveMs: 50 }
    const s = spacecraftStats(d, 2.7)
    const dv = captureBurn(MU_MARS, R_MARS + 300e3, R_MARS + 33000e3, 2700) + 50
    expect(s.propellantKg).toBeCloseTo(propellantFor(dv, 230, s.dryKg), 6)
    expect(s.wetKg).toBeCloseTo(s.dryKg + s.propellantKg, 9)
    expect(s.errors).toEqual([])
  })

  it('a biprop system needs less propellant than a monoprop for the same burn (dry mass aside)', () => {
    const mono = spacecraftStats(minimal, 2.7)
    const bi = spacecraftStats({ ...minimal, parts: { ...minimal.parts, 'prop-monoprop': 0, 'prop-biprop': 1 } }, 2.7)
    expect(bi.propellantKg / bi.dryKg).toBeLessThan(mono.propellantKg / mono.dryKg)
  })

  it('sums dry mass, cost, science, storage, shielding and comms rate from the parts', () => {
    const s = spacecraftStats(
      {
        parts: {
          'sc-core': 1,
          'solar-small': 2,
          battery: 2,
          'comms-hga': 1,
          'comms-lga': 1,
          'inst-camera': 1,
          'inst-radar': 1,
          'storage-ssr': 1,
          'shield-radiation': 1,
          'prop-monoprop': 1,
        },
        tcmReserveMs: 0,
      },
      2.7,
    )
    expect(s.dryKg).toBeCloseTo(560 + 120 + 26 + 60 + 1.5 + 65 + 15 + 10 + 30 + 75, 9)
    expect(s.costM).toBeCloseTo(180 + 50 + 12 + 40 + 4 + 70 + 50 + 12 + 15 + 25, 9)
    expect(s.science).toBe(14)
    expect(s.storageGb).toBe(160)
    expect(s.shield).toBe(0.5)
    expect(s.batteryWh).toBe(3080)
    expect(s.rateMbpsAt1AU).toBeCloseTo(0.91, 9)
  })

  it('scales solar generation to the Mars distance and adds RTG output unscaled', () => {
    const d: SpacecraftDesign = { parts: { ...minimal.parts, rtg: 1 }, tcmReserveMs: 0 }
    expect(spacecraftStats(d, 2.7, 1.5).powerGenAtMarsW).toBeCloseTo(solarPowerW(3200, 1.5) + 110, 9)
    // Default distance: Mars' mean distance from the Sun.
    expect(spacecraftStats(d, 2.7).powerGenAtMarsW).toBeCloseTo(solarPowerW(3200, MARS_MEAN_DISTANCE_AU) + 110, 9)
  })

  it('power load is every drawing part; batteryWh is reported as stored energy', () => {
    const s = spacecraftStats({ ...minimal, parts: { ...minimal.parts, battery: 1 } }, 2.7)
    expect(s.powerLoadW).toBeCloseTo(350 + 200 + 60 + 20, 9)
    expect(s.batteryWh).toBe(1540)
    expect(BATTERY_COVER_HOURS).toBe(4)
  })

  it('missing core part → errors non-empty', () => {
    const s = spacecraftStats({ ...minimal, parts: { ...minimal.parts, 'sc-core': 0 } }, 2.7)
    expect(s.errors.length).toBeGreaterThan(0)
    expect(s.errors.join(' ')).toMatch(/bus/i)
  })

  it('no propulsion part → "No propulsion system" error and zero propellant', () => {
    const s = spacecraftStats({ ...minimal, parts: { ...minimal.parts, 'prop-monoprop': 0 } }, 2.65)
    expect(s.errors).toContain('No propulsion system')
    expect(s.propellantKg).toBe(0)
    expect(s.wetKg).toBe(s.dryKg)
    expect(Math.abs(s.moiDvMs - 907)).toBeLessThanOrEqual(10)
  })

  it('two propulsion systems → error', () => {
    const s = spacecraftStats({ ...minimal, parts: { ...minimal.parts, 'prop-biprop': 1 } }, 2.7)
    expect(s.errors.some((e) => /one propulsion/i.test(e))).toBe(true)
    expectAllFinite(s, 'two propulsion')
  })

  it('more copies than a part allows, or an unknown part id → error', () => {
    expect(spacecraftStats({ ...minimal, parts: { ...minimal.parts, 'comms-hga': 2 } }, 2.7).errors.length).toBeGreaterThan(0)
    expect(spacecraftStats({ ...minimal, parts: { ...minimal.parts, 'warp-drive': 1 } }, 2.7).errors.length).toBeGreaterThan(0)
  })

  it('no arrival v∞ → MOI Δv 0, propellant only for the reserve, all finite', () => {
    const s = spacecraftStats({ ...minimal, tcmReserveMs: 50 }, null)
    expect(s.moiDvMs).toBe(0)
    expect(s.propellantKg).toBeCloseTo(propellantFor(50, 230, s.dryKg), 9)
    expectAllFinite(s, 'vInf null')
  })

  it('never returns NaN/Infinity: empty parts, junk counts, junk reserve and v∞', () => {
    const cases: [SpacecraftDesign, number | null][] = [
      [{ parts: {}, tcmReserveMs: 0 }, null],
      [{ parts: {}, tcmReserveMs: 0 }, 2.7],
      [{ parts: { 'sc-core': Number.NaN, 'prop-monoprop': Number.POSITIVE_INFINITY }, tcmReserveMs: Number.NaN }, Number.NaN],
      [{ parts: { 'sc-core': -3, 'prop-monoprop': 1 }, tcmReserveMs: 1e9 }, Number.POSITIVE_INFINITY],
      [{ ...minimal, tcmReserveMs: -20 }, -5],
      [{ parts: { 'sc-core': 1e308, 'prop-monoprop': 1 }, tcmReserveMs: 150 }, 1e200],
      [{ ...minimal, tcmReserveMs: 150 }, 1e5],
    ]
    for (const [d, v] of cases) expectAllFinite(spacecraftStats(d, v), JSON.stringify([d, v]))
  })

  it('clamps the TCM reserve to 0–150 m/s', () => {
    const hi = spacecraftStats({ ...minimal, tcmReserveMs: 1000 }, null)
    expect(hi.propellantKg).toBeCloseTo(propellantFor(150, 230, hi.dryKg), 9)
    expect(spacecraftStats({ ...minimal, tcmReserveMs: -50 }, null).propellantKg).toBe(0)
  })

  it('reference spacecraft is valid', () => {
    expect(spacecraftStats(REFERENCE_SPACECRAFT, 2.71).errors).toEqual([])
  })
})
