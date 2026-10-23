import { describe, expect, it } from 'vitest'
import { boosterById } from '@/data/boosters'
import { engineById } from '@/data/engines'
import { presetById } from '@/data/presets'
import { tankById } from '@/data/tanks'
import type { RocketDesign } from '@/physics/launcher'
import { bellSpec, clusterPositions, ogiveProfile, rocketLayout } from './rocketLayout'

const preset = (id: string): RocketDesign => presetById(id)!.rocket

describe('rocketLayout', () => {
  it('stacks the Atlas V 401-class at real proportions', () => {
    const L = rocketLayout(preset('atlas-v-401'))
    expect(L.stages).toHaveLength(2)
    const [s1, s2] = L.stages
    expect(s1!.diameter).toBeCloseTo(3.81)
    expect(s2!.diameter).toBeCloseTo(3.05)
    // Tank lengths come straight from the catalog.
    expect(s1!.tanks[0]!.length).toBe(tankById('tank-k381-ccb')!.lengthM)
    expect(s2!.tanks[0]!.length).toBe(tankById('tank-h305-centaur')!.lengthM)
    expect(s1!.tanks[0]!.propellant).toBe('kerolox')
    expect(s2!.tanks[0]!.propellant).toBe('hydrolox')
    // Stage 2 sits above stage 1, its bell inside stage 1's interstage, which narrows 3.81 → 3.05 m.
    expect(s2!.y0).toBeGreaterThan(s1!.tankTop)
    expect(s1!.interstage).toMatchObject({ d0: 3.81, d1: 3.05 })
    expect(s1!.interstage!.y1).toBeGreaterThan(s2!.y0)
    expect(s1!.interstage!.y1).toBeLessThan(s2!.y0 + s2!.engines!.length)
    // RD-180: one engine, two chambers.
    expect(s1!.engines!.bells).toBe(2)
    // The real Atlas V 401 is 58.3 m tall.
    expect(L.height).toBeGreaterThan(50)
    expect(L.height).toBeLessThan(66)
    expect(L.boosters).toBeNull()
    expect(L.fairing!.diameter).toBeCloseTo(5.4)
    expect(L.fairing!.boattail).not.toBeNull()
  })

  it('puts Falcon Heavy-class side cores left and right, with the core’s nine-engine cluster', () => {
    const L = rocketLayout(preset('falcon-heavy-exp'))
    const b = L.boosters!
    expect(b.solid).toBe(false)
    expect(b.count).toBe(2)
    const ringR = 3.7 / 2 + 3.7 / 2 + 0.12
    expect(b.positions[0]![0]).toBeCloseTo(ringR)
    expect(b.positions[1]![0]).toBeCloseTo(-ringR)
    expect(b.positions[0]![1]).toBeCloseTo(0)
    expect(b.engines!.bells).toBe(9)
    expect(L.stages[0]!.engines!.bells).toBe(9)
    expect(L.stages[0]!.engines!.outerR).toBeLessThanOrEqual(3.7 / 2 + 1e-9)
    expect(b.length).toBe(boosterById('booster-falcon-side')!.lengthM)
    expect(L.radius).toBeCloseTo(ringR + 3.7 / 2)
  })

  it('rings four slim solid boosters around a Vulcan VC4-class core', () => {
    const L = rocketLayout(preset('vulcan-vc4'))
    const b = L.boosters!
    expect(b.solid).toBe(true)
    expect(b.propellant).toBe('solid')
    expect(b.count).toBe(4)
    expect(b.diameter).toBe(1.6)
    // 45° offset so two boosters show on each side in a side view.
    for (const [x, z] of b.positions) expect(Math.abs(x)).toBeCloseTo(Math.abs(z))
    expect(b.body.y1 + b.noseLength).toBeCloseTo(b.length)
  })

  it('handles empty and broken stacks without NaN', () => {
    const empty = rocketLayout({ stages: [], fairing: 'small' })
    expect(empty.height).toBe(0)
    expect(empty.fairing).toBeNull()
    expect(empty.stages).toHaveLength(0)

    const broken = rocketLayout({
      stages: [{ tanks: ['nope'], engineId: null, engineCount: 0 }],
      fairing: 'large',
    })
    expect(broken.stages[0]!.engines).toBeNull()
    expect(broken.stages[0]!.tanks).toHaveLength(0)
    expect(broken.stages[0]!.tankTop).toBeGreaterThan(0)
    expect(Number.isFinite(broken.height)).toBe(true)
    expect(broken.height).toBeGreaterThan(0)
  })

  it('updates when a tank is added (live hangar)', () => {
    const r = preset('atlas-v-401')
    const more: RocketDesign = { ...r, stages: [{ ...r.stages[0]!, tanks: [...r.stages[0]!.tanks, 'tank-k381-half'] }, r.stages[1]!] }
    expect(rocketLayout(more).height - rocketLayout(r).height).toBeCloseTo(tankById('tank-k381-half')!.lengthM)
  })
})

describe('engine bells', () => {
  it('sizes known engines from the table and unknown ones by thrust', () => {
    expect(bellSpec(engineById('merlin-vac')!).exitD).toBeGreaterThan(bellSpec(engineById('merlin-1d')!).exitD)
    const fake = { ...engineById('rs-25')!, id: 'x-unknown' }
    const spec = bellSpec(fake)
    expect(spec.exitD).toBeGreaterThan(0.6)
    expect(spec.exitD).toBeLessThan(2.7)
  })

  it('clusters 1–18 nozzles inside the stage', () => {
    for (let n = 1; n <= 18; n++) {
      const R = 1.85
      const exitR = 0.46
      const { positions, scale } = clusterPositions(n, exitR, R)
      expect(positions).toHaveLength(n)
      for (const [x, z] of positions) expect(Math.hypot(x, z) + exitR * scale).toBeLessThanOrEqual(R + 1e-9)
      // No two bells overlap.
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const [a, b] = [positions[i]!, positions[j]!]
          expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(2 * exitR * scale - 1e-9)
        }
    }
  })
})

describe('ogiveProfile', () => {
  it('runs from the full radius at the base to a point at the tip', () => {
    const p = ogiveProfile(2.7, 7)
    expect(p[0]![0]).toBeCloseTo(2.7)
    expect(p.at(-1)).toEqual([0, 7])
    for (let i = 1; i < p.length; i++) expect(p[i]![0]).toBeLessThanOrEqual(p[i - 1]![0] + 1e-9)
  })
})
