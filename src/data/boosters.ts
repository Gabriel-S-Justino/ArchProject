// Strap-on solid rocket boosters. Propellant, total mass, burn time and dimensions: Northrop
// Grumman GEM 63/63XL datasheet (DS-26). Isp: NG Propulsion Products Catalog via Wikipedia
// “Graphite-Epoxy Motor”. Thrust values are burn-averaged and derived so that thrust × burn time
// equals the total impulse (propellant × Isp × g0):
//   thrustVac = propellant / burn time × ispVac × g0
//   thrustSL  = thrustVac − 101,325 Pa × nozzle exit area;  ispSL = ispVac × thrustSL / thrustVac
// Peak thrust (datasheet) is higher: GEM 63 1,649.6 kN, GEM 63XL 2,060.6 kN. Cost: game balance.
import type { BoosterPart } from '@/game/types'

const NG_URL = 'https://cdn.northropgrumman.com/-/media/wp-content/uploads/GEM-63-GEM-63XL-Datasheet.pdf'

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
      'Atlas V strap-on since 2020. NG GEM 63 datasheet: 49,300 kg total, 44,200 kg propellant, 97.6 s burn, 1.60 m × 20.09 m, nozzle exit 1.37 m. Isp 279.06 s (vac): NG catalog via Wikipedia “Graphite-Epoxy Motor”. Average thrust and SL values derived (see file header). Cost: game balance.',
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
      'Vulcan strap-on. NG GEM 63XL datasheet: 53,400 kg total, 48,000 kg propellant, 87.3 s burn, 1.60 m × 21.95 m, nozzle exit 1.42 m. Isp 280.3 s (vac): NG catalog via Wikipedia “Graphite-Epoxy Motor”. Average thrust and SL values derived (see file header). Cost: game balance.',
    url: NG_URL,
  },
]

export function boosterById(id: string): BoosterPart | undefined {
  return BOOSTERS.find((b) => b.id === id)
}
