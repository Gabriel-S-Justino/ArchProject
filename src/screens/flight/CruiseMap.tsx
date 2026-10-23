// The 2D stand-in for the cruise scene (Task 15 mounts the 3D one in the same slot): a top-down
// view of the inner solar system in the ecliptic, to scale. Earth's and Mars' orbits are propagated
// from their JPL Horizons states; the Lambert arc is the planned transfer; the ship, Earth and Mars
// sit at their real positions on the current mission date. AimTarget zooms into Mars on the arrival
// date: where the ship will be if nothing changes.
import { memo, useMemo } from 'react'
import { formatNumber } from '@/components/status'
import { CAPTURE_MAX_MISS_KM, type CruiseState } from '@/game/cruise'
import { AU, DAY, MU_SUN, R_MARS } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import { propagate, sampleTrajectory } from '@/physics/kepler'
import type { Transfer } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import { cross, dot, norm, normalize, sub, type Vec3 } from '@/physics/vec'

/** SVG units per AU. */
const U = 100
const EARTH_YEAR_DAYS = 365.256
const MARS_YEAR_DAYS = 686.98

const px = (r: Vec3) => `${(r[0] / AU) * U},${(-r[1] / AU) * U}`
const path = (pts: Vec3[]) => (pts.length ? `M${pts.map(px).join('L')}` : '')

/** Orbits and the planned arc depend only on the transfer: computed once per transfer. */
const Backdrop = memo(function Backdrop({ transfer }: { transfer: Transfer }) {
  const { earth, mars, arc } = useMemo(() => {
    const e0 = bodyState('earth', transfer.depJd)
    const m0 = bodyState('mars', transfer.depJd)
    return {
      earth: path(sampleTrajectory(e0, MU_SUN, EARTH_YEAR_DAYS * DAY, 181)),
      mars: path(sampleTrajectory(m0, MU_SUN, MARS_YEAR_DAYS * DAY, 241)),
      arc: path(sampleTrajectory({ r: transfer.r1, v: transfer.v1 }, MU_SUN, transfer.tofDays * DAY, 161)),
    }
  }, [transfer])
  return (
    <g>
      {/* 1 AU and 1.5 AU reference circles */}
      <circle r={U} fill="none" stroke="var(--rule)" strokeWidth={0.4} strokeDasharray="1 3" />
      <path d={earth} fill="none" stroke="var(--rule-strong)" strokeWidth={0.6} />
      <path d={mars} fill="none" stroke="var(--rule-strong)" strokeWidth={0.6} />
      <path d={arc} fill="none" stroke="var(--ink-3)" strokeWidth={0.7} strokeDasharray="2 2" />
      <circle r={2.6} fill="var(--ink)" />
      <text x={4} y={-4} fontSize={7} fill="var(--ink-3)">
        Sun
      </text>
    </g>
  )
})

export function CruiseMap({ sim, transfer }: { sim: CruiseState; transfer: Transfer }) {
  const earth = bodyState('earth', sim.jd).r
  const mars = bodyState('mars', sim.jd).r
  const marsArr = transfer.r2
  // The rest of the flight if nothing changes, from the ship's real state.
  const ahead = path(sampleTrajectory(sim.ship, MU_SUN, Math.max(0, sim.arrJd - sim.jd) * DAY, 48))
  // The flown part, drawn along the planned arc (the deviations are thousands of km: invisible at this scale).
  const frac = Math.min(1, Math.max(0, (sim.jd - sim.depJd) / (sim.arrJd - sim.depJd)))
  const flown = path(
    sampleTrajectory({ r: transfer.r1, v: transfer.v1 }, MU_SUN, frac * transfer.tofDays * DAY, Math.max(2, Math.round(frac * 80))),
  )
  const label = (r: Vec3, text: string, dx = 6, dy = -6, anchor: 'start' | 'end' = 'start') => (
    <text x={(r[0] / AU) * U + dx} y={(-r[1] / AU) * U + dy} fontSize={7.5} fill="var(--ink-2)" textAnchor={anchor}>
      {text}
    </text>
  )
  const P = (r: Vec3) => ({ cx: (r[0] / AU) * U, cy: (-r[1] / AU) * U })
  const ship = P(sim.ship.r)

  return (
    <svg
      viewBox="-172 -172 344 344"
      className="h-full w-full"
      role="img"
      aria-label={`Top-down view of the transfer on ${formatJd(sim.jd)}: the spacecraft is ${formatNumber(norm(sim.ship.r) / AU, 2)} AU from the Sun, ${formatNumber(norm(sub(sim.ship.r, mars)) / AU, 2)} AU from Mars.`}
    >
      <Backdrop transfer={transfer} />
      <path d={flown} fill="none" stroke="var(--accent)" strokeWidth={1.4} />
      <path d={ahead} fill="none" stroke="var(--accent)" strokeWidth={0.9} strokeDasharray="3 2.5" opacity={0.75} />
      {/* Mars on the arrival date */}
      <circle {...P(marsArr)} r={5} fill="none" stroke="var(--ink-3)" strokeWidth={0.6} strokeDasharray="1.5 1.5" />
      {label(marsArr, `Mars on ${formatJd(sim.arrJd)}`, 8, 12)}
      <circle {...P(earth)} r={3.4} fill="var(--ink-2)" />
      {label(earth, 'Earth')}
      <circle {...P(mars)} r={2.9} fill="var(--ink)" />
      {label(mars, 'Mars')}
      <g transform={`translate(${ship.cx},${ship.cy}) rotate(45)`}>
        <rect x={-2.6} y={-2.6} width={5.2} height={5.2} fill="var(--accent)" />
      </g>
      {label(sim.ship.r, 'Spacecraft', -7, -7, 'end')}
      <g transform="translate(-164,160)" fontSize={6.5} fill="var(--ink-3)">
        <line x1={0} x2={U / 2} y1={0} y2={0} stroke="var(--ink-3)" strokeWidth={0.5} />
        <line x1={0} x2={0} y1={-2} y2={2} stroke="var(--ink-3)" strokeWidth={0.5} />
        <line x1={U / 2} x2={U / 2} y1={-2} y2={2} stroke="var(--ink-3)" strokeWidth={0.5} />
        <text x={U / 2 + 4} y={2.2}>
          0.5 AU · ecliptic plane, seen from the north
        </text>
      </g>
    </svg>
  )
}

/**
 * The 2D stand-in for the trajectory tab's 3D preview: the transfer under the pointer (or the chosen
 * one) with Earth and Mars on its departure date and Mars on its arrival date.
 */
export function TransferMap({ transfer }: { transfer: Transfer | null }) {
  if (!transfer) {
    return <p className="absolute inset-0 grid place-items-center px-6 text-center text-detail text-ink-3">Hover the porkchop plot to draw a transfer here.</p>
  }
  const earth = bodyState('earth', transfer.depJd).r
  const mars = bodyState('mars', transfer.depJd).r
  const P = (r: Vec3) => ({ cx: (r[0] / AU) * U, cy: (-r[1] / AU) * U })
  return (
    <svg viewBox="-172 -172 344 344" className="h-full w-full" role="img" aria-label={`Top-down view of the ${formatNumber(transfer.tofDays)}-day transfer from ${formatJd(transfer.depJd)} to ${formatJd(transfer.arrJd)}.`}>
      <Backdrop transfer={transfer} />
      <circle {...P(transfer.r2)} r={5} fill="none" stroke="var(--ink-3)" strokeWidth={0.6} strokeDasharray="1.5 1.5" />
      <circle {...P(earth)} r={3.4} fill="var(--ink-2)" />
      <circle {...P(mars)} r={2.9} fill="var(--ink)" />
    </svg>
  )
}

/** Where the ship will be relative to Mars on the arrival date (km), in the plane across the approach. */
export function arrivalOffsetKm(sim: CruiseState): { x: number; y: number; missKm: number } {
  const s = propagate(sim.ship, MU_SUN, Math.max(0, sim.arrJd - sim.jd) * DAY)
  const m = bodyState('mars', sim.arrJd)
  const d = sub(s.r, m.r)
  const missKm = norm(d) / 1000
  const v = sub(s.v, m.v)
  if (!Number.isFinite(missKm) || norm(v) === 0) return { x: 0, y: 0, missKm: Number.isFinite(missKm) ? missKm : Infinity }
  const a = normalize(cross([0, 0, 1], v))
  const b = cross(normalize(v), a)
  const x = dot(d, a)
  const y = dot(d, b)
  const len = Math.hypot(x, y)
  // Direction from the cross-plane components; length is the full distance (it includes along-track).
  return len > 0 ? { x: (x / len) * missKm, y: (y / len) * missKm, missKm } : { x: missKm, y: 0, missKm }
}

/** log10(km) of the target's centre and rim. */
const LOG_MIN = 3
const LOG_MAX = 7
const rOf = (km: number, R: number) => (R * (Math.log10(Math.max(10 ** LOG_MIN, km)) - LOG_MIN)) / (LOG_MAX - LOG_MIN)

/**
 * A target centred on Mars on the arrival date, on a log distance scale: Mars itself, the
 * 10,000 km capture limit, and the ship's predicted distance. A TCM pulls the dot inside the ring.
 */
export function AimTarget({ sim, className }: { sim: CruiseState; className?: string }) {
  const { x, y, missKm } = arrivalOffsetKm(sim)
  const R = 46
  const r = Math.min(R, rOf(missKm, R))
  const k = missKm > 0 ? r / missKm : 0
  const inside = missKm <= CAPTURE_MAX_MISS_KM
  return (
    <svg
      viewBox="-62 -62 124 136"
      className={className}
      role="img"
      aria-label={`On the arrival date the spacecraft will be ${formatNumber(missKm)} km from Mars' centre; capture needs ${formatNumber(CAPTURE_MAX_MISS_KM)} km or less.`}
    >
      {[4, 5, 6].map((lg) => (
        <circle key={lg} r={rOf(10 ** lg, R)} fill="none" stroke="var(--rule)" strokeWidth={0.5} />
      ))}
      <circle r={R} fill="none" stroke="var(--rule-strong)" strokeWidth={0.5} />
      <circle r={rOf(R_MARS / 1000, R)} fill="var(--ink-3)" />
      <circle r={rOf(CAPTURE_MAX_MISS_KM, R)} fill="none" stroke={inside ? 'var(--go)' : 'var(--ink-2)'} strokeWidth={0.8} />
      <text x={0} y={-rOf(CAPTURE_MAX_MISS_KM, R) - 2} fontSize={8} fill="var(--ink-3)" textAnchor="middle">
        10,000 km
      </text>
      <text x={0} y={-rOf(1e6, R) - 2} fontSize={8} fill="var(--ink-3)" textAnchor="middle">
        1 million km
      </text>
      <g transform={`translate(${x * k},${-y * k}) rotate(45)`}>
        <rect x={-2.2} y={-2.2} width={4.4} height={4.4} fill="var(--accent)" />
      </g>
      <text x={0} y={66} fontSize={8} fill="var(--ink-3)" textAnchor="middle">
        Mars on arrival day · log scale
      </text>
    </svg>
  )
}
