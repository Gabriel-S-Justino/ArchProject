// Data sources: every external source the game uses, grouped like a technical report's
// references, then "How the game simplifies" and the AI disclosure line. Also the content of the
// submission's NASA Data field.
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ActionButton } from '@/components/ActionButton'
import { SIMPLIFICATIONS } from '@/data/concepts'
import { DATA_SOURCES } from '@/data/sources'
import type { DataSource } from '@/game/types'
import type { Phase } from '@/game/flow'
import { slug } from '@/lib/slug'

const GROUPS: { name: string; match: (id: string) => boolean }[] = [
  { name: 'Trajectory', match: (id) => id.startsWith('horizons') || id.startsWith('porkchop') },
  { name: 'Space weather', match: (id) => id === 'donki' },
  { name: 'Launch vehicles', match: (id) => /^(lsp|engines|tanks|boosters|preset-reference)/.test(id) },
  { name: 'Spacecraft and mission', match: (id) => /^(spacecraft-parts|real-missions|mission)/.test(id) },
  { name: 'Imagery', match: (id) => id.startsWith('textures') },
]

/** Sources in report order with their group; anything unmatched lands in "Other". */
export function groupSources(sources: DataSource[]): { name: string; items: DataSource[] }[] {
  const groups = GROUPS.map((g) => ({ name: g.name, items: sources.filter((s) => g.match(s.id)) }))
  const other = sources.filter((s) => !GROUPS.some((g) => g.match(s.id)))
  if (other.length) groups.push({ name: 'Other', items: other })
  return groups.filter((g) => g.items.length > 0)
}

const PHASE_NAME: Partial<Record<Phase, string>> = {
  select: 'mission select',
  briefing: 'the briefing',
  design: 'design',
  launch: 'launch',
  cruise: 'cruise',
  arrival: 'arrival',
  ops: 'operations',
  report: 'the report',
}

export interface SourcesProps {
  /** Where "Back" returns to (the phase the player came from). */
  backTo: Phase
  onBack: () => void
}

export function Sources({ backTo, onBack }: SourcesProps) {
  const groups = groupSources(DATA_SOURCES)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  let n = 0

  return (
    <div className="mx-auto w-full max-w-[64rem] flex-1 px-10 pt-12 pb-16">
      <div className="flex items-start justify-between gap-6">
        <h1 ref={heading} tabIndex={-1} className="text-display font-semibold tracking-[-0.025em] outline-none [font-stretch:84%]">
          Data sources
        </h1>
        <ActionButton tone="quiet" onClick={onBack} className="mt-2" aria-label={`Back to ${PHASE_NAME[backTo] ?? 'the game'}`}>
          <ArrowLeft aria-hidden className="size-4" />
          Back to {PHASE_NAME[backTo] ?? 'the game'}
        </ActionButton>
      </div>
      <p className="mt-4 max-w-[62ch] text-lead text-ink-2">
        Every number in Mission Architect is real data, computed from real data, or labelled game balance. All data was
        fetched ahead of time and ships with the game; nothing is downloaded while you play.
      </p>

      {groups.map((g) => (
        <section key={g.name} className="mt-12" aria-labelledby={`group-${slug(g.name)}`}>
          <h2 id={`group-${slug(g.name)}`} className="border-b border-rule-strong pb-2 text-title font-semibold [font-stretch:88%]">
            {g.name}
          </h2>
          <ol>
            {g.items.map((s) => {
              n += 1
              return (
                <li key={s.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-x-4 border-b border-rule py-4">
                  <span className="num pt-0.5 text-detail text-ink-3">[{n}]</span>
                  <div className="min-w-0">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group inline text-body font-medium text-ink decoration-ink-3 underline-offset-4 hover:underline"
                    >
                      {s.title}
                      <ExternalLink aria-hidden className="ml-1.5 inline size-3.5 -translate-y-px text-ink-3 group-hover:text-ink" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    <p className="mt-1 text-small text-ink-2">{s.provider}</p>
                    <p className="mt-1 max-w-[70ch] text-detail text-ink-3">{s.usedFor}</p>
                  </div>
                  <p className="num pt-0.5 text-right text-detail whitespace-nowrap text-ink-3">
                    <span className="sr-only">Fetched </span>
                    {s.fetched}
                  </p>
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      <section className="mt-14" aria-labelledby="simplifies">
        <h2 id="simplifies" className="border-b border-rule-strong pb-2 text-title font-semibold [font-stretch:88%]">
          How the game simplifies
        </h2>
        <ol className="mt-1">
          {SIMPLIFICATIONS.map((s, i) => (
            <li key={i} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 border-b border-rule py-3 last:border-b-0">
              <span className="num text-detail text-ink-3">{i + 1}.</span>
              <p className="max-w-[72ch] text-small text-ink-2">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-12 border-t border-rule pt-4 text-detail text-ink-3">AI assistance disclosure: see README.</p>
    </div>
  )
}
