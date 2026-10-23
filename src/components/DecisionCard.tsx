// A cruise decision about a solar flare: the real NASA DONKI event it replays (date, class, source
// region, link to the record), the responses with their damage risk and cost, the responses the
// design rules out with the reason, and the game-balance note. Purely presentational: the owner
// passes the options (eventOptions) and receives the choice.
import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CruiseEvent, EventOption } from '@/game/events'
import { cn } from '@/lib/utils'
import { formatJd } from '@/physics/time'
import { formatNumber } from './status'

export interface DecisionCardProps {
  event: CruiseEvent
  /** Mission date the flare strikes, JD. */
  jd: number
  options: EventOption[]
  onChoose: (id: EventOption['id']) => void
  /** The game-balance note under the options (rules behind the risks). */
  note?: ReactNode
  className?: string
}

/** "2024-05-14T16:51Z" → "14 May 2024, 16:51 UTC". */
export function formatDonkiTime(iso: string): string {
  const d = new Date(iso.replace(/Z$/, ':00Z'))
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${date}, ${time} UTC`
}

export function DecisionCard({ event, jd, options, onChoose, note, className }: DecisionCardProps) {
  const f = event.flare
  const severe = event.severity === 'severe'
  return (
    <section aria-labelledby={`decision-${event.id}`} className={cn('border-t-2 border-mars pt-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`decision-${event.id}`} tabIndex={-1} className="text-title font-semibold [font-stretch:88%]">
          Solar flare, class {f.classType}
        </h2>
        <span className={cn('label-caps shrink-0', severe ? 'text-nogo' : 'text-caution')}>{severe ? 'Severe' : 'Moderate'}</span>
      </div>
      <p className="num mt-1 text-detail text-ink-2">
        Strikes on {formatJd(jd)}, mission day {formatNumber(event.day)}. Based on the real event of {formatDonkiTime(f.peakTime)}
        {f.sourceLocation ? `, from solar region ${f.sourceLocation}` : ''}.{' '}
        <a
          href={f.link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
        >
          NASA DONKI record
          <ExternalLink aria-hidden className="size-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </p>

      <ul className="mt-3 flex flex-col" aria-label="Responses">
        {options.map((o) => (
          <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-rule py-2.5">
            <div className="min-w-0">
              <div className={cn('text-small font-medium', o.available ? 'text-ink' : 'text-ink-3')}>{o.label}</div>
              <div className="num text-detail text-ink-3">
                Damage risk {formatNumber(o.risk * 100, o.risk < 0.1 ? 1 : 0)}% · {o.cost}
              </div>
              {!o.available && o.reason && (
                <div id={`why-${event.id}-${o.id}`} className="text-detail text-nogo">
                  <span className="label-caps">No-go</span> {o.reason}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={!o.available}
              aria-describedby={!o.available && o.reason ? `why-${event.id}-${o.id}` : undefined}
              onClick={() => onChoose(o.id)}
              className={cn(
                'h-9 border px-3 text-small font-semibold transition-colors',
                'border-rule-strong text-ink hover:border-mars hover:text-mars',
                'disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-3 disabled:hover:border-rule disabled:hover:text-ink-3',
              )}
            >
              Choose
              <span className="sr-only">: {o.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {note && <div className="mt-2 text-detail text-ink-3">{note}</div>}
    </section>
  )
}
