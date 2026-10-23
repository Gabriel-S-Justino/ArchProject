// Shared catalog and data interfaces. Units are SI unless the field name says otherwise
// (costM = US$ millions, rateMbpsAt1AU = Mbit/s at 1 AU, *Gb / *Gbit = gigabits).
// Framework-free: no React, Three.js or DOM imports here.

export type Propellant = 'kerolox' | 'hydrolox' | 'methalox' | 'solid'

export interface EnginePart {
  id: string
  name: string
  propellant: Propellant
  /** Sea-level thrust, N. 0 for vacuum-optimised engines that cannot fire at sea level. */
  thrustSL: number
  /** Vacuum thrust, N. */
  thrustVac: number
  /** Sea-level Isp, s. 0 for vacuum-optimised engines (same engines as thrustSL = 0). */
  ispSL: number
  /** Vacuum Isp, s. */
  ispVac: number
  massKg: number
  /** Game balance, US$ M per engine. */
  costM: number
  source: string
  url?: string
}

export interface TankPart {
  id: string
  name: string
  propellant: Exclude<Propellant, 'solid'>
  diameterM: number
  lengthM: number
  propellantKg: number
  /** Structure (tank, intertank, thrust structure share). Generic tanks: dryKg / propellantKg is game balance within real ranges; reference tanks: real stage dry mass minus engines. */
  dryKg: number
  /** Game balance, US$ M. */
  costM: number
  /** What the size and dry mass are based on. */
  source: string
  url?: string
  /** Set on tanks that reproduce a real stage: the PRESET_REFERENCE id whose structure they match. */
  referenceStageId?: string
}

export interface BoosterPart {
  id: string
  name: string
  /** Absent = solid. Liquid strap-ons (Falcon Heavy side cores) burn in parallel exactly like solids. */
  propellant?: Propellant
  /** Burn-averaged sea-level thrust, N. */
  thrustSL: number
  /** Burn-averaged vacuum thrust, N. */
  thrustVac: number
  ispSL: number
  ispVac: number
  propellantKg: number
  /** Inert mass (case, nozzle, attach hardware) = total − propellant. */
  dryKg: number
  costM: number
  diameterM: number
  lengthM: number
  source: string
  url?: string
}

export interface LspCurve {
  vehicle: string
  presetId: string
  source: string
  url: string
  /** Separated spacecraft mass (kg) versus C3 (km²/s²), sorted by C3. */
  points: [c3: number, kg: number][]
}

export type SpacecraftCategory =
  | 'core'
  | 'power'
  | 'comms'
  | 'instrument'
  | 'protection'
  | 'storage'
  | 'propulsion'

export interface SpacecraftPart {
  id: string
  name: string
  category: SpacecraftCategory
  /** Game balance, US$ M. */
  costM: number
  massKg: number
  /** + generation (solar: at 1 AU; otherwise constant), − load, W. */
  powerW: number
  solar?: boolean
  batteryWh?: number
  rateMbpsAt1AU?: number
  /** Game balance: science points per ops turn. */
  science?: number
  /** Game balance: Gbit of data produced per ops turn. */
  dataGbPerTurn?: number
  /** 0..1 fraction of flare damage risk removed. */
  radiationShield?: number
  /** Onboard storage, Gbit. */
  storageGb?: number
  /** Main-engine specific impulse, s (propulsion parts). */
  ispS?: number
  /** Maximum copies per spacecraft. */
  max?: number
  flavor: string
  source?: string
}

export interface DonkiFlare {
  /** DONKI flrID. */
  id: string
  /** ISO time, minute precision, e.g. "2024-05-16T08:04Z". */
  peakTime: string
  /** GOES class, e.g. "M7.2", "X1.1". */
  classType: string
  /** Heliographic location, e.g. "S10E81". */
  sourceLocation?: string
  link: string
}

export interface DataSource {
  id: string
  title: string
  provider: string
  url: string
  /** YYYY-MM-DD the data was retrieved or the document was read. */
  fetched: string
  usedFor: string
}

export interface RealMission {
  id: 'maven' | 'mro'
  name: string
  launchDate: string
  vehicle: string
  launchMassKg: number
  /** US$ M, as reported by the cited source (see `source` for what it includes). */
  costM: number
  /** Mars orbit insertion date. */
  arrivalDate: string
  source: string
  url: string
  dryMassKg?: number
  /** Mars orbit insertion Δv, m/s. */
  moiDvMs?: number
  /** Launch C3, km²/s². */
  launchC3?: number
}

/** Raw numbers of one real launch-vehicle element, used to build presets from catalog parts. */
export interface StageReference {
  id: string
  /** LSP curve presetId this element belongs to. */
  presetId: string
  vehicle: string
  element: 'booster' | 'core' | 'upper' | 'interstage' | 'fairing' | 'srb'
  name: string
  /** Number of these elements on the vehicle. */
  count: number
  propellant?: Propellant
  propellantKg?: number
  /** Inert mass as published (includes engines unless the note says otherwise). */
  dryKg: number
  diameterM: number
  lengthM: number
  engineId?: string
  engineCount?: number
  boosterId?: string
  source: string
  url: string
}
