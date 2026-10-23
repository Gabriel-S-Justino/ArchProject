// Spacecraft budgets: mass, propellant for Mars orbit insertion, power at Mars, link rate, storage,
// science and cost, all summed from catalog parts (src/data/spacecraftParts.ts). Pure functions,
// recomputed from the design on every call. Framework-free: no React, Three.js or DOM.
import { MISSION } from '@/data/mission'
import { SPACECRAFT_PARTS, spacecraftPartById } from '@/data/spacecraftParts'
import { MU_MARS, R_MARS } from '@/physics/constants'
import { solarPowerW } from '@/physics/link'
import { captureBurn } from '@/physics/orbit'
import { propellantFor } from '@/physics/rocket'
import type { SpacecraftPart } from './types'

export interface SpacecraftDesign {
  /** Part id → number of copies. Missing, zero, negative or non-finite counts mean "none". */
  parts: Record<string, number>
  /** Trajectory-correction Δv reserve on top of the capture burn, m/s (clamped to 0–150). */
  tcmReserveMs: number
}

export interface SpacecraftStats {
  /** Sum of part masses, kg. */
  dryKg: number
  /** Mars orbit insertion Δv for the arrival v∞ (reserve not included), m/s. 0 without a v∞. */
  moiDvMs: number
  /** Propellant for moiDvMs + tcmReserveMs at the propulsion system's Isp, kg. 0 without propulsion. */
  propellantKg: number
  wetKg: number
  /** Solar output scaled to the Sun–Mars distance plus constant (RTG) output, W. */
  powerGenAtMarsW: number
  /** Total draw of every part that consumes power, W (positive number). */
  powerLoadW: number
  /** Stored battery energy, Wh. */
  batteryWh: number
  /** Sum of the comms parts' downlink rates at 1 AU, Mbit/s. */
  rateMbpsAt1AU: number
  /** Onboard storage of the recorder parts, Gbit (MISSION.bufferGbit, the built-in buffer, is NOT included). */
  storageGb: number
  /** Science points per ops turn (game balance). */
  science: number
  /** US$ M (game balance). */
  costM: number
  /** 0..1 fraction of flare damage risk removed. */
  shield: number
  /** Human-readable design errors; empty when the spacecraft is buildable. */
  errors: string[]
}

/** Mars' mean distance from the Sun (semi-major axis 227.956 million km, NASA Mars Fact Sheet), AU. */
export const MARS_MEAN_DISTANCE_AU = 1.5237

/**
 * Game balance: a battery covers a power deficit of batteryWh / BATTERY_COVER_HOURS watts, i.e. it
 * is sized to carry the spacecraft through a 4-hour eclipse or peak-load window, not to run it.
 */
export const BATTERY_COVER_HOURS = 4

export const TCM_RESERVE_MAX_MS = 150

export const NO_PROPULSION = 'No propulsion system'
export const TOO_MANY_PROPULSION = 'Only one propulsion system allowed'
export const NO_BUS = 'No spacecraft bus'

/** Stats plus the split of errors that the launch checklist reports under separate items. */
export interface SpacecraftAnalysis {
  stats: SpacecraftStats
  /** The single propulsion part in use, if the design has at least one. */
  propulsion: SpacecraftPart | undefined
  /** Propulsion-related errors (none / more than one / burn beyond the system). */
  propulsionErrors: string[]
  /** Everything else: missing bus, unknown parts, too many copies of a part. */
  partErrors: string[]
  /** Copies per category, unknown ids excluded. */
  categoryCounts: Record<SpacecraftPart['category'], number>
  /** tcmReserveMs after clamping to 0–TCM_RESERVE_MAX_MS, m/s. */
  reserveMs: number
}

/** Copies are capped here so absurd counts cannot overflow the sums (every part's `max` is far lower). */
const MAX_COPIES = 100
const count = (n: number | undefined) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(MAX_COPIES, Math.floor(n)) : 0

/** Parse the arrival v∞, km/s → m/s; null for missing, non-finite or negative input. */
const vInfMs = (v: number | null) => (v !== null && Number.isFinite(v) && v >= 0 ? v * 1000 : null)

/**
 * Full spacecraft analysis. `marsDistanceAU` is the Sun–Mars distance used to scale solar power
 * (the checklist passes the distance at the arrival date; default Mars' mean distance).
 */
export function analyseSpacecraft(
  d: SpacecraftDesign,
  vInfArrKms: number | null,
  marsDistanceAU: number = MARS_MEAN_DISTANCE_AU,
): SpacecraftAnalysis {
  const partErrors: string[] = []
  const propulsionErrors: string[] = []
  const categoryCounts: SpacecraftAnalysis['categoryCounts'] = {
    core: 0,
    power: 0,
    comms: 0,
    instrument: 0,
    protection: 0,
    storage: 0,
    propulsion: 0,
  }
  const rAU = Number.isFinite(marsDistanceAU) && marsDistanceAU > 0 ? marsDistanceAU : MARS_MEAN_DISTANCE_AU

  let dryKg = 0
  let costM = 0
  let gen = 0
  let load = 0
  let batteryWh = 0
  let rate = 0
  let storageGb = 0
  let science = 0
  let shield = 0

  for (const [id, raw] of Object.entries(d.parts)) {
    const n = count(raw)
    if (n === 0) continue
    const p = spacecraftPartById(id)
    if (!p) {
      partErrors.push(`Unknown part "${id}"`)
      continue
    }
    if (p.max !== undefined && n > p.max) partErrors.push(`At most ${p.max} × ${p.name}`)
    categoryCounts[p.category] += n
    dryKg += n * p.massKg
    costM += n * p.costM
    if (p.powerW > 0) gen += n * (p.solar ? solarPowerW(p.powerW, rAU) : p.powerW)
    else load += n * -p.powerW
    batteryWh += n * (p.batteryWh ?? 0)
    rate += n * (p.rateMbpsAt1AU ?? 0)
    storageGb += n * (p.storageGb ?? 0)
    science += n * (p.science ?? 0)
    shield += n * (p.radiationShield ?? 0)
  }
  // The system in use; with several fitted (an error) the first in catalog order, independent of key order.
  const propulsion = SPACECRAFT_PARTS.find((p) => p.category === 'propulsion' && count(d.parts[p.id]) > 0)

  if (categoryCounts.core === 0) partErrors.push(NO_BUS)
  if (categoryCounts.propulsion === 0) propulsionErrors.push(NO_PROPULSION)
  if (categoryCounts.propulsion > 1) propulsionErrors.push(TOO_MANY_PROPULSION)

  const reserve = Number.isFinite(d.tcmReserveMs) ? Math.min(TCM_RESERVE_MAX_MS, Math.max(0, d.tcmReserveMs)) : 0
  const v = vInfMs(vInfArrKms)
  const rp = R_MARS + MISSION.capturePeriapsisAltM
  const ra = R_MARS + MISSION.captureApoapsisAltM
  let moiDvMs = v === null ? 0 : captureBurn(MU_MARS, rp, ra, v)
  if (!Number.isFinite(moiDvMs)) moiDvMs = 0

  let propellantKg = 0
  if (propulsion?.ispS) {
    propellantKg = propellantFor(moiDvMs + reserve, propulsion.ispS, dryKg)
    if (!Number.isFinite(propellantKg)) {
      propulsionErrors.push(`${propulsion.name} cannot deliver ${Math.round(moiDvMs + reserve)} m/s`)
      propellantKg = 0
    }
  }

  const stats: SpacecraftStats = {
    dryKg,
    moiDvMs,
    propellantKg,
    wetKg: dryKg + propellantKg,
    powerGenAtMarsW: gen,
    powerLoadW: load,
    batteryWh,
    rateMbpsAt1AU: rate,
    storageGb,
    science,
    costM,
    shield: Math.min(1, shield),
    errors: [...partErrors, ...propulsionErrors],
  }
  return { stats, propulsion, propulsionErrors, partErrors, categoryCounts, reserveMs: reserve }
}

/**
 * Budgets of a spacecraft arriving at Mars with hyperbolic excess `vInfArrKms` (null = no transfer
 * chosen). Propellant covers captureBurn into the MISSION capture orbit plus tcmReserveMs.
 */
export function spacecraftStats(
  d: SpacecraftDesign,
  vInfArrKms: number | null,
  marsDistanceAU: number = MARS_MEAN_DISTANCE_AU,
): SpacecraftStats {
  return analyseSpacecraft(d, vInfArrKms, marsDistanceAU).stats
}

/**
 * A sensible MRO/MAVEN-like orbiter: bus, 20 m² array, one battery, high- and low-gain antennas,
 * camera + spectrometer + radar, 160 Gbit recorder, radiation shielding and a hydrazine system,
 * with a 50 m/s trajectory-correction reserve. About 970 kg dry and US$ 507 M.
 */
export const REFERENCE_SPACECRAFT: SpacecraftDesign = {
  parts: {
    'sc-core': 1,
    'solar-large': 1,
    battery: 1,
    'comms-hga': 1,
    'comms-lga': 1,
    'inst-camera': 1,
    'inst-spectrometer': 1,
    'inst-radar': 1,
    'storage-ssr': 1,
    'shield-radiation': 1,
    'prop-monoprop': 1,
  },
  tcmReserveMs: 50,
}
