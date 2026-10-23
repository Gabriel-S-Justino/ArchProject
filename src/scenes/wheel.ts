// Wheel and pinch input for the 3D views (pure): wheel deltas in pixels whatever the device
// reports, the zoom factor a Ctrl/Cmd + wheel step asks for, and the factor of a two-finger pinch.

/** WheelEvent.deltaMode values. */
const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2
/** Pixels per line for line-mode wheels (Firefox with a mouse wheel). */
export const WHEEL_LINE_PX = 16

/** A wheel delta in pixels: line and page deltas (some mice, Firefox) are converted. */
export function wheelPixels(delta: number, deltaMode: number, pagePx = 800): number {
  if (!Number.isFinite(delta)) return 0
  if (deltaMode === DOM_DELTA_LINE) return delta * WHEEL_LINE_PX
  if (deltaMode === DOM_DELTA_PAGE) return delta * pagePx
  return delta
}

/** Camera distance factor for one Ctrl/Cmd + wheel step: > 1 zooms out, clamped to ×e^±1 per event. */
export function wheelZoomFactor(delta: number, deltaMode: number, pagePx = 800): number {
  return Math.exp(Math.max(-1, Math.min(1, wheelPixels(delta, deltaMode, pagePx) / 400)))
}

/** Camera distance factor for a pinch from `fromPx` to `toPx` apart: fingers apart (larger) zooms in. */
export function pinchFactor(fromPx: number, toPx: number): number {
  if (!(fromPx > 0) || !(toPx > 0)) return 1
  return Math.min(4, Math.max(0.25, fromPx / toPx))
}
