// Julian Date helpers. The game treats TDB as UTC (the ~69 s offset is ignored).

/** Julian Date of the J2000 epoch, 2000-01-01T12:00:00Z. */
export const J2000_JD = 2451545.0

/** Julian Date of the Unix epoch, 1970-01-01T00:00:00Z. */
const UNIX_EPOCH_JD = 2440587.5
const MS_PER_DAY = 86400000

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function jdFromDate(d: Date): number {
  return d.getTime() / MS_PER_DAY + UNIX_EPOCH_JD
}

export function dateFromJd(jd: number): Date {
  return new Date((jd - UNIX_EPOCH_JD) * MS_PER_DAY)
}

/** JD for an ISO 8601 string; NaN when the string cannot be parsed. */
export function jdFromIso(iso: string): number {
  return jdFromDate(new Date(iso))
}

/** Calendar date of a JD in UTC, e.g. "16 Nov 2026"; "Invalid date" for NaN/out-of-range JDs. */
export function formatJd(jd: number): string {
  const d = dateFromJd(jd)
  if (Number.isNaN(d.getTime())) return 'Invalid date'
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
