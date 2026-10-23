import { AnimatePresence, motion } from 'motion/react'

/**
 * Text whose characters sit in fixed cells and roll in place when they change, like a split-flap
 * board: unchanged characters stay still, so the eye goes straight to the digit that moved.
 * Cells are keyed from the right, so a number that gains a digit keeps its units aligned.
 * Screen readers get the plain text; under prefers-reduced-motion (MotionConfig "user") the
 * characters swap without moving.
 */
export function RollingText({ text, className }: { text: string; className?: string }) {
  const chars = Array.from(text)
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex">
        {chars.map((ch, i) => (
          <Cell key={chars.length - i} ch={ch} />
        ))}
      </span>
    </span>
  )
}

function Cell({ ch }: { ch: string }) {
  return (
    <span className="relative inline-block overflow-hidden" style={{ height: '1.1em', lineHeight: '1.1em' }}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={ch}
          className="inline-block whitespace-pre"
          initial={{ y: '-105%', opacity: 0.2 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '105%', opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          {ch}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
