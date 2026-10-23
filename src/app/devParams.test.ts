import { describe, expect, it } from 'vitest'
import { REFERENCE_DESIGN } from '@/game/checklist'
import { DEFAULT_DEV_PARAMS, devStartState, parseDevParams } from './devParams'

describe('parseDevParams', () => {
  it('falls back per field on bad values (Review Focus 5)', () => {
    expect(parseDevParams('?phase=xyz&preset=nope&seed=abc')).toEqual({ phase: 'select', preset: null, seed: 1 })
  })

  it('reads valid values as given', () => {
    expect(parseDevParams('?phase=cruise&preset=reference&seed=7')).toEqual({
      phase: 'cruise',
      preset: 'reference',
      seed: 7,
    })
  })

  it('returns the defaults for an empty search string', () => {
    expect(parseDevParams('')).toEqual(DEFAULT_DEV_PARAMS)
    expect(parseDevParams('?')).toEqual(DEFAULT_DEV_PARAMS)
  })

  it('falls back field by field, keeping the valid ones', () => {
    expect(parseDevParams('?phase=ops&seed=1.5')).toEqual({ phase: 'ops', preset: null, seed: 1 })
    expect(parseDevParams('?phase=&preset=reference&seed=12')).toEqual({ phase: 'select', preset: 'reference', seed: 12 })
  })

  it('rejects non-integer, empty and unsafe seeds', () => {
    for (const s of ['abc', '', '1e3', '0x10', '7abc', ' 7', 'Infinity', '99999999999999999999']) {
      expect(parseDevParams(`?seed=${encodeURIComponent(s)}`).seed).toBe(1)
    }
  })

  it('accepts the search string without the leading ?', () => {
    expect(parseDevParams('phase=design&seed=3')).toEqual({ phase: 'design', preset: null, seed: 3 })
  })
})

describe('devStartState (R23)', () => {
  it('without a preset falls back to select for phases that need a design', () => {
    for (const phase of ['launch', 'cruise', 'arrival', 'ops', 'report'] as const) {
      const s = devStartState({ phase, preset: null, seed: 1 })
      expect(s.phase).toBe('select')
      expect(s.launched).toBe(false)
    }
  })

  it('without a preset still opens select, briefing, design and sources', () => {
    for (const phase of ['select', 'briefing', 'design', 'sources'] as const) {
      expect(devStartState({ phase, preset: null, seed: 1 }).phase).toBe(phase)
    }
  })

  it('with preset=reference loads a deep copy of REFERENCE_DESIGN', () => {
    const s = devStartState({ phase: 'launch', preset: 'reference', seed: 1 })
    expect(s.phase).toBe('launch')
    expect(s.design).toEqual(REFERENCE_DESIGN)
    expect(s.design).not.toBe(REFERENCE_DESIGN)
    expect(s.design.rocket.stages[0]).not.toBe(REFERENCE_DESIGN.rocket.stages[0])
    expect(s.design.rocket.stages[0]!.tanks).not.toBe(REFERENCE_DESIGN.rocket.stages[0]!.tanks)
    expect(s.design.spacecraft.parts).not.toBe(REFERENCE_DESIGN.spacecraft.parts)
    expect(s.design.transfer).not.toBe(REFERENCE_DESIGN.transfer)
  })

  it('with preset=reference sets the flags each later phase needs', () => {
    const at = (phase: 'cruise' | 'arrival' | 'ops' | 'report') => devStartState({ phase, preset: 'reference', seed: 7 })
    expect(at('cruise')).toMatchObject({ phase: 'cruise', launched: true, arrived: false, opsDone: false, seed: 7 })
    expect(at('arrival')).toMatchObject({ phase: 'arrival', launched: true, arrived: false, opsDone: false })
    expect(at('ops')).toMatchObject({ phase: 'ops', launched: true, arrived: true, opsDone: false })
    expect(at('report')).toMatchObject({ phase: 'report', launched: true, arrived: true, opsDone: true })
  })

  it('a bad URL opens mission select with the default design (Review Focus 5)', () => {
    const s = devStartState(parseDevParams('?phase=xyz&preset=nope&seed=abc'))
    expect(s).toMatchObject({ phase: 'select', launched: false, arrived: false, opsDone: false, seed: 1 })
    expect(s.design.transfer).toBeNull()
  })
})
