import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PorkchopGrid } from '@/physics/porkchop'

const computePorkchopAsync = vi.fn<() => Promise<PorkchopGrid>>()
vi.mock('@/physics/porkchopClient', () => ({ computePorkchopAsync: () => computePorkchopAsync() }))

const { REFERENCE_DESIGN } = await import('@/game/checklist')
const { presetById } = await import('@/data/presets')
const {
  useGame,
  defaultDesign,
  selectCanLaunch,
  selectChecklist,
  selectRocketStats,
  selectSpacecraftStats,
  selectTransfer,
} = await import('./store')

const FAKE_GRID = { nDep: 0, nArr: 0 } as unknown as PorkchopGrid

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  useGame.getState().reset()
  useGame.setState({ porkchop: null, porkchopStatus: 'idle' })
  computePorkchopAsync.mockReset()
})

describe('useGame store', () => {
  it('starts at select with the Atlas V 401-class rocket and a bus-only spacecraft', () => {
    const s = useGame.getState()
    expect(s.phase).toBe('select')
    expect(s.design.transfer).toBeNull()
    expect(s.design.rocket).toEqual(presetById('atlas-v-401')!.rocket)
    expect(s.design.rocket).not.toBe(presetById('atlas-v-401')!.rocket)
    expect(s.design.spacecraft.parts).toEqual({ 'sc-core': 1 })
    expect(s).toMatchObject({ launched: false, arrived: false, opsDone: false, launch: null, cruise: null, ops: null, result: null })
    expect(defaultDesign()).toEqual(s.design)
  })

  it('refuses launch with the default design and allows it after loading REFERENCE_DESIGN', () => {
    const g = useGame.getState()
    expect(g.setPhase('launch')).toBe(false)
    expect(useGame.getState().phase).toBe('select')

    g.setTransfer(REFERENCE_DESIGN.transfer)
    g.setRocket(REFERENCE_DESIGN.rocket)
    g.setSpacecraft(REFERENCE_DESIGN.spacecraft)
    expect(selectCanLaunch(useGame.getState())).toBe(true)
    expect(useGame.getState().setPhase('launch')).toBe(true)
    expect(useGame.getState().phase).toBe('launch')
  })

  it('refuses cruise before a launch', () => {
    expect(useGame.getState().setPhase('cruise')).toBe(false)
  })

  it('next() advances while the next phase is enterable', () => {
    const g = useGame.getState()
    expect(g.next()).toBe(true)
    expect(useGame.getState().phase).toBe('briefing')
    expect(useGame.getState().next()).toBe(true)
    expect(useGame.getState().phase).toBe('design')
    expect(useGame.getState().next()).toBe(false) // default design cannot launch
    expect(useGame.getState().phase).toBe('design')
  })

  it('applyPreset replaces the rocket only', () => {
    const g = useGame.getState()
    g.setTransfer(REFERENCE_DESIGN.transfer)
    g.setSpacecraft(REFERENCE_DESIGN.spacecraft)
    const before = useGame.getState().design
    expect(useGame.getState().applyPreset('vulcan-vc4')).toBe(true)
    const after = useGame.getState().design
    expect(after.rocket).toEqual(presetById('vulcan-vc4')!.rocket)
    expect(after.rocket).not.toBe(presetById('vulcan-vc4')!.rocket)
    expect(after.rocket.stages[0]).not.toBe(presetById('vulcan-vc4')!.rocket.stages[0])
    expect(after.transfer).toBe(before.transfer)
    expect(after.spacecraft).toBe(before.spacecraft)
  })

  it('applyPreset with an unknown id changes nothing', () => {
    const before = useGame.getState().design
    expect(useGame.getState().applyPreset('nope')).toBe(false)
    expect(useGame.getState().design).toBe(before)
  })

  it('setRocket and setSpacecraft copy their input, so later mutation cannot alias the store', () => {
    const rocket = structuredClone(REFERENCE_DESIGN.rocket)
    const spacecraft = structuredClone(REFERENCE_DESIGN.spacecraft)
    useGame.getState().setRocket(rocket)
    useGame.getState().setSpacecraft(spacecraft)
    rocket.stages[0]!.engineCount = 9
    spacecraft.parts['sc-core'] = 0
    expect(useGame.getState().design.rocket.stages[0]!.engineCount).toBe(1)
    expect(useGame.getState().design.spacecraft.parts['sc-core']).toBe(1)
  })

  it('selectors recompute immediately after setSpacecraft (Review Focus 2)', () => {
    const g = useGame.getState()
    g.setTransfer(REFERENCE_DESIGN.transfer)
    g.setRocket(REFERENCE_DESIGN.rocket)
    g.setSpacecraft(REFERENCE_DESIGN.spacecraft)
    const s1 = useGame.getState()
    const wet1 = selectSpacecraftStats(s1).wetKg
    const liftoff1 = selectRocketStats(s1).massKg
    expect(selectCanLaunch(s1)).toBe(true)

    // Remove the instruments: lighter spacecraft and an instruments check that fails.
    const { 'inst-camera': _c, 'inst-spectrometer': _s, 'inst-radar': _r, ...rest } = REFERENCE_DESIGN.spacecraft.parts
    useGame.getState().setSpacecraft({ ...REFERENCE_DESIGN.spacecraft, parts: rest })
    const s2 = useGame.getState()
    expect(selectSpacecraftStats(s2).wetKg).toBeLessThan(wet1)
    expect(selectRocketStats(s2).massKg).toBeLessThan(liftoff1)
    expect(selectChecklist(s2).find((i) => i.id === 'instruments')!.ok).toBe(false)
    expect(selectCanLaunch(s2)).toBe(false)

    // The launch button re-locks: setPhase('launch') is refused again.
    expect(useGame.getState().setPhase('launch')).toBe(false)
  })

  it('selectors recompute after setTransfer and the launch re-locks when the transfer is cleared', () => {
    const g = useGame.getState()
    g.setTransfer(REFERENCE_DESIGN.transfer)
    g.setRocket(REFERENCE_DESIGN.rocket)
    g.setSpacecraft(REFERENCE_DESIGN.spacecraft)
    expect(selectTransfer(useGame.getState())).not.toBeNull()
    useGame.getState().setTransfer(null)
    expect(selectTransfer(useGame.getState())).toBeNull()
    expect(selectCanLaunch(useGame.getState())).toBe(false)
  })

  it('selectTransfer returns the same object for the same dates (stable for React)', () => {
    useGame.getState().setTransfer(REFERENCE_DESIGN.transfer)
    const a = selectTransfer(useGame.getState())
    useGame.getState().setSpacecraft(REFERENCE_DESIGN.spacecraft)
    const b = selectTransfer(useGame.getState())
    expect(a).not.toBeNull()
    expect(b).toBe(a)
  })

  it('setHoverTransfer stores the hovered transfer without touching the design', () => {
    useGame.getState().setTransfer(REFERENCE_DESIGN.transfer)
    const design = useGame.getState().design
    const t = selectTransfer(useGame.getState())
    useGame.getState().setHoverTransfer(t)
    expect(useGame.getState().hoverTransfer).toBe(t)
    expect(useGame.getState().design).toBe(design)
    useGame.getState().setHoverTransfer(null)
    expect(useGame.getState().hoverTransfer).toBeNull()
  })

  it('reset returns to the start state', () => {
    const g = useGame.getState()
    g.setTransfer(REFERENCE_DESIGN.transfer)
    g.next()
    g.applyPreset('vulcan-vc4')
    useGame.getState().reset()
    const s = useGame.getState()
    expect(s.phase).toBe('select')
    expect(s.design).toEqual(defaultDesign())
    expect(s.hoverTransfer).toBeNull()
  })
})

describe('loadPorkchop', () => {
  it('calls the worker once even when called twice, then stores the grid', async () => {
    const d = deferred<PorkchopGrid>()
    computePorkchopAsync.mockReturnValue(d.promise)
    const p1 = useGame.getState().loadPorkchop()
    const p2 = useGame.getState().loadPorkchop()
    expect(useGame.getState().porkchopStatus).toBe('loading')
    d.resolve(FAKE_GRID)
    await Promise.all([p1, p2])
    expect(computePorkchopAsync).toHaveBeenCalledTimes(1)
    expect(useGame.getState().porkchopStatus).toBe('ready')
    expect(useGame.getState().porkchop).toBe(FAKE_GRID)

    await useGame.getState().loadPorkchop()
    expect(computePorkchopAsync).toHaveBeenCalledTimes(1)
  })

  it('sets error on failure and can retry', async () => {
    computePorkchopAsync.mockRejectedValueOnce(new Error('boom'))
    await useGame.getState().loadPorkchop()
    expect(useGame.getState().porkchopStatus).toBe('error')
    expect(useGame.getState().porkchop).toBeNull()

    computePorkchopAsync.mockResolvedValueOnce(FAKE_GRID)
    await useGame.getState().loadPorkchop()
    expect(useGame.getState().porkchopStatus).toBe('ready')
    expect(computePorkchopAsync).toHaveBeenCalledTimes(2)
  })

  it('ignores a stale result when the grid was cleared while loading', async () => {
    const d = deferred<PorkchopGrid>()
    computePorkchopAsync.mockReturnValueOnce(d.promise)
    const p = useGame.getState().loadPorkchop()
    useGame.getState().clearPorkchop()
    d.resolve(FAKE_GRID)
    await p
    expect(useGame.getState().porkchop).toBeNull()
    expect(useGame.getState().porkchopStatus).toBe('idle')
  })

  it('reset keeps an already computed grid (it does not depend on the design)', async () => {
    computePorkchopAsync.mockResolvedValueOnce(FAKE_GRID)
    await useGame.getState().loadPorkchop()
    useGame.getState().reset()
    expect(useGame.getState().porkchop).toBe(FAKE_GRID)
    expect(useGame.getState().porkchopStatus).toBe('ready')
  })
})

describe('derived-value memos (Task 12)', () => {
  it('capacityKgFor caches per rocket object and C3, and a new rocket recomputes', async () => {
    const { capacityKgFor } = await import('./store')
    const { capacityToC3 } = await import('@/physics/launcher')
    const r = structuredClone(presetById('atlas-v-401')!.rocket)
    const a = capacityKgFor(r, 9.2)
    expect(a).toBe(capacityToC3(r, 9.2))
    expect(capacityKgFor(r, 9.2)).toBe(a)
    expect(capacityKgFor(r, 20)).toBeLessThan(a)
    const heavier = { ...r, stages: r.stages.map((s, i) => (i === 0 ? { ...s, boosterId: 'gem-63', boosterCount: 2 } : s)) }
    expect(capacityKgFor(heavier, 9.2)).toBe(capacityToC3(heavier, 9.2))
    expect(capacityKgFor(heavier, 9.2)).not.toBe(a)
  })

  it('the checklist is shared for one design and recomputed for the next (Review Focus 2)', () => {
    const g = useGame.getState()
    g.setTransfer(REFERENCE_DESIGN.transfer)
    g.setSpacecraft(REFERENCE_DESIGN.spacecraft)
    const first = selectChecklist(useGame.getState())
    expect(selectChecklist(useGame.getState())).toBe(first)
    expect(selectCanLaunch(useGame.getState())).toBe(true)
    // break the rocket: the next read is a fresh evaluation and launch re-locks
    g.setRocket({ ...REFERENCE_DESIGN.rocket, stages: [] })
    const second = selectChecklist(useGame.getState())
    expect(second).not.toBe(first)
    expect(second.find((i) => i.id === 'rocket-valid')!.ok).toBe(false)
    expect(selectCanLaunch(useGame.getState())).toBe(false)
  })

  it('hover does not replace the design, the design tab is remembered, reset starts a new epoch', () => {
    const g = useGame.getState()
    const design = useGame.getState().design
    g.setHoverTransfer(null)
    expect(useGame.getState().design).toBe(design)
    g.setDesignTab('spacecraft')
    expect(useGame.getState().designTab).toBe('spacecraft')
    const epoch = useGame.getState().epoch
    useGame.getState().reset()
    expect(useGame.getState().designTab).toBe('trajectory')
    expect(useGame.getState().epoch).toBe(epoch + 1)
  })
})
