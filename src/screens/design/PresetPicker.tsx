// The rocket tab's preset list: real vehicle classes rebuilt from catalog parts, each with its
// capacity to the player's C3 and, where it applies, its agreement with the NASA LSP curve.
import { BadgeCheck } from 'lucide-react'
import { useId } from 'react'
import { capacityKgFor, useGame } from '@/app/store'
import { formatNumber } from '@/components/status'
import { cn } from '@/lib/utils'
import type { RocketDesign } from '@/physics/launcher'
import { SectionHeading } from './controls'
import { PICKER_PRESETS } from './rocketEdit'

/** Spread of the validated presets around their LSP curves (launcher.test.ts checks ±8%). */
export const LSP_TOLERANCE_PCT = 8

export function PresetPicker({ rocket, currentId, c3 }: { rocket: RocketDesign; currentId: string | null; c3: number | null }) {
  const applyPreset = useGame((s) => s.applyPreset)
  const name = useId()
  const current = PICKER_PRESETS.find((p) => p.id === currentId)
  return (
    <section aria-labelledby="rocket-presets" className="flex flex-col">
      <SectionHeading id="rocket-presets" aside={current ? 'Preset applied' : rocket.stages.length ? 'Custom stack' : undefined}>
        Start from a preset
      </SectionHeading>
      <div role="radiogroup" aria-labelledby="rocket-presets" className="grid gap-x-8 @xl:grid-cols-2">
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

