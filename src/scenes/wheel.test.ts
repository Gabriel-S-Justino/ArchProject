import { describe, expect, it } from 'vitest'
import { WHEEL_LINE_PX, pinchFactor, wheelPixels, wheelZoomFactor } from './wheel'

describe('wheel input', () => {
  it('converts line and page deltas to pixels', () => {
    expect(wheelPixels(100, 0)).toBe(100)
    expect(wheelPixels(3, 1)).toBe(3 * WHEEL_LINE_PX)
    expect(wheelPixels(1, 2, 700)).toBe(700)
    expect(wheelPixels(Number.NaN, 0)).toBe(0)
  })

  it('zooms the same for a pixel wheel and a line wheel of the same travel', () => {
    expect(wheelZoomFactor(48, 0)).toBeCloseTo(wheelZoomFactor(3, 1))
    expect(wheelZoomFactor(100, 0)).toBeGreaterThan(1) // scroll down: farther
    expect(wheelZoomFactor(-100, 0)).toBeLessThan(1)
    expect(wheelZoomFactor(1, 2)).toBeCloseTo(Math.E) // one page is clamped to one e-fold
  })

  it('pinch: spreading the fingers zooms in, pinching zooms out, nonsense is ignored', () => {
    expect(pinchFactor(100, 200)).toBeCloseTo(0.5)
    expect(pinchFactor(200, 100)).toBeCloseTo(2)
    expect(pinchFactor(0, 100)).toBe(1)
    expect(pinchFactor(1, 1000)).toBe(0.25)
  })
})
