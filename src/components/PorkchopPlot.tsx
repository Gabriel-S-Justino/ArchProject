// The porkchop plot: launch C3 for every departure × arrival date of the window, one Lambert solve
// per cell. Three layers: a canvas heatmap and an SVG of contours and axes, both redrawn only when
// the grid or the plot size changes, and an interaction overlay (crosshair, tooltip, markers) that
// is the only part re-rendering while the pointer moves.
import { contours } from 'd3-contour'
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { transferFor, type PorkchopGrid, type Transfer } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import {
  C3_CONTOURS,
  C3_DISPLAY_MAX,
  HIGH_OKLCH,
  VINF_CONTOURS,
  arrFy,
  cellAt,
  cellCenter,
  cellJds,
  cellValues,
  contourField,
  cssOklch,
  depFx,
  heatmapPixels,
  inPlot,
  monthTicks,
  nearestCell,
  noTransferReason,
  rampOklch,
  sameCell,
  scaleMin,
  stepCell,
  usableTransfer,
  validityPixels,
  placeLabels,
  type Box,
  type Cell,
} from './porkchopScale'
import { formatNumber } from './status'

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

const MARGIN = { top: 10, right: 14, bottom: 46, left: 78 }
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
          <Overlay grid={grid} w={plotW} h={plotH} selected={selected} onHover={onHover} onSelect={onSelect} />
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
          <text
            transform={`translate(${-MARGIN.left + 12},${h / 2}) rotate(-90)`}
            textAnchor="middle"
            fill="var(--ink-3)"
            fontSize={12}
            fontWeight={600}
            letterSpacing="0.045em"
            style={{ fontStretch: '78%' }}
          >
            ARRIVAL AT MARS
          </text>
        </g>
      </g>
    </svg>
  )
})

// ---------------------------------------------------------------------------------------------
// Interaction overlay: crosshair, tooltip, markers, keyboard

interface OverlayProps {
  grid: PorkchopGrid
  w: number
  h: number
  selected: { depJd: number; arrJd: number } | null
  onHover: (t: Transfer | null) => void
  onSelect: (t: Transfer) => void
}

function Overlay({ grid, w, h, selected, onHover, onSelect }: OverlayProps) {
  const [cursor, setCursor] = useState<{ cell: Cell; via: 'pointer' | 'keyboard' } | null>(null)
  const helpId = useId()
  // Lambert solves for the cells visited, so moving back and forth reuses the same Transfer objects.
  const cache = useMemo(() => new Map<number, Transfer | null>(), [grid])
  const transferAt = useCallback(
    (cell: Cell): Transfer | null => {
      const k = cell.iArr * grid.nDep + cell.iDep
      if (cache.has(k)) return cache.get(k) ?? null
      const { depJd, arrJd } = cellJds(grid, cell)
      // Only cells the grid holds as valid are offered, so the plot and the readouts never disagree.
      const t = cellValues(grid, cell) ? usableTransfer(transferFor(depJd, arrJd, grid.spec)) : null
      cache.set(k, t)
      return t
    },
    [grid, cache],
  )

  const moveTo = useCallback(
    (cell: Cell | null, via: 'pointer' | 'keyboard') => {
      setCursor((prev) => {
        if (prev && cell && prev.via === via && sameCell(prev.cell, cell)) return prev
        return cell ? { cell, via } : null
      })
      onHover(cell ? transferAt(cell) : null)
    },
    [onHover, transferAt],
  )
  const lastCell = useRef<Cell | null>(null)

  const cellFromEvent = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect()
    return cellAt(grid, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
  }

  const selectedCell = selected && inPlot(grid, selected.depJd, selected.arrJd) ? selected : null
  const bestCell = nearestCell(grid, grid.best.depJd, grid.best.arrJd)!

  const startCell = (): Cell => {
    if (selectedCell) return nearestCell(grid, selectedCell.depJd, selectedCell.arrJd) ?? bestCell
    return bestCell
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 1
    const from = cursor?.cell ?? startCell()
    let next: Cell | null = null
    switch (e.key) {
      case 'ArrowLeft':
        next = stepCell(grid, from, -step, 0)
        break
      case 'ArrowRight':
        next = stepCell(grid, from, step, 0)
        break
      case 'ArrowUp':
        next = stepCell(grid, from, 0, step)
        break
      case 'ArrowDown':
        next = stepCell(grid, from, 0, -step)
        break
      case 'Home':
        next = bestCell
        break
      case 'Enter':
      case ' ': {
        e.preventDefault()
        const t = transferAt(from)
        if (t) onSelect(t)
        if (!cursor) moveTo(from, 'keyboard')
        return
      }
      case 'Escape':
        moveTo(null, 'keyboard')
        return
      default:
        return
    }
    e.preventDefault()
    moveTo(next, 'keyboard')
  }

  const cur = cursor?.cell ?? null
  const curValues = cur ? cellValues(grid, cur) : null
  const curJds = cur ? cellJds(grid, cur) : null
  const curCenter = cur ? cellCenter(grid, cur) : null
  const cw = w / grid.nDep
  const ch = h / grid.nArr

  const bestPt = { x: depFx(grid, grid.best.depJd) * w, y: arrFy(grid, grid.best.arrJd) * h }
  const selPt = selectedCell ? { x: depFx(grid, selectedCell.depJd) * w, y: arrFy(grid, selectedCell.arrJd) * h } : null
  const selIsBest = selPt !== null && Math.abs(selPt.x - bestPt.x) < 1 && Math.abs(selPt.y - bestPt.y) < 1

  const announce =
    cursor?.via === 'keyboard' && cur && curJds
      ? `Depart ${formatJd(curJds.depJd)}, arrive ${formatJd(curJds.arrJd)}, ${Math.round(curJds.arrJd - curJds.depJd)} days. ` +
        (curValues
          ? `C3 ${formatNumber(curValues.c3, 2)} square kilometres per second squared, arrival v-infinity ${formatNumber(curValues.vInf, 2)} kilometres per second. Press Enter to choose.`
          : `${noTransferReason(grid, cur)}.`)
      : ''

  return (
    <div className="absolute" style={{ left: MARGIN.left, top: MARGIN.top, width: w, height: h + MARGIN.bottom }}>
      <div
        role="application"
        aria-roledescription="porkchop plot"
        aria-label={`Porkchop plot of launch energy C3 for ${grid.nDep} departure dates by ${grid.nArr} arrival dates`}
        aria-describedby={helpId}
        tabIndex={0}
        className={cn(
          'absolute top-0 left-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mars',
          cur && !curValues ? 'cursor-not-allowed' : 'cursor-crosshair',
        )}
        style={{ width: w, height: h }}
        onPointerMove={(e) => {
          const cell = cellFromEvent(e)
          if (sameCell(cell, lastCell.current) && cursor?.via === 'pointer') return
          lastCell.current = cell
          moveTo(cell, 'pointer')
        }}
        onPointerLeave={() => {
          lastCell.current = null
          if (cursor?.via === 'pointer') moveTo(null, 'pointer')
        }}
        onClick={(e) => {
          const cell = cellFromEvent(e)
          const t = cell ? transferAt(cell) : null
          if (t) onSelect(t)
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible') && !cursor) moveTo(startCell(), 'keyboard')
        }}
        onBlur={() => {
          if (cursor?.via === 'keyboard') moveTo(null, 'keyboard')
        }}
        onKeyDown={onKeyDown}
      />
      <p id={helpId} className="sr-only">
        Arrow keys move the crosshair one cell, Shift with an arrow moves five, Home jumps to the minimum C3, Enter chooses
        the transfer. Empty cells have no transfer and cannot be chosen.
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <svg aria-hidden className="pointer-events-none absolute top-0 left-0 overflow-visible" width={w} height={h}>
        {/* minimum C3 */}
        <g transform={`translate(${bestPt.x},${bestPt.y})`}>
          <path d="M0,-6 L6,0 L0,6 L-6,0 Z" fill="var(--ground)" stroke="var(--ink)" strokeWidth={1.5} />
          {!selIsBest && (
            <text x={10} y={-8} className="num" fontSize={12} fontWeight={600} fill="var(--ink)" stroke="var(--ground)" strokeWidth={3} paintOrder="stroke">
              Minimum C3 · {formatNumber(grid.best.c3, 2)}
            </text>
          )}
        </g>
        {/* the player's transfer */}
        {selPt && (
          <g transform={`translate(${selPt.x},${selPt.y})`}>
            <circle r={8} fill="none" stroke="var(--ground)" strokeWidth={4} />
            <circle r={8} fill="none" stroke="var(--accent)" strokeWidth={2} />
            <circle r={2} fill="var(--accent)" />
            <text x={12} y={-10} className="num" fontSize={12} fontWeight={600} fill="var(--accent)" stroke="var(--ground)" strokeWidth={3} paintOrder="stroke">
              {selIsBest ? `Your transfer · minimum C3 ${formatNumber(grid.best.c3, 2)}` : 'Your transfer'}
            </text>
          </g>
        )}
        {/* crosshair */}
        {cur && curCenter && (
          <g>
            <line x1={curCenter.fx * w} x2={curCenter.fx * w} y1={0} y2={h} stroke="var(--ink)" strokeOpacity={0.55} />
            <line x1={0} x2={w} y1={curCenter.fy * h} y2={curCenter.fy * h} stroke="var(--ink)" strokeOpacity={0.55} />
            <rect
              x={cur.iDep * cw - 1}
              y={(grid.nArr - 1 - cur.iArr) * ch - 1}
              width={cw + 2}
              height={ch + 2}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>

      {cur && curJds && curCenter && (
        <>
          <AxisFlag x={curCenter.fx * w} y={h} text={formatJd(curJds.depJd)} axis="x" w={w} />
          <AxisFlag x={0} y={curCenter.fy * h} text={formatJd(curJds.arrJd)} axis="y" w={w} />
          <Tooltip x={curCenter.fx * w} y={curCenter.fy * h} w={w} h={h}>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
              <Row k="Depart" v={formatJd(curJds.depJd)} />
              <Row k="Arrive" v={formatJd(curJds.arrJd)} />
              <Row k="Flight" v={`${formatNumber(curJds.arrJd - curJds.depJd)} days`} />
              {curValues ? (
                <>
                  <Row k="C3" v={`${formatNumber(curValues.c3, curValues.c3 >= 100 ? 0 : 2)} km²/s²`} strong />
                  <Row k="v∞ arrival" v={`${formatNumber(curValues.vInf, 2)} km/s`} />
                </>
              ) : null}
            </dl>
            {curValues ? (
              <p className="mt-1.5 border-t border-rule pt-1.5 text-ink-3">
                {curValues.c3 > C3_DISPLAY_MAX ? 'Very high launch energy. ' : ''}
                {cursor?.via === 'keyboard' ? 'Enter to choose' : 'Click to choose'}
              </p>
            ) : (
              <p className="mt-1.5 max-w-[24ch] border-t border-rule pt-1.5 text-ink-2">{noTransferReason(grid, cur)}</p>
            )}
          </Tooltip>
        </>
      )}
    </div>
  )
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className={cn('text-right', strong ? 'font-semibold text-ink' : 'text-ink')}>{v}</dd>
    </>
  )
}

function Tooltip({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) {
  // Sits up-right of the crosshair, flipping to stay inside the plot.
  const right = x > w * 0.6
  const below = y < h * 0.38
  return (
    <div
      role="presentation"
      className="num pointer-events-none absolute z-10 border border-rule-strong bg-ground-raised px-3 py-2 text-detail whitespace-nowrap"
      style={{
        left: right ? undefined : x + 14,
        right: right ? w - x + 14 : undefined,
        top: below ? y + 14 : undefined,
        bottom: below ? undefined : h - y + 14 + MARGIN.bottom,
      }}
    >
      {children}
    </div>
  )
}

function AxisFlag({ x, y, text, axis, w }: { x: number; y: number; text: string; axis: 'x' | 'y'; w: number }) {
  if (axis === 'x') {
    const left = Math.min(Math.max(x, 44), w - 44)
    return (
      <span
        aria-hidden
        className="num pointer-events-none absolute -translate-x-1/2 bg-ink px-1.5 text-label leading-5 font-semibold whitespace-nowrap text-ground"
        style={{ left, top: y + 9 }}
      >
        {text}
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="num pointer-events-none absolute -translate-y-1/2 bg-ink px-1.5 text-label leading-5 font-semibold whitespace-nowrap text-ground"
      style={{ right: w + 8, top: y }}
    >
      {text}
    </span>
  )
}

// ---------------------------------------------------------------------------------------------
// Legend

/** The key: the C3 scale (log), "very high", "no transfer", the two contour styles and the markers. */
export function PorkchopLegend({ grid, className }: { grid: Pick<PorkchopGrid, 'best'>; className?: string }) {
  const lo = scaleMin(grid)
  const stops = Array.from({ length: 9 }, (_, i) => `${cssOklch(rampOklch(i / 8))} ${(i / 8) * 100}%`).join(', ')
  const pos = (c3: number) => (Math.log(c3 / lo) / Math.log(C3_DISPLAY_MAX / lo)) * 100
  const ticks = [10, 15, 20, 30].filter((v) => v > lo)
  return (
    <div className={cn('flex flex-wrap items-end gap-x-6 gap-y-3 text-detail text-ink-2', className)}>
      <div className="flex flex-col gap-1">
        <span className="label-caps text-ink-3">Launch energy C3, km²/s²</span>
        <div className="flex items-end gap-2">
          <div className="relative w-44">
            <div className="h-2.5" style={{ background: `linear-gradient(90deg, ${stops})` }} />
            <div className="num relative h-4 text-label text-ink-2">
              {ticks.map((t) => (
                <span key={t} className="absolute top-0.5 -translate-x-1/2" style={{ left: `${pos(t)}%` }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-start">
            <div className="h-2.5 w-5" style={{ background: cssOklch(HIGH_OKLCH) }} />
            <span className="num h-4 pt-0.5 text-label text-ink-2">&gt; 40</span>
          </div>
          <div className="flex flex-col items-start">
            <div className="h-2.5 w-5 border border-rule bg-ground-sunken" />
            <span className="h-4 pt-0.5 text-label text-ink-2">none</span>
          </div>
        </div>
      </div>
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pb-4">
        <li className="flex items-center gap-2">
          <svg aria-hidden width="22" height="8">
            <line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink-2)" strokeWidth="1.5" />
          </svg>
          C3 contour
        </li>
        <li className="flex items-center gap-2">
          <svg aria-hidden width="22" height="8">
            <line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink-2)" strokeDasharray="4 3" />
          </svg>
          Arrival v∞, km/s
        </li>
        <li className="flex items-center gap-2">
          <svg aria-hidden width="14" height="14" viewBox="-7 -7 14 14">
            <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
          </svg>
          Minimum C3
        </li>
        <li className="flex items-center gap-2">
          <svg aria-hidden width="16" height="16" viewBox="-8 -8 16 16">
            <circle r="6" fill="none" stroke="var(--accent)" strokeWidth="2" />
            <circle r="1.6" fill="var(--accent)" />
          </svg>
          Your transfer
        </li>
      </ul>
    </div>
  )
}
