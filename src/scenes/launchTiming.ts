// Launch animation timing: how the real burn seconds of launchTimeline map onto a ~25 s sequence,
// which camera shot is live, how much Δv has been spent at a moment, and a visual ascent path.
// Pure functions (no three.js, no React, no DOM), unit-tested in launchTiming.test.ts.
//
// Mapping: real time t → animation time a is logarithmic (the first seconds near the pad play
// almost in real time, the long upper-stage burn is compressed hardest), with a minimum gap between
// distinct events so each reads on screen. Events at the same real second (a Falcon Heavy-class
// booster-sep, stage-sep and fairing-sep at 151 s) are shown 0.6 s apart, the mission clock holding
// at that second meanwhile. The inverse a → t is monotonic non-decreasing and is what the scene
// plays.
import { UPPER_STAGE_MIN_TWR, type LaunchEvent, type RocketStats } from '@/physics/launcher'

export type LaunchFailure = 'pad' | 'orbit' | 'departure'
export type SceneEventKind = LaunchEvent['kind'] | 'ignition' | 'cutoff' | 'abort'

export interface SceneEvent {
  kind: SceneEventKind
  stage?: number
  /** Real burn seconds after liftoff. */
  t: number
  /** Animation seconds from the start of the sequence (ignition). */
  a: number
  /** Index into the timeline's events (absent for visual-only events). */
  index?: number
}

export interface LaunchSchedule {
  /** Every event in display order (a non-decreasing). */
  events: SceneEvent[]
  /** Knots of the mapping: a strictly increasing, t non-decreasing (equal across a held moment). */
  knots: { a: number; t: number }[]
  /** Animation time of liftoff (after the ignition pre-roll). */
  liftoffA: number
  /** Animation time of the last event. */
  lastA: number
  /** Animation time at which the sequence ends (after the final hold). */
  endA: number
  /** Real seconds of the last event (the flight's end). */
  tEnd: number
  tau: number
  failure?: LaunchFailure
}

export interface ScheduleOptions {
  failure?: LaunchFailure
  /** Real time the last burning stage runs dry (dv failures end here with an engine cut-off). */
  burnoutT?: number
  /** Animation seconds from liftoff to the last event before gaps are enforced. Default 19. */
  flightA?: number
  /** Ignition to liftoff, s. Default 2.5. */
  preRollA?: number
  /** Hold after the last event, s. Default 2.5. */
  holdA?: number
  /** Minimum animation gap between events at different real times, s. Default 1.5. */
  minGapA?: number
  /** Gap between events at the same real time, s. Default 0.6. */
  sameGapA?: number
  /** Time constant of the logarithmic warp, real s. Default 20. */
  tau?: number
}

/** Events closer than this in real time are "the same moment" and get the short gap. */
const SAME_T = 0.5
/** A pad abort: engines run this long after the release point before shutdown, s. */
const PAD_FIRE_A = 3

const warp = (t: number, tau: number) => Math.log1p(Math.max(0, t) / tau)
const unwarp = (w: number, tau: number) => tau * Math.expm1(w)

/** Builds the animation schedule for a timeline's events. */
export function buildSchedule(events: readonly LaunchEvent[], o: ScheduleOptions = {}): LaunchSchedule {
  const flightA = o.flightA ?? 19
  const preRollA = o.preRollA ?? 2.5
  const holdA = o.holdA ?? 2.5
  const minGapA = o.minGapA ?? 1.5
  const sameGapA = o.sameGapA ?? 0.6
  const tau = o.tau ?? 20
  const ignitionA = Math.min(0.5, preRollA * 0.2)

  const flight: { t: number; kind: SceneEventKind; stage?: number; index?: number }[] = events
    .map((e, index) => ({ ...e, t: Number.isFinite(e.t) ? Math.max(0, e.t) : 0, index }))
    .sort((p, q) => p.t - q.t || p.index - q.index)
  if (flight.length === 0 || flight[0]!.t > 0) flight.unshift({ t: 0, kind: 'liftoff' })

  const out: SceneEvent[] = [{ kind: 'ignition', t: 0, a: ignitionA }]

  if (o.failure === 'pad') {
    for (const e of flight) out.push({ ...e, t: 0, a: preRollA })
    const abortA = preRollA + PAD_FIRE_A
    out.push({ kind: 'abort', t: 0, a: abortA })
    return {
      events: out,
      knots: [{ a: preRollA, t: 0 }],
      liftoffA: preRollA,
      lastA: abortA,
      endA: abortA + holdA,
      tEnd: 0,
      tau,
      failure: 'pad',
    }
  }

  const lastT = flight.at(-1)!.t
  if ((o.failure === 'orbit' || o.failure === 'departure') && o.burnoutT !== undefined && Number.isFinite(o.burnoutT)) {
    flight.push({ kind: 'cutoff', t: Math.max(lastT, o.burnoutT) })
  }
  const tEnd = flight.at(-1)!.t
  const wEnd = warp(tEnd, tau)
  const base = (t: number) => preRollA + (wEnd > 0 ? (flightA * warp(t, tau)) / wEnd : 0)

  // Group events at the same real moment; place groups on the warp with minimum gaps.
  const knots: { a: number; t: number }[] = []
  let prevEnd = -Infinity
  let i = 0
  while (i < flight.length) {
    const t0 = flight[i]!.t
    let j = i
    while (j + 1 < flight.length && flight[j + 1]!.t - t0 < SAME_T) j++
    const a0 = knots.length === 0 ? preRollA : Math.max(base(t0), prevEnd + minGapA)
    knots.push({ a: a0, t: t0 })
    for (let k = i; k <= j; k++) {
      const e = flight[k]!
      out.push({ kind: e.kind, stage: e.stage, t: e.t, a: a0 + (k - i) * sameGapA, ...(e.index !== undefined ? { index: e.index } : {}) })
    }
    prevEnd = a0 + (j - i) * sameGapA
    if (j > i) knots.push({ a: prevEnd, t: t0 }) // hold the clock while the group plays out
    i = j + 1
  }
  const lastA = prevEnd
  return { events: out, knots, liftoffA: preRollA, lastA, endA: lastA + holdA, tEnd, tau, ...(o.failure ? { failure: o.failure } : {}) }
}

/** Real burn seconds shown at animation time `a`: 0 before liftoff, tEnd after the last event. */
export function realTimeAt(s: LaunchSchedule, a: number): number {
  const k = s.knots
  if (!(a > k[0]!.a)) return 0
  const last = k.at(-1)!
  if (a >= last.a) return s.tEnd
  let lo = 0
  while (lo + 1 < k.length && k[lo + 1]!.a <= a) lo++
  const p = k[lo]!
  const q = k[lo + 1]!
  const u = (a - p.a) / (q.a - p.a)
  const w = warp(p.t, s.tau) + u * (warp(q.t, s.tau) - warp(p.t, s.tau))
  return Math.min(q.t, Math.max(p.t, unwarp(w, s.tau)))
}

/** The events already shown at animation time `a`, in order. */
export function eventsShown(s: LaunchSchedule, a: number): SceneEvent[] {
  return s.events.filter((e) => e.a <= a)
}

/** First time (animation s) an event of `kind` (and `stage`, when given) is shown, or Infinity. */
export function eventTime(s: LaunchSchedule, kind: SceneEventKind, stage?: number): number {
  const e = s.events.find((x) => x.kind === kind && (stage === undefined || x.stage === stage))
  return e ? e.a : Infinity
}

// ---------------------------------------------------------------------------------------------
// Δv spent

export interface StageBurn {
  stage: number
  /** Real seconds. */
  start: number
  end: number
  /** Δv this burn delivers in full, m/s (0 for an upper stage too weak to fly). */
  dv: number
  m0: number
  mf: number
}

/**
 * When each stage burns, from the timeline's separations and each stage's burn time. A pad abort
 * burns nothing; an upper stage igniting below UPPER_STAGE_MIN_TWR delivers nothing (the flight
 * stops there, as in launchTimeline).
 */
export function stageBurns(
  events: readonly LaunchEvent[],
  stats: Pick<RocketStats, 'stages'>,
  failure?: LaunchFailure,
): StageBurn[] {
  if (failure === 'pad') return []
  const sepT = (i: number) => events.find((e) => e.kind === 'stage-sep' && e.stage === i)?.t
  const boosterSep = events.find((e) => e.kind === 'booster-sep')?.t ?? 0
  const burns: StageBurn[] = []
  for (const st of stats.stages) {
    const i = st.index
    let start = 0
    if (i > 0) {
      const prev = sepT(i - 1)
      if (prev === undefined) break
      start = prev
    }
    const weak = i > 0 && st.twr < UPPER_STAGE_MIN_TWR
    const end = weak ? start : (sepT(i) ?? start + Math.max(st.burnTime, i === 0 ? boosterSep : 0))
    burns.push({ stage: i, start, end, dv: weak ? 0 : st.dv, m0: st.m0, mf: st.mf })
    if (weak) break
  }
  return burns
}

/** Δv delivered by real time `t`, m/s, following the rocket equation inside each burn. */
export function dvAt(burns: readonly StageBurn[], t: number): number {
  let dv = 0
  for (const b of burns) {
    if (t >= b.end) dv += b.dv
    else if (t > b.start) {
      const p = (t - b.start) / (b.end - b.start)
      const full = Math.log(b.m0 / b.mf)
      if (b.m0 > b.mf && b.mf > 0 && Number.isFinite(full) && full > 0) {
        const m = b.m0 - p * (b.m0 - b.mf)
        dv += (b.dv * Math.log(b.m0 / m)) / full
      } else dv += b.dv * p
    }
  }
  return Number.isFinite(dv) ? dv : 0
}

/** The stage whose engines are running at real time `t` (or the last one that ran), -1 if none. */
export function burningStage(burns: readonly StageBurn[], t: number): number {
  let s = -1
  for (const b of burns) if (t >= b.start) s = b.stage
  return s
}

/** Real time the last burn ends (where a dv failure cuts off). */
export function burnoutTime(burns: readonly StageBurn[]): number {
  return burns.reduce((m, b) => Math.max(m, b.end), 0)
}

// ---------------------------------------------------------------------------------------------
// Camera shots

export type Shot = 'pad' | 'chase' | 'sep' | 'wide'

/** The camera shot plan of a schedule: precomputed once, so the per-frame lookup allocates nothing. */
export interface ShotPlan {
  pad: boolean
  padEnd: number
  wideAt: number
  /** Separation windows [from, to), in order. */
  windows: Float64Array
}

/** Separation windows: from just before a group of separations to a moment after its last one. */
export function shotPlan(s: LaunchSchedule): ShotPlan {
  const padEnd = s.liftoffA + 2.6
  const wideAt = Math.min(eventTime(s, 'orbit'), eventTime(s, 'cutoff')) - 0.4
  const seps = s.events.filter((e) => e.kind === 'booster-sep' || e.kind === 'stage-sep' || e.kind === 'fairing-sep')
  const w: number[] = []
  let k = 0
  while (k < seps.length) {
    let j = k
    while (j + 1 < seps.length && seps[j + 1]!.a - seps[j]!.a < 1.2) j++
    w.push(Math.max(padEnd, seps[k]!.a - 0.7), Math.min(wideAt, seps[j]!.a + 2.6))
    k = j + 1
  }
  return { pad: s.failure === 'pad', padEnd, wideAt, windows: Float64Array.from(w) }
}

export interface ShotState {
  shot: Shot
  since: number
}

/** Which shot is live at animation time `a`, and since when, written into `out` (no allocation). */
export function shotAtPlan(p: ShotPlan, a: number, out: ShotState): ShotState {
  out.shot = 'pad'
  out.since = 0
  if (p.pad || a < p.padEnd) return out
  if (a >= p.wideAt) {
    out.shot = 'wide'
    out.since = p.wideAt
    return out
  }
  out.shot = 'chase'
  out.since = p.padEnd
  for (let i = 0; i < p.windows.length; i += 2) {
    const from = p.windows[i]!
    const to = p.windows[i + 1]!
    if (a >= from && a < to) {
      out.shot = 'sep'
      out.since = from
      return out
    }
    if (a >= to) out.since = to
  }
  return out
}

const plans = new WeakMap<LaunchSchedule, ShotPlan>()

/** Which shot is live at animation time `a`, and since when (for motion within the shot). */
export function shotAt(s: LaunchSchedule, a: number): { shot: Shot; since: number } {
  let p = plans.get(s)
  if (!p) {
    p = shotPlan(s)
    plans.set(s, p)
  }
  return shotAtPlan(p, a, { shot: 'pad', since: 0 })
}

// ---------------------------------------------------------------------------------------------
// Visual ascent path

export interface AscentSample {
  /** Downrange distance, m (visual). */
  x: number
  /** Altitude, m (visual). */
  y: number
  /** Pitch from vertical, rad. */
  pitch: number
  /** Speed, m/s (visual). */
  v: number
}

const G = 9.80665
/** Orbital speed the visual path reaches at the orbit time, m/s. */
const V_ORBIT = 7800
/** Altitudes saturate softly toward about this, m (parking orbit is 200 km). */
const ALT_SCALE = 210_000

/**
 * A plausible-looking gravity-turn path for the camera and sky (not a trajectory computation, and
 * no number on screen comes from it): vertical rise for 10 s, then a pitch-over to near horizontal
 * by `tOrbit`; speed grows from the liftoff acceleration toward orbital speed; altitude saturates
 * softly near the 200 km parking orbit. Sampled once, then read with linear interpolation.
 */
export function ascentPath(tOrbit: number, liftoffTwr: number, tEnd = tOrbit, steps = 800): (t: number, out?: AscentSample) => AscentSample {
  const tO = Math.max(30, Number.isFinite(tOrbit) ? tOrbit : 600)
  const tMax = Math.max(tO, Number.isFinite(tEnd) ? tEnd : tO, 1)
  const acc0 = Math.max(1.5, ((Number.isFinite(liftoffTwr) ? liftoffTwr : 1.2) - 1) * G)
  const c = Math.max(0, (V_ORBIT - acc0 * tO) / (tO * tO))
  const speed = (t: number) => Math.min(V_ORBIT * 1.4, acc0 * t + c * t * t)
  const pitchOf = (t: number) => (t <= 10 ? 0 : Math.min(1, Math.pow((t - 10) / (tO - 10), 0.62)) * ((88 * Math.PI) / 180))
  const dt = tMax / steps
  const xs = new Float64Array(steps + 1)
  const ys = new Float64Array(steps + 1)
  for (let k = 1; k <= steps; k++) {
    const tm = (k - 0.5) * dt
    const v = speed(tm)
    const p = pitchOf(tm)
    xs[k] = xs[k - 1]! + v * Math.sin(p) * dt
    ys[k] = ys[k - 1]! + v * Math.cos(p) * dt
  }
  // `out` (optional) is filled and returned instead of a new object: the scene reads this every frame.
  return (t: number, out: AscentSample = { x: 0, y: 0, pitch: 0, v: 0 }) => {
    const tc = Math.min(tMax, Math.max(0, t))
    const f = tc / dt
    const k = Math.min(steps - 1, Math.floor(f))
    const u = f - k
    out.x = xs[k]! + (xs[k + 1]! - xs[k]!) * u
    out.y = -ALT_SCALE * Math.expm1(-(ys[k]! + (ys[k + 1]! - ys[k]!) * u) / ALT_SCALE)
    out.pitch = pitchOf(tc)
    out.v = speed(tc)
    return out
  }
}
