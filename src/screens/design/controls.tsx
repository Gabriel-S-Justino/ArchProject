// Small form controls shared by the design tabs, drawn in the handbook style: square, hairline,
// tabular figures. Every control is a native element or carries full ARIA, and every disabled
// control says why.
import { Minus, Plus, X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { STATUS_TEXT, STATUS_WORD, type Status } from '@/components/status'
import { cn } from '@/lib/utils'

export interface StepperProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** Accessible name, e.g. "RD-180 engines on stage 1". */
  label: string
  /** Shown after the value, e.g. "×". */
  suffix?: string
  className?: string
}

/** − value + with the limits enforced; the buttons at a limit are disabled and say why. */
export function Stepper({ value, min, max, onChange, label, suffix, className }: StepperProps) {
  const atMin = value <= min
  const atMax = value >= max
  return (
    <div role="group" aria-label={label} className={cn('inline-flex h-8 items-stretch border border-rule-strong', className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={atMin}
        aria-label={`Fewer: ${label}`}
        title={atMin ? `Minimum ${min}` : undefined}
        className="grid w-8 place-items-center text-ink-2 transition-colors hover:bg-ground-hover hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3/50 disabled:hover:bg-transparent"
      >
        <Minus aria-hidden className="size-3.5" />
      </button>
      <output aria-live="polite" className="num grid min-w-9 place-items-center border-x border-rule px-1 text-small font-medium text-ink">
        {value}
        {suffix}
      </output>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={atMax}
        aria-label={`More: ${label}`}
        title={atMax ? `Maximum ${max}` : undefined}
        className="grid w-8 place-items-center text-ink-2 transition-colors hover:bg-ground-hover hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3/50 disabled:hover:bg-transparent"
      >
        <Plus aria-hidden className="size-3.5" />
      </button>
    </div>
  )
}

/** A native select in the house style (the platform's own list is the most usable picker). */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 min-w-0 border border-rule-strong bg-ground px-2 text-small text-ink transition-colors hover:border-ink-3',
        'disabled:cursor-not-allowed disabled:text-ink-3',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

/** A quiet text button for secondary edits ("Add tank", "Remove stage"). */
export function TextButton({ className, children, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 items-center gap-1.5 px-1 text-detail font-medium text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline',
        'disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline [&_svg]:size-3.5 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/** Human-readable design errors, each with the NO-GO cross. Renders nothing when there are none. */
export function ErrorList({ errors, className }: { errors: string[]; className?: string }) {
  if (errors.length === 0) return null
  return (
    <ul className={cn('flex flex-col gap-1', className)} aria-label="Problems">
      {errors.map((e) => (
        <li key={e} className="flex items-start gap-2 text-detail text-nogo">
          <X aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
          <span>{e}</span>
        </li>
      ))}
    </ul>
  )
}

/** A status word in caps (GO / CAUTION / NO-GO), optionally with a count or a prefix. */
export function StatusWord({ status, children, className }: { status: Status; children?: ReactNode; className?: string }) {
  return <span className={cn('label-caps', STATUS_TEXT[status], className)}>{children ?? STATUS_WORD[status]}</span>
}

/** A section heading inside a tab, with optional figures on the right. */
export function SectionHeading({
  id,
  children,
  aside,
  className,
}: {
  id?: string
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 border-b border-rule-strong pb-2', className)}>
      <h3 id={id} className="text-lead font-semibold [font-stretch:88%]">
        {children}
      </h3>
      {aside && <div className="num text-detail text-ink-3">{aside}</div>}
    </div>
  )
}

/** "Game balance" marker: subtle, as DESIGN.md asks. */
export function GameBalance({ className }: { className?: string }) {
  return (
    <abbr title="Game balance: a value set for play, not a measured number" className={cn('text-ink-3 no-underline', className)}>
      game balance
    </abbr>
  )
}
