// Briefing: the objective, the numbers the design is judged by, the 2026 window drawn to scale and a
// Δv map of the whole trip (who pays for which leg), then into the design workspace.
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { memoTransfer, useGame, useTransfer } from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { Timeline } from '@/components/Timeline'
import { MISSION } from '@/data/mission'
import { REFERENCE_DESIGN } from '@/game/checklist'
import { MU_EARTH, MU_MARS, R_MARS } from '@/physics/constants'
import { PARKING_RADIUS_M, ascentDeltaV } from '@/physics/launcher'
import { captureBurn, escapeBurn } from '@/physics/orbit'
import { DEFAULT_PORKCHOP } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import { GameBalance } from './design/controls'

export function Briefing() {
  const setPhase = useGame((s) => s.setPhase)
  const loadPorkchop = useGame((s) => s.loadPorkchop)
  useEffect(() => {
    void loadPorkchop() // the porkchop grid computes while the player reads
  }, [loadPorkchop])

  return (
    <div className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col px-10 pt-12 pb-10">
      <h1 className="max-w-[18ch] text-display font-semibold tracking-[-0.025em] text-balance [font-stretch:84%]">
        {MISSION.name} briefing
      </h1>
      <p className="mt-4 max-w-[62ch] text-lead text-ink-2">
        Put an orbiter around Mars to map the surface and search for buried ice. You choose the launch date, build the rocket
        and design the spacecraft; then you fly it and return as much science as you can within the budget.
      </p>

      <div className="mt-10 flex flex-col gap-12">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
          <Readout label="Budget cap" value={MISSION.budgetM} unit="US$ M" hint={<>Rocket + spacecraft · <GameBalance /></>} />
          <Readout label="Science target" value={MISSION.scienceTarget} unit="points" hint={<>Mapping and buried ice · <GameBalance /></>} />
          <Readout
            label="Capture orbit"
            value={`${formatNumber(MISSION.capturePeriapsisAltM / 1000)} × ${formatNumber(MISSION.captureApoapsisAltM / 1000)}`}
            unit="km"
            hint="Periapsis × apoapsis altitude"
          />
          <Readout
            label="Operations"
            value={MISSION.opsTurns * MISSION.turnDays}
            unit="days"
            hint={<>{MISSION.opsTurns} turns of {MISSION.turnDays} days · <GameBalance /></>}
          />
        </div>

        <WindowTimeline />
        <DvMap />
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-12">
        <ActionButton onClick={() => setPhase('design')} icon={<ArrowRight aria-hidden />}>
          Start design
        </ActionButton>
        <ActionButton tone="quiet" onClick={() => setPhase('select')}>
          <ArrowLeft aria-hidden className="size-4" />
          Missions
        </ActionButton>
      </div>
    </div>
  )
}

function WindowTimeline() {
  const transfer = useTransfer()
  const opsDays = MISSION.opsTurns * MISSION.turnDays
  const w = DEFAULT_PORKCHOP
  const start = w.depStartJd - 15
  const end = (transfer ? transfer.arrJd : w.arrEndJd) + opsDays + 20
  return (
    <section aria-labelledby="window-title">
      <h2 id="window-title" className="text-lead font-semibold [font-stretch:88%]">
        The late-2026 Mars window
      </h2>
      <p className="mt-1 max-w-[62ch] text-small text-ink-2">
        Earth and Mars line up for a cheap transfer about every 26 months. Departures from {formatJd(w.depStartJd)} to{' '}
        {formatJd(w.depEndJd)}, arrivals up to {formatJd(w.arrEndJd)}. Drawn to scale: one day is the same width everywhere.
      </p>
      <Timeline
        className="mt-6"
        label="Red Watch mission timeline"
        startJd={start}
        endJd={end}
        spans={[
          { fromJd: w.depStartJd, toJd: w.depEndJd, label: 'Launch window', tone: 'muted' },
          ...(transfer
            ? [
                { fromJd: transfer.depJd, toJd: transfer.arrJd, label: `Cruise · ${Math.round(transfer.tofDays)} days`, tone: 'accent' as const },
                { fromJd: transfer.arrJd, toJd: transfer.arrJd + opsDays, label: `Operations · ${opsDays} days`, tone: 'ink' as const },
              ]
            : [{ fromJd: w.arrStartJd, toJd: w.arrEndJd, label: 'Possible arrivals', tone: 'muted' as const }]),
        ]}
        events={
          transfer
            ? [
                { jd: transfer.depJd, label: `Launch ${formatJd(transfer.depJd)}`, tone: 'accent' },
                { jd: transfer.arrJd, label: `Arrival ${formatJd(transfer.arrJd)}`, tone: 'accent' },
              ]
            : []
        }
      />
    </section>
  )
}

interface Leg {
  name: string
  dv: number
  payer: 'Rocket' | 'Spacecraft'
  how: string
}

/**
 * Δv of each leg for the player's transfer, or the window's minimum-C3 transfer before one is chosen.
 * Ascent at the reference liftoff TWR 1.5 (game balance, LSP-calibrated); departure from the 200 km
 * parking orbit to the transfer's C3; capture into the 300 × 33,000 km orbit at the arrival v∞.
 */
function DvMap() {
  const chosen = useTransfer()
  const ref = REFERENCE_DESIGN.transfer!
  const reference = memoTransfer(ref.depJd, ref.arrJd)
  const t = chosen ?? reference
  const reserve = useGame((s) => s.design.spacecraft.tcmReserveMs)

  const legs: Leg[] = useMemo(() => {
    if (!t) return []
    return [
      { name: 'Ascent to a 200 km parking orbit', dv: ascentDeltaV(1.5), payer: 'Rocket', how: 'Orbital speed plus gravity and drag losses' },
      {
        name: 'Departure burn to Mars',
        dv: escapeBurn(MU_EARTH, PARKING_RADIUS_M, Math.sqrt(t.c3) * 1000),
        payer: 'Rocket',
        how: `C3 ${formatNumber(t.c3, 2)} km²/s² from the parking orbit`,
      },
      { name: 'Course corrections in cruise', dv: reserve, payer: 'Spacecraft', how: 'Your reserve for trajectory corrections' },
      {
        name: 'Mars orbit insertion',
        dv: captureBurn(MU_MARS, R_MARS + MISSION.capturePeriapsisAltM, R_MARS + MISSION.captureApoapsisAltM, t.vInfArrKms * 1000),
        payer: 'Spacecraft',
        how: `Braking from v∞ ${formatNumber(t.vInfArrKms, 2)} km/s into the capture orbit`,
      },
    ]
  }, [t, reserve])
  const total = legs.reduce((a, l) => a + (Number.isFinite(l.dv) ? l.dv : 0), 0)
  if (!t || total <= 0) return null

  return (
    <section aria-labelledby="dv-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="dv-title" className="text-lead font-semibold [font-stretch:88%]">
          Δv map: what the trip costs
        </h2>
        <p className="num text-detail text-ink-3">
          {chosen ? `Your transfer, ${formatJd(t.depJd)} → ${formatJd(t.arrJd)}` : `Minimum-C3 transfer, ${formatJd(t.depJd)} → ${formatJd(t.arrJd)}`}
        </p>
      </div>
      <p className="mt-1 max-w-[62ch] text-small text-ink-2">
        Δv is the change of speed each leg needs. Bars are to scale. The rocket pays for leaving Earth; the spacecraft
        carries its own propellant for everything after.
      </p>

      <div className="mt-6" aria-hidden>
        <div className="flex h-3 gap-[2px]">
          {legs.map((l) => (
            <div
              key={l.name}
              className={l.payer === 'Rocket' ? 'bg-ink-3' : 'bg-ink'}
              style={{ flexGrow: Math.max(l.dv, total * 0.004), flexBasis: 0 }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex gap-[2px] text-label text-ink-3">
          {(['Rocket', 'Spacecraft'] as const).map((payer) => {
            const dv = legs.filter((l) => l.payer === payer).reduce((a, l) => a + l.dv, 0)
            return (
              <div key={payer} className="num border-t border-rule-strong pt-1" style={{ flexGrow: Math.max(dv, total * 0.06), flexBasis: 0 }}>
                <span className="label-caps">{payer}</span> {formatNumber(dv)} m/s
              </div>
            )
          })}
        </div>
      </div>

      <ol className="mt-5 flex flex-col">
        {legs.map((l, i) => (
          <li key={l.name} className="grid grid-cols-[1.5rem_minmax(0,1fr)_7rem_6.5rem] items-baseline gap-x-4 border-b border-rule py-2">
            <span className="num text-label text-ink-3">{i + 1}</span>
            <span className="min-w-0">
              <span className="block text-small text-ink">{l.name}</span>
              <span className="num block text-detail text-ink-3">
                {l.how}
                {i === 0 && (
                  <>
                    {' '}
                    · at liftoff TWR 1.5, <GameBalance />
                  </>
                )}
              </span>
            </span>
            <span className="num text-right text-small font-medium text-ink">
              {formatNumber(l.dv)} <span className="text-detail font-normal text-ink-2">m/s</span>
            </span>
            <span className="label-caps text-right text-ink-2">{l.payer}</span>
          </li>
        ))}
        <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_7rem_6.5rem] items-baseline gap-x-4 py-2">
          <span />
          <span className="text-small font-semibold text-ink">Total</span>
          <span className="num text-right text-small font-semibold text-ink">
            {formatNumber(total)} <span className="text-detail font-normal text-ink-2">m/s</span>
          </span>
          <span />
        </li>
      </ol>
    </section>
  )
}
