import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { useClickGuard } from '@/lib/clickGuard'
import { cn } from '@/lib/utils'

export interface ActionButtonProps extends ComponentProps<'button'> {
  /** 'primary': the one rust action per screen. 'quiet': secondary, hairline. */
  tone?: 'primary' | 'quiet'
  icon?: ReactNode
  /**
   * Set on a button whose action changes what appears under the pointer (the next turn's button,
   * the burn's outcome): clicks within CLICK_GUARD_MS of mounting or of this value changing are
   * ignored, so a double-click cannot run two turns or skip the result.
   */
  guardKey?: string | number | boolean
}

/** The shell's buttons: square-cornered, one primary per screen, the rest quiet. */
export function ActionButton({ tone = 'primary', icon, className, children, guardKey, onClick, ...props }: ActionButtonProps) {
  const allowed = useClickGuard(guardKey)
  const handle =
    guardKey === undefined
      ? onClick
      : (e: MouseEvent<HTMLButtonElement>) => {
          if (!allowed()) {
            e.preventDefault()
            return
          }
          onClick?.(e)
        }
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center gap-2 px-4 text-small font-semibold whitespace-nowrap transition-[background-color,color,border-color] duration-150 select-none',
        'disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0',
        tone === 'primary'
          ? 'bg-mars text-mars-ink hover:bg-mars-hover active:bg-mars-active disabled:bg-ground-hover disabled:text-ink-3'
          : 'border border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink disabled:text-ink-3 disabled:hover:border-rule-strong',
        className,
      )}
      onClick={handle}
      {...props}
    >
      {children}
      {icon}
    </button>
  )
}
