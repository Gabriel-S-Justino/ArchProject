import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { RollingText } from './RollingText'
import { STATUS_RULE, STATUS_TEXT, STATUS_WORD, formatNumber, type Status } from './status'

export interface ReadoutProps {
  /** What the number is, e.g. "Launch C3". Short: it is set in condensed caps. */
  label: string
  /** A number (formatted en-US with `digits`; NaN/Infinity show "–") or preformatted text. */
  value: number | string
  /** Display unit, e.g. "km²/s²". */
  unit?: string
  /** Go / caution / no-go. Omit for a neutral number. */
  status?: Status
  /** One line under the value: the limit, the source, "game balance"… */
  hint?: ReactNode
  /** Decimals when `value` is a number. Default 0. */
  digits?: number
  /** 'lg' for the one number a screen is about; 'md' otherwise. */
  size?: 'md' | 'lg'
  className?: string
}

/**
 * One number, read at a glance: label, value in tabular figures (digits roll in place when they
 * change), unit, optional status word and hint. Purely presentational: pass it derived values.
 */
export function Readout({ label, value, unit, status, hint, digits = 0, size = 'md', className }: ReadoutProps) {
  const text = typeof value === 'number' ? formatNumber(value, digits) : value
  return (
    <div
      className={cn('flex min-w-0 flex-col gap-1 border-t pt-2', status ? STATUS_RULE[status] : 'border-rule-strong', className)}
      role="group"
      aria-label={`${label}: ${text}${unit ? ` ${unit}` : ''}${status ? `, ${STATUS_WORD[status]}` : ''}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-caps truncate text-ink-3">{label}</span>
        {status && <span className={cn('label-caps shrink-0', STATUS_TEXT[status])}>{STATUS_WORD[status]}</span>}
      </div>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <RollingText
          text={text}
          className={cn('num font-medium tracking-[-0.01em] text-ink', size === 'lg' ? 'text-figure' : 'text-title')}
        />
        {unit && text !== '–' && <span className={cn('text-ink-2', size === 'lg' ? 'text-small' : 'text-detail')}>{unit}</span>}
      </div>
      {hint && <div className="num text-detail text-ink-3">{hint}</div>}
    </div>
  )
}
