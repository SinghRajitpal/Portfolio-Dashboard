import { describe, it, expect } from 'vitest'
import { normalizeTo100 } from './normalize-weights'

describe('normalizeTo100 (PORT-03)', () => {
  it('proportionally rescales [50, 50, 50] to [33.33, 33.33, 33.34]', () => {
    const r = normalizeTo100([50, 50, 50])
    expect(r).toEqual([33.33, 33.33, 33.34])
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
  })

  it('preserves [10, 20, 30, 40] (already sums to 100)', () => {
    const r = normalizeTo100([10, 20, 30, 40])
    expect(r).toEqual([10, 20, 30, 40])
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
  })

  it('handles all zeros without division-by-zero', () => {
    const r = normalizeTo100([0, 0, 0])
    expect(r).toEqual([0, 0, 0])
  })

  it('drift correction: [33.33, 33.33, 33.33] (sum 99.99) → result sums to exactly 100.00', () => {
    const r = normalizeTo100([33.33, 33.33, 33.33])
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
    expect(r[r.length - 1]).toBe(33.34)
  })

  it('rounds to 2 decimal places (NUMERIC(5,2) safety)', () => {
    const r = normalizeTo100([1, 1, 1])
    for (const w of r) {
      // ensure no more than 2 decimals
      expect(Math.round(w * 100) / 100).toBeCloseTo(w, 10)
    }
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
  })

  it('preserves [50, 50] (already balanced)', () => {
    const r = normalizeTo100([50, 50])
    expect(r).toEqual([50, 50])
  })

  it('returned array sum is exactly 100.00 (rounded) for arbitrary non-zero input', () => {
    const r = normalizeTo100([7, 11, 13, 17])
    const sum = r.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100) / 100).toBe(100)
  })
})
