// Click guard for buttons that change what sits under the pointer: "Run turn 1" becomes "Run turn
// 2" in the same place, "Fire the capture burn" becomes "Begin science operations". The second
// click of a double-click lands on the new button, so it must not count: a guarded button ignores
// clicks for a short time after it appears or after its key changes. Pure timing (tested) plus a
// small hook.
import { useCallback, useLayoutEffect, useRef } from 'react'

/** Clicks this soon after a button (re)arms are ignored, ms. A double-click's second click comes within ~100–300 ms. */
export const CLICK_GUARD_MS = 400

/** Whether a click at `now` counts for a button armed at `armedAt` (same clock, ms). */
export function clickAllowed(armedAt: number, now: number, guardMs = CLICK_GUARD_MS): boolean {
  return !(now - armedAt < guardMs && now >= armedAt)
}

/**
 * Arms on mount and whenever `key` changes; `allowed()` is false for CLICK_GUARD_MS afterwards.
 * Pass the value that identifies the action (the turn number, the arrival state).
 */
export function useClickGuard(key: unknown, guardMs = CLICK_GUARD_MS): () => boolean {
  const armedAt = useRef(-Infinity)
  useLayoutEffect(() => {
    armedAt.current = performance.now()
  }, [key])
  return useCallback(() => clickAllowed(armedAt.current, performance.now(), guardMs), [guardMs])
}
