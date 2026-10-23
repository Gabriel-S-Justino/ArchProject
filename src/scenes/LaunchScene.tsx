// The launch: the player's rocket on a stylised pad at dusk, ignition and smoke, lift-off past the
// tower, the sky darkening to black with altitude, booster / stage / fairing separations at the
// timeline's events (time-compressed by launchTiming), and a wide shot over the Earth's limb for
// the parking orbit and the departure burn. A pad abort fires the engines and holds; a Δv shortfall
// cuts the engines off and coasts.
//
// The Launch screen owns the clock (animation seconds in `clock`) and the HUD; this scene only
// reads the clock each frame. Everything is a pure function of that time, so replay, skip and still
// frames are exact. Bloom is limited to the exhaust (HDR colour above the threshold); tone mapping
// is ACES. Rendering stops while the view is off-screen or the tab is hidden.
import { Environment, Lightformer, Preload, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { boosterById } from '@/data/boosters'
import { engineById } from '@/data/engines'
import type { RocketDesign } from '@/physics/launcher'
import { DevStats } from './DevStats'
import './threeSetup'
import { Plume, Smoke, rand, type PlumeHandle, type SmokeParticle } from './Exhaust'
import { ascentPath, eventTime, realTimeAt, shotAt, type LaunchSchedule, type StageBurn } from './launchTiming'
import { BoosterParts, PayloadParts, SpacecraftBody, StageParts, useRocketKit } from './RocketModel'
import { rocketLayout, type RocketLayout } from './rocketLayout'
import { latticeTowerGeometry, launchMountGeometry, mastsGeometry } from './structures'

export interface LaunchSceneProps {
  rocket: RocketDesign
  schedule: LaunchSchedule
  burns: StageBurn[]
  liftoffTwr: number
  /** Animation seconds, written by the Launch screen every frame. */
  clock: RefObject<number>
  /** The sequence is running (continuous rendering); otherwise one frame per change. */
  playing: boolean
  /** Changes when a still frame is chosen, so the scene redraws once. */
  frameKey?: number
  /** Called once the first frame is on screen (shaders compiled, Earth texture uploaded). */
  onReady?: () => void
}

const GROUND_Y = -7
/** Dropped stages, boosters and fairing halves leave the picture after this long (animation s). */
const DROP_VISIBLE_S = 4.5
const EARTH_R = 6371 // drawn in metres at 1/1000 scale: same angular size as the real Earth
const SITE = { lat: 28.5, lon: -80.6 } // a Florida-like launch latitude; the Earth turns under the flight

/** Memoised: the Launch screen re-renders every frame for its HUD; the scene reads the clock ref instead. */
export default memo(LaunchScene)

function LaunchScene(props: LaunchSceneProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const el = wrap.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setOnScreen(e?.isIntersecting ?? true), { threshold: 0.01 })
    io.observe(el)
    const vis = () => setTabVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', vis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])
  const live = props.playing && onScreen && tabVisible
  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        frameloop={live ? 'always' : 'demand'}
        dpr={[1, 2]}
        flat
        camera={{ fov: 36, near: 0.5, far: 30000, position: [80, 4, 120] }}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        role="img"
        aria-label={launchViewLabel(props.schedule.failure)}
      >
        <Invalidate keys={[props.frameKey, props.playing, live]} />
        <Flight {...props} />
        {/* Compile every shader and upload the Earth texture before the clock starts, so ignition,
            upper-stage ignition and the first view of the Earth do not hitch. */}
        <Preload all />
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.8} radius={0.68} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
        <DevStats name="launch" />
      </Canvas>
    </div>
  )
}

/** What the view shows, by how the flight ends. */
export function launchViewLabel(failure: LaunchSchedule['failure']): string {
  switch (failure) {
    case 'pad':
      return 'Launch view: the engines light, but the rocket is too heavy to climb and the flight is aborted on the pad'
    case 'orbit':
      return 'Launch view: the rocket lifts off and separates its stages, then runs out of Δv before reaching orbit'
    case 'departure':
      return 'Launch view: the rocket reaches the parking orbit, but the upper stage cannot finish the departure burn to Mars'
    default:
      return 'Launch view: the rocket lifts off, separates its stages, reaches the parking orbit and fires the departure burn to Mars'
  }
}

function Invalidate({ keys }: { keys: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate(), [invalidate, ...keys])
  return null
}

// ---------------------------------------------------------------------------------------------

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
/** Engine throttle: ramps up over 0.45 s from `on`, down over 0.25 s from `off`. */
const throttle = (a: number, on: number, off: number) => clamp01((a - on) / 0.45) * (1 - clamp01((a - off) / 0.25))

function stageThrustN(r: RocketDesign, i: number): number {
  const s = r.stages[i]
  const e = s?.engineId ? engineById(s.engineId) : undefined
  if (!s || !e) return 0
  const n = Math.max(1, Math.round(s.engineCount) || 1)
  return n * (i === 0 && e.thrustSL > 0 ? e.thrustSL : e.thrustVac)
}

/** Plume length from thrust (√thrust), m. */
const plumeLength = (thrustN: number, vacuum: boolean) => Math.min(75, Math.max(3, 0.5 * Math.sqrt(thrustN / 1000))) * (vacuum ? 1.25 : 1)

interface Windows {
  /** Per stage: engines on / off, animation s (Infinity = never). */
  stage: { on: number; off: number }[]
  booster: { on: number; off: number }
  stageSep: number[]
  boosterSep: number
  fairingSep: number
  scSep: number
  abort: number
}

function windows(s: LaunchSchedule, layout: RocketLayout, burns: StageBurn[], solidBoosters: boolean): Windows {
  const ign = eventTime(s, 'ignition')
  const abort = eventTime(s, 'abort')
  const cutoff = eventTime(s, 'cutoff')
  const departure = eventTime(s, 'departure-burn')
  const stageSep = layout.stages.map((st) => eventTime(s, 'stage-sep', st.index))
  const end = Math.min(abort, cutoff, departure)
  const stage = layout.stages.map((st, i) => {
    const burn = burns.find((b) => b.stage === i)
    if (s.failure === 'pad') return i === 0 ? { on: ign, off: abort } : { on: Infinity, off: Infinity }
    if (!burn || burn.end <= burn.start || !st.engines) return { on: Infinity, off: Infinity }
    const on = i === 0 ? ign : stageSep[i - 1]! + 0.55
    return { on, off: Math.min(stageSep[i]!, end) }
  })
  const boosterSep = eventTime(s, 'booster-sep')
  const booster =
    s.failure === 'pad'
      ? solidBoosters
        ? { on: Infinity, off: Infinity } // the abort comes before the solids would light
        : { on: ign, off: abort }
      : { on: solidBoosters ? s.liftoffA - 0.05 : ign, off: Math.min(boosterSep - 0.12, end) }
  return {
    stage,
    booster,
    stageSep,
    boosterSep,
    fairingSep: eventTime(s, 'fairing-sep'),
    scSep: departure + 0.9,
    abort,
  }
}

function Flight({ rocket, schedule, burns, liftoffTwr, clock, onReady }: LaunchSceneProps) {
  const readied = useRef(false)
  const layout = useMemo(() => rocketLayout(rocket), [rocket])
  const kit = useRocketKit(layout)
  const H = Math.max(layout.height, 20)
  const solid = layout.boosters?.solid ?? false
  const win = useMemo(() => windows(schedule, layout, burns, solid), [schedule, layout, burns, solid])
  const tOrbit = schedule.events.find((e) => e.kind === 'orbit')?.t ?? Math.max(400, schedule.tEnd * 0.85)
  const path = useMemo(() => ascentPath(tOrbit, liftoffTwr, Math.max(schedule.tEnd, tOrbit) + 60), [tOrbit, liftoffTwr, schedule.tEnd])

  // Refs driven every frame.
  const stack = useRef<THREE.Group>(null)
  const stageRefs = useRef<(THREE.Group | null)[]>([])
  const boosterRefs = useRef<(THREE.Group | null)[]>([])
  const fairingRefs = useRef<(THREE.Group | null)[]>([null, null])
  const fairingHinge = useRef<(THREE.Group | null)[]>([null, null])
  const scRef = useRef<THREE.Group>(null)
  const padRef = useRef<THREE.Group>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const glow = useRef<THREE.PointLight>(null)
  const sky = useRef<SkyHandle>(null)
  const stagePlumes = useMemo(() => layout.stages.map(() => ({ current: { throttle: 0, spread: 0 } as PlumeHandle })), [layout])
  const boosterPlume = useMemo(() => ({ current: { throttle: 0, spread: 0 } as PlumeHandle }), [])
  const aNow = useRef(0)

  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const fog = useMemo(() => new THREE.Fog('#4a4644', 600, 7000), [])
  useEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])

  const thrust0 = stageThrustN(rocket, 0) + (layout.boosters ? layout.boosters.count * (boosterById(layout.boosters.boosterId)?.thrustSL ?? 0) : 0)
  const power = Math.min(1.7, Math.max(0.6, Math.sqrt(thrust0 / 4e6)))

  // Smoke: a ground cloud from the flame trench, then a short trail behind the climbing rocket.
  const GROUND_N = 96
  const TRAIL_N = 112
  const smokePlan = useMemo(() => {
    const ign = eventTime(schedule, 'ignition')
    const groundEnd = schedule.failure === 'pad' ? win.abort : schedule.liftoffA + 3
    const trail = Array.from({ length: TRAIL_N }, (_, k) => {
      const b = schedule.liftoffA + 0.2 + (k / TRAIL_N) * 4.8
      const p = path(realTimeAt(schedule, b))
      const pitch = p.pitch
      return { b, x: p.x - Math.sin(pitch) * 3, y: p.y - Math.cos(pitch) * 3, ok: schedule.failure !== 'pad' && p.y < 2500 }
    })
    return { ign, groundEnd, trail }
  }, [schedule, win.abort, path])
  const sampleSmoke = useMemo(
    () => (i: number, out: SmokeParticle) => {
      const a = aNow.current
      const core = stagePlumes[0]?.current.throttle ?? 0
      if (i < GROUND_N) {
        const b = smokePlan.ign + 0.15 + (i / GROUND_N) * Math.max(0.5, smokePlan.groundEnd - smokePlan.ign)
        const age = a - b
        if (age <= 0) return
        const lobe = rand(i, 1) < 0.5 ? 0 : Math.PI
        const ang = lobe + (rand(i, 2) - 0.5) * 1.3
        const V = 20 * power * (0.7 + 0.6 * rand(i, 3))
        const r = 11 + V * 2.2 * (1 - Math.exp(-age / 2.2))
        out.x = Math.cos(ang) * r
        out.z = Math.sin(ang) * r * 0.8
        out.y = GROUND_Y + 1.5 + 5 * (1 - Math.exp(-age / 3)) + age * 0.7 * rand(i, 4)
        out.size = Math.min(42, (5 + 7 * Math.sqrt(age)) * power * (0.7 + 0.6 * rand(i, 5)))
        out.alpha = smooth(0, 0.5, age) * (1 - smooth(10, 18, age)) * 0.9
        out.warm = core * Math.exp(-age / 1.4) * 0.75
      } else {
        const t = smokePlan.trail[i - GROUND_N]
        if (!t || !t.ok) return
        const age = a - t.b
        if (age <= 0) return
        out.x = t.x + (rand(i, 6) - 0.5) * 4 + age * 1.2
        out.y = t.y + (rand(i, 7) - 0.5) * 4 + age * 0.4
        out.z = (rand(i, 8) - 0.5) * 4
        out.size = (4 + 6 * Math.sqrt(age)) * power
        out.alpha = smooth(0, 0.2, age) * (1 - smooth(3, 8, age)) * 0.75
        out.warm = Math.exp(-age / 0.45) * 0.85
      }
    },
    [smokePlan, power, stagePlumes],
  )

  // Earth orientation: the launch site under the camera, east along +x.
  const earthBase = useMemo(() => {
    const phi = ((SITE.lon + 180) / 360) * Math.PI * 2
    const theta = ((90 - SITE.lat) * Math.PI) / 180
    const site = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
    const east = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).normalize()
    const q1 = new THREE.Quaternion().setFromUnitVectors(site, new THREE.Vector3(0, 1, 0))
    east.applyQuaternion(q1).setY(0).normalize()
    const q2 = new THREE.Quaternion().setFromUnitVectors(east, new THREE.Vector3(1, 0, 0))
    return q2.multiply(q1)
  }, [])
  const earth = useRef<THREE.Mesh>(null)

  const tmp = useMemo(
    () => ({
      u: new THREE.Vector3(),
      w: new THREE.Vector3(),
      s: new THREE.Vector3(0, 0, 1),
      c: new THREE.Vector3(),
      cam: new THREE.Vector3(),
      look: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      axis: new THREE.Vector3(),
      haze: new THREE.Color(),
    }),
    [],
  )
  const lastShot = useRef<string>('')

  useFrame(() => {
    if (!readied.current) {
      readied.current = true
      onReady?.()
    }
    const a = Math.max(0, clock.current ?? 0)
    aNow.current = a
    const t = realTimeAt(schedule, a)
    const p = path(t)
    const firing = a >= win.stage[0]!.on && a < win.abort
    const shake = schedule.failure === 'pad' && firing ? 0.03 : a < schedule.liftoffA + 1 && firing ? 0.02 : 0
    const st = stack.current
    if (st) {
      st.position.set(p.x + Math.sin(a * 91) * shake, p.y + Math.sin(a * 77) * shake * 0.5, Math.cos(a * 83) * shake)
      st.rotation.z = -p.pitch
    }
    const alt = Math.max(0, p.y)
    const air = Math.exp(-alt / 9000) // 1 at the pad → 0 in vacuum
    const vac = 1 - air

    // Separations: dropped parts drift back from the stack in animation time.
    layout.stages.forEach((_, i) => {
      const g = stageRefs.current[i]
      if (!g) return
      const dt = a - win.stageSep[i]!
      if (dt <= 0) {
        g.position.set(0, 0, 0)
        g.rotation.set(0, 0, 0)
        g.visible = true
        return
      }
      g.position.set(0.35 * dt * dt, -(1.1 * dt + 3.4 * dt * dt), 0.1 * dt * dt)
      g.rotation.set(0.02 * dt * dt, 0, 0.06 * dt * dt)
      g.visible = dt < DROP_VISIBLE_S
    })
    const b = layout.boosters
    if (b) {
      const dt = a - win.boosterSep
      b.positions.forEach(([x, z], k) => {
        const g = boosterRefs.current[k]
        if (!g) return
        const rr = Math.hypot(x, z) || 1
        const dx = x / rr
        const dz = z / rr
        if (dt <= 0) {
          g.position.set(x, 0, z)
          g.quaternion.identity()
          g.visible = true
          return
        }
        const out = 1.5 * dt + 3 * dt * dt
        g.position.set(x + dx * out, -2.6 * dt * dt, z + dz * out)
        tmp.axis.set(dz, 0, -dx)
        g.quaternion.setFromAxisAngle(tmp.axis, Math.min(1.2, 0.35 * dt * dt))
        g.visible = dt < DROP_VISIBLE_S
      })
    }
    const fdt = a - win.fairingSep
    for (const half of [0, 1] as const) {
      const g = fairingRefs.current[half]
      const h = fairingHinge.current[half]
      if (!g || !h) continue
      const sgn = half === 0 ? 1 : -1
      if (fdt <= 0) {
        g.position.set(0, 0, 0)
        h.rotation.z = 0
        g.visible = true
        continue
      }
      h.rotation.z = -sgn * Math.min(1.35, 1.2 * fdt * fdt)
      g.position.set(sgn * 0.9 * fdt * fdt, -1.6 * fdt * fdt, 0)
      g.visible = fdt < DROP_VISIBLE_S
    }
    if (scRef.current) {
      const sdt = a - win.scSep
      scRef.current.position.y = sdt > 0 ? 0.9 * sdt + 0.15 * sdt * sdt : 0
    }

    // Engines.
    layout.stages.forEach((_, i) => {
      const h = stagePlumes[i]!.current
      h.throttle = throttle(a, win.stage[i]!.on, win.stage[i]!.off)
      h.spread = vac
    })
    boosterPlume.current.throttle = throttle(a, win.booster.on, win.booster.off)
    boosterPlume.current.spread = vac

    // Light: low warm sun at the pad, whiter and stronger above the air; the exhaust lights the pad.
    if (sun.current) {
      sun.current.intensity = 1.5 + 1.4 * vac
      sun.current.color.setRGB(1, 0.78 + 0.2 * vac, 0.6 + 0.36 * vac)
      sun.current.position.set(p.x - 400, p.y + 140 + 300 * vac, -260)
      sun.current.target.position.set(p.x, p.y, 0)
      sun.current.target.updateMatrixWorld()
    }
    if (hemi.current) hemi.current.intensity = 0.25 + 0.75 * air
    if (glow.current) {
      const thr = Math.max(stagePlumes[0]?.current.throttle ?? 0, boosterPlume.current.throttle)
      glow.current.intensity = 9000 * thr * power * air
      glow.current.position.set(p.x, p.y - 10, 0)
    }

    // Camera: cut between shots.
    const { shot, since } = shotAt(schedule, a)
    const pitch = p.pitch
    tmp.u.set(Math.sin(pitch), Math.cos(pitch), 0)
    tmp.w.set(Math.cos(pitch), -Math.sin(pitch), 0)
    tmp.c.set(p.x, p.y, 0).addScaledVector(tmp.u, H * 0.5)
    const k = a - since
    let fov = 36
    if (shot === 'pad') {
      tmp.cam.set(H * 0.55 + 28, GROUND_Y + 3.2 + k * 0.25, H * 1.15 + 40 - k * 1.1)
      tmp.look.set(p.x, Math.max(H * 0.42, p.y + H * 0.5), 0)
      fov = 38
    } else if (shot === 'chase') {
      const ang = 0.05 * k
      tmp.cam
        .copy(tmp.c)
        .addScaledVector(tmp.u, -0.6 * H)
        .addScaledVector(tmp.s, 1.9 * H * Math.cos(ang))
        .addScaledVector(tmp.w, 0.3 * H + 1.9 * H * Math.sin(ang))
      tmp.look.copy(tmp.c).addScaledVector(tmp.u, -0.3 * H)
    } else if (shot === 'sep') {
      const d = 1.9 * H * (1 - 0.025 * k)
      tmp.cam.copy(tmp.c).addScaledVector(tmp.s, d).addScaledVector(tmp.w, 0.35 * H).addScaledVector(tmp.u, -0.1 * H)
      tmp.look.copy(tmp.c).addScaledVector(tmp.u, -0.15 * H)
    } else {
      tmp.cam.set(tmp.c.x - 1.7 * H - k * 1.5, tmp.c.y + 0.75 * H, 3.6 * H + k * 2)
      tmp.look.copy(tmp.c)
      fov = 30
    }
    camera.position.copy(tmp.cam)
    camera.up.set(0, 1, 0)
    camera.lookAt(tmp.look)
    if (camera.fov !== fov || lastShot.current !== shot) {
      camera.fov = fov
      camera.updateProjectionMatrix()
      lastShot.current = shot
    }

    // Sky, stars, Earth, fog, ground.
    const camAlt = Math.max(0, camera.position.y - GROUND_Y)
    const alt01 = 1 - Math.exp(-camAlt / 12000)
    const dip = Math.acos(EARTH_R * 1000 / (EARTH_R * 1000 + camAlt))
    tmp.haze.setRGB(0.093 * (1 - alt01) + 0.03 * alt01, 0.082 * (1 - alt01) + 0.05 * alt01, 0.076 * (1 - alt01) + 0.1 * alt01)
    fog.color.copy(tmp.haze)
    sky.current?.update(camera.position, alt01, dip)
    if (earth.current) {
      const e = earth.current
      e.visible = camAlt > 6000
      e.position.set(camera.position.x, camera.position.y - (EARTH_R + camAlt / 1000), camera.position.z)
      tmp.q.setFromAxisAngle(tmp.s, -p.x / (EARTH_R * 1000))
      e.quaternion.copy(tmp.q).multiply(earthBase)
      const m = e.material as THREE.ShaderMaterial
      m.uniforms.uHaze!.value = 1 - smooth(8000, 45000, camAlt)
      ;(m.uniforms.uHazeColor!.value as THREE.Color).copy(tmp.haze)
    }
    if (padRef.current) padRef.current.visible = camAlt < 30000
  }, -1)

  const stagePlumeEls = layout.stages.map((sl, i) =>
    sl.engines ? (
      <Plume
        key={`p${i}`}
        propellant={sl.engines.propellant}
        radius={Math.max(0.4, sl.engines.outerR * 0.85)}
        length={plumeLength(stageThrustN(rocket, i), sl.engines.vacuum)}
        handle={stagePlumes[i]!}
        position={[0, sl.y0 + 0.05, 0]}
      />
    ) : null,
  )

  return (
    <>
      <Sky ref={sky} />
      <EarthBackdrop ref={earth} />
      <hemisphereLight ref={hemi} args={['#3d4a5a', '#0c0e10', 1]} />
      <directionalLight ref={sun} intensity={1.5} />
      <pointLight ref={glow} color="#ffa25c" intensity={0} decay={2} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={0.8} color="#7f8ea3" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffb48a" position={[-7, 0.5, -2]} rotation-y={Math.PI / 2} scale={[14, 1.6, 1]} />
      </Environment>

      <group ref={padRef}>
        <Pad height={H} radius={layout.radius} />
      </group>

      <group ref={stack}>
        {layout.stages.map((sl, i) => (
          <group key={i} ref={(g) => void (stageRefs.current[i] = g)}>
            <StageParts kit={kit} stage={sl} />
            {stagePlumeEls[i]}
          </group>
        ))}
        {layout.boosters &&
          layout.boosters.positions.map(([x, z], k) => (
            <group key={`b${k}`} ref={(g) => void (boosterRefs.current[k] = g)} position={[x, 0, z]}>
              <BoosterParts kit={kit} booster={layout.boosters!} />
              {layout.boosters!.engines && (
                <Plume
                  propellant={layout.boosters!.propellant}
                  radius={Math.max(0.4, layout.boosters!.engines.outerR * 0.9)}
                  length={plumeLength(boosterById(layout.boosters!.boosterId)?.thrustSL ?? 1e6, false)}
                  handle={boosterPlume}
                />
              )}
            </group>
          ))}
        {layout.fairing && layout.spacecraft && (
          <>
            <PayloadParts kit={kit} spacecraft={false} />
            <group ref={scRef}>
              <SpacecraftBody kit={kit} y0={layout.spacecraft.y0} w={layout.spacecraft.width} bodyH={layout.spacecraft.height * 0.62} />
            </group>
            {([0, 1] as const).map((half) => {
              const R = layout.fairing!.diameter / 2
              const sgn = half === 0 ? 1 : -1
              return (
                <group key={half} ref={(g) => void (fairingRefs.current[half] = g)}>
                  <group ref={(g) => void (fairingHinge.current[half] = g)} position={[sgn * R, layout.fairing!.y0, 0]}>
                    {kit.fairingHalves && <mesh geometry={kit.fairingHalves[half]} material={kit.mat.fairing} position-x={-sgn * R} />}
                  </group>
                </group>
              )
            })}
          </>
        )}
      </group>
      <Smoke count={GROUND_N + TRAIL_N} sample={sampleSmoke} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Pad

function Pad({ height, radius }: { height: number; radius: number }) {
  const towerH = Math.round((height + 10) / 6) * 6
  const geoms = useMemo(
    () => ({
      tower: latticeTowerGeometry(towerH - GROUND_Y, 7, 6),
      mount: launchMountGeometry(Math.max(3, radius + 0.6), -GROUND_Y),
      masts: mastsGeometry(towerH + 40 - GROUND_Y, Math.max(70, height * 1.3)),
    }),
    [towerH, radius, height],
  )
  useEffect(
    () => () => {
      geoms.tower.dispose()
      geoms.mount.dispose()
      geoms.masts.dispose()
    },
    [geoms],
  )
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.75, metalness: 0.35 }), [])
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b3d3f', roughness: 0.96, metalness: 0 }), [])
  const ground = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1d1f', roughness: 1, metalness: 0 }), [])
  useEffect(() => () => [steel, concrete, ground].forEach((m) => m.dispose()), [steel, concrete, ground])
  const towerX = -(radius + 4.5 + 3.5)
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={GROUND_Y} material={ground}>
        <circleGeometry args={[30000, 64]} />
      </mesh>
      <mesh position-y={GROUND_Y + 0.25} material={concrete}>
        <cylinderGeometry args={[70, 78, 0.5, 48]} />
      </mesh>
      <mesh position={[0, GROUND_Y + 0.52, 0]}>
        <boxGeometry args={[Math.max(6, radius * 1.4), 0.06, 150]} />
        <meshStandardMaterial color="#0c0d0e" roughness={1} />
      </mesh>
      <mesh geometry={geoms.mount} material={steel} />
      <mesh geometry={geoms.tower} material={steel} position={[towerX, GROUND_Y, 0]} />
      {/* access arm to the upper stage */}
      <mesh material={steel} position={[towerX / 2, height * 0.72, 0]}>
        <boxGeometry args={[Math.abs(towerX) - radius - 0.4, 1.4, 2.2]} />
      </mesh>
      <mesh geometry={geoms.masts} material={steel} position-y={GROUND_Y} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Sky: a gradient sphere around the camera, plus stars that appear as the air thins.

interface SkyHandle {
  update(cam: THREE.Vector3, alt01: number, dip: number): void
}

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const skyFragment = /* glsl */ `
uniform float uAlt;
uniform float uDip;
uniform vec3 uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0)) + uDip;
  vec3 zenLow = vec3(0.010, 0.016, 0.028);
  vec3 horLow = vec3(0.093, 0.082, 0.076);
  vec3 zenHigh = vec3(0.0, 0.0, 0.0015);
  vec3 horHigh = vec3(0.03, 0.05, 0.10);
  float spread = mix(0.30, 0.03, uAlt);
  float band = exp(-max(el, 0.0) / spread);
  vec3 col = mix(mix(zenLow, zenHigh, uAlt), mix(horLow, horHigh, uAlt), band);
  float sun = max(dot(d, uSun), 0.0);
  col += mix(vec3(0.20, 0.07, 0.025), vec3(0.06, 0.05, 0.04), uAlt) * pow(sun, 5.0) * band;
  if (el < 0.0) col = mix(mix(horLow, horHigh, uAlt), vec3(0.012, 0.014, 0.016), clamp(-el * 5.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`

const Sky = function Sky({ ref }: { ref: RefObject<SkyHandle | null> }) {
  const sphere = useRef<THREE.Mesh>(null)
  const stars = useRef<THREE.Points>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: { uAlt: { value: 0 }, uDip: { value: 0 }, uSun: { value: new THREE.Vector3(-0.82, 0.08, -0.56).normalize() } },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )
  const starGeom = useMemo(() => {
    const n = 1400
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = rand(i, 11) * 2 - 1
      const th = rand(i, 12) * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      pos.set([Math.cos(th) * r * 14000, u * 14000, Math.sin(th) * r * 14000], i * 3)
      const b = 0.25 + 0.75 * Math.pow(rand(i, 13), 3)
      col.set([b * 0.92, b * 0.95, b], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  const starMat = useMemo(
    () => new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, depthTest: false, fog: false }),
    [],
  )
  useEffect(() => () => [mat, starGeom, starMat].forEach((x) => x.dispose()), [mat, starGeom, starMat])
  useEffect(() => {
    ref.current = {
      update(cam, alt01, dip) {
        sphere.current?.position.copy(cam)
        stars.current?.position.copy(cam)
        mat.uniforms.uAlt!.value = alt01
        mat.uniforms.uDip!.value = dip
        const v = smooth(0.45, 0.85, alt01)
        starMat.color.setScalar(v)
        if (stars.current) stars.current.visible = v > 0.01
      },
    }
  }, [ref, mat, starMat])
  return (
    <>
      <mesh ref={sphere} material={mat} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[15000, 32, 16]} />
      </mesh>
      <points ref={stars} geometry={starGeom} material={starMat} renderOrder={-9} frustumCulled={false} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Earth backdrop (NASA Blue Marble, public/textures), drawn at 1/1000 scale around the camera.

const earthVertex = /* glsl */ `
varying vec3 vN;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const earthFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSun;
uniform float uHaze;
uniform vec3 uHazeColor;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vec3 n = normalize(vN);
  float l = dot(n, uSun);
  vec3 day = texture2D(uMap, vUv).rgb;
  float lit = smoothstep(-0.1, 0.35, l);
  vec3 col = day * (0.015 + 0.7 * lit);
  float fres = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 7.0);
  col += vec3(0.10, 0.22, 0.55) * fres * (0.15 + 0.85 * smoothstep(-0.25, 0.4, l));
  col = mix(col, uHazeColor, uHaze);
  gl_FragColor = vec4(col, 1.0);
}
`

const EarthBackdrop = function EarthBackdrop({ ref }: { ref: RefObject<THREE.Mesh | null> }) {
  const map = useTexture(`${import.meta.env.BASE_URL}textures/earth_bluemarble_4k.jpg`)
  const mat = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    return new THREE.ShaderMaterial({
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
      uniforms: {
        uMap: { value: map },
        uSun: { value: new THREE.Vector3(-0.3, 0.55, 0.78).normalize() },
        uHaze: { value: 1 },
        uHazeColor: { value: new THREE.Color() },
      },
      depthWrite: false,
      depthTest: false,
    })
  }, [map])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh ref={ref} material={mat} renderOrder={-8} frustumCulled={false} visible={false}>
      <sphereGeometry args={[EARTH_R, 96, 64]} />
    </mesh>
  )
}
