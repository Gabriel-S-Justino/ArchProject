// The porkchop plot's key: the C3 scale (log), "very high", "no transfer", the two contour styles
// and the markers, each drawn the way the plot draws it.
import { cn } from '@/lib/utils'
import type { PorkchopGrid } from '@/physics/porkchop'
import { C3_DISPLAY_MAX, HIGH_OKLCH, cssOklch, rampOklch, scaleMin } from './porkchopScale'

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
          {/* The plot's C3 lines are dark on the bright island: shown on a swatch of the scale. */}
          <svg aria-hidden width="22" height="10">
            <rect width="22" height="10" fill={cssOklch(rampOklch(0.12))} />
            <line x1="0" x2="22" y1="5" y2="5" stroke="var(--ground)" strokeWidth="1.25" strokeOpacity="0.85" />
          </svg>
          C3 contour
        </li>
        <li className="flex items-center gap-2">
          <svg aria-hidden width="22" height="10">
            <line x1="0" x2="22" y1="5" y2="5" stroke="var(--ground)" strokeOpacity="0.55" strokeWidth="3" />
            <line x1="0" x2="22" y1="5" y2="5" stroke="var(--ink-2)" strokeDasharray="4 3" />
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
