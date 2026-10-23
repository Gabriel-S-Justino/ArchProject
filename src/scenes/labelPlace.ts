// Where a DOM label goes beside its projected 3D anchor, kept inside the view (pure).

const GAP = 9
const EDGE = 4

/**
 * Top-left corner (px) of a w × h label beside an anchor at (x, y) in a W × H view. A label that
 * would cross the right or left edge flips to the other side of its anchor, and is then kept inside.
 */
export function placeLabel(side: 'left' | 'right' | 'below', x: number, y: number, w: number, h: number, W: number, H: number): [number, number] {
  let left = side === 'left' ? x - GAP - w : side === 'below' ? x - w / 2 : x + GAP
  let top = side === 'left' ? y + GAP : side === 'below' ? y + 12 : y - GAP - h
  if (side === 'right' && left + w > W - EDGE) left = x - GAP - w
  if (side === 'left' && left < EDGE) left = x + GAP
  left = Math.min(Math.max(left, EDGE), Math.max(EDGE, W - w - EDGE))
  top = Math.min(Math.max(top, EDGE), Math.max(EDGE, H - h - EDGE))
  return [left, top]
}
