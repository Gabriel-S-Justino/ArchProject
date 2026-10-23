// Preset rockets built only from catalog parts (engines.ts, tanks.ts, boosters.ts). Presets with
// `lspCurveId` reproduce a real vehicle stage by stage from presetReference.ts and are validated
// against its NASA LSP payload-vs-C3 curve (src/physics/launcher.test.ts). Names are generic
// vehicle classes: no logos or brand art.
//
// Fairings: the game offers only 'small' (1,500 kg) and 'large' (2,500 kg), game balance. Each
// validated preset takes the option closer to the real fairing mass in presetReference.ts:
// Atlas V 4-m LPF 2,127 kg → large; Falcon Heavy 1,700 kg → small; Vulcan 5.4 m 2,640 kg → large.
import type { RocketDesign } from '@/physics/launcher'

export interface RocketPreset {
  id: string
  name: string
  description: string
  rocket: RocketDesign
  /** LSP curve presetId (lsp.ts) this preset is validated against. */
  lspCurveId?: string
}

export const PRESETS: RocketPreset[] = [
  {
    id: 'atlas-v-401',
    name: 'Atlas V 401-class',
    description:
      'Kerosene core with one RD-180 and a single-engine hydrogen Centaur upper stage, no strap-ons. The class that launched MRO and MAVEN to Mars. Lifts off at a thrust-to-weight of about 1.17, like the real vehicle.',
    rocket: {
      stages: [
        { tanks: ['tank-k381-ccb'], engineId: 'rd-180', engineCount: 1 },
        { tanks: ['tank-h305-centaur'], engineId: 'rl10c-1', engineCount: 1 },
      ],
      fairing: 'large',
    },
    lspCurveId: 'atlas-v-401',
  },
  {
    id: 'falcon-heavy-exp',
    name: 'Falcon Heavy-class (expendable)',
    description:
      'Three kerosene cores of nine Merlin engines each, the two side cores strapped on as liquid boosters, and a Merlin Vacuum upper stage. Nothing is recovered.',
    rocket: {
      stages: [
        {
          tanks: ['tank-k37-falcon-core'],
          engineId: 'merlin-1d',
          engineCount: 9,
          boosterId: 'booster-falcon-side',
          boosterCount: 2,
        },
        { tanks: ['tank-k37-falcon-upper'], engineId: 'merlin-vac', engineCount: 1 },
      ],
      fairing: 'small',
    },
    lspCurveId: 'falcon-heavy-exp',
  },
  {
    id: 'vulcan-vc4',
    name: 'Vulcan VC4-class',
    description:
      'Methane core with two BE-4 engines, four GEM 63XL solid boosters and a two-engine hydrogen Centaur V upper stage.',
    rocket: {
      stages: [
        {
          tanks: ['tank-m54-vulcan'],
          engineId: 'be-4',
          engineCount: 2,
          boosterId: 'gem-63xl',
          boosterCount: 4,
        },
        { tanks: ['tank-h54-centaur-v'], engineId: 'rl10c-1-1', engineCount: 2 },
      ],
      fairing: 'large',
    },
    lspCurveId: 'vulcan-vc4',
  },
  {
    id: 'falcon-9',
    name: 'Falcon 9-class (expendable)',
    description:
      'One kerosene core of nine Merlin engines and a Merlin Vacuum upper stage. No performance curve to validate against: the expendable version is no longer listed by the launch-services performance site.',
    rocket: {
      stages: [
        { tanks: ['tank-k37-falcon-core'], engineId: 'merlin-1d', engineCount: 9 },
        { tanks: ['tank-k37-falcon-upper'], engineId: 'merlin-vac', engineCount: 1 },
      ],
      fairing: 'small',
    },
  },
  {
    id: 'reference',
    name: 'Reference launcher (Atlas V 401-class)',
    description:
      'The game’s balance reference: the same stack as the Atlas V 401-class preset, the rocket that launched MAVEN. Sends a typical 1.5 t Mars orbiter to the best transfer of the window within the 90% launch margin.',
    rocket: {
      stages: [
        { tanks: ['tank-k381-ccb'], engineId: 'rd-180', engineCount: 1 },
        { tanks: ['tank-h305-centaur'], engineId: 'rl10c-1', engineCount: 1 },
      ],
      fairing: 'large',
    },
  },
]

export function presetById(id: string): RocketPreset | undefined {
  return PRESETS.find((p) => p.id === id)
}
