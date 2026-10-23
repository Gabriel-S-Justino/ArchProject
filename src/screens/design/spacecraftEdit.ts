// Pure edits and derived numbers for the spacecraft tab. Every edit returns a new design.
import { SPACECRAFT_PARTS, spacecraftPartById } from '@/data/spacecraftParts'
import { BATTERY_COVER_HOURS, TCM_RESERVE_MAX_MS, type SpacecraftDesign, type SpacecraftStats } from '@/game/spacecraft'
import type { SpacecraftCategory, SpacecraftPart } from '@/game/types'
import { AU } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import { norm, sub } from '@/physics/vec'

/** Display order and names of the part categories. */
export const CATEGORIES: { id: SpacecraftCategory; name: string; line: string }[] = [
  { id: 'core', name: 'Bus', line: 'Structure, computer, attitude and thermal control. Exactly one.' },
  { id: 'power', name: 'Power', line: 'Solar output falls with the square of the distance from the Sun.' },
  { id: 'comms', name: 'Communications', line: 'The data rate falls with the square of the distance from Earth.' },
  { id: 'instrument', name: 'Instruments', line: 'Science per operations turn and the data each one makes.' },
  { id: 'storage', name: 'Data storage', line: 'Holds observations until the next ground-station pass.' },
  { id: 'protection', name: 'Protection', line: 'Shielding against solar flares and dust.' },
  { id: 'propulsion', name: 'Propulsion', line: 'One system brakes the spacecraft into Mars orbit.' },
]

export function partsIn(category: SpacecraftCategory): SpacecraftPart[] {
  return SPACECRAFT_PARTS.filter((p) => p.category === category)
}

/** Highest count the stepper offers: the part's `max`, or 4 for parts without one (game limit of the UI). */
export const UNCAPPED_STEP_MAX = 4
export const stepMax = (p: SpacecraftPart) => p.max ?? UNCAPPED_STEP_MAX

export function partCount(d: SpacecraftDesign, id: string): number {
  const n = d.parts[id]
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** Sets a part's count, clamped to 0…stepMax; 0 removes the key. */
export function setPartCount(d: SpacecraftDesign, id: string, n: number): SpacecraftDesign {
  const p = spacecraftPartById(id)
  const parts = { ...d.parts }
  const v = p ? Math.min(stepMax(p), Math.max(0, Math.round(n))) : 0
  if (v === 0) delete parts[id]
  else parts[id] = v
  return { ...d, parts }
}

/** Fits exactly one propulsion system (null = none), removing any other. */
export function setPropulsion(d: SpacecraftDesign, id: string | null): SpacecraftDesign {
  const parts = { ...d.parts }
  for (const p of partsIn('propulsion')) delete parts[p.id]
  if (id && spacecraftPartById(id)?.category === 'propulsion') parts[id] = 1
  return { ...d, parts }
}

/** The fitted propulsion part's id (the first in catalog order), or null. */
export function propulsionId(d: SpacecraftDesign): string | null {
  return partsIn('propulsion').find((p) => partCount(d, p.id) > 0)?.id ?? null
}

export function setReserve(d: SpacecraftDesign, ms: number): SpacecraftDesign {
  const v = Number.isFinite(ms) ? Math.min(TCM_RESERVE_MAX_MS, Math.max(0, Math.round(ms))) : 0
  return { ...d, parts: { ...d.parts }, tcmReserveMs: v }
}

/** Earth–Mars distance on a date, AU (ephemeris positions). */
export function earthMarsDistanceAU(jd: number): number {
  const d = norm(sub(bodyState('mars', jd).r, bodyState('earth', jd).r)) / AU
  return Number.isFinite(d) ? d : Number.NaN
}

/** Sun–Mars distance on a date, AU. */
export function sunMarsDistanceAU(jd: number): number {
  const d = norm(bodyState('mars', jd).r) / AU
  return Number.isFinite(d) ? d : Number.NaN
}

export type PowerVerdict =
  | { kind: 'n/a'; reason: string }
  | { kind: 'ok' | 'bad'; supplyW: number; batteryW: number; loadW: number; marginW: number }

/**
 * Power at Mars against the load, the battery covering a deficit of batteryWh / BATTERY_COVER_HOURS
 * (game balance). Not applicable while there is nothing to power (no bus): an empty build would
 * otherwise read as a green 0 W ≥ 0 W.
 */
export function powerVerdict(d: SpacecraftDesign, s: SpacecraftStats): PowerVerdict {
  const hasBus = partsIn('core').some((p) => partCount(d, p.id) > 0)
  if (!hasBus || s.powerLoadW <= 0) return { kind: 'n/a', reason: hasBus ? 'Nothing draws power yet' : 'No bus fitted yet' }
  const batteryW = s.batteryWh / BATTERY_COVER_HOURS
  const supplyW = s.powerGenAtMarsW + batteryW
  return { kind: supplyW >= s.powerLoadW ? 'ok' : 'bad', supplyW, batteryW, loadW: s.powerLoadW, marginW: supplyW - s.powerLoadW }
}

/** Data volume the instruments make per operations turn, Gbit (game balance). */
export function dataPerTurnGb(d: SpacecraftDesign): number {
  return SPACECRAFT_PARTS.reduce((a, p) => a + partCount(d, p.id) * (p.dataGbPerTurn ?? 0), 0)
}
