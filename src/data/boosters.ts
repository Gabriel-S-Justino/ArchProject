// Strap-on boosters. Solids (propellant absent = solid): propellant, total mass, burn time and dimensions: Northrop
// Grumman GEM 63/63XL datasheet (DS-26). Isp: NG Propulsion Products Catalog via Wikipedia
// “Graphite-Epoxy Motor”; the catalogue does not say SL or vacuum — treating it as vacuum Isp is an
// estimate (assumption), and the SL values below inherit it. Thrust values are burn-averaged and derived so that thrust × burn time
// equals the total impulse (propellant × Isp × g0):
//   thrustVac = propellant / burn time × ispVac × g0
//   thrustSL  = thrustVac − 101,325 Pa × nozzle exit area;  ispSL = ispVac × thrustSL / thrustVac
// Peak thrust (datasheet) is higher: GEM 63 1,649.6 kN, GEM 63XL 2,060.6 kN. Cost: game balance.
// Liquid: the Falcon Heavy side booster, assembled from the side-booster stage in
// presetReference.ts (ref-fhe-side) and 9 × Merlin 1D from engines.ts.
import type { BoosterPart } from '@/game/types'
import { engineById } from './engines'
import { PRESET_REFERENCE } from './presetReference'

const NG_URL = 'https://cdn.northropgrumman.com/-/media/wp-content/uploads/GEM-63-GEM-63XL-Datasheet.pdf'

const FH_SIDE = PRESET_REFERENCE.find((r) => r.id === 'ref-fhe-side')!
const MERLIN = engineById('merlin-1d')!
const FH_SIDE_ENGINES = FH_SIDE.engineCount!

export const BOOSTERS: BoosterPart[] = [
  {
    id: 'gem-63',
    name: 'GEM 63 solid booster',
    thrustSL: 1_090_000,
    thrustVac: 1_239_000,
    ispSL: 245.4,
    ispVac: 279.06,
    propellantKg: 44_200,
    dryKg: 5_100,
    costM: 8,
    diameterM: 1.6,
    lengthM: 20.09,
    source:
      'Atlas V strap-on since 2020. NG GEM 63 datasheet: 49,300 kg total, 44,200 kg propellant, 97.6 s burn, 1.60 m × 20.09 m, nozzle exit 1.37 m. Isp 279.06 s: NG catalog via Wikipedia “Graphite-Epoxy Motor”; estimate: treated as vacuum Isp (the catalogue does not state SL or vac). Average thrust and SL values derived (see file header), so they are estimates too. Cost: game balance.',
    url: NG_URL,
  },
  {
    id: 'gem-63xl',
    name: 'GEM 63XL solid booster',
    thrustSL: 1_351_000,
    thrustVac: 1_511_000,
    ispSL: 250.5,
    ispVac: 280.3,
    propellantKg: 48_000,
    dryKg: 5_400,
    costM: 10,
    diameterM: 1.6,
    lengthM: 21.95,
    source:
      'Vulcan strap-on. NG GEM 63XL datasheet: 53,400 kg total, 48,000 kg propellant, 87.3 s burn, 1.60 m × 21.95 m, nozzle exit 1.42 m. Isp 280.3 s: NG catalog via Wikipedia “Graphite-Epoxy Motor”; estimate: treated as vacuum Isp (the catalogue does not state SL or vac). Average thrust and SL values derived (see file header), so they are estimates too. Cost: game balance.',
    url: NG_URL,
  },
  {
    id: 'booster-falcon-side',
    name: 'Falcon-class liquid side booster',
    propellant: 'kerolox',
    thrustSL: FH_SIDE_ENGINES * MERLIN.thrustSL,
    thrustVac: FH_SIDE_ENGINES * MERLIN.thrustVac,
    ispSL: MERLIN.ispSL,
    ispVac: MERLIN.ispVac,
    propellantKg: FH_SIDE.propellantKg!,
    dryKg: FH_SIDE.dryKg,
    costM: 40,
    diameterM: FH_SIDE.diameterM,
    lengthM: FH_SIDE.lengthM,
    source: `Falcon Heavy side booster (presetReference ref-fhe-side): ${FH_SIDE.source} Thrust and Isp = ${FH_SIDE_ENGINES} × Merlin 1D (engines.ts, Block 5 figures via the SpaceX Falcon User’s Guide). Dry mass includes the engines. Cost: game balance (≈ a Falcon core tank plus nine Merlins).`,
    url: FH_SIDE.url,
  },
]

export function boosterById(id: string): BoosterPart | undefined {
  return BOOSTERS.find((b) => b.id === id)
}
