// The Spacecraft tab's 3D view: the player's orbiter in a dark studio, rebuilt on every part edit,
// turning slowly while it is on screen (not under reduced motion). Drag to turn it. Renders on
// demand: nothing is drawn while it is still, off-screen or in a hidden tab.
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { SpacecraftDesign } from '@/game/spacecraft'
import { DevStats } from './DevStats'
import './threeSetup'
import { InvalidateOn, useOnScreen } from './sceneHooks'
import { SpacecraftModel } from './SpacecraftModel'
import { describeSpacecraft, spacecraftLayout } from './spacecraftLayout'

const BG = '#0b0d10'
const FOV = 30

export interface SpacecraftViewProps {
  design: SpacecraftDesign
  damaged?: readonly string[]
}

export default function SpacecraftView({ design, damaged }: SpacecraftViewProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const live = useOnScreen(wrap)
  const reduced = useReducedMotion() === true
  const layout = useMemo(() => spacecraftLayout(design, damaged), [design, damaged])
  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        frameloop={live ? 'demand' : 'never'}
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.1, far: 400, position: [14, 6, 18] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        role="img"
        aria-label={`3D model of your spacecraft: ${describeSpacecraft(layout)}.`}
      >
        <color attach="background" args={[BG]} />
        <InvalidateOn value={live} />
        <Studio />
        <Turntable spin={live && !reduced}>
          <SpacecraftModel design={design} damaged={damaged} />
        </Turntable>
        <Frame radius={layout.radius} />
        <DevStats name="spacecraft" />
      </Canvas>
    </div>
  )
}

function Studio() {
  return (
    <>
      <Environment resolution={128} frames={1} environmentIntensity={0.7}>
        <Lightformer form="rect" intensity={2} position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-6, 1, 3]} rotation-y={Math.PI / 2.5} scale={[2, 8, 1]} />
        <Lightformer form="rect" color="#ffd8b0" intensity={0.8} position={[5, 0, -5]} scale={[5, 3, 1]} />
      </Environment>
      {/* The Sun: one hard white key from the front left; a cool rim from behind. */}
      <directionalLight position={[-30, 22, 26]} intensity={2.6} color="#fff6ea" />
      <directionalLight position={[26, 10, -30]} intensity={0.9} color="#c9d6ff" />
      <directionalLight position={[20, -8, 24]} intensity={0.45} color="#e8ecf2" />
      <ambientLight intensity={0.04} />
    </>
  )
}

/** Turns its children slowly about y while `spin` (about one turn a minute). */
function Turntable({ spin, children }: { spin: boolean; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate(), [spin, invalidate])
  useFrame((_, dt) => {
    if (!spin || !g.current) return
    g.current.rotation.y += Math.min(dt, 0.1) * 0.11
    invalidate()
  })
  return (
    <group ref={g} rotation-y={-0.5}>
      {children}
    </group>
  )
}

/** Fits the camera to the model's size (keeping the angle the player turned it to). */
function Frame({ radius }: { radius: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  useEffect(() => {
    const half = THREE.MathUtils.degToRad(FOV / 2)
    const aspect = Math.max(0.4, size.width / Math.max(1, size.height))
    const fit = Math.min(Math.sin(half), Math.sin(Math.atan(Math.tan(half) * aspect)))
    const dist = (radius * 0.86) / fit
    const dir = camera.position.lengthSq() > 0 ? camera.position.clone().normalize() : new THREE.Vector3(0.55, 0.32, 0.8).normalize()
    camera.position.copy(dir.multiplyScalar(dist))
    camera.lookAt(0, 0, 0)
    controls.current?.update()
    invalidate()
  }, [radius, size.width, size.height, camera, invalidate])
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom={false}
      rotateSpeed={0.6}
      minPolarAngle={THREE.MathUtils.degToRad(20)}
      maxPolarAngle={THREE.MathUtils.degToRad(150)}
    />
  )
}
