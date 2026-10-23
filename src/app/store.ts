// The one game store every screen reads. Holds the player's choices (phase, design, seed, flags)
// and the porkchop grid; everything computed from the design (rocket and spacecraft stats,
// checklist, transfer) is derived on read by the selectors below and never stored, so an edit to
// any part of the design is reflected everywhere at once (Review Focus 2).
import { useMemo } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { presetById } from '@/data/presets'
import {
  EMPTY_FLIGHT,
  answerEvent,
  autoplay,
  burnTcm as burnTcmNow,
  flightArrive,
  flightBeginCruise,
  flightLaunch,
  flightOpsTurn,
  flightReport,
  nextStop,
  pendingDecision,
  skipTcm as skipTcmNow,
  tickCruise as tickCruiseBy,
  type CruiseProgress,
  type CruiseStopKind,
  type FlightPhase,
  type FlightState,
  type LaunchOutcome,
  type MissionReport,
} from '@/game/autoplay'
import { launchChecklist, type CheckItem, type MissionDesign } from '@/game/checklist'
import type { ArrivalResult } from '@/game/cruise'
import type { EventOption } from '@/game/events'
import type { OpsPlan, OpsState } from '@/game/ops'
import { canEnter, nextPhase, type GameSnapshot, type Phase } from '@/game/flow'
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
  hasSeedParam,
  parseDevParams,
  type DevParams,
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
  /** The rocket left the pad (whether or not it reached its target). */
  launched: boolean
  /** In Mars orbit: operations may start (a flyby leaves this false). */
  arrived: boolean
  opsDone: boolean
  /** The launch of the current flight; null before launch. */
  launch: LaunchOutcome | null
  /** The cruise simulation and the decisions made in it; null before the cruise starts. */
  cruise: CruiseProgress | null
  /** Mars orbit insertion; null until the capture burn. */
  arrival: ArrivalResult | null
  /** Science operations; null until captured. */
  ops: OpsState | null
  /** Score, stars and lessons; set when the flight ends (failed launch, flyby or six turns). */
  result: MissionReport | null

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
  /**
   * Launches the design (launchTimeline with the spacecraft's wet mass to the transfer's C3) and
   * opens the launch screen. A failed launch ends the flight: its report is computed at once and the
   * launch screen explains the failure and leads to the report. False when the checklist is not all
   * go, unless `override` is set and only rocket-performance checks are no-go (selectLaunchOverride).
   */
  startLaunch: (opts?: { override?: boolean }) => boolean
  /** After a successful launch: starts the cruise at the launch date and opens the cruise screen. */
  beginCruise: () => boolean
  /**
   * Advances the cruise by up to `days`, stopping exactly at the next TCM window, flare, 3 days
   * before arrival or arrival. Returns the stop reached, or null. Nothing moves while a decision is pending.
   */
  tickCruise: (days: number) => CruiseStopKind | 'stalled' | null
  /** Burns the TCM due now; false when none is due or the ship cannot afford it. */
  burnTcm: () => boolean
  /** Lets the TCM window due now pass; false when none is due. */
  skipTcm: () => boolean
  /** Answers the flare due now; returns the outcome text, or null when refused. */
  resolveCruiseEvent: (optionId: EventOption['id']) => string | null
  /**
   * The capture burn at the arrival date: captured → operations open; flyby → the flight ends and its
   * report is computed (the arrival screen shows why and leads to the report).
   */
  completeArrival: () => boolean
  /** Runs the next operations turn; false for an invalid plan or when operations are over. */
  runOpsTurn: (plan: OpsPlan) => boolean
  /** Scores the flight (if not yet), computes the lessons and opens the report. */
  finishMission: () => boolean
  /** Back to the design workspace with the same design and seed; the flight is discarded. */
  reviseDesign: () => void
  /**
   * A new game: start state without dev flags, and a fresh seed unless the URL fixed one (R30).
   * Keeps the porkchop grid, which does not depend on the design.
   */
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
  | 'arrival'
  | 'ops'
  | 'result'
>

const FLIGHT_PHASES: readonly Phase[] = ['launch', 'cruise', 'arrival', 'ops', 'report']
const isFlightPhase = (p: Phase): p is FlightPhase => FLIGHT_PHASES.includes(p)

/**
 * The start state for dev params. With `preset=reference` and a phase after launch, the earlier
 * phases are played deterministically with the seed and the default choices (R23,
 * src/game/autoplay.ts), so the screen opens on real state.
 */
export function gameData(start: DevStartState): GameData {
  const flight: FlightState & { phase?: FlightPhase } =
    start.launched && isFlightPhase(start.phase) ? autoplay(start.design, start.seed, start.phase) : EMPTY_FLIGHT
  return {
    phase: flight.phase ?? start.phase,
    design: start.design,
    seed: start.seed,
    launched: flight.phase ? flight.launched : start.launched,
    arrived: flight.phase ? flight.arrived : start.arrived,
    opsDone: flight.phase ? flight.opsDone : start.opsDone,
    hoverTransfer: null,
    designTab: 'trajectory',
    launch: flight.launch,
    cruise: flight.cruise,
    arrival: flight.arrival,
    ops: flight.ops,
    result: flight.result,
  }
}

const SEARCH = typeof window !== 'undefined' ? window.location.search : ''

/** The page address fixes the seed (?seed=): a new game replays the same events (R30). */
export const SEED_FIXED = hasSeedParam(SEARCH)

/** Dev flags are read once, when the store is created; node (tests) has no window. */
function initialDevParams(): DevParams {
  if (typeof window === 'undefined') return DEFAULT_DEV_PARAMS
  const params = parseDevParams(SEARCH)
  // A player's first game gets a fresh seed too; demos and screenshots pass ?seed= (R30).
  return hasSeedParam(SEARCH) ? params : { ...params, seed: freshSeed() }
}

/** A new random seed (R30), from crypto when available. */
export function freshSeed(): number {
  try {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]! % 2_147_483_647
  } catch {
    return Math.floor(Math.random() * 2_147_483_647)
  }
}

/** The flight fields of the state, for the pure transitions in src/game/autoplay.ts. */
const flightOf = (s: GameState): FlightState => ({
  launch: s.launch,
  cruise: s.cruise,
  arrival: s.arrival,
  ops: s.ops,
  result: s.result,
  launched: s.launched,
  arrived: s.arrived,
  opsDone: s.opsDone,
})

/**
 * Checklist items the player may launch against ("Launch anyway"): rocket performance only. The
 * spec lets an underpowered or overloaded rocket fly and fail on the pad or short of Mars so the
 * report can explain why; an incomplete spacecraft, a missing transfer or an over-budget design
 * still cannot launch.
 */
export const OVERRIDABLE_CHECKS: readonly CheckItem['id'][] = ['twr', 'margin']

/** The no-go items a "Launch anyway" would fly against, or null when it is not offered. */
export function selectLaunchOverride(s: DesignState): CheckItem[] | null {
  const noGo = selectChecklist(s).filter((i) => !i.ok)
  return noGo.length > 0 && noGo.every((i) => OVERRIDABLE_CHECKS.includes(i.id)) ? noGo : null
}

/** What the phase gate looks at: the flow snapshot plus the flight. */
export type PhaseGateState = GameSnapshot & Pick<GameState, 'launch' | 'cruise' | 'result'>

/**
 * The flow rules (canEnter) refined by the flight: the launch screen stays open once launched
 * (even against the checklist); cruise needs a launch that reached its departure; arrival needs the
 * cruise at its arrival date; the report needs a finished flight.
 */
export function canEnterPhase(p: Phase, s: PhaseGateState): boolean {
  switch (p) {
    case 'launch':
      return s.launch !== null || canEnter(p, s)
    case 'cruise':
      return canEnter(p, s) && s.launch !== null && !s.launch.failure
    case 'arrival':
      return canEnter(p, s) && s.cruise !== null && s.cruise.sim.jd >= s.cruise.sim.arrJd
    case 'report':
      return canEnter(p, s) && s.result !== null
    default:
      return canEnter(p, s)
  }
}

/** A design edit after launch discards the flight: it no longer matches the spacecraft that flew. */
const scrubFlight = (s: GameState): Partial<GameState> => (s.launched ? { ...EMPTY_FLIGHT } : {})

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
    if (!canEnterPhase(p, s)) return false
    set({ phase: p })
    return true
  },
  next: () => get().setPhase(nextPhase(get().phase)),

  setTransfer: (t) =>
    set((s) => ({ ...scrubFlight(s), design: { ...s.design, transfer: t ? { depJd: t.depJd, arrJd: t.arrJd } : null } })),
  setHoverTransfer: (t) => {
    if (get().hoverTransfer !== t) set({ hoverTransfer: t })
  },
  setDesignTab: (tab) => set({ designTab: tab }),
  setRocket: (r) => set((s) => ({ ...scrubFlight(s), design: { ...s.design, rocket: copyRocket(r) } })),
  setSpacecraft: (sc) => set((s) => ({ ...scrubFlight(s), design: { ...s.design, spacecraft: copySpacecraft(sc) } })),
  applyPreset: (presetId) => {
    const preset = presetById(presetId)
    if (!preset) return false
    set((s) => ({ ...scrubFlight(s), design: { ...s.design, rocket: copyRocket(preset.rocket) } }))
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

  startLaunch: (opts) => {
    const s = get()
    if (!selectCanLaunch(s) && !(opts?.override && selectLaunchOverride(s))) return false
    set({ ...flightLaunch(s.design), phase: 'launch' })
    return true
  },
  beginCruise: () => {
    const s = get()
    const f = flightBeginCruise(flightOf(s), s.design, s.seed)
    if (!f) return false
    set({ ...f, phase: 'cruise' })
    return true
  },
  tickCruise: (days) => {
    const c = get().cruise
    if (!c) return null
    const { progress, stopped } = tickCruiseBy(c, days)
    if (progress !== c) set({ cruise: progress })
    // Time should have moved (no decision pending, a stop ahead) but the propagator returned the
    // same state: report it so the warp stops instead of spinning on the same date.
    else if (stopped === null && days > 0 && !pendingDecision(c) && nextStop(c)) return 'stalled'
    return stopped
  },
  burnTcm: () => {
    const c = get().cruise
    const next = c && burnTcmNow(c)
    if (!next) return false
    set({ cruise: next })
    return true
  },
  skipTcm: () => {
    const c = get().cruise
    const next = c && skipTcmNow(c)
    if (!next) return false
    set({ cruise: next })
    return true
  },
  resolveCruiseEvent: (optionId) => {
    const s = get()
    const r = s.cruise && answerEvent(s.cruise, s.design, s.seed, optionId)
    if (!r) return null
    set({ cruise: r.progress })
    return r.outcome
  },
  completeArrival: () => {
    const s = get()
    const f = flightArrive(flightOf(s), s.design)
    if (!f) return false
    set(f)
    return true
  },
  runOpsTurn: (plan) => {
    const s = get()
    const f = flightOpsTurn(flightOf(s), s.design, plan)
    if (!f) return false
    set(f)
    return true
  },
  finishMission: () => {
    const s = get()
    if (!s.launched) return false
    const f = s.result ? flightOf(s) : flightReport(flightOf(s), s.design)
    set({ ...f, phase: 'report' })
    return true
  },
  reviseDesign: () => set({ ...EMPTY_FLIGHT, phase: 'design' }),

  reset: () =>
    set((s) => ({
      ...gameData(devStartState({ ...DEFAULT_DEV_PARAMS, seed: hasSeedParam(SEARCH) ? s.seed : freshSeed() })),
      epoch: s.epoch + 1,
    })),
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
// GameView (ruling R4): the design-side data plus everything derived from the design, as one
// read-only snapshot. The Physics panel's CONCEPTS[*].live(view) reads it. It deliberately leaves
// out the pointer state (hoverTransfer), the UI state (designTab) and the flight (launch, cruise,
// arrival, ops, result): no concept reads them, and the cruise changes every frame in time warp, so
// the panel would re-render with every frame. `porkchop` stays: it changes once, when the grid
// arrives.

/** The store's data fields the concepts read (no actions, no pointer, UI or flight state). */
export type GameViewState = Pick<GameState, 'phase' | 'design' | 'seed' | 'porkchop' | 'porkchopStatus'>

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
