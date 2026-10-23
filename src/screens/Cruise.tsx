// Cruise: the flight from Earth to Mars along the Lambert arc. Time warp runs the two-body
// simulation and stops by itself at each trajectory correction window, at each solar flare (real
// NASA DONKI events) and 3 days before arrival. Each stop is a decision: burn or wait, and how to
// ride out the flare. The large slot is the 3D cruise view (planets and ship on the mission clock,
// the flown arc, the predicted path, flare hits); the 2D map stands in without WebGL.
import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame, useTransfer } from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { DecisionCard } from '@/components/DecisionCard'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { Timeline, type TimelineEvent } from '@/components/Timeline'
import { TimeWarp, type WarpRate } from '@/components/TimeWarp'
import { MISSION } from '@/data/mission'
import { APPROACH_STOP_DAYS, nextStop, pendingDecision, type CruiseProgress, type CruiseStopKind } from '@/game/autoplay'
import { CAPTURE_MAX_MISS_KM, applyTcm, burnPropellantKg, nextTcmWindow, predictArrival, tcmQuote, tcmWindows } from '@/game/cruise'
import { EVENT_RULES, eventOptions } from '@/game/events'
import type { MissionDesign } from '@/game/checklist'
import { MU_MARS, R_MARS } from '@/physics/constants'
import { bodyState } from '@/physics/ephemeris'
import { captureBurn } from '@/physics/orbit'
import type { Transfer } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import { norm, sub } from '@/physics/vec'
import { SolarSystemView } from '@/scenes/SceneSlot'
import type { Focus, ShipView } from '@/scenes/SolarSystem'
import { useWebGL2 } from '@/scenes/webgl'
import { GameBalance } from './design/controls'
import { AimTarget, CruiseMap } from './flight/CruiseMap'
import { Fact, NoFlight, Plate, PlateActions, PlateTitle } from './flight/plate'

const STOP_TEXT: Record<CruiseStopKind | 'stalled', string> = {
  stalled: 'Time warp stopped: the orbit propagator could not move the spacecraft from here. Try a slower rate, or revise the design.',
  tcm: 'Time warp stopped: a trajectory correction window is open.',
  event: 'Time warp stopped: a solar flare.',
  approach: `Time warp stopped ${APPROACH_STOP_DAYS} days before arrival. No correction window is left: what you see is how you arrive.`,
  arrival: 'Arrived at Mars. Time to brake into orbit.',
}

export function Cruise() {
  const cruise = useGame((s) => s.cruise)
  const launch = useGame((s) => s.launch)
  const beginCruise = useGame((s) => s.beginCruise)
  const setPhase = useGame((s) => s.setPhase)
  const transfer = useTransfer()
  if (!cruise || !transfer) {
    return launch && !launch.failure ? (
      <NoFlight title="Cruise to Mars" line="The spacecraft is on its way out of Earth orbit." action="Begin the cruise" onAction={() => beginCruise()} />
    ) : (
      <NoFlight title="Cruise to Mars" line="Nothing is flying yet: launch from the design workspace first." action="Open the design" onAction={() => setPhase('design')} />
    )
  }
  return <CruiseFlight cruise={cruise} transfer={transfer} />
}

function CruiseFlight({ cruise, transfer }: { cruise: CruiseProgress; transfer: Transfer }) {
  const design = useGame((s) => s.design)
  const tickCruise = useGame((s) => s.tickCruise)
  const setPhase = useGame((s) => s.setPhase)
  const [rate, setRate] = useState<WarpRate>(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [focus, setFocus] = useState<Focus>('sun')
  const gl = useWebGL2()

  const sim = cruise.sim
  const pending = pendingDecision(cruise)
  const stop = nextStop(cruise)
  const atArrival = sim.jd >= sim.arrJd
  const predicted = predictArrival(sim)
  const day = Math.floor(sim.jd - sim.depJd + 1e-6)
  const total = Math.round(sim.arrJd - sim.depJd)
  const marsKm = norm(sub(sim.ship.r, bodyState('mars', sim.jd).r)) / 1000
  const moiDv = captureBurn(MU_MARS, R_MARS + MISSION.capturePeriapsisAltM, R_MARS + MISSION.captureApoapsisAltM, predicted.vInfKms * 1000)
  const moiKg = burnPropellantKg(sim, moiDv)
  const canBrake = moiKg <= sim.propellantKg
  const inReach = predicted.missKm <= CAPTURE_MAX_MISS_KM
  const last = cruise.log[cruise.log.length - 1]

  // A new decision scrolls into view (on a laptop screen it sits below the readouts). It locks the
  // warp's rates, so keyboard focus that was on them (or nowhere) moves to the decision's heading.
  const decisionRef = useRef<HTMLDivElement>(null)
  const warpRef = useRef<HTMLDivElement>(null)
  const pendingKey = pending ? (pending.kind === 'tcm' ? pending.id : pending.event.id) : null
  useEffect(() => {
    if (!pendingKey) return
    decisionRef.current?.scrollIntoView({ block: 'nearest' })
    const active = document.activeElement
    if (!active || active === document.body || warpRef.current?.contains(active)) {
      decisionRef.current?.querySelector<HTMLElement>('h2[tabindex]')?.focus({ preventScroll: true })
    }
  }, [pendingKey])

  // The 3D view: a flare reaching the ship plays its hit once (keyed by the event) and centres on it.
  const flareKey = pending?.kind === 'event' ? pending.event.id : null
  useEffect(() => {
    if (flareKey) setFocus('ship')
  }, [flareKey])
  const shipView = useMemo<ShipView>(
    () => ({ state: sim.ship, depJd: sim.depJd, arrJd: sim.arrJd, design: design.spacecraft, damaged: sim.damaged, flareKey }),
    [sim.ship, sim.depJd, sim.arrJd, design.spacecraft, sim.damaged, flareKey],
  )

  const lockedReason = pending
    ? `Decide first: ${pending.kind === 'tcm' ? pending.id : `the ${pending.event.flare.classType} flare`}.`
    : atArrival
      ? 'The cruise is over.'
      : undefined

  const onAdvance = (days: number) => {
    const reached = tickCruise(days)
    if (reached) setNotice(STOP_TEXT[reached])
    return reached
  }

  return (
    <Plate wide>
      <PlateTitle
        title="Cruise to Mars"
        line={
          <>
            Day <span className="num">{formatNumber(day)}</span> of <span className="num">{formatNumber(total)}</span> on the transfer arc,
            arriving {formatJd(sim.arrJd)}. Time warp stops at every correction window and flare.
          </>
        }
      />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(21rem,1fr)]">
        <div className="flex flex-col gap-3">
          <div
            data-slot="cruise-3d"
            className="relative aspect-square max-h-[min(36rem,calc(100dvh-15rem))] w-full border border-rule bg-ground-sunken"
          >
            <SolarSystemView
              jd={sim.jd}
              transfer={transfer}
              ship={shipView}
              focus={focus}
              onFocusChange={setFocus}
              reserveBottomRight
              // Left of the aim target in the bottom-right corner.
              noteClassName="absolute bottom-2 left-3 right-[calc(clamp(9rem,30%,12rem)+1rem)]"
              fallback={<CruiseMap sim={sim} transfer={transfer} />}
            />
            <AimTarget sim={sim} className="absolute right-2 bottom-2 w-[clamp(9rem,30%,12rem)] border border-rule bg-ground-sunken" />
          </div>
          <p className="text-detail text-ink-3">
            Positions from JPL Horizons ephemerides; the ship flies a two-body orbit around the Sun (patched conics). Solid rust: flown;
            dashed rust: where the ship goes if nothing changes{gl ? '; dashed grey: the planned transfer. Drag to turn the view' : ''}.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Readout
              label="Arrival-day distance"
              value={Number.isFinite(predicted.missKm) ? predicted.missKm : NaN}
              unit="km"
              status={inReach ? 'ok' : 'bad'}
              hint={`From Mars on ${formatJd(sim.arrJd)} · capture ≤ ${formatNumber(CAPTURE_MAX_MISS_KM)} km`}
            />
            <Readout label="Propellant" value={sim.propellantKg} digits={1} unit="kg" status={canBrake ? 'ok' : 'bad'} hint={`Capture burn needs ${formatNumber(moiKg, 1)} kg`} />
            <Readout label="Arrival v∞" value={predicted.vInfKms} digits={2} unit="km/s" hint={`Capture Δv ${formatNumber(moiDv)} m/s`} />
            <Readout label="Distance to Mars now" value={marsKm / 1e6} digits={1} unit="million km" hint={`${formatNumber(Math.max(0, sim.arrJd - sim.jd))} days to go`} />
          </div>

          <div ref={warpRef}>
            <TimeWarp rate={rate} onRateChange={setRate} onAdvance={onAdvance} lockedReason={lockedReason} />
          </div>
          {!pending && !atArrival && stop && (
            <p className="num -mt-4 text-detail text-ink-3">
              Next stop: {stopLabel(stop.kind, cruise)} on {formatJd(stop.jd)}, in {formatNumber(Math.ceil(stop.jd - sim.jd - 1e-6))} days.
            </p>
          )}

          <div ref={decisionRef} className="flex scroll-mb-6 flex-col gap-2">
            {pending?.kind === 'tcm' && <TcmPrompt cruise={cruise} id={pending.id} />}
            {pending?.kind === 'event' && <FlarePrompt cruise={cruise} design={design} />}
            {/* Only the outcome lines are live: a decision card is reached by focus, not read out whole. */}
            <div aria-live="polite" className="flex flex-col gap-2">
              {!pending && notice && <p className="text-small text-ink-2">{notice}</p>}
              {last && (
                <p className="num text-detail text-ink-3">
                  <span className="label-caps text-ink-2">Last decision</span> {formatJd(last.jd)} · {last.text}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <section aria-labelledby="cruise-timeline" className="mt-10">
        <h2 id="cruise-timeline" className="text-lead font-semibold [font-stretch:88%]">
          The cruise, to scale
        </h2>
        <CruiseTimeline cruise={cruise} />
      </section>

      <PlateActions>
        {atArrival ? (
          <ActionButton onClick={() => setPhase('arrival')} icon={<ArrowRight aria-hidden />}>
            Approach Mars
          </ActionButton>
        ) : (
          <p className="text-detail text-ink-3">Mars orbit insertion opens on the arrival date, {formatJd(sim.arrJd)}.</p>
        )}
      </PlateActions>
    </Plate>
  )
}

function stopLabel(kind: CruiseStopKind, cruise: CruiseProgress): string {
  if (kind === 'tcm') return nextTcmWindow(cruise.sim)?.id ?? 'Correction window'
  if (kind === 'event') return 'Space weather'
  if (kind === 'approach') return 'Final approach'
  return 'Arrival'
}

function TcmPrompt({ cruise, id }: { cruise: CruiseProgress; id: string }) {
  const burnTcm = useGame((s) => s.burnTcm)
  const skipTcm = useGame((s) => s.skipTcm)
  const sim = cruise.sim
  const quote = tcmQuote(sim)
  const wait = predictArrival(sim)
  const after = useMemo(() => {
    if (!quote.available) return null
    const next = applyTcm(sim)
    return 'error' in next ? null : predictArrival(next)
  }, [sim, quote.available])
  const later = tcmWindows(sim).find((w) => w.jd > sim.jd + 1e-6)
  const reasonId = `tcm-why-${id}`

  return (
    <section aria-labelledby={`tcm-${id}`} className="border-t-2 border-mars pt-3">
      <h2 id={`tcm-${id}`} tabIndex={-1} className="text-title font-semibold [font-stretch:88%]">
        {id}: trajectory correction window
      </h2>
      <p className="mt-1 text-detail text-ink-2">
        The launch left a small velocity error. A burn now re-aims the arc at Mars' position on the arrival date; the earlier the
        correction, the less it costs.{later ? ` Another window opens on ${formatJd(later.jd)}, and it may still be needed.` : ' This is the last window.'}
      </p>
      <dl className="mt-3">
        <Fact label="Cost now">
          {quote.available ? (
            <>
              {formatNumber(quote.dvMs, 2)} m/s · {formatNumber(quote.propellantKg, 1)} kg of propellant
            </>
          ) : (
            '–'
          )}
        </Fact>
        <Fact label="If you wait">
          {formatNumber(wait.missKm)} km from Mars on {formatJd(sim.arrJd)}
        </Fact>
        {after && (
          <Fact label="After the burn">
            {formatNumber(after.missKm)} km from Mars on {formatJd(sim.arrJd)}
          </Fact>
        )}
        <Fact label="Propellant">
          {formatNumber(sim.propellantKg, 1)} kg on board{quote.available ? `, ${formatNumber(sim.propellantKg - quote.propellantKg, 1)} kg after` : ''}
        </Fact>
      </dl>
      <p className="mt-2 text-detail text-ink-3">Capture needs {formatNumber(CAPTURE_MAX_MISS_KM)} km or closer.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <ActionButton disabled={!quote.available} aria-describedby={!quote.available ? reasonId : undefined} onClick={() => burnTcm()}>
          Burn now
        </ActionButton>
        <ActionButton tone="quiet" onClick={() => skipTcm()}>
          Wait
        </ActionButton>
      </div>
      {!quote.available && (
        <p id={reasonId} className="mt-2 text-detail text-nogo">
          <span className="label-caps">No-go</span> {quote.reason}
        </p>
      )}
    </section>
  )
}

function FlarePrompt({ cruise, design }: { cruise: CruiseProgress; design: MissionDesign }) {
  const resolve = useGame((s) => s.resolveCruiseEvent)
  const pending = pendingDecision(cruise)
  if (pending?.kind !== 'event') return null
  const options = eventOptions(pending.event, design, cruise.sim)
  const shieldPct = Math.round(cruise.sim.shield * 100)
  return (
    <DecisionCard
      event={pending.event}
      jd={pending.jd}
      options={options}
      onChoose={(id) => resolve(id)}
      note={
        <>
          Risks, costs and rewards are <GameBalance />: base damage risk {Math.round(EVENT_RULES.baseRisk.moderate * 100)}% for an M-class
          and {Math.round(EVENT_RULES.baseRisk.severe * 100)}% for an X-class flare; your shielding removes {shieldPct}% of it. Safe
          mode costs score (5 points per 10 days).
        </>
      }
    />
  )
}

function CruiseTimeline({ cruise }: { cruise: CruiseProgress }) {
  const sim = cruise.sim
  const events: TimelineEvent[] = [
    ...tcmWindows(sim).map((w) => {
      const burned = sim.tcms.some((t) => Math.abs(t.jd - w.jd) < 1e-3)
      const skipped = cruise.decidedTcms.includes(w.id) && !burned
      return {
        jd: w.jd,
        label: `${w.id}${burned ? ' burned' : skipped ? ' skipped' : ''}`,
        tone: burned ? ('accent' as const) : skipped ? ('muted' as const) : ('ink' as const),
      }
    }),
    ...sim.events.map((r) => ({ jd: sim.depJd + r.event.day, label: `${r.event.flare.classType} flare`, tone: 'warn' as const })),
  ]
  return (
    <Timeline
      className="mt-4"
      label="Cruise timeline"
      startJd={sim.depJd}
      endJd={sim.arrJd}
      spans={[{ fromJd: sim.depJd, toJd: sim.arrJd, label: `Cruise · ${Math.round(sim.arrJd - sim.depJd)} days`, tone: 'accent' }]}
      events={events.sort((a, b) => a.jd - b.jd)}
      nowJd={sim.jd}
    />
  )
}
