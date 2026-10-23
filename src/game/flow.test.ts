import { describe, expect, it } from 'vitest'
import { REFERENCE_DESIGN, type MissionDesign } from './checklist'
import { PHASES, canEnter, isPhase, nextPhase, type GameSnapshot, type Phase } from './flow'

const snapshotWith = (design: MissionDesign, flags: Partial<Omit<GameSnapshot, 'design'>> = {}): GameSnapshot => ({
  design,
  launched: false,
  arrived: false,
  opsDone: false,
  ...flags,
})

const NO_TRANSFER: MissionDesign = { ...REFERENCE_DESIGN, transfer: null }

describe('nextPhase', () => {
  it('walks the linear order select → … → report', () => {
    const order: Phase[] = ['select', 'briefing', 'design', 'launch', 'cruise', 'arrival', 'ops', 'report']
    for (let i = 0; i < order.length - 1; i++) expect(nextPhase(order[i]!)).toBe(order[i + 1])
  })

  it('stays on report', () => {
    expect(nextPhase('report')).toBe('report')
  })

  it('returns from the sources side screen to select', () => {
    expect(nextPhase('sources')).toBe('select')
  })
})

describe('canEnter', () => {
  it('launch: true with REFERENCE_DESIGN, false with transfer: null', () => {
    expect(canEnter('launch', snapshotWith(REFERENCE_DESIGN))).toBe(true)
    expect(canEnter('launch', snapshotWith(NO_TRANSFER))).toBe(false)
  })

  it('select, briefing, sources and design are always enterable', () => {
    for (const p of ['select', 'briefing', 'sources', 'design'] as Phase[]) {
      expect(canEnter(p, snapshotWith(NO_TRANSFER))).toBe(true)
    }
  })

  it('cruise, arrival and report need a launch', () => {
    for (const p of ['cruise', 'arrival', 'report'] as Phase[]) {
      expect(canEnter(p, snapshotWith(REFERENCE_DESIGN))).toBe(false)
      expect(canEnter(p, snapshotWith(REFERENCE_DESIGN, { launched: true }))).toBe(true)
    }
  })

  it('ops needs arrival', () => {
    expect(canEnter('ops', snapshotWith(REFERENCE_DESIGN, { launched: true }))).toBe(false)
    expect(canEnter('ops', snapshotWith(REFERENCE_DESIGN, { launched: true, arrived: true }))).toBe(true)
  })
})

describe('isPhase', () => {
  it('accepts every phase and rejects anything else', () => {
    for (const p of PHASES) expect(isPhase(p)).toBe(true)
    expect(isPhase('xyz')).toBe(false)
    expect(isPhase('')).toBe(false)
    expect(isPhase('toString')).toBe(false)
  })
})
