// The player's spacecraft as a 3D model, built from spacecraftLayout: a foil-wrapped bus, solar
// wings whose area follows the arrays' power, the high-gain dish (3 m class), a low-gain stub, the
// laser terminal, the instruments on the front deck (a damaged one scorched and greyed), finned
// radioisotope generators on the back and the engine nozzle underneath. Metres, origin at the bus
// centre; callers scale it. Generic and logo-free. Geometries and materials are disposed on change.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { SpacecraftDesign } from '@/game/spacecraft'
import { BUS, spacecraftLayout, type InstrumentLayout, type SpacecraftLayout, type WingLayout } from './spacecraftLayout'

export interface SpacecraftModelProps {
  design: SpacecraftDesign
  /** Part ids of instruments damaged by flares. */
  damaged?: readonly string[]
}

/** Solar cells: a dark blue-black grid with lighter gaps (one small canvas texture). */
function cellTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#8a95a3'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      g.fillStyle = (i + j) % 3 === 0 ? '#1b2944' : '#17233b'
      g.fillRect(i * 16 + 1, j * 16 + 1, 14, 14)
    }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

/** Crinkled multi-layer insulation: a soft noise bump map (no image file). */
function crinkleTexture(): THREE.Texture {
  const n = 128
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')!
  const img = g.createImageData(n, n)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // Sum of a few random soft creases.
  const v = new Float32Array(n * n).fill(0.5)
  for (let k = 0; k < 60; k++) {
    const x0 = rnd() * n
    const y0 = rnd() * n
    const a = rnd() * Math.PI
    const len = 10 + rnd() * 40
    const amp = (rnd() - 0.5) * 0.5
    for (let t = -len; t < len; t += 0.5) {
      const x = Math.round(x0 + Math.cos(a) * t + n) % n
      const y = Math.round(y0 + Math.sin(a) * t + n) % n
      for (let d = -2; d <= 2; d++) {
        const yy = (y + d + n) % n
        v[yy * n + x] = v[yy * n + x]! + amp * (1 - Math.abs(d) / 3)
      }
    }
  }
  for (let i = 0; i < n * n; i++) {
    const b = Math.max(0, Math.min(255, v[i]! * 255))
    img.data.set([b, b, b, 255], i * 4)
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  return t
}

function useMaterials() {
  const m = useMemo(() => {
    const cells = cellTexture()
    const crinkle = crinkleTexture()
    const std = (color: string, roughness: number, metalness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
    return {
      cells,
      crinkle,
      foil: std('#c9a04e', 0.36, 0.72, { bumpMap: crinkle, bumpScale: 0.35 }),
      dish: std('#dcd8cf', 0.55, 0.05, { side: THREE.DoubleSide }),
      deck: std('#2a2e33', 0.7, 0.35),
      struct: std('#3a3f45', 0.55, 0.5),
      white: std('#dcd8cf', 0.55, 0.05),
      dark: std('#0b0c0e', 0.4, 0.2),
      cell: std('#ffffff', 0.32, 0.45, { map: cells }),
      panelBack: std('#6b6f73', 0.75, 0.2),
      rtg: std('#5a5d62', 0.5, 0.4),
      // Flare damage: soot-dark, matte, slightly warm.
      scorched: std('#3a332e', 0.95, 0.05),
      nozzle: std('#5b5650', 0.35, 0.85, { side: THREE.DoubleSide }),
      outline: new THREE.LineBasicMaterial({ color: '#7d7a74', transparent: true, opacity: 0.8 }),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(m).forEach((x) => x.dispose())
    },
    [m],
  )
  return m
}
type Mats = ReturnType<typeof useMaterials>

/** A parabolic dish (open lathe), rim diameter d, opening towards +y, vertex at y = 0. */
function dishGeometry(d: number): THREE.BufferGeometry {
  const R = d / 2
  const depth = d * 0.14
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 14; i++) {
    const r = (R * i) / 14
    pts.push(new THREE.Vector2(r, depth * (r / R) ** 2))
  }
  return new THREE.LatheGeometry(pts, 48)
}

/** An engine bell along −y from y = 0: throat to exit. */
function bellGeometry(exitD: number, length: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  const throat = exitD * 0.28
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    pts.push(new THREE.Vector2(throat + (exitD / 2 - throat) * Math.pow(t, 0.65), -length * t))
  }
  return new THREE.LatheGeometry(pts, 32)
}

/** A finned generator: core cylinder plus eight radial fins, along y, one merged geometry. */
function rtgGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.2, 0.2, 0.66, 20)]
  for (let k = 0; k < 8; k++) {
    const fin = new THREE.BoxGeometry(0.22, 0.6, 0.02)
    fin.translate(0.3, 0, 0)
    fin.rotateY((k / 8) * Math.PI * 2)
    parts.push(fin)
  }
  const g = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return g
}

function useGeometries(layout: SpacecraftLayout) {
  const dishD = layout.dish?.diameter ?? 0
  const noz = layout.nozzle
  const g = useMemo(
    () => ({
      dish: dishD > 0 ? dishGeometry(dishD) : null,
      bell: noz ? bellGeometry(noz.exitDiameter, noz.length) : null,
      thruster: bellGeometry(0.1, 0.14),
      rtg: rtgGeometry(),
    }),
    [dishD, noz],
  )
  useEffect(
    () => () => {
      g.dish?.dispose()
      g.bell?.dispose()
      g.thruster.dispose()
      g.rtg.dispose()
    },
    [g],
  )
  return g
}

const NO_DAMAGE: readonly string[] = []

export function SpacecraftModel({ design, damaged = NO_DAMAGE }: SpacecraftModelProps) {
  const layout = useMemo(() => spacecraftLayout(design, damaged), [design, damaged])
  const mats = useMaterials()
  const geo = useGeometries(layout)
  // Bus faces: foil on the sides, graphite top and bottom decks (BoxGeometry face order ±x, ±y, ±z).
  const busMats = useMemo(() => [mats.foil, mats.foil, mats.deck, mats.deck, mats.foil, mats.foil], [mats])
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(BUS.w, BUS.h, BUS.d)), [])
  useEffect(() => () => edges.dispose(), [edges])

  return (
    <group>
      {layout.bus ? (
        <mesh material={busMats}>
          <boxGeometry args={[BUS.w, BUS.h, BUS.d]} />
        </mesh>
      ) : (
        <lineSegments geometry={edges} material={mats.outline} />
      )}

      {layout.wings.map((w) => (
        <Wing key={w.side} wing={w} mats={mats} />
      ))}

      {layout.dish && geo.dish && (
        <group position-y={BUS.h / 2}>
          <mesh material={mats.struct} position-y={0.25}>
            <cylinderGeometry args={[0.07, 0.09, 0.5, 10]} />
          </mesh>
          <group position-y={layout.dish.y - BUS.h / 2}>
            <mesh geometry={geo.dish} material={mats.dish} />
            <mesh material={mats.dark} rotation-x={Math.PI} position-y={-0.01}>
              <circleGeometry args={[0.12, 16]} />
            </mesh>
            {/* Feed on three struts at the focus. */}
            {[0, 1, 2].map((k) => {
              const a = (k / 3) * Math.PI * 2
              const R = layout.dish!.diameter * 0.36
              const f = layout.dish!.diameter * 0.42
              return <Rod key={k} from={[Math.cos(a) * R, 0.06, Math.sin(a) * R]} to={[0, f, 0]} radius={0.015} material={mats.struct} />
            })}
            <mesh material={mats.struct} position-y={layout.dish.diameter * 0.42 + 0.05}>
              <cylinderGeometry args={[0.07, 0.11, 0.22, 12]} />
            </mesh>
          </group>
        </group>
      )}

      {layout.lga && (
        <group position={[BUS.w / 2 - 0.25, BUS.h / 2, -BUS.d / 2 + 0.25]}>
          <mesh material={mats.white} position-y={0.22}>
            <cylinderGeometry args={[0.06, 0.06, 0.44, 10]} />
          </mesh>
          <mesh material={mats.white} position-y={0.48}>
            <coneGeometry args={[0.11, 0.12, 12]} />
          </mesh>
        </group>
      )}

      {layout.laser && (
        <group position={[-BUS.w / 2 + 0.3, BUS.h / 2, BUS.d / 2 - 0.3]}>
          <mesh material={mats.deck} position-y={0.14}>
            <boxGeometry args={[0.36, 0.28, 0.36]} />
          </mesh>
          <group position-y={0.5} rotation-x={-0.35}>
            <mesh material={mats.white}>
              <cylinderGeometry args={[0.15, 0.15, 0.5, 20]} />
            </mesh>
            <mesh material={mats.dark} position-y={0.252} rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.12, 20]} />
            </mesh>
          </group>
        </group>
      )}

      {layout.instruments.map((i) => (
        <Instrument key={i.id} inst={i} mats={mats} />
      ))}

      {Array.from({ length: Math.min(4, layout.rtgs) }, (_, k) => {
        const x = (k - (Math.min(4, layout.rtgs) - 1) / 2) * 0.75
        return (
          <group key={k} position={[x, -BUS.h / 2 + 0.45, -BUS.d / 2]}>
            <mesh material={mats.struct} rotation-x={Math.PI / 2} position-z={-0.2}>
              <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
            </mesh>
            <mesh geometry={geo.rtg} material={mats.rtg} position-z={-0.62} rotation-x={0.5} />
          </group>
        )
      })}

      {layout.nozzle && geo.bell && (
        <group position-y={-BUS.h / 2}>
          {layout.nozzle.kind === 'biprop' && <mesh geometry={geo.bell} material={mats.nozzle} />}
          {/* Hydrazine thrusters at the corners (both systems carry them for attitude control). */}
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} geometry={layout.nozzle!.kind === 'monoprop' ? geo.bell! : geo.thruster} material={mats.nozzle} position={[sx * (BUS.w / 2 - 0.2), 0, sz * (BUS.d / 2 - 0.2)]} />
            )),
          )}
        </group>
      )}
    </group>
  )
}

function Wing({ wing, mats }: { wing: WingLayout; mats: Mats }) {
  const gap = 0.05
  const seg = (wing.span - gap * (wing.panels - 1)) / wing.panels
  const dir = wing.side
  const panels = useMemo(() => {
    // Texture repeat: one cell-grid tile per ~0.5 m.
    return Array.from({ length: wing.panels }, (_, k) => dir * (Math.abs(wing.rootX) + k * (seg + gap) + seg / 2))
  }, [wing.panels, wing.rootX, seg, dir])
  const geom = useMemo(() => {
    const g = new THREE.BoxGeometry(seg, wing.chord, 0.035)
    // Scale the UVs so the cells stay square on every panel size.
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * seg * 2, uv.getY(i) * wing.chord * 2)
    return g
  }, [seg, wing.chord])
  useEffect(() => () => geom.dispose(), [geom])
  // Box faces ±x, ±y edges in structure grey; ±z (both sides) cells / back.
  const faceMats = useMemo(() => [mats.struct, mats.struct, mats.struct, mats.struct, mats.cell, mats.panelBack], [mats])
  return (
    <group>
      <Rod from={[(dir * BUS.w) / 2, 0, 0]} to={[wing.rootX, 0, 0]} radius={0.035} material={mats.struct} />
      {panels.map((x, k) => (
        <mesh key={k} geometry={geom} material={faceMats} position-x={x} />
      ))}
    </group>
  )
}

function Instrument({ inst, mats }: { inst: InstrumentLayout; mats: Mats }) {
  const body = inst.damaged ? mats.scorched : mats.white
  const [x, y, z] = inst.position
  switch (inst.kind) {
    case 'camera': {
      const [d, , len] = inst.size
      return (
        <group position={[x, y, z]}>
          <mesh material={body} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[d / 2, d / 2, len, 24]} />
          </mesh>
          <mesh material={mats.dark} position-z={len / 2 + 0.005}>
            <circleGeometry args={[d / 2 - 0.05, 24]} />
          </mesh>
        </group>
      )
    }
    case 'radar':
      return (
        <group position={[x, y, z]}>
          <mesh material={inst.damaged ? mats.scorched : mats.struct} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.025, 0.025, inst.size[0], 6]} />
          </mesh>
          <mesh material={body} position-y={0.12}>
            <boxGeometry args={[0.45, 0.2, 0.3]} />
          </mesh>
        </group>
      )
    case 'magnetometer':
      // Boom from the bus's top back corner to the sensor.
      return (
        <group>
          <Rod from={[BUS.w / 2 - 0.2, BUS.h / 2, -BUS.d / 2]} to={[x, y, z]} radius={0.02} material={mats.struct} />
          <mesh material={body} position={[x, y, z]}>
            <boxGeometry args={inst.size} />
          </mesh>
        </group>
      )
    default:
      return (
        <group position={[x, y, z]}>
          <mesh material={body}>
            <boxGeometry args={inst.size} />
          </mesh>
          <mesh material={mats.dark} position-z={inst.size[2] / 2 + 0.005}>
            <planeGeometry args={[inst.size[0] * 0.45, inst.size[1] * 0.45]} />
          </mesh>
        </group>
      )
  }
}

/** A thin cylinder between two points. */
function Rod({ from, to, radius, material }: { from: [number, number, number]; to: [number, number, number]; radius: number; material: THREE.Material }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const d = b.clone().sub(a)
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
      length: d.length(),
    }
  }, [...from, ...to])
  return (
    <mesh material={material} position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 6]} />
    </mesh>
  )
}
