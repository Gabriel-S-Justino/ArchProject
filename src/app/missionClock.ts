// The date the top bar shows. Until the cruise and operations simulations keep their own clock
// (Tasks 13–15), the mission date follows the design: the launch date before and at launch, the
// arrival date from arrival on, and the opening of the launch window before a transfer is chosen.
import type { Phase } from '@/game/flow'
import { DEFAULT_PORKCHOP } from '@/physics/porkchop'

export interface MissionClock {
  /** What the date is, e.g. "Launch". */
  label: string
  jd: number
}

export function missionClock(phase: Phase, transfer: { depJd: number; arrJd: number } | null): MissionClock {
  if (!transfer) return { label: 'Window opens', jd: DEFAULT_PORKCHOP.depStartJd }
  switch (phase) {
    case 'cruise':
      return { label: 'Launched', jd: transfer.depJd }
    case 'arrival':
    case 'ops':
    case 'report':
      return { label: 'Arrival', jd: transfer.arrJd }
    default:
      return { label: 'Launch', jd: transfer.depJd }
  }
}
