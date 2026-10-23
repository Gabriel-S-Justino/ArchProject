// The 3D hangar on the Rocket tab: the player's stack standing in a dark studio, lit by soft boxes
// (drei Environment built from Lightformers: no HDR file is fetched), on a metric floor grid next
// to a gantry. The model follows every edit live; parts slide into place. Orbit with the mouse;
// the view re-frames itself to the stack's height. Renders only on demand (nothing while idle).
import { ContactShadows, Environment, Grid, Lightformer, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import { Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { formatNumber } from '@/components/status'
import { cn } from '@/lib/utils'
import type { RocketDesign } from '@/physics/launcher'
import { DevStats } from './DevStats'
import './threeSetup'
import { RocketModel } from './RocketModel'
import { rocketLayout, type RocketLayout } from './rocketLayout'
import { latticeTowerGeometry } from './structures'

const BG = '#0b0d10'
const FOV = 30

export default function Hangar({ rocket }: { rocket: RocketDesign }) {
  const layout = useMemo(() => rocketLayout(rocket), [rocket])
  const reduced = useReducedMotion() === true
  const items = useMemo(() => callouts(layout), [layout])
  const labelEls = useRef<(HTMLDivElement | null)[]>([])
  const zoom = useRef<ZoomFn | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [hint, setHint] = useState(false)

  // The mouse wheel scrolls the page (the hangar sits in a scrolling plate); Ctrl/Cmd + wheel zooms.
  // A native, non-passive listener: only the modified wheel is cancelled.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    let timer = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoom.current?.(Math.exp(Math.max(-1, Math.min(1, e.deltaY / 400))))
        setHint(false)
        return
      }
      setHint(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setHint(false), 1600)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.5, far: 3000, position: [40, 30, 120] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        aria-label={describe(layout)}
        role="img"
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 140, 520]} />
        <Studio />
        <Floor height={layout.height} radius={layout.radius} />
        <Gantry height={layout.height} radius={layout.radius} />
        <RocketModel design={rocket} fairingOn assemble={!reduced} />
        <DimensionLine layout={layout} />
        <CalloutProjector items={items} els={labelEls} />
        <FrameRig height={layout.height} radius={layout.radius} zoom={zoom} />
        <DevStats name="hangar" />
      </Canvas>
      <CalloutLabels items={items} els={labelEls} />
      <div className="absolute right-3 bottom-3 flex flex-col" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoom.current?.(1 / 1.25)} aria-label="Zoom in" className={zoomButton}>
          <Plus aria-hidden />
        </button>
        <button type="button" onClick={() => zoom.current?.(1.25)} aria-label="Zoom out" className={cn(zoomButton, '-mt-px')}>
          <Minus aria-hidden />
        </button>
      </div>
      <p
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-3 left-3 border border-rule-strong bg-ground px-2 py-1 text-detail text-ink-2 transition-opacity duration-200',
          hint ? 'opacity-100' : 'opacity-0',
        )}
      >
        Ctrl + scroll to zoom
      </p>
    </div>
  )
}

const zoomButton =
  'grid size-8 place-items-center border border-rule-strong bg-ground text-ink-2 transition-colors hover:border-ink-3 hover:text-ink [&_svg]:size-3.5'

/** Multiplies the camera's distance to the target by `factor` (clamped to the controls' limits). */
type ZoomFn = (factor: number) => void

function describe(l: RocketLayout): string {
  if (l.stages.length === 0) return '3D hangar: no stages yet'
  return `3D hangar: ${l.stages.length}-stage rocket${l.boosters ? ` with ${l.boosters.count} strap-on boosters` : ''}, ${formatNumber(l.height, 1)} m tall`
}

/** Soft studio light: a big overhead softbox, two tall strips, a warm rim and a low fill. */
function Studio() {
  return (
    <>
      <Environment resolution={256} frames={1} environmentIntensity={0.75}>
        <Lightformer form="rect" intensity={2.4} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[9, 9, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[-6, 1.5, 3]} rotation-y={Math.PI / 2.6} scale={[1.6, 10, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[6, 1, 2]} rotation-y={-Math.PI / 2.4} scale={[1.2, 9, 1]} />
        <Lightformer form="rect" color="#ffd2a8" intensity={0.9} position={[3, 2, -7]} scale={[6, 4, 1]} />
        <Lightformer form="ring" intensity={0.35} position={[0, -5, 4]} scale={4} />
      </Environment>
      {/* Key from the front left (shapes the cylinders), cool rim from behind right (silhouette). */}
      <directionalLight position={[-45, 55, 40]} intensity={2.1} color="#fff4e6" />
      <directionalLight position={[50, 30, -60]} intensity={0.9} color="#cfdcff" />
      <ambientLight intensity={0.05} />
    </>
  )
}

function Floor({ height, radius }: { height: number; radius: number }) {
  const span = Math.max(40, height * 1.4)
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <circleGeometry args={[600, 48]} />
        {/* Unlit, the colour of the backdrop: an endless graphite floor; the grid and the contact shadow ground the stack. */}
        <meshBasicMaterial color={BG} />
      </mesh>
      <Grid
        position-y={0.005}
        infiniteGrid
        cellSize={1}
        sectionSize={10}
        cellThickness={0.55}
        sectionThickness={0.9}
        cellColor="#20262c"
        sectionColor="#363e47"
        fadeDistance={span * 2.2}
        fadeStrength={1.6}
        followCamera={false}
      />
      <ContactShadows position-y={0.02} scale={Math.max(24, radius * 6 + 14)} far={Math.max(6, height * 0.25)} blur={2.6} opacity={0.6} resolution={512} color="#000000" />
    </>
  )
}

/** A dark service gantry behind the stack, with a crane boom over it. */
function Gantry({ height, radius }: { height: number; radius: number }) {
  const h = Math.max(30, height + 8)
  const geom = useMemo(() => latticeTowerGeometry(Math.round(h / 6) * 6, 6, 6), [h])
  useEffect(() => () => geom.dispose(), [geom])
  const x = -(radius + 13)
  return (
    <group position={[x, 0, -11]}>
      <mesh geometry={geom}>
        <meshStandardMaterial color="#262b31" roughness={0.65} metalness={0.3} />
      </mesh>
      <mesh position={[(radius + 13) / 2 + 2, Math.round(h / 6) * 6 + 0.6, 0]}>
        <boxGeometry args={[radius + 19, 1.2, 1.2]} />
        <meshStandardMaterial color="#262b31" roughness={0.65} metalness={0.3} />
      </mesh>
    </group>
  )
}

interface Callout {
  key: string
  /** Offset along the camera's horizontal right axis, m (negative = left of the stack). */
  side: number
  y: number
  align: 'right-of' | 'left-of'
  title: string
  value: string
}

function callouts(l: RocketLayout): Callout[] {
  const { stages, fairing, height, radius } = l
  if (!fairing || stages.length === 0) return []
  const lx = -(radius + 1.6)
  return [
    { key: 'h', side: radius + 2.4, y: height, align: 'right-of', title: 'Height', value: `${formatNumber(height, 1)} m` },
    ...stages.map(
      (s): Callout => ({
        key: `s${s.index}`,
        side: lx,
        y: (s.y0 + s.tankTop) / 2,
        align: 'left-of',
        title: `Stage ${s.index + 1}`,
        value: `${formatNumber(s.y1 - s.y0, 1)} m`,
      }),
    ),
    { key: 'f', side: lx, y: (fairing.y0 + fairing.y1) / 2, align: 'left-of', title: 'Fairing', value: `${formatNumber(fairing.diameter, 1)} m wide` },
  ]
}

/** The callout labels: plain DOM over the canvas (DESIGN.md type), placed by CalloutProjector. */
function CalloutLabels({ items, els }: { items: Callout[]; els: RefObject<(HTMLDivElement | null)[]> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((c, i) => (
        <div
          key={c.key}
          ref={(el) => void (els.current[i] = el)}
          className={cn('absolute top-0 left-0 whitespace-nowrap', c.align === 'left-of' && 'text-right')}
          style={{ visibility: 'hidden' }}
        >
          <span className={cn('label-caps block', c.key === 'h' ? 'text-ink-3' : 'text-ink-2')}>{c.title}</span>
          <span className={cn('num', c.key === 'h' ? 'text-small font-medium text-ink' : 'text-detail text-ink-3')}>{c.value}</span>
        </div>
      ))}
    </div>
  )
}

/** Projects each callout's anchor to the screen on every rendered frame and moves its label there. */
function CalloutProjector({ items, els }: { items: Callout[]; els: RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    camera.getWorldDirection(right)
    right.set(-right.z, 0, right.x).normalize() // horizontal camera-right
    items.forEach((c, i) => {
      const el = els.current[i]
      if (!el) return
      v.copy(right).multiplyScalar(c.side).setY(c.y).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      const shift = c.align === 'right-of' ? 'translate(6px, -100%)' : 'translate(calc(-100% - 6px), -50%)'
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${shift}`
      el.style.visibility = v.z < 1 ? 'visible' : 'hidden'
    })
  })
  return null
}

/** Dimension line with ticks at the stage joints, always on the camera's right of the stack. */
function DimensionLine({ layout }: { layout: RocketLayout }) {
  const group = useRef<THREE.Group>(null)
  const d = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (!group.current) return
    camera.getWorldDirection(d)
    // Local +x along the horizontal camera-right (-dz, 0, dx), the same axis the labels use.
    group.current.rotation.y = Math.atan2(-d.x, -d.z)
  })
  const { stages, fairing, height, radius } = layout
  if (!fairing || stages.length === 0) return null
  const x = radius + 2.4
  const tick = 0.9
  const marks = [0, ...stages.map((s) => s.y1), height]
  const points: [number, number, number][] = [[x, 0, 0], [x, height, 0]]
  for (const y of marks) points.push([x - tick, y, 0], [x + tick, y, 0])
  return (
    <group ref={group}>
      <Line points={points} segments color="#6b7178" lineWidth={1} transparent opacity={0.9} />
    </group>
  )
}

/**
 * Orbit controls with limits, and auto-framing: whenever the stack's height (or the view's size)
 * changes, the target moves to mid-height and the distance re-fits, keeping the user's angle.
 */
function FrameRig({ height, radius, zoom }: { height: number; radius: number; zoom: RefObject<ZoomFn | null> }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const reduced = useReducedMotion() === true
  const anim = useRef<{ from: THREE.Vector3; fromDist: number; t: number } | null>(null)
  const placed = useRef(false)

  useEffect(() => {
    zoom.current = (factor) => {
      const c = controls.current
      if (!c) return
      const off = camera.position.clone().sub(c.target)
      const d = THREE.MathUtils.clamp(off.length() * factor, c.minDistance, c.maxDistance)
      camera.position.copy(c.target).addScaledVector(off.normalize(), d)
      c.update()
      invalidate()
    }
    return () => {
      zoom.current = null
    }
  }, [zoom, camera, invalidate])

  const goal = useMemo(() => {
    const H = Math.max(height, 14)
    const vHalf = THREE.MathUtils.degToRad(FOV / 2)
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height))
    const hHalf = Math.atan(Math.tan(vHalf) * aspect)
    const needV = (H * 1.34) / 2 / Math.tan(vHalf) // headroom for the height label
    const halfW = radius + 9 // room for the callouts on both sides
    const needH = halfW / Math.tan(hHalf)
    return { target: new THREE.Vector3(0, H * 0.53, 0), dist: Math.max(needV, needH) + radius }
  }, [height, radius, size.width, size.height])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    c.minDistance = goal.dist * 0.3
    c.maxDistance = goal.dist * 1.8
    if (!placed.current || reduced) {
      placed.current = true
      // First view: three-quarter front, a little below mid-height looking up.
      const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(28))
      if (reduced && anim.current === null && c.target.lengthSq() > 0) dir.copy(camera.position).sub(c.target).normalize()
      c.target.copy(goal.target)
      camera.position.copy(goal.target).addScaledVector(dir, goal.dist)
      c.update()
      invalidate()
      return
    }
    anim.current = { from: c.target.clone(), fromDist: camera.position.distanceTo(c.target), t: 0 }
    invalidate()
  }, [goal, camera, invalidate, reduced])

  useFrame((_, dt) => {
    const c = controls.current
    const a = anim.current
    if (!c || !a) return
    a.t = Math.min(1, a.t + Math.min(dt, 0.05) / 0.7)
    const e = 1 - Math.pow(1 - a.t, 4) // ease-out
    const dir = new THREE.Vector3().copy(camera.position).sub(c.target).normalize()
    c.target.lerpVectors(a.from, goal.target, e)
    camera.position.copy(c.target).addScaledVector(dir, a.fromDist + (goal.dist - a.fromDist) * e)
    c.update()
    if (a.t >= 1) anim.current = null
    invalidate()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableDamping={!reduced}
      dampingFactor={0.09}
      rotateSpeed={0.6}
      minPolarAngle={THREE.MathUtils.degToRad(18)}
      maxPolarAngle={THREE.MathUtils.degToRad(94)}
    />
  )
}
