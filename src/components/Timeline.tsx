import { cn } from '@/lib/utils'
import { dateFromJd, formatJd, jdFromDate } from '@/physics/time'

export type TimelineTone = 'accent' | 'ink' | 'muted' | 'ok' | 'warn' | 'bad'

export interface TimelineSpan {
  fromJd: number
  toJd: number
  label: string
  tone?: TimelineTone
}

export interface TimelineEvent {
  jd: number
  label: string
  tone?: TimelineTone
}

export interface TimelineProps {
  startJd: number
  endJd: number
  /** Periods (cruise, operations, a launch window…), drawn as bars at their exact length. */
  spans?: TimelineSpan[]
  /** Moments (launch, TCM, flare, arrival…), drawn as ticks through the axis. */
  events?: TimelineEvent[]
  /** The current mission date, drawn as the accent line. */
  nowJd?: number
  /** Accessible name of the whole timeline. */
  label: string
  className?: string
}

const BAR: Record<TimelineTone, string> = {
  accent: 'bg-mars',
  ink: 'bg-ink-2',
  muted: 'bg-rule-strong',
  ok: 'bg-go',
  warn: 'bg-caution',
  bad: 'bg-nogo',
}
const TEXT: Record<TimelineTone, string> = {
  accent: 'text-mars',
  ink: 'text-ink-2',
  muted: 'text-ink-3',
  ok: 'text-go',
  warn: 'text-caution',
  bad: 'text-nogo',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** First-of-month dates between two JDs, with labels thinned to keep about a dozen. */
function monthTicks(startJd: number, endJd: number) {
  const ticks: { jd: number; label: string | null; year: boolean }[] = []
  const d0 = dateFromJd(startJd)
  if (Number.isNaN(d0.getTime())) return ticks
  let y = d0.getUTCFullYear()
  let m = d0.getUTCMonth() + 1
  const total = Math.max(1, (endJd - startJd) / 30.44)
  const every = total <= 14 ? 1 : total <= 28 ? 2 : total <= 48 ? 3 : 6
  for (let guard = 0; guard < 240; guard++) {
    if (m > 11) {
      m = 0
      y++
    }
    const jd = jdFromDate(new Date(Date.UTC(y, m, 1)))
    if (jd > endJd) break
    const year = m === 0
    ticks.push({ jd, label: year ? String(y) : m % every === 0 ? (MONTHS[m] ?? null) : null, year })
    m++
  }
  return ticks
}

/** Greedy lanes so overlapping spans never cover each other. */
function laneOf(spans: TimelineSpan[]): number[] {
  const ends: number[] = []
  return spans.map((s) => {
    let lane = ends.findIndex((end) => end <= s.fromJd)
    if (lane === -1) lane = ends.length
    ends[lane] = s.toJd
    return lane
  })
}

/**
 * A mission timeline where length is exact duration: one day is the same width everywhere, so a
 * 293-day cruise visibly dwarfs a 30-day turn. Month ticks, years labelled. Purely presentational.
 */
export function Timeline({ startJd, endJd, spans = [], events = [], nowJd, label, className }: TimelineProps) {
  const valid = Number.isFinite(startJd) && Number.isFinite(endJd) && endJd > startJd
  const span = valid ? endJd - startJd : 1
  const pos = (jd: number) => `${(Math.min(1, Math.max(0, (jd - startJd) / span)) * 100).toFixed(3)}%`
  const lanes = laneOf(spans)
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1))
  const spanArea = laneCount * 28
  const ticks = valid ? monthTicks(startJd, endJd) : []
  const visibleEvents = events.filter((e) => Number.isFinite(e.jd) && e.jd >= startJd && e.jd <= endJd)

  return (
    <figure className={cn('relative select-none', className)} aria-label={label}>
      <ul className="sr-only">
        {spans.map((s) => (
          <li key={`s-${s.label}`}>
            {s.label}: {formatJd(s.fromJd)} to {formatJd(s.toJd)} ({Math.round(s.toJd - s.fromJd)} days)
          </li>
        ))}
        {visibleEvents.map((e) => (
          <li key={`e-${e.label}`}>
            {e.label}: {formatJd(e.jd)}
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="relative" style={{ height: spanArea + (visibleEvents.length ? 88 : 40) }}>
        {/* spans */}
        {spans.map((s, i) => {
          const tone = s.tone ?? 'ink'
          const top = (lanes[i] ?? 0) * 28
          const left = pos(s.fromJd)
          const width = `calc(${pos(s.toJd)} - ${left})`
          return (
            <div key={`${s.label}-${i}`} className="absolute" style={{ top, left, width }}>
              <div className={cn('label-caps truncate', TEXT[tone])}>{s.label}</div>
              <div className={cn('mt-1 h-1.5 min-w-px', BAR[tone])} />
            </div>
          )
        })}
        {/* axis */}
        <div className="absolute inset-x-0 h-px bg-rule-strong" style={{ top: spanArea + 8 }} />
        {ticks.map((t) => (
          <div key={t.jd} className="absolute" style={{ left: pos(t.jd), top: spanArea + 8 }}>
            <div className={cn('w-px', t.year ? 'h-2.5 bg-ink-2' : 'h-1.5 bg-rule-strong')} />
            {t.label && (
              <div className={cn('num absolute top-3 -translate-x-1/2 text-label', t.year ? 'text-ink-2' : 'text-ink-3')}>
                {t.label}
              </div>
            )}
          </div>
        ))}
        {/* events */}
        {visibleEvents.map((e, i) => {
          const tone = e.tone ?? 'ink'
          const row = i % 2
          return (
            <div key={`${e.label}-${i}`} className="absolute" style={{ left: pos(e.jd), top: spanArea - 2 }}>
              <div className={cn('w-px', BAR[tone])} style={{ height: 14 }} />
              <div className="w-px bg-rule-strong" style={{ height: 30 + row * 16 }} />
              <div
                className={cn(
                  'absolute whitespace-nowrap text-label font-medium',
                  TEXT[tone],
                  (e.jd - startJd) / span > 0.8 ? 'right-0 pr-1' : 'left-0 pl-1',
                )}
                style={{ top: 42 + row * 16 }}
              >
                {e.label}
              </div>
            </div>
          )
        })}
        {nowJd !== undefined && Number.isFinite(nowJd) && nowJd >= startJd && nowJd <= endJd && (
          <div className="absolute top-0 w-0.5 bg-mars" style={{ left: pos(nowJd), height: spanArea + 20 }} />
        )}
      </div>
    </figure>
  )
}
