// DOM labels over a canvas, in the plate's type (DESIGN.md: caps label, detail line), moved each
// rendered frame to the screen position of a 3D anchor. No drei Html: one absolutely positioned div
// per label, written through refs, so a frame never re-renders React.
import { useFrame } from '@react-three/fiber'
import { useMemo, type RefObject } from 'react'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

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

/** Inside the Canvas: projects every label's anchor each rendered frame. */
export function LabelProjector({ items, els }: { items: SceneLabel[]; els: RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  // Mount after the camera rig (same priority, subscription order); refresh the camera's matrices
  // so the labels sit where this frame draws the bodies.
  useFrame(({ camera, size }) => {
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
      el.style.transform =
        l.side === 'left'
          ? `translate(${(x - 9).toFixed(1)}px, ${(y + 9).toFixed(1)}px) translateX(-100%)`
          : l.side === 'below'
            ? `translate(${x.toFixed(1)}px, ${(y + 12).toFixed(1)}px) translateX(-50%)`
            : `translate(${(x + 9).toFixed(1)}px, ${(y - 9).toFixed(1)}px) translateY(-100%)`
    }
  })
  return null
}
