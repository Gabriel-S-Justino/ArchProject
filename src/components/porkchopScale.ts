// Pure geometry and colour for the porkchop plot (PorkchopPlot.tsx): the C3 colour scale, the
// mapping between plot coordinates, grid cells and dates, keyboard stepping, contour fields and
// date ticks. No React, no DOM: unit-tested in porkchopScale.test.ts.
//
// Plot coordinates are fractions of the plot area: fx 0 → 1 left to right (departure date),
// fy 0 → 1 top to bottom. Arrival dates increase upward, like every published porkchop plot, so
// the top row is the last arrival date. Cell (iDep, iArr) spans fx ∈ [iDep, iDep + 1] / nDep and
// its value sits at the cell centre (the same convention d3-contour uses for grid values).
import type { PorkchopGrid, Transfer } from '@/physics/porkchop'
import { dateFromJd, jdFromDate } from '@/physics/time'

/** Lower end of the colour scale, km²/s² (the window's minimum is ≈ 9.2). */
export const C3_SCALE_MIN = 8
/**
 * Upper end of the colour scale, km²/s² (ruling R12). Near-180° transfers are valid but need C3 up
 * to ~2,000; a scale stretched to them would flatten the useful island. Cells above this value get
 * one "very high" shade (they stay selectable).
 */
export const C3_DISPLAY_MAX = 40
/** Solid C3 contours, km²/s². */
export const C3_CONTOURS = [8, 10, 12, 15, 20] as const
/** Dashed arrival v∞ contours, km/s. */
export const VINF_CONTOURS = [3, 4, 5, 6] as const

/** Margins of the plot area inside the porkchop figure, px: room for the axes and the arrival-axis title above. */
export const PLOT_MARGIN = { top: 30, right: 14, bottom: 46, left: 78 } as const

export interface Cell {
  iDep: number
  iArr: number
}

export type C3Band = { kind: 'none' } | { kind: 'high' } | { kind: 'scale'; t: number }

/**
 * Where a C3 falls on the log colour scale: 'none' for NaN (no transfer), 'high' above `hi`,
 * otherwise t ∈ [0, 1] with t = 0 at (or below) `lo`.
 */
export function c3Band(c3: number, lo = C3_SCALE_MIN, hi = C3_DISPLAY_MAX): C3Band {
  if (!Number.isFinite(c3)) return { kind: 'none' }
  if (c3 > hi) return { kind: 'high' }
  if (c3 <= lo) return { kind: 'scale', t: 0 }
  return { kind: 'scale', t: Math.log(c3 / lo) / Math.log(hi / lo) }
}

/** OKLCH (L 0–1, C, hue in degrees) → sRGB 0–255, clamped to the gamut. */
export function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  return lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(0, x) ** (1 / 2.4) - 0.055
    return Math.round(255 * Math.min(1, Math.max(0, v)))
  }) as [number, number, number]
}

/**
 * The sequential ramp, one hue (the ink's warm paper hue): bright where launch energy is low (the
 * island the eye should find), dark where it is high. Chroma stays low so the rust accent (the
 * player's own choice) keeps the only strong colour on the plot.
 */
export function rampOklch(t: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t))
  return [0.9 - 0.56 * u, 0.02 + 0.03 * Math.sin(Math.PI * u), 85]
}

/** "Very high" C3 (above C3_DISPLAY_MAX): darker than the ramp's end and cool, so it reads as a separate class. */
export const HIGH_OKLCH: [number, number, number] = [0.255, 0.015, 250]

export function cssOklch([l, c, h]: [number, number, number]): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`
}

/** RGBA for one cell: transparent for no transfer. */
export function c3Rgba(c3: number, lo = C3_SCALE_MIN, hi = C3_DISPLAY_MAX): [number, number, number, number] {
  const band = c3Band(c3, lo, hi)
  if (band.kind === 'none') return [0, 0, 0, 0]
  const [r, g, b] = band.kind === 'high' ? oklchToRgb(...HIGH_OKLCH) : oklchToRgb(...rampOklch(band.t))
  return [r, g, b, 255]
}

/** Lower end of the scale for a grid: C3_SCALE_MIN, or the grid's minimum if that is lower. */
export function scaleMin(grid: Pick<PorkchopGrid, 'best'>): number {
  return Math.min(C3_SCALE_MIN, grid.best.c3)
}

/**
 * The heatmap as RGBA pixels, one per cell, `nDep` wide and `nArr` tall, top row = last arrival.
 * Drawn once per grid and scaled up with nearest-neighbour sampling: every visible block is one
 * Lambert solve.
 */
export function heatmapPixels(grid: Pick<PorkchopGrid, 'nDep' | 'nArr' | 'c3' | 'best'>): Uint8ClampedArray<ArrayBuffer> {
  const { nDep, nArr, c3 } = grid
  const lo = scaleMin(grid)
  const out = new Uint8ClampedArray(nDep * nArr * 4)
  // A small lookup table keeps 10k cells × oklch conversions out of the loop.
  const LUT = 256
  const ramp = Array.from({ length: LUT }, (_, i) => oklchToRgb(...rampOklch(i / (LUT - 1))))
  const high = oklchToRgb(...HIGH_OKLCH)
  for (let iArr = 0; iArr < nArr; iArr++) {
    const row = nArr - 1 - iArr
    for (let iDep = 0; iDep < nDep; iDep++) {
      const band = c3Band(c3[iArr * nDep + iDep]!, lo)
      const o = (row * nDep + iDep) * 4
      if (band.kind === 'none') continue // stays transparent
      const [r, g, b] = band.kind === 'high' ? high : ramp[Math.round(band.t * (LUT - 1))]!
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = 255
    }
  }
  return out
}

/** Mask pixels (white = a transfer exists) in the heatmap's layout, used to keep contour lines off empty cells. */
export function validityPixels(grid: Pick<PorkchopGrid, 'nDep' | 'nArr' | 'c3'>): Uint8ClampedArray<ArrayBuffer> {
  const { nDep, nArr, c3 } = grid
  const out = new Uint8ClampedArray(nDep * nArr * 4)
  for (let iArr = 0; iArr < nArr; iArr++) {
    const row = nArr - 1 - iArr
    for (let iDep = 0; iDep < nDep; iDep++) {
      if (Number.isNaN(c3[iArr * nDep + iDep]!)) continue
      const o = (row * nDep + iDep) * 4
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 255
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Cells, dates and plot coordinates

type Dims = Pick<PorkchopGrid, 'nDep' | 'nArr'>

const clampInt = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** The cell under a plot point (fx, fy ∈ [0, 1], fy from the top); null outside the plot. */
export function cellAt(grid: Dims, fx: number, fy: number): Cell | null {
  if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return null
  const iDep = clampInt(Math.floor(fx * grid.nDep), 0, grid.nDep - 1)
  const iArr = clampInt(grid.nArr - 1 - Math.floor(fy * grid.nArr), 0, grid.nArr - 1)
  return { iDep, iArr }
}

/** Centre of a cell in plot fractions. */
export function cellCenter(grid: Dims, cell: Cell): { fx: number; fy: number } {
  return { fx: (cell.iDep + 0.5) / grid.nDep, fy: (grid.nArr - cell.iArr - 0.5) / grid.nArr }
}

/** Departure and arrival Julian dates of a cell. */
export function cellJds(grid: Pick<PorkchopGrid, 'spec'>, cell: Cell): { depJd: number; arrJd: number } {
  const s = grid.spec
  return { depJd: s.depStartJd + cell.iDep * s.depStepDays, arrJd: s.arrStartJd + cell.iArr * s.arrStepDays }
}

/** The values of a cell, or null where there is no transfer (NaN never leaves this function). */
export function cellValues(
  grid: Pick<PorkchopGrid, 'nDep' | 'nArr' | 'c3' | 'vInf'>,
  cell: Cell,
): { c3: number; vInf: number } | null {
  if (cell.iDep < 0 || cell.iDep >= grid.nDep || cell.iArr < 0 || cell.iArr >= grid.nArr) return null
  const k = cell.iArr * grid.nDep + cell.iDep
  const c3 = grid.c3[k]!
  const vInf = grid.vInf[k]!
  return Number.isFinite(c3) && Number.isFinite(vInf) ? { c3, vInf } : null
}

/** The cell whose dates are nearest to (depJd, arrJd), clamped into the grid; null for non-finite dates. */
export function nearestCell(grid: Pick<PorkchopGrid, 'spec' | 'nDep' | 'nArr'>, depJd: number, arrJd: number): Cell | null {
  if (!Number.isFinite(depJd) || !Number.isFinite(arrJd)) return null
  const s = grid.spec
  return {
    iDep: clampInt(Math.round((depJd - s.depStartJd) / s.depStepDays), 0, grid.nDep - 1),
    iArr: clampInt(Math.round((arrJd - s.arrStartJd) / s.arrStepDays), 0, grid.nArr - 1),
  }
}

/** Whether (depJd, arrJd) lies inside the plotted date ranges (half a cell of slack at each edge). */
export function inPlot(grid: Pick<PorkchopGrid, 'spec'>, depJd: number, arrJd: number): boolean {
  const s = grid.spec
  return (
    depJd >= s.depStartJd - s.depStepDays / 2 &&
    depJd <= s.depEndJd + s.depStepDays / 2 &&
    arrJd >= s.arrStartJd - s.arrStepDays / 2 &&
    arrJd <= s.arrEndJd + s.arrStepDays / 2
  )
}

/** Plot fraction of a departure date (continuous, so off-grid dates land between cells). */
export function depFx(grid: Pick<PorkchopGrid, 'spec' | 'nDep'>, depJd: number): number {
  return ((depJd - grid.spec.depStartJd) / grid.spec.depStepDays + 0.5) / grid.nDep
}

/** Plot fraction (from the top) of an arrival date. */
export function arrFy(grid: Pick<PorkchopGrid, 'spec' | 'nArr'>, arrJd: number): number {
  return 1 - ((arrJd - grid.spec.arrStartJd) / grid.spec.arrStepDays + 0.5) / grid.nArr
}

/**
 * Keyboard stepping: dx moves the departure date (→ later), dy the arrival date (↑ later, so a
 * positive dy moves the crosshair up). Clamped to the grid.
 */
export function stepCell(grid: Dims, cell: Cell, dx: number, dy: number): Cell {
  return {
    iDep: clampInt(cell.iDep + dx, 0, grid.nDep - 1),
    iArr: clampInt(cell.iArr + dy, 0, grid.nArr - 1),
  }
}

export const sameCell = (a: Cell | null, b: Cell | null) =>
  a === b || (a !== null && b !== null && a.iDep === b.iDep && a.iArr === b.iArr)

/** Why a cell has no transfer, in words (for the tooltip and the screen reader). */
export function noTransferReason(grid: Pick<PorkchopGrid, 'spec'>, cell: Cell): string {
  const { depJd, arrJd } = cellJds(grid, cell)
  const tof = arrJd - depJd
  const s = grid.spec
  if (tof < s.minTofDays) return `No transfer: ${Math.round(tof)} days is shorter than the ${s.minTofDays}-day minimum`
  if (tof > s.maxTofDays) return `No transfer: ${Math.round(tof)} days is longer than the ${s.maxTofDays}-day maximum`
  return 'No transfer: the Lambert solver found no orbit between these dates'
}

/** A transfer only if it is a real one (all values finite): what the plot may hand to onHover/onSelect. */
export function usableTransfer(t: Transfer | null): Transfer | null {
  return t && Number.isFinite(t.c3) && Number.isFinite(t.vInfArrKms) && Number.isFinite(t.tofDays) ? t : null
}

// ---------------------------------------------------------------------------------------------
// Contours

/** Fill for "no transfer" cells far from any valid cell: above every threshold. */
const FAR = 1e9

/**
 * A grid as a d3-contour field, padded by one cell on every side with copies of the edge values
 * (so rings close outside the plot instead of tracing its frame). A "no transfer" cell next to
 * valid cells takes the largest of their values, so no threshold falls between them and no line is
 * drawn through a valid cell's centre at the edge of an empty region (the plot masks empty cells,
 * but half of such a line would sit on the valid cell); "no transfer" cells with no valid
 * neighbour get a huge value, so the island's rings never wrap around them.
 * Size (nDep + 2) × (nArr + 2), row 0 = first arrival date. Coordinates d3-contour returns are
 * padded-grid units: subtract 1 to get grid units.
 */
export function contourField(values: Float32Array, nDep: number, nArr: number): Float64Array {
  const filled = new Float64Array(nDep * nArr)
  for (let iArr = 0; iArr < nArr; iArr++) {
    for (let iDep = 0; iDep < nDep; iDep++) {
      const v = values[iArr * nDep + iDep]!
      if (Number.isFinite(v)) {
        filled[iArr * nDep + iDep] = v
        continue
      }
      let max = -Infinity
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const y = iArr + dy
          const x = iDep + dx
          if ((dx === 0 && dy === 0) || y < 0 || y >= nArr || x < 0 || x >= nDep) continue
          const n = values[y * nDep + x]!
          if (Number.isFinite(n) && n > max) max = n
        }
      }
      filled[iArr * nDep + iDep] = Number.isFinite(max) ? max : FAR
    }
  }
  const w = nDep + 2
  const h = nArr + 2
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = filled[clampInt(y - 1, 0, nArr - 1) * nDep + clampInt(x - 1, 0, nDep - 1)]!
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Date axis

export interface DateTick {
  jd: number
  /** "Sep", or "Jan 2027" at the turn of the year and on the first tick. */
  label: string
  major: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** First-of-month ticks in [startJd, endJd], every `every` months, labelled for an axis. */
export function monthTicks(startJd: number, endJd: number, every = 1): DateTick[] {
  const ticks: DateTick[] = []
  const d0 = dateFromJd(startJd)
  if (!Number.isFinite(startJd) || !Number.isFinite(endJd) || Number.isNaN(d0.getTime())) return ticks
  let y = d0.getUTCFullYear()
  let m = d0.getUTCMonth()
  for (let i = 0; i < 240; i++) {
    const jd = jdFromDate(new Date(Date.UTC(y, m, 1)))
    if (jd > endJd) break
    if (jd >= startJd && m % every === 0) {
      const first = ticks.length === 0
      ticks.push({ jd, label: m === 0 || first ? `${MONTHS[m]} ${y}` : MONTHS[m]!, major: m === 0 })
    }
    m += 1
    if (m === 12) {
      m = 0
      y += 1
    }
  }
  return ticks
}

// ---------------------------------------------------------------------------------------------
// Contour labels

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Whether the crosshair through (cx, cy) (a full-width and a full-height line) crosses a box. */
export function crosshairCrosses(cx: number, cy: number, b: Box): boolean {
  return (cx >= b.x && cx <= b.x + b.w) || (cy >= b.y && cy <= b.y + b.h)
}

/**
 * Box of a marker's text label (bold 12 px figures, drawn `dx` right and `dy` above the marker's
 * baseline), estimated from its length: wide enough to keep the crosshair and tooltip off it.
 */
export function markerLabelBox(x: number, y: number, text: string, dx = 10, dy = -8): Box {
  return { x: x + dx - 2, y: y + dy - 12, w: text.length * 7 + 4, h: 16 }
}

/**
 * Top-left corner of the tooltip (w × h) beside the crosshair at (x, y) in a plot of W × H: up-right
 * by default, flipping left near the right edge and below near the top, and then trying the other
 * corners when the preferred one would cover a box in `avoid` (the "Minimum C3" label, the
 * player's marker). Kept inside the plot horizontally; it may hang below it into the axis margin
 * by up to `belowSlack`.
 */
export function tooltipPlacement(
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
  H: number,
  avoid: Box[] = [],
  gap = 14,
  belowSlack = 0,
): { left: number; top: number } {
  const right = x > W * 0.6
  const below = y < H * 0.38
  const at = (r: boolean, b: boolean) => ({ left: r ? x - gap - w : x + gap, top: b ? y + gap : y - gap - h })
  const order: [boolean, boolean][] = [
    [right, below],
    [!right, below],
    [right, !below],
    [!right, !below],
  ]
  const fits = (p: { left: number; top: number }) => p.left >= 0 && p.left + w <= W && p.top >= 0 && p.top + h <= H + belowSlack
  const clear = (p: { left: number; top: number }) => !avoid.some((b) => overlaps(b, { x: p.left, y: p.top, w, h }))
  // Pushed back inside the plot (a corner near an edge slides along it rather than leaving it).
  const inside = (p: { left: number; top: number }) => ({
    left: Math.min(Math.max(p.left, 0), Math.max(0, W - w)),
    top: Math.min(Math.max(p.top, 0), Math.max(0, H + belowSlack - h)),
  })
  const candidates = order.map(([r, b]) => at(r, b))
  return (
    candidates.find((p) => fits(p) && clear(p)) ??
    candidates.map(inside).find(clear) ??
    inside(candidates.find(fits) ?? candidates[0]!)
  )
}

/**
 * One label per contour line: the candidate point with the lowest score whose label box (from
 * `boxAt`) overlaps neither a reserved box nor an earlier label. Lines are labelled in the order
 * given; a line with no free spot gets null.
 */
export function placeLabels(
  lines: { level: number; points: [number, number][] }[],
  score: (x: number, y: number) => number,
  boxAt: (x: number, y: number, level: number) => Box,
  reserved: Box[],
): Map<number, { x: number; y: number }> {
  const taken = [...reserved]
  const out = new Map<number, { x: number; y: number }>()
  for (const line of lines) {
    const ranked = line.points
      .map(([x, y]) => ({ x, y, s: score(x, y) }))
      .filter((p) => Number.isFinite(p.s))
      .sort((a, b) => a.s - b.s)
    const pick = ranked.find((p) => !taken.some((b) => overlaps(b, boxAt(p.x, p.y, line.level))))
    if (pick) {
      out.set(line.level, { x: pick.x, y: pick.y })
      taken.push(boxAt(pick.x, pick.y, line.level))
    }
  }
  return out
}
