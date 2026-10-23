import { describe, expect, it } from 'vitest'
import { placeLabel } from './labelPlace'

describe('placeLabel', () => {
  it('puts a label above right of its anchor', () => {
    expect(placeLabel('right', 100, 100, 60, 16, 400, 300)).toEqual([109, 75])
  })

  it('flips a right label to the left near the right edge, and keeps it inside', () => {
    const [left] = placeLabel('right', 390, 100, 120, 16, 400, 300)
    expect(left).toBe(390 - 9 - 120)
    expect(left + 120).toBeLessThanOrEqual(396)
    // Anchor past the edge: clamped inside.
    const [l2] = placeLabel('right', 460, 100, 120, 16, 400, 300)
    expect(l2 + 120).toBeLessThanOrEqual(396)
  })

  it('flips a left label to the right near the left edge; centres a below label and clamps it', () => {
    expect(placeLabel('left', 20, 50, 80, 16, 400, 300)[0]).toBe(29)
    expect(placeLabel('below', 200, 50, 80, 16, 400, 300)).toEqual([160, 62])
    expect(placeLabel('below', 10, 290, 80, 16, 400, 300)).toEqual([4, 280])
  })
})
