// Stand-in screens for the phases whose real screens are still to come (launch: Task 14; cruise,
// arrival, operations and report: Tasks 13–15). Each is a "plate": a title, one line and the way
// forward. Mission select, briefing and design have their own screens (Task 12).
import { ArrowRight } from 'lucide-react'
import { useGame } from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { MISSION } from '@/data/mission'
import { canEnter, nextPhase, type Phase } from '@/game/flow'

export type PlaceholderPhase = Exclude<Phase, 'sources' | 'select' | 'briefing' | 'design'>

interface PlateCopy {
  title: string
  line: string
}

const COPY: Record<PlaceholderPhase, PlateCopy> = {
  launch: {
    title: 'Launch',
    line: 'Your own rocket lifts off and drops each stage as it runs dry, timed by the rocket equation.',
  },
  cruise: {
    title: 'Cruise to Mars',
    line: 'Coast along the Lambert arc, correct the course and ride out real solar flares from NASA DONKI.',
  },
  arrival: {
    title: 'Mars orbit insertion',
    line: 'Brake into orbit with the propellant you carried, or fly past the planet.',
  },
  ops: {
    title: 'Science operations',
    line: `${MISSION.opsTurns} turns of ${MISSION.turnDays} days in Mars orbit: choose what to observe and what to send home.`,
  },
  report: {
    title: 'Mission report',
    line: 'What happened, why, and how your mission compares with a real Mars orbiter.',
  },
}

const NEXT_LABEL: Partial<Record<PlaceholderPhase, string>> = {
  launch: 'Into cruise',
  cruise: 'Approach Mars',
  arrival: 'Begin operations',
  ops: 'Read the report',
}

const BLOCKED: Partial<Record<PlaceholderPhase, string>> = {
  launch: 'Cruise opens after a launch.',
  cruise: 'Arrival opens after a launch.',
  arrival: 'Operations open after arrival at Mars.',
  ops: 'The report opens after a launch.',
}

export function PhasePlaceholder({ phase }: { phase: PlaceholderPhase }) {
  const copy = COPY[phase]
  // Field selectors only: the plate re-renders when one of these changes, not on every store update.
  const design = useGame((s) => s.design)
  const launched = useGame((s) => s.launched)
  const arrived = useGame((s) => s.arrived)
  const opsDone = useGame((s) => s.opsDone)
  const next = useGame((s) => s.next)
  const canGo = phase !== 'report' && canEnter(nextPhase(phase), { design, launched, arrived, opsDone })
  const blocked = BLOCKED[phase]
  return (
    <div className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col px-10 pt-12 pb-10">
      <h1 className="max-w-[18ch] text-display font-semibold tracking-[-0.025em] text-balance [font-stretch:84%]">{copy.title}</h1>
      <p className="mt-4 max-w-[62ch] text-lead text-ink-2">{copy.line}</p>

      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-12">
        {NEXT_LABEL[phase] && (
          <ActionButton disabled={!canGo} onClick={() => next()} icon={<ArrowRight aria-hidden />}>
            {NEXT_LABEL[phase]}
          </ActionButton>
        )}
        {!canGo && blocked && <p className="text-detail text-ink-3">{blocked}</p>}
        <p className="ml-auto text-detail text-ink-3">Preview: this screen is still being built.</p>
      </div>
    </div>
  )
}
