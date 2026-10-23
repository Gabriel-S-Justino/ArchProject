import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'

/** Duration of one roll, ms. */
export const ROLL_MS = 320

/**
 * Whether a change arriving at `now` should roll (true) or swap in place (false): a value that
 * changes again before the previous roll has finished (time warp, a running clock) would only
 * smear, so it swaps instantly until it settles.
 */
export function shouldRoll(lastChangeAt: number, now: number, rollMs = ROLL_MS): boolean {
  return !(now - lastChangeAt < rollMs && now >= lastChangeAt)
}

/**
 * Text whose characters sit in fixed cells and roll in place when they change, like a split-flap
 * board: unchanged characters stay still, so the eye goes straight to the digit that moved.
 * Cells are keyed from the right, so a number that gains a digit keeps its units aligned.
 * Updates faster than a roll (time warp) swap without moving. Screen readers get the plain text;
 * under prefers-reduced-motion (MotionConfig "user") the characters swap without moving.
 */
export function RollingText({ text, className }: { text: string; className?: string }) {
  const last = useRef({ text, at: -Infinity, roll: true })
  if (last.current.text !== text) {
    const now = typeof performance === 'undefined' ? Date.now() : performance.now()
    last.current = { text, at: now, roll: shouldRoll(last.current.at, now) }
  }
  const roll = last.current.roll
  const chars = Array.from(text)
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex">
        {chars.map((ch, i) => (
          <Cell key={chars.length - i} ch={ch} roll={roll} />
        ))}
      </span>
    </span>
  )
}

function Cell({ ch, roll }: { ch: string; roll: boolean }) {
  return (
    <span className="relative inline-block overflow-hidden" style={{ height: '1.1em', lineHeight: '1.1em' }}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          // While values arrive faster than a roll the key stays put, so the character swaps in place.
          key={roll ? `c${ch}` : 'swap'}
          className="inline-block whitespace-pre"
          initial={{ y: '-105%', opacity: 0.2 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '105%', opacity: 0 }}
          transition={{ duration: ROLL_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
        >
          {ch}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
