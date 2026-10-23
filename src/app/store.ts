// The one game store every screen reads. Holds the player's choices (phase, design, seed, flags)
// and the porkchop grid; everything computed from the design (rocket and spacecraft stats,
// checklist, transfer) is derived on read by the selectors below and never stored, so an edit to
// any part of the design is reflected everywhere at once (Review Focus 2).
import { useMemo } from 'react'
import { create } from 'zustand'
import { presetById } from '@/data/presets'
import { launchChecklist, type CheckItem, type MissionDesign } from '@/game/checklist'
import { canEnter, nextPhase, type Phase } from '@/game/flow'
import { spacecraftStats, type SpacecraftDesign, type SpacecraftStats } from '@/game/spacecraft'
import { AU } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import { rocketStats, type RocketDesign, type RocketStats } from '@/physics/launcher'
import { transferFor, type PorkchopGrid, type Transfer } from '@/physics/porkchop'
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

export interface GameState {
  phase: Phase
  design: MissionDesign
  /** Seed for every random event (createRng in src/game/rng.ts). */
  seed: number
  porkchop: PorkchopGrid | null
  porkchopStatus: PorkchopStatus
  /** The porkchop cell under the pointer, for previews; not part of the design. */
  hoverTransfer: Transfer | null
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
  'phase' | 'design' | 'seed' | 'launched' | 'arrived' | 'opsDone' | 'hoverTransfer' | 'launch' | 'cruise' | 'ops' | 'result'
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

  setPhase: (p) => {
    const s = get()
    if (!canEnter(p, s)) return false
    set({ phase: p })
    return true
  },
  next: () => get().setPhase(nextPhase(get().phase)),

  setTransfer: (t) =>
    set((s) => ({ design: { ...s.design, transfer: t ? { depJd: t.depJd, arrJd: t.arrJd } : null } })),
  setHoverTransfer: (t) => set({ hoverTransfer: t }),
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

  reset: () => set((s) => gameData(devStartState({ ...DEFAULT_DEV_PARAMS, seed: s.seed }))),
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

export function memoTransfer(depJd: number, arrJd: number): Transfer | null {
  const key = `${depJd}|${arrJd}`
  if (transferMemo.has(key)) return transferMemo.get(key) ?? null
  if (transferMemo.size >= TRANSFER_MEMO_MAX) transferMemo.clear()
  const t = transferFor(depJd, arrJd)
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

export function selectChecklist(s: DesignState): CheckItem[] {
  return launchChecklist(s.design)
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

export const useTransfer = () => useDerived(selectTransfer)
export const useSpacecraftStats = () => useDerived(selectSpacecraftStats)
export const useRocketStats = () => useDerived(selectRocketStats)
export const useChecklist = () => useDerived(selectChecklist)
export const useCanLaunch = () => useDerived(selectCanLaunch)
