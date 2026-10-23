// Seeded pseudo-random numbers for every random game event, so a seed (the `?seed=` dev flag)
// replays a mission exactly. mulberry32: 32-bit state, period 2³², plenty for a game.
// Framework-free: no React, Three.js or DOM.

/** A generator of uniform numbers in [0, 1). The seed is taken modulo 2³² (non-finite → 0). */
export function createRng(seed: number): () => number {
  let a = (Number.isFinite(seed) ? seed : 0) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
