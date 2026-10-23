import { describe, expect, it } from 'vitest'
import * as K from './constants'

describe('constants', () => {
  it('exports the physical constants from Global Constraints verbatim', () => {
    expect(K.G0).toBe(9.80665)
    expect(K.AU).toBe(1.495978707e11)
    expect(K.C).toBe(299792458)
    expect(K.DAY).toBe(86400)
    expect(K.MU_SUN).toBe(1.32712440018e20)
    expect(K.MU_EARTH).toBe(3.986004418e14)
    expect(K.MU_MARS).toBe(4.282837e13)
    expect(K.R_EARTH).toBe(6371e3)
    expect(K.R_MARS).toBe(3389.5e3)
    expect(K.SOI_MARS).toBe(577e6)
  })
})
