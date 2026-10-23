import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ActionButtonProps extends ComponentProps<'button'> {
  /** 'primary': the one rust action per screen. 'quiet': secondary, hairline. */
  tone?: 'primary' | 'quiet'
  icon?: ReactNode
}

/** The shell's buttons: square-cornered, one primary per screen, the rest quiet. */
export function ActionButton({ tone = 'primary', icon, className, children, ...props }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center gap-2 px-4 text-small font-semibold whitespace-nowrap transition-[background-color,color,border-color] duration-150 select-none',
        'disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0',
        tone === 'primary'
          ? 'bg-mars text-mars-ink hover:bg-[oklch(0.77_0.14_52)] active:bg-[oklch(0.67_0.14_52)] disabled:bg-ground-hover disabled:text-ink-3'
          : 'border border-rule-strong text-ink-2 hover:border-ink-3 hover:text-ink disabled:text-ink-3 disabled:hover:border-rule-strong',
        className,
      )}
      {...props}
    >
      {children}
      {icon}
    </button>
  )
}
