import { describe, expect, it } from 'vitest'
import { buildGameView, defaultDesign, type GameViewState } from '@/app/store'
import { REFERENCE_DESIGN, type MissionDesign } from '@/game/checklist'
import { PHASES } from '@/game/flow'
import { copyDesign } from '@/app/devParams'
import { CONCEPTS, SIMPLIFICATIONS, conceptNumber, conceptsFor, fmt, sci } from './concepts'

function viewOf(design: MissionDesign) {
  const state: GameViewState = {
    phase: 'design',
    design,
    seed: 1,
    porkchop: null,
    porkchopStatus: 'idle',
    launched: false,
    arrived: false,
    opsDone: false,
    launch: null,
    cruise: null,
    arrival: null,
    ops: null,
    result: null,
  }
  return buildGameView(state)
}

const BAD = /NaN|Infinity|undefined|null|\[object/

describe('CONCEPTS', () => {
  it('has unique ids and every field filled', () => {
    const ids = new Set(CONCEPTS.map((c) => c.id))
    expect(ids.size).toBe(CONCEPTS.length)
    for (const c of CONCEPTS) {
      expect(c.title.length, c.id).toBeGreaterThan(0)
      expect(c.formula.length, c.id).toBeGreaterThan(0)
      expect(c.plain.length, c.id).toBeGreaterThan(0)
      expect(c.phases.length, c.id).toBeGreaterThan(0)
    }
  })

  it('covers the legacy concepts and the new ones', () => {
    const legacy = ['gravity', 'dv-map', 'rocket-equation', 'twr', 'staging', 'circular-speed', 'kepler3', 'hohmann',
      'phase-angle', 'escape', 'vis-viva', 'apsides', 'correction', 'soi', 'capture', 'inverse-square', 'light-delay']
    const added = ['lambert', 'c3', 'porkchop', 'launch-margin', 'parallel-staging', 'link-budget', 'tcm',
      'solar-conjunction', 'gravity-losses', 'upper-stage-twr']
    for (const id of [...legacy, ...added]) expect(conceptNumber(id), id).toBeGreaterThan(0)
  })

  it('live() gives real numbers for the reference design', () => {
    const view = viewOf(copyDesign(REFERENCE_DESIGN))
    expect(view.transfer).not.toBeNull()
    for (const c of CONCEPTS) {
      const s = c.live(view)
      expect(s, c.id).not.toMatch(BAD)
      expect(s.length, c.id).toBeGreaterThan(1)
      expect(s, c.id).not.toBe('–') // the safe() fallback would hide a bug here
    }
  })

  it('live() never breaks for the default design (no transfer)', () => {
    const view = viewOf(defaultDesign())
    expect(view.transfer).toBeNull()
    for (const c of CONCEPTS) {
      const s = c.live(view)
      expect(s, c.id).not.toMatch(BAD)
      expect(s.length, c.id).toBeGreaterThan(1)
    }
  })

  it('live() survives a broken design (no stages, no parts, impossible dates)', () => {
    const view = viewOf({
      transfer: { depJd: 0, arrJd: 1 },
      rocket: { stages: [], fairing: 'small' },
      spacecraft: { parts: {}, tcmReserveMs: Number.NaN },
    })
    for (const c of CONCEPTS) {
      const s = c.live(view)
      expect(s, c.id).not.toMatch(BAD)
      expect(s.length, c.id).toBeGreaterThan(0)
    }
  })

  it('puts the expected numbers in a few cards', () => {
    const view = viewOf(copyDesign(REFERENCE_DESIGN))
    const byId = (id: string) => CONCEPTS.find((c) => c.id === id)!.live(view)
    expect(byId('c3')).toContain(fmt(view.transfer!.c3, 2))
    expect(byId('twr')).toContain(fmt(view.rocketStats.liftoffTwr, 2))
    expect(byId('inverse-square')).toContain(`${fmt(view.spacecraftStats.powerGenAtMarsW)} W`)
  })

  it('lists concepts for every playable phase', () => {
    for (const p of PHASES) if (p !== 'sources') expect(conceptsFor(p).length, p).toBeGreaterThan(0)
  })
})

describe('formatting', () => {
  it('fmt dashes non-finite numbers', () => {
    expect(fmt(Number.NaN)).toBe('–')
    expect(fmt(Infinity)).toBe('–')
    expect(fmt(1234.5, 1)).toBe('1,234.5')
  })
  it('sci writes a superscript exponent', () => {
    expect(sci(1.32712440018e20)).toBe('1.327 × 10²⁰')
  })
  it('simplifications are filled in', () => {
    for (const s of SIMPLIFICATIONS) expect(s).not.toMatch(BAD)
  })
})
