// Rocket equation helpers. Masses in any consistent unit (kg in this app), Isp in s.
import { G0 } from './constants'

/** Tsiolkovsky: Δv = Isp·g0·ln(m0/mf). Returns 0 unless m0 > mf > 0. */
export function deltaV(isp: number, m0: number, mf: number): number {
  return mf > 0 && m0 > mf ? isp * G0 * Math.log(m0 / mf) : 0
}

/**
 * Propellant mass needed to give a vehicle of dry mass `dryKg` a burn of `dv` m/s:
 * dry·(e^(dv/(isp·g0)) − 1). Returns 0 for dv ≤ 0 and Infinity when isp ≤ 0 (no engine);
 * callers must check isFinite before displaying.
 */
export function propellantFor(dv: number, isp: number, dryKg: number): number {
  if (dv <= 0) return 0
  if (isp <= 0) return Infinity
  return dryKg * (Math.exp(dv / (isp * G0)) - 1)
}

/**
 * Propellant a vehicle of current total mass `massKg` burns for a burn of `dv` m/s:
 * m0·(1 − e^(−dv/(isp·g0))). Returns 0 for dv ≤ 0 (or NaN) and Infinity when isp ≤ 0 (no engine)
 * or dv is not finite; callers compare it with the propellant on board.
 */
export function propellantFromMass(dv: number, isp: number, massKg: number): number {
  if (!(dv > 0)) return 0
  if (!(isp > 0) || !Number.isFinite(dv)) return Infinity
  return massKg * (1 - Math.exp(-dv / (isp * G0)))
}
