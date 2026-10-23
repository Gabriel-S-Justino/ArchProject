import { BookOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { useGame, useGameView, type GameView } from '@/app/store'
import { CONCEPTS, conceptNumber, conceptsFor, type Concept } from '@/data/concepts'
import type { Phase } from '@/game/flow'
import { cn } from '@/lib/utils'

export interface PhysicsPanelProps {
  phase: Phase
  /** Show these concepts (in this order) instead of the phase's list, e.g. one design tab's. */
  conceptIds?: string[]
  /** Collapsed to a rail. Controlled by the shell; omit for an always-open panel. */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  className?: string
}

const PHASE_NAME: Record<Phase, string> = {
  select: 'Mission select',
  briefing: 'Briefing',
  design: 'Design',
  launch: 'Launch',
  cruise: 'Cruise',
  arrival: 'Arrival',
  ops: 'Operations',
  report: 'Report',
  sources: 'Data sources',
}

/**
 * The equation sheet: every concept in play this phase, numbered like a handbook's equations,
 * with the formula, one plain idea, an analogy and the player's own numbers plugged in (live from
 * the store's GameView).
 */
export function PhysicsPanel({ phase, conceptIds, collapsed = false, onCollapsedChange, className }: PhysicsPanelProps) {
  const view = useGameView()
  const setPhase = useGame((s) => s.setPhase)
  const concepts = useMemo(() => {
    if (!conceptIds) return conceptsFor(phase)
    return conceptIds.map((id) => CONCEPTS.find((c) => c.id === id)).filter((c): c is Concept => c !== undefined)
  }, [phase, conceptIds])

  if (collapsed) {
    return (
      <div className={cn('flex h-full flex-col items-center border-l border-rule bg-ground-raised', className)}>
        <button
          type="button"
          onClick={() => onCollapsedChange?.(false)}
          aria-label="Open the physics panel"
          aria-expanded={false}
          className="flex h-full w-full flex-col items-center gap-3 pt-4 text-ink-2 transition-colors hover:bg-ground-hover hover:text-ink"
        >
          <PanelRightOpen aria-hidden className="size-4" />
          <span className="label-caps [writing-mode:vertical-rl]">
            Physics <span className="num text-ink-3">· {concepts.length}</span>
          </span>
        </button>
      </div>
    )
  }

  return (
    <section
      id="physics-panel"
      aria-label="Physics panel"
      className={cn('flex h-full min-h-0 flex-col border-l border-rule bg-ground-raised', className)}
    >
      <header className="flex items-start justify-between gap-3 border-b border-rule px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-small font-semibold [font-stretch:88%]">Physics in play</h2>
          <p className="num text-detail text-ink-3">
            {PHASE_NAME[phase]} · {concepts.length} {concepts.length === 1 ? 'concept' : 'concepts'} · your numbers live
          </p>
        </div>
        {onCollapsedChange && (
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            aria-label="Collapse the physics panel"
            aria-expanded={true}
            aria-controls="physics-panel"
            className="-mr-1.5 grid size-8 shrink-0 place-items-center text-ink-2 transition-colors hover:bg-ground-hover hover:text-ink"
          >
            <PanelRightClose aria-hidden className="size-4" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {concepts.length === 0 ? (
          <p className="px-5 py-6 text-small text-ink-2">No physics on this screen.</p>
        ) : (
          <ol>
            {concepts.map((c) => (
              <ConceptEntry key={c.id} concept={c} view={view} />
            ))}
          </ol>
        )}
        <div className="border-t border-rule px-5 py-4">
          <button
            type="button"
            onClick={() => setPhase('sources')}
            className="inline-flex items-center gap-2 text-detail text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            <BookOpen aria-hidden className="size-3.5" />
            How the game simplifies, and the data behind it
          </button>
        </div>
      </div>
    </section>
  )
}

/** Sets "x_name" as x with a subscript, the way a textbook prints it. */
export function Formula({ text }: { text: string }) {
  const parts = text.split(/(_[A-Za-z0-9]+)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('_') ? (
          <sub key={i} className="text-[0.68em] not-italic [font-family:var(--font-sans)] [font-stretch:88%]">
            {p.slice(1)}
          </sub>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

function ConceptEntry({ concept, view }: { concept: Concept; view: GameView }) {
  const live = concept.live(view)
  const n = conceptNumber(concept.id)
  return (
    <li className="border-b border-rule px-5 pt-4 pb-4 last:border-b-0">
      <article aria-labelledby={`concept-${concept.id}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`concept-${concept.id}`} className="text-small font-semibold text-ink">
            {concept.title}
          </h3>
          <span className="num shrink-0 text-detail text-ink-3" aria-label={`Equation ${n}`}>
            ({n})
          </span>
        </div>
        <p className="formula mt-2 text-lead text-ink" aria-label={concept.formula.replace(/_/g, ' ')}>
          <Formula text={concept.formula} />
        </p>
        <p className="mt-2 text-detail text-ink-2">{concept.plain}</p>
        {concept.analogy && <p className="mt-1.5 text-detail text-ink-3 italic">{concept.analogy}</p>}
        <div className="mt-3 bg-ground-sunken px-3 py-2.5">
          <p className="label-caps text-ink-3">With your design</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={live}
              className="num mt-1 text-detail text-ink"
              initial={{ opacity: 0.35 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.35 }}
              transition={{ duration: 0.18 }}
            >
              {live}
            </motion.p>
          </AnimatePresence>
        </div>
      </article>
    </li>
  )
}
