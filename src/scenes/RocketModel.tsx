// The player's rocket as meshes, built from rocketLayout (catalog dimensions, 1 unit = 1 m).
// Generic livery: kerolox tanks off-white, hydrolox and methalox tanks in a warm insulation-foam
// tone, composite structure in graphite, metal bells. No logos, no flags.
//
// The parts are exported separately (StageParts, BoosterParts, FairingHalf, PayloadParts) so the
// launch scene can animate separations; RocketModel composes them for the hangar. Geometries and
// materials are memoised per layout and disposed on change and on unmount.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { Propellant } from '@/game/types'
import type { RocketDesign } from '@/physics/launcher'
import { ogiveProfile, rocketLayout, type BoosterLayout, type EngineCluster, type RocketLayout, type StageLayout } from './rocketLayout'

// ---------------------------------------------------------------------------------------------
// Kit: shared geometries and materials

function bellProfile(): THREE.Vector2[] {
  // Unit bell: exit radius 1 at y = 0, throat at y = 0.8, a short chamber above it.
  const pts: THREE.Vector2[] = []
  const rt = 0.3
  for (let i = 0; i <= 14; i++) {
    const s = 1 - i / 14 // exit (s = 1) → throat (s = 0)
    pts.push(new THREE.Vector2(rt + (1 - rt) * (1 - Math.pow(1 - s, 1.8)), 0.8 * (1 - s)))
  }
  pts.push(new THREE.Vector2(0.36, 0.86), new THREE.Vector2(0.42, 0.9), new THREE.Vector2(0.42, 1), new THREE.Vector2(0.001, 1))
  return pts
}

function frustum(r0: number, r1: number, h: number, open = true): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(Math.max(0.001, r1), Math.max(0.001, r0), Math.max(0.01, h), 48, 1, open)
  g.translate(0, h / 2, 0)
  return g
}

function latheGeom(points: [number, number][], phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)),
    48,
    phiStart,
    phiLength,
  )
}

export interface RocketMaterials {
  kerolox: THREE.MeshStandardMaterial
  hydrolox: THREE.MeshStandardMaterial
  methalox: THREE.MeshStandardMaterial
  solid: THREE.MeshStandardMaterial
  structure: THREE.MeshStandardMaterial
  bell: THREE.MeshStandardMaterial
  bellVac: THREE.MeshStandardMaterial
  fairing: THREE.MeshStandardMaterial
  foil: THREE.MeshStandardMaterial
  panel: THREE.MeshStandardMaterial
}

function makeMaterials(): RocketMaterials {
  const std = (color: string, roughness: number, metalness: number, side: THREE.Side = THREE.FrontSide) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, side })
  return {
    kerolox: std('#e2dfd8', 0.48, 0.04),
    hydrolox: std('#a8835f', 0.9, 0.0),
    methalox: std('#b9946c', 0.86, 0.0),
    solid: std('#eceae4', 0.42, 0.02),
    structure: std('#2b2f34', 0.55, 0.25, THREE.DoubleSide),
    bell: std('#6a6763', 0.36, 0.85, THREE.DoubleSide),
    bellVac: std('#3a3937', 0.45, 0.7, THREE.DoubleSide),
    fairing: std('#eeede8', 0.4, 0.02, THREE.DoubleSide),
    foil: std('#b98d3e', 0.3, 1.0),
    panel: std('#1c2430', 0.35, 0.6),
  }
}

export function tankMaterial(m: RocketMaterials, p: Propellant): THREE.MeshStandardMaterial {
  return p === 'hydrolox' ? m.hydrolox : p === 'methalox' ? m.methalox : p === 'solid' ? m.solid : m.kerolox
}

export interface RocketKit {
  layout: RocketLayout
  mat: RocketMaterials
  cylinder: THREE.BufferGeometry
  bell: THREE.BufferGeometry
  interstages: (THREE.BufferGeometry | null)[]
  upperAft: (THREE.BufferGeometry | null)[]
  fairingHalves: [THREE.BufferGeometry, THREE.BufferGeometry] | null
  boattail: THREE.BufferGeometry | null
  boosterNose: THREE.BufferGeometry | null
  adapter: THREE.BufferGeometry | null
}

/** Disposes every geometry/material in `objs` when they change or on unmount. */
function useDispose(objs: readonly ({ dispose(): void } | null | undefined)[]) {
  useEffect(() => () => objs.forEach((o) => o?.dispose()), [objs])
}

/** Geometries and materials for one layout (memoised; disposed when the layout changes or on unmount). */
export function useRocketKit(layout: RocketLayout): RocketKit {
  const shared = useMemo(() => {
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 48, 1, false)
    cylinder.translate(0, 0.5, 0)
    const bell = new THREE.LatheGeometry(bellProfile(), 32)
    return { cylinder, bell, mat: makeMaterials() }
  }, [])
  useDispose(useMemo(() => [shared.cylinder, shared.bell, ...Object.values(shared.mat)], [shared]))

  const perLayout = useMemo(() => {
    const interstages = layout.stages.map((s) =>
      s.interstage ? frustum(s.interstage.d0 / 2, s.interstage.d1 / 2, s.interstage.y1 - s.interstage.y0) : null,
    )
    const upperAft = layout.stages.map((s) =>
      s.index > 0 && s.engines ? frustum(Math.max(0.3, s.engines.outerR * 0.55), s.diameter / 2, s.aft.y1 - s.aft.y0, false) : null,
    )
    const f = layout.fairing
    let fairingHalves: RocketKit['fairingHalves'] = null
    let boattail: THREE.BufferGeometry | null = null
    if (f) {
      const R = f.diameter / 2
      const cylL = f.cylinder.y1 - f.cylinder.y0
      const pts: [number, number][] = [[R, 0], ...ogiveProfile(R, f.nose.y1 - f.nose.y0, 18).map(([r, y]): [number, number] => [r, y + cylL])]
      fairingHalves = [latheGeom(pts, 0, Math.PI), latheGeom(pts, Math.PI, Math.PI)]
      if (f.boattail) boattail = frustum(f.boattail.d0 / 2, R, f.boattail.y1 - f.boattail.y0)
    }
    const b = layout.boosters
    const boosterNose = b ? latheGeom(ogiveProfile(b.diameter / 2, b.noseLength, 14)) : null
    const top = layout.stages.at(-1)
    const sc = layout.spacecraft
    const adapter =
      top && sc ? frustum(Math.min(top.diameter * 0.3, 1.2), sc.width * 0.32, Math.max(0.2, sc.y0 - top.tankTop)) : null
    return { interstages, upperAft, fairingHalves, boattail, boosterNose, adapter }
  }, [layout])
  useDispose(
    useMemo(
      () => [
        ...perLayout.interstages,
        ...perLayout.upperAft,
        ...(perLayout.fairingHalves ?? []),
        perLayout.boattail,
        perLayout.boosterNose,
        perLayout.adapter,
      ],
      [perLayout],
    ),
  )
  return { layout, mat: shared.mat, cylinder: shared.cylinder, bell: shared.bell, ...perLayout }
}

// ---------------------------------------------------------------------------------------------
// Parts

/** A cluster of bells as one instanced mesh (one draw call per cluster). */
export function Bells({ kit, cluster, y0 }: { kit: RocketKit; cluster: EngineCluster; y0: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    cluster.positions.forEach(([x, z], i) => {
      o.position.set(x, y0, z)
      o.scale.set(cluster.exitR, cluster.length, cluster.exitR)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.count = cluster.positions.length
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    invalidate()
  }, [cluster, y0, invalidate])
  return (
    <instancedMesh
      key={cluster.positions.length}
      ref={ref}
      args={[kit.bell, cluster.vacuum ? kit.mat.bellVac : kit.mat.bell, cluster.positions.length]}
      frustumCulled={false}
    />
  )
}

/** Smoothly slides its children to `y` (the hangar's live re-stacking); new parts drop in from above. */
function Slide({ y, animate, drop = 0, children }: { y: number; animate: boolean; drop?: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const invalidate = useThree((s) => s.invalidate)
  const first = useRef(true)
  useEffect(() => {
    const g = ref.current
    if (!g) return
    if (first.current) {
      first.current = false
      g.position.y = animate ? y + drop : y
    } else if (!animate) g.position.y = y
    invalidate()
  }, [y, animate, drop, invalidate])
  useFrame((_, dt) => {
    const g = ref.current
    if (!g || !animate) return
    const d = y - g.position.y
    if (Math.abs(d) < 0.002) {
      if (d !== 0) g.position.y = y
      return
    }
    g.position.y += d * (1 - Math.exp(-Math.min(dt, 0.05) * 9))
    invalidate()
  })
  return <group ref={ref}>{children}</group>
}

/** Where the cable raceway runs around each stage (radians from +x). */
const RACEWAY_ANGLE = Math.PI * 0.1

/** One stage: bells, aft section, tanks with intertank rings, and its interstage. */
export function StageParts({ kit, stage, assemble = false }: { kit: RocketKit; stage: StageLayout; assemble?: boolean }) {
  const { cylinder, mat } = kit
  const r = stage.diameter / 2
  const base = stage.y0
  const rel = (y: number) => y - base
  return (
    <Slide y={base} animate={assemble} drop={6}>
      {stage.engines && <Bells kit={kit} cluster={stage.engines} y0={0} />}
      {stage.index === 0 ? (
        <mesh geometry={cylinder} material={mat.structure} position-y={rel(stage.aft.y0)} scale={[r, stage.aft.y1 - stage.aft.y0, r]} />
      ) : (
        kit.upperAft[stage.index] && <mesh geometry={kit.upperAft[stage.index]!} material={mat.structure} position-y={rel(stage.aft.y0)} />
      )}
      {stage.tanks.map((t, k) => (
        <Slide key={`${k}-${t.id}`} y={rel(t.y0)} animate={assemble} drop={5}>
          <mesh geometry={cylinder} material={tankMaterial(mat, t.propellant)} scale={[t.diameter / 2, t.length, t.diameter / 2]} />
        </Slide>
      ))}
      {stage.tanks.length === 0 && (
        <mesh geometry={cylinder} material={mat.structure} position-y={rel(stage.aft.y1)} scale={[r * 0.98, stage.tankTop - stage.aft.y1, r * 0.98]} />
      )}
      {stage.tanks.length > 0 && (
        // Cable raceway along the tanks: a thin dark strake, a real-vehicle cue without markings.
        <mesh
          geometry={kit.cylinder}
          material={mat.structure}
          position={[Math.cos(RACEWAY_ANGLE) * r, rel(stage.tanks[0]!.y0), Math.sin(RACEWAY_ANGLE) * r]}
          scale={[0.16, stage.tankTop - stage.tanks[0]!.y0, 0.16]}
        />
      )}
      {stage.joints.map((j) => (
        <mesh key={j} geometry={cylinder} material={mat.structure} position-y={rel(j) - 0.15} scale={[r * 1.012, 0.3, r * 1.012]} />
      ))}
      {stage.interstage && kit.interstages[stage.index] && (
        <mesh geometry={kit.interstages[stage.index]!} material={mat.structure} position-y={rel(stage.interstage.y0)} />
      )}
    </Slide>
  )
}

/** One strap-on booster at its slot `k`, drawn about its own axis (x, z offset applied by the caller). */
export function BoosterParts({ kit, booster }: { kit: RocketKit; booster: BoosterLayout }) {
  const { cylinder, mat } = kit
  const r = booster.diameter / 2
  const body = booster.solid ? mat.solid : tankMaterial(mat, booster.propellant)
  return (
    <group>
      {booster.engines && <Bells kit={kit} cluster={booster.engines} y0={0} />}
      {!booster.solid && booster.engines && (
        <mesh
          geometry={cylinder}
          material={mat.structure}
          position-y={booster.engines.length * 0.7}
          scale={[r, booster.body.y0 - booster.engines.length * 0.7, r]}
        />
      )}
      <mesh geometry={cylinder} material={body} position-y={booster.body.y0} scale={[r, booster.body.y1 - booster.body.y0, r]} />
      {kit.boosterNose && <mesh geometry={kit.boosterNose} material={booster.solid ? mat.solid : mat.fairing} position-y={booster.body.y1} />}
    </group>
  )
}

/** Half of the payload fairing (0: +x side, 1: −x side), hinged at its base edge; `open` in radians. */
export function FairingHalf({ kit, half, open = 0 }: { kit: RocketKit; half: 0 | 1; open?: number }) {
  const f = kit.layout.fairing
  if (!f || !kit.fairingHalves) return null
  const R = f.diameter / 2
  const s = half === 0 ? 1 : -1
  return (
    <group position={[s * R, f.y0, 0]} rotation-z={-s * open}>
      <mesh geometry={kit.fairingHalves[half]} material={kit.mat.fairing} position-x={-s * R} />
    </group>
  )
}

/** Boattail, payload adapter and the generic spacecraft (gold foil body, dish, folded panels). */
export function PayloadParts({ kit, spacecraft = true }: { kit: RocketKit; spacecraft?: boolean }) {
  const { layout, mat } = kit
  const f = layout.fairing
  const sc = layout.spacecraft
  const top = layout.stages.at(-1)
  if (!f || !sc || !top) return null
  const w = sc.width
  const bodyH = sc.height * 0.62
  return (
    <group>
      {kit.boattail && f.boattail && <mesh geometry={kit.boattail} material={mat.structure} position-y={f.boattail.y0} />}
      {kit.adapter && <mesh geometry={kit.adapter} material={mat.structure} position-y={top.tankTop} />}
      {spacecraft && <SpacecraftBody kit={kit} y0={sc.y0} w={w} bodyH={bodyH} />}
    </group>
  )
}

export function SpacecraftBody({ kit, y0, w, bodyH }: { kit: RocketKit; y0: number; w: number; bodyH: number }) {
  const { cylinder, mat } = kit
  return (
    <group position-y={y0}>
      <mesh material={mat.foil} position-y={bodyH / 2}>
        <boxGeometry args={[w * 0.7, bodyH, w * 0.7]} />
      </mesh>
      <mesh geometry={cylinder} material={mat.fairing} position-y={bodyH} scale={[w * 0.46, 0.08, w * 0.46]} />
      {[-1, 1].map((s) => (
        <mesh key={s} material={mat.panel} position={[s * w * 0.4, bodyH * 0.5, 0]}>
          <boxGeometry args={[0.06, bodyH * 0.92, w * 0.62]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------

export interface RocketModelProps {
  design: RocketDesign
  /** Stage indices already dropped (not drawn). */
  separated?: number[]
  fairingOn: boolean
  boostersOn?: boolean
  /** Hangar: parts slide into place when the stack changes. */
  assemble?: boolean
}

/** The whole stack, standing on y = 0. */
export function RocketModel({ design, separated = [], fairingOn, boostersOn = true, assemble = false }: RocketModelProps) {
  const layout = useMemo(() => rocketLayout(design), [design])
  const kit = useRocketKit(layout)
  const b = layout.boosters
  const f = layout.fairing
  const top = layout.stages.at(-1)
  return (
    <group>
      {layout.stages.map((s) =>
        separated.includes(s.index) ? null : <StageParts key={`${s.index}-${s.engines?.engineId ?? 'none'}`} kit={kit} stage={s} assemble={assemble} />,
      )}
      {boostersOn && b && !separated.includes(0) && (
        <Slide y={0} animate={assemble} drop={4} key={`${b.boosterId}-${b.count}`}>
          {b.positions.map(([x, z], k) => (
            <group key={k} position={[x, 0, z]}>
              <BoosterParts kit={kit} booster={b} />
            </group>
          ))}
        </Slide>
      )}
      {f && top && (
        <Slide y={top.tankTop} animate={assemble} drop={3}>
          <group position-y={-top.tankTop}>
            <PayloadParts kit={kit} spacecraft={!fairingOn} />
            {fairingOn && (
              <>
                <FairingHalf kit={kit} half={0} />
                <FairingHalf kit={kit} half={1} />
              </>
            )}
          </group>
        </Slide>
      )}
    </group>
  )
}
