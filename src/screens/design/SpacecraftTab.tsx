// Spacecraft: parts by subsystem, one orbit-insertion propulsion system and its trajectory-correction
// reserve, with live mass, propellant, power, data and cost. The right column holds the 3D model of
// the spacecraft (data-slot="spacecraft-3d", lazy-loaded); the plan sketch stands in without WebGL.
import { Slider as SliderPrimitive } from 'radix-ui'
import { useId, useMemo, type ReactNode } from 'react'
import { useGame, useSpacecraftStats, useTransfer } from '@/app/store'
import { Gauge } from '@/components/Gauge'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { MISSION } from '@/data/mission'
import { spacecraftPartById } from '@/data/spacecraftParts'
import { BATTERY_COVER_HOURS, TCM_RESERVE_MAX_MS, type SpacecraftDesign } from '@/game/spacecraft'
import type { SpacecraftPart } from '@/game/types'
import { cn } from '@/lib/utils'
import { dataRateMbps } from '@/physics/link'
import { propellantFor } from '@/physics/rocket'
import { formatJd } from '@/physics/time'
import { SpacecraftModelView } from '@/scenes/SceneSlot'
import { useWebGL2 } from '@/scenes/webgl'
import { ErrorList, GameBalance, SectionHeading, Stepper } from './controls'
import {
  CATEGORIES,
  dataPerTurnGb,
  earthMarsDistanceAU,
  partCount,
  partsIn,
  powerVerdict,
  propulsionId,
  setPartCount,
  setPropulsion,
  setReserve,
  stepMax,
  sunMarsDistanceAU,
} from './spacecraftEdit'

export function SpacecraftTab() {
  const design = useGame((s) => s.design.spacecraft)
  const setSpacecraft = useGame((s) => s.setSpacecraft)
  const sc = useSpacecraftStats()
  const transfer = useTransfer()
  const gl = useWebGL2()
  const edit = (f: (d: SpacecraftDesign) => SpacecraftDesign) => setSpacecraft(f(design))

  const power = powerVerdict(design, sc)
  const earthDistAU = useMemo(() => (transfer ? earthMarsDistanceAU(transfer.arrJd) : Number.NaN), [transfer])
  const sunDistAU = useMemo(() => (transfer ? sunMarsDistanceAU(transfer.arrJd) : Number.NaN), [transfer])
  const rateAtArrival = transfer ? dataRateMbps(sc.rateMbpsAt1AU, earthDistAU) : Number.NaN

  return (
    <div className="@container flex flex-col gap-10">
      <header className="max-w-[62ch]">
        <h2 className="text-title font-semibold [font-stretch:88%]">Design the spacecraft</h2>
        <p className="mt-1 text-small text-ink-2">
          Every kilogram you add needs more propellant to brake into Mars orbit, and the rocket has to lift both. Power and
          the radio link both weaken with distance squared.
        </p>
      </header>

      <section aria-label="Spacecraft budgets" className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
          <Readout
            label="Wet mass"
            value={sc.wetKg}
            unit="kg"
            size="lg"
            hint={`Dry ${formatNumber(sc.dryKg)} + propellant ${formatNumber(sc.propellantKg)} kg`}
          />
          <Readout
            label="Propellant"
            value={sc.propellantKg}
            unit="kg"
            size="lg"
            hint={
              transfer
                ? `Capture ${formatNumber(sc.moiDvMs)} + reserve ${formatNumber(design.tcmReserveMs)} m/s`
                : `Reserve ${formatNumber(design.tcmReserveMs)} m/s only: no arrival speed yet`
            }
          />
          <Readout
            label="Power at Mars"
            value={power.kind === 'n/a' ? 'n/a' : power.supplyW}
            unit={power.kind === 'n/a' ? undefined : 'W'}
            status={power.kind === 'ok' ? 'ok' : power.kind === 'bad' ? 'bad' : undefined}
            hint={
              power.kind === 'n/a' ? (
                power.reason
              ) : (
                <>
                  Load {formatNumber(power.loadW)} W · battery {formatNumber(power.batteryW)} W over {BATTERY_COVER_HOURS} h, <GameBalance />
                </>
              )
            }
          />
          <Readout label="Spacecraft cost" value={sc.costM} unit="US$ M" hint={<>Budget {formatNumber(MISSION.budgetM)} with the rocket · <GameBalance /></>} />
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
          <Readout label="Downlink at 1 AU" value={sc.rateMbpsAt1AU} digits={2} unit="Mbit/s" hint="All antennas together" />
          <Readout
            label="Downlink at arrival"
            value={transfer ? rateAtArrival : '–'}
            digits={rateAtArrival < 0.1 ? 3 : 2}
            unit="Mbit/s"
            hint={transfer ? `Earth ${formatNumber(earthDistAU, 2)} AU away on ${formatJd(transfer.arrJd)} (1/d²)` : 'Pick a transfer to know the distance'}
          />
          <Readout
            label="Data per turn"
            value={dataPerTurnGb(design)}
            unit="Gbit"
            hint={<>Storage {formatNumber(sc.storageGb + MISSION.bufferGbit)} Gbit incl. {MISSION.bufferGbit} built in · <GameBalance /></>}
          />
          <Readout label="Science per turn" value={sc.science} unit="points" hint={<>Target {MISSION.scienceTarget} in {MISSION.opsTurns} turns · <GameBalance /></>} />
        </div>
        {power.kind !== 'n/a' && (
          <Gauge
            label={`Power at Mars (${transfer ? `${formatNumber(sunDistAU, 2)} AU from the Sun` : 'mean distance'}), battery included`}
            value={power.supplyW}
            max={Math.max(power.supplyW, power.loadW, 1) * 1.15}
            threshold={power.loadW}
            limit="floor"
            thresholdLabel="load"
            unit="W"
          />
        )}
      </section>

      <div className="grid gap-x-10 gap-y-8 @4xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-10 @4xl:col-start-1 @4xl:row-start-1">
          {CATEGORIES.filter((c) => c.id !== 'propulsion').map((c) => (
            <section key={c.id} aria-labelledby={`sc-${c.id}`}>
              <SectionHeading id={`sc-${c.id}`} aside={categoryAside(design, c.id)}>
                {c.name}
              </SectionHeading>
              <p className="mt-1.5 text-detail text-ink-3">{c.line}</p>
              <ul className="mt-1">
                {partsIn(c.id).map((p) => (
                  <PartRow key={p.id} part={p} count={partCount(design, p.id)} onCount={(n) => edit((d) => setPartCount(d, p.id, n))} />
                ))}
              </ul>
            </section>
          ))}
          <PropulsionSection design={design} onChange={setSpacecraft} />
          <ErrorList errors={sc.errors} />
        </div>

        <aside aria-label="Spacecraft view" className="order-first @4xl:order-none @4xl:sticky @4xl:top-6 @4xl:col-start-2 @4xl:row-start-1 @4xl:self-start">
          <div data-slot="spacecraft-3d" className="relative aspect-[16/10] max-h-[24rem] w-full overflow-hidden border border-rule bg-ground-sunken @4xl:aspect-square @4xl:max-h-none">
            <SpacecraftModelView
              design={design}
              fallback={
                <div className="absolute inset-0 p-5">
                  <SpacecraftSketch design={design} loadW={sc.powerLoadW} />
                </div>
              }
            />
          </div>
          <p className="mt-2 text-detail text-ink-3">
            {gl
              ? 'Built from your parts: wing area follows the arrays’ power, the dish is the 3 m high-gain class. Generic shapes, no real spacecraft. Drag to turn.'
              : 'Plan view sketch: arrays and dish drawn to their relative size.'}
          </p>
        </aside>
      </div>
    </div>
  )
}

function categoryAside(d: SpacecraftDesign, c: SpacecraftPart['category']): string {
  const parts = partsIn(c)
  const n = parts.reduce((a, p) => a + partCount(d, p.id), 0)
  const kg = parts.reduce((a, p) => a + partCount(d, p.id) * p.massKg, 0)
  return n === 0 ? 'none fitted' : `${n} fitted · ${formatNumber(kg, kg < 10 ? 1 : 0)} kg`
}

/** The part's numbers in one line: mass, power, the category-specific figure, cost. */
function partFigures(p: SpacecraftPart): string {
  const bits = [`${formatNumber(p.massKg, p.massKg < 10 ? 1 : 0)} kg`]
  if (p.powerW > 0) bits.push(`+${formatNumber(p.powerW)} W${p.solar ? ' at 1 AU' : ''}`)
  else if (p.powerW < 0) bits.push(`−${formatNumber(-p.powerW, Number.isInteger(p.powerW) ? 0 : 1)} W`)
  if (p.batteryWh) bits.push(`${formatNumber(p.batteryWh)} Wh`)
  if (p.rateMbpsAt1AU) bits.push(`${formatNumber(p.rateMbpsAt1AU, p.rateMbpsAt1AU < 1 ? 2 : 0)} Mbit/s at 1 AU`)
  if (p.storageGb) bits.push(`${formatNumber(p.storageGb)} Gbit`)
  if (p.science) bits.push(`${p.science} science/turn`)
  if (p.dataGbPerTurn) bits.push(`${formatNumber(p.dataGbPerTurn, p.dataGbPerTurn < 1 ? 1 : 0)} Gbit/turn`)
  if (p.radiationShield) bits.push(`blocks ${formatNumber(p.radiationShield * 100)}% of flare damage`)
  if (p.ispS) bits.push(`Isp ${p.ispS} s`)
  bits.push(`US$ ${formatNumber(p.costM)} M`)
  return bits.join(' · ')
}

function PartRow({ part: p, count, onCount }: { part: SpacecraftPart; count: number; onCount: (n: number) => void }) {
  const max = stepMax(p)
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 border-b border-rule py-3">
      <div className="min-w-0">
        <p className={cn('text-small font-medium', count > 0 ? 'text-ink' : 'text-ink-2')}>{p.name}</p>
        <p className="num mt-0.5 text-detail text-ink-2">{partFigures(p)}</p>
        <p className="mt-0.5 max-w-[62ch] text-detail text-ink-3">{p.flavor}</p>
      </div>
      <div className="flex flex-col items-end gap-1 pt-0.5">
        <Stepper label={p.name} value={count} min={0} max={max} onChange={onCount} />
        {p.max !== undefined && <span className="num text-label text-ink-3">max {p.max}</span>}
      </div>
    </li>
  )
}

function PropulsionSection({ design, onChange }: { design: SpacecraftDesign; onChange: (d: SpacecraftDesign) => void }) {
  const sc = useSpacecraftStats()
  const transfer = useTransfer()
  const name = useId()
  const selected = propulsionId(design)
  const part = selected ? spacecraftPartById(selected) : undefined
  const options: (SpacecraftPart | null)[] = [null, ...partsIn('propulsion')]
  // Split the propellant: what the capture burn alone needs, the rest is the TCM reserve's share.
  const forCapture = part?.ispS ? propellantFor(sc.moiDvMs, part.ispS, sc.dryKg) : 0
  const captureKg = Number.isFinite(forCapture) ? Math.min(forCapture, sc.propellantKg) : 0
  const reserveKg = Math.max(0, sc.propellantKg - captureKg)

  return (
    <section aria-labelledby="sc-propulsion">
      <SectionHeading id="sc-propulsion" aside={part ? `${formatNumber(part.massKg)} kg dry` : 'none fitted'}>
        Propulsion
      </SectionHeading>
      <p className="mt-1.5 text-detail text-ink-3">One system brakes the spacecraft into Mars orbit. Higher Isp needs less propellant.</p>
      <div role="radiogroup" aria-labelledby="sc-propulsion" className="mt-1 flex flex-col">
        {options.map((p) => {
          const checked = (p?.id ?? null) === selected
          return (
            <label key={p?.id ?? 'none'} className="flex cursor-pointer items-start gap-3 border-b border-rule py-3">
              <input
                type="radio"
                name={name}
                checked={checked}
                onChange={() => onChange(setPropulsion(design, p?.id ?? null))}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'mt-1 grid size-3.5 shrink-0 place-items-center rounded-full border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mars',
                  checked ? 'border-mars' : 'border-ink-3',
                )}
              >
                {checked && <span className="size-1.5 rounded-full bg-mars" />}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-small font-medium', checked ? 'text-ink' : 'text-ink-2')}>{p ? p.name : 'No propulsion system'}</span>
                <span className="num mt-0.5 block text-detail text-ink-2">
                  {p ? partFigures(p) : 'Without an engine the spacecraft flies past Mars.'}
                </span>
                {p && <span className="mt-0.5 block max-w-[62ch] text-detail text-ink-3">{p.flavor}</span>}
              </span>
            </label>
          )
        })}
      </div>

      <ReserveSlider value={design.tcmReserveMs} onChange={(v) => onChange(setReserve(design, v))} />

      <dl className="mt-4 grid grid-cols-3 gap-x-6 border-t border-rule-strong pt-3">
        <Breakdown label="For capture" value={captureKg} hint={transfer ? `${formatNumber(sc.moiDvMs)} m/s at v∞ ${formatNumber(transfer.vInfArrKms, 2)} km/s` : 'needs a transfer'} />
        <Breakdown label="For TCM reserve" value={reserveKg} hint={`${formatNumber(design.tcmReserveMs)} m/s`} />
        <Breakdown label="Total propellant" value={sc.propellantKg} hint={part?.ispS ? `Isp ${part.ispS} s, rocket equation` : 'no engine'} strong />
      </dl>
    </section>
  )
}

function Breakdown({ label, value, hint, strong }: { label: string; value: number; hint: ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps text-ink-3">{label}</dt>
      <dd className="num">
        <span className={cn('text-body', strong ? 'font-semibold text-ink' : 'font-medium text-ink')}>{formatNumber(value)}</span>
        <span className="ml-1 text-detail text-ink-2">kg</span>
        <span className="block text-detail text-ink-3">{hint}</span>
      </dd>
    </div>
  )
}

function ReserveSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const id = useId()
  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <label id={id} className="text-small font-medium">
          Trajectory-correction reserve
        </label>
        <span className="num text-small text-ink">
          {formatNumber(value)} <span className="text-detail text-ink-2">m/s</span>
        </span>
      </div>
      <SliderPrimitive.Root
        min={0}
        max={TCM_RESERVE_MAX_MS}
        step={5}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        aria-labelledby={id}
        className="relative flex h-6 w-full touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-px grow bg-rule-strong">
          <SliderPrimitive.Range className="absolute h-[3px] -translate-y-px bg-ink-2" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-labelledby={id}
          aria-valuetext={`${value} metres per second`}
          className="block size-3.5 border border-ink bg-ground transition-colors hover:bg-ink focus-visible:bg-ink"
        />
      </SliderPrimitive.Root>
      <div className="num flex justify-between text-label text-ink-3">
        <span>0</span>
        <span>{TCM_RESERVE_MAX_MS} m/s</span>
      </div>
      <p className="text-detail text-ink-3">
        Propellant kept for course corrections during cruise. Too little and a correction may be out of reach; every m/s adds
        mass. Real orbiters carry tens of m/s.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

/** Plan-view sketch (top-down): bus, solar wings sized by area, dish, instruments. Stand-in for the 3D model. */
function SpacecraftSketch({ design, loadW }: { design: SpacecraftDesign; loadW: number }) {
  const has = (id: string) => partCount(design, id)
  const bus = has('sc-core') > 0
  // Wing span ∝ array area: 20 m² large array, 12 m² small array (each copy).
  const areaM2 = 20 * has('solar-large') + 12 * has('solar-small')
  const wing = Math.sqrt(Math.max(0, areaM2)) * 2.6
  const instruments = partsIn('instrument').filter((p) => has(p.id) > 0)
  const dish = has('comms-hga') > 0
  const laser = has('comms-optical') > 0
  const rtg = has('rtg') > 0
  const stroke = 'var(--ink-2)'
  if (!bus) {
    return (
      <div className="grid h-full place-items-center text-center text-detail text-ink-3">
        No bus yet. Fit a spacecraft bus to start the build.
      </div>
    )
  }
  return (
    <svg viewBox="-50 -50 100 100" className="h-full w-full" role="img" aria-label={`Plan view: bus${areaM2 ? `, ${areaM2} m² of solar arrays` : ''}${dish ? ', high-gain dish' : ''}${instruments.length ? `, ${instruments.length} instruments` : ''}`}>
      {wing > 0 &&
        [-1, 1].map((s) => (
          <g key={s} stroke={stroke} strokeWidth={0.4} fill="var(--ground-raised)">
            <line x1={s * 8} x2={s * 11} y1={0} y2={0} />
            <rect x={s > 0 ? 11 : -11 - wing} y={-6} width={wing} height={12} />
            {Array.from({ length: Math.max(1, Math.round(wing / 6)) - 1 }, (_, k) => {
              const x = s > 0 ? 11 + ((k + 1) * wing) / Math.round(wing / 6) : -11 - ((k + 1) * wing) / Math.round(wing / 6)
              return <line key={k} x1={x} x2={x} y1={-6} y2={6} stroke="var(--rule-strong)" />
            })}
          </g>
        ))}
      <rect x={-8} y={-8} width={16} height={16} fill="var(--ground-raised)" stroke="var(--ink)" strokeWidth={0.5} />
      {dish && <circle cx={0} cy={-18} r={9} fill="var(--ground)" stroke={stroke} strokeWidth={0.5} />}
      {dish && <line x1={0} x2={0} y1={-8} y2={-9} stroke={stroke} strokeWidth={0.5} />}
      {laser && <circle cx={-5} cy={-5} r={2} fill="none" stroke={stroke} strokeWidth={0.4} />}
      {rtg && <rect x={-3} y={8} width={6} height={9} fill="var(--ground)" stroke={stroke} strokeWidth={0.4} />}
      {instruments.map((p, k) => (
        <rect key={p.id} x={-6 + k * 4.5} y={9} width={3.4} height={3.4} fill="var(--ground)" stroke={stroke} strokeWidth={0.4} />
      ))}
      <text x={0} y={44} textAnchor="middle" fontSize={3.4} fill="var(--ink-3)" className="num">
        {areaM2 > 0 ? `${areaM2} m² arrays` : 'no arrays'} · load {formatNumber(loadW)} W
      </text>
    </svg>
  )
}
