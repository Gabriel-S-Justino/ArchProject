// Mars orbit insertion, to scale around Mars (1 unit = 1,000 km; only the spacecraft is enlarged):
// the approach hyperbola from the real arrival v∞ (e = 1 + r_p·v∞²/μ), the capture burn at
// periapsis (a short plume), then the 300 × 33,000 km ellipse traced out as the spacecraft flies its
// first orbit with Kepler timing (fast past periapsis, slow at apoapsis). A flyby keeps the
// hyperbola and leaves along it. Before the burn the view holds on the approach; in operations
// ('orbit') the spacecraft just orbits. Mars turns once per 24.6 h at the same compressed time.
//
// One clock: animation seconds since the outcome arrived; every pose is a pure function of it.
// Under reduced motion the final pose shows at once. Draws only while something moves and the
// view is on screen.
import { useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { useReducedMotion } from 'motion/react'
import { ToneMappingMode } from 'postprocessing'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { formatNumber } from '@/components/status'
import { MISSION } from '@/data/mission'
import type { SpacecraftDesign } from '@/game/spacecraft'
import { MU_MARS, R_MARS } from '@/physics/constants'
import { directionAt, ellipse, ellipseNu, ellipseTraced, ellipsePoints, hyperbola, hyperbolaNu, hyperbolaPoints, hyperbolaTime, nuAtRadius, pointAt } from './approachGeometry'
import { DevStats } from './DevStats'
import './threeSetup'
import { PLANET_TEXTURE } from './Planet'
import { InvalidateOn, clamp01, easeOut, useOnScreen } from './sceneHooks'
import { SpacecraftModel } from './SpacecraftModel'
import { BUS, spacecraftLayout } from './spacecraftLayout'
import { Starfield } from './Starfield'
import { RUST } from './TransferArc'

export interface MarsArrivalProps {
  vInfKms: number
  /** Predicted closest approach to Mars' centre, km. */
  missKm: number
  /** null before the capture burn, then whether it captured. */
  captured: boolean | null
  reason?: 'miss' | 'propellant'
  design: SpacecraftDesign
  damaged: readonly string[]
  /** 'arrival' plays the insertion when the outcome arrives; 'orbit' shows the spacecraft in its orbit. */
  mode?: 'arrival' | 'orbit'
}

/** Scene units per metre: 1 unit = 1,000 km. */
const K = 1e-6
const SHIP_SCALE = 0.05
const RP = R_MARS + MISSION.capturePeriapsisAltM
const RA = R_MARS + MISSION.captureApoapsisAltM
const MARS_DAY_S = 88_642.66
/** Where the spacecraft waits for the burn decision, m from Mars' centre. */
const HOLD_R = 18_000e3
/** Where the drawn approach starts, m from Mars' centre. */
const R_START = 42_000e3

// Animation timing, s.
const T_APPROACH = 5.5
const T_BURN = 1.9
const T_PULL = 3.4
const T_FLYOUT = 5
/** Compressed time: one 23.9 h capture orbit in about 22 s. */
const ORBIT_RATE = 3900
/** Real seconds per animation second while the burn creeps the spacecraft past periapsis. */
const BURN_RATE = 70

export default memo(MarsArrival)

function MarsArrival(props: MarsArrivalProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const live = useOnScreen(wrap)
  const stage = useRef<HTMLParagraphElement>(null)
  const geo = useMemo(() => geometry(props.vInfKms, props.missKm, props.captured, props.reason), [props.vInfKms, props.missKm, props.captured, props.reason])
  const flyby = props.captured === false
  const label =
    props.mode === 'orbit'
      ? `Mars and your spacecraft in its ${formatNumber(MISSION.capturePeriapsisAltM / 1000)} by ${formatNumber(MISSION.captureApoapsisAltM / 1000)} km orbit, to scale.`
      : `Mars approach at v∞ ${formatNumber(props.vInfKms, 2)} km/s on a hyperbola with eccentricity ${formatNumber(geo.h.e, 2)}. ${
          props.captured === null ? 'Before the capture burn.' : props.captured ? 'The capture burn at periapsis puts the spacecraft into the 300 by 33,000 km orbit.' : 'Flyby: the spacecraft passes Mars and leaves along the hyperbola.'
        }`
  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden">
      <Canvas
        frameloop={live ? 'demand' : 'never'}
        flat
        dpr={[1, 2]}
        camera={{ fov: 34, near: 0.02, far: 60000, position: [10, 14, 40] }}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        role="img"
        aria-label={label}
      >
        <color attach="background" args={['#000000']} />
        <InvalidateOn value={live} />
        <Scene {...props} geo={geo} stageEl={stage} />
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.7} radius={0.6} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
        <DevStats name="arrival" />
      </Canvas>
      <p ref={stage} aria-hidden className="label-caps pointer-events-none absolute top-2.5 left-3 text-ink-2" />
      <p className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] bg-ground/75 px-1.5 py-0.5 text-detail text-ink-3">
        {props.mode === 'orbit' ? (
          <>To scale: Mars and the orbit. The spacecraft is enlarged; time is compressed.</>
        ) : (
          <>
            To scale: Mars, the {flyby ? 'flyby' : 'approach'} hyperbola (e = {formatNumber(geo.h.e, 2)}){props.captured === false ? '' : ' and the capture orbit'}
            {geo.clampedKm ? `; closest approach ${formatNumber(geo.clampedKm)} km from Mars' centre, drawn at ${formatNumber(geo.h.rp / 1000)} km` : ''}. The
            spacecraft is enlarged; time is compressed.
          </>
        )}
      </p>
    </div>
  )
}

interface Geometry {
  h: ReturnType<typeof hyperbola>
  el: ReturnType<typeof ellipse>
  nuStart: number
  /** Real seconds from the start of the drawn approach to periapsis (negative). */
  t0: number
  /** True miss distance when it had to be drawn closer, km; 0 otherwise. */
  clampedKm: number
}

function geometry(vInfKms: number, missKm: number, captured: boolean | null, reason?: string): Geometry {
  // A miss passes wide: draw its real closest approach, up to 90% of the capture apoapsis.
  const miss = captured === false && reason === 'miss'
  const missM = Number.isFinite(missKm) ? missKm * 1000 : Infinity
  const rp = miss ? Math.max(RP, Math.min(missM, RA * 0.9)) : RP
  const h = hyperbola(rp, vInfKms * 1000, MU_MARS)
  const nuStart = -nuAtRadius(h, Math.max(R_START, rp * 3))
  return { h, el: ellipse(RP, RA, MU_MARS), nuStart, t0: hyperbolaTime(h, nuStart), clampedKm: miss && missM > rp ? missKm : 0 }
}

/** Orbit-plane (x, y) in metres → scene (x, 0, −y) in units. */
const toScene = (x: number, y: number, out: THREE.Vector3) => out.set(x * K, 0, -y * K)

type Phase = 'hold' | 'approach' | 'burn' | 'orbit' | 'flyout' | 'gone'

interface Pose {
  phase: Phase
  /** Orbit-plane position (m) and unit velocity. */
  x: number
  y: number
  vx: number
  vy: number
  /** Real seconds since periapsis, for Mars' spin. */
  tReal: number
  throttle: number
  /** Fraction of the ellipse's (anomaly-spaced) samples flown in the first orbit, 0..1; whether the ellipse is the trajectory now. */
  traced: number
  onEllipse: boolean
  /** Fraction of the hyperbola points flown. */
  hypFlown: number
}

function hypPose(g: Geometry, tReal: number, p: Pose) {
  const nu = hyperbolaNu(g.h, tReal)
  ;[p.x, p.y] = pointAt(g.h, nu)
  ;[p.vx, p.vy] = directionAt(g.h, nu)
  p.hypFlown = clamp01((nu - g.nuStart) / (-2 * g.nuStart))
}

function ellPose(g: Geometry, tReal: number, p: Pose) {
  const nu = ellipseNu(g.el, tReal)
  ;[p.x, p.y] = pointAt(g.el, nu)
  ;[p.vx, p.vy] = directionAt(g.el, nu)
}

/** Real seconds after periapsis on the ellipse, `s` animation seconds after the burn ends (rate ramps up). */
function orbitTime(s: number): number {
  const ramp = 2.5
  const base = T_BURN * BURN_RATE
  if (s <= 0) return base
  return base + BURN_RATE * s + (ORBIT_RATE - BURN_RATE) * (s < ramp ? (s * s) / (2 * ramp) : s - ramp / 2)
}

function poseAt(g: Geometry, captured: boolean | null, mode: 'arrival' | 'orbit', a: number, p: Pose): Pose {
  p.throttle = 0
  if (mode === 'orbit') {
    p.phase = 'orbit'
    p.tReal = 0.62 * g.el.period + a * ORBIT_RATE
    ellPose(g, p.tReal, p)
    p.traced = 1
    p.onEllipse = true
    p.hypFlown = 0
    return p
  }
  if (captured === null) {
    // Holding on the approach, about 18,000 km out.
    p.phase = 'hold'
    p.tReal = hyperbolaTime(g.h, -nuAtRadius(g.h, HOLD_R))
    hypPose(g, p.tReal, p)
    p.traced = 0
    p.onEllipse = false
    return p
  }
  p.onEllipse = false
  p.traced = 0
  if (a < T_APPROACH) {
    const u = a / T_APPROACH
    p.phase = 'approach'
    // Linear in time but slowing into periapsis, so the burn starts from a crawl.
    p.tReal = g.t0 * (1 - u - 0.85 * u * (1 - u))
    hypPose(g, Math.min(0, p.tReal), p)
    return p
  }
  if (!captured) {
    const s = a - T_APPROACH
    p.phase = s < T_FLYOUT ? 'flyout' : 'gone'
    const u = Math.min(1, s / T_FLYOUT)
    p.tReal = -g.t0 * (u + 0.85 * u * (1 - u)) * 0.98
    hypPose(g, p.tReal, p)
    return p
  }
  const sb = a - T_APPROACH
  if (sb < T_BURN) {
    p.phase = 'burn'
    p.tReal = sb * BURN_RATE
    // Shared periapsis: the spacecraft creeps along the ellipse while it brakes.
    ellPose(g, p.tReal, p)
    p.throttle = clamp01(sb / 0.25) * (1 - clamp01((sb - (T_BURN - 0.3)) / 0.3))
    p.traced = ellipseTraced(g.el, p.tReal)
    p.onEllipse = true
    p.hypFlown = 0.5
    return p
  }
  p.phase = 'orbit'
  p.tReal = orbitTime(sb - T_BURN)
  ellPose(g, p.tReal, p)
  p.traced = ellipseTraced(g.el, p.tReal)
  p.onEllipse = true
  p.hypFlown = 0.5
  return p
}

const STAGE_TEXT: Record<Phase, string> = {
  hold: 'Approach · before the burn',
  approach: 'Approach',
  burn: 'Capture burn at periapsis',
  orbit: `In orbit · ${formatNumber(MISSION.capturePeriapsisAltM / 1000)} × ${formatNumber(MISSION.captureApoapsisAltM / 1000)} km`,
  flyout: 'Flyby',
  gone: 'Flyby · leaving Mars',
}

function useLine(points: Float32Array, color: string, width: number, gain: number, dashed = false, opacity = 1) {
  const line = useMemo(() => {
    const g = new LineGeometry()
    g.setPositions(points)
    const m = new LineMaterial({ linewidth: width, dashed, dashSize: 0.9, gapSize: 0.7, transparent: true, opacity, depthWrite: false })
    m.color.set(color).multiplyScalar(gain)
    const l = new Line2(g, m)
    if (dashed) l.computeLineDistances()
    l.frustumCulled = false
    return l
  }, [points, color, width, gain, dashed, opacity])
  useEffect(
    () => () => {
      line.geometry.dispose()
      line.material.dispose()
    },
    [line],
  )
  return line
}

function flat(xy: Float64Array): Float32Array {
  const out = new Float32Array((xy.length / 2) * 3)
  for (let i = 0; i < xy.length / 2; i++) {
    out[i * 3] = xy[i * 2]! * K
    out[i * 3 + 2] = -xy[i * 2 + 1]! * K
  }
  return out
}

function Scene({ captured, mode = 'arrival', design, damaged, geo, stageEl }: MarsArrivalProps & { geo: Geometry; stageEl: React.RefObject<HTMLParagraphElement | null> }) {
  const invalidate = useThree((s) => s.invalidate)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const reduced = useReducedMotion() === true
  const layout = useMemo(() => spacecraftLayout(design, damaged), [design, damaged])

  // The animation starts when the outcome arrives while this view is mounted; a view mounted after
  // the outcome (a revisit) starts at its end.
  const startedAt = useRef<number | null>(null)
  const firstCaptured = useRef(captured)
  // Layout effect: the clock starts before the next frame, so the end pose never flashes first.
  useLayoutEffect(() => {
    if (captured === null) startedAt.current = null
    else if (firstCaptured.current === null && startedAt.current === null) startedAt.current = performance.now()
    invalidate()
  }, [captured, invalidate])
  const mountedAt = useMemo(() => performance.now(), [])

  const N_HYP = 241
  const hypPts = useMemo(() => flat(hyperbolaPoints(geo.h, geo.nuStart, -geo.nuStart, N_HYP)), [geo])
  const ellPts = useMemo(() => flat(ellipsePoints(geo.el, 241)), [geo])
  const hypGuide = useLine(hypPts, '#8f8a83', 1, 1, true, 0.75)
  const hypFlown = useLine(hypPts, RUST, 2.2, 1.25)
  const ellGuide = useLine(ellPts, '#8f8a83', 1, 1, true, 0.6)
  const ellFlown = useLine(ellPts, RUST, 2.2, 1.25)

  const ship = useRef<THREE.Group>(null)
  const model = useRef<THREE.Group>(null)
  const marker = useRef<THREE.Sprite>(null)
  const markerMat = useMemo(() => new THREE.SpriteMaterial({ map: diamondTexture(), color: RUST, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }), [])
  useEffect(
    () => () => {
      markerMat.map?.dispose()
      markerMat.dispose()
    },
    [markerMat],
  )
  const mars = useRef<THREE.Mesh>(null)
  const plume = useMemo(() => ({ current: 0 }), [])
  const pose = useMemo<Pose>(() => ({ phase: 'hold', x: 0, y: 0, vx: 0, vy: 1, tReal: 0, throttle: 0, traced: 0, onEllipse: false, hypFlown: 0 }), [])
  const tmp = useMemo(
    () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      t: new THREE.Vector3(),
      d: new THREE.Vector3(),
      q1: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      m: new THREE.Matrix4(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(0, 1, 0),
      z: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      cA: new THREE.Vector3(),
      cB: new THREE.Vector3(),
      tA: new THREE.Vector3(),
      tB: new THREE.Vector3(),
      spinAxis: new THREE.Vector3(Math.sin(0.44), Math.cos(0.44), 0),
      qs: new THREE.Quaternion(),
      qTilt: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.44),
    }),
    [],
  )
  const lastStage = useRef('')
  const periapsis = useMemo(() => toScene(geo.h.rp, 0, new THREE.Vector3()), [geo])
  const holdAt = useMemo(() => {
    const [x, y] = pointAt(geo.h, -nuAtRadius(geo.h, HOLD_R))
    return toScene(x, y, new THREE.Vector3())
  }, [geo])
  const burnView = useMemo(() => new THREE.Vector3(1, 0.42, -0.35).normalize().multiplyScalar(4.2), [])
  const ellCentre = useMemo(() => new THREE.Vector3(-(geo.el.a - geo.el.rp) * K, 0, 0), [geo])

  useFrame(() => {
    const now = performance.now()
    let a: number
    if (mode === 'orbit') a = reduced ? 0 : (now - mountedAt) / 1000
    else if (captured === null) a = 0
    else if (startedAt.current === null || reduced) a = captured ? T_APPROACH + T_BURN + T_PULL + 4 : T_APPROACH + T_FLYOUT + 1
    else a = (now - startedAt.current) / 1000
    poseAt(geo, captured, mode, a, pose)

    // Spacecraft.
    toScene(pose.x, pose.y, tmp.p)
    tmp.v.set(pose.vx, 0, -pose.vy).normalize()
    ship.current?.position.copy(tmp.p)
    if (model.current) {
      // Approach and burn: engine forward (thrust against the motion). In orbit: instruments at Mars.
      tmp.q1.setFromUnitVectors(tmp.up, tmp.d.copy(tmp.v).negate())
      tmp.z.copy(tmp.p).negate().normalize()
      tmp.x.crossVectors(tmp.y, tmp.z).normalize()
      tmp.m.makeBasis(tmp.x, tmp.y, tmp.z)
      tmp.q2.setFromRotationMatrix(tmp.m)
      const settle = pose.phase === 'orbit' ? clamp01(mode === 'orbit' ? 1 : (a - T_APPROACH - T_BURN) / 2) : 0
      model.current.quaternion.slerpQuaternions(tmp.q1, tmp.q2, easeOut(settle))
    }
    plume.current = pose.throttle

    // Paths: the flown part solid rust, the rest as a dashed guide.
    const hypSeg = N_HYP - 1
    hypFlown.geometry.instanceCount = Math.round(hypSeg * (captured === null ? 0 : pose.hypFlown))
    hypFlown.visible = hypFlown.geometry.instanceCount > 0
    hypGuide.visible = mode !== 'orbit' && !(pose.onEllipse && pose.traced >= 1)
    ellFlown.geometry.instanceCount = Math.round(240 * pose.traced)
    ellFlown.visible = pose.onEllipse && ellFlown.geometry.instanceCount > 0
    ellGuide.visible = captured !== false

    // Mars turns once per sol, in the same compressed time.
    if (mars.current) {
      tmp.qs.setFromAxisAngle(tmp.up, ((2 * Math.PI * pose.tReal) / MARS_DAY_S) % (2 * Math.PI))
      mars.current.quaternion.copy(tmp.qTilt).multiply(tmp.qs)
    }

    // Camera: approach (Mars), close on the burn, then back to the whole orbit.
    // Approach framing: between Mars and the holding point, so the incoming leg is in view.
    const approachDist = Math.max(36, geo.h.rp * K * 7)
    tmp.tA.copy(holdAt).multiplyScalar(0.42)
    tmp.cA.set(0.22, 0.5, 1).normalize().multiplyScalar(approachDist)
    let w = 0 // 0 = approach framing, 1 = orbit framing
    let close = 0
    if (mode === 'orbit') w = 1
    else if (captured) {
      const sb = a - T_APPROACH
      close = clamp01((a - (T_APPROACH - 1.6)) / 1.6) * (1 - clamp01((sb - T_BURN) / T_PULL))
      w = easeOut(clamp01((sb - T_BURN) / T_PULL))
    } else if (captured === false) w = 0.35 * easeOut(clamp01((a - T_APPROACH) / T_FLYOUT))
    tmp.tB.copy(ellCentre)
    tmp.cB.set(0.12, 0.85, 0.75).normalize().multiplyScalar(92)
    tmp.t.lerpVectors(tmp.tA, tmp.tB, w)
    tmp.d.lerpVectors(tmp.cA, tmp.cB, w)
    if (close > 0) {
      // The burn from the side, outside the orbit: the spacecraft against Mars, the plume across.
      const e = easeOut(close)
      tmp.t.lerp(periapsis, e * 0.95)
      tmp.d.lerp(burnView, e)
    }
    camera.position.copy(tmp.t).add(tmp.d)
    camera.lookAt(tmp.t)
    if (marker.current) {
      // The marker shows the spacecraft from afar and fades as the model becomes visible.
      const k = clamp01((camera.position.distanceTo(tmp.p) - 8) / 10)
      markerMat.opacity = k
      marker.current.visible = k > 0.01
    }

    const text = STAGE_TEXT[pose.phase]
    if (stageEl.current && lastStage.current !== text) {
      stageEl.current.textContent = text
      lastStage.current = text
    }
    const moving = mode === 'orbit' ? !reduced : captured !== null && startedAt.current !== null && !reduced && pose.phase !== 'gone'
    if (moving) invalidate()
  })

  return (
    <>
      <Starfield brightness={0.6} />
      <directionalLight position={[70, 28, 36]} intensity={2.6} color="#fff4e6" />
      <ambientLight intensity={0.03} />
      <MarsBody ref={mars} />
      <primitive object={hypGuide} />
      <primitive object={hypFlown} />
      <primitive object={ellGuide} />
      <primitive object={ellFlown} />
      <group ref={ship}>
        <group ref={model} scale={SHIP_SCALE}>
          <SpacecraftModel design={design} damaged={damaged} />
          {layout.nozzle && (
            <group position-y={-BUS.h / 2 - layout.nozzle.length}>
              <BurnPlume radius={layout.nozzle.kind === 'biprop' ? 1.6 : 1.1} length={layout.nozzle.kind === 'biprop' ? 12 : 8} handle={plume} />
            </group>
          )}
        </group>
        <sprite ref={marker} material={markerMat} scale={[0.024, 0.024, 1]} renderOrder={3} />
      </group>
    </>
  )
}

const plumeVertex = /* glsl */ `
varying float vAlong;
varying float vFacing;
void main() {
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`
const plumeFragment = /* glsl */ `
uniform float uThrottle;
varying float vAlong;
varying float vFacing;
void main() {
  float a = pow(clamp(vAlong, 0.0, 1.0), 1.8) * pow(clamp(vFacing, 0.0, 1.0), 1.4) * uThrottle;
  vec3 col = mix(vec3(0.55, 0.7, 1.4), vec3(2.2, 2.2, 2.4), pow(clamp(vAlong, 0.0, 1.0), 4.0));
  gl_FragColor = vec4(col * a, a);
}
`

/**
 * The capture burn's exhaust: a short, faint additive cone from the nozzle (storable propellants
 * burn nearly clear in vacuum; this keeps a hint of it), driven by a throttle ref.
 */
function BurnPlume({ radius, length, handle }: { radius: number; length: number; handle: { current: number } }) {
  const ref = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => {
    // Apex at the nozzle (y = 0), opening downwards; uv.y is 1 at the apex.
    const g = new THREE.ConeGeometry(radius, length, 24, 1, true)
    g.translate(0, -length / 2, 0)
    return g
  }, [radius, length])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: plumeVertex,
        fragmentShader: plumeFragment,
        uniforms: { uThrottle: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useFrame(() => {
    const m = ref.current
    if (!m) return
    material.uniforms.uThrottle!.value = handle.current
    m.visible = handle.current > 0.002
  })
  return <mesh ref={ref} geometry={geometry} material={material} visible={false} frustumCulled={false} renderOrder={5} />
}

function diamondTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
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
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function MarsBody({ ref }: { ref: React.RefObject<THREE.Mesh | null> }) {
  const map = useTexture(PLANET_TEXTURE.mars)
  const material = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, envMapIntensity: 0 })
  }, [map])
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh ref={ref} material={material} scale={R_MARS * K}>
      <sphereGeometry args={[1, 96, 48]} />
    </mesh>
  )
}

