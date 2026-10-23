// Propellant tanks for the modular launcher. Tank sizes are game parts sized after real stages
// (see `source` and presetReference.ts). Generic tanks use game-balance dry/propellant fractions
// inside real ranges (kerolox 0.05–0.07, hydrolox 0.10–0.12, methalox 0.06–0.08). Reference tanks
// (with `referenceStageId`) instead carry the real structure of that stage — its published dry mass
// minus its engines — so presets can reproduce the LSP vehicles (test: within 5%). Lengths are the
// cylinder-equivalent length of the propellant volume at the bulk mixture density below
// (no domes, engine bay or interstage). Costs are game balance (US$ M).
import type { TankPart } from '@/game/types'

type LiquidPropellant = TankPart['propellant']

/**
 * Bulk density of oxidiser + fuel at the usual mixture ratio, kg/m³ (derived):
 * LOX 1,141 kg/m³; RP-1 810 (O/F 2.56); LH2 71 (O/F 6.0); liquid methane 422 (O/F 3.6).
 * ρ = (1 + O/F) / (1/ρ_fuel + O/F/ρ_ox).
 */
export const BULK_DENSITY: Record<LiquidPropellant, number> = {
  kerolox: 1023,
  hydrolox: 362,
  methalox: 833,
}

/** Game-balance cost model: fixed cost per tank plus a cost per tonne of propellant. */
const COST: Record<LiquidPropellant, { base: number; perTonne: number }> = {
  kerolox: { base: 2, perTonne: 0.04 },
  hydrolox: { base: 3, perTonne: 0.6 },
  methalox: { base: 2, perTonne: 0.05 },
}

const LABEL: Record<LiquidPropellant, string> = {
  kerolox: 'Kerolox',
  hydrolox: 'Hydrolox',
  methalox: 'Methalox',
}

const AVUG_URL = 'https://www.ulalaunch.com/docs/default-source/rockets/atlasvusersguide2010.pdf'
const FH_URL = 'https://en.wikipedia.org/wiki/Falcon_Heavy'
const VULCAN_URL = 'https://en.wikipedia.org/wiki/Vulcan_Centaur'

const round1 = (x: number) => Math.round(x * 10) / 10

function tank(
  id: string,
  name: string,
  propellant: LiquidPropellant,
  diameterM: number,
  propellantKg: number,
  dry: { fraction: number } | { kg: number },
  source: string,
  extra: { url?: string; referenceStageId?: string } = {},
): TankPart {
  const area = Math.PI * (diameterM / 2) ** 2
  const dryKg = 'kg' in dry ? dry.kg : Math.round(propellantKg * dry.fraction)
  return {
    id,
    name,
    propellant,
    diameterM,
    lengthM: round1(propellantKg / BULK_DENSITY[propellant] / area),
    propellantKg,
    dryKg,
    costM: round1(COST[propellant].base + (COST[propellant].perTonne * propellantKg) / 1000),
    source,
    ...extra,
  }
}

const SIZES = ['S', 'M', 'L'] as const

/** One S/M/L family of the brief's grid. */
function family(
  propellant: LiquidPropellant,
  diameterM: number,
  kg: readonly [number, number, number],
  fraction: number,
  basis: string,
): TankPart[] {
  const code = `${propellant[0]}${String(diameterM).replace('.', '')}`
  return SIZES.map((size, i) =>
    tank(
      `tank-${code}-${size.toLowerCase()}`,
      `${LABEL[propellant]} tank ${diameterM} m · ${size}`,
      propellant,
      diameterM,
      kg[i]!,
      { fraction },
      `Game balance: dry fraction ${fraction} (real range); ${basis}`,
    ),
  )
}

export const TANKS: TankPart[] = [
  // Generic grid (brief). 3.7 m kerolox: L = one Falcon Heavy core's propellant, S = Falcon second
  // stage, at the generic 0.05 fraction; the real-structure versions are the reference tanks below.
  ...family(
    'kerolox',
    3.7,
    [107_500, 205_450, 410_900],
    0.05,
    'L sized like a Falcon Heavy core, S like the Falcon upper stage (Wikipedia “Falcon Heavy”, citing Espace & Exploration no. 51).',
  ),
  ...family('hydrolox', 3.7, [20_000, 40_000, 80_000], 0.11, 'sizes are generic upper-stage classes.'),
  ...family('methalox', 3.7, [60_000, 150_000, 300_000], 0.07, 'sizes are generic stage classes.'),
  // 5.4 m: Vulcan / Centaur V class.
  ...family('kerolox', 5.4, [100_000, 250_000, 500_000], 0.06, 'sizes are generic heavy-stage classes.'),
  ...family(
    'hydrolox',
    5.4,
    [25_000, 54_000, 150_000],
    0.11,
    'M sized like Centaur V (heavy, 54 t propellant; Wikipedia “Vulcan Centaur”); reference version: tank-h54-centaur-v.',
  ),
  ...family(
    'methalox',
    5.4,
    [88_350, 176_700, 353_400],
    0.06,
    'L sized like the Vulcan booster (382 t gross − 28.6 t empty = 353.4 t, derived from Wikipedia “Vulcan Centaur”); real-structure version: tank-m54-vulcan.',
  ),
  // Reference tanks: real stage structure = published stage dry mass − engines (presetReference.ts).
  // Atlas V (ULA Atlas V User's Guide Rev 11, Fig. 1.4.1-3/1.4.1-4).
  tank(
    'tank-k381-ccb',
    'Kerolox tank 3.81 m · Common Core',
    'kerolox',
    3.81,
    284_089,
    { kg: 15_574 },
    'Atlas V Common Core Booster: 284,089 kg LO2/RP-1, 21,054 kg inert minus the 5,480 kg RD-180 = 15,574 kg (fraction 0.055). ULA Atlas V User’s Guide Rev 11, Fig. 1.4.1-3.',
    { url: AVUG_URL, referenceStageId: 'ref-av401-ccb' },
  ),
  tank(
    'tank-k381-half',
    'Kerolox tank 3.81 m · Half Core',
    'kerolox',
    3.81,
    142_045,
    { kg: 7_787 },
    'Game balance: half of the Atlas V Common Core Booster tank, same structural fraction (0.055).',
    { url: AVUG_URL },
  ),
  tank(
    'tank-h305-centaur',
    'Hydrolox tank 3.05 m · Centaur',
    'hydrolox',
    3.05,
    20_830,
    { kg: 2_053 },
    'Atlas V Centaur (single engine): 20,830 kg LH2/LO2, 2,243 kg inert minus one 190 kg RL10C-1 = 2,053 kg (fraction 0.099). ULA Atlas V User’s Guide Rev 11, Fig. 1.4.1-3.',
    { url: AVUG_URL, referenceStageId: 'ref-av401-centaur' },
  ),
  // Falcon Heavy (Wikipedia “Falcon Heavy” spec table, citing Espace & Exploration no. 51).
  tank(
    'tank-k37-falcon-core',
    'Kerolox tank 3.7 m · Falcon core',
    'kerolox',
    3.7,
    410_900,
    { kg: 17_970 },
    'Falcon Heavy core/side booster: 410,900 kg propellant (287.4 t LOX + 123.5 t RP-1), 22,200 kg dry minus 9 × 470 kg Merlin 1D = 17,970 kg (fraction 0.044; Merlin mass is an estimate).',
    { url: FH_URL, referenceStageId: 'ref-fhe-core' },
  ),
  tank(
    'tank-k37-falcon-upper',
    'Kerolox tank 3.7 m · Falcon upper',
    'kerolox',
    3.7,
    107_500,
    { kg: 3_500 },
    'Falcon Heavy second stage: 107,500 kg propellant (75.2 t LOX + 32.3 t RP-1), 4,000 kg dry minus a 500 kg Merlin Vacuum = 3,500 kg (fraction 0.033; MVac mass is an estimate).',
    { url: FH_URL, referenceStageId: 'ref-fhe-upper' },
  ),
  // Vulcan VC4 (Wikipedia “Vulcan Centaur”).
  tank(
    'tank-m54-vulcan',
    'Methalox tank 5.4 m · Vulcan booster',
    'methalox',
    5.4,
    353_400,
    { kg: 17_800 },
    'Vulcan booster: 382,000 kg gross − 28,600 kg empty = 353,400 kg propellant (derived); 28,600 kg minus 2 × 5,400 kg BE-4 = 17,800 kg (fraction 0.050; BE-4 mass is an estimate).',
    { url: VULCAN_URL, referenceStageId: 'ref-vc4-booster' },
  ),
  tank(
    'tank-h54-centaur-v',
    'Hydrolox tank 5.4 m · Centaur V',
    'hydrolox',
    5.4,
    54_000,
    { kg: 5_324 },
    'Centaur V (heavy): 54,000 kg propellant (Wikipedia “Vulcan Centaur”). Structure 5,324 kg: estimate: Centaur III structural fraction 0.0986 × 54 t (ULA publishes no Centaur V dry mass).',
    { url: VULCAN_URL, referenceStageId: 'ref-vc4-centaur-v' },
  ),
]

export function tankById(id: string): TankPart | undefined {
  return TANKS.find((t) => t.id === id)
}
