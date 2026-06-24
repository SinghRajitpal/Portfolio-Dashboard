/**
 * Tests for src/lib/backtest/metrics.ts (Plan 05-02).
 * Total Return, CAGR, MDD (with peak/trough dates), Sharpe (SNB-based), Vol.
 * See: 05-CONTEXT.md D-18/D-19/D-20/D-21; 05-RESEARCH.md §Validation.
 */
import { describe, it, expect } from 'vitest'
import { computeMetrics } from './metrics'
import type { EquityPoint, SnbRateRow } from './types'

const SNB_ZERO: SnbRateRow[] = [{ date_month: '2020-01', rate: 0, source: 'LZ' }]

describe('metrics (BACK-04 / BACK-06)', () => {
  it('Total return formula (end-start)/start', () => {
    const equity: EquityPoint[] = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-12-31', value: 120 },
    ]
    const m = computeMetrics({
      equity,
      snbRates: SNB_ZERO,
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    })
    expect(m.totalReturn).toBeCloseTo(0.2, 6)
  })

  it('CAGR exact-day basis (365.25 days basis) — 5-year doubling ≈ 0.1487', () => {
    // 1827 days ≈ 5 calendar years (5 × 365.25 = 1826.25).
    // Expected: 2^(365.25/1827) - 1 ≈ 0.14868.
    const equity: EquityPoint[] = [
      { date: '2015-01-01', value: 100 },
      { date: '2020-01-02', value: 200 },
    ]
    const m = computeMetrics({
      equity,
      snbRates: [{ date_month: '2015-01', rate: 0, source: 'LZ' }],
      startDate: '2015-01-01',
      endDate: '2020-01-02', // 1827 days
    })
    const days = (new Date('2020-01-02').getTime() - new Date('2015-01-01').getTime()) / 86400000
    const expected = Math.pow(2, 365.25 / days) - 1
    expect(m.cagr).toBeCloseTo(expected, 4)
    expect(m.cagr).toBeCloseTo(0.1487, 3)
  })

  it('MDD sequence [100,120,90,110] returns -0.25 with peak=index1, trough=index2', () => {
    const equity: EquityPoint[] = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-01-02', value: 120 },
      { date: '2020-01-03', value: 90 },
      { date: '2020-01-04', value: 110 },
    ]
    const m = computeMetrics({
      equity,
      snbRates: SNB_ZERO,
      startDate: '2020-01-01',
      endDate: '2020-01-04',
    })
    expect(m.maxDrawdown).toBeCloseTo(-0.25, 6)
    expect(m.mddPeakDate).toBe('2020-01-02')
    expect(m.mddTroughDate).toBe('2020-01-03')
  })

  it('Sharpe with zero excess returns ≈ 0', () => {
    // Equity rises at exactly the SNB daily rate every day → excess = 0 → Sharpe = 0.
    const snbAnnual = 0.01
    const snbDaily = Math.pow(1 + snbAnnual, 1 / 252) - 1
    const equity: EquityPoint[] = []
    let v = 100
    // Build 30 trading days, each compounding at exactly snbDaily.
    for (let i = 0; i < 30; i++) {
      // YYYY-MM-DD, weekdays starting 2020-01-02 — just use sequential dates within Jan.
      const day = String(i + 1).padStart(2, '0')
      equity.push({ date: `2020-01-${day}`, value: v })
      v *= 1 + snbDaily
    }
    const m = computeMetrics({
      equity,
      snbRates: [{ date_month: '2020-01', rate: snbAnnual, source: 'LZ' }],
      startDate: '2020-01-01',
      endDate: '2020-01-30',
    })
    // Excess daily return = snbDaily - snbDaily = 0 → mean = 0, stdev = 0 → guard returns 0.
    expect(m.sharpe).toBe(0)
  })

  it('Sharpe NaN-guard: stdev of excess returns === 0 returns sharpe = 0 (not NaN/Infinity)', () => {
    // Flat equity → all daily returns are 0 → stdev = 0 → guard.
    const equity: EquityPoint[] = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-01-02', value: 100 },
      { date: '2020-01-03', value: 100 },
    ]
    const m = computeMetrics({
      equity,
      snbRates: [{ date_month: '2020-01', rate: 0, source: 'LZ' }],
      startDate: '2020-01-01',
      endDate: '2020-01-03',
    })
    expect(Number.isFinite(m.sharpe)).toBe(true)
    expect(m.sharpe).toBe(0)
  })

  it('Volatility = stdev × sqrt(252)', () => {
    // Hand-build a daily-returns series with known stdev = 0.01.
    // Use returns alternating +0.01 / -0.01 — population stdev = 0.01.
    // Equity sequence: start 100, *1.01 → 101, *0.99 → 99.99, *1.01, *0.99, ...
    // For exactness, use the population-stdev formula in metrics.ts; we
    // construct via the closed form (values come from a multiplicative walk).
    // Population stdev of [+0.01, -0.01, +0.01, -0.01] = 0.01.
    const returns = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.01]
    const equity: EquityPoint[] = [{ date: '2020-01-01', value: 100 }]
    let v = 100
    for (let i = 0; i < returns.length; i++) {
      v *= 1 + returns[i]
      const day = String(i + 2).padStart(2, '0')
      equity.push({ date: `2020-01-${day}`, value: v })
    }
    const m = computeMetrics({
      equity,
      snbRates: [{ date_month: '2020-01', rate: 0, source: 'LZ' }],
      startDate: '2020-01-01',
      endDate: equity[equity.length - 1].date,
    })
    // metrics.ts re-derives returns from the equity series. Floating-point
    // multiplication is associative-enough that the reconstructed returns
    // differ from the input by < 1e-15. Match to 6 places.
    expect(m.vol).toBeCloseTo(0.01 * Math.sqrt(252), 6)
  })
})
