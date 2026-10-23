import { describe, expect, it } from 'vitest'
import { REFERENCE_SPACECRAFT, type SpacecraftDesign } from '@/game/spacecraft'
import { SOLAR_W_PER_M2, describeSpacecraft, spacecraftLayout } from './spacecraftLayout'

const design = (parts: Record<string, number>): SpacecraftDesign => ({ parts, tcmReserveMs: 50 })

describe('spacecraftLayout', () => {
  it('lays out the reference orbiter', () => {
    const L = spacecraftLayout(REFERENCE_SPACECRAFT)
    expect(L.bus).toBe(true)
    expect(L.wings).toHaveLength(2)
    expect(L.solarAreaM2).toBeCloseTo(20)
    expect(L.dish?.diameter).toBe(3)
    expect(L.lga).toBe(true)
    expect(L.laser).toBe(false)
    expect(L.rtgs).toBe(0)
    expect(L.instruments.map((i) => i.kind).sort()).toEqual(['camera', 'radar', 'spectrometer'])
    expect(L.nozzle?.kind).toBe('monoprop')
    expect(L.radius).toBeGreaterThan(5)
  })

  it('sizes the wings by array power (area ∝ W)', () => {
    const one = spacecraftLayout(design({ 'sc-core': 1, 'solar-small': 1 }))
    const two = spacecraftLayout(design({ 'sc-core': 1, 'solar-small': 2 }))
    expect(one.solarAreaM2).toBeCloseTo(3200 / SOLAR_W_PER_M2)
    expect(two.solarAreaM2).toBeCloseTo(2 * one.solarAreaM2)
    expect(two.wings[0]!.span).toBeCloseTo(2 * one.wings[0]!.span)
    expect(one.wings[0]!.span * one.wings[0]!.chord * 2).toBeCloseTo(one.solarAreaM2)
    expect(one.wings.map((w) => w.side)).toEqual([-1, 1])
    expect(two.wings[0]!.panels).toBeGreaterThan(one.wings[0]!.panels)
  })

  it('has no wings without solar arrays, an RTG fin per generator, and a laser terminal when fitted', () => {
    const L = spacecraftLayout(design({ 'sc-core': 1, rtg: 2, 'comms-optical': 1, 'prop-biprop': 1 }))
    expect(L.wings).toHaveLength(0)
    expect(L.rtgs).toBe(2)
    expect(L.laser).toBe(true)
    expect(L.dish).toBeNull()
    expect(L.nozzle?.kind).toBe('biprop')
  })

  it('a bipropellant engine has a bigger nozzle than the hydrazine thrusters', () => {
    const mono = spacecraftLayout(design({ 'prop-monoprop': 1 })).nozzle!
    const bi = spacecraftLayout(design({ 'prop-biprop': 1 })).nozzle!
    expect(bi.exitDiameter).toBeGreaterThan(mono.exitDiameter)
    expect(bi.length).toBeGreaterThan(mono.length)
  })

  it('marks damaged instruments, ignores unknown parts and bad counts', () => {
    const L = spacecraftLayout(design({ 'inst-camera': 1, 'inst-radar': 1, nope: 3, 'solar-large': NaN, 'inst-magnetometer': -1 }), ['inst-camera'])
    expect(L.bus).toBe(false)
    expect(L.wings).toHaveLength(0)
    expect(L.instruments).toHaveLength(2)
    expect(L.instruments.find((i) => i.kind === 'camera')!.damaged).toBe(true)
    expect(L.instruments.find((i) => i.kind === 'radar')!.damaged).toBe(false)
  })

  it('describes the model in words', () => {
    const s = describeSpacecraft(spacecraftLayout(REFERENCE_SPACECRAFT, ['inst-radar']))
    expect(s).toContain('3 m high-gain dish')
    expect(s).toContain('3 instruments, 1 damaged')
    expect(describeSpacecraft(spacecraftLayout(design({})))).toContain('no bus')
  })
})
