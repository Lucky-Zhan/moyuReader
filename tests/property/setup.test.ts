import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

describe('Property testing framework setup', () => {
  it('should run fast-check correctly', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a)
      })
    )
  })
})
