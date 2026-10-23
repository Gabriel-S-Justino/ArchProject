// A confirmation for an action that throws work away (restarting a flight). Radix AlertDialog:
// focus moves into the dialog and back to the trigger, Escape and Cancel close it. Plate styling:
// a raised sheet with a hairline frame and a 2px rust rule on top (the player's decision), square
// corners, no shadow; the backdrop dims the page with flat ground tone, not blur.
import { AlertDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { ActionButton } from './ActionButton'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  /** Label of the button that goes ahead. */
  confirm: string
  /** Label of the button that keeps things as they are. Default "Cancel". */
  cancel?: string
  onConfirm: () => void
}

export function ConfirmDialog({ open, onOpenChange, title, children, confirm, cancel = 'Cancel', onConfirm }: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ground-sunken/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-rule-strong border-t-2 border-t-mars bg-ground-raised px-6 pt-5 pb-6 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          <AlertDialog.Title className="text-title font-semibold [font-stretch:88%]">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-small text-ink-2">{children}</div>
          </AlertDialog.Description>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AlertDialog.Action asChild>
              <ActionButton onClick={onConfirm}>{confirm}</ActionButton>
            </AlertDialog.Action>
            <AlertDialog.Cancel asChild>
              <ActionButton tone="quiet">{cancel}</ActionButton>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
