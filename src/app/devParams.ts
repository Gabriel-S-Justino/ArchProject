// Dev URL flags: `?phase=<phase>&preset=reference&seed=<int>` jump straight to a screen for
// development and demos (ruling R23). Pure: takes the search string, never reads `window`
// (the store passes `window.location.search` once at creation). Bad values fall back per field to
// mission select, no preset and seed 1, without throwing (Review Focus 5).
import { presetById } from '@/data/presets'
import { REFERENCE_DESIGN, type MissionDesign } from '@/game/checklist'
import { canEnter, isPhase, type GameSnapshot, type Phase } from '@/game/flow'
import type { RocketDesign } from '@/physics/launcher'
import { REFERENCE_SPACECRAFT, type SpacecraftDesign } from '@/game/spacecraft'

export interface DevParams {
  phase: Phase
  preset: 'reference' | null
  seed: number
}

export const DEFAULT_DEV_PARAMS: DevParams = { phase: 'select', preset: null, seed: 1 }

const INT = /^-?\d+$/

export function parseDevParams(search: string): DevParams {
  const q = new URLSearchParams(search)
  const phase = q.get('phase')
  const preset = q.get('preset')
  const seedText = q.get('seed')
  const seed = seedText !== null && INT.test(seedText) ? Number(seedText) : Number.NaN
  return {
    phase: phase !== null && isPhase(phase) ? phase : DEFAULT_DEV_PARAMS.phase,
    preset: preset === 'reference' ? 'reference' : DEFAULT_DEV_PARAMS.preset,
    seed: Number.isSafeInteger(seed) ? seed : DEFAULT_DEV_PARAMS.seed,
  }
}

/** Whether the search string fixes the seed (a valid integer `seed`): then a new game keeps it (R30). */
export function hasSeedParam(search: string): boolean {
  const seedText = new URLSearchParams(search).get('seed')
  return seedText !== null && INT.test(seedText) && Number.isSafeInteger(Number(seedText))
}

export function copyRocket(r: RocketDesign): RocketDesign {
  return { ...r, stages: r.stages.map((st) => ({ ...st, tanks: [...st.tanks] })) }
}

export function copySpacecraft(s: SpacecraftDesign): SpacecraftDesign {
  return { ...s, parts: { ...s.parts } }
}

export function copyDesign(d: MissionDesign): MissionDesign {
  return {
    transfer: d.transfer ? { ...d.transfer } : null,
    rocket: copyRocket(d.rocket),
    spacecraft: copySpacecraft(d.spacecraft),
  }
}

/** The rocket preset a new game starts with. */
export const START_PRESET_ID = 'atlas-v-401'

/**
 * The design a new game starts with: no transfer, the Atlas V 401-class rocket and a spacecraft
 * that is only its bus, so the player builds the rest and the launch checklist starts red.
 */
export function defaultDesign(): MissionDesign {
  const preset = presetById(START_PRESET_ID)
  if (!preset) throw new Error(`Rocket preset "${START_PRESET_ID}" is missing from src/data/presets.ts`)
  return {
    transfer: null,
    rocket: copyRocket(preset.rocket),
    spacecraft: { parts: { 'sc-core': 1 }, tcmReserveMs: REFERENCE_SPACECRAFT.tcmReserveMs },
  }
}

export type DevStartState = GameSnapshot & { phase: Phase; seed: number }

/**
 * The game state the dev flags ask for (R23). `preset=reference` loads a deep copy of
 * REFERENCE_DESIGN and marks the earlier phases as done: cruise and arrival → launched; ops →
 * launched and arrived; report → a completed mission (launched, arrived, ops done). The flight state
 * itself (launch, cruise, arrival, ops, report) is played from these flags by the store's gameData
 * with src/game/autoplay.ts.
 * Without a preset the default design is used and a phase it cannot enter falls back to select.
 */
export function devStartState(params: DevParams): DevStartState {
  const design = params.preset === 'reference' ? copyDesign(REFERENCE_DESIGN) : defaultDesign()
  const p = params.preset === 'reference' ? params.phase : null
  const launched = p === 'cruise' || p === 'arrival' || p === 'ops' || p === 'report'
  const arrived = p === 'ops' || p === 'report'
  const opsDone = p === 'report'
  const snapshot: GameSnapshot = { design, launched, arrived, opsDone }
  const phase = canEnter(params.phase, snapshot) ? params.phase : 'select'
  return { ...snapshot, phase, seed: params.seed }
}
