// Trajectory: the porkchop plot of the late-2026 window and what the chosen cell means for the
// rest of the design (launch energy for the rocket, arrival speed for the spacecraft's brake burn).
import { AlertTriangle, LocateFixed, RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useCapacityKg, useGame, useSpacecraftStats, useTransfer } from '@/app/store'
import { PorkchopLegend, PorkchopPlot } from '@/components/PorkchopPlot'
import { Readout } from '@/components/Readout'
import { formatNumber } from '@/components/status'
import { MISSION } from '@/data/mission'
import { DEFAULT_PORKCHOP, transferFor } from '@/physics/porkchop'
import { formatJd } from '@/physics/time'
import { SolarSystemView } from '@/scenes/SceneSlot'
import type { Focus } from '@/scenes/SolarSystem'
import { useWebGL2 } from '@/scenes/webgl'
import { TransferMap } from '../flight/CruiseMap'
import { TextButton } from './controls'

/** Cells of the default grid (same arithmetic as computePorkchop), for the loading message. */
const s0 = DEFAULT_PORKCHOP
const GRID_CELLS =
  (Math.floor((s0.depEndJd - s0.depStartJd) / s0.depStepDays + 1e-9) + 1) *
  (Math.floor((s0.arrEndJd - s0.arrStartJd) / s0.arrStepDays + 1e-9) + 1)

export function TrajectoryTab() {
  const grid = useGame((s) => s.porkchop)
  const status = useGame((s) => s.porkchopStatus)
  const selected = useGame((s) => s.design.transfer)
  const loadPorkchop = useGame((s) => s.loadPorkchop)
  const setTransfer = useGame((s) => s.setTransfer)
  const setHoverTransfer = useGame((s) => s.setHoverTransfer)

  useEffect(() => {
    void loadPorkchop()
    // Leaving the tab drops any preview so nothing downstream shows a stale hover.
    return () => setHoverTransfer(null)
  }, [loadPorkchop, setHoverTransfer])

  const pickMinimum = () => {
    if (!grid) return
    const t = transferFor(grid.best.depJd, grid.best.arrJd, grid.spec)
    if (t) setTransfer(t)
  }

  return (
    <div className="@container flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="max-w-[62ch]">
          <h2 className="text-title font-semibold [font-stretch:88%]">Choose launch and arrival dates</h2>
          <p className="mt-1 text-small text-ink-2">
            Every cell is one Lambert solve between Earth and Mars on JPL Horizons positions. Bright cells need little launch
            energy. Lower C3 lets the rocket lift more; a lower arrival v∞ needs less braking at Mars.
          </p>
        </div>
        {grid && (
          <TextButton onClick={pickMinimum}>
            <LocateFixed aria-hidden />
            Choose the minimum C3
          </TextButton>
        )}
      </header>

      {status === 'error' ? (
        <PlotMessage>
          <AlertTriangle aria-hidden className="size-5 text-caution" />
          <p className="text-small text-ink">The porkchop plot could not be computed.</p>
          <p className="max-w-[48ch] text-detail text-ink-2">
            The calculation runs in a background worker in your browser. Try again; if it keeps failing, reload the page.
          </p>
          <TextButton onClick={() => void loadPorkchop()} className="mt-1">
            <RotateCw aria-hidden />
            Compute again
          </TextButton>
        </PlotMessage>
      ) : !grid ? (
        <PlotMessage busy>
          <span className="block h-px w-40 overflow-hidden bg-rule">
            <span className="block h-px w-1/3 animate-[porkchop-scan_1.2s_var(--ease-in-out)_infinite] bg-ink-2 motion-reduce:w-full motion-reduce:animate-none" />
          </span>
          <p className="text-small text-ink">Solving Lambert’s problem for {formatNumber(GRID_CELLS)} date pairs…</p>
          <p className="text-detail text-ink-3">Computed in your browser on JPL Horizons ephemerides.</p>
        </PlotMessage>
      ) : (
        <div className="@container">
          <div className="grid items-start gap-x-8 gap-y-6 @5xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <figure className="flex min-w-0 flex-col gap-3">
              {/* The plot first (it owns the field and must start above the fold on a laptop); its key
                  and caption sit under it, as in a handbook figure. */}
              <PorkchopPlot grid={grid} selected={selected} onHover={setHoverTransfer} onSelect={setTransfer} />
              <PorkchopLegend grid={grid} className="-mt-1" />
              <figcaption className="text-detail text-ink-3">
                Earth → Mars, late-2026 window. Flight times {grid.spec.minTofDays}–{grid.spec.maxTofDays} days; empty cells
                have no transfer. Arrow keys move the crosshair when the plot has focus, Enter chooses.
              </figcaption>
            </figure>
            <TrajectoryPreview />
          </div>
        </div>
      )}

      <TransferReadouts />
    </div>
  )
}

/**
 * The transfer in space: the arc under the pointer (dashed) or the chosen one (solid rust), with the
 * planets on its launch date. Beside the plot on a wide tab, under it on a narrow one.
 */
function TrajectoryPreview() {
  const preview = useGame((s) => s.hoverTransfer)
  const transfer = useTransfer()
  const gl = useWebGL2()
  const [focus, setFocus] = useState<Focus>('sun')
  const shown = preview ?? transfer
  const jd = shown?.depJd ?? DEFAULT_PORKCHOP.depStartJd
  const caption = shown ? `Launch ${formatJd(shown.depJd)} (${preview && preview !== transfer ? 'hovered' : 'chosen'})` : `Planets on ${formatJd(jd)}`
  return (
    <aside aria-label="Transfer in space" className="@5xl:sticky @5xl:top-6">
      <div data-slot="trajectory-3d" className="relative aspect-[16/10] w-full overflow-hidden border border-rule bg-ground-sunken @5xl:aspect-square">
        <SolarSystemView
          jd={jd}
          transfer={transfer}
          preview={preview}
          focus={focus}
          onFocusChange={setFocus}
          caption={caption}
          fallback={<TransferMap transfer={shown} />}
        />
      </div>
      <p className="mt-2 text-detail text-ink-3">
        {gl
          ? 'Hover the plot: the dashed arc is that cell’s transfer, sampled from its Lambert solution; the solid rust arc is your choice. Drag to turn.'
          : 'Top-down, to scale: the transfer under the pointer, or your choice.'}
      </p>
    </aside>
  )
}

function PlotMessage({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div
      role={busy ? 'status' : 'alert'}
      aria-busy={busy || undefined}
      className="flex min-h-[22rem] flex-col items-center justify-center gap-2 border border-rule bg-ground-sunken px-6 text-center"
    >
      {children}
    </div>
  )
}

/** What the chosen transfer gives the rest of the design. */
function TransferReadouts() {
  const transfer = useTransfer()
  const sc = useSpacecraftStats()
  const capacity = useCapacityKg()
  const chosen = useGame((s) => s.design.transfer)
  if (!transfer) {
    return (
      <p className="border-t border-rule-strong pt-3 text-small text-ink-2">
        {chosen
          ? 'No transfer exists between the saved dates. Pick a coloured cell on the plot.'
          : 'No transfer chosen yet. Hover the plot to compare dates, click a cell to choose it.'}
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 @xl:grid-cols-4">
      <Readout
        label="Launch C3"
        value={transfer.c3}
        digits={2}
        unit="km²/s²"
        hint={`v∞ ${formatNumber(Math.sqrt(transfer.c3), 2)} km/s leaving Earth`}
        size="lg"
      />
      <Readout
        label="Arrival v∞"
        value={transfer.vInfArrKms}
        digits={2}
        unit="km/s"
        hint={`Capture burn ${formatNumber(sc.moiDvMs)} m/s`}
      />
      <Readout label="Flight time" value={transfer.tofDays} unit="days" hint={`${formatJd(transfer.depJd)} → ${formatJd(transfer.arrJd)}`} />
      <Readout
        label="Rocket capacity"
        value={capacity}
        unit="kg"
        hint={capacity > 0 ? `Spacecraft limit ${formatNumber(MISSION.launchMargin * capacity)} kg (90%)` : 'Your rocket cannot reach this C3'}
        status={capacity > 0 ? undefined : 'bad'}
      />
    </div>
  )
}
