// The flight after the design: launch, cruise with its decisions, arrival, operations and the
// report, as pure transitions over one FlightState. The store (src/app/store.ts) calls these one at
// a time as the player decides; `autoplay` chains them with default choices so a dev jump
// (`?phase=ops&preset=reference&seed=1`, ruling R23) lands on a screen with real, deterministic
// state — the same state a player who made those choices would have.
//
// Default choices (autoplay): burn every TCM the ship can afford; answer each flare with safe mode
// when available, else the shield attitude, else keep observing; in operations switch on every
// available instrument that still fits the power left, in catalog order.
//
// Every function returns new objects and never mutates its input. Framework-free: no React,
// Three.js or DOM.
import { MISSION } from '@/data/mission'
import { spacecraftPartById } from '@/data/spacecraftParts'
import { launchTimeline, rocketStats, type LaunchTimeline } from '@/physics/launcher'
import { transferFor } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import type { MissionDesign } from './checklist'
import {
  advanceCruise,
  applyTcm,
  arrive,
  startCruise,
  tcmQuote,
  tcmWindows,
  type ArrivalResult,
  type CruiseState,
  type TcmWindowId,
} from './cruise'
import { eventOptions, resolveEvent, type CruiseEvent, type EventOption } from './events'
import type { Phase } from './flow'
import { lessons, type Lesson } from './lessons'
import { opsPlanLimits, runOpsTurn, startOps, type OpsPlan, type OpsState } from './ops'
import { createRng } from './rng'
import { dvLeftMs, failureFromLaunch, scoreMission, type FailureReason, type MissionResult } from './scoring'
import { analyseSpacecraft } from './spacecraft'

// ---------------------------------------------------------------------------------------------
// Launch

export interface LaunchOutcome {
  timeline: LaunchTimeline
  /** Spacecraft wet mass carried, kg. */
  payloadKg: number
  /** Launch energy of the chosen transfer, km²/s² (Infinity without a transfer). */
  c3: number
  /** Why the launch failed, if it did. */
  failure?: 'pad' | 'orbit' | 'departure'
}

/** The launch of this design: launchTimeline with the spacecraft's wet mass to the transfer's C3. */
export function launchMission(design: MissionDesign): LaunchOutcome {
  const t = design.transfer ? transferFor(design.transfer.depJd, design.transfer.arrJd) : null
  const payloadKg = analyseSpacecraft(design.spacecraft, t ? t.vInfArrKms : null).stats.wetKg
  const c3 = t ? t.c3 : Infinity
  const timeline = launchTimeline(design.rocket, payloadKg, c3)
  const failure = failureFromLaunch(timeline)
  return failure ? { timeline, payloadKg, c3, failure } : { timeline, payloadKg, c3 }
}

// ---------------------------------------------------------------------------------------------
// Cruise

/** One decision of the cruise, in the order it was made (for the outcome line and the report). */
export interface CruiseLogEntry {
  jd: number
  kind: 'tcm' | 'skip' | 'event'
  /** e.g. "TCM-1" or "X1.1 flare". */
  title: string
  /** What happened, in a sentence. */
  text: string
  /** Event id or TCM window id. */
  ref: string
}

export interface CruiseProgress {
  sim: CruiseState
  /** TCM windows already decided (burned or skipped). */
  decidedTcms: TcmWindowId[]
  log: CruiseLogEntry[]
}

/** A decision the cruise is waiting for: time stands still until it is made. */
export type CruiseDecision =
  | { kind: 'tcm'; id: TcmWindowId; jd: number }
  | { kind: 'event'; event: CruiseEvent; jd: number }

/** Where time warp stops: a decision, 3 days before arrival, or arrival itself. */
export type CruiseStopKind = 'tcm' | 'event' | 'approach' | 'arrival'

/** Time warp stops this many days before arrival so the approach is never skipped by accident. */
export const APPROACH_STOP_DAYS = 3

/** Dates closer than this (days) are the same moment. */
const EPS = 1e-6

export function beginCruise(design: MissionDesign, seed: number): CruiseProgress {
  return { sim: startCruise(design, seed), decidedTcms: [], log: [] }
}

const eventJd = (c: CruiseState, e: CruiseEvent) => c.depJd + e.day
const isResolved = (c: CruiseState, e: CruiseEvent) => c.events.some((r) => r.event.id === e.id)

/**
 * The decision due now, if any: an undecided TCM window or unresolved flare whose date has come
 * (TCMs first on a shared day). Windows and flares are never skipped over by time, so this is also
 * the guard that keeps time still while a decision is pending.
 */
export function pendingDecision(p: CruiseProgress): CruiseDecision | null {
  const c = p.sim
  const tcm = tcmWindows(c).find((w) => w.jd <= c.jd + EPS && !p.decidedTcms.includes(w.id))
  if (tcm) return { kind: 'tcm', id: tcm.id, jd: tcm.jd }
  const ev = c.schedule.find((e) => eventJd(c, e) <= c.jd + EPS && eventJd(c, e) < c.arrJd && !isResolved(c, e))
  if (ev) return { kind: 'event', event: ev, jd: eventJd(c, ev) }
  return null
}

/** The next place time warp stops, strictly after the current date; null once at arrival. */
export function nextStop(p: CruiseProgress): { jd: number; kind: CruiseStopKind } | null {
  const c = p.sim
  if (c.jd >= c.arrJd - EPS) return null
  const stops: { jd: number; kind: CruiseStopKind }[] = [
    ...tcmWindows(c)
      .filter((w) => !p.decidedTcms.includes(w.id))
      .map((w) => ({ jd: w.jd, kind: 'tcm' as const })),
    ...c.schedule
      .filter((e) => !isResolved(c, e) && eventJd(c, e) < c.arrJd)
      .map((e) => ({ jd: eventJd(c, e), kind: 'event' as const })),
    { jd: c.arrJd - APPROACH_STOP_DAYS, kind: 'approach' },
    { jd: c.arrJd, kind: 'arrival' },
  ]
  const ahead = stops.filter((s) => s.jd > c.jd + EPS).sort((a, b) => a.jd - b.jd)
  return ahead[0] ?? null
}

/**
 * Advances the cruise by up to `days`, stopping exactly at the next stop. Nothing moves while a
 * decision is pending. `stopped` names the stop reached, or is null when time ran out first.
 */
export function tickCruise(p: CruiseProgress, days: number): { progress: CruiseProgress; stopped: CruiseStopKind | null } {
  if (!(days > 0) || pendingDecision(p)) return { progress: p, stopped: null }
  const stop = nextStop(p)
  if (!stop) return { progress: p, stopped: null }
  const step = Math.min(days, stop.jd - p.sim.jd)
  const sim = advanceCruise(p.sim, step)
  if (sim === p.sim) return { progress: p, stopped: null }
  const reached = sim.jd >= stop.jd - EPS
  return { progress: { ...p, sim }, stopped: reached ? stop.kind : null }
}

/** Burns the TCM due now. Null when no TCM is due or the ship cannot afford it (tcmQuote says why). */
export function burnTcm(p: CruiseProgress): CruiseProgress | null {
  const d = pendingDecision(p)
  if (d?.kind !== 'tcm' || !tcmQuote(p.sim).available) return null
  const next = applyTcm(p.sim)
  if ('error' in next) return null
  const tcm = next.tcms[next.tcms.length - 1]!
  const kg = p.sim.propellantKg - next.propellantKg
  return {
    sim: next,
    decidedTcms: [...p.decidedTcms, d.id],
    log: [
      ...p.log,
      {
        jd: p.sim.jd,
        kind: 'tcm',
        title: d.id,
        ref: d.id,
        text: `${d.id} burned ${tcm.dvMs.toFixed(2)} m/s using ${kg.toFixed(1)} kg of propellant.`,
      },
    ],
  }
}

/** Lets the TCM window due now pass without a burn. Null when no TCM is due. */
export function skipTcm(p: CruiseProgress): CruiseProgress | null {
  const d = pendingDecision(p)
  if (d?.kind !== 'tcm') return null
  return {
    ...p,
    decidedTcms: [...p.decidedTcms, d.id],
    log: [...p.log, { jd: p.sim.jd, kind: 'skip', title: d.id, ref: d.id, text: `${d.id} skipped: no burn.` }],
  }
}

/** FNV-1a over a string, folded with the seed: a stable per-event stream that does not depend on order of play. */
function eventSeed(seed: number, id: string): number {
  let h = 0x811c9dc5 ^ (Number.isFinite(seed) ? seed >>> 0 : 0)
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** The random stream that decides a flare's outcome: fixed by the mission seed and the event. */
export const eventRng = (seed: number, e: CruiseEvent) => createRng(eventSeed(seed, e.id))

/** Resolves the flare due now with the player's option. Null when no flare is due or the option is unavailable. */
export function answerEvent(
  p: CruiseProgress,
  design: MissionDesign,
  seed: number,
  optionId: EventOption['id'],
): { progress: CruiseProgress; outcome: string } | null {
  const d = pendingDecision(p)
  if (d?.kind !== 'event') return null
  const opt = eventOptions(d.event, design, p.sim).find((o) => o.id === optionId)
  if (!opt?.available) return null
  const { state, outcome } = resolveEvent(p.sim, d.event, optionId, eventRng(seed, d.event))
  if (state === p.sim) return null
  return {
    progress: {
      ...p,
      sim: state,
      log: [
        ...p.log,
        { jd: d.jd, kind: 'event', title: `${d.event.flare.classType} flare`, ref: d.event.id, text: outcome },
      ],
    },
    outcome,
  }
}

/** Autoplay's flare answer: safe mode if possible, else the shield attitude, else keep observing. */
export function defaultEventOption(options: EventOption[]): EventOption['id'] {
  for (const id of ['safe-mode', 'shield-attitude', 'keep-observing'] as const) {
    if (options.find((o) => o.id === id)?.available) return id
  }
  return 'keep-observing'
}

/** Plays the cruise to the arrival date with the default choices (burnTcms false skips every TCM). */
export function playCruise(
  p: CruiseProgress,
  design: MissionDesign,
  seed: number,
  opts: { burnTcms?: boolean } = {},
): CruiseProgress {
  let cur = p
  for (let guard = 0; guard < 200; guard++) {
    const d = pendingDecision(cur)
    if (d?.kind === 'tcm') {
      cur = (opts.burnTcms !== false ? burnTcm(cur) : null) ?? skipTcm(cur)!
      continue
    }
    if (d?.kind === 'event') {
      const choice = defaultEventOption(eventOptions(d.event, design, cur.sim))
      cur = answerEvent(cur, design, seed, choice)?.progress ?? cur
      if (pendingDecision(cur)?.kind === 'event') break // cannot happen: keep-observing is always available
      continue
    }
    if (cur.sim.jd >= cur.sim.arrJd) break
    const { progress } = tickCruise(cur, Number.MAX_VALUE)
    if (progress === cur) break
    cur = progress
  }
  return cur
}

// ---------------------------------------------------------------------------------------------
// Operations

function fitted(design: MissionDesign, id: string): number {
  const n = design.spacecraft.parts[id]
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** Power an instrument entry draws when switched on (all fitted copies), W. */
export function instrumentLoadW(design: MissionDesign, id: string): number {
  return fitted(design, id) * Math.max(0, -(spacecraftPartById(id)?.powerW ?? 0))
}

/** Every available instrument that still fits the power left, in catalog order. */
export function defaultOpsPlan(state: OpsState, design: MissionDesign, damaged: string[]): OpsPlan {
  const { maxLoadW, available } = opsPlanLimits(state, design, damaged)
  const on: string[] = []
  let load = 0
  for (const id of available) {
    const w = instrumentLoadW(design, id)
    if (load + w <= maxLoadW + 1e-9) {
      on.push(id)
      load += w
    }
  }
  return { instrumentsOn: on }
}

// ---------------------------------------------------------------------------------------------
// Report

export interface MissionReport {
  result: MissionResult
  lessons: Lesson[]
  /** Science delivered in operations + cruise science (the score input). */
  science: number
  opsScience: number
  cruiseScience: number
  /** Rocket + spacecraft cost, US$ M (game balance). */
  costM: number
  /** MISSION.budgetM − costM, US$ M. One value for the score and the report. */
  budgetLeftM: number
  /** Spacecraft Δv left after capture, m/s (0 when not captured). */
  dvLeftMs: number
  safeModeDays: number
  failureReason?: FailureReason
}

/**
 * Rocket + spacecraft cost of the design, US$ M: the rocket with the spacecraft's wet mass aboard
 * (cost does not depend on payload, but this is the same call the lessons make).
 */
export function missionCostM(design: MissionDesign): number {
  const t = design.transfer ? transferFor(design.transfer.depJd, design.transfer.arrJd) : null
  const sc = analyseSpacecraft(design.spacecraft, t ? t.vInfArrKms : null)
  return rocketStats(design.rocket, sc.stats.wetKg).costM + sc.stats.costM
}

// ---------------------------------------------------------------------------------------------
// The whole flight

export interface FlightState {
  launch: LaunchOutcome | null
  cruise: CruiseProgress | null
  arrival: ArrivalResult | null
  ops: OpsState | null
  result: MissionReport | null
  /** The rocket left the pad (whether or not it reached its target). */
  launched: boolean
  /** In Mars orbit: operations may start. */
  arrived: boolean
  opsDone: boolean
}

export const EMPTY_FLIGHT: FlightState = {
  launch: null,
  cruise: null,
  arrival: null,
  ops: null,
  result: null,
  launched: false,
  arrived: false,
  opsDone: false,
}

/** Launches; a failed launch gets its report right away (the flight ends there). */
export function flightLaunch(design: MissionDesign): FlightState {
  const launch = launchMission(design)
  const f: FlightState = { ...EMPTY_FLIGHT, launch, launched: true }
  return launch.failure ? flightReport(f, design) : f
}

/** Starts the cruise after a successful launch; null otherwise or when it already started. */
export function flightBeginCruise(f: FlightState, design: MissionDesign, seed: number): FlightState | null {
  if (!f.launch || f.launch.failure || f.cruise) return null
  return { ...f, cruise: beginCruise(design, seed) }
}

/**
 * Mars orbit insertion once the cruise is at its arrival date: captured → operations start;
 * flyby → the flight ends and its report is computed. Null before the arrival date or twice.
 */
export function flightArrive(f: FlightState, design: MissionDesign): FlightState | null {
  const c = f.cruise
  if (!c || f.arrival || c.sim.jd < c.sim.arrJd) return null
  const arrival = arrive(c.sim)
  if (arrival.captured) return { ...f, arrival, arrived: true, ops: startOps(c.sim.arrJd) }
  return flightReport({ ...f, arrival }, design)
}

/** Runs one operations turn. Null when operations have not started, are over, or the plan is invalid. */
export function flightOpsTurn(f: FlightState, design: MissionDesign, plan: OpsPlan): FlightState | null {
  if (!f.ops || f.opsDone || f.ops.turn >= MISSION.opsTurns) return null
  let ops: OpsState
  try {
    ops = runOpsTurn(f.ops, design, f.cruise?.sim.damaged ?? [], plan)
  } catch (e) {
    if (e instanceof RangeError) return null
    throw e
  }
  return { ...f, ops, opsDone: ops.turn >= MISSION.opsTurns }
}

/** The report: score and lessons from everything that happened (budget left computed once). */
export function flightReport(f: FlightState, design: MissionDesign): FlightState {
  const cruise = f.cruise?.sim ?? null
  const captured = f.arrival?.captured ?? false
  const opsScience = f.ops?.delivered ?? 0
  const cruiseScience = cruise?.cruiseScience ?? 0
  const science = opsScience + cruiseScience
  const costM = missionCostM(design)
  const budgetLeftM = MISSION.budgetM - costM
  const dvLeft = captured ? dvLeftMs(design, f.arrival?.propellantLeftKg ?? 0) : 0
  const safeModeDays = cruise?.safeModeDays ?? 0
  const failureReason: FailureReason | undefined =
    f.launch?.failure ?? (f.arrival && !f.arrival.captured ? f.arrival.reason : undefined)
  const result = scoreMission({ captured, science, budgetLeftM, dvLeftMs: dvLeft, safeModeDays, failureReason })
  const launch: LaunchTimeline = f.launch?.timeline ?? { events: [], reachedOrbit: false, reachedDeparture: false }
  const report: MissionReport = {
    result,
    lessons: lessons({ design, launch, cruise, arrival: f.arrival, ops: f.ops, result }),
    science,
    opsScience,
    cruiseScience,
    costM,
    budgetLeftM,
    dvLeftMs: dvLeft,
    safeModeDays,
    ...(failureReason ? { failureReason } : {}),
  }
  return { ...f, result: report }
}

export type FlightPhase = Extract<Phase, 'launch' | 'cruise' | 'arrival' | 'ops' | 'report'>

/**
 * Plays the flight of `design` with `seed` and the default choices up to the start of `until`
 * (ruling R23): 'launch' → launched; 'cruise' → cruise begun at the launch date; 'arrival' →
 * cruise played to the arrival date; 'ops' → captured, operations not started; 'report' → six
 * turns run and the report computed. A failure on the way stops there, and `phase` is the screen
 * that shows it (the launch or arrival screen, whose report is already computed).
 */
export function autoplay(design: MissionDesign, seed: number, until: FlightPhase): FlightState & { phase: FlightPhase } {
  let f = flightLaunch(design)
  if (until === 'launch' || f.launch?.failure) return { ...f, phase: 'launch' }
  f = flightBeginCruise(f, design, seed) ?? f
  if (until === 'cruise') return { ...f, phase: 'cruise' }
  f = { ...f, cruise: playCruise(f.cruise!, design, seed) }
  if (until === 'arrival') return { ...f, phase: 'arrival' }
  f = flightArrive(f, design) ?? f
  if (!f.arrived) return { ...f, phase: 'arrival' }
  if (until === 'ops') return { ...f, phase: 'ops' }
  for (let i = 0; i < MISSION.opsTurns && f.ops && !f.opsDone; i++) {
    const plan = defaultOpsPlan(f.ops, design, f.cruise?.sim.damaged ?? [])
    f = flightOpsTurn(f, design, plan) ?? f
  }
  return { ...flightReport(f, design), phase: 'report' }
}

/** A short date-stamped line for a log entry, e.g. "15 Nov 2026 · TCM-1". */
export const logLabel = (e: CruiseLogEntry) => `${formatJd(e.jd)} · ${e.title}`
