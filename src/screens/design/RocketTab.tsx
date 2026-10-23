// Rocket: start from a preset (real vehicle classes rebuilt from catalog parts, checked against
// NASA LSP curves) or stack stages yourself. Per-stage Δv, TWR, mass and cost; the whole rocket's
// capacity to the C3 of the chosen transfer. The hangar slot (data-slot="hangar-3d") holds the 3D
// hangar (lazy-loaded); the to-scale elevation stands in while it loads and when WebGL is off.
// Layout follows the tab's own width (container queries), not the viewport: next to the stage
// editor when there is room, above it when the physics panel leaves the tab narrow.
import { BadgeCheck, Plus, Trash2, X } from 'lucide-react'
import { useId, useMemo, type ReactNode } from 'react'
import { capacityKgFor, useCapacityKg, useGame, useRocketStats, useTransfer } from '@/app/store'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { BOOSTERS, boosterById } from '@/data/boosters'
import { engineById } from '@/data/engines'
import { lspPayloadKg } from '@/data/lsp'
import { MISSION } from '@/data/mission'
import { tankById } from '@/data/tanks'
import { cn } from '@/lib/utils'
import { HangarView } from '@/scenes/SceneSlot'
import { useWebGL2 } from '@/scenes/webgl'
import {
  FAIRINGS,
  MAX_BOOSTERS,
  MAX_ENGINES,
  MAX_STAGES,
  MIN_ENGINES,
  MIN_LIFTOFF_TWR,
  UPPER_STAGE_MIN_TWR,
  type RocketDesign,
  type StageStat,
} from '@/physics/launcher'
import { ErrorList, GameBalance, Select, SectionHeading, Stepper, TextButton } from './controls'
import {
  PICKER_PRESETS,
  PROPELLANT_NAME,
  addStage,
  addTank,
  dropMismatchedTanks,
  enginesFor,
  matchingPreset,
  removeStage,
  removeTank,
  setBooster,
  setBoosterCount,
  setEngine,
  setEngineCount,
  setFairing,
  stageCostM,
  tanksFor,
} from './rocketEdit'
import { StackElevation } from './StackElevation'

/** Spread of the validated presets around their LSP curves (launcher.test.ts checks ±8%). */
const LSP_TOLERANCE_PCT = 8

const t = (kg: number, digits = 1) => formatNumber(kg / 1000, digits)

export function RocketTab() {
  const rocket = useGame((s) => s.design.rocket)
  const setRocket = useGame((s) => s.setRocket)
  const setDesignTab = useGame((s) => s.setDesignTab)
  const stats = useRocketStats()
  const transfer = useTransfer()
  const capacity = useCapacityKg()
  const preset = useMemo(() => matchingPreset(rocket), [rocket])
  const edit = (f: (r: RocketDesign) => RocketDesign) => setRocket(f(rocket))

  const lspKg = preset?.lspCurveId && transfer ? lspPayloadKg(preset.lspCurveId, transfer.c3) : Number.NaN
  const lspDiff = Number.isFinite(lspKg) && lspKg > 0 ? (capacity / lspKg - 1) * 100 : Number.NaN
  const rocketErrors = stats.errors.filter((e) => !/^Stage \d/.test(e))
  const gl = useWebGL2()

  return (
    <div className="@container flex flex-col gap-10">
      <header className="max-w-[62ch]">
        <h2 className="text-title font-semibold [font-stretch:88%]">Build the launcher</h2>
        <p className="mt-1 text-small text-ink-2">
          Start from a real vehicle class or stack your own. Each stage’s Δv comes from the rocket equation; capacity is the
          heaviest spacecraft the stack can push to your launch C3.
        </p>
      </header>

      {/* Whole rocket */}
      <section aria-labelledby="rocket-whole" className="flex flex-col gap-4">
        <h3 id="rocket-whole" className="sr-only">
          Whole rocket
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 @2xl:grid-cols-4">
          <Readout
            label="Capacity"
            value={transfer ? capacity : '–'}
            unit="kg"
            size="lg"
            status={transfer && capacity <= 0 ? 'bad' : undefined}
            hint={
              !transfer ? (
                <TextButton className="-ml-1 h-auto" onClick={() => setDesignTab('trajectory')}>
                  Pick a transfer to size the rocket
                </TextButton>
              ) : capacity > 0 ? (
                `To C3 ${formatNumber(transfer.c3, 2)} km²/s² · spacecraft limit ${formatNumber(MISSION.launchMargin * capacity)} kg (90%)`
              ) : (
                `Cannot reach C3 ${formatNumber(transfer.c3, 2)} km²/s²`
              )
            }
          />
          {preset?.lspCurveId ? (
            <Readout
              label="NASA LSP curve"
              value={transfer ? lspKg : '–'}
              unit="kg"
              size="lg"
              hint={
                transfer
                  ? Number.isFinite(lspDiff)
                    ? `Reference at this C3 · yours ${lspDiff >= 0 ? '+' : '−'}${formatNumber(Math.abs(lspDiff), 1)}%`
                    : 'This C3 is beyond the published curve'
                  : 'Published payload at your C3'
              }
            />
          ) : (
            <Readout
              label="Total Δv"
              value={stats.totalDv}
              unit="m/s"
              size="lg"
              hint="All stages, with the spacecraft aboard"
            />
          )}
          <Readout
            label="Liftoff TWR"
            value={stats.liftoffTwr}
            digits={2}
            status={rocket.stages.length ? (stats.liftoffTwr >= MIN_LIFTOFF_TWR ? 'ok' : 'bad') : undefined}
            hint={<>Minimum {formatNumber(MIN_LIFTOFF_TWR, 1)}, <GameBalance /></>}
          />
          <Readout
            label="Rocket cost"
            value={stats.costM}
            unit="US$ M"
            hint={<>Liftoff mass {t(stats.massKg, 0)} t · <GameBalance /></>}
          />
        </div>
      </section>

      <PresetPicker rocket={rocket} currentId={preset?.id ?? null} c3={transfer?.c3 ?? null} />

      <div className="grid gap-x-10 gap-y-8 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] @6xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <aside aria-label="Hangar" className="@4xl:sticky @4xl:top-6 @4xl:col-start-2 @4xl:row-start-1 @4xl:self-start">
          <div
            data-slot="hangar-3d"
            className="relative aspect-[3/2] max-h-[28rem] w-full overflow-hidden border border-rule bg-ground-sunken @4xl:aspect-auto @4xl:h-[min(42rem,calc(100dvh-var(--topbar-h)-4rem))] @4xl:max-h-none"
          >
            <HangarView
              rocket={rocket}
              fallback={
                <div className="absolute inset-0 p-4">
                  <StackElevation rocket={rocket} />
                </div>
              }
            />
          </div>
          <p className="mt-2 text-detail text-ink-3">
            {gl
              ? 'Tanks and boosters to scale from the catalog; engine bells, interstages and fairings at approximate real sizes. Drag to turn, scroll to zoom.'
              : 'Side elevation to scale from the catalog’s tank and booster sizes.'}
          </p>
        </aside>

        <section aria-labelledby="rocket-stages" className="flex min-w-0 flex-col @4xl:col-start-1 @4xl:row-start-1">
          <SectionHeading
            id="rocket-stages"
            aside={`${rocket.stages.length} of ${MAX_STAGES} stages · top stage first`}
          >
            Stages
          </SectionHeading>
          <ErrorList errors={rocketErrors} className="mt-3" />
          <div className="flex items-center justify-between gap-3 py-2">
            <TextButton
              onClick={() => edit(addStage)}
              disabled={rocket.stages.length >= MAX_STAGES}
              title={rocket.stages.length >= MAX_STAGES ? `At most ${MAX_STAGES} stages` : undefined}
            >
              <Plus aria-hidden />
              {rocket.stages.length === 0 ? 'Add a first stage' : 'Add a stage on top'}
            </TextButton>
            {rocket.stages.length >= MAX_STAGES && <span className="text-detail text-ink-3">At most {MAX_STAGES} stages</span>}
          </div>
          {rocket.stages.length === 0 ? (
            <p className="border-t border-rule py-6 text-small text-ink-2">
              No stages: nothing leaves the pad. Add a first stage or pick a preset above.
            </p>
          ) : (
            <ol className="flex flex-col">
              {rocket.stages
                .map((_, i) => i)
                .reverse()
                .map((i) => (
                  <StageEditor key={i} rocket={rocket} index={i} stat={stats.stages[i]} onChange={setRocket} />
                ))}
            </ol>
          )}
          <FairingPicker rocket={rocket} onChange={setRocket} />
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

function PresetPicker({ rocket, currentId, c3 }: { rocket: RocketDesign; currentId: string | null; c3: number | null }) {
  const applyPreset = useGame((s) => s.applyPreset)
  const name = useId()
  const current = PICKER_PRESETS.find((p) => p.id === currentId)
  return (
    <section aria-labelledby="rocket-presets" className="flex flex-col">
      <SectionHeading id="rocket-presets" aside={current ? 'Preset applied' : rocket.stages.length ? 'Custom stack' : undefined}>
        Start from a preset
      </SectionHeading>
      <div role="radiogroup" aria-labelledby="rocket-presets" className="grid gap-x-8 sm:grid-cols-2">
        {PICKER_PRESETS.map((p) => {
          const checked = p.id === currentId
          const cap = c3 !== null ? capacityKgFor(p.rocket, c3) : null
          return (
            <label
              key={p.id}
              className={cn(
                'group relative flex cursor-pointer items-start gap-3 border-b border-rule py-3 pr-2 transition-colors hover:bg-ground-hover/60',
                checked && 'bg-ground-raised',
              )}
            >
              <input
                type="radio"
                name={name}
                value={p.id}
                checked={checked}
                onChange={() => applyPreset(p.id)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'mt-1 ml-2 grid size-3.5 shrink-0 place-items-center rounded-full border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mars',
                  checked ? 'border-mars' : 'border-ink-3',
                )}
              >
                {checked && <span className="size-1.5 rounded-full bg-mars" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cn('text-small font-medium', checked ? 'text-ink' : 'text-ink-2 group-hover:text-ink')}>{p.name}</span>
                </span>
                {p.lspCurveId && (
                  <span className="mt-0.5 flex items-center gap-1 text-detail text-ink-2">
                    <BadgeCheck aria-hidden className="size-3.5 text-ink-3" />
                    Matches NASA LSP curve within ±{LSP_TOLERANCE_PCT}%
                  </span>
                )}
                <span className="num mt-0.5 block text-detail text-ink-3">
                  {p.rocket.stages.length} stages
                  {cap !== null && <> · {cap > 0 ? `${formatNumber(cap)} kg to your C3` : 'cannot reach your C3'}</>}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {current && <p className="mt-3 max-w-[72ch] text-detail text-ink-2">{current.description}</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------

function StageEditor({
  rocket,
  index: i,
  stat,
  onChange,
}: {
  rocket: RocketDesign
  index: number
  stat: StageStat | undefined
  onChange: (r: RocketDesign) => void
}) {
  const stage = rocket.stages[i]!
  const engine = stage.engineId ? engineById(stage.engineId) : undefined
  const tankOptions = tanksFor(stage.engineId)
  const mismatched = engine ? stage.tanks.some((id) => tankById(id)?.propellant !== engine.propellant) : false
  const booster = stage.boosterId ? boosterById(stage.boosterId) : undefined
  const headingId = useId()
  const label = `Stage ${i + 1}`
  const errors = stat?.errors ?? []
  const twrMin = i === 0 ? MIN_LIFTOFF_TWR : UPPER_STAGE_MIN_TWR
  const twrOk = (stat?.twr ?? 0) >= twrMin
  const propKg = stage.tanks.reduce((a, id) => a + (tankById(id)?.propellantKg ?? 0), 0)

  return (
    <li aria-labelledby={headingId} className="border-t border-rule-strong py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 id={headingId} className="text-small font-semibold">
          {label}
          <span className="ml-2 font-normal text-ink-3">
            {i === 0 ? 'first stage' : i === rocket.stages.length - 1 ? 'upper stage' : 'middle stage'}
            {engine ? ` · ${PROPELLANT_NAME[engine.propellant]}` : ''}
          </span>
        </h4>
        <TextButton onClick={() => onChange(removeStage(rocket, i))} aria-label={`Remove ${label}`}>
          <Trash2 aria-hidden />
          Remove
        </TextButton>
      </div>

      {/* Engine */}
      <div className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <span className="label-caps text-ink-3">Engine</span>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={`${label} engine`}
            value={stage.engineId ?? ''}
            onChange={(e) => onChange(setEngine(rocket, i, e.target.value || null))}
            className="w-56"
          >
            <option value="">No engine</option>
            {(['kerolox', 'methalox', 'hydrolox'] as const).map((prop) => (
              <optgroup key={prop} label={PROPELLANT_NAME[prop]}>
                {enginesFor(i)
                  .filter((x) => x.engine.propellant === prop)
                  .map(({ engine: e, usable }) => (
                    <option key={e.id} value={e.id} disabled={!usable}>
                      {e.name}
                      {!usable ? ' (vacuum only)' : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
          <Stepper
            label={`${engine?.name ?? 'Engines'} on ${label}`}
            value={stage.engineCount}
            min={MIN_ENGINES}
            max={MAX_ENGINES}
            suffix="×"
            onChange={(n) => onChange(setEngineCount(rocket, i, n))}
          />
        </div>
        {engine && (
          <p className="num col-start-2 text-detail text-ink-3">
            {formatNumber((i === 0 ? engine.thrustSL : engine.thrustVac) / 1000)} kN {i === 0 ? 'at sea level' : 'in vacuum'} · Isp{' '}
            {formatNumber(i === 0 ? engine.ispSL : engine.ispVac)} s · {formatNumber(engine.massKg)} kg each · US$ {formatNumber(engine.costM, 1)} M
          </p>
        )}

        {/* Tanks */}
        <span className="label-caps self-start pt-2 text-ink-3">Tanks</span>
        <div className="flex min-w-0 flex-col">
          {stage.tanks.length === 0 && <p className="py-1.5 text-detail text-ink-3">No tanks: the engine has nothing to burn.</p>}
          <ul className="flex flex-col">
            {stage.tanks.map((id, k) => {
              const tank = tankById(id)
              const wrong = engine !== undefined && tank !== undefined && tank.propellant !== engine.propellant
              return (
                <li key={`${id}-${k}`} className="flex items-center justify-between gap-3 border-b border-rule py-1.5">
                  <span className="min-w-0">
                    <span className={cn('block truncate text-small', wrong ? 'text-nogo' : 'text-ink')}>{tank?.name ?? id}</span>
                    <span className="num block text-detail text-ink-3">
                      {tank ? `${t(tank.propellantKg)} t propellant · ${t(tank.dryKg)} t dry · ${formatNumber(tank.lengthM, 1)} m long` : 'Unknown tank'}
                      {wrong && <span className="text-nogo"> · wrong propellant</span>}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(removeTank(rocket, i, k))}
                    aria-label={`Remove ${tank?.name ?? id} from ${label}`}
                    className="grid size-7 shrink-0 place-items-center text-ink-3 transition-colors hover:bg-ground-hover hover:text-ink"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
            <Select
              aria-label={`Add a tank to ${label}`}
              value=""
              onChange={(e) => {
                if (e.target.value) onChange(addTank(rocket, i, e.target.value))
              }}
              className="w-64"
            >
              <option value="">{engine ? `Add a ${engine.propellant} tank…` : 'Add a tank…'}</option>
              {tankOptions.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {tk.name} · {t(tk.propellantKg)} t
                </option>
              ))}
            </Select>
            {mismatched && (
              <TextButton onClick={() => onChange(dropMismatchedTanks(rocket, i))}>Remove tanks with the wrong propellant</TextButton>
            )}
          </div>
        </div>

        {/* Boosters, first stage only */}
        {i === 0 && (
          <>
            <span className="label-caps text-ink-3">Boosters</span>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Strap-on boosters on stage 1"
                value={stage.boosterId ?? ''}
                onChange={(e) => onChange(setBooster(rocket, e.target.value || null))}
                className="w-56"
              >
                <option value="">None</option>
                {BOOSTERS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              {booster && (
                <Stepper
                  label={`${booster.name}s on stage 1`}
                  value={stage.boosterCount ?? 0}
                  min={0}
                  max={MAX_BOOSTERS}
                  suffix="×"
                  onChange={(n) => onChange(setBoosterCount(rocket, n))}
                />
              )}
            </div>
            {booster && (
              <p className="num col-start-2 text-detail text-ink-3">
                {formatNumber(booster.thrustSL / 1000)} kN at liftoff · {t(booster.propellantKg)} t propellant each · US${' '}
                {formatNumber(booster.costM)} M each
              </p>
            )}
          </>
        )}
      </div>

      {/* Stage readouts */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <MiniStat label="Δv" value={formatNumber(stat?.dv ?? 0)} unit="m/s" hint={`${t(propKg)} t propellant`} />
        <MiniStat
          label={i === 0 ? 'Liftoff TWR' : 'Ignition TWR'}
          value={formatNumber(stat?.twr ?? 0, 2)}
          status={engine ? (twrOk ? 'ok' : 'bad') : undefined}
          hint={`min ${formatNumber(twrMin, i === 0 ? 1 : 2)}`}
        />
        <MiniStat label="Mass at ignition" value={t(stat?.m0 ?? 0)} unit="t" hint="incl. everything above" />
        <MiniStat label="Cost" value={formatNumber(stageCostM(stage), 1)} unit="US$ M" hint={<GameBalance />} />
      </dl>
      <ErrorList errors={errors} className="mt-3" />
    </li>
  )
}

function MiniStat({
  label,
  value,
  unit,
  hint,
  status,
}: {
  label: string
  value: string
  unit?: string
  hint?: ReactNode
  status?: 'ok' | 'bad'
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-t border-rule pt-1.5">
      <dt className="flex items-baseline justify-between gap-2">
        <span className="label-caps truncate text-ink-3">{label}</span>
        {status && <span className={cn('label-caps', status === 'ok' ? 'text-go' : 'text-nogo')}>{status === 'ok' ? 'GO' : 'NO-GO'}</span>}
      </dt>
      <dd className="num whitespace-nowrap">
        <span className="text-body font-medium text-ink">{value}</span>
        {unit && value !== '–' && <span className="ml-1 text-detail text-ink-2">{unit}</span>}
        {hint && <span className="block text-detail text-ink-3">{hint}</span>}
      </dd>
    </div>
  )
}

function FairingPicker({ rocket, onChange }: { rocket: RocketDesign; onChange: (r: RocketDesign) => void }) {
  const name = useId()
  return (
    <fieldset className="mt-2 border-t border-rule-strong pt-4">
      <legend className="float-left mr-6 text-small font-semibold">Payload fairing</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {(Object.keys(FAIRINGS) as RocketDesign['fairing'][]).map((f) => {
          const checked = rocket.fairing === f
          return (
            <label key={f} className="flex cursor-pointer items-center gap-2 text-small">
              <input type="radio" name={name} checked={checked} onChange={() => onChange(setFairing(rocket, f))} className="peer sr-only" />
              <span
                aria-hidden
                className={cn(
                  'grid size-3.5 place-items-center rounded-full border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mars',
                  checked ? 'border-mars' : 'border-ink-3',
                )}
              >
                {checked && <span className="size-1.5 rounded-full bg-mars" />}
              </span>
              <span className={checked ? 'text-ink' : 'text-ink-2'}>
                {FAIRINGS[f].label}
                <span className="num ml-2 text-detail text-ink-3">
                  {formatNumber(FAIRINGS[f].massKg)} kg · US$ {FAIRINGS[f].costM} M
                </span>
              </span>
            </label>
          )
        })}
        <span className="text-detail text-ink-3">
          Masses <GameBalance />; dropped after stage 1.
        </span>
      </div>
    </fieldset>
  )
}
