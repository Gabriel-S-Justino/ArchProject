// Power and radio-link scaling with distance. Pure functions; every helper returns 0 (never
// NaN/Infinity) for inputs that make no physical sense, so readouts stay clean.
import { C } from './constants'

const ok = (...xs: number[]) => xs.every((x) => Number.isFinite(x))

/** Solar array output at `rAU` from the Sun given its output at 1 AU: P / r² (inverse-square law). */
export function solarPowerW(powerAt1AU: number, rAU: number): number {
  if (!ok(powerAt1AU, rAU) || rAU <= 0) return 0
  return powerAt1AU / (rAU * rAU)
}

/**
 * Downlink rate at an Earth distance of `dAU` given the rate at 1 AU: R / d². Received power falls
 * with the square of the distance and, at a fixed bit-error rate, the data rate falls with it.
 */
export function dataRateMbps(rateAt1AU: number, dAU: number): number {
  if (!ok(rateAt1AU, dAU) || dAU <= 0) return 0
  return rateAt1AU / (dAU * dAU)
}

/** One-way light time over `dMeters`, s. */
export function signalDelayS(dMeters: number): number {
  if (!ok(dMeters) || dMeters < 0) return 0
  return dMeters / C
}

/**
 * Solar conjunction: with Mars within 3° of the Sun as seen from Earth, solar plasma corrupts the
 * radio link and missions stop commanding (real practice; NASA "Mars solar conjunction").
 */
export function solarConjunction(sunEarthMarsAngleDeg: number): boolean {
  return Number.isFinite(sunEarthMarsAngleDeg) && sunEarthMarsAngleDeg < 3
}

/**
 * Hours per day a Deep Space Network antenna is tracking the spacecraft. Game balance: one ~8 h
 * pass per day, typical of a Mars orbiter sharing the DSN with other missions.
 */
export const DSN_CONTACT_HOURS_PER_DAY = 8

/**
 * Data returned over `days` at `rateMbps`, Gbit: rate × 3600 s × DSN_CONTACT_HOURS_PER_DAY × days
 * / 1000 (ruling R15). Game balance: the real link rate in Mbit/s turns into Gbit per ops turn
 * through the assumed daily contact time.
 */
export function dataVolumeGb(rateMbps: number, days: number): number {
  if (!ok(rateMbps, days) || rateMbps <= 0 || days <= 0) return 0
  return (rateMbps * 3600 * DSN_CONTACT_HOURS_PER_DAY * days) / 1000
}
