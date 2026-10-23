// Launch: the player's own rocket flies the numbers the design computed. The event list comes from
// launchTimeline (stage burn times from propellant mass and mass flow, staging when each stage is
// spent); playback compresses the real burn seconds (src/scenes/launchTiming.ts: about 25 s with the
// 3D view, a few seconds with the 2D drawing) and the HUD over the view shows the stage, the Δv
// spent of the Δv required and the current event. The 3D launch scene (lazy-loaded) fills the slot;
// the stack drawing ticks the separations off where WebGL is unavailable. Under reduced motion the
// result shows at once, with still frames of each event on request.
import { ArrowLeft, ArrowRight, RotateCcw, SkipForward } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  buildSchedule,
  burnoutTime,
  dvAt,
  eventsShown,
  realTimeAt,
  stageBurns,
  type LaunchSchedule,
  type SceneEvent,
  type ScheduleOptions,
} from '@/scenes/launchTiming'
import { LaunchView } from '@/scenes/SceneSlot'
import { useWebGL2 } from '@/scenes/webgl'
import { StackElevation, type StackDropped } from './design/StackElevation'
import { NoFlight, Plate, PlateActions, PlateTitle } from './flight/plate'
import { vehicleName } from './flight/vehicle'

/** Animation timing with the 3D view: about 25 s from ignition to the hand-back. */
const TIMING_3D: ScheduleOptions = { flightA: 19, preRollA: 2.5, holdA: 2.5 }
/** With the 2D drawing: about 8 s. */
const TIMING_2D: ScheduleOptions = { flightA: 6, preRollA: 0.4, holdA: 0.6, minGapA: 0.6, sameGapA: 0.3 }

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

/** The HUD's line for the latest event on screen (visual-only events included). */
function hudLabel(e: SceneEvent | undefined, failure: LaunchOutcome['failure'], c3: number): string {
  if (!e) return 'Terminal count'
  switch (e.kind) {
    case 'ignition':
      return 'Ignition'
    case 'liftoff':
      return failure === 'pad' ? 'Thrust below weight: holding on the pad' : 'Liftoff'
    case 'abort':
      return 'Pad abort: engines shut down'
    case 'cutoff':
      return failure === 'orbit' ? 'Engine cut-off: did not reach orbit' : 'Engine cut-off: did not reach the departure C3'
    case 'stage-sep':
      return `Stage ${(e.stage ?? 0) + 1} separation`
    case 'booster-sep':
      return 'Booster separation'
    case 'fairing-sep':
      return 'Fairing jettison'
    default:
      return eventLabel({ t: e.t, kind: e.kind, stage: e.stage }, c3)
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
  const reduced = useReducedMotion() === true
  const gl = useWebGL2()
  const { timeline, c3, failure } = launch

  const burns = useMemo(() => stageBurns(timeline.events, stats, failure), [timeline.events, stats, failure])
  const schedule = useMemo<LaunchSchedule>(
    () => buildSchedule(timeline.events, { ...(gl ? TIMING_3D : TIMING_2D), failure, burnoutT: burnoutTime(burns) }),
    [timeline.events, gl, failure, burns],
  )
  const tEnd = schedule.tEnd

  // Playback clock in animation seconds; the 3D scene reads `clock` every frame, React state drives
  // the HUD and the event list. Infinity = the sequence is over (or skipped).
  const [run, setRun] = useState(0)
  // With the 3D view, the clock waits for its first frame (at most 5 s), so ignition is not missed.
  const [ready, setReady] = useState(!gl || reduced)
  useEffect(() => {
    if (ready) return
    const id = setTimeout(() => setReady(true), 5000)
    return () => clearTimeout(id)
  }, [ready])
  const [a, setA] = useState(reduced ? Infinity : 0)
  const [still, setStill] = useState<number | null>(null)
  const clock = useRef(reduced ? schedule.endA : 0)
  const raf = useRef(0)
  // A Skip pressed before the 3D view's first frame stands: the clock must not restart when it arrives.
  const skipped = useRef(false)
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    if (reduced) {
      clock.current = schedule.endA
      setA(Infinity)
      return
    }
    if (skipped.current) return
    clock.current = 0
    setA(0)
    if (!ready) return
    const t0 = performance.now()
    const frame = (now: number) => {
      const s = (now - t0) / 1000
      if (s >= schedule.endA) {
        clock.current = schedule.endA
        setA(Infinity)
        return
      }
      clock.current = s
      setA(s)
      raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf.current)
  }, [run, reduced, schedule, ready])
  useEffect(() => {
    if (reduced) clock.current = still ?? schedule.endA
  }, [reduced, still, schedule])
  const onSceneReady = useCallback(() => setReady(true), [])
  const skip = () => {
    skipped.current = true
    cancelAnimationFrame(raf.current)
    clock.current = schedule.endA
    setA(Infinity)
  }

  const done = a === Infinity
  const aShown = done ? (reduced && still !== null ? still : schedule.endA) : a
  const t = realTimeAt(schedule, aShown)
  const shown = eventsShown(schedule, aShown)
  const reachedIndex = new Set(shown.flatMap((e) => (e.index !== undefined ? [e.index] : [])))
  const passed = timeline.events.filter((_, i) => done || reachedIndex.has(i))
  const dropped: StackDropped = {
    boosters: passed.some((e) => e.kind === 'booster-sep'),
    stages: passed.filter((e) => e.kind === 'stage-sep').length,
    fairing: passed.some((e) => e.kind === 'fairing-sep'),
  }
  const ascent = ascentDeltaV(stats.liftoffTwr)
  const required = requiredDeltaV(c3, stats.liftoffTwr)
  const twrOk = stats.liftoffTwr >= MIN_LIFTOFF_TWR
  const name = useMemo(() => vehicleName(design.rocket), [design.rocket])
  const spent = Math.min(dvAt(burns, t), failure ? Infinity : required)
  const nStages = design.rocket.stages.length
  // The stage on the HUD follows the separations shown (coincident events are shown one by one).
  const stageNow = Math.min(nStages - 1, shown.filter((e) => e.kind === 'stage-sep').length)
  const stills = schedule.events.filter((e) => e.kind !== 'ignition')

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

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <div
            data-slot="launch-3d"
            className="relative h-[min(38rem,calc(100dvh-14rem))] min-h-[22rem] overflow-hidden border border-rule bg-ground-sunken"
          >
            <LaunchView
              rocket={design.rocket}
              schedule={schedule}
              burns={burns}
              liftoffTwr={stats.liftoffTwr}
              clock={clock}
              playing={!done}
              frameKey={still ?? -1}
              onReady={onSceneReady}
              fallback={
                <div className="absolute inset-0 flex items-end justify-center px-4 pt-16 pb-14">
                  <StackElevation rocket={design.rocket} dropped={dropped} />
                </div>
              }
            />
            <LaunchHud
              clock={tPlus(t)}
              label={hudLabel(shown.at(-1), failure, c3)}
              stage={nStages ? `${Math.max(1, stageNow + 1)} of ${nStages}` : '–'}
              spent={spent}
              required={required}
              failed={done && failure !== undefined}
              onReplay={
                reduced
                  ? undefined
                  : () => {
                      skipped.current = false
                      setRun((r) => r + 1)
                    }
              }
              onSkip={done ? undefined : skip}
            />
          </div>
          {reduced && (
            <div role="group" aria-label="Still frames of the flight" className="mt-2 flex flex-wrap items-center gap-1">
              <span className="label-caps mr-2 text-ink-3">Still frame</span>
              {stills.map((e, i) => {
                // A moment after the event, before the next one takes over the HUD.
                const next = stills[i + 1]?.a ?? Infinity
                const at = e.a + Math.min(e.kind === 'liftoff' ? 1.4 : /sep$/.test(e.kind) ? 0.9 : 0.4, (next - e.a) * 0.85)
                const on = still === null ? i === stills.length - 1 : Math.abs(still - at) < 1e-6
                return (
                  <button
                    key={`${e.kind}-${i}`}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setStill(at)}
                    className={cn(
                      'h-7 border px-2 text-detail transition-colors',
                      on ? 'border-ink-3 bg-ground-raised text-ink' : 'border-rule text-ink-2 hover:border-rule-strong hover:text-ink',
                    )}
                  >
                    {hudLabel(e, failure, c3).split(':')[0]}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="@container flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 @lg:grid-cols-3">
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
                const reached = done || reachedIndex.has(i)
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
        {!done && (
          <p className="num text-detail text-ink-3">
            {tPlus(tEnd)} of burn time replayed in {formatNumber(schedule.endA)} s. Skip to see the result now.
          </p>
        )}
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

const hudButton =
  'inline-flex h-8 items-center gap-1.5 border border-rule-strong bg-ground px-2.5 text-detail font-semibold text-ink-2 transition-colors hover:border-ink-3 hover:text-ink [&_svg]:size-3.5'

/**
 * The overlay on the launch view (DOM, over the 3D or the 2D drawing): mission clock, the current
 * event, the stage firing, Δv spent of the Δv required, and Replay / Skip.
 */
function LaunchHud({
  clock,
  label,
  stage,
  spent,
  required,
  failed,
  onReplay,
  onSkip,
}: {
  clock: string
  label: string
  stage: string
  spent: number
  required: number
  failed: boolean
  onReplay?: () => void
  onSkip?: () => void
}) {
  const frac = Number.isFinite(required) && required > 0 ? Math.min(1, Math.max(0, spent / required)) : 0
  return (
    <>
      {/* Tonal scrims keep the HUD legible over bright smoke and the Earth (no blur). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-linear-to-b from-ground-sunken/70 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-ground-sunken/85 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-3">
        <div className="min-w-0">
          <span className="num block text-title font-medium text-ink" aria-hidden>
            {clock}
          </span>
          <span className={cn('block text-small', failed ? 'text-nogo' : 'text-ink-2')} aria-live="polite">
            {label}
          </span>
        </div>
        <div className="pointer-events-auto flex shrink-0 gap-2">
          {onSkip ? (
            <button type="button" onClick={onSkip} className={hudButton}>
              <SkipForward aria-hidden />
              Skip
            </button>
          ) : (
            onReplay && (
              <button type="button" onClick={onReplay} className={hudButton}>
                <RotateCcw aria-hidden />
                Replay
              </button>
            )
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-6 p-3">
        <div>
          <span className="label-caps block text-ink-3">Stage</span>
          <span className="num text-small font-medium text-ink">{stage}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label-caps text-ink-3">Δv spent</span>
            <span className="num text-small whitespace-nowrap text-ink">
              {formatNumber(spent)} <span className="text-ink-3">of {formatNumber(required)} m/s</span>
            </span>
          </div>
          <div className="relative mt-1.5 h-[3px] bg-rule" aria-hidden>
            <div className="absolute inset-y-0 left-0 bg-ink-2" style={{ width: `${frac * 100}%` }} />
          </div>
        </div>
      </div>
    </>
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
