// The design workspace: trajectory, rocket and spacecraft as three tabs the player moves between
// freely, and a rail that keeps the launch decision in view (mass against the launch limit, cost
// against the budget, the go/no-go poll, the Launch button).
import { ArrowRight } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { useEffect, useMemo, useState } from 'react'
import {
  selectLaunchOverride,
  useCanLaunch,
  useCapacityKg,
  useChecklist,
  useGame,
  useRocketStats,
  useSpacecraftStats,
  useTransfer,
  type DesignTab,
} from '@/app/store'
import { ActionButton } from '@/components/ActionButton'
import { Checklist } from '@/components/Checklist'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Gauge } from '@/components/Gauge'
import { formatNumber } from '@/components/status'
import { MISSION } from '@/data/mission'
import type { CheckItem } from '@/game/checklist'
import { cn } from '@/lib/utils'
import { RocketTab } from './RocketTab'
import { SpacecraftTab } from './SpacecraftTab'
import { TrajectoryTab } from './TrajectoryTab'

export const DESIGN_TABS: { id: DesignTab; name: string; checks: CheckItem['id'][] }[] = [
  { id: 'trajectory', name: 'Trajectory', checks: ['trajectory'] },
  { id: 'rocket', name: 'Rocket', checks: ['rocket-valid', 'twr', 'margin'] },
  { id: 'spacecraft', name: 'Spacecraft', checks: ['spacecraft', 'power', 'comms', 'instruments', 'propulsion'] },
]

/** The tab that fixes a checklist item (budget: whichever costs more is not knowable, so the rocket tab). */
export function tabForCheck(id: CheckItem['id']): DesignTab {
  return DESIGN_TABS.find((t) => t.checks.includes(id))?.id ?? 'rocket'
}

function scrollScreenTop() {
  document.getElementById('screen')?.scrollTo({ top: 0 })
}

export function DesignWorkspace() {
  const tab = useGame((s) => s.designTab)
  const setTab = useGame((s) => s.setDesignTab)
  const loadPorkchop = useGame((s) => s.loadPorkchop)
  const checklist = useChecklist()
  // Start the grid in the background whichever tab opens first.
  useEffect(() => {
    void loadPorkchop()
  }, [loadPorkchop])

  const openTab = (t: DesignTab) => {
    if (t !== tab) scrollScreenTop()
    setTab(t)
  }

  return (
    <div className="mx-auto flex w-full max-w-[104rem] flex-1 items-start gap-8 px-8 pb-12">
      <h1 className="sr-only">Mission design</h1>
      <Tabs.Root value={tab} onValueChange={(v) => openTab(v as DesignTab)} className="min-w-0 flex-1 pt-6">
        <Tabs.List aria-label="Design workspace" className="flex items-stretch border-b border-rule">
          {DESIGN_TABS.map((t, i) => {
            const items = checklist.filter((c) => t.checks.includes(c.id))
            const bad = items.filter((c) => !c.ok).length
            return (
              <Tabs.Trigger
                key={t.id}
                value={t.id}
                // Radix focuses the tab from script on mouse down, which Chrome treats as keyboard focus
                // (the focus ring would box a clicked tab). Focus it first without the ring; keyboard
                // focus still shows it.
                onMouseDown={(e) => {
                  if (e.button === 0) (e.currentTarget as HTMLElement).focus({ focusVisible: false } as FocusOptions)
                }}
                className={cn(
                  'group -mb-px flex h-12 items-center gap-2.5 border-b-2 border-transparent px-4 text-lead transition-colors first:pl-0',
                  'text-ink-2 hover:text-ink data-[state=active]:border-mars data-[state=active]:font-semibold data-[state=active]:text-ink',
                )}
              >
                <span className="num text-label text-ink-3 group-data-[state=active]:text-mars">{i + 1}</span>
                <span className="[font-stretch:88%]">{t.name}</span>
                <span className={cn('label-caps', bad ? 'text-nogo' : 'text-go')}>
                  {bad ? `${bad} no-go` : 'go'}
                  <span className="sr-only"> ({items.length} checks)</span>
                </span>
              </Tabs.Trigger>
            )
          })}
        </Tabs.List>
        <Tabs.Content value="trajectory" className="pt-6 outline-none">
          <TrajectoryTab />
        </Tabs.Content>
        <Tabs.Content value="rocket" className="pt-6 outline-none">
          <RocketTab />
        </Tabs.Content>
        <Tabs.Content value="spacecraft" className="pt-6 outline-none">
          <SpacecraftTab />
        </Tabs.Content>
      </Tabs.Root>
      <DesignRail onOpenTab={openTab} />
    </div>
  )
}

function DesignRail({ onOpenTab }: { onOpenTab: (t: DesignTab) => void }) {
  const checklist = useChecklist()
  const canLaunch = useCanLaunch()
  const transfer = useTransfer()
  const capacity = useCapacityKg()
  const sc = useSpacecraftStats()
  const rocket = useRocketStats()
  const startLaunch = useGame((s) => s.startLaunch)
  const launched = useGame((s) => s.launched)
  const design = useGame((s) => s.design)
  const override = useMemo(() => selectLaunchOverride({ design }), [design])
  const [confirming, setConfirming] = useState(false)
  // Launching again while this design is flying starts the flight over: ask first.
  const [restart, setRestart] = useState<{ override: boolean } | null>(null)
  const launch = (override: boolean) => {
    if (launched) setRestart({ override })
    else startLaunch(override ? { override: true } : undefined)
  }
  const noGo = checklist.filter((i) => !i.ok).length
  const limit = MISSION.launchMargin * capacity
  const cost = rocket.costM + sc.costM

  return (
    <aside
      aria-label="Launch readiness"
      className="sticky top-0 flex max-h-[calc(100dvh-var(--topbar-h))] w-[18.5rem] shrink-0 flex-col pt-6"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain pr-1 pb-4">
        <div className="flex flex-col gap-4 pt-3">
          {transfer ? (
            <Gauge
              label="Mass vs launch limit"
              value={sc.wetKg}
              max={Math.max(capacity, sc.wetKg, 1)}
              threshold={limit}
              unit="kg"
              status={capacity <= 0 ? 'bad' : undefined}
            />
          ) : (
            <div className="flex flex-col gap-1">
              <span className="label-caps text-ink-3">Mass vs launch limit</span>
              <p className="num text-detail text-ink-2">
                {formatNumber(sc.wetKg)} kg wet. The limit depends on the launch C3:{' '}
                <button type="button" onClick={() => onOpenTab('trajectory')} className="text-ink underline underline-offset-4 decoration-rule-strong hover:decoration-ink">
                  pick a transfer
                </button>
                .
              </p>
            </div>
          )}
          <Gauge
            label="Cost vs budget"
            value={cost}
            max={Math.max(MISSION.budgetM * 1.2, cost)}
            threshold={MISSION.budgetM}
            thresholdLabel="budget"
            unit="US$ M"
          />
          <p className="-mt-2 text-label text-ink-3">
            Rocket {formatNumber(rocket.costM)} + spacecraft {formatNumber(sc.costM)} · costs and budget are game balance
          </p>
        </div>
        <Checklist
          items={checklist}
          compact
          headingLevel={2}
          onSelectItem={(item) => onOpenTab(tabForCheck(item.id))}
          selectItemHint={(item) => `Open the ${DESIGN_TABS.find((t) => t.id === tabForCheck(item.id))?.name} tab`}
        />
      </div>
      <div className="flex flex-col gap-2 border-t border-rule pt-4 pb-6">
        {launched && (
          <p className="text-detail text-caution">
            <span className="label-caps">Caution</span> This design is flying. Any change scrubs the flight and starts again from the pad.
          </p>
        )}
        <ActionButton disabled={!canLaunch} onClick={() => launch(false)} icon={<ArrowRight aria-hidden />} className="w-full justify-between">
          Launch
        </ActionButton>
        <p className="text-detail text-ink-3" aria-live="polite">
          {canLaunch ? 'All checks go. Clear to launch.' : `Launch opens when every check is go: ${noGo} no-go.`}
        </p>
        {override &&
          (confirming ? (
            <div className="flex flex-col gap-2 border-t border-nogo pt-2" role="group" aria-label="Launch against the checklist">
              <p className="text-detail text-ink-2">
                <span className="label-caps text-nogo">No-go</span> {override.map((i) => i.label).join(' · ')}. The rocket may stay on
                the pad or fall short of Mars, and the report will show why.
              </p>
              <div className="flex gap-2">
                <ActionButton tone="quiet" onClick={() => launch(true)}>
                  Launch anyway
                </ActionButton>
                <ActionButton tone="quiet" onClick={() => setConfirming(false)}>
                  Cancel
                </ActionButton>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="self-start text-detail text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              Launch against the checklist…
            </button>
          ))}
      </div>
      <ConfirmDialog
        open={restart !== null}
        onOpenChange={(open) => !open && setRestart(null)}
        title="Restart the mission?"
        confirm="Restart from the pad"
        cancel="Keep flying"
        onConfirm={() => {
          startLaunch(restart?.override ? { override: true } : undefined)
          setRestart(null)
        }}
      >
        This design is already flying. Launching again starts a new flight from the pad: your flight so far will be lost.
      </ConfirmDialog>
    </aside>
  )
}
