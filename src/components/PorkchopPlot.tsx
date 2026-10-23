// The porkchop plot: launch C3 for every departure × arrival date of the window, one Lambert solve
// per cell. Three layers: a canvas heatmap and an SVG of contours and axes, both redrawn only when
// the grid or the plot size changes, and an interaction overlay (crosshair, tooltip, markers) that
// is the only part re-rendering while the pointer moves.
import { contours } from 'd3-contour'
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { PorkchopGrid, Transfer } from '@/physics/porkchop'
import { PorkchopOverlay } from './PorkchopOverlay'
import {
  C3_CONTOURS,
  PLOT_MARGIN as MARGIN,
  VINF_CONTOURS,
  arrFy,
  cellAt,
  cellValues,
  contourField,
  depFx,
  heatmapPixels,
  monthTicks,
  placeLabels,
  validityPixels,
  type Box,
} from './porkchopScale'

export { PorkchopLegend } from './PorkchopLegend'

export interface PorkchopPlotProps {
  grid: PorkchopGrid
  /** The chosen dates (drawn as the rust marker); null when none is chosen. */
  selected: { depJd: number; arrJd: number } | null
  /** The transfer under the pointer or keyboard cursor; null over an empty cell or off the plot. */
  onHover: (transfer: Transfer | null) => void
  /** A cell with a transfer was clicked or chosen with Enter. Empty cells are never passed. */
  onSelect: (transfer: Transfer) => void
  className?: string
}

const MIN_PLOT_H = 280
const MAX_PLOT_H = 520

/** Height of the plot area for a width: the arrival axis spans ~2.4× the departure axis in days. */
function plotHeight(plotW: number) {
  return Math.round(Math.min(MAX_PLOT_H, Math.max(MIN_PLOT_H, plotW * 0.64)))
}

export function PorkchopPlot({ grid, selected, onHover, onSelect, className }: PorkchopPlotProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      setWidth((prev) => (prev === w ? prev : w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotH = plotHeight(plotW)
  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      {plotW > 0 && (
        <div className="relative" style={{ height: plotH + MARGIN.top + MARGIN.bottom }}>
          <Heatmap grid={grid} w={plotW} h={plotH} />
          <StaticSvg grid={grid} w={plotW} h={plotH} />
          <PorkchopOverlay grid={grid} w={plotW} h={plotH} selected={selected} onHover={onHover} onSelect={onSelect} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Heatmap (canvas)

const Heatmap = memo(function Heatmap({ grid, w, h }: { grid: PorkchopGrid; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // One pixel per cell, built once per grid.
  const cells = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = grid.nDep
    c.height = grid.nArr
    c.getContext('2d')?.putImageData(new ImageData(heatmapPixels(grid), grid.nDep, grid.nArr), 0, 0)
    return c
  }, [grid])
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1)
  useEffect(() => {
    // Moving the window to a screen with another pixel ratio redraws at the new sharpness.
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = () => setDpr(window.devicePixelRatio || 1)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [dpr])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.imageSmoothingEnabled = false // every block is one Lambert solve: keep the cells honest
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(cells, 0, 0, canvas.width, canvas.height)
  }, [cells, w, h, dpr])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="absolute bg-ground-sunken"
      style={{ left: MARGIN.left, top: MARGIN.top, width: w, height: h }}
    />
  )
})

// ---------------------------------------------------------------------------------------------
// Contours, frame and axes (SVG)

interface ContourPath {
  level: number
  d: string
  /** Points of the line inside the plot and over cells with a transfer: where a label may sit. */
  points: [number, number][]
}

function contourPaths(grid: PorkchopGrid, values: Float32Array, levels: readonly number[], w: number, h: number): ContourPath[] {
  const field = contourField(values, grid.nDep, grid.nArr)
  const gen = contours().size([grid.nDep + 2, grid.nArr + 2]).thresholds(levels as number[])
  const sx = w / grid.nDep
  const sy = h / grid.nArr
  const px = (x: number) => (x - 1) * sx
  const py = (y: number) => h - (y - 1) * sy
  const pad = 24
  return gen(Array.from(field)).map((geo) => {
    let d = ''
    const points: [number, number][] = []
    for (const polygon of geo.coordinates) {
      for (const ring of polygon) {
        ring.forEach(([x, y], i) => {
          const X = px(x!)
          const Y = py(y!)
          d += `${i === 0 ? 'M' : 'L'}${X.toFixed(1)},${Y.toFixed(1)}`
          if (X > pad && X < w - pad && Y > pad && Y < h - pad) {
            const cell = cellAt(grid, X / w, Y / h)
            if (cell && cellValues(grid, cell)) points.push([X, Y])
          }
        })
        d += 'Z'
      }
    }
    return { level: geo.value, d, points }
  })
}

const StaticSvg = memo(function StaticSvg({ grid, w, h }: { grid: PorkchopGrid; w: number; h: number }) {
  const uid = useId().replace(/:/g, '')
  const maskUrl = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = grid.nDep
    c.height = grid.nArr
    c.getContext('2d')?.putImageData(new ImageData(validityPixels(grid), grid.nDep, grid.nArr), 0, 0)
    return c.toDataURL()
  }, [grid])
  const c3Lines = useMemo(() => contourPaths(grid, grid.c3, C3_CONTOURS, w, h), [grid, w, h])
  const vInfLines = useMemo(() => contourPaths(grid, grid.vInf, VINF_CONTOURS, w, h), [grid, w, h])
  // Labels: C3 values in a row where the lines cross the minimum's row, left of it (like the
  // handbook figures); v∞ values at the right end of each dashed line. Neither may cover the
  // "Minimum C3" marker and its label (drawn by the overlay) or each other.
  const labels = useMemo(() => {
    const bx = depFx(grid, grid.best.depJd) * w
    const by = arrFy(grid, grid.best.arrJd) * h
    const reserved: Box[] = [
      { x: bx - 10, y: by - 10, w: 20, h: 20 },
      { x: bx + 6, y: by - 24, w: 200, h: 20 },
    ]
    const c3 = placeLabels(
      c3Lines,
      (x, y) => (x < bx - 12 ? Math.abs(y - by) + 0.01 * (bx - x) : 1e6 - y),
      (x, y) => ({ x: x - 9, y: y - 7, w: 18, h: 14 }),
      reserved,
    )
    const vInf = placeLabels(
      vInfLines,
      (x) => -x,
      (x, y) => ({ x: x - 46, y: y - 16, w: 48, h: 14 }),
      [...reserved, ...[...c3.values()].map((p) => ({ x: p.x - 9, y: p.y - 7, w: 18, h: 14 }))],
    )
    return { c3, vInf }
  }, [grid, w, h, c3Lines, vInfLines])

  const s = grid.spec
  const depTicks = useMemo(() => monthTicks(s.depStartJd - s.depStepDays / 2, s.depEndJd + s.depStepDays / 2), [s])
  const arrTicks = useMemo(
    () => monthTicks(s.arrStartJd - s.arrStepDays / 2, s.arrEndJd + s.arrStepDays / 2, h / 12 < 28 ? 2 : 1),
    [s, h],
  )

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={w + MARGIN.left + MARGIN.right}
      height={h + MARGIN.top + MARGIN.bottom}
    >
      <defs>
        <clipPath id={`clip-${uid}`}>
          <rect width={w} height={h} />
        </clipPath>
        <mask id={`mask-${uid}`} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <image href={maskUrl} width={w} height={h} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />
        </mask>
      </defs>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        <g clipPath={`url(#clip-${uid})`} mask={`url(#mask-${uid})`} fill="none">
          {/* Arrival v∞: dashed light lines on a dark halo, so they read on bright and dark cells alike. */}
          {vInfLines.map((c) => (
            <g key={`v${c.level}`}>
              <path d={c.d} stroke="var(--ground)" strokeOpacity={0.55} strokeWidth={3} strokeLinejoin="round" />
              <path d={c.d} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="4 3" strokeLinejoin="round" />
            </g>
          ))}
          {/* C3: solid dark lines (the island they ring is bright). */}
          {c3Lines.map((c) => (
            <path key={`c${c.level}`} d={c.d} stroke="var(--ground)" strokeWidth={1.25} strokeOpacity={0.85} strokeLinejoin="round" />
          ))}
        </g>
        <g className="num" fontSize={11} style={{ fontStretch: '88%' }}>
          {[...labels.c3].map(
            ([level, p]) =>
              p && (
                <text key={`lc${level}`} x={p.x} y={p.y + 4} textAnchor="middle" fill="var(--ground)" fontWeight={600}>
                  {level}
                </text>
              ),
          )}
          {[...labels.vInf].map(
            ([level, p]) =>
              p && (
                <text
                  key={`lv${level}`}
                  x={p.x}
                  y={p.y - 4}
                  textAnchor="end"
                  fill="var(--ink)"
                  stroke="var(--ground)"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {level} km/s
                </text>
              ),
          )}
        </g>

        {/* frame */}
        <rect width={w} height={h} fill="none" stroke="var(--rule-strong)" />

        {/* departure axis */}
        <g transform={`translate(0,${h})`} className="num" fontSize={12} fill="var(--ink-2)">
          {depTicks.map((t) => {
            const x = depFx(grid, t.jd) * w
            return (
              <g key={t.jd} transform={`translate(${x},0)`}>
                <line y2={t.major ? 7 : 5} stroke={t.major ? 'var(--ink-3)' : 'var(--rule-strong)'} />
                <text y={20} textAnchor="middle" fill={t.major ? 'var(--ink)' : 'var(--ink-2)'}>
                  {t.label}
                </text>
              </g>
            )
          })}
          <text x={w / 2} y={40} textAnchor="middle" fill="var(--ink-3)" fontSize={12} fontWeight={600} letterSpacing="0.045em" style={{ fontStretch: '78%' }}>
            DEPARTURE FROM EARTH
          </text>
        </g>

        {/* arrival axis */}
        <g className="num" fontSize={12} fill="var(--ink-2)">
          {arrTicks.map((t) => {
            const y = arrFy(grid, t.jd) * h
            return (
              <g key={t.jd} transform={`translate(0,${y})`}>
                <line x2={t.major ? -7 : -5} stroke={t.major ? 'var(--ink-3)' : 'var(--rule-strong)'} />
                <text x={-10} y={4} textAnchor="end" fill={t.major ? 'var(--ink)' : 'var(--ink-2)'}>
                  {t.label}
                </text>
              </g>
            )
          })}
          {/* Set above the axis, not along it: the date flag that follows the crosshair runs down the
              tick labels and would cover a rotated title. */}
          <text x={-MARGIN.left} y={-14} fill="var(--ink-3)" fontSize={12} fontWeight={600} letterSpacing="0.045em" style={{ fontStretch: '78%' }}>
            ARRIVAL AT MARS
          </text>
        </g>
      </g>
    </svg>
  )
})
