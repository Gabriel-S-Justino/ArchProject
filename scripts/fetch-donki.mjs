// Fetches 2024 solar flares from NASA DONKI (Space Weather Database Of Notifications, Knowledge,
// Information) and writes the M- and X-class ones to src/data/generated/donki-flares.json.
//
// Usage:
//   node scripts/fetch-donki.mjs                 live API: (1) api.nasa.gov, then (2) CCMC direct
//   node scripts/fetch-donki.mjs --from-wayback  (3) archived DONKI responses on web.archive.org
//
// (1) https://api.nasa.gov/DONKI/FLR (NASA_API_KEY env var, falls back to DEMO_KEY)
// (2) https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR (the CCMC service behind api.nasa.gov)
// Each live source is retried 3x with exponential backoff. If both fail the script exits with an
// error and never writes invented events. Mode (3) is a documented manual fallback: it reads
// Wayback Machine snapshots of real DONKI FLR responses (the same NASA data, archived) and records
// the snapshot timestamps in the output's `source` field. Node 18+, no dependencies.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const START = '2024-01-01'
const END = '2024-12-31'
const OUT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/data/generated/donki-flares.json',
)
const RETRIES = 3

const LIVE_SOURCES = [
  {
    name: 'NASA DONKI via api.nasa.gov',
    url: `https://api.nasa.gov/DONKI/FLR?startDate=${START}&endDate=${END}&api_key=${process.env.NASA_API_KEY ?? 'DEMO_KEY'}`,
  },
  {
    name: 'NASA DONKI via CCMC (kauai.ccmc.gsfc.nasa.gov)',
    url: `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=${START}&endDate=${END}`,
  },
]

// Wayback Machine snapshots of the CCMC DONKI FLR endpoint. Called with unparsable dates, DONKI
// returns its default window (the 30 days before the request), so each snapshot is a real DONKI
// response for one 30-day window of 2024. Found with the CDX API:
//   http://web.archive.org/cdx/search/cdx?url=kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR&matchType=prefix&from=2024&to=202501
// No snapshot of a full-year 2024 query exists (checked 2026-10-22).
const WAYBACK_TARGET =
  'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd'
const WAYBACK_SNAPSHOTS = ['20240615145942', '20241128153255', '20250114183851']
const waybackUrl = (ts) => `http://web.archive.org/web/${ts}id_/${WAYBACK_TARGET}`

/** Local calendar date YYYY-MM-DD (same convention as fetch-horizons.mjs). */
function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Strips the api_key query value so keys never land in the repo. */
const redact = (url) => url.replace(/api_key=[^&]*/, 'api_key=REDACTED')

async function fetchJsonWithRetry(url) {
  let lastError
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = 2000 * 2 ** (attempt - 1)
      console.warn(`  retry ${attempt}/${RETRIES} in ${delay} ms (${lastError.message})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      const json = await res.json()
      if (!Array.isArray(json)) throw new Error('DONKI response is not an array')
      return json
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

/** Keeps M- and X-class flares peaking inside [START, END], de-duplicated by flrID, sorted by peak. */
function selectFlares(raw) {
  const byId = new Map()
  for (const f of raw) {
    if (typeof f?.flrID !== 'string' || typeof f.peakTime !== 'string') continue
    if (typeof f.classType !== 'string' || !/^[MX]\d/.test(f.classType)) continue
    const day = f.peakTime.slice(0, 10)
    if (day < START || day > END) continue
    byId.set(f.flrID, {
      id: f.flrID,
      peakTime: f.peakTime,
      classType: f.classType,
      ...(f.sourceLocation ? { sourceLocation: f.sourceLocation } : {}),
      link: f.link,
    })
  }
  return [...byId.values()].sort((a, b) => a.peakTime.localeCompare(b.peakTime))
}

async function fromLive() {
  const errors = []
  for (const src of LIVE_SOURCES) {
    console.log(`Fetching ${src.name} …`)
    try {
      const raw = await fetchJsonWithRetry(src.url)
      return { source: src.name, url: redact(src.url), raw }
    } catch (err) {
      console.warn(`  ${src.name} failed: ${err.message}`)
      errors.push(`${src.name}: ${err.message}`)
    }
  }
  throw new Error(
    `All live DONKI sources failed:\n  ${errors.join('\n  ')}\n` +
      'No events were written. If the outage persists, run the documented fallback:\n' +
      '  node scripts/fetch-donki.mjs --from-wayback',
  )
}

async function fromWayback() {
  const raw = []
  for (const ts of WAYBACK_SNAPSHOTS) {
    console.log(`Fetching Wayback snapshot ${ts} …`)
    raw.push(...(await fetchJsonWithRetry(waybackUrl(ts))))
  }
  return {
    source: `NASA DONKI via web.archive.org snapshots ${WAYBACK_SNAPSHOTS.join(', ')} (CCMC DONKI FLR default 30-day windows; partial 2024 coverage)`,
    url: WAYBACK_SNAPSHOTS.map(waybackUrl).join(' '),
    raw,
  }
}

async function main() {
  const wayback = process.argv.includes('--from-wayback')
  const { source, url, raw } = wayback ? await fromWayback() : await fromLive()
  const flares = selectFlares(raw)
  if (flares.length === 0) throw new Error('DONKI returned no M/X flares; refusing to write an empty file')
  const out = {
    source,
    url,
    fetched: localDate(),
    // The date filter applied, not the coverage: Wayback snapshots cover only ~30-day windows.
    // src/data/donki.ts derives the real coverage windows from the flares.
    range: { start: START, end: END },
    filter: 'classType M or X',
    count: flares.length,
    flares,
  }
  await mkdir(path.dirname(OUT_FILE), { recursive: true })
  await writeFile(OUT_FILE, `${JSON.stringify(out, null, 1)}\n`)
  const x = flares.filter((f) => f.classType.startsWith('X')).length
  console.log(`Wrote ${flares.length} flares (${x} X-class, ${flares.length - x} M-class) from ${source}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
