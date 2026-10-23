// Science operations: six turns of 30 days in Mars orbit. Each turn the player chooses which
// instruments run within the power left after the bus, radio and recorder; what they observe goes
// into storage and the radio sends down what the real Earth–Mars distance allows (JPL Horizons,
// rate ∝ 1/d²). A solar conjunction stops the downlink. The chart is collected vs downlinked data.
import { ArrowRight, Check, CircleSlash } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useGame } from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { Gauge } from '@/components/Gauge'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { MISSION } from '@/data/mission'
import { SPACECRAFT_PARTS, spacecraftPartById } from '@/data/spacecraftParts'
import { defaultOpsPlan, instrumentLoadW } from '@/game/autoplay'
import type { MissionDesign } from '@/game/checklist'
import { opsPlanLimits, sunEarthMarsAngleDeg, turnJd, type OpsState, type OpsTurnReport } from '@/game/ops'
import { BATTERY_COVER_HOURS, spacecraftStats } from '@/game/spacecraft'
import { cn } from '@/lib/utils'
import { AU } from '@/physics/constants'
import { EPHEMERIS_RANGE, bodyState } from '@/physics/ephemeris'
import { dataRateMbps, dataVolumeGb, signalDelayS, solarConjunction } from '@/physics/link'
import { formatJd } from '@/physics/time'
import { norm, sub } from '@/physics/vec'
import { GameBalance } from './design/controls'
import { NoFlight, Plate, PlateActions, PlateTitle } from './flight/plate'

/** What the coming turn looks like before it is run (same models as runOpsTurn). */
function turnOutlook(ops: OpsState, design: MissionDesign) {
  const jd = turnJd(ops)
  const t = Math.min(EPHEMERIS_RANGE.endJd, Math.max(EPHEMERIS_RANGE.startJd, jd))
  const earth = bodyState('earth', t).r
  const mars = bodyState('mars', t).r
  const dM = norm(sub(mars, earth))
  const dAU = dM / AU
  const sunMarsAU = norm(mars) / AU
  const sunAngle = sunEarthMarsAngleDeg(t)
  const conjunction = solarConjunction(sunAngle)
  const st = spacecraftStats(design.spacecraft, null, sunMarsAU)
  return {
    jd,
    dAU,
    delayMin: signalDelayS(dM) / 60,
    sunMarsAU,
    sunAngle,
    conjunction,
    genW: st.powerGenAtMarsW,
    batteryW: st.batteryWh / BATTERY_COVER_HOURS,
    storageGb: st.storageGb + MISSION.bufferGbit,
    capacityGb: conjunction ? 0 : dataVolumeGb(dataRateMbps(st.rateMbpsAt1AU, dAU), MISSION.turnDays),
  }
}

const NO_DAMAGE: string[] = []

export function Ops() {
  const ops = useGame((s) => s.ops)
  const design = useGame((s) => s.design)
  const damaged = useGame((s) => s.cruise?.sim.damaged)
  const setPhase = useGame((s) => s.setPhase)
  const finishMission = useGame((s) => s.finishMission)
  if (!ops) {
    return <NoFlight title="Science operations" line="Operations start once the spacecraft is captured into Mars orbit." action="Back to arrival" onAction={() => setPhase('arrival')} />
  }
  const over = ops.turn >= MISSION.opsTurns
  const lastJd = ops.startJd + (MISSION.opsTurns - 1) * MISSION.turnDays

  return (
    <Plate wide>
      <PlateTitle
        title="Science operations"
        line={
          over ? (
            <>All {MISSION.opsTurns} turns are done ({formatJd(ops.startJd)} to {formatJd(lastJd + MISSION.turnDays)}).</>
          ) : (
            <>
              Turn <span className="num">{ops.turn + 1}</span> of {MISSION.opsTurns}, starting {formatJd(turnJd(ops))}. Each turn is{' '}
              {MISSION.turnDays} days (<GameBalance />). Choose what to observe; the radio decides how much comes home.
            </>
          )
        }
      />

      <div className="mt-6 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {over ? (
          <section aria-labelledby="ops-done" className="flex flex-col gap-4">
            <h2 id="ops-done" className="text-title font-semibold [font-stretch:88%]">
              Operations complete
            </h2>
            <ScienceGauges ops={ops} final />
          </section>
        ) : (
          <Planner key={ops.turn} ops={ops} design={design} damaged={damaged ?? NO_DAMAGE} />
        )}
        <div className="flex min-w-0 flex-col gap-6">
          {!over && <ScienceGauges ops={ops} />}
          <DataChart ops={ops} />
          <LastNotes turn={ops.turns[ops.turns.length - 1]} />
        </div>
      </div>

      {over && (
        <PlateActions>
          <ActionButton onClick={() => finishMission()} icon={<ArrowRight aria-hidden />}>
            Read the report
          </ActionButton>
        </PlateActions>
      )}
    </Plate>
  )
}

function Planner({ ops, design, damaged }: { ops: OpsState; design: MissionDesign; damaged: string[] }) {
  const runOpsTurn = useGame((s) => s.runOpsTurn)
  const outlook = useMemo(() => turnOutlook(ops, design), [ops, design])
  const limits = useMemo(() => opsPlanLimits(ops, design, damaged), [ops, design, damaged])
  const [on, setOn] = useState<string[]>(() => defaultOpsPlan(ops, design, damaged).instrumentsOn)
  const fitted = SPACECRAFT_PARTS.filter((p) => p.category === 'instrument' && (design.spacecraft.parts[p.id] ?? 0) > 0)
  const load = on.reduce((a, id) => a + instrumentLoadW(design, id), 0)
  const left = limits.maxLoadW - load
  const dataGb = on.reduce((a, id) => a + (design.spacecraft.parts[id] ?? 0) * (spacecraftPartById(id)?.dataGbPerTurn ?? 0), 0)

  const toggle = (id: string) => setOn((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))

  return (
    <section aria-labelledby="planner" className="flex flex-col gap-5">
      <h2 id="planner" className="text-title font-semibold [font-stretch:88%]">
        Plan turn {ops.turn + 1}
      </h2>

      {outlook.conjunction && (
        <div role="status" className="border-t-2 border-caution pt-2 text-small text-ink">
          <span className="label-caps text-caution">Caution · Solar conjunction</span> Mars is {formatNumber(outlook.sunAngle, 1)}° from the
          Sun as seen from Earth. The Sun's plasma scrambles the radio: nothing goes down this turn, observations wait in storage.
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Readout label="Earth–Mars" value={outlook.dAU} digits={2} unit="AU" hint="JPL Horizons" />
        <Readout label="Light delay" value={outlook.delayMin} digits={1} unit="min" hint="One way, d / c" />
        <Readout label="Downlink this turn" value={outlook.capacityGb} digits={1} unit="Gbit" hint={outlook.conjunction ? 'Conjunction: none' : 'Rate ∝ 1/d²'} />
        <Readout label="Stored on board" value={ops.bufferGb} digits={1} unit="Gbit" hint={`of ${formatNumber(outlook.storageGb)} Gbit`} />
      </div>

      <fieldset>
        <legend className="label-caps text-ink-3">Instruments · power, data and science per turn</legend>
        <ul className="mt-2">
          {fitted.map((p) => {
            const isOn = on.includes(p.id)
            const w = instrumentLoadW(design, p.id)
            const broken = damaged.includes(p.id)
            const tooMuch = !isOn && w > left + 1e-9
            const reason = broken
              ? 'Damaged by a solar flare during the cruise'
              : !limits.available.includes(p.id)
                ? 'Not available'
                : tooMuch
                  ? `Needs ${formatNumber(w, 1)} W; ${formatNumber(Math.max(0, left), 1)} W left`
                  : undefined
            const disabled = Boolean(reason) && !isOn
            const n = design.spacecraft.parts[p.id] ?? 0
            return (
              <li key={p.id} className="border-b border-rule">
                <label className={cn('grid cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2', disabled && 'cursor-not-allowed')}>
                  <input
                    type="checkbox"
                    checked={isOn}
                    disabled={disabled}
                    onChange={() => toggle(p.id)}
                    aria-describedby={reason ? `why-${p.id}` : undefined}
                    className="size-4 translate-y-0.5 accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className={cn('block text-small', disabled ? 'text-ink-3' : 'text-ink')}>
                      {p.name}
                      {n > 1 ? ` ×${n}` : ''}
                    </span>
                    {reason && (
                      <span id={`why-${p.id}`} className={cn('block text-detail', broken ? 'text-nogo' : 'text-ink-3')}>
                        {broken && <span className="label-caps">No-go </span>}
                        {reason}
                      </span>
                    )}
                  </span>
                  <span className="num text-right text-detail text-ink-2">
                    {formatNumber(w, 1)} W · {formatNumber(n * (p.dataGbPerTurn ?? 0), 1)} Gbit · {formatNumber(n * (p.science ?? 0))} pts
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <p className="num mt-2 text-detail text-ink-3">
          Power: {formatNumber(outlook.genW)} W generated at {formatNumber(outlook.sunMarsAU, 2)} AU from the Sun (arrays ∝ 1/r²) +{' '}
          {formatNumber(outlook.batteryW)} W battery − {formatNumber(Math.max(0, outlook.genW + outlook.batteryW - limits.maxLoadW))} W for the bus,
          radio and recorder = {formatNumber(limits.maxLoadW)} W for instruments. Data and science per turn are <GameBalance />.
        </p>
      </fieldset>

      <Gauge
        label="Instrument power"
        value={load}
        max={Math.max(limits.maxLoadW, load, 1) * 1.1}
        threshold={limits.maxLoadW}
        thresholdLabel="available"
        unit="W"
        digits={1}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ActionButton onClick={() => runOpsTurn({ instrumentsOn: on })} disabled={load > limits.maxLoadW + 1e-9} icon={<ArrowRight aria-hidden />}>
          Run turn {ops.turn + 1}
        </ActionButton>
        <p className="num text-detail text-ink-3">
          {on.length === 0 ? 'No instrument on: nothing new is observed.' : `${formatNumber(dataGb, 1)} Gbit of new data this turn.`}
        </p>
      </div>
    </section>
  )
}

function ScienceGauges({ ops, final = false }: { ops: OpsState; final?: boolean }) {
  const cruiseScience = useGame((s) => s.cruise?.sim.cruiseScience ?? 0)
  const delivered = ops.delivered + cruiseScience
  return (
    <div className="flex flex-col gap-2">
      <Gauge
        label="Science delivered to Earth"
        value={delivered}
        max={Math.max(MISSION.scienceTarget * 1.25, delivered, ops.collected)}
        threshold={MISSION.scienceTarget}
        limit="floor"
        judge={final}
        thresholdLabel="target"
        unit="points"
        digits={1}
      />
      <p className="num text-detail text-ink-3">
        Observed {formatNumber(ops.collected, 1)} · on board {formatNumber(ops.bufferScience, 1)} · lost to full storage{' '}
        {formatNumber(ops.dataLostGb, 1)} Gbit{cruiseScience > 0 ? ` · cruise ${formatNumber(cruiseScience, 1)}` : ''} · points are game balance
      </p>
    </div>
  )
}

/** Collected vs downlinked data per turn, with the storage level, on one Gbit scale. */
function DataChart({ ops }: { ops: OpsState }) {
  const turns = ops.turns
  const W = 560
  const H = 220
  const left = 44
  const bottom = 34
  const top = 14
  const max = Math.max(50, ...turns.flatMap((t) => [t.dataCollectedGb, t.dataDownlinkedGb, t.storedGb, t.downlinkCapacityGb]))
  const step = niceStep(max)
  const yMax = Math.ceil(max / step) * step
  const y = (v: number) => top + (H - top - bottom) * (1 - Math.min(1, v / yMax))
  const slot = (W - left) / MISSION.opsTurns
  const bw = Math.min(22, slot * 0.28)
  const xOf = (i: number) => left + slot * i + slot / 2
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step)
  const storage = turns.map((t, i) => `${xOf(i)},${y(t.storedGb)}`).join(' ')

  return (
    <figure aria-labelledby="data-chart-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="data-chart-title" className="text-lead font-semibold [font-stretch:88%]">
          Data collected vs sent to Earth
        </h2>
        <div className="flex items-center gap-4 text-detail text-ink-2" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 border border-ink-3" /> Collected
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 bg-ink" /> Sent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t border-dashed border-ink-2" /> Stored
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={chartSummary(turns)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={left} x2={W} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth={v === 0 ? 1 : 0.5} />
            <text x={left - 6} y={y(v) + 4} fontSize={11} fill="var(--ink-3)" textAnchor="end" className="num">
              {formatNumber(v)}
            </text>
          </g>
        ))}
        <text x={left - 6} y={H - bottom + 16} fontSize={10.5} fill="var(--ink-3)" textAnchor="end">
          Gbit
        </text>
        {Array.from({ length: MISSION.opsTurns }, (_, i) => {
          const t = turns[i]
          const x = xOf(i)
          return (
            <g key={i}>
              {t && (
                <>
                  <rect x={x - bw - 1} y={y(t.dataCollectedGb)} width={bw} height={y(0) - y(t.dataCollectedGb)} fill="none" stroke="var(--ink-3)" strokeWidth={1} />
                  <rect x={x + 1} y={y(t.dataDownlinkedGb)} width={bw} height={y(0) - y(t.dataDownlinkedGb)} fill="var(--ink)" />
                  {t.conjunction && (
                    <text x={x} y={y(0) - 6} fontSize={10} fill="var(--caution)" textAnchor="middle">
                      conj.
                    </text>
                  )}
                </>
              )}
              <text x={x} y={H - bottom + 16} fontSize={11} fill={t ? 'var(--ink-2)' : 'var(--ink-3)'} textAnchor="middle" className="num">
                Turn {i + 1}
              </text>
              <text x={x} y={H - bottom + 29} fontSize={10} fill="var(--ink-3)" textAnchor="middle" className="num">
                {formatJd(ops.startJd + i * MISSION.turnDays).replace(/^\d+ /, '')}
              </text>
            </g>
          )
        })}
        {turns.length > 1 && <polyline points={storage} fill="none" stroke="var(--ink-2)" strokeWidth={1.2} strokeDasharray="4 3" />}
        {turns.map((t, i) => (
          <circle key={i} cx={xOf(i)} cy={y(t.storedGb)} r={2.5} fill="var(--ink-2)" />
        ))}
      </svg>
      {turns.length === 0 && <figcaption className="text-detail text-ink-3">Bars appear as turns are run.</figcaption>}
    </figure>
  )
}

function niceStep(max: number): number {
  const raw = max / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

function chartSummary(turns: OpsTurnReport[]): string {
  if (turns.length === 0) return 'No turns run yet.'
  return turns
    .map(
      (t) =>
        `Turn ${t.turn + 1}: collected ${formatNumber(t.dataCollectedGb, 1)} Gbit, sent ${formatNumber(t.dataDownlinkedGb, 1)} Gbit, stored ${formatNumber(t.storedGb, 1)} Gbit${t.conjunction ? ', solar conjunction' : ''}.`,
    )
    .join(' ')
}

function LastNotes({ turn }: { turn: OpsTurnReport | undefined }) {
  if (!turn) return null
  return (
    <section aria-labelledby="last-turn" aria-live="polite">
      <h2 id="last-turn" className="label-caps text-ink-3">
        Turn {turn.turn + 1} log · {formatJd(turn.jd)}
      </h2>
      <ul className="mt-1.5 flex flex-col gap-1 text-detail text-ink-2">
        <li className="num flex gap-2">
          <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
          {turn.instrumentsRun.length > 0
            ? `${turn.instrumentsRun.map((id) => spacecraftPartById(id)?.name.replace(/ \(.*\)$/, '') ?? id).join(', ')} observed ${formatNumber(turn.dataCollectedGb, 1)} Gbit; ${formatNumber(turn.dataDownlinkedGb, 1)} Gbit went down, ${formatNumber(turn.scienceDelivered, 1)} science points.`
            : `No instrument ran; ${formatNumber(turn.dataDownlinkedGb, 1)} Gbit of stored data went down.`}
        </li>
        {turn.notes.map((n) => (
          <li key={n} className="flex gap-2">
            <CircleSlash aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
            {n}
          </li>
        ))}
      </ul>
    </section>
  )
}
