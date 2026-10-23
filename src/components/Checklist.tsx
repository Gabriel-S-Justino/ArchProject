import { Check, X } from 'lucide-react'
import type { CheckItem } from '@/game/checklist'
import { cn } from '@/lib/utils'

export interface ChecklistProps {
  items: CheckItem[]
  /** Heading of the poll. Default "Launch checklist". */
  title?: string
  /** Heading level for the title (default 2). */
  headingLevel?: 2 | 3
  /**
   * Compact (side rail): every row stays, but only no-go rows print the numbers behind the verdict,
   * so what blocks the launch is what the eye finds.
   */
  compact?: boolean
  /** Makes each row's label a button, e.g. to open the design tab that fixes it. */
  onSelectItem?: (item: CheckItem) => void
  /** Accessible hint for onSelectItem buttons, e.g. (item) => "Open the Rocket tab". */
  selectItemHint?: (item: CheckItem) => string
  className?: string
}

/**
 * The go/no-go poll: every item keeps its row whatever its state (nothing disappears), with the
 * word, an icon and the numbers behind the verdict. Purely presentational: pass useChecklist().
 */
export function Checklist({
  items,
  title = 'Launch checklist',
  headingLevel = 2,
  compact = false,
  onSelectItem,
  selectItemHint,
  className,
}: ChecklistProps) {
  const go = items.filter((i) => i.ok).length
  const allGo = items.length > 0 && go === items.length
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section className={cn('flex flex-col', className)} aria-label={title}>
      <header className="flex items-baseline justify-between gap-4 border-b border-rule-strong pb-2">
        <H className={cn('font-semibold [font-stretch:88%]', compact ? 'text-small' : 'text-lead')}>{title}</H>
        <p className="num text-detail text-ink-2" aria-live="polite">
          <span className={cn('font-semibold', allGo ? 'text-go' : 'text-ink')}>{go}</span> of {items.length} go
          <span className={cn('label-caps ml-3', allGo ? 'text-go' : 'text-caution')}>{allGo ? 'All go' : 'Hold'}</span>
        </p>
      </header>
      <ol className="flex flex-col">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'grid items-baseline gap-x-3 border-b border-rule last:border-b-0',
              compact ? 'grid-cols-[3.75rem_1fr] py-1.5' : 'grid-cols-[4.25rem_1fr] py-2.5',
            )}
          >
            <span
              className={cn(
                'label-caps inline-flex items-center gap-1 justify-self-start',
                item.ok ? 'text-go' : 'text-nogo',
              )}
            >
              {item.ok ? <Check aria-hidden className="size-3.5" strokeWidth={2.5} /> : <X aria-hidden className="size-3.5" strokeWidth={2.5} />}
              {item.ok ? 'Go' : 'No-go'}
            </span>
            <div className="min-w-0">
              {onSelectItem ? (
                <button
                  type="button"
                  onClick={() => onSelectItem(item)}
                  title={selectItemHint?.(item)}
                  className={cn(
                    'text-left font-medium text-ink underline-offset-4 decoration-rule-strong hover:underline',
                    compact ? 'text-detail' : 'text-small',
                  )}
                >
                  {item.label}
                  {selectItemHint && <span className="sr-only">. {selectItemHint(item)}</span>}
                </button>
              ) : (
                <p className={cn('font-medium text-ink', compact ? 'text-detail' : 'text-small')}>{item.label}</p>
              )}
              {(!compact || !item.ok) && <p className="num mt-0.5 text-detail text-ink-2">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
