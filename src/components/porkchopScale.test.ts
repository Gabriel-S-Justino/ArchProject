import { describe, expect, it } from 'vitest'
import { computePorkchop, DEFAULT_PORKCHOP, transferFor, type PorkchopGrid } from '@/physics/porkchop'
import { jdFromIso } from '@/physics/time'
import {
  C3_DISPLAY_MAX,
  arrFy,
  c3Band,
  c3Rgba,
  cellAt,
  cellCenter,
  cellJds,
  cellValues,
  contourField,
  depFx,
  heatmapPixels,
  monthTicks,
  nearestCell,
  noTransferReason,
  oklchToRgb,
  placeLabels,
  stepCell,
  usableTransfer,
  validityPixels,
} from './porkchopScale'

/** A 3 × 2 toy grid: departures 0..2 (step 2 d), arrivals 0..1 (step 3 d), one NaN cell, one huge cell. */
function toy(): PorkchopGrid {
  const nan = Number.NaN
  return {
    spec: { ...DEFAULT_PORKCHOP, depStartJd: 100, depEndJd: 104, depStepDays: 2, arrStartJd: 300, arrEndJd: 303, arrStepDays: 3 },
    nDep: 3,
    nArr: 2,
    // row iArr = 0: [10, 20, NaN]; row iArr = 1: [12, 2000, 9]
    c3: new Float32Array([10, 20, nan, 12, 2000, 9]),
    vInf: new Float32Array([3, 4, nan, 3.5, 30, 2.8]),
    best: { depJd: 104, arrJd: 303, c3: 9 },
  }
}

describe('c3 colour scale', () => {
  it('maps NaN to none, values above the display max to high, the rest log-linearly to 0..1', () => {
    expect(c3Band(Number.NaN)).toEqual({ kind: 'none' })
    expect(c3Band(Number.POSITIVE_INFINITY)).toEqual({ kind: 'none' })
    expect(c3Band(C3_DISPLAY_MAX + 0.01)).toEqual({ kind: 'high' })
    expect(c3Band(2000)).toEqual({ kind: 'high' })
    expect(c3Band(5)).toEqual({ kind: 'scale', t: 0 })
    expect(c3Band(40)).toEqual({ kind: 'scale', t: 1 })
    const mid = c3Band(Math.sqrt(8 * 40)) // geometric mean → middle of a log scale
    expect(mid.kind).toBe('scale')
    if (mid.kind === 'scale') expect(mid.t).toBeCloseTo(0.5, 10)
  })

  it('is brighter for lower C3 and transparent where there is no transfer', () => {
    const lum = ([r, g, b]: number[]) => r! + g! + b!
    expect(lum(c3Rgba(10))).toBeGreaterThan(lum(c3Rgba(20)))
    expect(lum(c3Rgba(20))).toBeGreaterThan(lum(c3Rgba(39)))
    expect(c3Rgba(Number.NaN)[3]).toBe(0)
    expect(c3Rgba(500)[3]).toBe(255)
    // "very high" differs from the darkest scale colour
    expect(c3Rgba(500)).not.toEqual(c3Rgba(40))
  })

  it('converts OKLCH to sRGB (white, black, the ground token)', () => {
    expect(oklchToRgb(1, 0, 0)).toEqual([255, 255, 255])
    expect(oklchToRgb(0, 0, 0)).toEqual([0, 0, 0])
    const [r, g, b] = oklchToRgb(0.175, 0.009, 250)
    expect(Math.max(r, g, b)).toBeLessThan(30)
    expect(b).toBeGreaterThanOrEqual(r)
  })

  it('draws one pixel per cell with the last arrival on top and NaN cells transparent', () => {
    const g = toy()
    const px = heatmapPixels(g)
    expect(px.length).toBe(3 * 2 * 4)
    // top row is iArr = 1: [12, 2000, 9]; bottom row iArr = 0: [10, 20, NaN]
    // (the heatmap uses a 256-step lookup table: within 2 levels of the exact colour)
    const exact = c3Rgba(12, 8)
    Array.from(px.slice(0, 4)).forEach((v, i) => expect(Math.abs(v - exact[i]!)).toBeLessThanOrEqual(2))
    expect(Array.from(px.slice(4, 8))).toEqual(c3Rgba(2000))
    expect(px[(1 * 3 + 2) * 4 + 3]).toBe(0)
    const mask = validityPixels(g)
    expect(mask[(1 * 3 + 2) * 4 + 3]).toBe(0)
    expect(mask[3]).toBe(255)
  })
})

describe('cell picking', () => {
  const g = toy()

  it('finds the cell under a point, arrival increasing upward', () => {
    expect(cellAt(g, 0, 0)).toEqual({ iDep: 0, iArr: 1 })
    expect(cellAt(g, 0.99, 0.99)).toEqual({ iDep: 2, iArr: 0 })
    expect(cellAt(g, 1, 1)).toEqual({ iDep: 2, iArr: 0 })
    expect(cellAt(g, 0.5, 0.25)).toEqual({ iDep: 1, iArr: 1 })
    expect(cellAt(g, -0.01, 0.5)).toBeNull()
    expect(cellAt(g, 0.5, Number.NaN)).toBeNull()
  })

  it('round-trips cells through their centres and their dates', () => {
    for (let iDep = 0; iDep < 3; iDep++) {
      for (let iArr = 0; iArr < 2; iArr++) {
        const c = { iDep, iArr }
        const { fx, fy } = cellCenter(g, c)
        expect(cellAt(g, fx, fy)).toEqual(c)
        const { depJd, arrJd } = cellJds(g, c)
        expect(nearestCell(g, depJd, arrJd)).toEqual(c)
        expect(depFx(g, depJd)).toBeCloseTo(fx, 12)
        expect(arrFy(g, arrJd)).toBeCloseTo(fy, 12)
      }
    }
  })

  it('returns values only for cells with a transfer (no NaN escapes)', () => {
    expect(cellValues(g, { iDep: 0, iArr: 0 })).toEqual({ c3: 10, vInf: 3 })
    expect(cellValues(g, { iDep: 2, iArr: 0 })).toBeNull()
    expect(cellValues(g, { iDep: 5, iArr: 0 })).toBeNull()
    expect(cellValues(g, { iDep: 1, iArr: 1 })?.c3).toBe(2000) // huge but valid: still selectable
  })

  it('steps with the keyboard and stays inside the grid', () => {
    expect(stepCell(g, { iDep: 0, iArr: 0 }, 1, 1)).toEqual({ iDep: 1, iArr: 1 })
    expect(stepCell(g, { iDep: 0, iArr: 0 }, -1, -1)).toEqual({ iDep: 0, iArr: 0 })
    expect(stepCell(g, { iDep: 2, iArr: 1 }, 5, 5)).toEqual({ iDep: 2, iArr: 1 })
  })

  it('explains empty cells', () => {
    const short = { ...g, spec: { ...g.spec, minTofDays: 250 } }
    expect(noTransferReason(short, { iDep: 0, iArr: 0 })).toMatch(/shorter than the 250-day minimum/)
    const long = { ...g, spec: { ...g.spec, maxTofDays: 100 } }
    expect(noTransferReason(long, { iDep: 0, iArr: 0 })).toMatch(/longer than the 100-day maximum/)
  })

  it('nearestCell rejects non-finite dates', () => {
    expect(nearestCell(g, Number.NaN, 300)).toBeNull()
  })
})

describe('contour field', () => {
  it('pads with edge copies and fills NaN above every threshold', () => {
    const g = toy()
    const f = contourField(g.c3, g.nDep, g.nArr)
    expect(f.length).toBe(5 * 4)
    // padded row 1 = iArr 0: [10 | 10, 20, NaN→1e9 | 1e9]
    expect(Array.from(f.slice(5, 10))).toEqual([10, 10, 20, 1e9, 1e9])
    // padded row 0 copies row iArr 0
    expect(Array.from(f.slice(0, 5))).toEqual([10, 10, 20, 1e9, 1e9])
    expect(f.every((v) => Number.isFinite(v))).toBe(true)
  })
})

describe('real grid', () => {
  it('the grid cell of the minimum and transferFor with the grid limits agree', () => {
    const grid = computePorkchop()
    const cell = nearestCell(grid, grid.best.depJd, grid.best.arrJd)!
    expect(cellJds(grid, cell)).toEqual({ depJd: grid.best.depJd, arrJd: grid.best.arrJd })
    const v = cellValues(grid, cell)!
    const t = usableTransfer(transferFor(grid.best.depJd, grid.best.arrJd, grid.spec))!
    expect(t.c3).toBeCloseTo(v.c3, 3)
    expect(t.vInfArrKms).toBeCloseTo(v.vInf, 4)
  })
})

describe('month ticks', () => {
  it('labels the first tick and January with the year', () => {
    const ticks = monthTicks(jdFromIso('2026-09-01T00:00:00Z'), jdFromIso('2027-01-31T00:00:00Z'))
    expect(ticks.map((t) => t.label)).toEqual(['Sep 2026', 'Oct', 'Nov', 'Dec', 'Jan 2027'])
    expect(ticks.at(-1)!.major).toBe(true)
    expect(monthTicks(Number.NaN, 1)).toEqual([])
  })

  it('thins to every n-th month', () => {
    const ticks = monthTicks(jdFromIso('2027-04-01T00:00:00Z'), jdFromIso('2028-03-31T00:00:00Z'), 2)
    expect(ticks.map((t) => t.label)).toEqual(['May 2027', 'Jul', 'Sep', 'Nov', 'Jan 2028', 'Mar'])
  })
})

describe('contour labels', () => {
  const box = (x: number, y: number) => ({ x: x - 5, y: y - 5, w: 10, h: 10 })
  it('takes the best-scoring free spot and avoids reserved boxes and earlier labels', () => {
    const lines = [
      { level: 1, points: [[0, 0], [50, 0], [100, 0]] as [number, number][] },
      { level: 2, points: [[2, 2], [60, 0]] as [number, number][] },
    ]
    const placed = placeLabels(lines, (x) => x, box, [{ x: -10, y: -10, w: 20, h: 20 }])
    expect(placed.get(1)).toEqual({ x: 50, y: 0 }) // (0,0) is reserved
    expect(placed.get(2)).toEqual({ x: 60, y: 0 }) // (2,2) reserved; 60 is clear of the label at 50
  })
  it('leaves a line unlabelled when nothing is free', () => {
    const placed = placeLabels([{ level: 1, points: [[0, 0]] }], () => 0, box, [{ x: -10, y: -10, w: 20, h: 20 }])
    expect(placed.has(1)).toBe(false)
  })
})
