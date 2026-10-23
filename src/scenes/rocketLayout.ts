// Where every part of a rocket sits, in metres (1 scene unit = 1 m, y up from the pad, the stack's
// axis at x = z = 0). Built from the catalog's real tank and booster dimensions; engines have no
// dimensions in the catalog, so their bells use approximate public nozzle figures (drawing only).
// Pure: no three.js, no React. RocketModel.tsx turns this into meshes; the tests check it.
import { boosterById } from '@/data/boosters'
import { engineById } from '@/data/engines'
import { tankById } from '@/data/tanks'
import type { EnginePart, Propellant, TankPart } from '@/game/types'
import type { RocketDesign } from '@/physics/launcher'

/** Nozzle drawing figures per engine: chambers per engine, exit diameter and bell length, m. */
export interface BellSpec {
  chambers: number
  exitD: number
  length: number
}

/** Approximate public nozzle figures (drawing only; not used by any computation). */
const ENGINE_BELLS: Record<string, BellSpec> = {
  'rd-180': { chambers: 2, exitD: 1.43, length: 2.1 },
  'merlin-1d': { chambers: 1, exitD: 0.92, length: 1.25 },
  'merlin-vac': { chambers: 1, exitD: 3.3, length: 3.2 },
  'rs-25': { chambers: 1, exitD: 2.3, length: 3.1 },
  'rl10c-1': { chambers: 1, exitD: 1.45, length: 2.2 },
  'rl10c-1-1': { chambers: 1, exitD: 1.45, length: 2.2 },
  'be-4': { chambers: 1, exitD: 1.9, length: 2.4 },
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Bell size of an engine: the table above, else a size class from thrust (vacuum engines get wide bells). */
export function bellSpec(e: EnginePart): BellSpec {
  const known = ENGINE_BELLS[e.id]
  if (known) return known
  const vacuum = !(e.thrustSL > 0)
  const exitD = vacuum
    ? clamp(1.45 * Math.pow(Math.max(e.thrustVac, 1) / 1.02e5, 0.35), 0.8, 3.6)
    : clamp(0.92 * Math.pow(Math.max(e.thrustSL, 1) / 8.45e5, 0.45), 0.6, 2.6)
  return { chambers: 1, exitD, length: exitD * (vacuum ? 1.25 : 1.35) }
}

export interface EngineCluster {
  engineId: string
  propellant: Propellant
  vacuum: boolean
  /** Number of nozzles drawn (engines × chambers). */
  bells: number
  /** Chamber centres (x, z) relative to the stack axis, m. */
  positions: [number, number][]
  exitR: number
  throatR: number
  length: number
  /** Distance from the axis to the outer edge of the outermost bell, m. */
  outerR: number
}

export interface TankSegment {
  id: string
  y0: number
  length: number
  diameter: number
  propellant: TankPart['propellant']
}

export interface StageLayout {
  index: number
  /** Bottom of the stage (nozzle exit plane), m. */
  y0: number
  /** Top of the stage including its interstage, m. */
  y1: number
  /** Widest tank, m (3 m when the stage has no tanks). */
  diameter: number
  /** Bell exit plane up to the tank bottom: the aft skirt / thrust section. */
  aft: { y0: number; y1: number }
  tanks: TankSegment[]
  /** Heights of the joints between stacked tanks (an intertank ring is drawn at each). */
  joints: number[]
  /** Top of the tanks (or of the placeholder when there are none), m. */
  tankTop: number
  engines: EngineCluster | null
  /** Adapter to the stage above (encloses its engine), part of this stage: d0 at y0, d1 at y1. */
  interstage: { y0: number; y1: number; d0: number; d1: number } | null
}

export interface BoosterLayout {
  boosterId: string
  solid: boolean
  propellant: Propellant
  count: number
  diameter: number
  length: number
  /** Centres (x, z) of each booster, m. */
  positions: [number, number][]
  /** Body cylinder (between the nozzle section and the nose), m. */
  body: { y0: number; y1: number }
  noseLength: number
  /** Solid: one nozzle. Liquid side cores: the core's cluster, scaled to the booster's diameter. */
  engines: EngineCluster | null
}

export interface FairingLayout {
  fairing: RocketDesign['fairing']
  y0: number
  diameter: number
  /** Cone from the top stage's diameter up to the fairing's (null when they match). */
  boattail: { y0: number; y1: number; d0: number } | null
  cylinder: { y0: number; y1: number }
  nose: { y0: number; y1: number }
  y1: number
}

export interface RocketLayout {
  stages: StageLayout[]
  boosters: BoosterLayout | null
  fairing: FairingLayout | null
  /** Generic spacecraft box inside the fairing. */
  spacecraft: { y0: number; height: number; width: number } | null
  /** Total height to the fairing tip, m. */
  height: number
  /** Widest horizontal extent from the axis (boosters included), m. */
  radius: number
}

/** Fairing outline per option (diameter, length), m. Drawing only, close to real 4–5.4 m fairings. */
export const FAIRING_SHAPE: Record<RocketDesign['fairing'], { d: number; l: number }> = {
  small: { d: 4.6, l: 11 },
  large: { d: 5.4, l: 13.5 },
}

/** Thrust section above the bells of the first stage, m (drawing only). */
const AFT_M = 0.6
/** Gap between a stage's tank top and the nozzle exit of the stage above, m. */
const STAGE_GAP_M = 0.25
/** Placeholder height of a stage without tanks, m. */
const EMPTY_STAGE_M = 2
const DEFAULT_D = 3

/**
 * Chamber centres for `n` nozzles of exit radius `exitR` inside a stage of radius `R`: one ring
 * (n ≤ 4), a ring plus a centre engine (5–9, like an octaweb), or two rings. Bells shrink to fit
 * the stage when the ideal spacing would not. Returns positions and the scale applied.
 */
export function clusterPositions(n: number, exitR: number, R: number): { positions: [number, number][]; scale: number } {
  if (n <= 0) return { positions: [], scale: 1 }
  if (n === 1) return { positions: [[0, 0]], scale: Math.min(1, (R * 0.98) / exitR) }
  const s = exitR * 2 * 1.05 // centre-to-centre spacing
  const rings: { k: number; r: number; offset: number }[] = []
  let centre = false
  if (n <= 4) {
    rings.push({ k: n, r: s / (2 * Math.sin(Math.PI / n)), offset: n === 4 ? Math.PI / 4 : 0 })
  } else if (n <= 9) {
    centre = true
    const k = n - 1
    rings.push({ k, r: Math.max(s, s / (2 * Math.sin(Math.PI / k))), offset: 0 })
  } else {
    const inner = Math.max(3, Math.round(n / 3))
    const outer = n - inner
    const r1 = s / (2 * Math.sin(Math.PI / inner))
    rings.push({ k: inner, r: r1, offset: 0 })
    rings.push({ k: outer, r: Math.max(r1 + s, s / (2 * Math.sin(Math.PI / outer))), offset: Math.PI / outer })
  }
  const outerR = Math.max(...rings.map((g) => g.r)) + exitR
  const scale = Math.min(1, (R * 0.96) / outerR)
  const positions: [number, number][] = centre ? [[0, 0]] : []
  for (const g of rings) {
    for (let j = 0; j < g.k; j++) {
      const a = g.offset + (j / g.k) * Math.PI * 2
      positions.push([Math.cos(a) * g.r * scale, Math.sin(a) * g.r * scale])
    }
  }
  return { positions, scale }
}

function cluster(e: EnginePart, count: number, stageR: number): EngineCluster {
  const spec = bellSpec(e)
  const n = Math.max(1, Math.min(9, Math.round(count) || 1)) * spec.chambers
  const exitR = spec.exitD / 2
  const { positions, scale } = clusterPositions(n, exitR, stageR)
  const r = exitR * scale
  const outerR = positions.reduce((m, [x, z]) => Math.max(m, Math.hypot(x, z) + r), 0)
  return {
    engineId: e.id,
    propellant: e.propellant,
    vacuum: !(e.thrustSL > 0),
    bells: n,
    positions,
    exitR: r,
    throatR: r * 0.32,
    length: spec.length * scale,
    outerR,
  }
}

/** Tangent-ogive nose profile: [radius, height above the nose base] from base to tip, `steps` + 1 points. */
export function ogiveProfile(radius: number, length: number, steps = 16): [number, number][] {
  const rho = (radius * radius + length * length) / (2 * radius)
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * length
    const r = Math.sqrt(Math.max(0, rho * rho - y * y)) + radius - rho
    pts.push([Math.max(0, r), y])
  }
  pts[pts.length - 1] = [0, length]
  return pts
}

/** Layout of the whole stack. Unknown parts are skipped; an empty design gives height 0. */
export function rocketLayout(r: RocketDesign): RocketLayout {
  const stages: StageLayout[] = []
  const designStages = Array.isArray(r?.stages) ? r.stages : []
  let y = 0
  designStages.forEach((s, i) => {
    const tanks = (s.tanks ?? []).map((id) => tankById(id)).filter((t): t is TankPart => t !== undefined)
    const engine = s.engineId ? engineById(s.engineId) : undefined
    const diameter = tanks.length ? Math.max(...tanks.map((t) => t.diameterM)) : DEFAULT_D
    const engines = engine ? cluster(engine, s.engineCount, diameter / 2) : null
    const bell = engines?.length ?? 0
    const y0 = i === 0 ? 0 : y + STAGE_GAP_M
    const tankBase = y0 + bell + (i === 0 ? AFT_M : 0.35)
    const aft = { y0: i === 0 ? bell * 0.7 : y0 + bell * 0.8, y1: tankBase }
    const segs: TankSegment[] = []
    let ty = tankBase
    for (const t of tanks) {
      segs.push({ id: t.id, y0: ty, length: t.lengthM, diameter: t.diameterM, propellant: t.propellant })
      ty += t.lengthM
    }
    const tankTop = tanks.length ? ty : tankBase + EMPTY_STAGE_M
    stages.push({
      index: i,
      y0,
      y1: tankTop,
      diameter,
      aft,
      tanks: segs,
      joints: segs.slice(1).map((g) => g.y0),
      tankTop,
      engines,
      interstage: null,
    })
    y = tankTop
  })

  // Interstages: from a stage's tank top up around the next stage's bell.
  for (let i = 0; i < stages.length - 1; i++) {
    const lo = stages[i]!
    const hi = stages[i + 1]!
    const top = hi.engines ? hi.y0 + hi.engines.length * 0.85 : hi.aft.y1
    lo.interstage = { y0: lo.tankTop, y1: Math.max(top, lo.tankTop + 0.6), d0: lo.diameter, d1: hi.diameter }
    lo.y1 = lo.interstage.y1
  }

  // Fairing on the top stage, with a boattail when it is wider than the stage.
  const topStage = stages.at(-1)
  let fairing: FairingLayout | null = null
  let spacecraft: RocketLayout['spacecraft'] = null
  if (topStage) {
    const shape = FAIRING_SHAPE[r.fairing] ?? FAIRING_SHAPE.small
    const d = Math.max(shape.d, topStage.diameter)
    const base = topStage.tankTop + 0.2
    const boattail = d > topStage.diameter + 0.05 ? { y0: base, y1: base + (d - topStage.diameter) * 0.9 + 0.4, d0: topStage.diameter } : null
    const fy0 = boattail ? boattail.y1 : base
    const cylL = shape.l * 0.48
    const noseL = shape.l - cylL
    fairing = {
      fairing: r.fairing in FAIRING_SHAPE ? r.fairing : 'small',
      y0: fy0,
      diameter: d,
      boattail,
      cylinder: { y0: fy0, y1: fy0 + cylL },
      nose: { y0: fy0 + cylL, y1: fy0 + shape.l },
      y1: fy0 + shape.l,
    }
    const scH = Math.min(cylL + noseL * 0.25, 3.4)
    spacecraft = { y0: fy0 + 0.5, height: scH, width: Math.min(2.4, d * 0.55) }
  }

  // Strap-on boosters around the first stage.
  let boosters: BoosterLayout | null = null
  const s0 = designStages[0]
  const st0 = stages[0]
  const b = s0?.boosterId ? boosterById(s0.boosterId) : undefined
  const nb = b ? Math.max(0, Math.min(6, Math.round(s0?.boosterCount ?? 0))) : 0
  if (b && st0 && nb > 0) {
    const solid = b.propellant === undefined
    const ringR = st0.diameter / 2 + b.diameterM / 2 + 0.12
    const offset = nb === 2 ? 0 : nb === 1 ? 0 : Math.PI / nb
    const positions: [number, number][] = Array.from({ length: nb }, (_, k) => {
      const a = offset + (k / nb) * Math.PI * 2
      return [Math.cos(a) * ringR, Math.sin(a) * ringR]
    })
    const coreEngine = s0?.engineId ? engineById(s0.engineId) : undefined
    const engines = solid
      ? {
          engineId: b.id,
          propellant: 'solid' as const,
          vacuum: false,
          bells: 1,
          positions: [[0, 0]] as [number, number][],
          exitR: b.diameterM * 0.43,
          throatR: b.diameterM * 0.16,
          length: b.diameterM * 0.85,
          outerR: b.diameterM * 0.43,
        }
      : coreEngine
        ? cluster(coreEngine, s0?.engineCount ?? 1, b.diameterM / 2)
        : null
    const bell = engines?.length ?? 0
    const noseLength = b.diameterM * (solid ? 1.7 : 1.5)
    boosters = {
      boosterId: b.id,
      solid,
      propellant: b.propellant ?? 'solid',
      count: nb,
      diameter: b.diameterM,
      length: b.lengthM,
      positions,
      body: { y0: solid ? bell * 0.75 : bell + AFT_M, y1: Math.max(bell + 1, b.lengthM - noseLength) },
      noseLength,
      engines,
    }
  }

  const height = fairing?.y1 ?? 0
  const coreR = Math.max(0, ...stages.map((s) => s.diameter / 2), (fairing?.diameter ?? 0) / 2)
  const boosterR = boosters ? Math.max(...boosters.positions.map(([x, z]) => Math.hypot(x, z))) + boosters.diameter / 2 : 0
  return { stages, boosters, fairing, spacecraft, height, radius: Math.max(coreR, boosterR) }
}
