import { BookOpen, Check, Lock } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { missionClock } from '@/app/missionClock'
import { useGame, useTransfer, type DesignTab } from '@/app/store'
import { canEnter, type GameSnapshot, type Phase } from '@/game/flow'
import { cn } from '@/lib/utils'
import { formatJd } from '@/physics/time'
import { PhysicsPanel } from './PhysicsPanel'
import { RollingText } from './RollingText'

/** The stations of the stepper, in mission order ('select' and 'sources' are reached elsewhere). */
export const STATIONS: { phase: Phase; name: string }[] = [
  { phase: 'briefing', name: 'Briefing' },
  { phase: 'design', name: 'Design' },
  { phase: 'launch', name: 'Launch' },
  { phase: 'cruise', name: 'Cruise' },
  { phase: 'arrival', name: 'Arrival' },
  { phase: 'ops', name: 'Operations' },
  { phase: 'report', name: 'Report' },
]

/** Why a station cannot be entered yet (shown as its tooltip and accessible description). */
const LOCK_REASON: Partial<Record<Phase, string>> = {
  launch: 'Opens when every launch check is go',
  cruise: 'Opens after launch',
  arrival: 'Opens after launch',
  ops: 'Opens after arrival at Mars',
  report: 'Opens after launch',
}

/** In the design workspace the panel shows the concepts of the open tab, in journey order. */
const TAB_CONCEPTS: Record<DesignTab, string[]> = {
  trajectory: ['hohmann', 'phase-angle', 'lambert', 'porkchop', 'c3', 'capture'],
  rocket: ['c3', 'rocket-equation', 'twr', 'gravity-losses', 'staging', 'parallel-staging', 'upper-stage-twr', 'launch-margin'],
  spacecraft: ['launch-margin', 'capture', 'inverse-square', 'link-budget'],
}

const PANEL_KEY = 'mission-architect:physics-panel-collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(PANEL_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(PANEL_KEY, v ? '1' : '0')
  } catch {
    // storage blocked: the panel simply forgets
  }
}

export interface AppShellProps {
  /** The screen for a phase. The shell animates between screens and owns everything around them. */
  renderScreen: (phase: Phase) => ReactNode
}

/**
 * The frame every screen sits in: a title block (mission, phase stations, mission date), the
 * screen as a plate on plot paper, and the physics panel docked on the right.
 */
export function AppShell({ renderScreen }: AppShellProps) {
  const phase = useGame((s) => s.phase)
  const designTab = useGame((s) => s.designTab)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const showPanel = phase !== 'sources'
  const mainRef = useRef<HTMLElement>(null)
  // A new screen starts at its top, not at the previous screen's scroll position.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [phase])

  const onCollapsedChange = (v: boolean) => {
    setCollapsed(v)
    writeCollapsed(v)
  }

  return (
    <div className="grid h-dvh min-h-[640px] grid-rows-[auto_minmax(0,1fr)] bg-ground text-ink">
      <a
        href="#screen"
        className="sr-only z-50 bg-mars px-3 py-2 text-small font-semibold text-mars-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to the screen
      </a>
      <TopBar />
      <div className="flex min-h-0">
        <main ref={mainRef} id="screen" tabIndex={-1} className="relative min-w-0 flex-1 overflow-y-auto outline-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phase}
              className="flex min-h-full flex-col"
              initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            >
              {renderScreen(phase)}
            </motion.div>
          </AnimatePresence>
        </main>
        <AnimatePresence initial={false}>
          {showPanel && (
            <motion.aside
              key="physics"
              className="relative h-full shrink-0 overflow-hidden"
              initial={{ width: 0 }}
              animate={{ width: collapsed ? 'var(--rail-w)' : 'var(--panel-w)' }}
              exit={{ width: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="h-full" style={{ width: collapsed ? 'var(--rail-w)' : 'var(--panel-w)' }}>
                <PhysicsPanel
                  phase={phase}
                  conceptIds={phase === 'design' ? TAB_CONCEPTS[designTab] : undefined}
                  collapsed={collapsed}
                  onCollapsedChange={onCollapsedChange}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function TopBar() {
  const phase = useGame((s) => s.phase)
  // A new mission (reset) remounts the stepper, so stations reached in the last game are forgotten.
  const epoch = useGame((s) => s.epoch)
  const setPhase = useGame((s) => s.setPhase)
  const transfer = useTransfer()
  const clock = missionClock(phase, transfer)

  return (
    <header className="flex h-(--topbar-h) items-stretch gap-6 border-b border-rule bg-ground px-5">
      <button
        type="button"
        onClick={() => setPhase('select')}
        className="group flex shrink-0 flex-col justify-center text-left"
        aria-label="Mission Architect: back to mission select"
      >
        <span className="text-label font-bold tracking-[0.14em] text-ink-2 uppercase [font-stretch:118%] group-hover:text-ink">
          Mission Architect
        </span>
        <span className="text-lead font-semibold text-ink [font-stretch:86%]">
          Red Watch <span className="font-normal text-ink-3">· Mars orbiter</span>
        </span>
      </button>

      <PhaseStepper key={epoch} />

      <div className="flex shrink-0 items-center gap-5">
        <div className="flex flex-col items-end justify-center" aria-live="polite">
          <span className="label-caps text-ink-3">{clock.label}</span>
          <RollingText text={formatJd(clock.jd)} className="num text-title font-medium text-ink [font-stretch:92%]" />
        </div>
        <button
          type="button"
          onClick={() => setPhase('sources')}
          aria-current={phase === 'sources' ? 'page' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 self-center text-detail underline-offset-4 hover:text-ink hover:underline',
            phase === 'sources' ? 'text-mars' : 'text-ink-2',
          )}
        >
          <BookOpen aria-hidden className="size-3.5" />
          Sources
        </button>
      </div>
    </header>
  )
}

function PhaseStepper() {
  const phase = useGame((s) => s.phase)
  const setPhase = useGame((s) => s.setPhase)
  const design = useGame((s) => s.design)
  const launched = useGame((s) => s.launched)
  const arrived = useGame((s) => s.arrived)
  const opsDone = useGame((s) => s.opsDone)
  const snapshot: GameSnapshot = { design, launched, arrived, opsDone }

  // Stations the player has reached stay marked when they step back (nothing disappears).
  const currentIndex = STATIONS.findIndex((s) => s.phase === phase)
  const [reached, setReached] = useState(currentIndex)
  useEffect(() => {
    if (currentIndex > reached) setReached(currentIndex)
  }, [currentIndex, reached])

  return (
    <nav aria-label="Mission phases" className="flex min-w-0 flex-1 items-stretch justify-center">
      <ol className="flex min-w-0 items-stretch">
        {STATIONS.map((st, i) => {
          const current = st.phase === phase
          const open = canEnter(st.phase, snapshot)
          const done = !current && i <= reached
          const reason = open ? undefined : LOCK_REASON[st.phase]
          return (
            <li key={st.phase} className="flex">
              <button
                type="button"
                disabled={!open}
                onClick={() => setPhase(st.phase)}
                aria-current={current ? 'step' : undefined}
                aria-describedby={reason ? `lock-${st.phase}` : undefined}
                title={reason}
                className={cn(
                  'group relative flex items-center gap-2 px-3 text-small transition-colors',
                  'border-b-2 disabled:cursor-not-allowed',
                  current
                    ? 'border-mars text-ink'
                    : done
                      ? 'border-ink-3 text-ink-2 hover:text-ink'
                      : open
                        ? 'border-transparent text-ink-2 hover:border-rule-strong hover:text-ink'
                        : 'border-transparent text-ink-3',
                )}
              >
                <span className={cn('num text-label', current ? 'text-mars' : 'text-ink-3')}>{i + 1}</span>
                <span className={cn('whitespace-nowrap [font-stretch:90%]', current && 'font-semibold')}>{st.name}</span>
                {done && open && <Check aria-label="reached" className="size-3.5 text-ink-3" strokeWidth={2.25} />}
                {!open && <Lock aria-hidden className="size-3 text-ink-3" />}
                {reason && (
                  <span id={`lock-${st.phase}`} className="sr-only">
                    {reason}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
