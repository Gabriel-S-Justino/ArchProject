// DOM labels over a canvas, in the plate's type (DESIGN.md: caps label, detail line), moved each
// rendered frame to the screen position of a 3D anchor. No drei Html: one absolutely positioned div
// per label, written through refs, so a frame never re-renders React.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'
import { placeLabel, type Rect } from './labelPlace'

export interface SceneLabel {
  key: string
  title: string
  detail?: string
  tone?: 'ink' | 'accent' | 'muted'
  /** Where the label sits relative to its anchor (default above right). */
  side?: 'left' | 'right' | 'below'
  /** Writes the anchor's world position into `out`; false hides the label. */
  at: (out: THREE.Vector3) => boolean
}

export function LabelLayer({ items, els }: { items: SceneLabel[]; els: RefObject<(HTMLDivElement | null)[]> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((l, i) => (
        <div key={l.key} ref={(el) => void (els.current[i] = el)} className={cn('absolute top-0 left-0 whitespace-nowrap', l.side === 'left' && 'text-right', l.side === 'below' && 'text-center')} style={{ visibility: 'hidden' }}>
          <span className={cn('label-caps block', l.tone === 'accent' ? 'text-mars' : l.tone === 'muted' ? 'text-ink-3' : 'text-ink-2')}>{l.title}</span>
          {l.detail && <span className="num block text-detail text-ink-3">{l.detail}</span>}
        </div>
      ))}
    </div>
  )
}

/** Overlays in a view's slot marked with this attribute are kept free of labels (captions, insets, buttons). */
export const LABEL_AVOID_ATTR = 'data-label-avoid'

/**
 * Inside the Canvas: projects every label's anchor each rendered frame. `root` is the view's
 * wrapper: elements marked LABEL_AVOID_ATTR inside its parent (the slot) are measured, relative to
 * it, and labels are placed off them. Label sizes and those rectangles are measured when the view
 * changes size, when the web fonts finish loading and when an overlay resizes, never per frame.
 */
export function LabelProjector({ items, els, root }: { items: SceneLabel[]; els: RefObject<(HTMLDivElement | null)[]>; root?: RefObject<HTMLElement | null> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  const invalidate = useThree((s) => s.invalidate)
  // Mount after the camera rig (same priority, subscription order); refresh the camera's matrices
  // so the labels sit where this frame draws the bodies.
  const sizes = useMemo<([number, number] | undefined)[]>(() => [], [items])
  const state = useMemo(() => ({ dirty: true, w: 0, h: 0, avoid: [] as Rect[], last: [] as string[] }), [])
  useEffect(() => {
    state.dirty = true
    const remeasure = () => {
      state.dirty = true
      invalidate()
    }
    let alive = true
    document.fonts?.ready.then(() => alive && remeasure())
    const slot = root?.current?.parentElement
    const ro = typeof ResizeObserver !== 'undefined' && slot ? new ResizeObserver(remeasure) : null
    slot?.querySelectorAll(`[${LABEL_AVOID_ATTR}]`).forEach((el) => ro?.observe(el))
    return () => {
      alive = false
      ro?.disconnect()
    }
  }, [items, root, state, invalidate])

  useFrame(({ camera, size }) => {
    if (size.width !== state.w || size.height !== state.h) {
      state.w = size.width
      state.h = size.height
      state.dirty = true
    }
    if (state.dirty) {
      state.dirty = false
      sizes.length = 0
      const wrap = root?.current
      const slot = wrap?.parentElement
      state.avoid = []
      if (wrap && slot) {
        const base = wrap.getBoundingClientRect()
        slot.querySelectorAll(`[${LABEL_AVOID_ATTR}]`).forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) state.avoid.push({ x: r.left - base.left - 2, y: r.top - base.top - 2, w: r.width + 4, h: r.height + 4 })
        })
      }
    }
    camera.updateMatrixWorld()
    for (let i = 0; i < items.length; i++) {
      const el = els.current[i]
      const l = items[i]
      if (!el || !l) continue
      if (!l.at(v)) {
        el.style.visibility = 'hidden'
        continue
      }
      v.project(camera)
      const inside = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
      el.style.visibility = inside ? 'visible' : 'hidden'
      if (!inside) continue
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      // Label size, measured when marked dirty (reading it every frame would force a layout per label).
      if (!sizes[i]) sizes[i] = [el.offsetWidth, el.offsetHeight]
      const [w, h] = sizes[i]!
      const pos = placeLabel(l.side ?? 'right', x, y, w, h, size.width, size.height, state.avoid)
      const t = `translate(${pos[0].toFixed(1)}px, ${pos[1].toFixed(1)}px)`
      // Only touch the style when the label moved (a still view writes nothing).
      if (state.last[i] !== t) {
        state.last[i] = t
        el.style.transform = t
      }
    }
  })
  return null
}
