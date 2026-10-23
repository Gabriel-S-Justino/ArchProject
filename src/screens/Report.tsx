// Report: what happened and why. Outcome, stars and score (with the scoring formula and the
// mission's own numbers in it), the whole mission drawn to scale, the lessons tied to the physics,
// and a factual comparison with two real NASA Mars orbiters.
import { ArrowLeft, ArrowRight, ExternalLink, Star } from 'lucide-react'
import { useGame, useSpacecraftStats, useTransfer } from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { Formula } from '@/components/PhysicsPanel'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { Timeline, type TimelineEvent, type TimelineSpan } from '@/components/Timeline'
import { MISSION } from '@/data/mission'
import { REAL_MISSIONS } from '@/data/realMissions'
import type { CruiseProgress, MissionReport } from '@/game/autoplay'
import type { ArrivalResult } from '@/game/cruise'
import type { OpsState } from '@/game/ops'
import { SAFE_MODE_DAYS_PER_PENALTY, SAFE_MODE_PENALTY, SCORE_DIFFICULTY_MULTIPLIER } from '@/game/scoring'
import { cn } from '@/lib/utils'
import { formatJd, jdFromIso } from '@/physics/time'
import { GameBalance } from './design/controls'
import { NoFlight, Plate, PlateActions, PlateTitle } from './flight/plate'
import { vehicleName } from './flight/vehicle'

const FAILURE_TITLE: Record<string, string> = {
  pad: 'The rocket never left the pad',
  orbit: 'The rocket fell short of orbit',
  departure: 'The spacecraft never left Earth orbit',
  miss: 'The spacecraft missed Mars',
  propellant: 'Not enough propellant to stop at Mars',
}

export function Report() {
  const result = useGame((s) => s.result)
  const finishMission = useGame((s) => s.finishMission)
  const setPhase = useGame((s) => s.setPhase)
  const launched = useGame((s) => s.launched)
  if (!result) {
    return launched ? (
      <NoFlight title="Mission report" line="The flight is still going. You can end it here and score what it has done so far." action="End the mission" onAction={() => finishMission()} />
    ) : (
      <NoFlight title="Mission report" line="Nothing has flown yet." action="Open the design" onAction={() => setPhase('design')} />
    )
  }
  return <ReportPlate report={result} />
}

function ReportPlate({ report }: { report: MissionReport }) {
  const reset = useGame((s) => s.reset)
  const reviseDesign = useGame((s) => s.reviseDesign)
  const cruise = useGame((s) => s.cruise)
  const arrival = useGame((s) => s.arrival)
  const ops = useGame((s) => s.ops)
  const { result } = report
  // A flight that never reached Mars orbit is titled by what stopped it, even when cruise science scores a partial.
  const title = report.failureReason
    ? (FAILURE_TITLE[report.failureReason] ?? 'Mission lost')
    : result.outcome === 'success'
      ? 'Mission accomplished'
      : result.outcome === 'partial'
        ? 'Partial success'
        : 'Mission lost'
  const line = report.failureReason
    ? `${result.outcome === 'partial' ? `Partial success: ${formatNumber(report.science, 1)} cruise science points reached Earth. ` : ''}The report traces what went wrong to the physics and to the design.`
    : `${formatNumber(report.science, 1)} science points reached Earth against a target of ${formatNumber(MISSION.scienceTarget)}.`

  return (
    <Plate wide>
      <PlateTitle
        title={title}
        line={line}
        aside={
          <div className="flex items-end gap-8">
            <Stars n={result.stars} />
            <Readout label="Score" value={result.score} size="lg" className="w-36" />
          </div>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
        <Readout
          label="Science delivered"
          value={report.science}
          digits={1}
          unit="points"
          status={report.science >= MISSION.scienceTarget ? 'ok' : 'bad'}
          hint={
            <>
              Target {formatNumber(MISSION.scienceTarget)} · ops {formatNumber(report.opsScience, 1)} + cruise {formatNumber(report.cruiseScience, 1)}
            </>
          }
        />
        <Readout
          label="Budget left"
          value={report.budgetLeftM}
          unit="US$ M"
          hint={
            <>
              Spent {formatNumber(report.costM)} of {formatNumber(MISSION.budgetM)} · <GameBalance />
            </>
          }
        />
        <Readout label="Δv left after capture" value={report.dvLeftMs} unit="m/s" hint={arrival?.captured ? 'From the propellant left' : 'Not captured: 0'} />
        <Readout label="Safe-mode days" value={report.safeModeDays} unit="days" hint="Cruise days with the instruments off" />
      </div>

      <ScoreFormula report={report} />

      <section aria-labelledby="mission-timeline" className="mt-12">
        <h2 id="mission-timeline" className="text-lead font-semibold [font-stretch:88%]">
          The mission, to scale
        </h2>
        <MissionTimeline cruise={cruise} arrival={arrival} ops={ops} />
      </section>

      <section aria-labelledby="lessons" className="mt-12">
        <h2 id="lessons" className="text-lead font-semibold [font-stretch:88%]">
          What happened, and why
        </h2>
        <ol className="mt-3 flex max-w-[72ch] flex-col">
          {report.lessons.map((l, i) => (
            <li key={l.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-4">
              <span className="num pt-0.5 text-label text-ink-3">{i + 1}</span>
              <div>
                <h3 className="text-small font-semibold text-ink">{l.title}</h3>
                <p className="num mt-1 text-small text-ink-2">{l.text}</p>
                {l.formula && (
                  <p className="formula mt-2 text-lead text-ink" aria-label={l.formula.replace(/_/g, ' ')}>
                    <Formula text={l.formula} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Comparison arrival={arrival} />

      <PlateActions>
        <ActionButton onClick={() => reset()} icon={<ArrowRight aria-hidden />}>
          Fly again
        </ActionButton>
        <ActionButton tone="quiet" onClick={() => reviseDesign()}>
          <ArrowLeft aria-hidden className="size-4" />
          Revise design
        </ActionButton>
        <p className="text-detail text-ink-3">Fly again starts a new mission with a new seed; Revise design keeps this design and these events.</p>
      </PlateActions>
    </Plate>
  )
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex flex-col gap-1" role="img" aria-label={`${n} of 3 stars`}>
      <span className="label-caps text-ink-3">Stars</span>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <Star key={i} aria-hidden className={cn('size-7', i < n ? 'fill-ink text-ink' : 'text-rule-strong')} strokeWidth={1.5} />
        ))}
      </div>
    </div>
  )
}

function ScoreFormula({ report }: { report: MissionReport }) {
  const { result } = report
  const share = Math.min(1, Math.max(0, report.budgetLeftM) / MISSION.budgetM)
  return (
    <div className="mt-8 border-t border-rule pt-4">
      <p className="formula text-lead text-ink" aria-label="score equals science times one plus half the budget share, times 1.5, plus delta-v left over 100, minus 5 per 10 safe-mode days">
        <Formula text="score = science × (1 + 0.5 · budget share) × 1.5 + Δv_left / 100 − 5 · safe-mode days / 10" />
      </p>
      <p className="num mt-1 text-detail text-ink-3">
        {result.outcome === 'failure' ? (
          <>A failed mission scores 0.</>
        ) : (
          <>
            = {formatNumber(report.science, 1)} × (1 + 0.5 × {formatNumber(share, 2)}) × {formatNumber(SCORE_DIFFICULTY_MULTIPLIER, 1)} +{' '}
            {formatNumber(report.dvLeftMs, 1)} / 100 − {SAFE_MODE_PENALTY} × {formatNumber(report.safeModeDays)} / {SAFE_MODE_DAYS_PER_PENALTY} ={' '}
            {formatNumber(result.score)}.
          </>
        )}{' '}
        Three stars: target met with at least 20% of the budget left. The scoring is <GameBalance />.
      </p>
    </div>
  )
}

function MissionTimeline({ cruise, arrival, ops }: { cruise: CruiseProgress | null; arrival: ArrivalResult | null; ops: OpsState | null }) {
  const transfer = useTransfer()
  if (!transfer) return null
  const dep = transfer.depJd
  const arr = transfer.arrJd
  const opsEnd = ops && ops.turns.length > 0 ? ops.startJd + ops.turns.length * MISSION.turnDays : null
  const spans: TimelineSpan[] = []
  const events: TimelineEvent[] = [{ jd: dep, label: 'Launch', tone: 'accent' }]
  if (cruise) {
    const end = arrival ? arr : cruise.sim.jd
    spans.push({ fromJd: dep, toJd: end, label: `Cruise · ${Math.round(end - dep)} days`, tone: 'accent' })
    for (const t of cruise.sim.tcms) events.push({ jd: t.jd, label: `TCM ${formatNumber(t.dvMs, 1)} m/s`, tone: 'ink' })
    for (const r of cruise.sim.events) events.push({ jd: dep + r.event.day, label: `${r.event.flare.classType} flare`, tone: r.damaged ? 'bad' : 'warn' })
  }
  if (arrival) events.push({ jd: arr, label: arrival.captured ? 'Capture' : 'Flyby', tone: arrival.captured ? 'accent' : 'bad' })
  if (opsEnd !== null && ops) {
    spans.push({ fromJd: ops.startJd, toJd: opsEnd, label: `Operations · ${ops.turns.length} turns`, tone: 'ink' })
    for (const t of ops.turns.filter((x) => x.conjunction)) spans.push({ fromJd: t.jd, toJd: t.jd + MISSION.turnDays, label: 'Conjunction', tone: 'warn' })
  }
  const end = Math.max(opsEnd ?? 0, cruise ? arr : dep + 30) + 15
  return <Timeline className="mt-4" label="Mission timeline" startJd={dep - 15} endJd={end} spans={spans} events={events.sort((a, b) => a.jd - b.jd)} />
}

function Comparison({ arrival }: { arrival: ArrivalResult | null }) {
  const design = useGame((s) => s.design)
  const launch = useGame((s) => s.launch)
  const sc = useSpacecraftStats()
  const transfer = useTransfer()
  const report = useGame((s) => s.result)
  const cols = [
    {
      name: 'Your mission',
      vehicle: vehicleName(design.rocket),
      massKg: launch?.payloadKg ?? sc.wetKg,
      costM: report?.costM ?? NaN,
      costNote: 'rocket + spacecraft, game balance',
      launch: transfer ? formatJd(transfer.depJd) : '–',
      arrival: arrival?.captured && transfer ? formatJd(transfer.arrJd) : arrival ? 'Flyby' : '–',
      moi: arrival?.captured ? arrival.moiDvMs : NaN,
      c3: transfer?.c3 ?? NaN,
      url: undefined as string | undefined,
    },
    ...['maven', 'mro'].map((id) => {
      const m = REAL_MISSIONS.find((x) => x.id === id)!
      return {
        name: m.name,
        vehicle: m.vehicle,
        massKg: m.launchMassKg,
        costM: m.costM,
        costNote: id === 'mro' ? 'incl. launch and 5.5 years of operations' : 'total life-cycle cost',
        launch: formatJd(jdFromIso(`${m.launchDate}T00:00:00Z`)),
        arrival: formatJd(jdFromIso(`${m.arrivalDate}T00:00:00Z`)),
        moi: m.moiDvMs ?? NaN,
        c3: m.launchC3 ?? NaN,
        url: m.url,
      }
    }),
  ]
  const rows: { label: string; cell: (c: (typeof cols)[number]) => string; unit?: string }[] = [
    { label: 'Launch vehicle', cell: (c) => c.vehicle },
    { label: 'Launch mass', cell: (c) => formatNumber(c.massKg), unit: 'kg' },
    { label: 'Cost', cell: (c) => formatNumber(c.costM), unit: 'US$ M' },
    { label: 'Launch', cell: (c) => c.launch },
    { label: 'Mars orbit insertion', cell: (c) => c.arrival },
    { label: 'MOI Δv', cell: (c) => formatNumber(c.moi), unit: 'm/s' },
    { label: 'Launch C3', cell: (c) => formatNumber(c.c3, 2), unit: 'km²/s²' },
  ]
  return (
    <section aria-labelledby="compare" className="mt-12">
      <h2 id="compare" className="text-lead font-semibold [font-stretch:88%]">
        Compared with two real Mars orbiters
      </h2>
      <p className="mt-1 max-w-[66ch] text-small text-ink-2">
        Both flew on an Atlas V 401 and braked into a large ellipse first, as your spacecraft does. Real costs include parts you do not
        pay for here (operations, science teams), so compare masses and Δv rather than money.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-small">
          <thead>
            <tr className="border-b border-rule-strong text-left">
              <th scope="col" className="label-caps py-2 pr-4 font-semibold text-ink-3">
                <span className="sr-only">Quantity</span>
              </th>
              {cols.map((c, i) => (
                <th key={c.name} scope="col" className={cn('py-2 pr-4 text-small font-semibold', i === 0 ? 'text-mars' : 'text-ink')}>
                  {c.name}
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-detail font-normal text-ink-3 underline decoration-rule-strong underline-offset-4 hover:text-ink">
                      source
                      <ExternalLink aria-hidden className="size-3" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-rule">
                <th scope="row" className="label-caps py-2 pr-4 text-left font-semibold text-ink-3">
                  {r.label}
                </th>
                {cols.map((c) => {
                  const v = r.cell(c)
                  return (
                    <td key={c.name} className="num py-2 pr-4 text-ink">
                      {v}
                      {r.unit && v !== '–' && <span className="text-detail text-ink-2"> {r.unit}</span>}
                      {r.label === 'Cost' && v !== '–' && <span className="block text-detail text-ink-3">{c.costNote}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-detail text-ink-3">Real-mission figures: NASA and JPL launch press kits and the NASA PDS mission catalogs (see Sources).</p>
    </section>
  )
}
