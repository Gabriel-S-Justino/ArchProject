// Liquid rocket engines. Thrust, Isp and mass are public specs (sources per entry, read 2026-10-22);
// "estimate:" marks values no primary source confirmed. Costs are game balance (US$ M per engine),
// ordered by real-world class: Merlin < RL10 < BE-4 < RD-180 < RS-25.
import type { EnginePart } from '@/game/types'

const AVUG =
  'ULA Atlas V Launch Services User’s Guide, Rev 11 (Mar 2010), Fig. 1.4.1-3'
const AVUG_URL = 'https://www.ulalaunch.com/docs/default-source/rockets/atlasvusersguide2010.pdf'

export const ENGINES: EnginePart[] = [
  {
    id: 'rd-180',
    name: 'RD-180',
    propellant: 'kerolox',
    thrustSL: 3_827_000,
    thrustVac: 4_152_000,
    ispSL: 311.3,
    ispVac: 337.8,
    massKg: 5_480,
    costM: 30,
    source: `Thrust/Isp (100% throttle): ${AVUG}. Dry mass 5,480 kg: NPO Energomash via Glavkosmos (trade.glavkosmos.com/rd-180) and Wikipedia “RD-180”. Cost: game balance.`,
    url: AVUG_URL,
  },
  {
    id: 'merlin-1d',
    name: 'Merlin 1D',
    propellant: 'kerolox',
    thrustSL: 845_000,
    thrustVac: 914_000,
    ispSL: 282,
    ispVac: 311,
    massKg: 470,
    costM: 2.5,
    source:
      'Thrust/Isp (Block 5): SpaceX Falcon User’s Guide 2020 (archived) via Wikipedia “SpaceX Merlin”; vac thrust = 8,227 kN stage ÷ 9 (Wikipedia “Falcon 9”). Mass 470 kg: estimate: secondary-source figure, not published by SpaceX. Cost: game balance.',
    url: 'https://web.archive.org/web/20201202093334/https://www.spacex.com/media/falcon_users_guide_042020.pdf',
  },
  {
    id: 'merlin-vac',
    name: 'Merlin 1D Vacuum',
    propellant: 'kerolox',
    thrustSL: 0,
    thrustVac: 981_000,
    ispSL: 0,
    ispVac: 348,
    massKg: 500,
    costM: 4,
    source:
      'Vac thrust 981 kN, Isp 348 s: Wikipedia “Falcon 9” (Block 5, citing spacex.com); the Falcon Heavy article lists 934 kN. Vacuum nozzle, not operable at sea level. Mass 500 kg: estimate: Merlin 1D plus large nozzle extension, no published figure. Cost: game balance.',
    url: 'https://en.wikipedia.org/wiki/Falcon_9',
  },
  {
    id: 'rs-25',
    name: 'RS-25D',
    propellant: 'hydrolox',
    thrustSL: 1_860_000,
    thrustVac: 2_279_000,
    ispSL: 366,
    ispVac: 452.3,
    massKg: 3_177,
    costM: 60,
    source:
      '109% rated power level: 418,000 lbf SL / 512,300 lbf vac, Isp 366/452.3 s (Aerojet Rocketdyne RS-25 data, archived rocket.com, via Wikipedia “RS-25”; NASA SLS RS-25 fact sheet). Mass 3,177 kg: Wikipedia. Cost: game balance.',
    url: 'https://www.nasa.gov/wp-content/uploads/2020/09/final_sls_rs25_fact_sheet_508_07312015.pdf',
  },
  {
    id: 'rl10c-1',
    name: 'RL10C-1',
    propellant: 'hydrolox',
    thrustSL: 0,
    thrustVac: 101_900,
    ispSL: 0,
    ispVac: 449.7,
    massKg: 190,
    costM: 14,
    source:
      'Atlas V Centaur engine since 2014. Thrust 22,900 lbf (101.9 kN): ULA Mars 2020 mission overview; Isp 449.7 s, mass 190 kg: Wikipedia “RL10” (citing NTRS 20110015783 and Aerojet Rocketdyne data). Vacuum only. Cost: game balance.',
    url: 'https://www.ulalaunch.com/docs/default-source/launch-booklets/mars2020_mobrochure_200717.pdf',
  },
  {
    id: 'rl10c-1-1',
    name: 'RL10C-1-1',
    propellant: 'hydrolox',
    thrustSL: 0,
    thrustVac: 105_980,
    ispSL: 0,
    ispVac: 453.8,
    massKg: 188,
    costM: 15,
    source:
      'Centaur V engine. 23,825 lbf (105.98 kN), Isp 453.8 s, 415 lb (188 kg): Aerojet Rocketdyne RL10 data sheet (archived) via Wikipedia “RL10”. Vacuum only. Cost: game balance.',
    url: 'https://web.archive.org/web/20220130111530/https://rocket.com/sites/default/files/documents/Capabilities/PDFs/RL10_data_sheet.pdf',
  },
  {
    id: 'be-4',
    name: 'BE-4',
    propellant: 'methalox',
    thrustSL: 2_446_500,
    thrustVac: 2_650_000,
    ispSL: 310,
    ispVac: 340,
    massKg: 5_400,
    costM: 18,
    source:
      'SL thrust 550,000 lbf (2,446.5 kN): ULA BE-4 fact sheet. Isp 340 s: estimate: the ULA fact sheet quotes ~340 s without saying SL or vacuum; treated as vacuum. SL Isp 310 s: estimate: no primary source (Wikipedia “Vulcan Centaur” lists 320 s, not traced to a primary source); ~310 s is the research best value for a staged-combustion methalox engine at sea level. Vac thrust 2,650 kN: estimate: research best value (≈ SL thrust × Isp ratio 340/310 = 2,683 kN). Mass 5,400 kg: estimate: secondary source (unofficial). Cost: game balance.',
    url: 'https://www.ulalaunch.com/docs/default-source/news-items/be-4_fact_sheet_web_final_2.pdf',
  },
]

export function engineById(id: string): EnginePart | undefined {
  return ENGINES.find((e) => e.id === id)
}
