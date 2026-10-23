// Mount points for the 3D scenes. The scenes (three.js, React Three Fiber, drei, postprocessing)
// load lazily in their own chunks, so the main bundle does not grow; until they arrive, and
// whenever WebGL is unavailable or the scene fails, the 2D drawing passed as `fallback` shows.
import { Component, Suspense, lazy, type ReactNode } from 'react'
import type { RocketDesign } from '@/physics/launcher'
import type { LaunchSceneProps } from './LaunchScene'
import type { MarsArrivalProps } from './MarsArrival'
import type { SolarSystemProps } from './SolarSystem'
import type { SpacecraftViewProps } from './SpacecraftView'
import { useWebGL2 } from './webgl'

const Hangar = lazy(() => import('./Hangar'))
const LaunchScene = lazy(() => import('./LaunchScene'))
const SolarSystem = lazy(() => import('./SolarSystem'))
const SpacecraftView = lazy(() => import('./SpacecraftView'))
const MarsArrival = lazy(() => import('./MarsArrival'))

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Shown over the 2D fallback when the 3D view cannot run. */
export function NoWebGLNote({ className }: { className?: string }) {
  return (
    <p className={className ?? 'absolute right-3 bottom-2 left-3 text-detail text-ink-3'}>
      3D view unavailable in this browser (WebGL 2 is off). Showing the 2D drawing.
    </p>
  )
}

function Scene3D({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const gl = useWebGL2()
  const flat = (
    <>
      {fallback}
      <NoWebGLNote />
    </>
  )
  if (!gl) return flat
  return (
    <SceneBoundary fallback={flat}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </SceneBoundary>
  )
}

export function HangarView({ rocket, fallback }: { rocket: RocketDesign; fallback: ReactNode }) {
  return (
    <Scene3D fallback={fallback}>
      <Hangar rocket={rocket} />
    </Scene3D>
  )
}

export function LaunchView({ fallback, ...props }: LaunchSceneProps & { fallback: ReactNode }) {
  return (
    <Scene3D fallback={fallback}>
      <LaunchScene {...props} />
    </Scene3D>
  )
}

/** The inner solar system: real planet positions, transfer arcs, and the spacecraft in cruise. */
export function SolarSystemView({ fallback, ...props }: SolarSystemProps & { fallback: ReactNode }) {
  return (
    <Scene3D fallback={fallback}>
      <SolarSystem {...props} />
    </Scene3D>
  )
}

/** The player's spacecraft on a slow turntable (Spacecraft tab). */
export function SpacecraftModelView({ fallback, ...props }: SpacecraftViewProps & { fallback: ReactNode }) {
  return (
    <Scene3D fallback={fallback}>
      <SpacecraftView {...props} />
    </Scene3D>
  )
}

/** Mars orbit insertion (arrival) or the spacecraft in its orbit (operations), to scale around Mars. */
export function MarsArrivalView({ fallback, ...props }: MarsArrivalProps & { fallback: ReactNode }) {
  return (
    <Scene3D fallback={fallback}>
      <MarsArrival {...props} />
    </Scene3D>
  )
}
