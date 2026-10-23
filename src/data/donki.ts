// Typed access to the pre-fetched NASA DONKI solar flares (scripts/fetch-donki.mjs).
// No network access at runtime: the JSON is bundled.
//
// Coverage: the file was built from three archived DONKI responses (Wayback Machine snapshots of
// the CCMC FLR endpoint, each its default ~30-day window), not from a full-year query. The JSON's
// `range` is the date filter the script applied (2024-01-01 → 2024-12-31); the real coverage is
// derived here from the flares themselves so the provenance text can never overstate it.
import type { DonkiFlare } from '@/game/types'
import data from '@/data/generated/donki-flares.json'

export const DONKI_FLARES: DonkiFlare[] = data.flares

/** One contiguous stretch of DONKI coverage, YYYY-MM-DD (UTC) inclusive, with its flare count. */
export interface DonkiWindow {
  start: string
  end: string
  count: number
}

/**
 * Flares more than this many days apart belong to different coverage windows. DONKI's default
 * query window is 30 days and the snapshots are months apart, so 10 days separates them cleanly
 * while M/X flares inside one active window are never that far apart.
 */
const WINDOW_GAP_DAYS = 10

/** Contiguous coverage windows of the flare list, in time order. */
export function coverageWindows(flares: DonkiFlare[]): DonkiWindow[] {
  const times = flares.map((f) => f.peakTime).sort()
  const windows: DonkiWindow[] = []
  let prev = NaN
  for (const t of times) {
    const ms = Date.parse(t)
    const day = t.slice(0, 10)
    const last = windows[windows.length - 1]
    if (last && ms - prev <= WINDOW_GAP_DAYS * 86_400_000) {
      last.end = day
      last.count++
    } else {
      windows.push({ start: day, end: day, count: 1 })
    }
    prev = ms
  }
  return windows
}

const WINDOWS = coverageWindows(DONKI_FLARES)

export const DONKI_META: {
  source: string
  url: string
  fetched: string
  /** First and last flare date actually in the data (not the requested filter range). */
  range: { start: string; end: string }
  /** Date filter the fetch script applied (the full year it asked for). */
  requestedRange: { start: string; end: string }
  /** Real coverage: the contiguous windows the flares fall in. */
  windows: DonkiWindow[]
  filter: string
  count: number
} = {
  source: data.source,
  url: data.url,
  fetched: data.fetched,
  range: { start: WINDOWS[0]?.start ?? data.range.start, end: WINDOWS[WINDOWS.length - 1]?.end ?? data.range.end },
  requestedRange: data.range,
  windows: WINDOWS,
  filter: data.filter,
  count: data.count,
}
