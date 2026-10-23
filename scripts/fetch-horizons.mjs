// Fetches daily heliocentric state vectors of Earth and Mars from the JPL Horizons API and
// writes them to src/data/generated/ephemeris-{earth,mars}.json.
// Usage: node scripts/fetch-horizons.mjs   (Node 18+, no dependencies)
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const SOURCE = 'NASA/JPL Horizons System (ssd.jpl.nasa.gov)'
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data/generated')
const BODIES = [
  { body: 'earth', command: '399' },
  { body: 'mars', command: '499' },
]
const RETRIES = 3

/** Horizons expects each parameter value wrapped in single quotes. */
function buildUrl(command) {
  const params = {
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: `'NO'`,
    MAKE_EPHEM: `'YES'`,
    EPHEM_TYPE: `'VECTORS'`,
    CENTER: `'500@10'`,
    REF_PLANE: `'ECLIPTIC'`,
    REF_SYSTEM: `'ICRF'`,
    VEC_TABLE: `'2'`,
    OUT_UNITS: `'KM-S'`,
    CSV_FORMAT: `'YES'`,
    START_TIME: `'2026-07-01'`,
    STOP_TIME: `'2029-07-01'`,
    STEP_SIZE: `'1 d'`,
  }
  return `${API}?${new URLSearchParams(params).toString()}`
}

async function fetchWithRetry(url) {
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
      if (json.error) throw new Error(`Horizons error: ${json.error}`)
      if (typeof json.result !== 'string') throw new Error('Horizons response has no result text')
      return json.result
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

/** Parses the CSV rows between $$SOE and $$EOE: JDTDB, Calendar Date, X, Y, Z, VX, VY, VZ. */
function parseVectors(result) {
  const start = result.indexOf('$$SOE')
  const end = result.indexOf('$$EOE')
  if (start < 0 || end < 0 || end < start) throw new Error('No $$SOE…$$EOE block in Horizons output')
  const rows = result
    .slice(start + 5, end)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return rows.map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    const jd = Number(cols[0])
    const vec = cols.slice(2, 8).map(Number)
    if (!Number.isFinite(jd) || vec.length !== 6 || vec.some((x) => !Number.isFinite(x))) {
      throw new Error(`Cannot parse Horizons row: ${line}`)
    }
    return { jd, vec }
  })
}

/** Ephemeris solutions Horizons names in its header, e.g. "Target body name: Mars (499) {source: mar099}". */
function ephemerisSources(result) {
  const tag = (label) => result.match(new RegExp(`${label} body name:.*\\{source: ([^}]+)\\}`))?.[1]?.trim()
  const target = tag('Target')
  const center = tag('Center')
  if (!target || !center) throw new Error('Horizons header does not name its ephemeris sources')
  return `target ephemeris ${target}, center ephemeris ${center}`
}

/** Local calendar date of the run, YYYY-MM-DD. */
function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function fetchBody({ body, command }) {
  const url = buildUrl(command)
  console.log(`Fetching ${body} (${command})…`)
  const result = await fetchWithRetry(url)
  const rows = parseVectors(result)
  if (rows.length < 2) throw new Error(`${body}: only ${rows.length} rows`)
  for (let i = 1; i < rows.length; i++) {
    if (Math.abs(rows[i].jd - rows[i - 1].jd - 1) > 1e-9) {
      throw new Error(`${body}: non-uniform step at row ${i} (${rows[i - 1].jd} → ${rows[i].jd})`)
    }
  }
  const file = {
    body,
    source: `${SOURCE}; ${ephemerisSources(result)}`,
    url,
    fetched: today(),
    center: '500@10',
    frame: 'ecliptic J2000',
    startJd: rows[0].jd,
    stepDays: 1,
    count: rows.length,
    data: rows.flatMap((r) => r.vec),
  }
  await mkdir(OUT_DIR, { recursive: true })
  const out = path.join(OUT_DIR, `ephemeris-${body}.json`)
  await writeFile(out, `${JSON.stringify(file)}\n`)
  console.log(`  wrote ${rows.length} rows to ${path.relative(process.cwd(), out)}`)
}

for (const b of BODIES) {
  await fetchBody(b)
}
