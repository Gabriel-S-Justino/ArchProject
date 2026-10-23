// Time warp for the cruise: pause, 1, 5 or 20 days per second, driven by requestAnimationFrame.
// Each frame asks the owner to advance by rate × elapsed time; when the owner reports a stop (a TCM
// window, a flare, the approach or arrival) the warp pauses itself. It cannot run while a decision
// is pending (`lockedReason`). Under reduced motion it works the same: nothing here eases.
import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

/** Days of mission time per second of real time; 0 is paused. */
export const WARP_RATES = [0, 1, 5, 20] as const
export type WarpRate = (typeof WARP_RATES)[number]

/** Longest frame step taken into account, s: a stalled tab never jumps weeks at once. */
const MAX_FRAME_S = 0.1

export interface TimeWarpProps {
  rate: WarpRate
  onRateChange: (rate: WarpRate) => void
  /** Advance mission time by `days`; return truthy when the simulation stopped at something. */
  onAdvance: (days: number) => unknown
  /** Why time cannot run now (a pending decision, arrival); the controls are disabled and say so. */
  lockedReason?: string
  className?: string
}

export function TimeWarp({ rate, onRateChange, onAdvance, lockedReason, className }: TimeWarpProps) {
  const advance = useRef(onAdvance)
  const change = useRef(onRateChange)
  useEffect(() => {
    advance.current = onAdvance
    change.current = onRateChange
  })

  const running = rate > 0 && !lockedReason
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last: number | null = null
    const frame = (now: number) => {
      const dt = last === null ? 0 : Math.min(MAX_FRAME_S, Math.max(0, (now - last) / 1000))
      last = now
      if (dt > 0 && advance.current(rate * dt)) {
        change.current(0)
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [running, rate])

  // A pending decision pauses the warp (the next play is a deliberate choice).
  useEffect(() => {
    if (lockedReason && rate !== 0) change.current(0)
  }, [lockedReason, rate])

  // ARIA radio group: one tab stop (the checked rate), arrow keys move and select among the enabled rates.
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = (r: WarpRate) => !lockedReason || r === 0
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    const edge = e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null
    if (!dir && !edge) return
    e.preventDefault()
    const choices = WARP_RATES.filter(enabled)
    const current = choices.indexOf(running ? rate : 0)
    const i = edge === 'first' ? 0 : edge === 'last' ? choices.length - 1 : (Math.max(0, current) + dir + choices.length) % choices.length
    const next = choices[i] ?? 0
    onRateChange(next)
    buttons.current[WARP_RATES.indexOf(next)]?.focus()
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id="warp-label" className="label-caps text-ink-3">
          Time warp
        </span>
        <span className="num text-detail text-ink-3">{running ? `${rate} day${rate === 1 ? '' : 's'} per second` : 'Paused'}</span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="warp-label"
        aria-describedby={lockedReason ? 'warp-locked' : undefined}
        onKeyDown={onKeyDown}
        className="flex h-9 border border-rule-strong"
      >
        {WARP_RATES.map((r, i) => {
          const checked = r === 0 ? !running : running && r === rate
          return (
            <button
              key={r}
              ref={(el) => void (buttons.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={Boolean(lockedReason) && r !== 0}
              onClick={() => onRateChange(r)}
              title={lockedReason && r !== 0 ? lockedReason : undefined}
              className={cn(
                'num flex flex-1 items-center justify-center gap-1.5 border-r border-rule text-small transition-colors last:border-r-0',
                'disabled:cursor-not-allowed disabled:text-ink-3/60',
                checked ? 'bg-ground-hover font-semibold text-ink' : 'text-ink-2 hover:bg-ground-raised hover:text-ink',
              )}
            >
              {r === 0 ? (
                <>
                  <Pause aria-hidden className="size-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  {r === 1 && <Play aria-hidden className="size-3.5" />}
                  <span>
                    {r}
                    <span className="text-detail text-ink-3"> d/s</span>
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
      {lockedReason && (
        <p id="warp-locked" className="text-detail text-ink-3">
          {lockedReason}
        </p>
      )}
    </div>
  )
}
