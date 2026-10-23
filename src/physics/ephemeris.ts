// Heliocentric states of Earth and Mars from JPL Horizons daily vectors (ecliptic J2000, Sun
// centre), fetched ahead of time by scripts/fetch-horizons.mjs. Between samples the state is a
// cubic Hermite interpolant of the two bracketing positions and velocities.
import earthFile from '@/data/generated/ephemeris-earth.json'
import marsFile from '@/data/generated/ephemeris-mars.json'
import { DAY } from './constants'
import type { StateVector } from './vec'

export type Body = 'earth' | 'mars'

/** Shape of src/data/generated/ephemeris-*.json. */
export interface EphemerisFile {
  body: Body
  source: string
  url: string
  fetched: string
  center: '500@10'
  frame: 'ecliptic J2000'
  startJd: number
  stepDays: 1
  count: number
  /** Flat rows of x, y, z (km), vx, vy, vz (km/s). */
  data: number[]
}

const FILES = {
  earth: earthFile as EphemerisFile,
  mars: marsFile as EphemerisFile,
} satisfies Record<Body, EphemerisFile>

const endJd = (f: EphemerisFile) => f.startJd + (f.count - 1) * f.stepDays

/** Julian Dates covered by every body's ephemeris (inclusive). */
export const EPHEMERIS_RANGE: { startJd: number; endJd: number } = {
  startJd: Math.max(FILES.earth.startJd, FILES.mars.startJd),
  endJd: Math.min(endJd(FILES.earth), endJd(FILES.mars)),
}

/**
 * Heliocentric position (m) and velocity (m/s) of a body at a Julian Date, ecliptic J2000.
 * Throws RangeError outside EPHEMERIS_RANGE. Hot path for the porkchop plot: index arithmetic
 * only, no allocation beyond the returned state.
 */
export function bodyState(body: Body, jd: number): StateVector {
  if (!(jd >= EPHEMERIS_RANGE.startJd && jd <= EPHEMERIS_RANGE.endJd)) {
    throw new RangeError(
      `No ${body} ephemeris for JD ${jd}; coverage is ${EPHEMERIS_RANGE.startJd}–${EPHEMERIS_RANGE.endJd}`,
    )
  }
  const { data, startJd, stepDays, count } = FILES[body]
  const x = (jd - startJd) / stepDays
  const i = Math.min(Math.floor(x), count - 2)
  const t = x - i
  const h = stepDays * DAY // s

  // Hermite basis functions and their derivatives with respect to t.
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = (t3 - 2 * t2 + t) * h
  const h01 = 3 * t2 - 2 * t3
  const h11 = (t3 - t2) * h
  const d00 = (6 * t2 - 6 * t) / h
  const d10 = 3 * t2 - 4 * t + 1
  const d01 = -d00
  const d11 = 3 * t2 - 2 * t

  // Row i holds x, y, z, vx, vy, vz (km, km/s); row i + 1 follows it. Output is SI (× 1000).
  const a = 6 * i
  const x0 = data[a]!, y0 = data[a + 1]!, z0 = data[a + 2]!
  const vx0 = data[a + 3]!, vy0 = data[a + 4]!, vz0 = data[a + 5]!
  const x1 = data[a + 6]!, y1 = data[a + 7]!, z1 = data[a + 8]!
  const vx1 = data[a + 9]!, vy1 = data[a + 10]!, vz1 = data[a + 11]!
  return {
    r: [
      1000 * (h00 * x0 + h10 * vx0 + h01 * x1 + h11 * vx1),
      1000 * (h00 * y0 + h10 * vy0 + h01 * y1 + h11 * vy1),
      1000 * (h00 * z0 + h10 * vz0 + h01 * z1 + h11 * vz1),
    ],
    v: [
      1000 * (d00 * x0 + d10 * vx0 + d01 * x1 + d11 * vx1),
      1000 * (d00 * y0 + d10 * vy0 + d01 * y1 + d11 * vy1),
      1000 * (d00 * z0 + d10 * vz0 + d01 * z1 + d11 * vz1),
    ],
  }
}
