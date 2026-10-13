export type Rng = () => number;

/** mulberry32: small, fast, deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of the seed and parts, so each draw has its own stream. */
export function deriveSeed(seed: number, ...parts: (string | number)[]): number {
  const text = [seed, ...parts].join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function rngFor(seed: number, ...parts: (string | number)[]): Rng {
  return mulberry32(deriveSeed(seed, ...parts));
}

export function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}
