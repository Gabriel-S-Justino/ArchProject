// Shared helpers for the Task 15 canvases: whether the view is on screen in a visible tab (the
// canvas stops drawing otherwise), a redraw when it comes back, easing, and dev-only stats.
import { useThree } from '@react-three/fiber'
import { useEffect, useState, type RefObject } from 'react'

/** True while the element intersects the viewport and the document is visible. */
export function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [onScreen, setOnScreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const el = ref.current
    const vis = () => setTabVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', vis)
    let io: IntersectionObserver | undefined
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => setOnScreen(e?.isIntersecting ?? true), { threshold: 0.01 })
      io.observe(el)
    }
    return () => {
      io?.disconnect()
      document.removeEventListener('visibilitychange', vis)
    }
  }, [ref])
  return onScreen && tabVisible
}

/** Exponential ease-out (DESIGN.md: cubic-bezier(0.16, 1, 0.3, 1) family). */
export const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * Math.max(0, t)))

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Dev only: per-scene numbers on window.__scene3d[name] for the browser checks. */
export function devStat(name: string, key: string, value: number): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return
  const s = window.__scene3d?.[name] as unknown as Record<string, number> | undefined
  if (s) s[key] = value
}

/** Inside a Canvas: draws a frame whenever `value` changes (e.g. the view comes back on screen). */
export function InvalidateOn({ value }: { value: unknown }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate(), [value, invalidate])
  return null
}
