import { useGame } from './store'

// Placeholder shell until the screens land (Tasks 11–15): shows the store's current phase so the
// dev URL flags can be checked in the browser.
export default function App() {
  const phase = useGame((s) => s.phase)
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background text-foreground">
      <h1 className="text-4xl font-semibold tracking-tight">Mission Architect</h1>
      <p className="text-sm text-muted-foreground" data-testid="phase">
        Phase: {phase}
      </p>
    </main>
  )
}
