// The launch checklist: every condition the whole mission design (transfer + rocket + spacecraft)
// must meet before the Launch button unlocks. `launchChecklist` is a pure function of the design
// and recomputes capacity, propellant, power and cost on every call — no caching — so editing any
// one part of the design immediately re-evaluates every item (Review Focus 2).
// Framework-free: no React, Three.js or DOM.
import { MISSION } from '@/data/mission'
import { presetById } from '@/data/presets'
import { AU } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import { MIN_LIFTOFF_TWR, capacityToC3, rocketStats, type RocketDesign } from '@/physics/launcher'
import { norm } from '@/physics/vec'
import { transferFor } from '@/physics/porkchop'
import { formatJd, jdFromIso } from '@/physics/time'
import { BATTERY_COVER_HOURS, MARS_MEAN_DISTANCE_AU, REFERENCE_SPACECRAFT, analyseSpacecraft, type SpacecraftDesign } from './spacecraft'

export interface MissionDesign {
  /** Departure and arrival dates picked on the porkchop plot; null until the player picks a cell. */
  transfer: { depJd: number; arrJd: number } | null
  rocket: RocketDesign
  spacecraft: SpacecraftDesign
}

export interface CheckItem {
  /**
   * 'spacecraft' (bus fitted, no unknown parts, part limits respected) is an addition to the
   * brief's list: without it a spacecraft with no bus would pass every other item.
   */
  id:
    | 'trajectory'
    | 'rocket-valid'
    | 'twr'
    | 'margin'
    | 'budget'
    | 'spacecraft'
    | 'power'
    | 'comms'
    | 'instruments'
    | 'propulsion'
  /** Short English label, e.g. "Launch margin ≥ 10%". */
  label: string
  ok: boolean
  /** The numbers behind the verdict, with units. */
  detail: string
}

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** en-US number with `digits` decimals and thousands separators; "–" for NaN/Infinity. */
function fmt(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return '–'
  if (digits === 0) return NUM.format(Math.round(x))
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Every launch condition, in display order, recomputed from scratch from the design. */
export function launchChecklist(d: MissionDesign): CheckItem[] {
  const transfer = d.transfer ? transferFor(d.transfer.depJd, d.transfer.arrJd) : null
  // Solar power is scaled to the Sun–Mars distance on the arrival date (mean distance without one).
  const marsAU = transfer ? norm(bodyState('mars', transfer.arrJd).r) / AU : MARS_MEAN_DISTANCE_AU
  const sc = analyseSpacecraft(d.spacecraft, transfer ? transfer.vInfArrKms : null, marsAU)
  const s = sc.stats
  const rocket = rocketStats(d.rocket, s.wetKg)
  const capacity = transfer ? capacityToC3(d.rocket, transfer.c3) : 0
  const limit = MISSION.launchMargin * capacity
  const marginPct = Math.round((1 - MISSION.launchMargin) * 100)
  const items: CheckItem[] = []

  // Trajectory
  items.push({
    id: 'trajectory',
    label: 'Transfer selected',
    ok: transfer !== null,
    detail: transfer
      ? `Depart ${formatJd(transfer.depJd)} · arrive ${formatJd(transfer.arrJd)} (${fmt(transfer.tofDays)} days) · ` +
        `C3 ${fmt(transfer.c3, 2)} km²/s² · v∞ ${fmt(transfer.vInfArrKms, 2)} km/s`
      : d.transfer
        ? 'No transfer between these dates: pick a coloured cell on the porkchop plot'
        : 'No transfer selected: pick a cell on the porkchop plot',
  })

  // Rocket
  const rocketOk = rocket.valid && rocket.errors.length === 0
  items.push({
    id: 'rocket-valid',
    label: 'Rocket stack valid',
    ok: rocketOk,
    detail: rocketOk
      ? `${plural(d.rocket.stages.length, 'stage')} · ${fmt(rocket.massKg / 1000, 1)} t at liftoff`
      : rocket.errors.join('; ') || 'Rocket stack is not valid',
  })

  const twrOk = Number.isFinite(rocket.liftoffTwr) && rocket.liftoffTwr >= MIN_LIFTOFF_TWR
  items.push({
    id: 'twr',
    label: `Liftoff TWR ≥ ${fmt(MIN_LIFTOFF_TWR, 1)}`,
    ok: twrOk,
    detail: `Liftoff TWR ${fmt(rocket.liftoffTwr, 2)} with the spacecraft aboard · minimum ${fmt(MIN_LIFTOFF_TWR, 2)}`,
  })

  const marginOk = transfer !== null && capacity > 0 && s.wetKg <= limit
  const spacecraftKg = `Spacecraft ${fmt(s.wetKg)} kg`
  items.push({
    id: 'margin',
    label: `Launch margin ≥ ${marginPct}%`,
    ok: marginOk,
    detail: !transfer
      ? `${spacecraftKg} · no transfer chosen, so no launch C3 to size the rocket for`
      : capacity <= 0
        ? `${spacecraftKg} · this rocket cannot reach C3 ${fmt(transfer.c3, 2)} km²/s²`
        : `${spacecraftKg} · limit ${fmt(limit)} kg (${fmt(MISSION.launchMargin * 100)}% of ${fmt(capacity)} kg at C3 ${fmt(transfer.c3, 2)} km²/s²)`,
  })

  const totalM = rocket.costM + s.costM
  items.push({
    id: 'budget',
    label: 'Within budget',
    ok: totalM <= MISSION.budgetM,
    detail: `Total US$ ${fmt(totalM)} M · budget US$ ${fmt(MISSION.budgetM)} M (rocket ${fmt(rocket.costM)} + spacecraft ${fmt(s.costM)})`,
  })

  // Spacecraft
  const partsCount = Object.values(sc.categoryCounts).reduce((a, b) => a + b, 0)
  items.push({
    id: 'spacecraft',
    label: 'Spacecraft complete',
    ok: sc.partErrors.length === 0,
    detail:
      sc.partErrors.length === 0
        ? `Bus fitted · ${plural(partsCount, 'part')} · ${fmt(s.dryKg)} kg dry`
        : sc.partErrors.join('; '),
  })

  // Game balance: the battery covers a deficit of batteryWh / BATTERY_COVER_HOURS (see spacecraft.ts).
  const batteryW = s.batteryWh / BATTERY_COVER_HOURS
  items.push({
    id: 'power',
    label: 'Power at Mars',
    ok: s.powerGenAtMarsW + batteryW >= s.powerLoadW,
    detail:
      `Generation ${fmt(s.powerGenAtMarsW)} W at ${fmt(marsAU, 2)} AU${transfer ? '' : ' (mean)'} + battery ${fmt(batteryW)} W · ` +
      `load ${fmt(s.powerLoadW)} W`,
  })

  items.push({
    id: 'comms',
    label: 'Radio link to Earth',
    ok: sc.categoryCounts.comms >= 1,
    detail:
      sc.categoryCounts.comms >= 1
        ? `${plural(sc.categoryCounts.comms, 'antenna')} · ${fmt(s.rateMbpsAt1AU, 2)} Mbit/s at 1 AU`
        : 'No comms part: Earth would never hear the spacecraft',
  })

  items.push({
    id: 'instruments',
    label: 'Science instruments',
    ok: sc.categoryCounts.instrument >= 1,
    detail:
      sc.categoryCounts.instrument >= 1
        ? `${plural(sc.categoryCounts.instrument, 'instrument')} · ${fmt(s.science)} science per turn (game balance)`
        : 'No instruments: nothing to observe at Mars',
  })

  const propulsionOk = sc.propulsionErrors.length === 0
  items.push({
    id: 'propulsion',
    label: 'Orbit insertion engine',
    ok: propulsionOk,
    detail:
      propulsionOk && sc.propulsion
        ? `${sc.propulsion.name} · Isp ${fmt(sc.propulsion.ispS ?? 0)} s · ${fmt(s.propellantKg)} kg propellant for ` +
          `${fmt(s.moiDvMs + sc.reserveMs)} m/s (capture ${fmt(s.moiDvMs)} + reserve ${fmt(sc.reserveMs)})`
        : sc.propulsionErrors.join('; '),
  })

  return items
}

/** True when every checklist item is ok. */
export function canLaunch(d: MissionDesign): boolean {
  return launchChecklist(d).every((i) => i.ok)
}

function referenceRocket(): RocketDesign {
  const preset = presetById('reference')
  if (!preset) throw new Error('Rocket preset "reference" is missing from src/data/presets.ts')
  const r = preset.rocket
  // Copy so edits to the design never alias the preset catalog.
  return { ...r, stages: r.stages.map((st) => ({ ...st, tanks: [...st.tanks] })) }
}

/**
 * A design that passes every check: the real minimum-C3 transfer of the late-2026 window
 * (31 Oct 2026 → 20 Aug 2027, C3 ≈ 9.18 km²/s², from the Task 4 porkchop on JPL Horizons data;
 * hard-coded so nothing recomputes the grid), the reference Atlas V 401-class launcher and the
 * reference orbiter.
 */
export const REFERENCE_DESIGN: MissionDesign = {
  transfer: { depJd: jdFromIso('2026-10-31T00:00:00Z'), arrJd: jdFromIso('2027-08-20T00:00:00Z') },
  rocket: referenceRocket(),
  spacecraft: { parts: { ...REFERENCE_SPACECRAFT.parts }, tcmReserveMs: REFERENCE_SPACECRAFT.tcmReserveMs },
}
