// Pure edits of a RocketDesign for the rocket tab. Every function returns a new design (the store's
// setRocket copies again), so the design object's identity always changes with its contents.
import { boosterById } from '@/data/boosters'
import { ENGINES, engineById } from '@/data/engines'
import { PRESETS, type RocketPreset } from '@/data/presets'
import { TANKS, tankById } from '@/data/tanks'
import type { EnginePart, TankPart } from '@/game/types'
import { MAX_BOOSTERS, MAX_ENGINES, MAX_STAGES, MIN_ENGINES, type RocketDesign, type StageDesign } from '@/physics/launcher'

/** A stage added on top of the stack: a two-engine hydrogen upper stage, ready to fly. */
export const NEW_UPPER_STAGE: StageDesign = { tanks: ['tank-h37-m'], engineId: 'rl10c-1', engineCount: 2 }
/** The first stage added to an empty stack: a kerosene core that can leave the pad. */
export const NEW_FIRST_STAGE: StageDesign = { tanks: ['tank-k37-l'], engineId: 'merlin-1d', engineCount: 9 }

const copyStage = (s: StageDesign): StageDesign => ({ ...s, tanks: [...s.tanks] })

function withStages(r: RocketDesign, stages: StageDesign[]): RocketDesign {
  return { ...r, stages }
}

export function addStage(r: RocketDesign): RocketDesign {
  if (r.stages.length >= MAX_STAGES) return r
  const next = r.stages.length === 0 ? NEW_FIRST_STAGE : NEW_UPPER_STAGE
  return withStages(r, [...r.stages.map(copyStage), copyStage(next)])
}

/**
 * Removes stage `i`. The stage that moves down to the bottom keeps no boosters (they only fit on
 * the first stage, and the player chose them for another core).
 */
export function removeStage(r: RocketDesign, i: number): RocketDesign {
  const stages = r.stages.filter((_, k) => k !== i).map(copyStage)
  if (i === 0 && stages[0]) {
    delete stages[0].boosterId
    delete stages[0].boosterCount
  }
  return withStages(r, stages)
}

export function updateStage(r: RocketDesign, i: number, patch: Partial<StageDesign>): RocketDesign {
  return withStages(
    r,
    r.stages.map((s, k) => (k === i ? { ...copyStage(s), ...patch } : copyStage(s))),
  )
}

export function setEngine(r: RocketDesign, i: number, engineId: string | null): RocketDesign {
  return updateStage(r, i, { engineId })
}

export function setEngineCount(r: RocketDesign, i: number, n: number): RocketDesign {
  return updateStage(r, i, { engineCount: Math.min(MAX_ENGINES, Math.max(MIN_ENGINES, Math.round(n))) })
}

export function addTank(r: RocketDesign, i: number, tankId: string): RocketDesign {
  const s = r.stages[i]
  return s ? updateStage(r, i, { tanks: [...s.tanks, tankId] }) : r
}

export function removeTank(r: RocketDesign, i: number, tankIndex: number): RocketDesign {
  const s = r.stages[i]
  return s ? updateStage(r, i, { tanks: s.tanks.filter((_, k) => k !== tankIndex) }) : r
}

/** Drops every tank whose propellant the stage's engine does not burn (the quick fix for that error). */
export function dropMismatchedTanks(r: RocketDesign, i: number): RocketDesign {
  const s = r.stages[i]
  const e = s?.engineId ? engineById(s.engineId) : undefined
  if (!s || !e) return r
  return updateStage(r, i, { tanks: s.tanks.filter((id) => tankById(id)?.propellant === e.propellant) })
}

/** Booster type (null = none) on the first stage; choosing a type starts at 2 boosters. */
export function setBooster(r: RocketDesign, boosterId: string | null): RocketDesign {
  const s0 = r.stages[0]
  if (!s0) return r
  if (boosterId === null) {
    const stages = r.stages.map(copyStage)
    delete stages[0]!.boosterId
    delete stages[0]!.boosterCount
    return withStages(r, stages)
  }
  const count = s0.boosterId && (s0.boosterCount ?? 0) > 0 ? s0.boosterCount : 2
  return updateStage(r, 0, { boosterId, boosterCount: count })
}

export function setBoosterCount(r: RocketDesign, n: number): RocketDesign {
  return updateStage(r, 0, { boosterCount: Math.min(MAX_BOOSTERS, Math.max(0, Math.round(n))) })
}

export function setFairing(r: RocketDesign, fairing: RocketDesign['fairing']): RocketDesign {
  return { ...r, stages: r.stages.map(copyStage), fairing }
}

/** Tanks an engine can feed (same propellant); every tank when there is no engine yet. */
export function tanksFor(engineId: string | null): TankPart[] {
  const e = engineId ? engineById(engineId) : undefined
  return e ? TANKS.filter((t) => t.propellant === e.propellant) : TANKS
}

/** Engines that can fire on stage `i` (the first stage needs sea-level thrust). */
export function enginesFor(i: number): { engine: EnginePart; usable: boolean }[] {
  return ENGINES.map((engine) => ({ engine, usable: i > 0 || (engine.thrustSL > 0 && engine.ispSL > 0) }))
}


/** Cost of one stage's parts (tanks, engines, boosters), US$ M (game balance). Unknown parts count 0. */
export function stageCostM(s: StageDesign): number {
  const tanks = s.tanks.reduce((a, id) => a + (tankById(id)?.costM ?? 0), 0)
  const e = s.engineId ? engineById(s.engineId) : undefined
  const n = Number.isFinite(s.engineCount) ? s.engineCount : 0
  const b = s.boosterId ? boosterById(s.boosterId) : undefined
  const nb = Number.isFinite(s.boosterCount ?? 0) ? (s.boosterCount ?? 0) : 0
  return tanks + n * (e?.costM ?? 0) + nb * (b?.costM ?? 0)
}

/** Propellant of a stage's tanks, kg. */
export function stagePropellantKg(s: StageDesign): number {
  return s.tanks.reduce((a, id) => a + (tankById(id)?.propellantKg ?? 0), 0)
}

function stageKey(s: StageDesign): string {
  const nb = s.boosterId ? (s.boosterCount ?? 0) : 0
  return JSON.stringify([s.engineId, s.engineCount, s.tanks, nb > 0 ? s.boosterId : null, nb])
}

/** Whether two rockets have the same parts (boosterCount 0 and no booster are the same thing). */
export function sameRocket(a: RocketDesign, b: RocketDesign): boolean {
  return (
    a.fairing === b.fairing &&
    a.stages.length === b.stages.length &&
    a.stages.every((s, i) => stageKey(s) === stageKey(b.stages[i]!))
  )
}

/**
 * The preset this rocket is, if any. 'reference' duplicates the Atlas V 401-class stack, so the
 * named preset wins (it carries the LSP curve).
 */
export function matchingPreset(r: RocketDesign, presets: RocketPreset[] = PRESETS): RocketPreset | undefined {
  const hits = presets.filter((p) => sameRocket(p.rocket, r))
  return hits.find((p) => p.lspCurveId) ?? hits[0]
}

/** The presets offered in the picker: the reference duplicate is left out (it is the Atlas V 401 stack). */
export const PICKER_PRESETS: RocketPreset[] = PRESETS.filter((p) => p.id !== 'reference')

export const PROPELLANT_NAME: Record<string, string> = {
  kerolox: 'Kerolox (RP-1/LOX)',
  hydrolox: 'Hydrolox (LH2/LOX)',
  methalox: 'Methalox (CH4/LOX)',
  solid: 'Solid',
}
