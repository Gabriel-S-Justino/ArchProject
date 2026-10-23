// The date the top bar shows. Before launch it follows the design (the launch date, or the opening
// of the window before a transfer is chosen); in flight it follows the simulation: the cruise's
// current date, the arrival date, and in operations the date of the turn about to run (or the last
// one, once they are over).
import type { Phase } from '@/game/flow'
import { DEFAULT_PORKCHOP } from '@/physics/porkchop'

export interface MissionClock {
  /** What the date is, e.g. "Launch". */
  label: string
  jd: number
}

/** The simulation's own dates, when there is a flight. */
export interface FlightClock {
  /** Current cruise date, JD. */
  cruiseJd?: number | null
  /** Date of the next operations turn (or the last one run), JD. */
  opsJd?: number | null
}

export function missionClock(
  phase: Phase,
  transfer: { depJd: number; arrJd: number } | null,
  flight: FlightClock = {},
): MissionClock {
  if (!transfer) return { label: 'Window opens', jd: DEFAULT_PORKCHOP.depStartJd }
  const day = (jd: number) => Math.max(0, Math.floor(jd - transfer.depJd + 1e-6))
  switch (phase) {
    case 'cruise': {
      const jd = flight.cruiseJd ?? transfer.depJd
      return { label: `Cruise · day ${day(jd)}`, jd }
    }
    case 'arrival':
      return { label: 'Arrival', jd: transfer.arrJd }
    case 'ops':
      return flight.opsJd != null ? { label: 'Operations', jd: flight.opsJd } : { label: 'Arrival', jd: transfer.arrJd }
    case 'report':
      if (flight.opsJd != null) return { label: 'Mission end', jd: flight.opsJd }
      if (flight.cruiseJd != null) return { label: 'Arrival', jd: transfer.arrJd }
      return { label: 'Launch', jd: transfer.depJd }
    default:
      return { label: 'Launch', jd: transfer.depJd }
  }
}
