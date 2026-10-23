// Launch-vehicle performance (separated spacecraft mass vs C3) from the NASA Launch Services
// Program (LSP) Launch Vehicle Performance Website. These curves validate the game's modular
// launcher presets (Task 6). LSP ground rules: 3-sigma guidance reserves, standard adapter mass
// already deducted, generic declination — real missions typically fly a few % above the curve.
// Falcon 9 has no curve on purpose: LSP no longer lists Falcon 9 expendable and its recovery
// curves stop at C3 = 10.
import type { LspCurve } from '@/game/types'

const LSP_URL = 'https://elvperf.ksc.nasa.gov/Pages/Query.aspx'

export const LSP_CURVES: LspCurve[] = [
  {
    vehicle: 'Atlas V 401',
    presetId: 'atlas-v-401',
    source:
      'NASA LSP Launch Vehicle Performance Website, Atlas V 401 curve as digitized in AMAT (Girija, open-source; arXiv:2310.05994 cites the LSP site), launcher-data/atlas-v401.csv. Atlas V is no longer offered on the live LSP site. Points at even C3 linearly interpolated from the digitized points (0.26, 3,020) (5.75, 2,677) (11.25, 2,354) (18.63, 1,946) (24.17, 1,662) (29.85, 1,395) (35.10, 1,172) kg; C3 0 extrapolated from the first segment. AMAT’s Falcon Heavy file matches today’s live LSP within 1%.',
    url: 'https://raw.githubusercontent.com/athulpg007/AMAT/master/launcher-data/atlas-v401.csv',
    points: [
      [0, 3036],
      [2, 2911],
      [4, 2786],
      [6, 2662],
      [8, 2545],
      [10, 2428],
      [12, 2313],
      [14, 2202],
      [16, 2092],
      [18, 1981],
      [20, 1876],
      [25, 1623],
      [30, 1389],
    ],
  },
  {
    vehicle: 'Falcon Heavy (expendable)',
    presetId: 'falcon-heavy-exp',
    source:
      'NASA LSP Launch Vehicle Performance Website, live High Energy query 2026-10-22, “Falcon Heavy Expendable” (KSC LC-39A, no booster or core recovery, 3-sigma reserves).',
    url: LSP_URL,
    points: [
      [0, 15010],
      [2, 14450],
      [4, 13890],
      [6, 13360],
      [8, 12850],
      [10, 12345],
      [12, 11880],
      [14, 11420],
      [16, 10975],
      [18, 10545],
      [20, 10115],
      [25, 9130],
      [30, 8225],
    ],
  },
  {
    vehicle: 'Vulcan VC4',
    presetId: 'vulcan-vc4',
    source:
      'NASA LSP Launch Vehicle Performance Website, live High Energy query 2026-10-22, “Vulcan VC4” (SLC-41, 185 km park orbit, ≤ 60 min coast, C22 adapter deducted, 3-sigma mission margin).',
    url: LSP_URL,
    points: [
      [-5, 9320],
      [0, 8550],
      [2, 8255],
      [4, 7965],
      [6, 7680],
      [8, 7410],
      [10, 7140],
      [12, 6880],
      [14, 6620],
      [16, 6365],
      [18, 6120],
      [20, 5880],
      [25, 5320],
      [30, 4780],
    ],
  },
]

/** Real launches to compare against the curves. */
export const LSP_ANCHORS: {
  mission: 'maven'
  presetId: string
  c3: number
  massKg: number
  source: string
  url: string
}[] = [
  {
    mission: 'maven',
    presetId: 'atlas-v-401',
    c3: 12.07,
    massKg: 2454,
    source:
      'MAVEN launch 18 Nov 2013 on Atlas V 401: launch mass 2,454 kg (NASA MAVEN launch press kit); C3 12.07 km²/s² at launch-period open (NTRS 20160000802, Table 1). The LSP curve gives ≈ 2,309 kg there: real missions fly ~6% above the conservative curve.',
    url: 'https://ntrs.nasa.gov/api/citations/20160000802/downloads/20160000802.pdf',
  },
]

export function lspCurve(presetId: string): LspCurve | undefined {
  return LSP_CURVES.find((c) => c.presetId === presetId)
}

/** Linear interpolation on an LSP curve, kg. NaN for an unknown preset or a C3 outside the curve. */
export function lspPayloadKg(presetId: string, c3: number): number {
  const pts = lspCurve(presetId)?.points
  if (!pts || !Number.isFinite(c3)) return NaN
  for (let i = 1; i < pts.length; i++) {
    const [c0, k0] = pts[i - 1]!
    const [c1, k1] = pts[i]!
    if (c3 >= c0 && c3 <= c1) return k0 + ((c3 - c0) * (k1 - k0)) / (c1 - c0)
  }
  return NaN
}
