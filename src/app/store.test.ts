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

describe('flight actions (Task 13)', () => {
  const loadReference = () => {
    const g = useGame.getState()
    g.setTransfer(REFERENCE_DESIGN.transfer)
    g.setRocket(REFERENCE_DESIGN.rocket)
    g.setSpacecraft(REFERENCE_DESIGN.spacecraft)
    useGame.setState({ seed: 1 })
  }
  const get = () => useGame.getState()
  /** Warps until a decision is due or the arrival date, as time warp would. */
  const warpToDecision = () => {
    for (let i = 0; i < 20; i++) {
      const stop = get().tickCruise(1e6)
      if (stop === 'tcm' || stop === 'event' || stop === 'arrival') return stop
    }
    return null
  }

  it('startLaunch is refused until every check is go', () => {
    expect(get().startLaunch()).toBe(false)
    expect(get().launched).toBe(false)
  })

  it('plays the reference mission end to end through the actions', () => {
    loadReference()
    expect(get().startLaunch()).toBe(true)
    expect(get()).toMatchObject({ phase: 'launch', launched: true, result: null })
    expect(get().launch!.timeline.reachedDeparture).toBe(true)
    expect(get().beginCruise()).toBe(true)
    expect(get().phase).toBe('cruise')
    expect(get().beginCruise()).toBe(false)

    for (let i = 0; i < 30 && get().cruise!.sim.jd < get().cruise!.sim.arrJd; i++) {
      const stop = warpToDecision()
      if (stop === 'tcm') expect(get().burnTcm()).toBe(true)
      if (stop === 'event') expect(get().resolveCruiseEvent('safe-mode')).toMatch(/safe mode/i)
    }
    const c = get().cruise!
    expect(c.sim.jd).toBe(c.sim.arrJd)
    expect(c.sim.tcms).toHaveLength(3)
    expect(get().completeArrival()).toBe(true)
    expect(get()).toMatchObject({ arrived: true, phase: 'cruise' })
    expect(get().arrival!.captured).toBe(true)
    expect(get().completeArrival()).toBe(false)
    expect(get().setPhase('ops')).toBe(true)

    for (let t = 0; t < 6; t++) {
      expect(get().runOpsTurn({ instrumentsOn: [] })).toBe(true)
    }
    expect(get().opsDone).toBe(true)
    expect(get().runOpsTurn({ instrumentsOn: [] })).toBe(false)
    expect(get().finishMission()).toBe(true)
    expect(get().phase).toBe('report')
    const r = get().result!
    expect(r.science).toBe(0) // nothing was switched on
    expect(r.result.outcome).toBe('partial')
    expect(r.dvLeftMs).toBeGreaterThan(0)
  })

  it('time stands still while a decision is pending; an invalid ops plan is refused', () => {
    loadReference()
    get().startLaunch()
    get().beginCruise()
    expect(warpToDecision()).toBe('tcm')
    const jd = get().cruise!.sim.jd
    expect(get().tickCruise(10)).toBeNull()
    expect(get().cruise!.sim.jd).toBe(jd)
    expect(get().resolveCruiseEvent('keep-observing')).toBeNull() // a TCM is due, not a flare
    expect(get().skipTcm()).toBe(true)
    expect(get().cruise!.decidedTcms).toEqual(['TCM-1'])
  })

  it('tickCruise reports a stall when the propagator cannot move the ship (the warp stops instead of spinning)', () => {
    loadReference()
    get().startLaunch()
    get().beginCruise()
    const c = get().cruise!
    // A ship state the propagator cannot advance: advanceCruise returns it unchanged.
    useGame.setState({ cruise: { ...c, sim: { ...c.sim, ship: { r: [Number.NaN, 0, 0], v: [0, 0, 0] } } } })
    const jd = get().cruise!.sim.jd
    expect(get().tickCruise(1)).toBe('stalled')
    expect(get().cruise!.sim.jd).toBe(jd)
  })

  it('a launch against a no-go TWR fails on the pad and computes the report at once', async () => {
    const { selectLaunchOverride, canEnterPhase } = await import('./store')
    loadReference()
    // An extra first-stage tank: the stack gets too heavy for its engine (liftoff TWR < 1.1).
    const r = structuredClone(REFERENCE_DESIGN.rocket)
    const s0 = r.stages[0]!
    s0.tanks = [...s0.tanks, s0.tanks[0]!]
    get().setRocket(r)
    expect(selectCanLaunch(get())).toBe(false)
    const noGo = selectLaunchOverride(get())!
    expect(noGo.map((i) => i.id)).toContain('twr')
    expect(get().startLaunch()).toBe(false)
    expect(get().startLaunch({ override: true })).toBe(true)
    expect(get()).toMatchObject({ phase: 'launch', launched: true })
    expect(get().launch!.failure).toBe('pad')
    expect(get().result!.result.outcome).toBe('failure')
    expect(get().result!.lessons[0]!.id).toBe('pad')
    expect(get().beginCruise()).toBe(false)
    expect(canEnterPhase('cruise', get())).toBe(false)
    expect(get().setPhase('report')).toBe(true)
    expect(get().setPhase('launch')).toBe(true) // the launch screen stays open after the launch
  })

  it('"Launch anyway" is not offered when a non-rocket check fails', async () => {
    const { selectLaunchOverride } = await import('./store')
    loadReference()
    get().setSpacecraft({ ...REFERENCE_DESIGN.spacecraft, parts: { 'sc-core': 1 } })
    expect(selectLaunchOverride(get())).toBeNull()
    expect(get().startLaunch({ override: true })).toBe(false)
  })

  it('skipping every TCM ends in a miss whose report is reachable', () => {
    loadReference()
    get().startLaunch()
    get().beginCruise()
    for (let i = 0; i < 30 && get().cruise!.sim.jd < get().cruise!.sim.arrJd; i++) {
      const stop = warpToDecision()
      if (stop === 'tcm') get().skipTcm()
      if (stop === 'event') get().resolveCruiseEvent('keep-observing')
    }
    expect(get().completeArrival()).toBe(true)
    expect(get().arrival).toMatchObject({ captured: false, reason: 'miss' })
    expect(get().arrived).toBe(false)
    expect(get().setPhase('ops')).toBe(false)
    expect(get().result!.failureReason).toBe('miss')
    expect(get().finishMission()).toBe(true)
    expect(get().phase).toBe('report')
  })

  it('with zero propellant a TCM is refused, skipping works and the flight reaches the report (Review Focus 4)', () => {
    loadReference()
    get().startLaunch()
    get().beginCruise()
    const c = get().cruise!
    useGame.setState({ cruise: { ...c, sim: { ...c.sim, propellantKg: 0 } } })
    for (let i = 0; i < 30 && get().cruise!.sim.jd < get().cruise!.sim.arrJd; i++) {
      const stop = warpToDecision()
      if (stop === 'tcm') {
        expect(get().burnTcm()).toBe(false)
        expect(get().skipTcm()).toBe(true)
      }
      if (stop === 'event') {
        expect(get().resolveCruiseEvent('shield-attitude')).toBeNull() // no propellant to turn
        expect(get().resolveCruiseEvent('keep-observing')).not.toBeNull()
      }
    }
    expect(get().completeArrival()).toBe(true)
    expect(get().arrival!.captured).toBe(false)
    expect(get().finishMission()).toBe(true)
    expect(get().result!.result.outcome).not.toBe('success')
  })

  it('reviseDesign keeps the design and seed and discards the flight; a design edit after launch does too', () => {
    loadReference()
    get().startLaunch()
    const design = get().design
    get().reviseDesign()
    expect(get()).toMatchObject({ phase: 'design', launched: false, launch: null, cruise: null, result: null, seed: 1 })
    expect(get().design).toBe(design)

    get().startLaunch()
    get().beginCruise()
    get().setSpacecraft({ ...REFERENCE_DESIGN.spacecraft, tcmReserveMs: 20 })
    expect(get()).toMatchObject({ launched: false, cruise: null })
  })

  it('reset draws a fresh seed (R30)', () => {
    const seeds = new Set<number>()
    for (let i = 0; i < 5; i++) {
      useGame.getState().reset()
      seeds.add(useGame.getState().seed)
    }
    expect(seeds.size).toBeGreaterThan(1)
  })
})

describe('dev jump plays the earlier phases (R23)', () => {
  it('opens each later phase with real, deterministic state', async () => {
    const { gameData } = await import('./store')
    const { devStartState } = await import('./devParams')
    const at = (phase: 'cruise' | 'arrival' | 'ops' | 'report') => gameData(devStartState({ phase, preset: 'reference', seed: 1 }))

    const cruise = at('cruise')
    expect(cruise.phase).toBe('cruise')
    expect(cruise.cruise!.sim.jd).toBe(cruise.cruise!.sim.depJd)
    expect(cruise.launch!.failure).toBeUndefined()

    const arrival = at('arrival')
    expect(arrival.phase).toBe('arrival')
    expect(arrival.cruise!.sim.jd).toBe(arrival.cruise!.sim.arrJd)

    const ops = at('ops')
    expect(ops).toMatchObject({ phase: 'ops', arrived: true, opsDone: false })
    expect(ops.ops!.turn).toBe(0)

    const report = at('report')
    expect(report).toMatchObject({ phase: 'report', opsDone: true })
    expect(report.result!.result.stars).toBe(3)
    expect(at('report')).toEqual(report)
  })

  it('without the preset the flight stays empty', async () => {
    const { gameData } = await import('./store')
    const { devStartState } = await import('./devParams')
    const s = gameData(devStartState({ phase: 'design', preset: null, seed: 1 }))
    expect(s).toMatchObject({ launch: null, cruise: null, arrival: null, ops: null, result: null })
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
