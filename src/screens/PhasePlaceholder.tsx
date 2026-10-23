// Stand-in screens so the shell is navigable before the real screens land (Tasks 12–15 replace
// these one by one). Each is a "plate": a title, one line, the real numbers that already exist for
// that phase, and the way forward.
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { ActionButton } from '@/components/ActionButton'
import { Checklist } from '@/components/Checklist'
import { Gauge } from '@/components/Gauge'
import { Readout } from '@/components/Readout'
import { Timeline } from '@/components/Timeline'
import { useCapacityKg, useChecklist, useGame, useRocketStats, useSpacecraftStats, useTransfer } from '@/app/store'
import { MISSION } from '@/data/mission'
import { canEnter, nextPhase, type Phase } from '@/game/flow'
import { BATTERY_COVER_HOURS } from '@/game/spacecraft'
import { MIN_LIFTOFF_TWR } from '@/physics/launcher'
import { DEFAULT_PORKCHOP } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'

interface PlateCopy {
  title: string
  line: string
}

const COPY: Record<Exclude<Phase, 'sources'>, PlateCopy> = {
  select: {
    title: 'Choose your mission',
    line: 'Red Watch, a Mars orbiter, is ready to plan. The Europa flyby and the asteroid sample return come later.',
  },
  briefing: {
    title: 'Red Watch briefing',
    line: MISSION.briefing,
  },
  design: {
    title: 'Mission design',
    line: 'Trajectory, rocket and spacecraft in one workspace. Every check has to be go before the launch station opens.',
  },
  launch: {
    title: 'Launch',
    line: 'Your own rocket lifts off and drops each stage as it runs dry, timed by the rocket equation.',
  },
  cruise: {
    title: 'Cruise to Mars',
    line: 'Coast along the Lambert arc, correct the course and ride out real solar flares from NASA DONKI.',
  },
  arrival: {
    title: 'Mars orbit insertion',
    line: 'Brake into orbit with the propellant you carried, or fly past the planet.',
  },
  ops: {
    title: 'Science operations',
    line: `${MISSION.opsTurns} turns of ${MISSION.turnDays} days in Mars orbit: choose what to observe and what to send home.`,
  },
  report: {
    title: 'Mission report',
    line: 'What happened, why, and how your mission compares with a real Mars orbiter.',
  },
}

const NEXT_LABEL: Partial<Record<Phase, string>> = {
  select: 'Open the briefing',
  briefing: 'Start designing',
  design: 'Go to launch',
  launch: 'Into cruise',
  cruise: 'Approach Mars',
  arrival: 'Begin operations',
  ops: 'Read the report',
}

const BLOCKED: Partial<Record<Phase, string>> = {
  design: 'Launch opens when every check below is go.',
  launch: 'Cruise opens after a launch.',
  cruise: 'Arrival opens after a launch.',
  arrival: 'Operations open after arrival at Mars.',
  ops: 'The report opens after a launch.',
}

export function PhasePlaceholder({ phase }: { phase: Exclude<Phase, 'sources'> }) {
  const copy = COPY[phase]
  return (
    <Plate title={copy.title} line={copy.line} phase={phase}>
      {phase === 'briefing' && <BriefingFacts />}
      {phase === 'design' && <DesignFacts />}
    </Plate>
  )
}

function Plate({
  title,
  line,
  phase,
  children,
}: PlateCopy & { phase: Exclude<Phase, 'sources'>; children?: ReactNode }) {
  const state = useGame()
  const next = nextPhase(phase)
  const canGo = phase !== 'report' && canEnter(next, state)
  const blocked = BLOCKED[phase]
  return (
    <div className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col px-10 pt-12 pb-10">
      <h1 className="max-w-[18ch] text-display font-semibold tracking-[-0.025em] text-balance [font-stretch:84%]">{title}</h1>
      <p className="mt-4 max-w-[62ch] text-lead text-ink-2">{line}</p>

      {children && <div className="mt-10 flex flex-col gap-10">{children}</div>}

      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-12">
        {NEXT_LABEL[phase] && (
          <ActionButton disabled={!canGo} onClick={() => state.next()} icon={<ArrowRight aria-hidden />}>
            {NEXT_LABEL[phase]}
          </ActionButton>
        )}
        {!canGo && blocked && <p className="text-detail text-ink-3">{blocked}</p>}
        {phase !== 'select' && phase !== 'briefing' && phase !== 'design' && (
          <p className="ml-auto text-detail text-ink-3">Preview: this screen is still being built.</p>
        )}
      </div>
    </div>
  )
}

function BriefingFacts() {
  const transfer = useTransfer()
  const opsDays = MISSION.opsTurns * MISSION.turnDays
  const w = DEFAULT_PORKCHOP
  const start = w.depStartJd - 15
  const end = (transfer ? transfer.arrJd : w.arrEndJd) + opsDays + 20
  return (
    <>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
        <Readout label="Budget cap" value={MISSION.budgetM} unit="US$ M" hint="Game balance" />
        <Readout label="Science target" value={MISSION.scienceTarget} unit="points" hint="Game balance" />
        <Readout
          label="Capture orbit"
          value={`${(MISSION.capturePeriapsisAltM / 1000).toLocaleString('en-US')} × ${(MISSION.captureApoapsisAltM / 1000).toLocaleString('en-US')}`}
          unit="km"
          hint="Periapsis × apoapsis altitude"
        />
        <Readout label="Operations" value={opsDays} unit="days" hint={`${MISSION.opsTurns} turns of ${MISSION.turnDays} days`} />
      </div>
      <section aria-labelledby="window-title">
        <h2 id="window-title" className="text-lead font-semibold [font-stretch:88%]">
          The late-2026 Mars window
        </h2>
        <p className="mt-1 max-w-[62ch] text-small text-ink-2">
          Departures searched from {formatJd(w.depStartJd)} to {formatJd(w.depEndJd)}, arrivals up to {formatJd(w.arrEndJd)}.
          Drawn to scale: one day is the same width everywhere.
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
    </>
  )
}

function DesignFacts() {
  const transfer = useTransfer()
  const rocket = useRocketStats()
  const sc = useSpacecraftStats()
  const capacity = useCapacityKg()
  const checklist = useChecklist()
  const limit = MISSION.launchMargin * capacity
  const cost = rocket.costM + sc.costM
  return (
    <>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
        <Readout
          label="Launch C3"
          value={transfer ? transfer.c3 : '–'}
          digits={2}
          unit="km²/s²"
          hint={transfer ? `${formatJd(transfer.depJd)} → ${formatJd(transfer.arrJd)}` : 'No transfer chosen'}
          size="lg"
        />
        <Readout
          label="Spacecraft"
          value={sc.wetKg}
          unit="kg"
          status={transfer ? (sc.wetKg <= limit && capacity > 0 ? 'ok' : 'bad') : undefined}
          hint={transfer ? `Limit ${Math.round(limit).toLocaleString('en-US')} kg at this C3` : 'Wet mass, propellant included'}
          size="lg"
        />
        <Readout
          label="Liftoff TWR"
          value={rocket.liftoffTwr}
          digits={2}
          status={rocket.liftoffTwr >= MIN_LIFTOFF_TWR ? 'ok' : 'bad'}
          hint={`Minimum ${MIN_LIFTOFF_TWR.toFixed(1)}`}
          size="lg"
        />
        <Readout
          label="Mission cost"
          value={cost}
          unit="US$ M"
          status={cost <= MISSION.budgetM ? 'ok' : 'bad'}
          hint={`Budget ${MISSION.budgetM} · game balance`}
          size="lg"
        />
      </div>
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex flex-col gap-6">
          <Gauge
            label="Mass vs launch limit"
            value={sc.wetKg}
            max={Math.max(capacity, sc.wetKg, 1)}
            threshold={transfer ? limit : undefined}
            unit="kg"
          />
          <Gauge label="Cost vs budget" value={cost} max={Math.max(MISSION.budgetM * 1.25, cost)} threshold={MISSION.budgetM} thresholdLabel="budget" unit="US$ M" />
          <Gauge
            label="Liftoff thrust-to-weight"
            value={rocket.liftoffTwr}
            max={2.5}
            threshold={MIN_LIFTOFF_TWR}
            limit="floor"
            thresholdLabel="minimum"
            digits={2}
          />
          <Gauge
            label="Power at Mars, battery included"
            value={sc.powerGenAtMarsW + sc.batteryWh / BATTERY_COVER_HOURS}
            max={Math.max(sc.powerGenAtMarsW + sc.batteryWh / BATTERY_COVER_HOURS, sc.powerLoadW, 1) * 1.15}
            threshold={sc.powerLoadW}
            limit="floor"
            thresholdLabel="load"
            unit="W"
          />
        </div>
        <Checklist items={checklist} />
      </div>
    </>
  )
}
