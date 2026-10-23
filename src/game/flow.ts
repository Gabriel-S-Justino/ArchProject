// The phase machine: which screen comes next and which screens the current game state may enter.
// Pure rules over a GameSnapshot; the Zustand store (src/app/store.ts) applies them.
// Framework-free: no React, Three.js or DOM.
import { canLaunch, type MissionDesign } from './checklist'

export type Phase = 'select' | 'briefing' | 'design' | 'launch' | 'cruise' | 'arrival' | 'ops' | 'report' | 'sources'

export const PHASES: readonly Phase[] = [
  'select',
  'briefing',
  'design',
  'launch',
  'cruise',
  'arrival',
  'ops',
  'report',
  'sources',
]

/** The state the phase rules look at. */
export interface GameSnapshot {
  design: MissionDesign
  /** The rocket left the pad (whether or not it reached its target). */
  launched: boolean
  /** The spacecraft reached Mars (in orbit or as a flyby). */
  arrived: boolean
  /** Science operations finished. */
  opsDone: boolean
}

export function isPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value)
}

const LINEAR: Record<Phase, Phase> = {
  select: 'briefing',
  briefing: 'design',
  design: 'launch',
  launch: 'cruise',
  cruise: 'arrival',
  arrival: 'ops',
  ops: 'report',
  report: 'report',
  // 'sources' is a side screen reached from anywhere; "next" leaves it for mission select.
  sources: 'select',
}

/** The phase after `p` in select → briefing → design → launch → cruise → arrival → ops → report. */
export function nextPhase(p: Phase): Phase {
  return LINEAR[p]
}

/**
 * Whether the game may show phase `p` now:
 * - select, briefing, sources: always;
 * - design: always (the player gets there through briefing, but nothing in it needs gating);
 * - launch: only when every launch-checklist item passes (`canLaunch`);
 * - cruise, arrival: after a launch;
 * - ops: after arrival at Mars;
 * - report: after a launch. A launch that fails goes straight to the report, so the report does
 *   not require arrival or finished operations.
 */
export function canEnter(p: Phase, s: GameSnapshot): boolean {
  switch (p) {
    case 'select':
    case 'briefing':
    case 'sources':
    case 'design':
      return true
    case 'launch':
      return canLaunch(s.design)
    case 'cruise':
    case 'arrival':
    case 'report':
      return s.launched
    case 'ops':
      return s.arrived
  }
}
