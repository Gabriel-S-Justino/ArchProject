// The porkchop plot's interaction layer: crosshair, tooltip, axis flags, the minimum-C3 and
// player's markers, and keyboard picking. The only part of the plot that re-renders while the
// pointer moves (PorkchopPlot.tsx draws the heatmap, contours and axes once per grid and size).
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { transferFor, type PorkchopGrid, type Transfer } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import {
  C3_DISPLAY_MAX,
  PLOT_MARGIN as MARGIN,
  arrFy,
  cellAt,
  cellCenter,
  cellJds,
  cellValues,
  crosshairCrosses,
  depFx,
  inPlot,
  markerLabelBox,
  nearestCell,
  noTransferReason,
  sameCell,
  stepCell,
  tooltipPlacement,
  usableTransfer,
  type Box,
  type Cell,
} from './porkchopScale'
import { formatNumber } from './status'

export interface OverlayProps {
  grid: PorkchopGrid
  w: number
  h: number
  selected: { depJd: number; arrJd: number } | null
  onHover: (t: Transfer | null) => void
  onSelect: (t: Transfer) => void
}

/** Tooltip size before it has been measured once, px. */
const TOOLTIP_GUESS = { w: 196, h: 118 }

export function PorkchopOverlay({ grid, w, h, selected, onHover, onSelect }: OverlayProps) {
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
  // The grid can hold a value where the solver, asked again, gives no usable transfer: never promise a choice then.
  const curTransfer = cur && curValues ? transferAt(cur) : null
  const curJds = cur ? cellJds(grid, cur) : null
  const curCenter = cur ? cellCenter(grid, cur) : null
  const cw = w / grid.nDep
  const ch = h / grid.nArr
  const cx = curCenter ? curCenter.fx * w : 0
  const cy = curCenter ? curCenter.fy * h : 0

  const bestPt = { x: depFx(grid, grid.best.depJd) * w, y: arrFy(grid, grid.best.arrJd) * h }
  const selPt = selectedCell ? { x: depFx(grid, selectedCell.depJd) * w, y: arrFy(grid, selectedCell.arrJd) * h } : null
  const selIsBest = selPt !== null && Math.abs(selPt.x - bestPt.x) < 1 && Math.abs(selPt.y - bestPt.y) < 1
  const bestText = `Minimum C3 · ${formatNumber(grid.best.c3, 2)}`
  const selText = selIsBest ? `Your transfer · minimum C3 ${formatNumber(grid.best.c3, 2)}` : 'Your transfer'
  const bestBox = selIsBest ? null : markerLabelBox(bestPt.x, bestPt.y, bestText)
  const selBox = selPt ? markerLabelBox(selPt.x, selPt.y, selText, 12, -10) : null
  // A marker's label steps aside while the crosshair runs through it (the tooltip carries the numbers).
  const hideBest = !!(cur && bestBox && crosshairCrosses(cx, cy, bestBox))
  const hideSel = !!(cur && selBox && crosshairCrosses(cx, cy, selBox))

  // The tooltip: measured after its first showing, placed off the marker labels still shown.
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipSize, setTipSize] = useState(TOOLTIP_GUESS)
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!el) return
    const size = { w: el.offsetWidth, h: el.offsetHeight }
    if (size.w > 0 && (size.w !== tipSize.w || size.h !== tipSize.h)) setTipSize(size)
  })
  const avoid: Box[] = [
    { x: bestPt.x - 8, y: bestPt.y - 8, w: 16, h: 16 },
    ...(bestBox && !hideBest ? [bestBox] : []),
    ...(selBox && !hideSel ? [selBox] : []),
  ]
  const tip = cur ? tooltipPlacement(cx, cy, tipSize.w, tipSize.h, w, h, avoid, 14, MARGIN.bottom) : null

  const announce =
    cursor?.via === 'keyboard' && cur && curJds
      ? `Depart ${formatJd(curJds.depJd)}, arrive ${formatJd(curJds.arrJd)}, ${Math.round(curJds.arrJd - curJds.depJd)} days. ` +
        (curValues
          ? `C3 ${formatNumber(curValues.c3, 2)} square kilometres per second squared, arrival v-infinity ${formatNumber(curValues.vInf, 2)} kilometres per second. ${curTransfer ? 'Press Enter to choose.' : 'The solver finds no usable transfer here.'}`
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
          cur && !curTransfer ? 'cursor-not-allowed' : 'cursor-crosshair',
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
            <text
              x={10}
              y={-8}
              className="num transition-opacity duration-150"
              opacity={hideBest ? 0 : 1}
              fontSize={12}
              fontWeight={600}
              fill="var(--ink)"
              stroke="var(--ground)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {bestText}
            </text>
          )}
        </g>
        {/* the player's transfer */}
        {selPt && (
          <g transform={`translate(${selPt.x},${selPt.y})`}>
            <circle r={8} fill="none" stroke="var(--ground)" strokeWidth={4} />
            <circle r={8} fill="none" stroke="var(--accent)" strokeWidth={2} />
            <circle r={2} fill="var(--accent)" />
            <text
              x={12}
              y={-10}
              className="num transition-opacity duration-150"
              opacity={hideSel ? 0 : 1}
              fontSize={12}
              fontWeight={600}
              fill="var(--accent)"
              stroke="var(--ground)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {selText}
            </text>
          </g>
        )}
        {/* crosshair */}
        {cur && curCenter && (
          <g>
            <line x1={cx} x2={cx} y1={0} y2={h} stroke="var(--ink)" strokeOpacity={0.55} />
            <line x1={0} x2={w} y1={cy} y2={cy} stroke="var(--ink)" strokeOpacity={0.55} />
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

      {cur && curJds && curCenter && tip && (
        <>
          <AxisFlag x={cx} y={h} text={formatJd(curJds.depJd)} axis="x" w={w} />
          <AxisFlag x={0} y={cy} text={formatJd(curJds.arrJd)} axis="y" w={w} />
          <div
            ref={tipRef}
            role="presentation"
            className="num pointer-events-none absolute z-10 border border-rule-strong bg-ground-raised px-3 py-2 text-detail whitespace-nowrap"
            style={{ left: tip.left, top: tip.top }}
          >
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
              <TipNote>
                {curValues.c3 > C3_DISPLAY_MAX ? 'Very high launch energy. ' : ''}
                {curTransfer
                  ? cursor?.via === 'keyboard'
                    ? 'Enter to choose'
                    : 'Click to choose'
                  : 'The solver finds no usable transfer here'}
              </TipNote>
            ) : (
              <TipNote tone="ink-2">{noTransferReason(grid, cur)}</TipNote>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function TipNote({ children, tone = 'ink-3' }: { children: ReactNode; tone?: 'ink-2' | 'ink-3' }) {
  return (
    <p className={cn('mt-1.5 max-w-[26ch] border-t border-rule pt-1.5 whitespace-normal', tone === 'ink-2' ? 'text-ink-2' : 'text-ink-3')}>
      {children}
    </p>
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
