// Where a DOM label goes beside its projected 3D anchor, kept inside the view and off the view's
// own captions and controls (pure).

const GAP = 9
const EDGE = 4

/** A rectangle in view pixels (top-left corner, size). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Top-left corner (px) of a w × h label beside an anchor at (x, y) in a W × H view. A label that
 * would cross the right or left edge flips to the other side of its anchor, and is then kept inside.
 * A label that would cover one of the `avoid` rectangles (the scale note, the aim inset, the focus
 * buttons) flips to the other side of its anchor vertically, and if that is also taken it is lifted
 * just above what it would cover.
 */
export function placeLabel(
  side: 'left' | 'right' | 'below',
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
  H: number,
  avoid: readonly Rect[] = [],
): [number, number] {
  let left = side === 'left' ? x - GAP - w : side === 'below' ? x - w / 2 : x + GAP
  if (side === 'right' && left + w > W - EDGE) left = x - GAP - w
  if (side === 'left' && left < EDGE) left = x + GAP
  left = Math.min(Math.max(left, EDGE), Math.max(EDGE, W - w - EDGE))
  const clampTop = (t: number) => Math.min(Math.max(t, EDGE), Math.max(EDGE, H - h - EDGE))
  const preferred = clampTop(side === 'left' ? y + GAP : side === 'below' ? y + 12 : y - GAP - h)
  const blocker = (t: number) => avoid.find((r) => hits(r, { x: left, y: t, w, h }))
  if (!blocker(preferred)) return [left, preferred]
  const flipped = clampTop(side === 'below' || side === 'left' ? y - GAP - h : y + GAP)
  if (!blocker(flipped)) return [left, flipped]
  // Both sides taken: just above the first rectangle in the way (or below it, at the top edge).
  const r = blocker(preferred)!
  const above = r.y - h - EDGE
  return [left, above >= EDGE ? above : clampTop(r.y + r.h + EDGE)]
}
