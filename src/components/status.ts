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

/** en-US number with `digits` decimals and thousands separators; "–" for NaN/±Infinity. */
export function formatNumber(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return '–'
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
