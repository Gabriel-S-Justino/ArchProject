// Transfer arcs in the solar view. The chosen (or flown) transfer is a solid Mars-rust line a couple
// of pixels wide, just bright enough to bloom faintly; a hovered porkchop cell and the planned or
// predicted paths are 1 px dashed lines. Dashed lines own a fixed-size buffer that is rewritten in
// place when their source changes (no new geometry, no React re-render of the scene), and their
// dashes keep a constant on-screen length at any zoom.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { Transfer } from '@/physics/porkchop'
import { devStat } from './sceneHooks'
import { ARC_POINTS, transferArc, writeLineDistances } from './solarScale'

/** DESIGN.md Mars rust (oklch 0.72 0.14 52 ≈ #e8894a). */
export const RUST = '#e8894a'

/** A solid wide line through `points`, drawn up to the fraction `upTo` of its segments. */
export function GlowArc({ points, upTo = 1, width = 2.2, color = RUST, gain = 1.3, opacity = 1 }: { points: Float32Array; upTo?: number; width?: number; color?: string; gain?: number; opacity?: number }) {
  const line = useMemo(() => {
    const mat = new LineMaterial({ linewidth: width, transparent: opacity < 1, opacity, depthWrite: false })
    mat.color.set(color).multiplyScalar(gain)
    return new Line2(new LineGeometry(), mat)
  }, [width, color, gain, opacity])
  useEffect(
    () => () => {
      line.geometry.dispose()
      line.material.dispose()
    },
    [line],
  )
  const segments = Math.max(0, points.length / 3 - 1)
  useLayoutEffect(() => {
    if (segments < 1) return
    line.geometry.setPositions(points)
    line.computeLineDistances()
  }, [line, points, segments])
  useLayoutEffect(() => {
    line.geometry.instanceCount = Math.max(0, Math.min(segments, Math.round(segments * Math.min(1, Math.max(0, upTo)))))
    line.visible = segments >= 1 && line.geometry.instanceCount > 0
  }, [line, upTo, segments, points])
  return <primitive object={line} frustumCulled={false} />
}

export interface DashedPathProps {
  /** Maximum points. */
  capacity: number
  /** Writes up to `capacity` points into `buf` and returns how many it wrote; called when `version` changes. */
  write: (buf: Float32Array) => number
  /** Any value that changes when the path does (a Transfer, a ship state). */
  version: unknown
  color?: string
  opacity?: number
  /** Dash and gap as fractions of the camera's distance to the line's nearest point (constant on screen). */
  dash?: number
  gap?: number
  /** Dev stats: the scene name to stamp redraw times under. */
  stamp?: string
}

/** A 1 px dashed polyline whose buffer is filled in place. */
export function DashedPath({ capacity, write, version, color = '#9a958d', opacity = 0.9, dash = 0.012, gap = 0.009, stamp }: DashedPathProps) {
  const invalidate = useThree((s) => s.invalidate)
  const { line, pos, dist } = useMemo(() => {
    const pos = new Float32Array(capacity * 3)
    const dist = new Float32Array(capacity)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('lineDistance', new THREE.BufferAttribute(dist, 1).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    const m = new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 1, gapSize: 1, depthWrite: false })
    const line = new THREE.Line(g, m)
    line.frustumCulled = false
    return { line, pos, dist }
  }, [capacity, color, opacity])
  useEffect(
    () => () => {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    },
    [line],
  )
  const pending = useRef(false)
  const writeRef = useRef(write)
  writeRef.current = write
  useLayoutEffect(() => {
    const n = version == null ? 0 : writeRef.current(pos)
    writeLineDistances(pos, n, dist)
    line.geometry.setDrawRange(0, n)
    ;(line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(line.geometry.getAttribute('lineDistance') as THREE.BufferAttribute).needsUpdate = true
    line.visible = n > 1
    if (stamp) {
      devStat(stamp, 'pathWrittenAt', performance.now())
      pending.current = true
    }
    invalidate()
  }, [version, line, pos, dist, invalidate, stamp])

  const near = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (!line.visible) return
    // Dash length from the camera's distance to the path's first point (a cheap, stable proxy).
    near.set(pos[0]!, pos[1]!, pos[2]!)
    const d = Math.max(0.01, camera.position.distanceTo(near))
    const m = line.material as THREE.LineDashedMaterial
    m.dashSize = d * dash
    m.gapSize = d * gap
    if (pending.current && stamp) {
      pending.current = false
      devStat(stamp, 'pathDrawnAt', performance.now())
    }
  })
  return <primitive object={line} />
}

/**
 * A transfer arc sampled with sampleTrajectory from (r1, v1) over the time of flight (cached per
 * Transfer). `selected`: solid rust; `preview`: dashed, subdued; `planned`: dashed hairline.
 */
export function TransferArc({ transfer, variant, upTo }: { transfer: Transfer | null; variant: 'selected' | 'preview' | 'planned'; upTo?: number }) {
  if (variant === 'selected') return transfer ? <GlowArc points={transferArc(transfer)} upTo={upTo} /> : null
  return (
    <DashedPath
      capacity={ARC_POINTS}
      version={transfer}
      write={(buf) => {
        if (!transfer) return 0
        const pts = transferArc(transfer)
        buf.set(pts)
        return pts.length / 3
      }}
      color={variant === 'preview' ? '#d9b79b' : '#8a867f'}
      opacity={variant === 'preview' ? 0.95 : 0.7}
      stamp={variant === 'preview' ? 'solar' : undefined}
    />
  )
}
