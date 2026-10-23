import { describe, expect, it } from 'vitest'
import { slug } from './slug'

describe('slug', () => {
  it('makes ids without spaces or symbols', () => {
    expect(slug('Launch vehicles & LSP')).toBe('launch-vehicles-lsp')
    expect(slug('  Ephemerides (JPL Horizons) ')).toBe('ephemerides-jpl-horizons')
    expect(slug('Δv map')).toBe('v-map')
  })
})
