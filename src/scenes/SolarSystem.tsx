// The inner solar system at 1 AU = 100 units: the Sun (NASA SDO image, the only body that blooms),
// the Earth and Mars at their JPL Horizons positions on the given date, their orbits sampled off
// the same ephemerides, the NASA star map behind, and the transfer arcs: the chosen one solid in
// Mars rust, a hovered porkchop cell dashed. In cruise the spacecraft flies its real two-body state:
// the flown part of the arc is solid, the prediction to the arrival date dashed rust, and a flare
// reaching it plays a short hit. The planets are drawn hundreds of times larger than real (the view
// says so); orbits and positions are to scale.
//
// Renders on demand: a new date, hover or ship state draws one frame; camera moves and the flare hit
// keep drawing until they settle. Nothing draws off-screen or in a hidden tab.
import { Environment, Lightformer, OrbitControls, Preload, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing'
import { Minus, Plus } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { ToneMappingMode } from 'postprocessing'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { formatNumber } from '@/components/status'
import type { SpacecraftDesign } from '@/game/spacecraft'
import { cn } from '@/lib/utils'
import { AU, DAY, MU_SUN } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import type { Transfer } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import type { StateVector } from '@/physics/vec'
import { DevStats } from './DevStats'
import './threeSetup'
import { LabelLayer, LabelProjector, type SceneLabel } from './labels'
import { OrbitLine } from './OrbitLine'
import { Planet } from './Planet'
import { InvalidateOn, clamp01, easeOut, useOnScreen } from './sceneHooks'
import { DISPLAY_RADIUS, SHIP_SCALE, clampJd, ephemerisOrbit, exaggeration, scaleNote, toScene, transferArc, writeConic, writeScene } from './solarScale'
import { SpacecraftModel } from './SpacecraftModel'
import { spacecraftLayout } from './spacecraftLayout'
import { Starfield } from './Starfield'
import { wheelZoomFactor } from './wheel'
import { DashedPath, RUST, TrailArc, TransferArc } from './TransferArc'

export type Focus = 'sun' | 'earth' | 'mars' | 'ship'

export interface ShipView {
  /** Heliocentric state, SI (CruiseState.ship). */
  state: StateVector
  depJd: number
  arrJd: number
  design: SpacecraftDesign
  damaged: readonly string[]
  /** Set (to a new value) when a flare reaches the ship: the hit plays once per value. */
  flareKey: string | null
}

export interface SolarSystemProps {
  jd: number
  /** The chosen transfer (solid arc); in cruise, the planned transfer. */
  transfer?: Transfer | null
  /** The porkchop cell under the pointer (dashed arc). */
  preview?: Transfer | null
  ship?: ShipView | null
  focus: Focus
  onFocusChange?: (f: Focus) => void
  /** One line at the top left, e.g. which date the planets are shown on. */
  caption?: string
  /** The slot puts its own overlay at the bottom right: the zoom buttons move up, the note stays clear. */
  reserveBottomRight?: boolean
}

const FOV = 32
const SDO_URL = `${import.meta.env.BASE_URL}textures/sun_sdo_aia171_2k.jpg`
/** The solar disk spans this fraction of the SDO image's width. */
const SDO_DISK = 0.78

/** Positions shared between the scene, the camera rig and the labels (written, never reallocated). */
interface Bodies {
  earth: THREE.Vector3
  mars: THREE.Vector3
  ship: THREE.Vector3
  marsArr: THREE.Vector3
  hasShip: boolean
  hasArr: boolean
  /** Model radius of the ship, scene units. */
  shipR: number
}

interface ZoomHandle {
  value: number
  invalidate: () => void
}

export default memo(SolarSystem)

function SolarSystem(props: SolarSystemProps) {
  const { jd, transfer, preview, ship, focus, onFocusChange, caption, reserveBottomRight } = props
  const wrap = useRef<HTMLDivElement>(null)
  const live = useOnScreen(wrap)
  const reduced = useReducedMotion() === true
  const bodies = useMemo<Bodies>(
    () => ({ earth: new THREE.Vector3(), mars: new THREE.Vector3(), ship: new THREE.Vector3(), marsArr: new THREE.Vector3(), hasShip: false, hasArr: false, shipR: 0.3 }),
    [],
  )
  const zoom = useRef<ZoomHandle>({ value: 1, invalidate: () => {} })
  const [hint, setHint] = useState(false)
  const els = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    let timer = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoomBy(zoom.current, wheelZoomFactor(e.deltaY, e.deltaMode, el.clientHeight))
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

  const hasShip = !!ship
  const arrivalRef = preview ?? transfer ?? null
  const items = useMemo<SceneLabel[]>(() => {
    const list: SceneLabel[] = [
      { key: 'sun', title: 'Sun', at: (v) => (v.set(0, DISPLAY_RADIUS.sun, 0), true) },
      { key: 'earth', title: 'Earth', at: (v) => (v.copy(bodies.earth).y += DISPLAY_RADIUS.earth, true) },
      { key: 'mars', title: 'Mars', at: (v) => (v.copy(bodies.mars).y += DISPLAY_RADIUS.mars, true) },
      { key: 'arr', title: 'Mars on arrival', tone: 'muted', at: (v) => bodies.hasArr && (v.copy(bodies.marsArr).y += DISPLAY_RADIUS.mars, true) },
    ]
    // Below its marker: the planets' labels sit above right, so the two rarely collide.
    if (hasShip) list.push({ key: 'ship', title: 'Spacecraft', tone: 'accent', side: 'below', at: (v) => bodies.hasShip && (v.copy(bodies.ship).y -= bodies.shipR, true) })
    return list
  }, [bodies, hasShip])

  const options: Focus[] = hasShip ? ['sun', 'earth', 'mars', 'ship'] : ['sun', 'earth', 'mars']
  const sceneJd = clampJd(jd)
  const label = describe(sceneJd, transfer ?? null, preview ?? null, ship ?? null)

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden">
      <Canvas
        frameloop={live ? 'demand' : 'never'}
        flat
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.005, far: 60000, position: [0, 400, 400] }}
        gl={{ antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance', stencil: false }}
        role="img"
        aria-label={label}
      >
        <color attach="background" args={['#000000']} />
        <InvalidateOn value={live} />
        <Scene jd={sceneJd} transfer={transfer ?? null} preview={preview ?? null} arrival={arrivalRef} ship={ship ?? null} bodies={bodies} reduced={reduced} />
        <CameraRig focus={hasShip || focus !== 'ship' ? focus : 'sun'} bodies={bodies} zoom={zoom} reduced={reduced} aim={arrivalRef} jd={sceneJd} />
        <LabelProjector items={items} els={els} root={wrap} />
        <Preload all />
        {/* SMAA, not the composer's MSAA: multisampled buffers render black on Direct3D 11 GPUs
            (ANGLE), as in LaunchScene. */}
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.75} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <SMAA />
        </EffectComposer>
        <DevStats name="solar" />
      </Canvas>
      <LabelLayer items={items} els={els} />

      {caption && <p data-label-avoid className="num pointer-events-none absolute top-2.5 left-3 max-w-[calc(100%-14rem)] text-detail text-ink-2">{caption}</p>}
      <div data-label-avoid role="group" aria-label="Centre the view on" className="absolute top-2 right-2 flex border border-rule-strong bg-ground/80">
        {options.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={focus === f}
            onClick={() => onFocusChange?.(f)}
            className={cn(
              'h-7 px-2.5 text-detail transition-colors not-first:border-l not-first:border-rule',
              focus === f ? 'bg-ground-hover text-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            {FOCUS_NAME[f]}
          </button>
        ))}
      </div>
      <div data-label-avoid className={cn('absolute right-2 flex flex-col', reserveBottomRight ? 'top-11' : 'bottom-2')} role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(zoom.current, 1 / 1.35)} aria-label="Zoom in" className={zoomButton}>
          <Plus aria-hidden />
        </button>
        <button type="button" onClick={() => zoomBy(zoom.current, 1.35)} aria-label="Zoom out" className={cn(zoomButton, '-mt-px')}>
          <Minus aria-hidden />
        </button>
      </div>
      <p data-label-avoid className={cn('pointer-events-none absolute bottom-2 left-2 bg-ground/75 px-1.5 py-0.5 text-detail text-ink-3', reserveBottomRight ? 'max-w-[calc(100%-clamp(9rem,30%,12rem)-1.5rem)]' : 'max-w-[calc(100%-4.5rem)]')}>
        {hint ? (
          <span className="text-ink-2">Ctrl + scroll to zoom</span>
        ) : (
          <>
            {scaleNote(hasShip)}
          </>
        )}
      </p>
    </div>
  )
}

const FOCUS_NAME: Record<Focus, string> = { sun: 'Sun', earth: 'Earth', mars: 'Mars', ship: 'Ship' }

const zoomButton =
  'grid size-7 place-items-center border border-rule-strong bg-ground/80 text-ink-2 transition-colors hover:border-ink-3 hover:text-ink [&_svg]:size-3.5'

function zoomBy(z: ZoomHandle, factor: number) {
  z.value = Math.min(4, Math.max(0.2, z.value * factor))
  z.invalidate()
}

function describe(jd: number, transfer: Transfer | null, preview: Transfer | null, ship: ShipView | null): string {
  const e = bodyState('earth', jd).r
  const m = bodyState('mars', jd).r
  const dist = (r: number[]) => formatNumber(Math.hypot(r[0]!, r[1]!, r[2]!) / AU, 2)
  const parts = [`Inner solar system on ${formatJd(jd)}: Earth ${dist(e)} AU and Mars ${dist(m)} AU from the Sun`]
  const t = preview ?? transfer
  if (ship) parts.push(`the spacecraft ${dist(ship.state.r)} AU from the Sun, day ${formatNumber(Math.floor(jd - ship.depJd))} of ${formatNumber(Math.round(ship.arrJd - ship.depJd))}`)
  else if (t) parts.push(`${preview ? 'previewed' : 'chosen'} transfer of ${formatNumber(t.tofDays)} days arriving ${formatJd(t.arrJd)}`)
  return parts.join('; ') + '.'
}

// ---------------------------------------------------------------------------------------------

interface SceneProps {
  jd: number
  transfer: Transfer | null
  preview: Transfer | null
  arrival: Transfer | null
  ship: ShipView | null
  bodies: Bodies
  reduced: boolean
}

function Scene({ jd, transfer, preview, arrival, ship, bodies, reduced }: SceneProps) {
  const invalidate = useThree((s) => s.invalidate)
  const earthG = useRef<THREE.Group>(null)
  const marsG = useRef<THREE.Group>(null)
  const ghost = useRef<THREE.Sprite>(null)
  const earthSun = useMemo(() => new THREE.Vector3(1, 0, 0), [])
  const orbits = useMemo(() => ({ earth: ephemerisOrbit('earth'), mars: ephemerisOrbit('mars') }), [])
  const scratch = useMemo(() => [0, 0, 0], [])
  const tmpShip = useMemo(() => new THREE.Vector3(), [])

  useLayoutEffect(() => {
    if (writeScene(bodyState('earth', jd).r, scratch)) bodies.earth.fromArray(scratch)
    if (writeScene(bodyState('mars', jd).r, scratch)) bodies.mars.fromArray(scratch)
    earthG.current?.position.copy(bodies.earth)
    marsG.current?.position.copy(bodies.mars)
    // Near the spacecraft an enlarged planet would swallow it (at launch it sits at the Earth's
    // centre): within a few drawn radii the planet shrinks towards its true size.
    const shipAt = ship && writeScene(ship.state.r, scratch) ? tmpShip.fromArray(scratch) : null
    for (const [g, p, body] of [[earthG.current, bodies.earth, 'earth'], [marsG.current, bodies.mars, 'mars']] as const) {
      if (!g) continue
      const R = DISPLAY_RADIUS[body]
      const k = shipAt ? Math.min(1, Math.max(1 / exaggeration(body), shipAt.distanceTo(p) / (R * 6))) : 1
      g.scale.setScalar(k)
    }
    earthSun.copy(bodies.earth).negate().normalize()
    bodies.hasArr = !!arrival && writeScene(arrival.r2, scratch)
    if (bodies.hasArr) bodies.marsArr.fromArray(scratch)
    // Hide the "on arrival" ring when Mars is already there (the end of the cruise).
    if (bodies.hasArr && bodies.marsArr.distanceTo(bodies.mars) < DISPLAY_RADIUS.mars * 2) bodies.hasArr = false
    if (ghost.current) {
      ghost.current.visible = bodies.hasArr
      ghost.current.position.copy(bodies.marsArr)
    }
    invalidate()
  }, [jd, arrival, ship, bodies, scratch, tmpShip, earthSun, invalidate])

  const frac = ship ? clamp01((jd - ship.depJd) / Math.max(1e-6, ship.arrJd - ship.depJd)) : 1
  const shipScene = useMemo(() => (ship ? toScene(ship.state.r) : null), [ship])
  return (
    <>
      <Starfield />
      <Sun />
      <pointLight position={[0, 0, 0]} intensity={2.4} decay={0} color="#fff5e8" />
      <ambientLight intensity={0.02} />
      <OrbitLine points={orbits.earth} />
      <OrbitLine points={orbits.mars} />
      <Planet ref={earthG} body="earth" radius={DISPLAY_RADIUS.earth} orientJd={ship ? ship.depJd : jd} sunDir={earthSun} />
      <Planet ref={marsG} body="mars" radius={DISPLAY_RADIUS.mars} orientJd={ship ? ship.depJd : jd} />
      <PlanetDot at={bodies.earth} radius={DISPLAY_RADIUS.earth} color="#aebbd0" />
      <PlanetDot at={bodies.mars} radius={DISPLAY_RADIUS.mars} color="#c9a58a" />
      <RingMarker ref={ghost} />
      {ship ? (
        <>
          <TransferArc transfer={transfer} variant="planned" />
          {transfer && <TrailArc points={transferArc(transfer)} frac={frac} end={shipScene} />}
          <Ship ship={ship} jd={jd} bodies={bodies} reduced={reduced} />
        </>
      ) : (
        <>
          <TransferArc transfer={transfer} variant="selected" />
          <TransferArc transfer={preview && preview !== transfer ? preview : null} variant="preview" />
        </>
      )}
    </>
  )
}

/** The Sun: the SDO/AIA 171 Å full-disk image on a camera-facing sprite, bright enough to bloom. */
function Sun() {
  const map = useTexture(SDO_URL)
  const material = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    return new THREE.SpriteMaterial({ map, color: new THREE.Color(1.9, 1.75, 1.55), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  }, [map])
  useEffect(() => () => material.dispose(), [material])
  const s = (2 * DISPLAY_RADIUS.sun) / SDO_DISK
  return <sprite material={material} scale={[s, s, 1]} renderOrder={1} />
}

/** Small canvas textures for screen-space markers (a ring, a diamond, a soft disc). */
function markerTexture(kind: MarkerKind): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  if (kind === 'ring') {
    g.strokeStyle = '#ffffff'
    g.lineWidth = 3
    g.setLineDash([6, 5])
    g.beginPath()
    g.arc(32, 32, 26, 0, Math.PI * 2)
    g.stroke()
  } else if (kind === 'diamond') {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(32, 6)
    g.lineTo(58, 32)
    g.lineTo(32, 58)
    g.lineTo(6, 32)
    g.closePath()
    g.fill()
    // A dark keyline keeps the marker legible on its own (rust) path.
    g.strokeStyle = '#0b0d10'
    g.lineWidth = 5
    g.stroke()
  } else if (kind === 'disc') {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(32, 32, 28, 0, Math.PI * 2)
    g.fill()
  } else {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

type MarkerKind = 'ring' | 'diamond' | 'glow' | 'disc'

function useSpriteMaterial(kind: MarkerKind, color: THREE.ColorRepresentation, opts: THREE.SpriteMaterialParameters = {}) {
  const m = useMemo(
    () => new THREE.SpriteMaterial({ map: markerTexture(kind), color, sizeAttenuation: false, depthWrite: false, depthTest: false, transparent: true, ...opts }),
    // The material is built once per marker kind; colour and options are fixed per call site.
    [kind],
  )
  useEffect(
    () => () => {
      m.map?.dispose()
      m.dispose()
    },
    [m],
  )
  return m
}

/**
 * A planet seen from afar is a pixel or two: a small disc marks it, fading out as the textured
 * sphere grows large enough to see.
 */
function PlanetDot({ at, radius, color }: { at: THREE.Vector3; radius: number; color: string }) {
  const ref = useRef<THREE.Sprite>(null)
  const m = useSpriteMaterial('disc', color)
  useFrame(({ camera }) => {
    const s = ref.current
    if (!s) return
    s.position.copy(at)
    const k = clamp01((camera.position.distanceTo(at) - radius * 40) / (radius * 60))
    m.opacity = k
    s.visible = k > 0.01
  })
  return <sprite ref={ref} material={m} scale={[0.0085, 0.0085, 1]} renderOrder={2} />
}

/** "Mars on arrival": a dashed hairline ring at Mars' position on the arrival date. */
function RingMarker({ ref }: { ref: RefObject<THREE.Sprite | null> }) {
  const m = useSpriteMaterial('ring', '#a19c94')
  return <sprite ref={ref} material={m} scale={[0.034, 0.034, 1]} visible={false} renderOrder={2} />
}

// ---------------------------------------------------------------------------------------------
// The spacecraft in cruise.

const PREDICT_POINTS = 97

function Ship({ ship, jd, bodies, reduced }: { ship: ShipView; jd: number; bodies: Bodies; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const outer = useRef<THREE.Group>(null)
  const model = useRef<THREE.Group>(null)
  const marker = useRef<THREE.Sprite>(null)
  const markerMat = useSpriteMaterial('diamond', RUST)
  const layout = useMemo(() => spacecraftLayout(ship.design, ship.damaged), [ship.design, ship.damaged])
  const scratch = useMemo(() => [0, 0, 0], [])
  const tmp = useMemo(() => ({ x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4(), earth: new THREE.Vector3() }), [])

  useLayoutEffect(() => {
    bodies.hasShip = writeScene(ship.state.r, scratch)
    if (bodies.hasShip) bodies.ship.fromArray(scratch)
    bodies.shipR = layout.radius * SHIP_SCALE
    outer.current?.position.copy(bodies.ship)
    // High-gain dish (+y) at the Earth, the arrays' cell side (+z) turned as far towards the Sun
    // as that allows. The Earth is computed here for this date: the scene writes bodies.earth in
    // its own layout effect, which runs after this child's (stale on the first mount and each tick).
    if (model.current && writeScene(bodyState('earth', jd).r, scratch)) {
      tmp.earth.fromArray(scratch)
      tmp.y.copy(tmp.earth).sub(bodies.ship).normalize()
      tmp.z.copy(bodies.ship).negate().normalize()
      tmp.z.addScaledVector(tmp.y, -tmp.z.dot(tmp.y))
      if (tmp.z.lengthSq() < 1e-8) tmp.z.set(0, 1, 0).addScaledVector(tmp.y, -tmp.y.y)
      tmp.z.normalize()
      tmp.x.crossVectors(tmp.y, tmp.z)
      tmp.m.makeBasis(tmp.x, tmp.y, tmp.z)
      model.current.quaternion.setFromRotationMatrix(tmp.m)
    }
    invalidate()
    return () => {
      bodies.hasShip = false
    }
  }, [ship.state, layout, bodies, scratch, tmp, invalidate, jd])

  // The marker shows the ship from afar and fades out as the model becomes visible.
  useFrame(({ camera }) => {
    const m = marker.current
    if (!m) return
    const d = camera.position.distanceTo(bodies.ship)
    const k = clamp01((d - bodies.shipR * 12) / (bodies.shipR * 30))
    markerMat.opacity = k
    m.visible = k > 0.01
  })

  return (
    <>
      <DashedPath
        capacity={PREDICT_POINTS}
        version={ship.state}
        write={(buf) => writeConic(buf, ship.state, MU_SUN, Math.max(0, ship.arrJd - jd) * DAY, PREDICT_POINTS)}
        color={RUST}
        opacity={0.85}
      />
      <group ref={outer}>
        <group ref={model} scale={SHIP_SCALE}>
          <SpacecraftModel design={ship.design} damaged={ship.damaged} />
        </group>
        <sprite ref={marker} material={markerMat} scale={[0.024, 0.024, 1]} renderOrder={3} />
        {!reduced && <FlareHit flareKey={ship.flareKey} bodies={bodies} />}
      </group>
      <Environment resolution={64} frames={1} environmentIntensity={0.5}>
        <Lightformer form="rect" intensity={1.6} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" color="#ffd8b0" intensity={0.8} position={[5, 0, -4]} scale={[5, 3, 1]} />
      </Environment>
    </>
  )
}

const HIT_N = 140
/** The hit waits for the camera to arrive at the ship (CameraRig flies 1.6 s), then lasts 2.4 s. */
const HIT_DELAY = 1.3
const HIT_S = 2.4
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * A flare reaching the spacecraft: a short stream of energetic particles from the Sun's direction
 * converging on it, a pale flash and a brief light on the model. Plays once per flareKey.
 */
function FlareHit({ flareKey, bodies }: { flareKey: string | null; bodies: Bodies }) {
  const invalidate = useThree((s) => s.invalidate)
  const start = useRef<number | null>(null)
  const pts = useRef<THREE.Points>(null)
  const flash = useRef<THREE.Sprite>(null)
  const light = useRef<THREE.PointLight>(null)
  const flashMat = useSpriteMaterial('glow', new THREE.Color(1.7, 1.55, 1.3), { blending: THREE.AdditiveBlending })
  const { geom, mat, pos } = useMemo(() => {
    const pos = new Float32Array(HIT_N * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    const m = new THREE.PointsMaterial({ map: markerTexture('glow'), color: new THREE.Color(2.2, 1.9, 1.5), size: 0.022, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    return { geom: g, mat: m, pos }
  }, [])
  useEffect(
    () => () => {
      geom.dispose()
      mat.map?.dispose()
      mat.dispose()
    },
    [geom, mat],
  )
  const prevKey = useRef(flareKey)
  useEffect(() => {
    if (flareKey && flareKey !== prevKey.current) {
      start.current = performance.now()
      invalidate()
    }
    prevKey.current = flareKey
  }, [flareKey, invalidate])

  const basis = useMemo(() => ({ s: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), [])
  useFrame(() => {
    const p = pts.current
    const f = flash.current
    const l = light.current
    if (!p || !f || !l) return
    const t0 = start.current
    const t = t0 === null ? Infinity : (performance.now() - t0) / 1000 - HIT_DELAY
    if (t < 0) {
      invalidate()
      return
    }
    if (t >= HIT_S) {
      p.visible = false
      f.visible = false
      l.intensity = 0
      start.current = null
      return
    }
    const R = bodies.shipR
    // Sunward unit vector and two perpendiculars.
    basis.s.copy(bodies.ship).negate().normalize()
    basis.u.crossVectors(basis.s, basis.up).normalize()
    basis.v.crossVectors(basis.s, basis.u)
    for (let i = 0; i < HIT_N; i++) {
      const arrive = 0.25 + 1.1 * rnd(i, 1)
      const travel = 0.55
      const k = clamp01((arrive - t) / travel) // 1 = far out, 0 = at the ship
      const inFlight = k < 1 && t <= arrive
      const L = (1.6 + 2.6 * rnd(i, 2)) * R * k
      const spread = R * (0.25 + 1.1 * k)
      const a = rnd(i, 3) * Math.PI * 2
      const r = Math.sqrt(rnd(i, 4)) * spread
      const o = i * 3
      if (!inFlight) {
        pos[o] = pos[o + 1] = pos[o + 2] = 0
        continue
      }
      pos[o] = basis.s.x * L + (basis.u.x * Math.cos(a) + basis.v.x * Math.sin(a)) * r
      pos[o + 1] = basis.s.y * L + (basis.u.y * Math.cos(a) + basis.v.y * Math.sin(a)) * r
      pos[o + 2] = basis.s.z * L + (basis.u.z * Math.cos(a) + basis.v.z * Math.sin(a)) * r
    }
    ;(geom.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    mat.size = R * 0.1
    p.visible = true
    // Flash: rises with the first arrivals, fades over a second.
    const env = clamp01((t - 0.2) / 0.35) * (1 - clamp01((t - 0.7) / 1.5))
    f.visible = env > 0.01
    f.scale.setScalar(0.02 + 0.05 * env)
    flashMat.opacity = 0.8 * env
    l.intensity = 1.4 * env
    l.distance = R * 8
    invalidate()
  })
  return (
    <>
      <points ref={pts} geometry={geom} material={mat} visible={false} frustumCulled={false} />
      <sprite ref={flash} material={flashMat} visible={false} renderOrder={4} />
      <pointLight ref={light} intensity={0} color="#fff1dc" decay={0} />
    </>
  )
}

/** View direction onto the ship: from the Sun's side, turned 50° off it and 25° above the ecliptic. */
function shipView(ship: THREE.Vector3): THREE.Vector3 {
  const sun = ship.clone().negate().setY(0).normalize()
  const side = new THREE.Vector3(-sun.z, 0, sun.x)
  return sun.multiplyScalar(Math.cos(0.87)).addScaledVector(side, Math.sin(0.87)).multiplyScalar(Math.cos(0.44)).setY(Math.sin(0.44)).normalize()
}

// ---------------------------------------------------------------------------------------------
// Camera: orbit the focus with the mouse; switching focus flies there (ease-out, distance changing
// logarithmically); a moving focus (planet over time, the ship) is followed.

function CameraRig({ focus, bodies, zoom, reduced, aim, jd }: { focus: Focus; bodies: Bodies; zoom: RefObject<ZoomHandle>; reduced: boolean; aim: Transfer | null; jd: number }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const st = useMemo(() => ({ t: new THREE.Vector3(), d: 1, placed: false, goal: new THREE.Vector3(), dir: new THREE.Vector3() }), [])
  const anim = useRef<{ from: THREE.Vector3; fromD: number; k: number; fromDir: THREE.Vector3; toDir: THREE.Vector3 | null } | null>(null)
  const aimRef = useRef(aim)
  aimRef.current = aim

  useEffect(() => {
    zoom.current.invalidate = invalidate
  }, [zoom, invalidate])

  // Fit for the overview: Mars' orbit (aphelion ≈ 167 units) fills the view.
  const sunDist = useMemo(() => {
    const half = THREE.MathUtils.degToRad(FOV / 2)
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height))
    const fit = Math.min(Math.sin(half), Math.sin(Math.atan(Math.tan(half) * aspect)))
    return (168 / fit) * 1.15
  }, [size.width, size.height])

  const focusRef = useRef(focus)
  useEffect(() => {
    if (focusRef.current === focus) return
    focusRef.current = focus
    // Centring on the ship also swings round to its sunlit side, a little above its orbit plane.
    const toDir = focus === 'ship' && bodies.hasShip ? shipView(bodies.ship) : null
    const fromDir = camera.position.clone().sub(st.t).normalize()
    if (st.placed && !reduced) anim.current = { from: st.t.clone(), fromD: st.d, k: 0, fromDir, toDir }
    else if (st.placed && toDir) camera.position.copy(st.t).addScaledVector(toDir, st.d)
    invalidate()
  }, [focus, st, reduced, invalidate, bodies, camera])
  useEffect(() => invalidate(), [sunDist, jd, invalidate])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const f = focusRef.current
    if (f === 'earth') st.goal.copy(bodies.earth)
    else if (f === 'mars') st.goal.copy(bodies.mars)
    else if (f === 'ship' && bodies.hasShip) st.goal.copy(bodies.ship)
    else st.goal.set(0, 0, 0)
    const base = f === 'sun' ? sunDist : f === 'earth' ? DISPLAY_RADIUS.earth * 7 : f === 'mars' ? DISPLAY_RADIUS.mars * 7.5 : bodies.shipR * 4.2
    const goalD = base * zoom.current.value

    if (!st.placed) {
      st.placed = true
      // First view: from above the side of the arc's midpoint (or the Earth), 52° over the ecliptic.
      const a = aimRef.current
      if (a) {
        const pts = transferArc(a)
        const m = Math.floor(pts.length / 6) * 3
        st.dir.set(pts[m] ?? 1, 0, pts[m + 2] ?? 0)
      } else st.dir.set(bodies.earth.x || 1, 0, bodies.earth.z)
      st.dir.normalize()
      const el = THREE.MathUtils.degToRad(52)
      st.dir.multiplyScalar(Math.cos(el)).setY(Math.sin(el))
      st.t.copy(st.goal)
      st.d = goalD
      camera.position.copy(st.t).addScaledVector(st.dir, st.d)
    } else {
      const an = anim.current
      if (an) {
        an.k = Math.min(1, an.k + Math.min(dt, 0.05) / 1.6)
        const e = easeOut(an.k)
        st.t.lerpVectors(an.from, st.goal, e)
        st.d = an.fromD * Math.pow(goalD / an.fromD, e)
        if (an.toDir) camera.position.copy(c.target).add(st.dir.lerpVectors(an.fromDir, an.toDir, e).normalize())
        if (an.k >= 1) anim.current = null
        invalidate()
      } else {
        st.t.copy(st.goal)
        if (Math.abs(st.d - goalD) > goalD * 1e-3) {
          st.d = reduced ? goalD : st.d * Math.pow(goalD / st.d, Math.min(1, dt * 7))
          invalidate()
        } else st.d = goalD
      }
      st.dir.copy(camera.position).sub(c.target)
      if (st.dir.lengthSq() < 1e-12) st.dir.set(0, 1, 1)
      st.dir.normalize()
      camera.position.copy(st.t).addScaledVector(st.dir, st.d)
    }
    c.target.copy(st.t)
    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableDamping={false}
      rotateSpeed={0.5}
      minPolarAngle={THREE.MathUtils.degToRad(4)}
      maxPolarAngle={THREE.MathUtils.degToRad(176)}
    />
  )
}
