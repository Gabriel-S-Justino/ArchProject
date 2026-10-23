// Launch: the player's own rocket flies the numbers the design computed. The event list comes from
// launchTimeline (stage burn times from propellant mass and mass flow, staging when each stage is
// spent); playback compresses the real burn seconds into a few seconds and ticks the separations off
// the stack diagram. The large slot is the launch view (2D here; Task 14 mounts the 3D scene).
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useGame, useRocketStats, useTransfer } from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { Gauge } from '@/components/Gauge'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { MISSION } from '@/data/mission'
import type { LaunchOutcome } from '@/game/autoplay'
import { cn } from '@/lib/utils'
import { MIN_LIFTOFF_TWR, ascentDeltaV, requiredDeltaV, type LaunchEvent, type RocketStats } from '@/physics/launcher'
import { formatJd } from '@/physics/time'
import { StackElevation, type StackDropped } from './design/StackElevation'
import { NoFlight, Plate, PlateActions, PlateTitle } from './flight/plate'
import { vehicleName } from './flight/vehicle'

/** Real burn time is replayed this fast: the whole ascent and departure in about 8 seconds. */
const PLAYBACK_S = 8
/** A pad abort still holds for this long, engines at full thrust, before the verdict. */
const MIN_PLAYBACK_S = 1.6

function eventLabel(e: LaunchEvent, c3: number): string {
  switch (e.kind) {
    case 'liftoff':
      return 'Ignition and liftoff'
    case 'booster-sep':
      return 'Strap-on boosters separate'
    case 'stage-sep':
      return `Stage ${(e.stage ?? 0) + 1} separates`
    case 'fairing-sep':
      return 'Payload fairing jettisoned'
    case 'orbit':
      return `Parking orbit, ${formatNumber(MISSION.parkingAltitudeM / 1000)} km`
    case 'departure-burn':
      return `Departure burn complete, C3 ${formatNumber(c3, 2)} km²/s²`
  }
}

/** Δv delivered when the event happens, m/s, where the model gives it exactly (else NaN → "–"). */
function eventDv(e: LaunchEvent, stats: RocketStats, c3: number): number {
  switch (e.kind) {
    case 'liftoff':
      return 0
    case 'stage-sep':
      return stats.stages.slice(0, (e.stage ?? 0) + 1).reduce((a, s) => a + s.dv, 0)
    case 'orbit':
      return ascentDeltaV(stats.liftoffTwr)
    case 'departure-burn':
      return requiredDeltaV(c3, stats.liftoffTwr)
    default:
      return NaN
  }
}

const tPlus = (t: number) => {
  const s = Math.max(0, Math.round(t))
  return `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Launch() {
  const launch = useGame((s) => s.launch)
  const startLaunch = useGame((s) => s.startLaunch)
  const transfer = useTransfer()
  if (!launch) {
    return (
      <NoFlight
        title="Launch"
        line={transfer ? `Every check is go. The window opens on ${formatJd(transfer.depJd)}.` : 'Every check is go.'}
        action="Launch"
        onAction={() => startLaunch()}
      />
    )
  }
  return <LaunchFlight launch={launch} />
}

function LaunchFlight({ launch }: { launch: LaunchOutcome }) {
  const design = useGame((s) => s.design)
  const beginCruise = useGame((s) => s.beginCruise)
  const setPhase = useGame((s) => s.setPhase)
  const reviseDesign = useGame((s) => s.reviseDesign)
  const stats = useRocketStats()
  const transfer = useTransfer()
  const reduced = useReducedMotion()
  const { timeline, c3, failure } = launch
  const tEnd = timeline.events.reduce((m, e) => Math.max(m, e.t), 0)
  const [run, setRun] = useState(0)
  const [t, setT] = useState(reduced ? Infinity : 0)

  // Playback clock: real burn seconds compressed into PLAYBACK_S.
  useEffect(() => {
    if (reduced) {
      setT(Infinity)
      return
    }
    setT(0)
    const wall = Math.max(MIN_PLAYBACK_S, tEnd > 0 ? PLAYBACK_S : 0)
    const speed = tEnd > 0 ? tEnd / PLAYBACK_S : 0
    const t0 = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const s = (now - t0) / 1000
      if (s >= wall) {
        setT(Infinity)
        return
      }
      setT(s * speed)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [run, reduced, tEnd])

  const done = t === Infinity
  const passed = timeline.events.filter((e) => e.t <= t)
  const dropped: StackDropped = {
    boosters: passed.some((e) => e.kind === 'booster-sep'),
    stages: passed.filter((e) => e.kind === 'stage-sep').length,
    fairing: passed.some((e) => e.kind === 'fairing-sep'),
  }
  const ascent = ascentDeltaV(stats.liftoffTwr)
  const required = requiredDeltaV(c3, stats.liftoffTwr)
  const twrOk = stats.liftoffTwr >= MIN_LIFTOFF_TWR
  const name = useMemo(() => vehicleName(design.rocket), [design.rocket])

  return (
    <Plate wide>
      <PlateTitle
        title="Launch"
        line={
          <>
            {name} with the {formatNumber(launch.payloadKg)} kg spacecraft, to C3 {formatNumber(c3, 2)} km²/s²
            {transfer ? ` on ${formatJd(transfer.depJd)}` : ''}.
          </>
        }
      />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div
          data-slot="launch-3d"
          className="relative flex h-[min(34rem,calc(100dvh-15rem))] items-end justify-center border border-rule bg-ground-sunken px-4 pt-4"
        >
          <div className={cn('h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]')}>
            <StackElevation rocket={design.rocket} dropped={dropped} />
          </div>
          <span className="num absolute top-3 left-3 text-title font-medium text-ink" aria-live="off">
            {done ? tPlus(tEnd) : tPlus(t)}
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 xl:grid-cols-3">
            <Readout
              label="Liftoff TWR"
              value={stats.liftoffTwr}
              digits={2}
              status={twrOk ? 'ok' : 'bad'}
              hint={`Minimum ${formatNumber(MIN_LIFTOFF_TWR, 1)} (game balance)`}
            />
            <Readout label="Stack Δv" value={stats.totalDv} unit="m/s" hint="With the spacecraft aboard" />
            <Readout
              label="Δv required"
              value={required}
              unit="m/s"
              hint={`${formatNumber(ascent)} to orbit + ${formatNumber(required - ascent)} departure`}
            />
          </div>
          <Gauge
            label="Δv delivered vs required"
            value={stats.totalDv}
            max={Math.max(stats.totalDv, Number.isFinite(required) ? required : 0) * 1.08}
            threshold={Number.isFinite(required) ? required : undefined}
            limit="floor"
            thresholdLabel="required"
            unit="m/s"
          />

          <section aria-labelledby="launch-events">
            <h2 id="launch-events" className="label-caps text-ink-3">
              Flight events · burn time from the rocket equation
            </h2>
            <ol className="mt-2">
              {timeline.events.map((e, i) => {
                const reached = e.t <= t
                return (
                  <li
                    key={`${e.kind}-${i}`}
                    className={cn(
                      'grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] items-baseline gap-x-4 border-b border-rule py-1.5 transition-colors',
                      reached ? 'text-ink' : 'text-ink-3',
                    )}
                  >
                    <span className="num text-detail">{tPlus(e.t)}</span>
                    <span className="text-small">{eventLabel(e, c3)}</span>
                    <span className="num text-right text-detail">
                      {Number.isFinite(eventDv(e, stats, c3)) ? `${formatNumber(eventDv(e, stats, c3))} m/s` : '–'}
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>

          <div aria-live="polite">
            {done && (failure ? <Failure launch={launch} stats={stats} required={required} ascent={ascent} /> : <Success launch={launch} />)}
          </div>
        </div>
      </div>

      <PlateActions>
        {failure ? (
          <ActionButton disabled={!done} onClick={() => setPhase('report')} icon={<ArrowRight aria-hidden />}>
            Read the report
          </ActionButton>
        ) : (
          <ActionButton disabled={!done} onClick={() => beginCruise() || setPhase('cruise')} icon={<ArrowRight aria-hidden />}>
            Into cruise
          </ActionButton>
        )}
        {!done && <p className="text-detail text-ink-3">The flight is replayed at about {formatNumber(tEnd / PLAYBACK_S)}× speed.</p>}
        <ActionButton tone="quiet" onClick={() => setRun((r) => r + 1)}>
          <RotateCcw aria-hidden className="size-4" />
          Replay
        </ActionButton>
        {failure && (
          <ActionButton tone="quiet" onClick={() => reviseDesign()}>
            <ArrowLeft aria-hidden className="size-4" />
            Revise design
          </ActionButton>
        )}
      </PlateActions>
    </Plate>
  )
}

function Success({ launch }: { launch: LaunchOutcome }) {
  return (
    <div className="border-t border-go pt-2">
      <p className="text-small text-ink">
        <span className="label-caps text-go">Go</span> The upper stage has put the spacecraft on its way to Mars at C3{' '}
        <span className="num">{formatNumber(launch.c3, 2)}</span> km²/s². The launch vehicle's job is done; from here the spacecraft
        flies on its own propellant.
      </p>
    </div>
  )
}

function Failure({ launch, stats, required, ascent }: { launch: LaunchOutcome; stats: RocketStats; required: number; ascent: number }) {
  const text =
    launch.failure === 'pad'
      ? `The engines light, but they push with only ${formatNumber(stats.liftoffTwr, 2)} times the stack's weight. Below ${formatNumber(MIN_LIFTOFF_TWR, 1)} the rocket climbs so slowly that gravity eats the propellant, so the flight is aborted on the pad.`
      : launch.failure === 'orbit'
        ? `The stack ran out of Δv before orbit: reaching the ${formatNumber(MISSION.parkingAltitudeM / 1000)} km parking orbit needed ${formatNumber(ascent)} m/s at this liftoff TWR, and it had ${formatNumber(stats.totalDv)} m/s with the spacecraft aboard.`
        : `The spacecraft reached the parking orbit but the upper stage could not finish the departure burn: C3 ${formatNumber(launch.c3, 2)} km²/s² needed ${formatNumber(required)} m/s in total, the stack had ${formatNumber(stats.totalDv)} m/s. The spacecraft stays in Earth orbit.`
  const title = launch.failure === 'pad' ? 'Pad abort' : launch.failure === 'orbit' ? 'Short of orbit' : 'Short of the departure'
  return (
    <div className="border-t border-nogo pt-2">
      <p className="text-small text-ink">
        <span className="label-caps text-nogo">No-go · {title}</span> {text}
      </p>
    </div>
  )
}
