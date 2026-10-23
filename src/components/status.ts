// Status semantics shared by Readout, Gauge and Checklist. Colour is never the only signal: every
// status also prints its word.
export type Status = 'ok' | 'warn' | 'bad'

export const STATUS_WORD: Record<Status, string> = {
  ok: 'GO',
  warn: 'CAUTION',
  bad: 'NO-GO',
}

/** Text colour class per status. */
export const STATUS_TEXT: Record<Status, string> = {
  ok: 'text-go',
  warn: 'text-caution',
  bad: 'text-nogo',
}

/** Fill colour class per status (bars, ticks). */
export const STATUS_FILL: Record<Status, string> = {
  ok: 'bg-go',
  warn: 'bg-caution',
  bad: 'bg-nogo',
}

/** Rule (border) colour class per status. */
export const STATUS_RULE: Record<Status, string> = {
  ok: 'border-go',
  warn: 'border-caution',
  bad: 'border-nogo',
}

/**
 * A distance for a readout: under 0.1 km it reads "< 0.1" (a corrected approach is metres off, and
 * "0" would look like a missing number), under 10 km with one decimal, otherwise whole km.
 */
export function distanceKm(km: number): { value: number | string; digits: number } {
  if (Number.isFinite(km) && km >= 0 && km < 0.1) return { value: '< 0.1', digits: 0 }
  return { value: km, digits: Number.isFinite(km) && km < 10 ? 1 : 0 }
}

/** en-US number with `digits` decimals and thousands separators; "–" for NaN/±Infinity. */
export function formatNumber(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return '–'
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
