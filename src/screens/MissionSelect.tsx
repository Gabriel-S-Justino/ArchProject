// Mission select: three objectives side by side, separated by rules. The Mars orbiter is playable;
// the Europa flyby and the asteroid sample return are shown to give the scope and stay locked.
import { ArrowRight, Lock, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useGame } from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { formatNumber } from '@/components/status'
import { MISSION } from '@/data/mission'
import { cn } from '@/lib/utils'
import { DEFAULT_PORKCHOP } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import { GameBalance } from './design/controls'

interface MissionEntry {
  id: string
  name: string
  kind: string
  objective: string
  facts: { k: string; v: ReactNode }[]
  /** Target orbit for the to-scale sketch: semi-major axis, AU (null = illustrative). */
  orbitAU: number | null
  orbitNote: string
  playable: boolean
}

const MISSIONS: MissionEntry[] = [
  {
    id: 'red-watch',
    name: MISSION.name,
    kind: 'Mars orbiter',
    objective: 'Put an orbiter around Mars to map the surface and search for buried ice.',
    facts: [
      { k: 'Destination', v: 'Mars orbit, 300 × 33,000 km' },
      { k: 'Launch window', v: `${formatJd(DEFAULT_PORKCHOP.depStartJd)} – ${formatJd(DEFAULT_PORKCHOP.depEndJd)}` },
      { k: 'Budget', v: <>US$ {formatNumber(MISSION.budgetM)} M · <GameBalance /></> },
    ],
    orbitAU: 1.5237,
    orbitNote: 'Mars at 1.52 AU',
    playable: true,
  },
  {
    id: 'europa',
    name: 'Ice Shell',
    kind: 'Europa flyby',
    objective: 'Fly past Jupiter’s moon Europa and measure the ice shell over its ocean.',
    facts: [
      { k: 'Destination', v: 'Jupiter system' },
      { k: 'Needs', v: 'Gravity assists, radiation hardening' },
    ],
    orbitAU: 5.2,
    orbitNote: 'Jupiter at 5.2 AU',
    playable: false,
  },
  {
    id: 'asteroid',
    name: 'Stone Courier',
    kind: 'Asteroid sample return',
    objective: 'Reach a near-Earth asteroid, collect a sample and bring it back to Earth.',
    facts: [
      { k: 'Destination', v: 'A near-Earth asteroid' },
      { k: 'Needs', v: 'Rendezvous, return trajectory, re-entry capsule' },
    ],
    orbitAU: null,
    orbitNote: 'Illustrative orbit',
    playable: false,
  },
]

export function MissionSelect() {
  const setPhase = useGame((s) => s.setPhase)
  const reset = useGame((s) => s.reset)
  const loadPorkchop = useGame((s) => s.loadPorkchop)
  const transfer = useGame((s) => s.design.transfer)
  const launched = useGame((s) => s.launched)
  const parts = useGame((s) => s.design.spacecraft.parts)
  const inProgress = transfer !== null || launched || Object.keys(parts).some((id) => id !== 'sc-core')

  const open = () => {
    void loadPorkchop() // start the porkchop grid while the player reads the briefing
    setPhase('briefing')
  }

  return (
    <div className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col px-10 pt-12 pb-10">
      <h1 className="max-w-[18ch] text-display font-semibold tracking-[-0.025em] text-balance [font-stretch:84%]">Choose your mission</h1>
      <p className="mt-4 max-w-[62ch] text-lead text-ink-2">
        Design a real interplanetary mission: the launch date, the rocket and the spacecraft, then fly it. One mission is
        ready to plan.
      </p>

      <ol className="mt-10 grid flex-1 gap-y-10 lg:grid-cols-3 lg:divide-x lg:divide-rule">
        {MISSIONS.map((m, i) => (
          <li key={m.id} className={cn('flex flex-col lg:px-8 lg:first:pl-0 lg:last:pr-0', !m.playable && 'text-ink-2')}>
            <article aria-labelledby={`mission-${m.id}`} className="flex flex-1 flex-col">
              <OrbitSketch au={m.orbitAU} dim={!m.playable} />
              <p className="num mt-2 text-detail text-ink-3">Sun, Earth’s orbit and the target, to scale · {m.orbitNote}</p>
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <h2 id={`mission-${m.id}`} className={cn('text-title font-semibold [font-stretch:88%]', m.playable ? 'text-ink' : 'text-ink-2')}>
                  <span className="num mr-2 text-label text-ink-3">{i + 1}</span>
                  {m.name}
                </h2>
                {!m.playable && (
                  <span className="label-caps inline-flex items-center gap-1 text-ink-3">
                    <Lock aria-hidden className="size-3" />
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-small text-ink-3">{m.kind}</p>
              <p className={cn('mt-3 max-w-[40ch] text-body', m.playable ? 'text-ink' : 'text-ink-2')}>{m.objective}</p>
              <dl className="mt-4 flex flex-col border-t border-rule">
                {m.facts.map((f) => (
                  <div key={f.k} className="grid grid-cols-[7rem_1fr] gap-3 border-b border-rule py-1.5 text-detail">
                    <dt className="text-ink-3">{f.k}</dt>
                    <dd className="num text-ink-2">{f.v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-6">
                {m.playable ? (
                  <>
                    <ActionButton onClick={open} icon={<ArrowRight aria-hidden />}>
                      {inProgress ? `Continue ${m.name}` : `Plan ${m.name}`}
                    </ActionButton>
                    {inProgress && (
                      <ActionButton tone="quiet" onClick={reset} icon={<RotateCcw aria-hidden />}>
                        Start over
                      </ActionButton>
                    )}
                  </>
                ) : (
                  <p className="text-detail text-ink-3">Not playable in this build: the Mars orbiter shows the full loop.</p>
                )}
              </div>
            </article>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Sun, Earth's orbit (1 AU) and the target orbit, to scale within each sketch. */
function OrbitSketch({ au, dim }: { au: number | null; dim: boolean }) {
  const R = 44
  const outer = au ?? 1.35
  const k = R / Math.max(outer, 1)
  const ink = dim ? 'var(--ink-3)' : 'var(--ink-2)'
  return (
    <svg viewBox="-50 -26 100 52" className="h-28 w-full" aria-hidden preserveAspectRatio="xMidYMid meet">
      <g transform="scale(1,0.5)">
        <circle r={k * 1} fill="none" stroke="var(--rule-strong)" strokeWidth={0.6} />
        {au !== null ? (
          <circle r={k * au} fill="none" stroke={ink} strokeWidth={0.8} />
        ) : (
          <ellipse cx={k * 0.15} rx={k * 1.3} ry={k * 1.1} fill="none" stroke={ink} strokeWidth={0.8} strokeDasharray="2 2" />
        )}
      </g>
      <circle r={1.6} fill="var(--ink)" />
      <circle cx={k * 1} cy={0} r={1.4} fill="var(--ink-2)" />
      {au !== null ? (
        <circle cx={-k * au * 0.71} cy={k * au * 0.5 * 0.71} r={1.8} fill={dim ? 'var(--ink-3)' : 'var(--accent)'} />
      ) : (
        <circle cx={k * 0.15 - k * 1.3 * 0.6} cy={-k * 1.1 * 0.5 * 0.8} r={1.2} fill="var(--ink-3)" />
      )}
    </svg>
  )
}
