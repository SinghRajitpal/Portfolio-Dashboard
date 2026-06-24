/**
 * Tests for src/lib/backtest/forward-fill.ts (Plan 05-02).
 * Carries last close across gaps and reports per-instrument fill counts (D-14).
 * See: 05-RESEARCH.md §Validation Architecture; 05-PATTERNS.md §forward-fill.
 */
import { describe, it, expect } from 'vitest'
import { forwardFillSeries } from './forward-fill'

describe('forward-fill (D-14)', () => {
  it('carries last close across a single gap', () => {
    const result = forwardFillSeries({
      grid: ['2020-01-01', '2020-01-02', '2020-01-03'],
      rows: [
        { date: '2020-01-01', value: 100 },
        { date: '2020-01-03', value: 105 },
      ],
    })
    expect(result.values.get('2020-01-01')).toBe(100)
    expect(result.values.get('2020-01-02')).toBe(100)
    expect(result.values.get('2020-01-03')).toBe(105)
    expect(result.fillCount).toBe(1)
    expect(result.firstDate).toBe('2020-01-01')
  })

  it('carries last close across a multi-day gap and increments fillCount per filled day', () => {
    const result = forwardFillSeries({
      grid: ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04', '2020-01-05'],
      rows: [
        { date: '2020-01-01', value: 100 },
        { date: '2020-01-05', value: 110 },
      ],
    })
    expect(result.values.get('2020-01-02')).toBe(100)
    expect(result.values.get('2020-01-03')).toBe(100)
    expect(result.values.get('2020-01-04')).toBe(100)
    expect(result.values.get('2020-01-05')).toBe(110)
    expect(result.fillCount).toBe(3)
  })

  it('does not fill pre-inception dates; firstDate captures the earliest date with real data', () => {
    const result = forwardFillSeries({
      grid: ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04'],
      rows: [{ date: '2020-01-03', value: 100 }],
    })
    expect(result.values.has('2020-01-01')).toBe(false)
    expect(result.values.has('2020-01-02')).toBe(false)
    expect(result.values.get('2020-01-03')).toBe(100)
    expect(result.values.get('2020-01-04')).toBe(100)
    expect(result.fillCount).toBe(1)
    expect(result.firstDate).toBe('2020-01-03')
  })

  it('returns firstDate=null and fillCount=0 when no rows match the grid', () => {
    const result = forwardFillSeries({
      grid: ['2020-01-01', '2020-01-02'],
      rows: [],
    })
    expect(result.values.size).toBe(0)
    expect(result.fillCount).toBe(0)
    expect(result.firstDate).toBeNull()
  })
})
