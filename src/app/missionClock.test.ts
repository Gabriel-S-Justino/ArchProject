import { describe, expect, it } from 'vitest'
import { DEFAULT_PORKCHOP } from '@/physics/porkchop'
import { missionClock } from './missionClock'

const t = { depJd: 2461345.5, arrJd: 2461637.5 }

describe('missionClock', () => {
  it('shows the window opening before a transfer is chosen', () => {
    expect(missionClock('design', null)).toEqual({ label: 'Window opens', jd: DEFAULT_PORKCHOP.depStartJd })
  })

  it('follows the cruise simulation date and counts mission days', () => {
    expect(missionClock('cruise', t, { cruiseJd: t.depJd + 42.4 })).toEqual({ label: 'Cruise · day 42', jd: t.depJd + 42.4 })
    expect(missionClock('cruise', t).jd).toBe(t.depJd)
  })

  it('follows the operations turn date, and ends the report on the last date reached', () => {
    expect(missionClock('ops', t, { opsJd: t.arrJd + 60 })).toEqual({ label: 'Operations', jd: t.arrJd + 60 })
    expect(missionClock('report', t, { cruiseJd: t.arrJd, opsJd: t.arrJd + 150 }).label).toBe('Mission end')
    expect(missionClock('report', t, { cruiseJd: t.arrJd })).toEqual({ label: 'Arrival', jd: t.arrJd })
    expect(missionClock('report', t)).toEqual({ label: 'Launch', jd: t.depJd })
    expect(missionClock('launch', t)).toEqual({ label: 'Launch', jd: t.depJd })
  })
})
