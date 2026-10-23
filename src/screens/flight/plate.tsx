// Shared frame of the flight screens (launch, cruise, arrival, operations, report): the plate, its
// title row, and the empty state shown when a screen is opened without the flight it needs.
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { ActionButton } from '@/components/ActionButton'
import { cn } from '@/lib/utils'

export function Plate({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn('mx-auto flex w-full flex-1 flex-col px-8 pt-8 pb-10', wide ? 'max-w-[84rem]' : 'max-w-[68rem]', className)}>
      {children}
    </div>
  )
}

/** The screen title (display style) with its one line, and optional figures on the right. */
export function PlateTitle({ title, line, aside }: { title: string; line?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-display font-semibold tracking-[-0.025em] text-balance [font-stretch:84%]">{title}</h1>
        {line && <p className="mt-2 max-w-[66ch] text-lead text-ink-2">{line}</p>}
      </div>
      {aside}
    </div>
  )
}

/** The bottom row of a plate: the one primary action at the left. */
export function PlateActions({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-10">{children}</div>
}

/** Shown when a flight screen opens without its state (e.g. reached through the stepper too early). */
export function NoFlight({ title, line, action, onAction }: { title: string; line: string; action: string; onAction: () => void }) {
  return (
    <Plate>
      <PlateTitle title={title} line={line} />
      <PlateActions>
        <ActionButton onClick={onAction} icon={<ArrowRight aria-hidden />}>
          {action}
        </ActionButton>
      </PlateActions>
    </Plate>
  )
}

/** One labelled line of numbers in a ruled list ("Cost now … 2.39 m/s"). */
export function Fact({ label, children, tone }: { label: string; children: ReactNode; tone?: 'ok' | 'bad' }) {
  return (
    <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-b border-rule py-1.5">
      <dt className="label-caps text-ink-3">{label}</dt>
      <dd className={cn('num text-small', tone === 'ok' ? 'text-go' : tone === 'bad' ? 'text-nogo' : 'text-ink')}>{children}</dd>
    </div>
  )
}
