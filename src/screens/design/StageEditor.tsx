// One stage of the rocket tab (engine, tanks, boosters, the stage's own Δv, TWR, mass and cost) and
// the fairing choice. Pure edits through rocketEdit.ts; the tab passes the new design up.
import { Trash2, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { formatNumber } from '@/components/status'
import { BOOSTERS, boosterById } from '@/data/boosters'
import { engineById } from '@/data/engines'
import { tankById } from '@/data/tanks'
import { cn } from '@/lib/utils'
import {
  FAIRINGS,
  MAX_BOOSTERS,
  MAX_ENGINES,
  MIN_ENGINES,
  MIN_LIFTOFF_TWR,
  UPPER_STAGE_MIN_TWR,
  type RocketDesign,
  type StageStat,
} from '@/physics/launcher'
import { ErrorList, GameBalance, Select, Stepper, TextButton } from './controls'
import {
  PROPELLANT_NAME,
  addTank,
  dropMismatchedTanks,
  enginesFor,
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

const t = (kg: number, digits = 1) => formatNumber(kg / 1000, digits)

export function StageEditor({
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
    <li aria-labelledby={headingId} className="@container border-t border-rule-strong py-4">
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
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 @lg:grid-cols-4">
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

export function FairingPicker({ rocket, onChange }: { rocket: RocketDesign; onChange: (r: RocketDesign) => void }) {
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
