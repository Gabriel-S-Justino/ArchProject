// Mission outcome, score and stars: the legacy formula (legacy/js/game/scoring.js, Arquitetura.md
// §14) with its safe-mode turns replaced by safe-mode days / 10. Game balance throughout.
// Framework-free: no React, Three.js or DOM.
import { MISSION } from '@/data/mission'
import { G0 } from '@/physics/constants'
import type { LaunchTimeline } from '@/physics/launcher'
import type { MissionDesign } from './checklist'
import { analyseSpacecraft } from './spacecraft'

/** Legacy difficultyMultiplier (js/data/mission.js) on science points. Game balance. */
export const SCORE_DIFFICULTY_MULTIPLIER = 1.5
/** Points lost per safe-mode "turn" (10 safe-mode days). Game balance. */
export const SAFE_MODE_PENALTY = 5
export const SAFE_MODE_DAYS_PER_PENALTY = 10

export type FailureReason = 'pad' | 'orbit' | 'departure' | 'miss' | 'propellant'

export interface MissionResult {
  outcome: 'success' | 'partial' | 'failure'
  score: number
  stars: 0 | 1 | 2 | 3
  /** Why the spacecraft never reached Mars orbit (only when not captured and a reason was given). */
  failureReason?: FailureReason
}

export interface ScoreInput {
  captured: boolean
  /** Operations science delivered + cruise science. */
  science: number
  budgetLeftM: number
  /** Spacecraft Δv left after capture, m/s (0 when not captured; see dvLeftMs). */
  dvLeftMs: number
  safeModeDays: number
  failureReason?: FailureReason
}

const num = (x: number) => (Number.isFinite(x) ? x : 0)

/**
 * outcome: success if captured and science ≥ MISSION.scienceTarget; partial if captured or any
 * science; else failure.
 * score  = science × (1 + 0.5 × budgetShare) × 1.5 + dvLeft / 100 − 5 × safeModeDays / 10,
 *          rounded, ≥ 0; 0 on failure. budgetShare = max(0, budgetLeft) / MISSION.budgetM.
 * stars  = failure 0, partial 1, success 3 with ≥ 20% of the budget left, else 2.
 */
export function scoreMission(input: ScoreInput): MissionResult {
  const science = Math.max(0, num(input.science))
  const budgetLeft = Math.max(0, num(input.budgetLeftM))
  const share = MISSION.budgetM > 0 ? Math.min(1, budgetLeft / MISSION.budgetM) : 0
  const outcome: MissionResult['outcome'] =
    input.captured && science >= MISSION.scienceTarget ? 'success' : input.captured || science > 0 ? 'partial' : 'failure'
  const raw =
    science * (1 + share * 0.5) * SCORE_DIFFICULTY_MULTIPLIER +
    Math.max(0, num(input.dvLeftMs)) / 100 -
    (SAFE_MODE_PENALTY * Math.max(0, num(input.safeModeDays))) / SAFE_MODE_DAYS_PER_PENALTY
  const score = outcome === 'failure' ? 0 : Math.max(0, Math.round(raw))
  const stars: MissionResult['stars'] = outcome === 'failure' ? 0 : outcome === 'partial' ? 1 : share >= 0.2 ? 3 : 2
  const result: MissionResult = { outcome, score, stars }
  if (!input.captured && input.failureReason) result.failureReason = input.failureReason
  return result
}

/** The launch failure, if any: 'pad' (liftoff TWR), 'orbit' (no parking orbit), 'departure' (short of the C3). */
export function failureFromLaunch(t: LaunchTimeline): 'pad' | 'orbit' | 'departure' | undefined {
  if (t.failure === 'twr') return 'pad'
  if (!t.reachedOrbit) return 'orbit'
  if (!t.reachedDeparture) return 'departure'
  return undefined
}

/**
 * Δv the spacecraft can still deliver with `propellantLeftKg` on board, m/s: Isp·g0·ln((dry + prop) / dry)
 * on the design's propulsion system. 0 without propulsion, propellant or a finite input.
 */
export function dvLeftMs(design: MissionDesign, propellantLeftKg: number): number {
  const sc = analyseSpacecraft(design.spacecraft, null)
  const isp = sc.propulsion?.ispS ?? 0
  const dry = sc.stats.dryKg
  const prop = num(propellantLeftKg)
  if (!(isp > 0 && dry > 0 && prop > 0)) return 0
  return num(isp * G0 * Math.log((dry + prop) / dry))
}
