// Propellant tanks for the modular launcher. Tank sizes are game parts sized after real stages
// (see `source` and presetReference.ts); dry/propellant fractions are game balance inside real
// ranges (kerolox 0.05–0.07, hydrolox 0.10–0.12, methalox 0.06–0.08). Lengths are the
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

const round1 = (x: number) => Math.round(x * 10) / 10

function tank(
  id: string,
  name: string,
  propellant: LiquidPropellant,
  diameterM: number,
  propellantKg: number,
  dry: { fraction: number } | { kg: number },
  source: string,
  url?: string,
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
    ...(url ? { url } : {}),
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
  // 3.7 m: Falcon-class structure. L = one Falcon Heavy core's propellant (287.4 t LOX + 123.5 t RP-1),
  // S = Falcon second stage (75.2 t + 32.3 t). Real Falcon structures are lighter than 0.05
  // (side booster ≈ 0.044 without engines); the brief's 0.05 floor is kept.
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
    'M sized like Centaur V (heavy, 54 t propellant; Wikipedia “Vulcan Centaur”).',
  ),
  ...family(
    'methalox',
    5.4,
    [88_350, 176_700, 353_400],
    0.06,
    'L sized like the Vulcan booster (382 t gross − 28.6 t empty = 353.4 t, derived from Wikipedia “Vulcan Centaur”); real structure without 2 BE-4 ≈ 0.050.',
  ),
  // Atlas V family (all numbers from the Atlas V User's Guide, Fig. 1.4.1-3/1.4.1-4).
  tank(
    'tank-k381-ccb',
    'Kerolox tank 3.81 m · Common Core',
    'kerolox',
    3.81,
    284_089,
    { kg: 15_574 },
    'Atlas V Common Core Booster: 284,089 kg LO2/RP-1, 21,054 kg inert minus the 5,480 kg RD-180 = 15,574 kg (fraction 0.055). ULA Atlas V User’s Guide Rev 11, Fig. 1.4.1-3.',
    'https://www.ulalaunch.com/docs/default-source/rockets/atlasvusersguide2010.pdf',
  ),
  tank(
    'tank-k381-half',
    'Kerolox tank 3.81 m · Half Core',
    'kerolox',
    3.81,
    142_045,
    { kg: 7_787 },
    'Game balance: half of the Atlas V Common Core Booster tank, same structural fraction (0.055).',
    'https://www.ulalaunch.com/docs/default-source/rockets/atlasvusersguide2010.pdf',
  ),
  tank(
    'tank-h305-centaur',
    'Hydrolox tank 3.05 m · Centaur',
    'hydrolox',
    3.05,
    20_830,
    { fraction: 0.1 },
    'Atlas V Centaur (single engine): 20,830 kg LH2/LO2, 2,243 kg inert incl. one 190 kg RL10C-1 → 2,053 kg structure (0.099); rounded up to the brief’s 0.10 floor = 2,083 kg. ULA Atlas V User’s Guide Rev 11, Fig. 1.4.1-3.',
    'https://www.ulalaunch.com/docs/default-source/rockets/atlasvusersguide2010.pdf',
  ),
]

export function tankById(id: string): TankPart | undefined {
  return TANKS.find((t) => t.id === id)
}
