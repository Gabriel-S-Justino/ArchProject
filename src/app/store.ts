// The one game store every screen reads. Holds the player's choices (phase, design, seed, flags)
// and the porkchop grid; everything computed from the design (rocket and spacecraft stats,
// checklist, transfer) is derived on read by the selectors below and never stored, so an edit to
// any part of the design is reflected everywhere at once (Review Focus 2).
import { useMemo } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { presetById } from '@/data/presets'
import { launchChecklist, type CheckItem, type MissionDesign } from '@/game/checklist'
import { canEnter, nextPhase, type Phase } from '@/game/flow'
import { spacecraftStats, type SpacecraftDesign, type SpacecraftStats } from '@/game/spacecraft'
import { AU } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import { capacityToC3, rocketStats, type RocketDesign, type RocketStats } from '@/physics/launcher'
import { DEFAULT_PORKCHOP, transferFor, type PorkchopGrid, type TofLimits, type Transfer } from '@/physics/porkchop'
import { computePorkchopAsync } from '@/physics/porkchopClient'
import { norm } from '@/physics/vec'
import {
  DEFAULT_DEV_PARAMS,
  copyRocket,
  copySpacecraft,
  defaultDesign,
  devStartState,
  parseDevParams,
  type DevStartState,
} from './devParams'

export { defaultDesign }

export type PorkchopStatus = 'idle' | 'loading' | 'ready' | 'error'

/** The three tabs of the design workspace (Task 12). */
export type DesignTab = 'trajectory' | 'rocket' | 'spacecraft'

export interface GameState {
  phase: Phase
  design: MissionDesign
  /** Seed for every random event (createRng in src/game/rng.ts). */
  seed: number
  porkchop: PorkchopGrid | null
  porkchopStatus: PorkchopStatus
  /** The porkchop cell under the pointer, for previews; not part of the design. */
  hoverTransfer: Transfer | null
  /** The design workspace tab last shown; remembered while the player visits other screens. UI state, not design. */
  designTab: DesignTab
  /** Counts new games (reset); UI that remembers progress (the phase stepper) starts over when it changes. */
  epoch: number
  launched: boolean
  arrived: boolean
  opsDone: boolean
  // Placeholders: Tasks 9, 10 and 13 replace these types and wire the simulations.
  launch: unknown | null
  cruise: unknown | null
  ops: unknown | null
  result: unknown | null

  /** Moves to `p` if canEnter allows it; returns whether it did. */
  setPhase: (p: Phase) => boolean
  /** setPhase(nextPhase(phase)). */
  next: () => boolean
  setTransfer: (t: { depJd: number; arrJd: number } | null) => void
  setHoverTransfer: (t: Transfer | null) => void
  setDesignTab: (tab: DesignTab) => void
  setRocket: (r: RocketDesign) => void
  setSpacecraft: (s: SpacecraftDesign) => void
  /** Replaces the rocket (only) with a copy of the preset's; false for an unknown id. */
  applyPreset: (presetId: string) => boolean
  /** Computes the porkchop grid in a worker once; later calls reuse it or the request in flight. */
  loadPorkchop: () => Promise<void>
  /** Drops the grid (and ignores any request still in flight). */
  clearPorkchop: () => void
  /** A new game: start state without dev flags. Keeps the seed and the porkchop grid, which does not depend on the design. */
  reset: () => void
}

type GameData = Pick<
  GameState,
  | 'phase'
  | 'design'
  | 'seed'
  | 'launched'
  | 'arrived'
  | 'opsDone'
  | 'hoverTransfer'
  | 'designTab'
  | 'launch'
  | 'cruise'
  | 'ops'
  | 'result'
>

function gameData(start: DevStartState): GameData {
  return {
    phase: start.phase,
    design: start.design,
    seed: start.seed,
    launched: start.launched,
    arrived: start.arrived,
    opsDone: start.opsDone,
    hoverTransfer: null,
    designTab: 'trajectory',
    launch: null,
    cruise: null,
    ops: null,
    result: null,
  }
}

/** Dev flags are read once, when the store is created; node (tests) has no window. */
function initialDevParams() {
  return typeof window !== 'undefined' ? parseDevParams(window.location.search) : DEFAULT_DEV_PARAMS
}

/** Id of the latest porkchop request; a result is applied only if its id is still the latest. */
let porkchopRequestId = 0
let porkchopInFlight: Promise<void> | null = null

export const useGame = create<GameState>()((set, get) => ({
  ...gameData(devStartState(initialDevParams())),
  porkchop: null,
  porkchopStatus: 'idle',
  epoch: 0,

  setPhase: (p) => {
    const s = get()
    if (!canEnter(p, s)) return false
    set({ phase: p })
    return true
  },
  next: () => get().setPhase(nextPhase(get().phase)),

  setTransfer: (t) =>
    set((s) => ({ design: { ...s.design, transfer: t ? { depJd: t.depJd, arrJd: t.arrJd } : null } })),
  setHoverTransfer: (t) => {
    if (get().hoverTransfer !== t) set({ hoverTransfer: t })
  },
  setDesignTab: (tab) => set({ designTab: tab }),
  setRocket: (r) => set((s) => ({ design: { ...s.design, rocket: copyRocket(r) } })),
  setSpacecraft: (sc) => set((s) => ({ design: { ...s.design, spacecraft: copySpacecraft(sc) } })),
  applyPreset: (presetId) => {
    const preset = presetById(presetId)
    if (!preset) return false
    set((s) => ({ design: { ...s.design, rocket: copyRocket(preset.rocket) } }))
    return true
  },

  loadPorkchop: () => {
    const status = get().porkchopStatus
    if (status === 'ready') return Promise.resolve()
    if (status === 'loading' && porkchopInFlight) return porkchopInFlight
    const id = ++porkchopRequestId
    set({ porkchopStatus: 'loading' })
    const request = computePorkchopAsync().then(
      (grid) => {
        if (id === porkchopRequestId) set({ porkchop: grid, porkchopStatus: 'ready' })
      },
      () => {
        if (id === porkchopRequestId) set({ porkchop: null, porkchopStatus: 'error' })
      },
    )
    const tracked = request.finally(() => {
      if (porkchopInFlight === tracked) porkchopInFlight = null
    })
    porkchopInFlight = tracked
    return tracked
  },
  clearPorkchop: () => {
    porkchopRequestId++
    porkchopInFlight = null
    set({ porkchop: null, porkchopStatus: 'idle' })
  },

  reset: () => set((s) => ({ ...gameData(devStartState({ ...DEFAULT_DEV_PARAMS, seed: s.seed })), epoch: s.epoch + 1 })),
}))

// ---------------------------------------------------------------------------------------------
// Derived values. Pure selectors over the design (usable outside React and in tests) and hooks
// that recompute them whenever the design object changes. Store actions always replace `design`
// with a new object, so a new design reference is exactly "something in the design changed".

type DesignState = Pick<GameState, 'design'>

/**
 * Pure-function memo for transferFor (a Lambert solve): keyed by the two dates, so the same dates
 * give the same Transfer object (a stable reference for React) without recomputing. Not a cache of
 * the design: any change of dates is a different key.
 */
const transferMemo = new Map<string, Transfer | null>()
const TRANSFER_MEMO_MAX = 256

export function memoTransfer(depJd: number, arrJd: number, limits: TofLimits = DEFAULT_PORKCHOP): Transfer | null {
  const key = `${depJd}|${arrJd}|${limits.minTofDays}|${limits.maxTofDays}`
  if (transferMemo.has(key)) return transferMemo.get(key) ?? null
  if (transferMemo.size >= TRANSFER_MEMO_MAX) transferMemo.clear()
  const t = transferFor(depJd, arrJd, limits)
  transferMemo.set(key, t)
  return t
}

/** The Lambert transfer for the chosen dates; null with no dates or no valid transfer between them. */
export function selectTransfer(s: DesignState): Transfer | null {
  const t = s.design.transfer
  return t ? memoTransfer(t.depJd, t.arrJd) : null
}

/** Spacecraft budgets for the chosen arrival (solar power at Mars' distance on the arrival date). */
export function selectSpacecraftStats(s: DesignState): SpacecraftStats {
  const t = selectTransfer(s)
  if (!t) return spacecraftStats(s.design.spacecraft, null)
  const marsAU = norm(bodyState('mars', t.arrJd).r) / AU
  return spacecraftStats(s.design.spacecraft, t.vInfArrKms, marsAU)
}

/** Rocket performance with the current spacecraft (wet mass) as payload. */
export function selectRocketStats(s: DesignState): RocketStats {
  return rocketStats(s.design.rocket, selectSpacecraftStats(s).wetKg)
}

/**
 * launchChecklist memoised on the design object's identity. Store actions never mutate a design,
 * they replace it, so a new reference is exactly "the design changed" and the checklist is
 * recomputed from scratch (Review Focus 2); several components reading it share one evaluation.
 */
const checklistMemo = new WeakMap<MissionDesign, CheckItem[]>()

export function selectChecklist(s: DesignState): CheckItem[] {
  let items = checklistMemo.get(s.design)
  if (!items) {
    items = launchChecklist(s.design)
    checklistMemo.set(s.design, items)
  }
  return items
}

export function selectCanLaunch(s: DesignState): boolean {
  return selectChecklist(s).every((i) => i.ok)
}

const selectDesign = (s: GameState) => s.design

/** Hook form: recomputes when the design changes, stable otherwise (no re-render loops). */
function useDerived<T>(select: (s: DesignState) => T): T {
  const design = useGame(selectDesign)
  return useMemo(() => select({ design }), [design, select])
}

/**
 * capacityToC3 (a ~18-step bisection over rocketStats) memoised per rocket object and C3. Rocket
 * designs are never mutated in place (setRocket copies), so the object identity stands for its
 * contents; the WeakMap lets old designs be collected.
 */
const capacityMemo = new WeakMap<RocketDesign, Map<number, number>>()
const CAPACITY_MEMO_PER_ROCKET = 64

export function capacityKgFor(rocket: RocketDesign, c3: number): number {
  let byC3 = capacityMemo.get(rocket)
  if (!byC3) {
    byC3 = new Map()
    capacityMemo.set(rocket, byC3)
  }
  const hit = byC3.get(c3)
  if (hit !== undefined) return hit
  if (byC3.size >= CAPACITY_MEMO_PER_ROCKET) byC3.clear()
  const kg = capacityToC3(rocket, c3)
  byC3.set(c3, kg)
  return kg
}

/** Payload (kg) the rocket can send to the chosen transfer's C3; 0 without a transfer. */
export function selectCapacityKg(s: DesignState): number {
  const t = selectTransfer(s)
  return t ? capacityKgFor(s.design.rocket, t.c3) : 0
}

export const useTransfer = () => useDerived(selectTransfer)
export const useSpacecraftStats = () => useDerived(selectSpacecraftStats)
export const useRocketStats = () => useDerived(selectRocketStats)
export const useChecklist = () => useDerived(selectChecklist)
export function useCanLaunch(): boolean {
  const items = useChecklist()
  return useMemo(() => items.every((i) => i.ok), [items])
}
export const useCapacityKg = () => useDerived(selectCapacityKg)

// ---------------------------------------------------------------------------------------------
// GameView (ruling R4): the store's data plus everything derived from the design, as one read-only
// snapshot. The Physics panel's CONCEPTS[*].live(view) and later screens read it. It deliberately
// leaves out the pointer state (hoverTransfer) and UI state (designTab): the panel re-renders with
// the view, and hovering the porkchop plot must not re-render it. `porkchop` stays: it changes once,
// when the grid arrives.

/** The store's data fields (no actions, no pointer or UI state). */
export type GameViewState = Pick<
  GameState,
  | 'phase'
  | 'design'
  | 'seed'
  | 'porkchop'
  | 'porkchopStatus'
  | 'launched'
  | 'arrived'
  | 'opsDone'
  | 'launch'
  | 'cruise'
  | 'ops'
  | 'result'
>

export interface GameView extends GameViewState {
  /** Lambert transfer for the chosen dates; null with none chosen or none valid. */
  transfer: Transfer | null
  rocketStats: RocketStats
  spacecraftStats: SpacecraftStats
  checklist: CheckItem[]
  /** Rocket capacity to the transfer's C3, kg (0 without a transfer). */
  capacityKg: number
}

/** Builds a GameView from plain state (pure; for tests and non-React callers). */
export function buildGameView(s: GameViewState): GameView {
  return {
    ...s,
    transfer: selectTransfer(s),
    rocketStats: selectRocketStats(s),
    spacecraftStats: selectSpacecraftStats(s),
    checklist: selectChecklist(s),
    capacityKg: selectCapacityKg(s),
  }
}

const selectViewState = (s: GameState): GameViewState => ({
  phase: s.phase,
  design: s.design,
  seed: s.seed,
  porkchop: s.porkchop,
  porkchopStatus: s.porkchopStatus,
  launched: s.launched,
  arrived: s.arrived,
  opsDone: s.opsDone,
  launch: s.launch,
  cruise: s.cruise,
  ops: s.ops,
  result: s.result,
})

/**
 * Hook form of buildGameView. The state fields are read with a shallow-compared selector and each
 * derived value with its memoized hook, so the view object changes only when something in it does.
 */
export function useGameView(): GameView {
  const state = useGame(useShallow(selectViewState))
  const transfer = useTransfer()
  const rocket = useRocketStats()
  const spacecraft = useSpacecraftStats()
  const checklist = useChecklist()
  const capacityKg = useCapacityKg()
  return useMemo(
    () => ({ ...state, transfer, rocketStats: rocket, spacecraftStats: spacecraft, checklist, capacityKg }),
    [state, transfer, rocket, spacecraft, checklist, capacityKg],
  )
}
