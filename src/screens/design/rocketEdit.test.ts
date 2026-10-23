import { describe, expect, it } from 'vitest'
import { presetById } from '@/data/presets'
import { tankById } from '@/data/tanks'
import { MAX_STAGES, rocketStats, type RocketDesign } from '@/physics/launcher'
import {
  NEW_FIRST_STAGE,
  NEW_UPPER_STAGE,
  addStage,
  addTank,
  dropMismatchedTanks,
  enginesFor,
  matchingPreset,
  removeStage,
  removeTank,
  sameRocket,
  setBooster,
  setBoosterCount,
  setEngine,
  setEngineCount,
  stageCostM,
  tanksFor,
} from './rocketEdit'

const atlas = () => structuredClone(presetById('atlas-v-401')!.rocket)
const vulcan = () => structuredClone(presetById('vulcan-vc4')!.rocket)

describe('rocket edits', () => {
  it('the default new stages exist in the catalog and fly', () => {
    for (const id of [...NEW_FIRST_STAGE.tanks, ...NEW_UPPER_STAGE.tanks]) expect(tankById(id), id).toBeDefined()
    const r = addStage({ stages: [], fairing: 'small' })
    expect(r.stages).toEqual([NEW_FIRST_STAGE])
    const two = addStage(r)
    expect(rocketStats(two, 1000).valid).toBe(true)
  })

  it('adds stages up to the maximum and never mutates the input', () => {
    const r = atlas()
    const before = structuredClone(r)
    let x = r
    for (let i = 0; i < 5; i++) x = addStage(x)
    expect(x.stages.length).toBe(MAX_STAGES)
    expect(r).toEqual(before)
  })

  it('removing the first stage drops the boosters from the stage that becomes first', () => {
    const r = removeStage(vulcan(), 0)
    expect(r.stages.length).toBe(1)
    expect(r.stages[0]!.boosterId).toBeUndefined()
    expect(r.stages[0]!.boosterCount).toBeUndefined()
  })

  it('clamps engine counts to 1–9 and booster counts to 0–6', () => {
    expect(setEngineCount(atlas(), 0, 12).stages[0]!.engineCount).toBe(9)
    expect(setEngineCount(atlas(), 0, 0).stages[0]!.engineCount).toBe(1)
    const b = setBooster(atlas(), 'gem-63')
    expect(b.stages[0]!.boosterCount).toBe(2)
    expect(setBoosterCount(b, 10).stages[0]!.boosterCount).toBe(6)
    const none = setBooster(b, null)
    expect(none.stages[0]!.boosterId).toBeUndefined()
  })

  it('a mismatched tank gives a readable error and the quick fix removes it', () => {
    const r = addTank(atlas(), 0, 'tank-h37-s')
    const errors = rocketStats(r, 0).errors
    expect(errors.some((e) => /holds hydrolox but RD-180 burns kerolox/.test(e))).toBe(true)
    const fixed = dropMismatchedTanks(r, 0)
    expect(fixed.stages[0]!.tanks).toEqual(['tank-k381-ccb'])
    expect(removeTank(r, 0, 1)).toEqual(fixed)
  })

  it('no engine: readable error, zero capacity path', () => {
    const r = setEngine(atlas(), 1, null)
    expect(rocketStats(r, 0).errors).toContain('Stage 2 has no engine')
  })

  it('filters tanks by the engine propellant and flags vacuum engines on stage 1', () => {
    expect(tanksFor('rd-180').every((t) => t.propellant === 'kerolox')).toBe(true)
    expect(tanksFor(null).length).toBeGreaterThan(tanksFor('rd-180').length)
    const first = enginesFor(0)
    expect(first.find((e) => e.engine.id === 'rl10c-1')!.usable).toBe(false)
    expect(enginesFor(1).every((e) => e.usable)).toBe(true)
  })

  it('stage cost adds tanks, engines and boosters', () => {
    const s = vulcan().stages[0]!
    // tank-m54-vulcan + 2 × BE-4 (18) + 4 × GEM 63XL (10)
    expect(stageCostM(s)).toBeCloseTo(tankById('tank-m54-vulcan')!.costM + 36 + 40, 6)
  })

  it('recognises presets, preferring the one with an LSP curve over the reference duplicate', () => {
    expect(matchingPreset(atlas())?.id).toBe('atlas-v-401')
    expect(matchingPreset(vulcan())?.id).toBe('vulcan-vc4')
    expect(matchingPreset(setEngineCount(atlas(), 0, 2))).toBeUndefined()
    const zeroBoosters: RocketDesign = { ...atlas(), stages: atlas().stages.map((s, i) => (i === 0 ? { ...s, boosterId: 'gem-63', boosterCount: 0 } : s)) }
    expect(sameRocket(zeroBoosters, atlas())).toBe(true)
  })
})
