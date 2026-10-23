// Mount points for the 3D scenes. The scenes (three.js, React Three Fiber, drei, postprocessing)
// load lazily in their own chunks, so the main bundle does not grow; until they arrive, and
// whenever WebGL is unavailable or the scene fails, the 2D drawing passed as `fallback` shows.
import { Component, Suspense, lazy, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
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

/** Why the 2D drawing stands in for the 3D view. */
export type SceneFallbackCause = 'no-webgl' | 'failed'

const NOTE_TEXT: Record<SceneFallbackCause, string> = {
  'no-webgl': '3D view unavailable on this device (no WebGL 2). Showing the 2D drawing.',
  failed: '3D view failed to load. Showing the 2D drawing.',
}

/** Where a slot's note sits by default: along the bottom edge, clear of the slot's own overlays. */
const NOTE_BOTTOM = 'absolute right-3 bottom-2 left-3'

/** Shown over the 2D fallback when the 3D view cannot run, worded by the cause. */
export function NoWebGLNote({ cause = 'no-webgl', className }: { cause?: SceneFallbackCause; className?: string }) {
  return (
    <p data-scene-note={cause} className={cn('pointer-events-none text-detail text-ink-3', className ?? NOTE_BOTTOM)}>
      {NOTE_TEXT[cause]}
    </p>
  )
}

/** Shared by every slot: `noteClassName` places the note where the slot's HUD leaves room. */
interface SlotProps {
  fallback: ReactNode
  noteClassName?: string
}

function Scene3D({ fallback, noteClassName, children }: SlotProps & { children: ReactNode }) {
  const gl = useWebGL2()
  const flat = (cause: SceneFallbackCause) => (
    <>
      {fallback}
      <NoWebGLNote cause={cause} className={noteClassName} />
    </>
  )
  if (!gl) return flat('no-webgl')
  // While the scene's chunk and textures load, the 2D drawing shows (no note: it is on its way).
  return (
    <SceneBoundary fallback={flat('failed')}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </SceneBoundary>
  )
}

export function HangarView({ rocket, ...slot }: { rocket: RocketDesign } & SlotProps) {
  return (
    <Scene3D {...slot}>
      <Hangar rocket={rocket} />
    </Scene3D>
  )
}

export function LaunchView({ fallback, noteClassName, ...props }: LaunchSceneProps & SlotProps) {
  return (
    <Scene3D fallback={fallback} noteClassName={noteClassName}>
      <LaunchScene {...props} />
    </Scene3D>
  )
}

/** The inner solar system: real planet positions, transfer arcs, and the spacecraft in cruise. */
export function SolarSystemView({ fallback, noteClassName, ...props }: SolarSystemProps & SlotProps) {
  return (
    <Scene3D fallback={fallback} noteClassName={noteClassName}>
      <SolarSystem {...props} />
    </Scene3D>
  )
}

/** The player's spacecraft on a slow turntable (Spacecraft tab). */
export function SpacecraftModelView({ fallback, noteClassName, ...props }: SpacecraftViewProps & SlotProps) {
  return (
    <Scene3D fallback={fallback} noteClassName={noteClassName}>
      <SpacecraftView {...props} />
    </Scene3D>
  )
}

/** Mars orbit insertion (arrival) or the spacecraft in its orbit (operations), to scale around Mars. */
export function MarsArrivalView({ fallback, noteClassName, ...props }: MarsArrivalProps & SlotProps) {
  return (
    <Scene3D fallback={fallback} noteClassName={noteClassName}>
      <MarsArrival {...props} />
    </Scene3D>
  )
}
