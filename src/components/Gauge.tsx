import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { STATUS_FILL, STATUS_TEXT, STATUS_WORD, formatNumber, type Status } from './status'

export interface GaugeProps {
  /** Current value, in the same unit as max and threshold. */
  value: number
  /** Right end of the scale (the left end is 0). */
  max: number
  label: string
  /** The limit the value is judged against; drawn as a tick on the scale. */
  threshold?: number
  /**
   * 'ceiling' (default): the value must stay at or below the threshold (mass vs limit, cost vs
   * budget). 'floor': the value must reach it (liftoff TWR vs minimum).
   */
  limit?: 'ceiling' | 'floor'
  unit?: string
  digits?: number
  /** Name of the threshold tick, e.g. "limit", "budget", "minimum". Default "limit". */
  thresholdLabel?: string
  /** Overrides the status computed from value and threshold. */
  status?: Status
  /** false: draw the threshold as a target without judging the value (progress toward a goal). Default true. */
  judge?: boolean
  className?: string
}

/** Within this fraction of the threshold (on the safe side) a gauge shows CAUTION. */
const CAUTION_BAND = 0.05

export function gaugeStatus(value: number, threshold: number | undefined, limit: 'ceiling' | 'floor'): Status | undefined {
  if (threshold === undefined || !Number.isFinite(threshold) || !Number.isFinite(value)) return undefined
  if (limit === 'ceiling') {
    if (value > threshold) return 'bad'
    return value > threshold * (1 - CAUTION_BAND) ? 'warn' : 'ok'
  }
  if (value < threshold) return 'bad'
  return value < threshold * (1 + CAUTION_BAND) ? 'warn' : 'ok'
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

/**
 * A value on a linear 0…max scale with an optional threshold tick, like a nomograph scale in a
 * handbook. Status (and its word) comes from the threshold. Purely presentational.
 */
export function Gauge({
  value,
  max,
  label,
  threshold,
  limit = 'ceiling',
  unit,
  digits = 0,
  thresholdLabel = 'limit',
  status,
  judge = true,
  className,
}: GaugeProps) {
  const s = status ?? (judge ? gaugeStatus(value, threshold, limit) : undefined)
  const scaleMax = Number.isFinite(max) && max > 0 ? max : Math.max(1, Number.isFinite(value) ? value : 1)
  const frac = clamp01(value / scaleMax)
  const tick = threshold !== undefined && Number.isFinite(threshold) ? clamp01(threshold / scaleMax) : null
  const valueText = formatNumber(value, digits)
  const thresholdText = threshold !== undefined ? formatNumber(threshold, digits) : null
  const u = unit ? ` ${unit}` : ''

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-caps truncate text-ink-3">{label}</span>
        <span className="num shrink-0 text-detail text-ink-2">
          <span className="font-medium text-ink">{valueText}</span>
          {u}
          {thresholdText && (
            <span className="text-ink-3">
              {' '}
              / {thresholdLabel} {thresholdText}
            </span>
          )}
          {s && <span className={cn('label-caps ml-2', STATUS_TEXT[s])}>{STATUS_WORD[s]}</span>}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={scaleMax}
        aria-valuenow={Number.isFinite(value) ? value : 0}
        aria-valuetext={`${valueText}${u}${thresholdText ? `, ${thresholdLabel} ${thresholdText}${u}` : ''}${s ? `, ${STATUS_WORD[s]}` : ''}`}
        className="relative h-2.5"
      >
        {/* scale: hairline baseline with a tick every tenth */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-rule-strong" />
        <div
          className="absolute inset-x-0 bottom-0 h-1"
          style={{
            backgroundImage: 'linear-gradient(90deg, var(--rule-strong) 1px, transparent 1px)',
            backgroundSize: '10% 100%',
          }}
        />
        <motion.div
          className={cn('absolute bottom-0 left-0 h-1.5 w-full origin-left', s ? STATUS_FILL[s] : 'bg-ink-2')}
          initial={false}
          animate={{ scaleX: frac }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
        {tick !== null && (
          <div className="absolute -top-0.5 bottom-[-3px] w-px bg-ink" style={{ left: `calc(${tick * 100}% - 0.5px)` }} />
        )}
      </div>
    </div>
  )
}
