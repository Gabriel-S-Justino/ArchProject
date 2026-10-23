// Modular launcher: stacks of catalog tanks + engines (+ strap-on boosters on the first stage),
// their Δv, thrust-to-weight and burn times, the payload they can send to a launch C3, and a launch
// event timeline. The model is a Δv budget: the stack must supply the ascent budget to the 200 km
// parking orbit (ASCENT_DV plus a gravity-loss term that grows as liftoff TWR falls; game balance,
// see mission.ts) plus the escape burn from that orbit to the chosen C3. Validated against the NASA LSP payload-vs-C3 curves
// (launcher.test.ts). Framework-free: no React, Three.js or DOM.
import { boosterById } from '@/data/boosters'
import { engineById } from '@/data/engines'
import { ASCENT_DV, ASCENT_REFERENCE_TWR, GRAVITY_LOSS_K, MISSION } from '@/data/mission'
import { tankById } from '@/data/tanks'
import type { BoosterPart, EnginePart, TankPart } from '@/game/types'
import { G0, MU_EARTH, R_EARTH } from './constants'
import { escapeBurn } from './orbit'
import { deltaV } from './rocket'

export interface StageDesign {
  tanks: string[]
  engineId: string | null
  engineCount: number
  /** Strap-on boosters, first stage (index 0) only. */
  boosterId?: string
  boosterCount?: number
}

export interface RocketDesign {
  /** Index 0 = bottom stage. */
  stages: StageDesign[]
  fairing: 'small' | 'large'
}

export interface StageStat {
  index: number
  /** Mass at ignition (incl. boosters on stage 0, everything above, payload), kg. */
  m0: number
  /** Mass at burnout before separation (boosters already dropped), kg. */
  mf: number
  /** Δv of the stage (incl. the parallel booster phase on stage 0), m/s. */
  dv: number
  /** Stage 0: liftoff TWR at sea level (core + boosters). Upper stages: vacuum TWR at ignition. */
  twr: number
  /** Core burn time, s. */
  burnTime: number
  /** Core Isp used: stage 0 mean of SL and vacuum Isp, upper stages vacuum Isp, s. */
  ispUsed: number
  errors: string[]
}

export interface RocketStats {
  stages: StageStat[]
  totalDv: number
  liftoffTwr: number
  /** Gross liftoff mass incl. boosters, fairing and payload, kg. */
  massKg: number
  /** US$ M: tanks + engines + boosters + fairing (game balance). */
  costM: number
  valid: boolean
  /** Every rocket-level and stage-level error, human readable. */
  errors: string[]
}

export interface LaunchEvent {
  /** Seconds of real burn time after liftoff (coasts not modelled). */
  t: number
  kind: 'liftoff' | 'booster-sep' | 'stage-sep' | 'fairing-sep' | 'orbit' | 'departure-burn'
  stage?: number
}

export interface LaunchTimeline {
  events: LaunchEvent[]
  reachedOrbit: boolean
  reachedDeparture: boolean
  failure?: 'twr' | 'dv'
}

/** Payload fairing options. Masses and costs are game balance (real 4–5 m fairings: 1.7–2.6 t). */
export const FAIRINGS: Record<RocketDesign['fairing'], { massKg: number; costM: number; label: string }> = {
  small: { massKg: 1500, costM: 3, label: 'Small fairing' },
  large: { massKg: 2500, costM: 5, label: 'Large fairing' },
}

export const MAX_STAGES = 3
export const MIN_ENGINES = 1
export const MAX_ENGINES = 9
/** Game balance: real vehicles fly up to 5–6 strap-ons (Atlas V 551, Vulcan VC6). */
export const MAX_BOOSTERS = 6
/** Upper bound of the capacity bisection, kg. */
export const MAX_PAYLOAD_KG = 200_000
export const MIN_LIFTOFF_TWR = MISSION.minLiftoffTwr
/** Parking-orbit radius the departure burn starts from, m. */
export const PARKING_RADIUS_M = R_EARTH + MISSION.parkingAltitudeM

/**
 * Ascent Δv budget to the parking orbit for a stack lifting off at `liftoffTwr` (with its payload):
 * ASCENT_DV + GRAVITY_LOSS_K × (1/TWR − 1/1.5). Lower TWR → longer vertical climb → more gravity
 * loss. Infinity (unreachable) for TWR ≤ 0 or non-finite TWR.
 */
export function ascentDeltaV(liftoffTwr: number): number {
  if (!(Number.isFinite(liftoffTwr) && liftoffTwr > 0)) return Infinity
  return ASCENT_DV + GRAVITY_LOSS_K * (1 / liftoffTwr - 1 / ASCENT_REFERENCE_TWR)
}

/**
 * Δv a stack lifting off at `liftoffTwr` (with its payload) must deliver to send a spacecraft to
 * `c3` (km²/s²): the ascent budget (ascentDeltaV) plus the escape burn from the 200 km parking
 * orbit. At TWR 1.5 this is ASCENT_DV + escapeBurn. Negative C3 (bound orbits) uses the same
 * vis-viva relation; below circular-orbit energy nothing is burned. Non-finite C3 or TWR ≤ 0 →
 * Infinity (unreachable).
 */
export function requiredDeltaV(c3: number, liftoffTwr: number): number {
  const ascent = ascentDeltaV(liftoffTwr)
  if (!Number.isFinite(c3) || !Number.isFinite(ascent)) return Infinity
  if (c3 >= 0) return ascent + escapeBurn(MU_EARTH, PARKING_RADIUS_M, Math.sqrt(c3) * 1000)
  const vCirc = Math.sqrt(MU_EARTH / PARKING_RADIUS_M)
  const v2 = c3 * 1e6 + (2 * MU_EARTH) / PARKING_RADIUS_M
  return ascent + Math.max(0, Math.sqrt(Math.max(0, v2)) - vCirc)
}

// ---------------------------------------------------------------------------------------------
// Internals

interface Resolved {
  index: number
  label: string
  tanks: TankPart[]
  engine?: EnginePart
  /** Engine count used for mass/thrust: 0 when the count is invalid or there is no engine. */
  n: number
  booster?: BoosterPart
  nb: number
  propKg: number
  /** Tanks + engines, kg. */
  dryKg: number
  costM: number
  errors: string[]
}

/** One constant-mass-flow burn. Mass drops between segments (boosters, stages) are implicit. */
interface Segment {
  stage: number
  m0: number
  mf: number
  isp: number
  duration: number
  /** Events at the end of this segment. */
  after: LaunchEvent['kind'][]
}

const fin = (x: number) => (Number.isFinite(x) ? x : 0)
const isCount = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi

function resolveStage(s: StageDesign, index: number): Resolved {
  const label = `Stage ${index + 1}`
  const errors: string[] = []
  const tanks: TankPart[] = []
  const tankIds = Array.isArray(s?.tanks) ? s.tanks : []
  if (tankIds.length === 0) errors.push(`${label} has no tanks`)
  for (const id of tankIds) {
    const t = tankById(id)
    if (t) tanks.push(t)
    else errors.push(`${label}: unknown tank "${id}"`)
  }

  let engine: EnginePart | undefined
  let n = 0
  if (s?.engineId == null) {
    errors.push(`${label} has no engine`)
  } else {
    engine = engineById(s.engineId)
    if (!engine) errors.push(`${label}: unknown engine "${s.engineId}"`)
    else if (!isCount(s.engineCount, MIN_ENGINES, MAX_ENGINES)) {
      errors.push(`${label} needs ${MIN_ENGINES}–${MAX_ENGINES} engines (has ${fin(s.engineCount)})`)
    } else n = s.engineCount
  }
  if (engine) {
    const seen = new Set<string>()
    for (const t of tanks) {
      if (t.propellant !== engine.propellant && !seen.has(t.id)) {
        seen.add(t.id)
        errors.push(`${label}: ${t.name} holds ${t.propellant} but ${engine.name} burns ${engine.propellant}`)
      }
    }
    if (index === 0 && (engine.thrustSL <= 0 || engine.ispSL <= 0)) {
      errors.push(`${label}: ${engine.name} cannot fire at sea level`)
    }
  }

  let booster: BoosterPart | undefined
  let nb = 0
  const count = s?.boosterCount ?? 0
  if (s?.boosterId !== undefined || count !== 0) {
    if (index > 0) errors.push(`${label}: boosters can only be attached to the first stage`)
    else if (s.boosterId === undefined) errors.push(`${label} has ${fin(count)} boosters but no booster type`)
    else {
      booster = boosterById(s.boosterId)
      if (!booster) errors.push(`${label}: unknown booster "${s.boosterId}"`)
      else if (!isCount(count, 0, MAX_BOOSTERS)) {
        errors.push(`${label} can carry 0–${MAX_BOOSTERS} boosters (has ${fin(count)})`)
      } else nb = count
    }
  }

  const propKg = tanks.reduce((a, t) => a + t.propellantKg, 0)
  const dryKg = tanks.reduce((a, t) => a + t.dryKg, 0) + n * (engine?.massKg ?? 0)
  const costM =
    tanks.reduce((a, t) => a + t.costM, 0) + n * (engine?.costM ?? 0) + nb * (booster?.costM ?? 0)
  return { index, label, tanks, engine, n, booster, nb, propKg, dryKg, costM, errors }
}

/** Thrust, Isp and mass flow of n engines: sea-level-capable bottom stages use SL/vac means. */
function propulsion(thrustSL: number, thrustVac: number, ispSL: number, ispVac: number, n: number, atPad: boolean) {
  const canSL = atPad && thrustSL > 0 && ispSL > 0
  const thrust = n * (canSL ? (thrustSL + thrustVac) / 2 : thrustVac)
  const isp = canSL ? (ispSL + ispVac) / 2 : ispVac
  const mdot = thrust > 0 && isp > 0 ? thrust / (isp * G0) : 0
  return { thrust, isp, mdot, thrustPad: atPad && canSL ? n * thrustSL : 0 }
}

interface Analysis {
  stats: RocketStats
  segments: Segment[]
}

function analyse(r: RocketDesign, payloadKg: number): Analysis {
  const errors: string[] = []
  const stagesIn = Array.isArray(r?.stages) ? r.stages : []
  if (stagesIn.length === 0) errors.push('Rocket has no stages')
  if (stagesIn.length > MAX_STAGES) {
    errors.push(`Rocket has ${stagesIn.length} stages; at most ${MAX_STAGES} stages are allowed`)
  }
  const fairing = FAIRINGS[r?.fairing]
  if (!fairing) errors.push(`Unknown fairing "${String(r?.fairing)}"`)
  const fairingKg = fairing?.massKg ?? 0
  if (!(Number.isFinite(payloadKg) && payloadKg >= 0)) errors.push('Payload mass must be a number ≥ 0 kg')
  const payload = Number.isFinite(payloadKg) ? Math.max(0, payloadKg) : 0

  const res = stagesIn.map((s, i) => resolveStage(s, i))
  const stageKg = res.map((s) => s.propKg + s.dryKg)
  const segments: Segment[] = []
  const stats: StageStat[] = []

  for (let i = 0; i < res.length; i++) {
    const s = res[i]!
    // Everything this stage lifts: payload, upper stages, and the fairing while stage 0 burns.
    const above = payload + stageKg.slice(i + 1).reduce((a, b) => a + b, 0) + (i === 0 ? fairingKg : 0)
    const e = s.engine
    const core = e
      ? propulsion(e.thrustSL, e.thrustVac, e.ispSL, e.ispVac, s.n, i === 0)
      : { thrust: 0, isp: 0, mdot: 0, thrustPad: 0 }
    const b = s.booster
    const bp = b && s.nb > 0 ? propulsion(b.thrustSL, b.thrustVac, b.ispSL, b.ispVac, s.nb, true) : undefined
    const boosterProp = bp ? s.nb * b!.propellantKg : 0
    const boosterDry = bp ? s.nb * b!.dryKg : 0
    const m0 = above + s.propKg + s.dryKg + boosterProp + boosterDry
    const last = i === res.length - 1
    const segs: Segment[] = []

    if (bp && bp.mdot > 0) {
      // Phase A: boosters and core together until the first of them runs dry.
      const tB = boosterProp / bp.mdot
      const tC = core.mdot > 0 ? s.propKg / core.mdot : Infinity
      const tA = Math.min(tB, tC)
      const mdotA = bp.mdot + core.mdot
      const ispA = (bp.thrust + core.thrust) / (mdotA * G0)
      const mA = m0 - mdotA * tA
      const coreLeft = Math.max(0, s.propKg - core.mdot * tA)
      const boosterLeft = Math.max(0, boosterProp - bp.mdot * tA)
      const boostersOutFirst = tB <= tC
      segs.push({ stage: i, m0, mf: mA, isp: ispA, duration: tA, after: boostersOutFirst ? ['booster-sep'] : [] })
      if (boostersOutFirst) {
        // Phase B: boosters dropped, the core burns what is left.
        const mB = mA - boosterDry
        if (coreLeft > 1e-9 && core.mdot > 0) {
          segs.push({ stage: i, m0: mB, mf: mB - coreLeft, isp: core.isp, duration: coreLeft / core.mdot, after: [] })
        }
      } else if (boosterLeft > 1e-9) {
        // Core empty first: the boosters finish their burn carrying it, then everything drops.
        segs.push({ stage: i, m0: mA, mf: mA - boosterLeft, isp: bp.isp, duration: boosterLeft / bp.mdot, after: ['booster-sep'] })
      }
    } else if (core.mdot > 0 && s.propKg > 0) {
      segs.push({ stage: i, m0, mf: m0 - s.propKg, isp: core.isp, duration: s.propKg / core.mdot, after: [] })
    }
    if (!last && segs.length > 0) segs.at(-1)!.after.push('stage-sep')
    if (i === 0 && !last && segs.length > 0) segs.at(-1)!.after.push('fairing-sep')

    const dv = segs.reduce((a, g) => a + deltaV(g.isp, g.m0, g.mf), 0)
    const twr = m0 > 0 ? (i === 0 ? core.thrustPad + (bp?.thrustPad ?? 0) : core.thrust) / (m0 * G0) : 0
    stats.push({
      index: i,
      m0: fin(m0),
      mf: fin(segs.length ? segs.at(-1)!.mf : m0),
      dv: fin(dv),
      twr: fin(twr),
      burnTime: fin(core.mdot > 0 ? s.propKg / core.mdot : 0),
      ispUsed: fin(core.isp),
      errors: s.errors,
    })
    segments.push(...segs)
  }

  const allErrors = [...errors, ...res.flatMap((s) => s.errors)]
  const liftoffTwr = stats[0]?.twr ?? 0
  return {
    segments,
    stats: {
      stages: stats,
      totalDv: fin(stats.reduce((a, s) => a + s.dv, 0)),
      liftoffTwr,
      massKg: fin(stats[0]?.m0 ?? 0),
      costM: fin(res.reduce((a, s) => a + s.costM, 0) + (fairing?.costM ?? 0)),
      valid: allErrors.length === 0,
      errors: allErrors,
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Public API

/** Δv, TWR, masses and validity of a stack carrying `payloadKg`. Never returns NaN/Infinity. */
export function rocketStats(r: RocketDesign, payloadKg: number): RocketStats {
  return analyse(r, payloadKg).stats
}

/**
 * Largest spacecraft mass (kg, 1 kg resolution, bisection over [0, 200,000]) the stack can send to
 * `c3` km²/s². 0 if the stack is invalid, the C3 is not finite, or it cannot get there even empty.
 * Liftoff TWR enters through the gravity-loss term of the ascent budget (heavier payload → lower
 * TWR → larger requirement, so the search stays monotonic); the minimum-TWR pad rule is a launch
 * check (launchTimeline, launch checklist), not part of capacity.
 */
export function capacityToC3(r: RocketDesign, c3: number): number {
  if (!Number.isFinite(c3)) return 0
  const reaches = (kg: number) => {
    const s = rocketStats(r, kg)
    return s.totalDv >= requiredDeltaV(c3, s.liftoffTwr)
  }
  if (!rocketStats(r, 0).valid || !reaches(0)) return 0
  if (reaches(MAX_PAYLOAD_KG)) return MAX_PAYLOAD_KG
  let lo = 0
  let hi = MAX_PAYLOAD_KG
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2
    if (reaches(mid)) lo = mid
    else hi = mid
  }
  return Math.floor(lo)
}

/** Seconds into a constant-thrust burn at which `dv` m/s has been gained. */
function timeForDv(g: Segment, dv: number): number {
  const mdot = (g.m0 - g.mf) / g.duration
  return (g.m0 / mdot) * (1 - Math.exp(-dv / (g.isp * G0)))
}

/**
 * Launch events in real burn seconds (Task 14 compresses them for animation). 'orbit' is when the
 * stack has delivered its ascent budget (ascentDeltaV at its liftoff TWR); 'departure-burn' is when
 * the escape burn to `c3` is complete. Liftoff TWR < MISSION.minLiftoffTwr (or an invalid stack) → only 'liftoff', failure 'twr'. Out of Δv before orbit
 * → failure 'dv'; in orbit but short of the departure C3 → reachedOrbit true, failure 'dv'.
 */
export function launchTimeline(r: RocketDesign, payloadKg: number, c3: number): LaunchTimeline {
  const { stats, segments } = analyse(r, payloadKg)
  const events: LaunchEvent[] = [{ t: 0, kind: 'liftoff' }]
  if (!stats.valid || stats.liftoffTwr < MIN_LIFTOFF_TWR) {
    return {
      events,
      reachedOrbit: false,
      reachedDeparture: false,
      failure: stats.liftoffTwr < MIN_LIFTOFF_TWR ? 'twr' : 'dv',
    }
  }
  const ascentDv = ascentDeltaV(stats.liftoffTwr)
  const departureDv = requiredDeltaV(c3, stats.liftoffTwr)
  let t = 0
  let dv = 0
  let reachedOrbit = false
  let fairingOff = false
  for (const g of segments) {
    const gDv = deltaV(g.isp, g.m0, g.mf)
    if (!reachedOrbit && dv + gDv >= ascentDv) {
      const tOrbit = t + timeForDv(g, ascentDv - dv)
      if (!fairingOff) {
        events.push({ t: tOrbit, kind: 'fairing-sep', stage: g.stage })
        fairingOff = true
      }
      events.push({ t: tOrbit, kind: 'orbit', stage: g.stage })
      reachedOrbit = true
    }
    if (reachedOrbit && dv + gDv >= departureDv) {
      events.push({ t: t + timeForDv(g, Math.max(0, departureDv - dv)), kind: 'departure-burn', stage: g.stage })
      return { events, reachedOrbit, reachedDeparture: true }
    }
    dv += gDv
    t += g.duration
    for (const kind of g.after) {
      if (kind === 'fairing-sep') {
        if (fairingOff) continue
        fairingOff = true
        events.push({ t, kind, stage: g.stage + 1 })
      } else events.push({ t, kind, stage: g.stage })
    }
  }
  return { events, reachedOrbit, reachedDeparture: false, failure: 'dv' }
}
