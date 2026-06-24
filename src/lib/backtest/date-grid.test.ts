/**
 * Tests for src/lib/backtest/date-grid.ts (Plan 05-02).
 * Builds the union date grid across portfolio + benchmark + FX calendars (D-13).
 * See: 05-RESEARCH.md §Validation Architecture; 05-PATTERNS.md §date-grid.ts.
 */
import { describe, it, expect } from 'vitest'
import { buildUnionDateGrid } from './date-grid'
import type { PriceRow, FxRateRow } from './types'

describe('date-grid (D-13)', () => {
  it('union of two instrument calendars deduplicates', () => {
    const prices: PriceRow[] = [
      { instrument_id: 'a', date: '2020-01-02', close: 1, adjusted_close: 1 },
      { instrument_id: 'a', date: '2020-01-03', close: 1, adjusted_close: 1 },
      { instrument_id: 'b', date: '2020-01-03', close: 1, adjusted_close: 1 }, // duplicate date
    ]
    const fxRates: FxRateRow[] = [
      { quote_currency: 'USD', date: '2020-01-04', rate: 1 },
    ]
    const grid = buildUnionDateGrid({
      prices,
      fxRates,
      startDate: '2020-01-01',
      endDate: '2020-01-31',
    })
    expect(grid).toEqual(['2020-01-02', '2020-01-03', '2020-01-04'])
  })

  it('excludes dates outside [startDate, endDate] inclusive range', () => {
    const prices: PriceRow[] = [
      { instrument_id: 'a', date: '2019-12-31', close: 1, adjusted_close: 1 },
      { instrument_id: 'a', date: '2020-01-15', close: 1, adjusted_close: 1 },
      { instrument_id: 'a', date: '2020-02-01', close: 1, adjusted_close: 1 },
    ]
    const grid = buildUnionDateGrid({
      prices,
      fxRates: [],
      startDate: '2020-01-01',
      endDate: '2020-01-31',
    })
    expect(grid).toEqual(['2020-01-15'])
  })

  it('empty inputs return empty grid', () => {
    expect(
      buildUnionDateGrid({
        prices: [],
        fxRates: [],
        startDate: '2020-01-01',
        endDate: '2020-12-31',
      }),
    ).toEqual([])
  })

  it('result is sorted lexicographically (== chronologically for ISO)', () => {
    const prices: PriceRow[] = [
      { instrument_id: 'a', date: '2020-03-10', close: 1, adjusted_close: 1 },
      { instrument_id: 'a', date: '2020-01-05', close: 1, adjusted_close: 1 },
      { instrument_id: 'a', date: '2020-02-20', close: 1, adjusted_close: 1 },
    ]
    const grid = buildUnionDateGrid({
      prices,
      fxRates: [],
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    })
    expect(grid).toEqual(['2020-01-05', '2020-02-20', '2020-03-10'])
  })
})
