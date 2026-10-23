import { MotionConfig } from 'motion/react'
import { useEffect, useRef } from 'react'
import { AppShell } from '@/components/AppShell'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Phase } from '@/game/flow'
import { Briefing } from '@/screens/Briefing'
import { DesignWorkspace } from '@/screens/design/DesignWorkspace'
import { MissionSelect } from '@/screens/MissionSelect'
import { PhasePlaceholder } from '@/screens/PhasePlaceholder'
import { Sources } from '@/screens/Sources'
import { useGame } from './store'

/**
 * The app: the shell plus one screen per phase. Screens that do not exist yet render a placeholder
 * plate; Tasks 13–15 swap them in here.
 */
export default function App() {
  const phase = useGame((s) => s.phase)
  const setPhase = useGame((s) => s.setPhase)
  // Where the Sources screen's "Back" returns to: the last phase that was not Sources.
  const lastPhase = useRef<Phase>(phase === 'sources' ? 'select' : phase)
  useEffect(() => {
    if (phase !== 'sources') lastPhase.current = phase
  }, [phase])

  const renderScreen = (p: Phase) => {
    switch (p) {
      case 'sources':
        return <Sources backTo={lastPhase.current} onBack={() => setPhase(lastPhase.current)} />
      case 'select':
        return <MissionSelect />
      case 'briefing':
        return <Briefing />
      case 'design':
        return <DesignWorkspace />
      default:
        return <PhasePlaceholder phase={p} />
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <AppShell renderScreen={renderScreen} />
      </TooltipProvider>
    </MotionConfig>
  )
}
