// Report lessons: each one ties something that happened in this mission to the physics behind it,
// with the mission's own numbers. Only the lessons relevant to this mission are returned, in the
// order the mission unfolded (launch → cruise → arrival → operations → summary).
// Framework-free: no React, Three.js or DOM.
import { MISSION } from '@/data/mission'
import { spacecraftPartById } from '@/data/spacecraftParts'
import { MIN_LIFTOFF_TWR, ascentDeltaV, requiredDeltaV, rocketStats, type LaunchTimeline } from '@/physics/launcher'
import { transferFor } from '@/physics/porkchop'
import { propellantFromMass } from '@/physics/rocket'
import type { MissionDesign } from './checklist'
import { CAPTURE_MAX_MISS_KM, type ArrivalResult, type CruiseState } from './cruise'
import { EVENT_RULES } from './events'
import type { OpsState } from './ops'
import { SAFE_MODE_DAYS_PER_PENALTY, SAFE_MODE_PENALTY, type MissionResult } from './scoring'
import { MARS_MEAN_DISTANCE_AU, analyseSpacecraft } from './spacecraft'

export interface Lesson {
  id: string
  title: string
  text: string
  formula?: string
}

export interface MissionHistory {
  design: MissionDesign
  launch: LaunchTimeline
  cruise: CruiseState | null
  arrival: ArrivalResult | null
  ops: OpsState | null
  result: MissionResult
}

/** en-US number with `d` decimals; "–" for NaN/Infinity so a lesson never shows NaN. */
function fmt(x: number, d = 0): string {
  if (!Number.isFinite(x)) return '–'
  return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const partName = (id: string) => spacecraftPartById(id)?.name ?? id
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const turnsLabel = (ns: number[]) => `${ns.length === 1 ? 'Turn' : 'Turns'} ${list(ns.map(String))}`

export function lessons(history: MissionHistory): Lesson[] {
  const { design, launch, cruise, arrival, ops, result } = history
  const out: Lesson[] = []
  const transfer = design.transfer ? transferFor(design.transfer.depJd, design.transfer.arrJd) : null
  const sc = analyseSpacecraft(design.spacecraft, transfer ? transfer.vInfArrKms : null)
  const rocket = rocketStats(design.rocket, sc.stats.wetKg)
  const twr = rocket.liftoffTwr
  const reason = result.failureReason

  // --- Launch ---
  if (reason === 'pad' || launch.failure === 'twr') {
    out.push({
      id: 'pad',
      title: 'Too heavy to leave the pad',
      text:
        `Liftoff TWR (thrust ÷ weight) was ${fmt(twr, 2)} with the ${fmt(sc.stats.wetKg)} kg spacecraft aboard. ` +
        `Below 1 the engines cannot even lift the rocket; below ${fmt(MIN_LIFTOFF_TWR, 1)} it climbs so slowly that gravity ` +
        `eats the propellant. More first-stage engines, strap-on boosters or less mass above them raise the TWR.`,
      formula: 'TWR = F_thrust / (m · g₀)',
    })
  } else if (!launch.reachedOrbit) {
    const need = ascentDeltaV(twr)
    out.push({
      id: 'orbit',
      title: 'Short of orbit',
      text:
        `Reaching the ${fmt(MISSION.parkingAltitudeM / 1000)} km parking orbit needed ${fmt(need)} m/s at a liftoff TWR of ` +
        `${fmt(twr, 2)} (orbital speed plus gravity and drag losses); the stack could give ${fmt(rocket.totalDv)} m/s. ` +
        `Δv grows only with the logarithm of the mass ratio, so staging — dropping empty tanks — buys far more than a bigger tank.`,
      formula: 'Δv = Isp · g₀ · ln(m₀ / m_f)',
    })
  } else if (!launch.reachedDeparture) {
    const c3 = transfer?.c3 ?? 0
    const total = requiredDeltaV(c3, twr)
    const ascent = ascentDeltaV(twr)
    out.push({
      id: 'departure',
      title: 'Not enough energy for Mars',
      text:
        `The transfer needs a launch energy C3 of ${fmt(c3, 2)} km²/s² (v∞ ${fmt(Math.sqrt(Math.max(0, c3)), 2)} km/s). ` +
        `That is ${fmt(total)} m/s in total — ${fmt(ascent)} m/s to orbit plus a ${fmt(total - ascent)} m/s escape burn — ` +
        `and the stack had ${fmt(rocket.totalDv)} m/s. A lighter spacecraft, a stronger upper stage or a lower-C3 date on the porkchop plot closes the gap.`,
      formula: 'Δv_escape = √(v∞² + 2μ/r) − √(μ/r)',
    })
  }

  // --- Cruise ---
  if (cruise && cruise.safeModeDays > 0) {
    const pts = (SAFE_MODE_PENALTY * cruise.safeModeDays) / SAFE_MODE_DAYS_PER_PENALTY
    out.push({
      id: 'safe-mode',
      title: 'Safe mode',
      text:
        `Safe mode protected the electronics but cost ${fmt(cruise.safeModeDays)} days of observation ` +
        `(${fmt(pts, 1)} score points). With the instruments off and the spacecraft hunkered down, a flare's protons ` +
        `have little to upset — risk drops to ${fmt(EVENT_RULES.safeModeRisk * 100)}% — but nothing is observed either.`,
    })
  }
  if (cruise && cruise.damaged.length > 0) {
    const names = cruise.damaged.map(partName)
    out.push({
      id: 'flare-damage',
      title: 'Solar flare damage',
      text:
        `Flare protons disabled the ${list(names)}. High-energy particles flip bits and burn out electronics; ` +
        `the design's shielding removed ${fmt(cruise.shield * 100)}% of the risk. Shielding, a shield attitude or safe mode ` +
        `trade mass, propellant or observing time for protection.`,
    })
  }

  // --- Arrival ---
  if (arrival?.reason === 'miss' || reason === 'miss') {
    const missKm = arrival?.missKm ?? 0
    const tcms = cruise?.tcms ?? []
    const done =
      tcms.length > 0
        ? `TCMs flown: ${tcms.map((t) => `day ${fmt((t.jd - (cruise?.depJd ?? t.jd)))} (${fmt(t.dvMs, 2)} m/s)`).join(', ')}.`
        : 'No TCM (trajectory correction maneuver) was flown.'
    out.push({
      id: 'miss',
      title: 'Missed Mars',
      text:
        `On the arrival date the spacecraft was ${fmt(missKm)} km from its aim point, Mars' centre; capture needs an aim error of ${fmt(CAPTURE_MAX_MISS_KM)} km or less. ${done} ` +
        `Early corrections are cheaper: a small velocity error grows into a miss roughly in proportion to the time left, so a ` +
        `burn of a few m/s a month after launch fixes what takes far more near Mars.`,
      formula: 'miss ≈ δv × t_remaining',
    })
  }
  if (arrival && (arrival.reason === 'propellant' || reason === 'propellant')) {
    const dry = cruise?.dryKg ?? sc.stats.dryKg
    const isp = cruise?.ispS ?? sc.propulsion?.ispS ?? 0
    const needKg = propellantFromMass(arrival.moiDvMs, isp, dry + arrival.propellantLeftKg)
    out.push({
      id: 'propellant',
      title: 'Not enough propellant to brake',
      text:
        `Mars was approached at v∞ ${fmt(arrival.vInfKms, 2)} km/s. Braking into the ${fmt(MISSION.capturePeriapsisAltM / 1000)} × ` +
        `${fmt(MISSION.captureApoapsisAltM / 1000)} km orbit needed a ${fmt(arrival.moiDvMs)} m/s burn — ${fmt(needKg)} kg of ` +
        `propellant — and only ${fmt(arrival.propellantLeftKg, 1)} kg was left, so the spacecraft flew past on a hyperbola. ` +
        `Every m/s spent on corrections comes out of the capture reserve.`,
      formula: 'Δv_MOI = √(v∞² + 2μ/r_p) − √(μ(2/r_p − 2/(r_p + r_a)))',
    })
  }
  if (arrival?.captured) {
    out.push({
      id: 'capture',
      title: 'Captured into Mars orbit',
      text:
        `The spacecraft arrived ${fmt(arrival.vInfKms, 2)} km/s faster than Mars. Falling into Mars' gravity well speeds it up, ` +
        `so the ${fmt(arrival.moiDvMs)} m/s burn at periapsis was enough to stay. A large ellipse is cheaper to enter than a low circular orbit.`,
      formula: 'Δv_MOI = √(v∞² + 2μ/r_p) − √(μ(2/r_p − 2/(r_p + r_a)))',
    })
  }

  // --- Operations ---
  if (ops && ops.turns.length > 0) {
    const conj = ops.turns.filter((t) => t.conjunction)
    if (conj.length > 0) {
      const minAngle = Math.min(...conj.map((t) => t.sunAngleDeg))
      const held = conj.reduce((m, t) => Math.max(m, t.storedGb), 0)
      out.push({
        id: 'conjunction',
        title: 'Solar conjunction',
        text:
          `${turnsLabel(conj.map((t) => t.turn + 1))}: Mars was within 3° of the Sun as seen from Earth (closest ${fmt(minAngle, 1)}°). ` +
          `The Sun's plasma scrambles radio signals passing near it, so real missions stop commanding and downlinking. ` +
          `Nothing went down; up to ${fmt(held, 1)} Gbit waited in storage.`,
      })
    }

    const linkLimited = ops.turns.filter((t) => !t.conjunction && t.downlinkCapacityGb > 0 && t.storedGb > 1e-9)
    // Quote only turns whose link was up: Mars is farthest at conjunction, where nothing goes down
    // (the conjunction lesson covers those turns). No working link at all → no lesson.
    const linkUp = ops.turns.filter((t) => !t.conjunction && t.downlinkCapacityGb > 0)
    if ((linkLimited.length > 0 || ops.dataLostGb > 0) && linkUp.length > 0) {
      const farTurn = linkUp.reduce((a, t) => (t.earthMarsAU > a.earthMarsAU ? t : a))
      const far = farTurn.earthMarsAU
      out.push({
        id: 'data-limited',
        title: 'Science limited by the radio link',
        text:
          `Earth was up to ${fmt(far, 2)} AU from Mars (${fmt(farTurn.delayMin, 1)} light-minutes). Radio power spreads over a ` +
          `sphere, so at ${fmt(far, 2)} AU the antenna sends only ${fmt(100 / (far * far))}% of its 1 AU rate: ` +
          `${fmt(farTurn.downlinkCapacityGb, 1)} Gbit per turn. ` +
          (ops.dataLostGb > 0 ? `Storage filled and ${fmt(ops.dataLostGb, 1)} Gbit of observations were overwritten. ` : '') +
          `A bigger antenna or a laser terminal returns more of what the instruments see.`,
        formula: 'R(d) = R₁ₐᵤ / d²',
      })
    }

    const limited = ops.turns.filter((t) => t.powerLimited)
    if (limited.length > 0) {
      const first = limited[0]!
      const r = first.sunMarsAU || MARS_MEAN_DISTANCE_AU
      const solar = Object.entries(design.spacecraft.parts).some(([id, n]) => n > 0 && spacecraftPartById(id)?.solar)
      const budget =
        `${turnsLabel(limited.map((t) => t.turn + 1))}: not every instrument could run — ${fmt(first.powerGenW)} W of generation ` +
        `and the battery left ${fmt(first.maxLoadW)} W for instruments after the bus, radio and recorder. `
      out.push({
        id: 'power-limited',
        title: 'Power-limited operations',
        text: solar
          ? budget +
            `Mars was ${fmt(r, 2)} AU from the Sun, so sunlight is spread over ${fmt(r * r, 2)}× the area and each array gives ` +
            `only ${fmt(100 / (r * r))}% of its 1 AU output. More array area, an RTG or a bigger battery fix it, at the cost of mass.`
          : budget +
            `With no solar arrays everything rests on the RTG and the battery. At Mars (${fmt(r, 2)} AU) an array still gives ` +
            `${fmt(100 / (r * r))}% of its 1 AU output — usually the cheapest watts.`,
        formula: 'P(r) = P₁ₐᵤ / r²',
      })
    }
  }

  // --- Summary ---
  const science = (ops?.delivered ?? 0) + (cruise?.cruiseScience ?? 0)
  const budgetLeft = MISSION.budgetM - (rocket.costM + sc.stats.costM)
  if (result.outcome === 'success') {
    const share = budgetLeft / MISSION.budgetM
    out.push({
      id: 'success',
      title: 'Mission accomplished',
      text:
        `${fmt(science, 1)} science points reached Earth (target ${fmt(MISSION.scienceTarget)}) with US$ ${fmt(budgetLeft)} M ` +
        `(${fmt(share * 100)}%) of the budget left: ${result.stars} star${result.stars === 1 ? '' : 's'}, score ${fmt(result.score)}.` +
        (result.stars < 3 ? ' Finish with at least 20% of the budget unspent for the third star.' : ''),
    })
  } else if (result.outcome === 'partial') {
    out.push({
      id: 'partial',
      title: 'Partial success',
      text: arrival?.captured
        ? `${fmt(science, 1)} of ${fmt(MISSION.scienceTarget)} science points reached Earth. More instruments, more power or a faster link would close the gap.`
        : `The spacecraft never entered Mars orbit, but ${fmt(science, 1)} science points from the cruise reached Earth.`,
    })
  }

  // Cruise duration closes a mission that got there.
  if (arrival && cruise) {
    out.push({
      id: 'cruise-time',
      title: 'Time of flight',
      text: `The cruise lasted ${fmt((cruise.arrJd - cruise.depJd))} days on a transfer orbit around the Sun, obeying Kepler's laws all the way.`,
    })
  }
  return out
}
