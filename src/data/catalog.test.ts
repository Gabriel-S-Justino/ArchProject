import { describe, expect, it } from 'vitest'
import { BOOSTERS } from './boosters'
import { DONKI_FLARES, DONKI_META } from './donki'
import { ENGINES } from './engines'
import { LSP_ANCHORS, LSP_CURVES, lspPayloadKg } from './lsp'
import { MISSION } from './mission'
import { PRESET_REFERENCE } from './presetReference'
import { REAL_MISSIONS } from './realMissions'
import { DATA_SOURCES } from './sources'
import { SPACECRAFT_PARTS } from './spacecraftParts'
import { TANKS } from './tanks'

/** Collects every numeric leaf (with its path) of a plain object/array. */
function numbers(value: unknown, path = ''): [string, number][] {
  if (typeof value === 'number') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((v, i) => numbers(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbers(v, path ? `${path}.${k}` : k))
  }
  return []
}

const sum = (ids: string[], key: 'costM' | 'massKg') =>
  ids.reduce((s, id) => s + (SPACECRAFT_PARTS.find((p) => p.id === id)?.[key] ?? NaN), 0)

describe('provenance', () => {
  it('every engine, booster, LSP curve, real mission and preset reference has a source', () => {
    for (const item of [...ENGINES, ...BOOSTERS, ...LSP_CURVES, ...REAL_MISSIONS, ...PRESET_REFERENCE]) {
      expect(item.source.trim().length, JSON.stringify(item)).toBeGreaterThan(0)
    }
  })

  it('every tank and spacecraft part says where its numbers come from', () => {
    for (const item of [...TANKS, ...SPACECRAFT_PARTS]) {
      expect(item.source?.trim().length ?? 0, item.id).toBeGreaterThan(0)
    }
  })

  it('LSP curves and real missions carry a URL', () => {
    for (const item of [...LSP_CURVES, ...REAL_MISSIONS]) expect(item.url).toMatch(/^https?:\/\//)
  })

  it('DATA_SOURCES covers every data file plus Horizons, with dates', () => {
    const ids = DATA_SOURCES.map((s) => s.id)
    for (const id of [
      'horizons',
      'porkchop-validation',
      'donki',
      'engines',
      'tanks',
      'boosters',
      'lsp',
      'preset-reference',
      'spacecraft-parts',
      'mission',
      'real-missions',
      'textures',
    ]) {
      expect(ids.some((x) => x === id || x.startsWith(`${id}-`)), id).toBe(true)
    }
    for (const s of DATA_SOURCES) {
      expect(s.title && s.provider && s.usedFor, s.id).toBeTruthy()
      expect(s.url, s.id).toMatch(/^https?:\/\//)
      expect(s.fetched, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('catalog integrity', () => {
  it('ids are unique across all catalogs', () => {
    const ids = [
      ...ENGINES,
      ...TANKS,
      ...BOOSTERS,
      ...SPACECRAFT_PARTS,
      ...PRESET_REFERENCE,
      ...REAL_MISSIONS,
    ].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every number is finite and positive where physical', () => {
    for (const e of ENGINES) {
      for (const [k, v] of numbers(e)) expect(Number.isFinite(v), `${e.id}.${k}`).toBe(true)
      for (const v of [e.thrustVac, e.ispVac, e.massKg, e.costM]) expect(v).toBeGreaterThan(0)
      // Vacuum-only engines (RL10, MVac) cannot fire at sea level: both SL values are exactly 0.
      if (e.thrustSL === 0 || e.ispSL === 0) {
        expect([e.thrustSL, e.ispSL], e.id).toEqual([0, 0])
      } else {
        expect(e.thrustSL).toBeLessThan(e.thrustVac)
        expect(e.ispSL).toBeLessThan(e.ispVac)
      }
    }
    for (const x of [...TANKS, ...BOOSTERS, ...REAL_MISSIONS]) {
      for (const [k, v] of numbers(x)) {
        expect(Number.isFinite(v), `${x.id}.${k}`).toBe(true)
        expect(v, `${x.id}.${k}`).toBeGreaterThan(0)
      }
    }
    for (const p of SPACECRAFT_PARTS) {
      for (const [k, v] of numbers(p)) expect(Number.isFinite(v), `${p.id}.${k}`).toBe(true)
      expect(p.massKg, p.id).toBeGreaterThan(0)
      expect(p.costM, p.id).toBeGreaterThan(0)
    }
    for (const r of PRESET_REFERENCE) {
      for (const [k, v] of numbers(r)) {
        expect(Number.isFinite(v), `${r.id}.${k}`).toBe(true)
        expect(v, `${r.id}.${k}`).toBeGreaterThan(0)
      }
    }
  })

  it('engines cover the required families with the right propellants', () => {
    const prop = (id: string) => ENGINES.find((e) => e.id === id)?.propellant
    expect(prop('rd-180')).toBe('kerolox')
    expect(prop('merlin-1d')).toBe('kerolox')
    expect(prop('merlin-vac')).toBe('kerolox')
    expect(prop('rs-25')).toBe('hydrolox')
    expect(prop('rl10c-1')).toBe('hydrolox')
    expect(prop('be-4')).toBe('methalox')
  })

  it('generic tank dry fractions stay in the brief ranges and the brief grid exists', () => {
    const range = { kerolox: [0.05, 0.07], hydrolox: [0.1, 0.12], methalox: [0.06, 0.08] } as const
    for (const t of TANKS.filter((x) => !x.referenceStageId)) {
      const f = t.dryKg / t.propellantKg
      expect(f, t.id).toBeGreaterThanOrEqual(range[t.propellant][0] - 1e-9)
      expect(f, t.id).toBeLessThanOrEqual(range[t.propellant][1] + 1e-9)
    }
    for (const d of [3.7, 5.4]) {
      for (const p of ['kerolox', 'hydrolox', 'methalox'] as const) {
        const family = TANKS.filter((t) => t.diameterM === d && t.propellant === p)
        expect(family.length, `${d} m ${p}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('reference tanks match their real stage: propellant and tank + engines dry mass within 5%', () => {
    const refTanks = TANKS.filter((t) => t.referenceStageId)
    expect(refTanks.length).toBeGreaterThan(0)
    for (const t of refTanks) {
      const ref = PRESET_REFERENCE.find((r) => r.id === t.referenceStageId)
      expect(ref, t.id).toBeDefined()
      const engine = ENGINES.find((e) => e.id === ref!.engineId)
      expect(engine, t.id).toBeDefined()
      expect(t.propellant, t.id).toBe(ref!.propellant)
      expect(Math.abs(t.propellantKg - ref!.propellantKg!) / ref!.propellantKg!, t.id).toBeLessThanOrEqual(0.05)
      const dry = t.dryKg + engine!.massKg * (ref!.engineCount ?? 1)
      expect(Math.abs(dry - ref!.dryKg) / ref!.dryKg, t.id).toBeLessThanOrEqual(0.05)
    }
  })

  it('every liquid reference stage can be built from one catalog tank plus its engines', () => {
    for (const ref of PRESET_REFERENCE.filter((r) => r.engineId)) {
      const engine = ENGINES.find((e) => e.id === ref.engineId)!
      const engineKg = engine.massKg * (ref.engineCount ?? 1)
      const match = TANKS.find(
        (t) =>
          t.propellant === ref.propellant &&
          Math.abs(t.propellantKg - ref.propellantKg!) / ref.propellantKg! <= 0.05 &&
          Math.abs(t.dryKg + engineKg - ref.dryKg) / ref.dryKg <= 0.05,
      )
      expect(match, ref.id).toBeDefined()
    }
  })

  it('preset references resolve to catalog parts and cover every LSP curve', () => {
    for (const ref of PRESET_REFERENCE) {
      if (ref.engineId) expect(ENGINES.some((e) => e.id === ref.engineId), ref.id).toBe(true)
      if (ref.boosterId) expect(BOOSTERS.some((b) => b.id === ref.boosterId), ref.id).toBe(true)
      expect(LSP_CURVES.some((c) => c.presetId === ref.presetId), ref.id).toBe(true)
    }
    for (const c of LSP_CURVES) {
      const elements = PRESET_REFERENCE.filter((r) => r.presetId === c.presetId).map((r) => r.element)
      expect(elements, c.presetId).toContain('upper')
      expect(elements, c.presetId).toContain('fairing')
      expect(elements.includes('core') || elements.includes('booster'), c.presetId).toBe(true)
    }
  })

  it('solid boosters include the GEM-63 class', () => {
    expect(BOOSTERS.some((b) => b.id === 'gem-63')).toBe(true)
    for (const b of BOOSTERS) expect(b.thrustSL).toBeLessThan(b.thrustVac)
  })

  it('the liquid Falcon side booster is assembled from its reference stage and 9 Merlin 1D', () => {
    const b = BOOSTERS.find((x) => x.id === 'booster-falcon-side')!
    const ref = PRESET_REFERENCE.find((r) => r.id === 'ref-fhe-side')!
    const merlin = ENGINES.find((e) => e.id === 'merlin-1d')!
    expect(b.propellant).toBe('kerolox')
    expect(ref.boosterId).toBe(b.id)
    expect([b.propellantKg, b.dryKg]).toEqual([ref.propellantKg, ref.dryKg])
    expect(b.thrustSL).toBe(9 * merlin.thrustSL)
    expect(b.thrustVac).toBe(9 * merlin.thrustVac)
    expect([b.ispSL, b.ispVac]).toEqual([merlin.ispSL, merlin.ispVac])
    for (const s of BOOSTERS.filter((x) => x.id.startsWith('gem-'))) expect(s.propellant ?? 'solid').toBe('solid')
  })
})

describe('LSP curves', () => {
  it('has the validated presets and no Falcon 9 curve', () => {
    const ids = LSP_CURVES.map((c) => c.presetId)
    expect(ids).toContain('atlas-v-401')
    expect(ids).toContain('falcon-heavy-exp')
    expect(ids.some((id) => id.startsWith('falcon-9'))).toBe(false)
  })

  it('points are sorted by C3 with payload decreasing, at least 5 over C3 0–20', () => {
    for (const c of LSP_CURVES) {
      const inRange = c.points.filter(([c3]) => c3 >= 0 && c3 <= 20)
      expect(inRange.length, c.presetId).toBeGreaterThanOrEqual(5)
      expect(c.points[0]![0]).toBeLessThanOrEqual(0)
      expect(c.points.at(-1)![0]).toBeGreaterThanOrEqual(20)
      for (let i = 1; i < c.points.length; i++) {
        expect(c.points[i]![0], c.presetId).toBeGreaterThan(c.points[i - 1]![0])
        expect(c.points[i]![1], c.presetId).toBeLessThan(c.points[i - 1]![1])
      }
      for (const [c3, kg] of c.points) {
        expect(Number.isFinite(c3)).toBe(true)
        expect(kg).toBeGreaterThan(0)
      }
    }
  })

  it('Atlas V 401 curve sits within 10% of the MAVEN launch (C3 12.07, 2,454 kg)', () => {
    const maven = LSP_ANCHORS.find((a) => a.mission === 'maven')!
    const kg = lspPayloadKg('atlas-v-401', maven.c3)
    expect(Math.abs(kg - maven.massKg) / maven.massKg).toBeLessThan(0.1)
    expect(lspPayloadKg('atlas-v-401', 50)).toBeNaN() // no extrapolation
  })
})

describe('spacecraft catalog', () => {
  it('keeps the legacy categories plus storage and two propulsion options', () => {
    const cats = new Set(SPACECRAFT_PARTS.map((p) => p.category))
    for (const c of ['core', 'power', 'comms', 'instrument', 'protection', 'storage', 'propulsion']) {
      expect(cats.has(c as never), c).toBe(true)
    }
    const mono = SPACECRAFT_PARTS.find((p) => p.id === 'prop-monoprop')!
    const bi = SPACECRAFT_PARTS.find((p) => p.id === 'prop-biprop')!
    expect(mono.ispS).toBeGreaterThan(220)
    expect(mono.ispS).toBeLessThan(240)
    expect(bi.ispS).toBeGreaterThan(310)
    expect(bi.ispS).toBeLessThan(330)
    expect(bi.massKg).toBeGreaterThan(mono.massKg)
    expect(bi.costM).toBeGreaterThan(mono.costM)
    expect(SPACECRAFT_PARTS.some((p) => p.id === 'rtg' && !p.solar && p.powerW > 0)).toBe(true)
    for (const id of ['comms-lga', 'comms-hga', 'comms-optical']) {
      expect(SPACECRAFT_PARTS.find((p) => p.id === id)?.rateMbpsAt1AU, id).toBeGreaterThan(0)
    }
    for (const id of ['inst-camera', 'inst-spectrometer', 'inst-radar', 'inst-magnetometer']) {
      const p = SPACECRAFT_PARTS.find((x) => x.id === id)!
      expect(p.science, id).toBeGreaterThan(0)
      expect(p.dataGbPerTurn, id).toBeGreaterThan(0)
      expect(p.powerW, id).toBeLessThan(0)
    }
    expect(SPACECRAFT_PARTS.find((p) => p.category === 'storage')?.storageGb).toBeGreaterThan(0)
  })

  it('a sensible orbiter costs $400–600M, fits an Atlas V 401 at C3 12 and reaches the science target', () => {
    const orbiter = [
      'sc-core',
      'solar-large',
      'battery',
      'comms-hga',
      'comms-lga',
      'inst-camera',
      'inst-spectrometer',
      'inst-radar',
      'storage-ssr',
      'prop-monoprop',
    ]
    const cost = sum(orbiter, 'costM')
    expect(cost).toBeGreaterThanOrEqual(400)
    expect(cost).toBeLessThanOrEqual(600)
    expect(cost).toBeLessThan(MISSION.budgetM - 150) // leaves room for a launcher
    // Dry mass near real Mars orbiters (MRO 1,031 kg, MAVEN 809 kg).
    const dry = sum(orbiter, 'massKg')
    expect(dry).toBeGreaterThan(700)
    expect(dry).toBeLessThan(1200)
    // With ~1,100 m/s of MOI + TCM on monoprop, wet mass stays under 90% of the Atlas V 401 at C3 12.
    const wet = dry * Math.exp(1100 / (230 * 9.80665))
    expect(wet).toBeLessThan(0.9 * lspPayloadKg('atlas-v-401', 12))
    const sciencePerTurn = orbiter.reduce(
      (s, id) => s + (SPACECRAFT_PARTS.find((p) => p.id === id)?.science ?? 0),
      0,
    )
    expect(sciencePerTurn * MISSION.opsTurns).toBeGreaterThanOrEqual(MISSION.scienceTarget * 0.8)
  })
})

describe('mission, real missions, DONKI', () => {
  it('MISSION carries the global constants', () => {
    expect(MISSION.name).toBe('Red Watch')
    expect(MISSION.budgetM).toBe(900)
    expect(MISSION.parkingAltitudeM).toBe(200e3)
    expect(MISSION.capturePeriapsisAltM).toBe(300e3)
    expect(MISSION.captureApoapsisAltM).toBe(33_000e3)
    expect(MISSION.minLiftoffTwr).toBe(1.1)
    expect(MISSION.opsTurns).toBe(6)
    expect(MISSION.turnDays).toBe(30)
    expect(MISSION.scienceTarget).toBe(100)
    expect(MISSION.bufferGbit).toBe(40)
    expect(MISSION.ascentDvMs).toBe(9400)
    expect(MISSION.launchMargin).toBe(0.9)
    expect(MISSION.briefing).toMatch(/Mars/)
  })

  it('has MAVEN and MRO with real dates', () => {
    expect(REAL_MISSIONS.map((m) => m.id).sort()).toEqual(['maven', 'mro'])
    for (const m of REAL_MISSIONS) {
      expect(m.launchDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(m.arrivalDate > m.launchDate).toBe(true)
    }
  })

  it('DONKI file has ≥ 10 M/X flares from NASA DONKI with provenance', () => {
    expect(DONKI_FLARES.length).toBeGreaterThanOrEqual(10)
    expect(DONKI_META.count).toBe(DONKI_FLARES.length)
    expect(DONKI_META.source).toMatch(/DONKI/)
    expect(DONKI_META.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const ids = new Set<string>()
    for (const f of DONKI_FLARES) {
      expect(f.classType, f.id).toMatch(/^[MX]\d/)
      expect(f.peakTime.startsWith('2024-'), f.id).toBe(true)
      expect(f.link, f.id).toMatch(/^https:\/\/kauai\.ccmc\.gsfc\.nasa\.gov\/DONKI\//)
      ids.add(f.id)
    }
    expect(ids.size).toBe(DONKI_FLARES.length)
    expect(DONKI_FLARES.some((f) => f.classType.startsWith('X'))).toBe(true)
  })
})
