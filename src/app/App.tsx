import { MotionConfig } from 'motion/react'
import { useEffect, useRef } from 'react'
import { AppShell } from '@/components/AppShell'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Phase } from '@/game/flow'
import { Arrival } from '@/screens/Arrival'
import { Briefing } from '@/screens/Briefing'
import { Cruise } from '@/screens/Cruise'
import { DesignWorkspace } from '@/screens/design/DesignWorkspace'
import { Launch } from '@/screens/Launch'
import { MissionSelect } from '@/screens/MissionSelect'
import { Ops } from '@/screens/Ops'
import { Report } from '@/screens/Report'
import { Sources } from '@/screens/Sources'
import { useGame } from './store'

/** The app: the shell plus one screen per phase. */
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
      case 'launch':
        return <Launch />
      case 'cruise':
        return <Cruise />
      case 'arrival':
        return <Arrival />
      case 'ops':
        return <Ops />
      case 'report':
        return <Report />
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
