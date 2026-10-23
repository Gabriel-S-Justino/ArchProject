// Ground structures as single merged geometries (one draw call each): a lattice service tower
// (launch pad) and the hangar's gantry. Stylised, generic, no markings.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rx) g.rotateX(rx)
  if (rz) g.rotateZ(rz)
  g.translate(x, y, z)
  return g
}

/** A square lattice tower, base at y = 0: four legs, a ring every bay and X bracing on every face. */
export function latticeTowerGeometry(height: number, width = 6, bay = 6): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const h = Math.max(bay, height)
  const half = width / 2
  const leg = 0.42
  const t = 0.16
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(leg, h, leg, sx * half, h / 2, sz * half))
  const bays = Math.max(1, Math.round(h / bay))
  const bh = h / bays
  const diag = Math.hypot(width, bh)
  const ang = Math.atan2(bh, width)
  for (let i = 0; i < bays; i++) {
    const y0 = i * bh
    const ym = y0 + bh / 2
    // Ring at the top of the bay.
    for (const s of [-1, 1]) {
      parts.push(box(width, t * 1.4, t * 1.4, 0, y0 + bh, s * half))
      parts.push(box(t * 1.4, t * 1.4, width, s * half, y0 + bh, 0))
    }
    // X bracing on the four faces.
    for (const s of [-1, 1]) {
      for (const sign of [-1, 1]) {
        parts.push(box(diag, t, t, 0, ym, s * half, 0, sign * ang))
        parts.push(box(t, t, diag, s * half, ym, 0, sign * ang, 0))
      }
    }
  }
  const g = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return g
}

/** Launch mount: a square deck with an open centre over the flame trench, on four legs, top at y = 0. */
export function launchMountGeometry(innerHalf: number, depth: number): THREE.BufferGeometry {
  const w = 2.6
  const outer = innerHalf + w
  const parts = [
    box(outer * 2, 1.2, w, 0, -0.6, innerHalf + w / 2),
    box(outer * 2, 1.2, w, 0, -0.6, -innerHalf - w / 2),
    box(w, 1.2, innerHalf * 2, innerHalf + w / 2, -0.6, 0),
    box(w, 1.2, innerHalf * 2, -innerHalf - w / 2, -0.6, 0),
  ]
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(1.6, depth, 1.6, sx * (outer - 0.8), -depth / 2, sz * (outer - 0.8)))
  const g = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return g
}

/** Thin lightning masts on a ring around the pad, base at y = 0. */
export function mastsGeometry(height: number, ringR: number, n = 3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.6
    const c = new THREE.CylinderGeometry(0.35, 0.8, height, 8)
    c.translate(Math.cos(a) * ringR, height / 2, Math.sin(a) * ringR)
    parts.push(c)
  }
  const g = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return g
}
