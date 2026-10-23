// Rocket: start from a preset (real vehicle classes rebuilt from catalog parts, checked against
// NASA LSP curves) or stack stages yourself. Per-stage Δv, TWR, mass and cost; the whole rocket's
// capacity to the C3 of the chosen transfer. The hangar slot (data-slot="hangar-3d") holds the 3D
// hangar (lazy-loaded); the to-scale elevation stands in while it loads and when WebGL is off.
// Layout follows the tab's own width (container queries), not the viewport: next to the stage
// editor when there is room, above it when the physics panel leaves the tab narrow.
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { useCapacityKg, useGame, useRocketStats, useTransfer } from '@/app/store'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { lspPayloadKg } from '@/data/lsp'
import { MISSION } from '@/data/mission'
import { HangarView } from '@/scenes/SceneSlot'
import { useWebGL2 } from '@/scenes/webgl'
import { MAX_STAGES, MIN_LIFTOFF_TWR, type RocketDesign } from '@/physics/launcher'
import { ErrorList, GameBalance, SectionHeading, TextButton } from './controls'
import { PresetPicker } from './PresetPicker'
import { addStage, matchingPreset } from './rocketEdit'
import { StackElevation } from './StackElevation'
import { FairingPicker, StageEditor } from './StageEditor'

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
              ? 'Tanks and boosters to scale from the catalog; engine bells, interstages and fairings at approximate real sizes. Drag to turn; Ctrl + scroll or the buttons to zoom.'
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
