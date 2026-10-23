// Where every part of the player's spacecraft goes on the 3D model (pure; no three.js). Metres, in
// the spacecraft's own frame: +y the top deck (high-gain dish, pointed at Earth in flight), −y the
// engine end, ±x the solar wings, +z the instrument face (towards Mars in orbit), −z the back
// (radioisotope generator). Sizes follow the catalog where it gives them (array power, the 3 m dish,
// the instrument classes); the rest is a generic, logo-free orbiter drawn to plausible proportions.
import { spacecraftPartById } from '@/data/spacecraftParts'
import type { SpacecraftDesign } from '@/game/spacecraft'

/** Array output per square metre at 1 AU, W/m²: the MRO-class array's 6,000 W over 20 m². */
export const SOLAR_W_PER_M2 = 300

/** Dish diameters of the antenna parts, m (the high-gain part is the 3 m MRO-class dish). */
export const DISH_DIAMETER_M: Record<string, number> = { 'comms-hga': 3 }

export const BUS = { w: 1.9, h: 2.4, d: 1.9 } as const
const YOKE = 0.55

export type InstrumentKind = 'camera' | 'spectrometer' | 'radar' | 'magnetometer' | 'generic'

const KIND_BY_ID: Record<string, InstrumentKind> = {
  'inst-camera': 'camera',
  'inst-spectrometer': 'spectrometer',
  'inst-radar': 'radar',
  'inst-magnetometer': 'magnetometer',
}

export interface WingLayout {
  side: -1 | 1
  /** Root of the panel (inner edge), x m. */
  rootX: number
  /** Along ±x, m. */
  span: number
  /** Along y, m. */
  chord: number
  /** Hinged panel segments. */
  panels: number
  areaM2: number
}

export interface InstrumentLayout {
  id: string
  kind: InstrumentKind
  /** Centre of the instrument, m. */
  position: [number, number, number]
  /** Box size (w, h, d), or for a camera barrel (diameter, –, length); a radar's dipole length in x. */
  size: [number, number, number]
  damaged: boolean
}

export interface SpacecraftLayout {
  /** False when no bus is fitted (the model then draws only an outline where it would be). */
  bus: boolean
  wings: WingLayout[]
  solarW: number
  solarAreaM2: number
  dish: { diameter: number; y: number } | null
  lga: boolean
  laser: boolean
  instruments: InstrumentLayout[]
  rtgs: number
  nozzle: { kind: 'monoprop' | 'biprop'; exitDiameter: number; length: number } | null
  /** Radius of a sphere around the origin that holds the whole model, m (for framing). */
  radius: number
}

const count = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

export function spacecraftLayout(design: SpacecraftDesign, damaged: readonly string[] = []): SpacecraftLayout {
  const fitted = Object.entries(design.parts)
    .map(([id, n]) => ({ part: spacecraftPartById(id), n: count(n) }))
    .filter((x): x is { part: NonNullable<typeof x.part>; n: number } => !!x.part && x.n > 0)
  const has = (id: string) => fitted.some((f) => f.part.id === id)

  // Solar wings: one per side, area ∝ the arrays' power at 1 AU.
  const solarW = fitted.filter((f) => f.part.solar).reduce((a, f) => a + f.n * Math.max(0, f.part.powerW), 0)
  const solarAreaM2 = solarW / SOLAR_W_PER_M2
  const chord = 1.9
  const wings: WingLayout[] = []
  if (solarAreaM2 > 0) {
    const span = solarAreaM2 / 2 / chord
    for (const side of [-1, 1] as const) {
      wings.push({ side, rootX: side * (BUS.w / 2 + YOKE), span, chord, panels: Math.max(1, Math.ceil(span / 1.3)), areaM2: solarAreaM2 / 2 })
    }
  }

  const dishParts = fitted.filter((f) => DISH_DIAMETER_M[f.part.id] !== undefined)
  const dishD = dishParts.reduce((m, f) => Math.max(m, DISH_DIAMETER_M[f.part.id]!), 0)
  const dish = dishD > 0 ? { diameter: dishD, y: BUS.h / 2 + 0.55 } : null

  // Instruments on the +z face (the nadir deck in orbit); the radar's dipole under the bus, the
  // magnetometer at the end of a boom off the back.
  const instruments: InstrumentLayout[] = []
  const zFace = BUS.d / 2
  let generic = 0
  for (const f of fitted.filter((x) => x.part.category === 'instrument')) {
    const kind = KIND_BY_ID[f.part.id] ?? 'generic'
    const hurt = damaged.includes(f.part.id)
    const base = { id: f.part.id, kind, damaged: hurt }
    switch (kind) {
      case 'camera':
        instruments.push({ ...base, position: [-0.42, -0.25, zFace + 0.65], size: [0.62, 0, 1.3] })
        break
      case 'spectrometer':
        instruments.push({ ...base, position: [0.5, 0.45, zFace + 0.24], size: [0.5, 0.42, 0.48] })
        break
      case 'radar':
        instruments.push({ ...base, position: [0, -BUS.h / 2 - 0.12, zFace - 0.2], size: [10, 0.05, 0.05] })
        break
      case 'magnetometer':
        instruments.push({ ...base, position: [0.6, BUS.h / 2 + 1.2, -zFace - 1.6], size: [0.18, 0.18, 0.18] })
        break
      default:
        instruments.push({ ...base, position: [0.55 - (generic % 2) * 1.1, -0.65 - Math.floor(generic / 2) * 0.5, zFace + 0.18], size: [0.4, 0.36, 0.36] })
        generic++
    }
  }

  const rtgs = fitted.filter((f) => f.part.id === 'rtg').reduce((a, f) => a + f.n, 0)
  const prop = fitted.filter((f) => f.part.category === 'propulsion')
  const biprop = prop.some((f) => f.part.id === 'prop-biprop')
  const nozzle = prop.length === 0 ? null : biprop ? { kind: 'biprop' as const, exitDiameter: 0.56, length: 0.8 } : { kind: 'monoprop' as const, exitDiameter: 0.2, length: 0.28 }

  const wingTip = wings.length ? BUS.w / 2 + YOKE + wings[0]!.span : BUS.w / 2
  const radarHalf = instruments.some((i) => i.kind === 'radar') ? 5 : 0
  const top = dish ? dish.y + 0.4 : BUS.h / 2
  const radius = Math.max(Math.hypot(Math.max(wingTip, radarHalf, (dish?.diameter ?? 0) / 2), top), Math.hypot(BUS.w / 2, BUS.h / 2 + 1, BUS.d / 2 + 1.4), rtgs ? 2.2 : 0, instruments.some((i) => i.kind === 'magnetometer') ? 3.3 : 0)

  return {
    bus: has('sc-core'),
    wings,
    solarW,
    solarAreaM2,
    dish,
    lga: has('comms-lga'),
    laser: has('comms-optical'),
    instruments,
    rtgs,
    nozzle,
    radius,
  }
}

/** One line for screen readers: what the model shows. */
export function describeSpacecraft(l: SpacecraftLayout): string {
  const bits: string[] = []
  bits.push(l.bus ? 'a spacecraft bus' : 'no bus yet')
  if (l.wings.length) bits.push(`two solar wings of ${l.solarAreaM2.toFixed(1)} m² in total`)
  if (l.dish) bits.push(`a ${l.dish.diameter} m high-gain dish`)
  if (l.lga) bits.push('a low-gain antenna')
  if (l.laser) bits.push('a laser communication terminal')
  if (l.rtgs) bits.push(l.rtgs === 1 ? 'a radioisotope generator' : `${l.rtgs} radioisotope generators`)
  const hurt = l.instruments.filter((i) => i.damaged).length
  if (l.instruments.length) bits.push(`${l.instruments.length} instrument${l.instruments.length === 1 ? '' : 's'}${hurt ? `, ${hurt} damaged` : ''}`)
  if (l.nozzle) bits.push(l.nozzle.kind === 'biprop' ? 'a bipropellant main engine' : 'hydrazine thrusters')
  return bits.join(', ')
}
