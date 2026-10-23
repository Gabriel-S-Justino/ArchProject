// Solar flare events during cruise. Each event is a real M- or X-class flare from NASA DONKI (the
// archived 2024 windows in src/data/generated/donki-flares.json), replayed at a seeded day of the
// cruise; the player picks a response that the spacecraft design may rule out. Risks, costs and
// rewards are game balance (EVENT_RULES) and the UI labels them so.
// Framework-free: no React, Three.js or DOM.
import { DONKI_FLARES } from '@/data/donki'
import { spacecraftPartById } from '@/data/spacecraftParts'
import { transferFor } from '@/physics/porkchop'
import { propellantFromMass } from '@/physics/rocket'
import { formatJd } from '@/physics/time'
import type { MissionDesign } from './checklist'
import type { CruiseState } from './cruise'
import { createRng } from './rng'
import { analyseSpacecraft } from './spacecraft'
import type { DonkiFlare } from './types'

/**
 * Game balance (show as such in the UI). Damage risk per flare is the base risk of its severity,
 * reduced by the spacecraft's radiation shielding for the options that stay pointed normally.
 */
export const EVENT_RULES = {
  /** Base probability that a flare damages an instrument. M class → moderate, X class → severe. */
  baseRisk: { moderate: 0.15, severe: 0.4 },
  /** Damage probability in safe mode (instruments off, spacecraft hunkered down). */
  safeModeRisk: 0.02,
  /** Cruise science lost in safe mode, days. */
  safeModeDays: 5,
  /** Safe mode needs the battery to carry the spacecraft, Wh. */
  safeModeMinBatteryWh: 300,
  /** Shield attitude halves the shielded risk… */
  shieldAttitudeFactor: 0.5,
  /** …at the cost of an attitude maneuver, m/s of propellant. */
  shieldAttitudeDvMs: 2,
  /** Cruise science earned by observing the flare without being damaged. */
  observeScience: { moderate: 2, severe: 4 },
  /** No event in the first days after launch. */
  firstDay: 10,
  /** Minimum spacing between events, days. */
  minSpacingDays: 20,
  /** Events per cruise. */
  minEvents: 2,
  maxEvents: 3,
} as const

export type Severity = 'moderate' | 'severe'

export interface CruiseEvent {
  id: string
  /** Day after launch the flare strikes. */
  day: number
  /** The real DONKI flare (date and class shown to the player). */
  flare: DonkiFlare
  /** M class → moderate, X class → severe. */
  severity: Severity
}

export interface EventOption {
  id: 'safe-mode' | 'keep-observing' | 'shield-attitude'
  label: string
  /** Probability of instrument damage, 0..1 (game balance). */
  risk: number
  cost: string
  available: boolean
  reason?: string
}

export interface ResolvedEvent {
  event: CruiseEvent
  optionId: EventOption['id']
  /** Part id of the instrument disabled, or null. */
  damaged: string | null
  outcome: string
}

export const severityOf = (f: DonkiFlare): Severity => (f.classType.startsWith('X') ? 'severe' : 'moderate')

/** Keeps the event stream independent of the injection-error stream that uses the same seed. */
const EVENT_SEED_SALT = 0x2f6b9e1d

/**
 * 2–3 flare events drawn from the DONKI list by seeded RNG (not by calendar day), on integer days
 * ≥ 10 after launch, < tofDays, at least 20 days apart, in time order, with distinct flares.
 * Fewer events when the cruise is too short to space them; none if it is under 11 days.
 */
export function scheduleEvents(seed: number, tofDays: number): CruiseEvent[] {
  if (!Number.isFinite(tofDays) || DONKI_FLARES.length === 0) return []
  const rng = createRng((Number.isFinite(seed) ? seed : 0) ^ EVENT_SEED_SALT)
  const { firstDay, minSpacingDays, minEvents, maxEvents } = EVENT_RULES
  const lastDay = Math.ceil(tofDays) - 1
  let n = minEvents + Math.floor(rng() * (maxEvents - minEvents + 1))
  n = Math.min(n, DONKI_FLARES.length)
  while (n > 0 && lastDay - firstDay < minSpacingDays * (n - 1)) n--
  if (n === 0 || lastDay < firstDay) return []

  // n sorted offsets in [0, slack], then spread by the minimum spacing: always ≥ 20 days apart.
  const slack = lastDay - firstDay - minSpacingDays * (n - 1)
  const offsets = Array.from({ length: n }, () => Math.floor(rng() * (slack + 1))).sort((a, b) => a - b)
  const pool = [...DONKI_FLARES]
  return offsets.map((u, i) => {
    const flare = pool.splice(Math.min(pool.length - 1, Math.floor(rng() * pool.length)), 1)[0]!
    return { id: `flare-${i + 1}`, day: firstDay + u + minSpacingDays * i, flare, severity: severityOf(flare) }
  })
}

/** What the options depend on: shielding, battery and the propellant available now. */
interface Profile {
  shield: number
  batteryWh: number
  dryKg: number
  propellantKg: number
  ispS: number
}

function optionsFor(e: CruiseEvent, p: Profile): EventOption[] {
  const R = EVENT_RULES
  const base = R.baseRisk[e.severity]
  const shielded = base * (1 - Math.min(1, Math.max(0, p.shield)))
  const kg = propellantFromMass(R.shieldAttitudeDvMs, p.ispS, p.dryKg + p.propellantKg)
  const canTurn = kg <= p.propellantKg
  const canSafe = p.batteryWh >= R.safeModeMinBatteryWh
  return [
    {
      id: 'safe-mode',
      label: 'Enter safe mode',
      risk: R.safeModeRisk,
      cost: `${R.safeModeDays} days of cruise science lost`,
      available: canSafe,
      ...(canSafe
        ? {}
        : {
            reason: `Battery stores ${Math.round(p.batteryWh)} Wh; safe mode needs at least ${R.safeModeMinBatteryWh} Wh`,
          }),
    },
    {
      id: 'keep-observing',
      label: 'Keep observing the flare',
      risk: shielded,
      cost: `+${R.observeScience[e.severity]} cruise science if nothing is damaged`,
      available: true,
    },
    {
      id: 'shield-attitude',
      label: 'Turn the shielded side to the Sun',
      risk: shielded * R.shieldAttitudeFactor,
      cost: `${R.shieldAttitudeDvMs} m/s of propellant${Number.isFinite(kg) ? ` (${kg.toFixed(2)} kg)` : ''}`,
      available: canTurn,
      ...(canTurn
        ? {}
        : { reason: `Not enough propellant for the ${R.shieldAttitudeDvMs} m/s attitude maneuver` }),
    },
  ]
}

/**
 * The responses to a flare for this design. Pass the current cruise state so the propellant check
 * uses what is left in the tank; without it the propellant loaded at launch is assumed.
 */
export function eventOptions(e: CruiseEvent, design: MissionDesign, c?: CruiseState): EventOption[] {
  const t = design.transfer ? transferFor(design.transfer.depJd, design.transfer.arrJd) : null
  const sc = analyseSpacecraft(design.spacecraft, t ? t.vInfArrKms : null)
  return optionsFor(e, {
    shield: sc.stats.shield,
    batteryWh: sc.stats.batteryWh,
    dryKg: c ? c.dryKg : sc.stats.dryKg,
    propellantKg: c ? c.propellantKg : sc.stats.propellantKg,
    ispS: c ? c.ispS : (sc.propulsion?.ispS ?? 0),
  })
}

/**
 * Applies the player's response. One rng draw decides damage (probability = the option's risk);
 * on damage a second draw picks one undamaged fitted instrument to disable. keep-observing earns
 * cruise science only when nothing was damaged; safe-mode adds 5 safe-mode days; shield-attitude
 * burns 2 m/s of propellant. An unavailable option or an already resolved event returns the input
 * state unchanged.
 */
export function resolveEvent(
  c: CruiseState,
  e: CruiseEvent,
  optionId: EventOption['id'],
  rng: () => number,
): { state: CruiseState; outcome: string } {
  const done = c.events.find((r) => r.event.id === e.id)
  if (done) return { state: c, outcome: done.outcome }
  const opt = optionsFor(e, c).find((o) => o.id === optionId)
  if (!opt) return { state: c, outcome: `Unknown option "${optionId}"` }
  if (!opt.available) return { state: c, outcome: `${opt.label} is not available: ${opt.reason ?? ''}`.trim() }

  const R = EVENT_RULES
  const hit = rng() < opt.risk
  let damaged: string | null = null
  if (hit) {
    const intact = c.instruments.filter((id) => !c.damaged.includes(id))
    if (intact.length > 0) damaged = intact[Math.min(intact.length - 1, Math.floor(rng() * intact.length))] ?? null
  }

  let { propellantKg, safeModeDays, cruiseScience } = c
  if (optionId === 'safe-mode') safeModeDays += R.safeModeDays
  if (optionId === 'shield-attitude') {
    const kg = propellantFromMass(R.shieldAttitudeDvMs, c.ispS, c.dryKg + c.propellantKg)
    propellantKg = Math.max(0, propellantKg - kg)
  }
  const science = optionId === 'keep-observing' && !hit ? R.observeScience[e.severity] : 0
  cruiseScience += science

  const date = formatJd(c.depJd + e.day)
  const flare = `${e.flare.classType} flare (DONKI, ${e.flare.peakTime.slice(0, 10)})`
  const damageText = !hit
    ? 'No damage.'
    : damaged
      ? `Radiation damage: ${spacecraftPartById(damaged)?.name ?? damaged} is out of service.`
      : 'Radiation hit, but no further damage: every instrument is already out of service.'
  const extra =
    optionId === 'safe-mode'
      ? ` ${R.safeModeDays} days of cruise science lost.`
      : science > 0
        ? ` +${science} cruise science.`
        : ''
  const outcome = `${opt.label}: ${damageText}${extra}`

  const resolved: ResolvedEvent = { event: e, optionId, damaged, outcome }
  return {
    state: {
      ...c,
      propellantKg,
      safeModeDays,
      cruiseScience,
      damaged: damaged ? [...c.damaged, damaged] : c.damaged,
      events: [...c.events, resolved],
      log: [...c.log, `${date} ${flare} — ${outcome}`],
    },
    outcome,
  }
}
