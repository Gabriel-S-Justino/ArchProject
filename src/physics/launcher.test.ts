import { describe, expect, it } from 'vitest'
import { ASCENT_DV, MISSION } from '@/data/mission'
import { LSP_CURVES } from '@/data/lsp'
import { PRESETS } from '@/data/presets'
import { G0, MU_EARTH, R_EARTH } from './constants'
import {
  FAIRINGS,
  ascentDeltaV,
  capacityToC3,
  launchTimeline,
  requiredDeltaV,
  rocketStats,
  type RocketDesign,
  type RocketStats,
} from './launcher'
import { escapeBurn } from './orbit'

/** Collects every numeric leaf (with its path) of a plain object/array. */
function numbers(value: unknown, path = ''): [string, number][] {
  if (typeof value === 'number') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((v, i) => numbers(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbers(v, path ? `${path}.${k}` : k))
  }
  return []
}

function expectAllFinite(stats: RocketStats, label: string) {
  for (const [k, v] of numbers(stats)) expect(Number.isFinite(v), `${label}: ${k} = ${v}`).toBe(true)
}

const preset = (id: string): RocketDesign => {
  const p = PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`no preset ${id}`)
  return structuredClone(p.rocket)
}

const NO_ENGINE: RocketDesign = {
  stages: [{ tanks: ['tank-k37-falcon-upper'], engineId: null, engineCount: 0 }],
  fairing: 'small',
}
const MISMATCHED: RocketDesign = {
  stages: [{ tanks: ['tank-h305-centaur'], engineId: 'rd-180', engineCount: 1 }],
  fairing: 'small',
}
const NO_TANKS: RocketDesign = { stages: [{ tanks: [], engineId: 'rd-180', engineCount: 1 }], fairing: 'small' }
const EMPTY: RocketDesign = { stages: [], fairing: 'small' }
const FOUR_STAGES: RocketDesign = {
  stages: [
    { tanks: ['tank-k381-ccb'], engineId: 'rd-180', engineCount: 1 },
    { tanks: ['tank-h305-centaur'], engineId: 'rl10c-1', engineCount: 1 },
    { tanks: ['tank-h305-centaur'], engineId: 'rl10c-1', engineCount: 1 },
    { tanks: ['tank-h305-centaur'], engineId: 'rl10c-1', engineCount: 1 },
  ],
  fairing: 'small',
}
const VACUUM_FIRST: RocketDesign = {
  stages: [{ tanks: ['tank-h305-centaur'], engineId: 'rl10c-1', engineCount: 1 }],
  fairing: 'small',
}
const BAD_COUNT: RocketDesign = {
  stages: [{ tanks: ['tank-k381-ccb'], engineId: 'rd-180', engineCount: 12 }],
  fairing: 'small',
}
const UPPER_BOOSTERS: RocketDesign = {
  stages: [
    { tanks: ['tank-k381-ccb'], engineId: 'rd-180', engineCount: 1 },
    { tanks: ['tank-h305-centaur'], engineId: 'rl10c-1', engineCount: 1, boosterId: 'gem-63', boosterCount: 2 },
  ],
  fairing: 'small',
}
const UNKNOWN_PARTS: RocketDesign = {
  stages: [{ tanks: ['tank-nope'], engineId: 'engine-nope', engineCount: 1, boosterId: 'nope', boosterCount: 2 }],
  fairing: 'small',
}
const INVALID: [string, RocketDesign][] = [
  ['no engine', NO_ENGINE],
  ['mismatched propellant', MISMATCHED],
  ['no tanks', NO_TANKS],
  ['empty', EMPTY],
  ['four stages', FOUR_STAGES],
  ['vacuum engine on stage 1', VACUUM_FIRST],
  ['12 engines', BAD_COUNT],
  ['boosters on an upper stage', UPPER_BOOSTERS],
  ['unknown parts', UNKNOWN_PARTS],
]

describe('rocketStats: invalid stacks (Review Focus 3)', () => {
  it('a stage with no engine is invalid with a readable error', () => {
    const s = rocketStats(NO_ENGINE, 1000)
    expect(s.valid).toBe(false)
    expect(s.errors).toContain('Stage 1 has no engine')
    expect(s.stages[0]!.errors).toContain('Stage 1 has no engine')
  })

  it('mismatched propellant (hydrolox tank, kerolox engine) is an error and capacity 0', () => {
    const s = rocketStats(MISMATCHED, 0)
    expect(s.valid).toBe(false)
    expect(s.errors.some((e) => /hydrolox/.test(e) && /kerolox/.test(e))).toBe(true)
    expect(capacityToC3(MISMATCHED, 10)).toBe(0)
  })

  it('no tanks, four stages and an empty stack are invalid', () => {
    expect(rocketStats(NO_TANKS, 0).errors).toContain('Stage 1 has no tanks')
    const four = rocketStats(FOUR_STAGES, 0)
    expect(four.valid).toBe(false)
    expect(four.errors.some((e) => /at most 3 stages/.test(e))).toBe(true)
    const empty = rocketStats(EMPTY, 0)
    expect(empty.valid).toBe(false)
    expect(empty.errors).toContain('Rocket has no stages')
    expect(empty.liftoffTwr).toBe(0)
    expect(capacityToC3(EMPTY, 10)).toBe(0)
  })

  it('a vacuum-only engine on the first stage cannot lift off (no 0/0)', () => {
    const s = rocketStats(VACUUM_FIRST, 500)
    expect(s.valid).toBe(false)
    expect(s.liftoffTwr).toBe(0)
    expect(s.errors.some((e) => /RL10C-1 cannot fire at sea level/.test(e))).toBe(true)
    expect(capacityToC3(VACUUM_FIRST, 0)).toBe(0)
  })

  it('engine count outside 1–9, boosters on upper stages and unknown parts are errors', () => {
    expect(rocketStats(BAD_COUNT, 0).errors.some((e) => /1–9 engines/.test(e))).toBe(true)
    expect(rocketStats(UPPER_BOOSTERS, 0).errors.some((e) => /first stage/.test(e))).toBe(true)
    const u = rocketStats(UNKNOWN_PARTS, 0)
    expect(u.errors.some((e) => /tank-nope/.test(e))).toBe(true)
    expect(u.errors.some((e) => /engine-nope/.test(e))).toBe(true)
    expect(u.errors.some((e) => /nope/.test(e) && /booster/i.test(e))).toBe(true)
  })

  it('every invalid stack: valid false, capacity 0, no NaN/Infinity anywhere in RocketStats', () => {
    for (const [label, r] of INVALID) {
      for (const payload of [0, 1500, 1e9, -10, NaN, Infinity]) {
        const s = rocketStats(r, payload)
        expect(s.valid, label).toBe(false)
        expect(s.errors.length, label).toBeGreaterThan(0)
        expectAllFinite(s, `${label} @ ${payload}`)
      }
      for (const c3 of [-5, 0, 10, 2000, NaN, Infinity]) expect(capacityToC3(r, c3), label).toBe(0)
    }
  })

  it('valid presets also never produce NaN/Infinity, even for absurd payloads', () => {
    for (const p of PRESETS) {
      for (const payload of [0, 1500, 1e9, -10, NaN, Infinity]) expectAllFinite(rocketStats(p.rocket, payload), p.id)
    }
  })
})

describe('rocketStats: physics', () => {
  it('every preset is a valid stack', () => {
    for (const p of PRESETS) {
      const s = rocketStats(p.rocket, 0)
      expect(s.errors, p.id).toEqual([])
      expect(s.valid, p.id).toBe(true)
      expect(s.stages.length).toBe(p.rocket.stages.length)
    }
  })

  it('a two-stage stack without boosters follows Tsiolkovsky per stage', () => {
    const r = preset('atlas-v-401')
    const s = rocketStats(r, 2000)
    // Upper stage: Centaur tank 20,830 + 2,053 kg, one RL10C-1 (190 kg, 449.7 s vac).
    const upperM0 = 20_830 + 2_053 + 190 + 2000
    expect(s.stages[1]!.m0).toBeCloseTo(upperM0, 6)
    expect(s.stages[1]!.dv).toBeCloseTo(449.7 * G0 * Math.log(upperM0 / (upperM0 - 20_830)), 6)
    // Stage 1 uses the mean of SL and vacuum Isp and carries the fairing.
    const m0 = 284_089 + 15_574 + 5_480 + upperM0 + FAIRINGS[r.fairing].massKg
    expect(s.stages[0]!.m0).toBeCloseTo(m0, 6)
    expect(s.stages[0]!.ispUsed).toBeCloseTo((311.3 + 337.8) / 2, 9)
    expect(s.stages[0]!.dv).toBeCloseTo(((311.3 + 337.8) / 2) * G0 * Math.log(m0 / (m0 - 284_089)), 6)
    expect(s.liftoffTwr).toBeCloseTo(3_827_000 / (m0 * G0), 9)
    expect(s.massKg).toBeCloseTo(m0, 6)
    expect(s.totalDv).toBeCloseTo(s.stages[0]!.dv + s.stages[1]!.dv, 6)
    // Burn time = propellant / mass flow.
    expect(s.stages[1]!.burnTime).toBeCloseTo(20_830 / (101_900 / (449.7 * G0)), 6)
  })

  it('totalDv decreases monotonically as payloadKg increases', () => {
    for (const p of PRESETS) {
      let prev = Infinity
      for (let kg = 0; kg <= 40_000; kg += 500) {
        const dv = rocketStats(p.rocket, kg).totalDv
        expect(dv, `${p.id} @ ${kg}`).toBeLessThan(prev)
        prev = dv
      }
    }
  })

  it('boosters: adding 2 GEM 63 to the Atlas V 401 raises liftoff TWR and capacity at C3 10', () => {
    const base = preset('atlas-v-401')
    const boosted = preset('atlas-v-401')
    boosted.stages[0] = { ...boosted.stages[0]!, boosterId: 'gem-63', boosterCount: 2 }
    const a = rocketStats(base, 2000)
    const b = rocketStats(boosted, 2000)
    expect(b.valid).toBe(true)
    expect(b.liftoffTwr).toBeGreaterThan(a.liftoffTwr)
    expect(capacityToC3(boosted, 10)).toBeGreaterThan(capacityToC3(base, 10))
    expect(b.costM).toBeGreaterThan(a.costM)
  })

  it('boosters burn in parallel: phase A until boosters are empty, then the core alone', () => {
    const r = preset('vulcan-vc4')
    const s = rocketStats(r, 5000)
    const st = s.stages[0]!
    // GEM 63XL: mean thrust and Isp; core: 2 × BE-4 mean thrust and Isp.
    const fb = (4 * (1_351_000 + 1_511_000)) / 2
    const ispB = (250.5 + 280.3) / 2
    const fc = (2 * (2_446_500 + 2_650_000)) / 2
    const ispC = (310 + 340) / 2
    const mdotB = fb / (ispB * G0)
    const mdotC = fc / (ispC * G0)
    const tB = (4 * 48_000) / mdotB
    const ispA = (fb + fc) / ((mdotB + mdotC) * G0)
    const above = s.stages[1]!.m0 + FAIRINGS[r.fairing].massKg
    const core = 353_400 + 17_800 + 2 * 5_400
    const m0 = above + core + 4 * 53_400
    const mA = m0 - (mdotB + mdotC) * tB
    const mB0 = mA - 4 * 5_400
    const dv = ispA * G0 * Math.log(m0 / mA) + ispC * G0 * Math.log(mB0 / (above + 17_800 + 2 * 5_400))
    expect(st.m0).toBeCloseTo(m0, 6)
    expect(st.dv).toBeCloseTo(dv, 6)
    expect(st.burnTime).toBeCloseTo(353_400 / mdotC, 6)
    expect(s.liftoffTwr).toBeCloseTo((2 * 2_446_500 + 4 * 1_351_000) / (m0 * G0), 9)
  })
})

describe('requiredDeltaV and capacityToC3', () => {
  it('requiredDeltaV at liftoff TWR 1.5 = 9400 + escape burn from the 200 km parking orbit', () => {
    expect(ASCENT_DV).toBe(9400)
    for (const c3 of [0, 9.18, 30]) {
      expect(requiredDeltaV(c3, 1.5)).toBeCloseTo(9400 + escapeBurn(MU_EARTH, R_EARTH + 200e3, Math.sqrt(c3) * 1000), 6)
    }
    expect(requiredDeltaV(-5, 1.5)).toBeLessThan(requiredDeltaV(0, 1.5))
    expect(requiredDeltaV(-5, 1.5)).toBeGreaterThan(ASCENT_DV)
    expect(requiredDeltaV(-1000, 1.5)).toBe(ASCENT_DV) // below circular-orbit energy: nothing to burn
    expect(Number.isFinite(requiredDeltaV(2000, 1.5))).toBe(true)
    expect(requiredDeltaV(2000, 1.5)).toBeGreaterThan(requiredDeltaV(100, 1.5))
    expect(requiredDeltaV(NaN, 1.5)).toBe(Infinity)
  })

  it('requiredDeltaV decreases as liftoff TWR increases (gravity loss), Infinity without thrust', () => {
    let prev = Infinity
    for (const twr of [0.5, 1, 1.1, 1.17, 1.3, 1.5, 1.6, 2, 3]) {
      const dv = requiredDeltaV(9.18, twr)
      expect(dv, `TWR ${twr}`).toBeLessThan(prev)
      prev = dv
    }
    // ASCENT_DV + K (1/TWR − 1/1.5) with K = 3000 m/s.
    expect(ascentDeltaV(1)).toBeCloseTo(9400 + 3000 * (1 - 1 / 1.5), 9)
    expect(ascentDeltaV(1.5)).toBe(9400)
    for (const twr of [0, -1, NaN, Infinity]) expect(requiredDeltaV(9.18, twr), `TWR ${twr}`).toBe(Infinity)
  })

  it('capacityToC3 decreases monotonically with C3 and is 0 (never NaN) for absurd C3', () => {
    for (const p of PRESETS) {
      let prev = Infinity
      for (let c3 = -5; c3 <= 120; c3 += 5) {
        const kg = capacityToC3(p.rocket, c3)
        expect(Number.isFinite(kg), `${p.id} @ ${c3}`).toBe(true)
        expect(kg, `${p.id} @ ${c3}`).toBeLessThanOrEqual(prev)
        prev = kg
      }
      expect(capacityToC3(p.rocket, 10)).toBeGreaterThan(capacityToC3(p.rocket, 30))
      for (const c3 of [500, 2000, Infinity, NaN]) expect(capacityToC3(p.rocket, c3), `${p.id} @ ${c3}`).toBe(0)
    }
  })

  it('capacity is the largest payload (to 1 kg) whose totalDv still meets requiredDeltaV', () => {
    const r = preset('atlas-v-401')
    const kg = capacityToC3(r, 10)
    expect(Number.isInteger(kg)).toBe(true)
    const at = rocketStats(r, kg)
    const over = rocketStats(r, kg + 2)
    expect(at.totalDv).toBeGreaterThanOrEqual(requiredDeltaV(10, at.liftoffTwr))
    expect(over.totalDv).toBeLessThan(requiredDeltaV(10, over.liftoffTwr))
  })

  it('validation: every LSP point within ±15% (no R3 fallback needed)', () => {
    const withCurve = PRESETS.filter((p) => p.lspCurveId)
    expect(withCurve.map((p) => p.id).sort()).toEqual(['atlas-v-401', 'falcon-heavy-exp', 'vulcan-vc4'])
    for (const p of withCurve) {
      const curve = LSP_CURVES.find((c) => c.presetId === p.lspCurveId)!
      expect(curve, p.id).toBeDefined()
      for (const [c3, kg] of curve.points) {
        const err = Math.abs(capacityToC3(p.rocket, c3) - kg) / kg
        expect(err, `${p.id} C3 ${c3}: model ${capacityToC3(p.rocket, c3)} vs LSP ${kg}`).toBeLessThanOrEqual(0.15)
      }
    }
  })
})

describe('presets', () => {
  it('has the five presets with generic English names and no logos', () => {
    const ids = PRESETS.map((p) => p.id)
    for (const id of ['atlas-v-401', 'falcon-heavy-exp', 'vulcan-vc4', 'falcon-9', 'reference']) {
      expect(ids, id).toContain(id)
    }
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PRESETS) {
      expect(p.name, p.id).toMatch(/-class|Reference/)
      expect(p.description.length, p.id).toBeGreaterThan(20)
      expect(`${p.name} ${p.description}`, p.id).not.toMatch(/NASA|logo/i)
    }
    expect(PRESETS.find((p) => p.id === 'falcon-9')!.lspCurveId).toBeUndefined()
    expect(PRESETS.find((p) => p.id === 'falcon-9')!.rocket.stages[0]!.boosterCount ?? 0).toBe(0)
  })

  it('reference preset lifts a ~1,500 kg spacecraft to the best transfer (C3 9.18) within 0.9 × capacity', () => {
    const r = preset('reference')
    expect(1500).toBeLessThanOrEqual(0.9 * capacityToC3(r, 9.18))
    expect(rocketStats(r, 1500).liftoffTwr).toBeGreaterThanOrEqual(MISSION.minLiftoffTwr)
    expect(r).toEqual(preset('atlas-v-401')) // MAVEN's real rocket
  })
})

describe('launchTimeline', () => {
  it('a preset flies: events ordered by t with liftoff, booster-sep, every stage-sep, fairing-sep, orbit, departure', () => {
    for (const id of ['atlas-v-401', 'reference', 'falcon-heavy-exp', 'vulcan-vc4', 'falcon-9']) {
      const r = preset(id)
      const tl = launchTimeline(r, 1500, 9.18)
      expect(tl.failure, id).toBeUndefined()
      expect(tl.reachedOrbit, id).toBe(true)
      expect(tl.reachedDeparture, id).toBe(true)
      const kinds = tl.events.map((e) => e.kind)
      expect(kinds[0], id).toBe('liftoff')
      expect(tl.events[0]!.t).toBe(0)
      for (let i = 1; i < tl.events.length; i++) {
        expect(tl.events[i]!.t, id).toBeGreaterThanOrEqual(tl.events[i - 1]!.t)
        expect(Number.isFinite(tl.events[i]!.t), id).toBe(true)
      }
      for (let i = 0; i < r.stages.length - 1; i++) {
        expect(tl.events.some((e) => e.kind === 'stage-sep' && e.stage === i), `${id} stage-sep ${i}`).toBe(true)
      }
      expect(kinds, id).toContain('fairing-sep')
      expect(kinds.indexOf('departure-burn'), id).toBeGreaterThan(kinds.indexOf('orbit'))
      expect(kinds.at(-1), id).toBe('departure-burn')
      if (r.stages[0]!.boosterCount) {
        expect(kinds.indexOf('booster-sep'), id).toBeGreaterThan(0)
        expect(kinds.indexOf('booster-sep'), id).toBeLessThan(kinds.indexOf('stage-sep'))
      }
    }
  })

  it('burn times are real seconds: stage separation happens at the first-stage burn time', () => {
    const r = preset('reference')
    const s = rocketStats(r, 1500)
    const sep = launchTimeline(r, 1500, 9.18).events.find((e) => e.kind === 'stage-sep')!
    expect(sep.t).toBeCloseTo(s.stages[0]!.burnTime, 6)
    expect(sep.t).toBeGreaterThan(200) // the real Atlas booster burns ~ 4 min
  })

  it('a TWR-1.05 stack (below the 1.1 minimum) fails at the pad', () => {
    expect(MISSION.minLiftoffTwr).toBe(1.1)
    const r = preset('atlas-v-401')
    const empty = rocketStats(r, 0)
    const payload = (3_827_000 / (1.05 * G0)) - empty.massKg
    expect(rocketStats(r, payload).liftoffTwr).toBeCloseTo(1.05, 6)
    const tl = launchTimeline(r, payload, 0)
    expect(tl.failure).toBe('twr')
    expect(tl.reachedOrbit).toBe(false)
    expect(tl.reachedDeparture).toBe(false)
    expect(tl.events.map((e) => e.kind)).toEqual(['liftoff'])
  })

  it('reaches orbit but not the departure C3 when overloaded → failure dv', () => {
    const r = preset('reference')
    const kg = capacityToC3(r, 9.18)
    const tl = launchTimeline(r, kg + 300, 9.18)
    expect(tl.reachedOrbit).toBe(true)
    expect(tl.reachedDeparture).toBe(false)
    expect(tl.failure).toBe('dv')
    expect(tl.events.some((e) => e.kind === 'departure-burn')).toBe(false)
  })

  it('cannot reach orbit with too little Δv → failure dv, no orbit event', () => {
    const r: RocketDesign = {
      stages: [{ tanks: ['tank-k37-falcon-core'], engineId: 'merlin-1d', engineCount: 9 }],
      fairing: 'small',
    }
    const s = rocketStats(r, 0)
    expect(s.liftoffTwr).toBeGreaterThan(MISSION.minLiftoffTwr)
    expect(s.totalDv).toBeLessThan(ascentDeltaV(s.liftoffTwr))
    const tl = launchTimeline(r, 0, 0)
    expect(tl.failure).toBe('dv')
    expect(tl.reachedOrbit).toBe(false)
    expect(tl.events.some((e) => e.kind === 'orbit')).toBe(false)
  })

  it('an invalid stack never flies', () => {
    for (const [label, r] of INVALID) {
      const tl = launchTimeline(r, 1000, 9.18)
      expect(tl.reachedOrbit, label).toBe(false)
      expect(tl.failure, label).toBeDefined()
      for (const e of tl.events) expect(Number.isFinite(e.t), label).toBe(true)
    }
  })
})
