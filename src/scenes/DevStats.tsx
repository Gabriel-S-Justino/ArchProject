// Development only: per-frame draw calls, triangles and fps of a canvas on window.__scene3d[name],
// for the browser checks (Task 14). Renders nothing; absent from production builds' behaviour.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

interface SceneStats {
  calls: number
  maxCalls: number
  triangles: number
  fps: number
  frames: number
  /** Longest frame since the 10th, ms (hitches: shader compiles, texture uploads). */
  worstMs: number
}

declare global {
  interface Window {
    __scene3d?: Record<string, SceneStats>
  }
}

export function DevStats({ name }: { name: string }) {
  const gl = useThree((s) => s.gl)
  const last = useRef({ t: performance.now(), n: 0, prev: 0 })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    gl.info.autoReset = false
    window.__scene3d ??= {}
    window.__scene3d[name] = { calls: 0, maxCalls: 0, triangles: 0, fps: 0, frames: 0, worstMs: 0 }
    return () => {
      gl.info.autoReset = true
      if (window.__scene3d) delete window.__scene3d[name]
    }
  }, [gl, name])
  // Runs first in each frame: the counters hold everything the previous frame drew (all passes).
  useFrame(() => {
    if (!import.meta.env.DEV) return
    const s = window.__scene3d?.[name]
    if (!s) return
    s.calls = gl.info.render.calls
    s.maxCalls = Math.max(s.maxCalls, s.calls)
    s.triangles = gl.info.render.triangles
    s.frames++
    gl.info.reset()
    const now = performance.now()
    if (s.frames > 10 && last.current.prev > 0) s.worstMs = Math.max(s.worstMs, now - last.current.prev)
    last.current.prev = now
    last.current.n++
    if (now - last.current.t >= 1000) {
      s.fps = (last.current.n * 1000) / (now - last.current.t)
      last.current = { t: now, n: 0, prev: now }
    }
  }, -100)
  return null
}
