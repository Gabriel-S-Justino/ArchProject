// Science operations in Mars orbit: MISSION.opsTurns turns of MISSION.turnDays days. Each turn the
// player switches instruments on within the power available; what they observe goes into onboard
// storage and the radio link sends down as much as the real Earth–Mars distance allows (JPL
// Horizons ephemerides, rate ∝ 1/d²). During a solar conjunction nothing goes down.
//
// Every function returns a new state and never mutates its input. All numbers are finite.
// Framework-free: no React, Three.js or DOM.
import { MISSION } from '@/data/mission'
import { SPACECRAFT_PARTS, spacecraftPartById } from '@/data/spacecraftParts'
import { AU } from '@/physics/constants'
import { EPHEMERIS_RANGE, bodyState } from '@/physics/ephemeris'
import { dataRateMbps, dataVolumeGb, signalDelayS, solarConjunction } from '@/physics/link'
import { dot, norm, scale, sub } from '@/physics/vec'
import type { MissionDesign } from './checklist'
import { BATTERY_COVER_HOURS, analyseSpacecraft } from './spacecraft'

export interface OpsTurnReport {
  /** 0-based turn index (displayed as turn + 1). */
  turn: number
  /** Date of the turn, JD (startJd + turn × MISSION.turnDays). */
  jd: number
  earthMarsAU: number
  /** One-way light time Earth ↔ Mars, minutes. */
  delayMin: number
  /** Sun–Earth–Mars angle (at Earth, between the Sun and Mars), degrees. */
  sunAngleDeg: number
  /** Mars within 3° of the Sun as seen from Earth: no downlink this turn. */
  conjunction: boolean
  /** Sun–Mars distance used to scale the solar arrays, AU. */
  sunMarsAU: number
  /** Solar (scaled to sunMarsAU) + RTG output, W. */
  powerGenW: number
  /** Non-instrument loads plus the instruments run, W. */
  powerLoadW: number
  /** Power left for instruments this turn (opsPlanLimits.maxLoadW), W. */
  maxLoadW: number
  /** True when the undamaged instruments together needed more than maxLoadW. */
  powerLimited: boolean
  instrumentsRun: string[]
  dataCollectedGb: number
  /** Downlink capacity of the turn at this distance (0 in conjunction or without power for comms), Gbit. */
  downlinkCapacityGb: number
  dataDownlinkedGb: number
  /** Collected data that did not fit in storage and was overwritten, Gbit. */
  dataLostGb: number
  /** Data left in storage after the turn, Gbit. */
  storedGb: number
  scienceDelivered: number
  notes: string[]
}

export interface OpsState {
  /** Turns completed so far (= 0-based index of the next turn). */
  turn: number
  /** Date of turn 0 (the capture date), JD. */
  startJd: number
  /** Data waiting in storage, Gbit. */
  bufferGb: number
  /** Science points of the data waiting in storage (delivered when that data goes down). */
  bufferScience: number
  /** Science points observed so far (delivered + still on board + lost). */
  collected: number
  /** Science points that reached Earth. */
  delivered: number
  /** Data overwritten because storage was full, Gbit. */
  dataLostGb: number
  turns: OpsTurnReport[]
}

export interface OpsPlan {
  instrumentsOn: string[]
}

const finite = (x: number) => (Number.isFinite(x) ? x : 0)

/** Ephemeris dates are clamped to the covered range so a late turn never throws. */
const clampJd = (jd: number) => Math.min(EPHEMERIS_RANGE.endJd, Math.max(EPHEMERIS_RANGE.startJd, jd))

export const turnJd = (s: OpsState, turn = s.turn) => s.startJd + turn * MISSION.turnDays

/** Angle at Earth between the directions to the Sun and to Mars (solar elongation of Mars), degrees. */
export function sunEarthMarsAngleDeg(jd: number): number {
  const t = clampJd(jd)
  const earth = bodyState('earth', t).r
  const toSun = scale(earth, -1)
  const toMars = sub(bodyState('mars', t).r, earth)
  const c = dot(toSun, toMars) / (norm(toSun) * norm(toMars))
  return finite((Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI)
}

export function startOps(arrJd: number): OpsState {
  return { turn: 0, startJd: arrJd, bufferGb: 0, bufferScience: 0, collected: 0, delivered: 0, dataLostGb: 0, turns: [] }
}

interface PowerBudget {
  sunMarsAU: number
  genW: number
  batteryW: number
  /** Every load except the instruments, W. */
  baseLoadW: number
  /** genW + batteryW − baseLoadW, ≥ 0. */
  maxLoadW: number
  /** Generation + battery cannot carry the bus, comms and recorder: no downlink, no instruments. */
  brownout: boolean
  /** Fitted, undamaged instruments in catalog order. */
  available: string[]
  instrumentLoad: (id: string) => number
}

function fittedCount(design: MissionDesign, id: string): number {
  const n = design.spacecraft.parts[id]
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Power at this turn's date. Generation is the solar arrays at the real Sun–Mars distance
 * (bodyState('mars')) plus any RTG; the battery covers a deficit of up to batteryWh / 4 W (same
 * game-balance rule as the launch checklist).
 */
function powerBudget(s: OpsState, design: MissionDesign, damaged: string[]): PowerBudget {
  const sunMarsAU = norm(bodyState('mars', clampJd(turnJd(s))).r) / AU
  const st = analyseSpacecraft(design.spacecraft, null, sunMarsAU).stats
  const instrumentLoad = (id: string) => fittedCount(design, id) * -(spacecraftPartById(id)?.powerW ?? 0)
  const fitted = Object.keys(design.spacecraft.parts).filter(
    (id) => fittedCount(design, id) > 0 && spacecraftPartById(id)?.category === 'instrument',
  )
  const allInstrumentsW = fitted.reduce((sum, id) => sum + instrumentLoad(id), 0)
  const genW = finite(st.powerGenAtMarsW)
  const batteryW = finite(st.batteryWh / BATTERY_COVER_HOURS)
  const baseLoadW = finite(st.powerLoadW - allInstrumentsW)
  const spare = genW + batteryW - baseLoadW
  const order = (id: string) => SPACECRAFT_PARTS.findIndex((part) => part.id === id)
  return {
    sunMarsAU: finite(sunMarsAU),
    genW,
    batteryW,
    baseLoadW,
    maxLoadW: Math.max(0, finite(spare)),
    brownout: spare < 0,
    available: fitted.filter((id) => !damaged.includes(id)).sort((a, b) => order(a) - order(b)),
    instrumentLoad,
  }
}

/**
 * What the player may switch on this turn: the power left for instruments after every other load
 * (W, never negative) and the fitted instruments not damaged by flares.
 */
export function opsPlanLimits(state: OpsState, design: MissionDesign, damaged: string[]): { maxLoadW: number; available: string[] } {
  const p = powerBudget(state, design, damaged)
  return { maxLoadW: p.maxLoadW, available: p.available }
}

const fmt = (x: number, d = 0) =>
  x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/**
 * Runs the next turn. Throws RangeError when the operations are over, or the plan names an
 * instrument that is not available (unknown, not fitted, damaged) or draws more than maxLoadW.
 *
 * Data and science rule (legacy proportional delivery, js/game/mission.js):
 *   pool data    = stored data + data collected this turn          (Gbit)
 *   pool science = science of the stored data + science collected   (points)
 *   sent         = min(pool data, downlink capacity), capacity = dataVolumeGb(dataRateMbps(rate at
 *                  1 AU, Earth–Mars AU), MISSION.turnDays) (ruling R15; 0 in conjunction or brownout)
 *   delivered    = pool science × sent / pool data
 * Whatever is left stays on board, up to storage = recorder parts + MISSION.bufferGbit; data beyond
 * that is overwritten and its science is lost in the same proportion. With an empty data pool all
 * pooled science goes down whenever there is any downlink capacity.
 */
export function runOpsTurn(state: OpsState, design: MissionDesign, damaged: string[], plan: OpsPlan): OpsState {
  if (state.turn >= MISSION.opsTurns) {
    throw new RangeError(`Operations are over: all ${MISSION.opsTurns} turns have been run`)
  }
  const p = powerBudget(state, design, damaged)
  const run = [...new Set(plan.instrumentsOn)]
  for (const id of run) {
    if (!p.available.includes(id)) {
      const part = spacecraftPartById(id)
      const why = !part ? 'unknown part' : damaged.includes(id) ? 'damaged' : 'not fitted'
      throw new RangeError(`Instrument "${id}" is not available (${why})`)
    }
  }
  const runW = run.reduce((sum, id) => sum + p.instrumentLoad(id), 0)
  if (runW > p.maxLoadW + 1e-9) {
    throw new RangeError(`Plan draws ${fmt(runW, 1)} W but only ${fmt(p.maxLoadW, 1)} W are available for instruments`)
  }

  const jd = turnJd(state)
  const t = clampJd(jd)
  const dM = norm(sub(bodyState('mars', t).r, bodyState('earth', t).r))
  const earthMarsAU = finite(dM / AU)
  const sunAngleDeg = sunEarthMarsAngleDeg(t)
  const conjunction = solarConjunction(sunAngleDeg)
  const st = analyseSpacecraft(design.spacecraft, null, p.sunMarsAU).stats
  const storageGb = finite(st.storageGb) + MISSION.bufferGbit
  const notes: string[] = []

  let collectedGb = 0
  let collectedSci = 0
  for (const id of run) {
    const part = spacecraftPartById(id)!
    const n = fittedCount(design, id)
    collectedGb += n * (part.dataGbPerTurn ?? 0)
    collectedSci += n * (part.science ?? 0)
  }

  const capacityGb =
    conjunction || p.brownout ? 0 : finite(dataVolumeGb(dataRateMbps(st.rateMbpsAt1AU, earthMarsAU), MISSION.turnDays))
  if (conjunction) notes.push(`Solar conjunction: Mars is ${fmt(sunAngleDeg, 1)}° from the Sun, no downlink this turn`)
  if (p.brownout) {
    notes.push(
      `Power deficit: ${fmt(p.genW)} W + battery ${fmt(p.batteryW)} W cannot carry ${fmt(p.baseLoadW)} W of bus, comms and recorder; no downlink`,
    )
  }
  if (!conjunction && !p.brownout && st.rateMbpsAt1AU <= 0) notes.push('No antenna: nothing can be sent to Earth')

  const poolGb = state.bufferGb + collectedGb
  const poolSci = state.bufferScience + collectedSci
  const sentGb = Math.min(poolGb, capacityGb)
  const share = poolGb > 0 ? sentGb / poolGb : capacityGb > 0 ? 1 : 0
  const deliveredSci = poolSci * share
  let leftGb = poolGb - sentGb
  let leftSci = poolSci - deliveredSci
  let lostGb = 0
  if (leftGb > storageGb) {
    lostGb = leftGb - storageGb
    leftSci *= storageGb / leftGb
    leftGb = storageGb
    notes.push(`Storage full (${fmt(storageGb)} Gbit): ${fmt(lostGb, 1)} Gbit of observations lost`)
  }
  if (!conjunction && capacityGb > 0 && poolGb > capacityGb) {
    notes.push(`Link-limited: ${fmt(capacityGb, 1)} Gbit can go down at ${fmt(earthMarsAU, 2)} AU, ${fmt(leftGb, 1)} Gbit waits on board`)
  }

  const allW = p.available.reduce((sum, id) => sum + p.instrumentLoad(id), 0)
  const powerLimited = allW > p.maxLoadW + 1e-9
  if (powerLimited) notes.push(`Power-limited: all instruments need ${fmt(allW, 1)} W, ${fmt(p.maxLoadW, 1)} W available`)

  const report: OpsTurnReport = {
    turn: state.turn,
    jd,
    earthMarsAU,
    delayMin: finite(signalDelayS(dM) / 60),
    sunAngleDeg,
    conjunction,
    sunMarsAU: p.sunMarsAU,
    powerGenW: p.genW,
    powerLoadW: p.baseLoadW + runW,
    maxLoadW: p.maxLoadW,
    powerLimited,
    instrumentsRun: run,
    dataCollectedGb: collectedGb,
    downlinkCapacityGb: capacityGb,
    dataDownlinkedGb: sentGb,
    dataLostGb: lostGb,
    storedGb: leftGb,
    scienceDelivered: deliveredSci,
    notes,
  }
  return {
    turn: state.turn + 1,
    startJd: state.startJd,
    bufferGb: leftGb,
    bufferScience: leftSci,
    collected: state.collected + collectedSci,
    delivered: state.delivered + deliveredSci,
    dataLostGb: state.dataLostGb + lostGb,
    turns: [...state.turns, report],
  }
}
