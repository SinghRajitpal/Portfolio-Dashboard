import { describe, it, expect } from 'vitest'
import { computeMetrics, type InstrumentMeta, type Item } from './compute-metrics'

describe('computeMetrics (PORT-05, PORT-06)', () => {
  it('weighted TER = sum(weight_i/100 × expense_ratio_i)', () => {
    const items: Item[] = [
      { instrument_id: 'a', weight: 60 },
      { instrument_id: 'b', weight: 40 },
    ]
    const meta = new Map<string, InstrumentMeta>([
      ['a', { expense_ratio: 0.0007, dividend_yield: 0.0186 }],
      ['b', { expense_ratio: 0.0003, dividend_yield: 0.0398 }],
    ])
    const r = computeMetrics(items, 10000, meta)
    // 0.60 * 0.0007 + 0.40 * 0.0003 = 0.00042 + 0.00012 = 0.00054
    expect(r.ter).toBeCloseTo(0.00054, 6)
  })

  it('weighted dividend yield = sum(weight_i/100 × dividend_yield_i)', () => {
    const items: Item[] = [
      { instrument_id: 'a', weight: 60 },
      { instrument_id: 'b', weight: 40 },
    ]
    const meta = new Map<string, InstrumentMeta>([
      ['a', { expense_ratio: 0.0007, dividend_yield: 0.0186 }],
      ['b', { expense_ratio: 0.0003, dividend_yield: 0.0398 }],
    ])
    const r = computeMetrics(items, 10000, meta)
    // 0.60 * 0.0186 + 0.40 * 0.0398 = 0.01116 + 0.01592 = 0.02708
    expect(r.yield).toBeCloseTo(0.02708, 5)
  })

  it('annualIncome = investment_amount × yield', () => {
    const items: Item[] = [
      { instrument_id: 'a', weight: 60 },
      { instrument_id: 'b', weight: 40 },
    ]
    const meta = new Map<string, InstrumentMeta>([
      ['a', { expense_ratio: 0.0007, dividend_yield: 0.0186 }],
      ['b', { expense_ratio: 0.0003, dividend_yield: 0.0398 }],
    ])
    const r = computeMetrics(items, 10000, meta)
    expect(r.annualIncome).toBeCloseTo(270.8, 1)
  })

  it('null expense_ratio treated as 0 and tracked in terMissingIds', () => {
    const items: Item[] = [
      { instrument_id: 'a', weight: 60 },
      { instrument_id: 'b', weight: 40 },
    ]
    const meta = new Map<string, InstrumentMeta>([
      ['a', { expense_ratio: null, dividend_yield: 0.02 }],
      ['b', { expense_ratio: 0.0005, dividend_yield: 0.03 }],
    ])
    const r = computeMetrics(items, 10000, meta)
    expect(r.terMissingIds).toEqual(['a'])
    expect(r.terMissingCount).toBe(1)
    // ter contribution from 'a' is zero; only 'b' counts: 0.40 * 0.0005 = 0.0002
    expect(r.ter).toBeCloseTo(0.0002, 6)
  })

  it('null dividend_yield treated as 0 and tracked in yieldMissingIds', () => {
    const items: Item[] = [
      { instrument_id: 'a', weight: 60 },
      { instrument_id: 'b', weight: 40 },
    ]
    const meta = new Map<string, InstrumentMeta>([
      ['a', { expense_ratio: 0.0007, dividend_yield: null }],
      ['b', { expense_ratio: 0.0003, dividend_yield: 0.04 }],
    ])
    const r = computeMetrics(items, 10000, meta)
    expect(r.yieldMissingIds).toEqual(['a'])
    expect(r.yieldMissingCount).toBe(1)
    // yield contribution from 'a' is zero; only 'b' counts: 0.40 * 0.04 = 0.016
    expect(r.yield).toBeCloseTo(0.016, 6)
    expect(r.annualIncome).toBeCloseTo(160, 4)
  })

  it('returns zero metrics for empty items', () => {
    const r = computeMetrics([], 10000, new Map())
    expect(r.ter).toBe(0)
    expect(r.yield).toBe(0)
    expect(r.annualIncome).toBe(0)
    expect(r.terMissingIds).toEqual([])
    expect(r.yieldMissingIds).toEqual([])
    expect(r.terMissingCount).toBe(0)
    expect(r.yieldMissingCount).toBe(0)
  })

  it('skips items whose instrument_id is unknown to caller (no meta entry)', () => {
    const items: Item[] = [
      { instrument_id: 'a', weight: 60 },
      { instrument_id: 'unknown', weight: 40 },
    ]
    const meta = new Map<string, InstrumentMeta>([
      ['a', { expense_ratio: 0.001, dividend_yield: 0.02 }],
    ])
    const r = computeMetrics(items, 10000, meta)
    // unknown is silently skipped — not counted in either missing list
    expect(r.terMissingIds).toEqual([])
    expect(r.yieldMissingIds).toEqual([])
    expect(r.ter).toBeCloseTo(0.6 * 0.001, 6)
    expect(r.yield).toBeCloseTo(0.6 * 0.02, 6)
  })

  it('does not double-multiply: weight=60 × expense_ratio=0.0007 = 0.00042 contribution', () => {
    const items: Item[] = [{ instrument_id: 'a', weight: 60 }]
    const meta = new Map<string, InstrumentMeta>([
      ['a', { expense_ratio: 0.0007, dividend_yield: 0 }],
    ])
    const r = computeMetrics(items, 10000, meta)
    expect(r.ter).toBeCloseTo(0.6 * 0.0007, 6)
  })
})
