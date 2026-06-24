/**
 * Tests for src/lib/backtest/simulate.ts (Plan 05-02).
 *
 * Covers: FX point-in-time (BACK-02), DRIP on vs off (BACK-03), rebalance
 * boundary on Saturday-Jan-1 case (BACK-04), quarterly/none cadence, forward-fill
 * warning, and the no_overlap BacktestError path.
 *
 * Tests assert that `simulate()` emits BacktestWarning entries with kind
 * 'rebalance' on every boundary-and-first-trading-day-on/after. This
 * warning kind is added by Plan 05-02 to the BacktestWarning union for
 * auditability per the plan's must_haves and acceptance_criteria.
 */
import { describe, it, expect } from 'vitest'
import { simulate } from './simulate'
import { isBacktestError } from './errors'
import type {
  BacktestInput,
  PriceRow,
  FxRateRow,
  InstrumentInput,
} from './types'

// ── helpers ──────────────────────────────────────────────────────────────────

function chfInstrument(id: string, ticker: string, weight: number): InstrumentInput {
  return { id, ticker, currency: 'CHF', weight, first_date: '2022-01-03' }
}

function flatPrices(instrumentId: string, dates: string[], price: number): PriceRow[] {
  return dates.map(d => ({
    instrument_id: instrumentId,
    date: d,
    close: price,
    adjusted_close: price,
  }))
}

function noFx(dates: string[], currency = 'USD'): FxRateRow[] {
  return dates.map(d => ({ quote_currency: currency, date: d, rate: 1 }))
}

// Trading-day grid spanning calendar boundaries. Dates are picked so that
// the first trading day on/after each calendar boundary is unambiguous.
const QUARTERLY_GRID = [
  '2022-01-03', // first weekday on/after 2022-01-01 (Saturday)
  '2022-02-01',
  '2022-03-01',
  '2022-04-01', // Friday — boundary day itself
  '2022-05-02',
  '2022-06-01',
  '2022-07-01', // Friday — boundary day itself
  '2022-08-01',
  '2022-09-01',
  '2022-10-03', // first weekday on/after 2022-10-01 (Saturday)
  '2022-11-01',
  '2022-12-01',
  '2022-12-30',
]

describe('simulate — FX point-in-time (BACK-02)', () => {
  it('CHF curve diverges materially from naïve spot-rate calculation', () => {
    const input: BacktestInput = {
      portfolio_id: 'p',
      start: '2022-01-04',
      end: '2022-01-05',
      drip: false,
      rebalance: 'none',
      benchmark_ticker: null,
      investmentAmount: 10000,
      instruments: [
        { id: 'u', ticker: 'AAA.US', currency: 'USD', weight: 100, first_date: '2022-01-04' },
      ],
      prices: [
        { instrument_id: 'u', date: '2022-01-04', close: 100, adjusted_close: 100 },
        { instrument_id: 'u', date: '2022-01-05', close: 101, adjusted_close: 101 },
      ],
      dividends: [],
      fxRates: [
        { quote_currency: 'USD', date: '2022-01-04', rate: 0.95 },
        { quote_currency: 'USD', date: '2022-01-05', rate: 1.05 },
      ],
      snbRates: [{ date_month: '2022-01', rate: 0, source: 'LZ' }],
    }
    const result = simulate(input)
    if (isBacktestError(result)) throw new Error('expected success')

    // Day 1: 10000 CHF allocated → 10000/(100 × 0.95) ≈ 105.263 shares.
    // Day 1 value = shares × 100 × 0.95 = 10000 (sanity).
    // Day 2 value = shares × 101 × 1.05 ≈ 105.263 × 106.05 ≈ 11163.2.
    expect(result.equity[0].value).toBeCloseTo(10000, 6)
    expect(result.equity[1].value).toBeCloseTo(11163.157894, 4)

    // Naïve spot using day-1 FX would give day-2 = shares × 101 × 0.95 ≈ 10100.
    // The actual point-in-time CHF value diverges by > 1000 CHF — material.
    const naive = 105.263157894 * 101 * 0.95
    expect(Math.abs(result.equity[1].value - naive)).toBeGreaterThan(1000)
  })
})

describe('simulate — DRIP on vs off (BACK-03)', () => {
  it('DRIP=true with $1/share dividend produces higher end value than DRIP=false (dividend dropped per D-15 v1)', () => {
    const grid = ['2022-01-04', '2022-01-05', '2022-01-06']
    const baseInput = (drip: boolean): BacktestInput => ({
      portfolio_id: 'p',
      start: '2022-01-04',
      end: '2022-01-06',
      drip,
      rebalance: 'none',
      benchmark_ticker: null,
      investmentAmount: 10000,
      instruments: [
        { id: 'u', ticker: 'AAA.US', currency: 'USD', weight: 100, first_date: '2022-01-04' },
      ],
      prices: [
        { instrument_id: 'u', date: '2022-01-04', close: 100, adjusted_close: 100 },
        { instrument_id: 'u', date: '2022-01-05', close: 100, adjusted_close: 100 },
        { instrument_id: 'u', date: '2022-01-06', close: 100, adjusted_close: 100 },
      ],
      dividends: [
        { instrument_id: 'u', ex_date: '2022-01-05', amount: 1, currency: 'USD' },
      ],
      fxRates: noFx(grid, 'USD'),
      snbRates: [{ date_month: '2022-01', rate: 0, source: 'LZ' }],
    })

    const on = simulate(baseInput(true))
    const off = simulate(baseInput(false))
    if (isBacktestError(on) || isBacktestError(off)) throw new Error('expected success')

    const onEnd = on.equity[on.equity.length - 1].value
    const offEnd = off.equity[off.equity.length - 1].value

    // DRIP off: flat prices + flat FX + dividend dropped → 10000 throughout.
    expect(offEnd).toBeCloseTo(10000, 4)
    // DRIP on: initial 100 shares (10000/100) + $1 dividend reinvested at
    //   $100 = +1 share → 101 shares; day-3 value = 101 × 100 × 1 = 10100.
    expect(onEnd).toBeCloseTo(10100, 4)
    expect(onEnd).toBeGreaterThan(offEnd)
  })
})

describe('simulate — rebalance boundary (BACK-04)', () => {
  it('annual rebalance with Jan 1 = Saturday 2022-01-01 fires on first trading day on/after = 2022-01-03', () => {
    const grid = ['2021-12-29', '2021-12-30', '2021-12-31', '2022-01-03', '2022-01-04']
    const input: BacktestInput = {
      portfolio_id: 'p',
      start: '2021-12-29',
      end: '2022-01-04',
      drip: false,
      rebalance: 'annual',
      benchmark_ticker: null,
      investmentAmount: 10000,
      instruments: [chfInstrument('a', 'AAA.SW', 100)],
      prices: flatPrices('a', grid, 100),
      dividends: [],
      fxRates: [],
      snbRates: [{ date_month: '2021-12', rate: 0, source: 'LZ' }],
    }
    // Override first_date so engine doesn't truncate.
    input.instruments[0].first_date = '2021-12-29'
    const result = simulate(input)
    if (isBacktestError(result)) throw new Error('expected success')

    const rebalanceWarnings = result.warnings.filter(w => w.kind === 'rebalance')
    // Exactly one boundary (Jan 1 2022) lands inside the window.
    expect(rebalanceWarnings).toHaveLength(1)
    expect(rebalanceWarnings[0].message).toContain('2022-01-03')
  })

  it('quarterly cadence fires exactly 4 events in 2022-01-01 → 2022-12-31', () => {
    const input: BacktestInput = {
      portfolio_id: 'p',
      start: '2022-01-01',
      end: '2022-12-31',
      drip: false,
      rebalance: 'quarterly',
      benchmark_ticker: null,
      investmentAmount: 10000,
      instruments: [chfInstrument('a', 'AAA.SW', 100)],
      prices: flatPrices('a', QUARTERLY_GRID, 100),
      dividends: [],
      fxRates: [],
      snbRates: [{ date_month: '2022-01', rate: 0, source: 'LZ' }],
    }
    input.instruments[0].first_date = '2022-01-03'
    const result = simulate(input)
    if (isBacktestError(result)) throw new Error('expected success')

    const rebalanceWarnings = result.warnings.filter(w => w.kind === 'rebalance')
    // Boundaries Jan 1, Apr 1, Jul 1, Oct 1 each map to a grid day → 4 events.
    expect(rebalanceWarnings).toHaveLength(4)
    const dates = rebalanceWarnings.map(w => w.message)
    expect(dates.some(d => d.includes('2022-01-03'))).toBe(true)
    expect(dates.some(d => d.includes('2022-04-01'))).toBe(true)
    expect(dates.some(d => d.includes('2022-07-01'))).toBe(true)
    expect(dates.some(d => d.includes('2022-10-03'))).toBe(true)
  })

  it("rebalance='none' fires zero rebalance events across the same window", () => {
    const input: BacktestInput = {
      portfolio_id: 'p',
      start: '2022-01-01',
      end: '2022-12-31',
      drip: false,
      rebalance: 'none',
      benchmark_ticker: null,
      investmentAmount: 10000,
      instruments: [chfInstrument('a', 'AAA.SW', 100)],
      prices: flatPrices('a', QUARTERLY_GRID, 100),
      dividends: [],
      fxRates: [],
      snbRates: [{ date_month: '2022-01', rate: 0, source: 'LZ' }],
    }
    input.instruments[0].first_date = '2022-01-03'
    const result = simulate(input)
    if (isBacktestError(result)) throw new Error('expected success')

    const rebalanceWarnings = result.warnings.filter(w => w.kind === 'rebalance')
    expect(rebalanceWarnings).toHaveLength(0)
  })
})

describe('simulate — forward-fill warning (D-14)', () => {
  it('per-instrument 3-day gap produces a forward_fill warning with count=3', () => {
    // Grid is the union of price + FX dates. Both instruments share days
    // 2022-01-03 and 2022-01-07 to define the grid endpoints; instrument
    // B has a 3-day gap in the middle (no rows on 2022-01-04/05/06) that
    // gets forward-filled.
    const grid = ['2022-01-03', '2022-01-04', '2022-01-05', '2022-01-06', '2022-01-07']
    const prices: PriceRow[] = [
      // Instrument A trades every day — provides the grid skeleton.
      ...grid.map(d => ({ instrument_id: 'a', date: d, close: 100, adjusted_close: 100 })),
      // Instrument B trades only on day 1 and day 5 — 3-day gap.
      { instrument_id: 'b', date: '2022-01-03', close: 50, adjusted_close: 50 },
      { instrument_id: 'b', date: '2022-01-07', close: 51, adjusted_close: 51 },
    ]
    const input: BacktestInput = {
      portfolio_id: 'p',
      start: '2022-01-03',
      end: '2022-01-07',
      drip: false,
      rebalance: 'none',
      benchmark_ticker: null,
      investmentAmount: 10000,
      instruments: [
        { id: 'a', ticker: 'AAA.SW', currency: 'CHF', weight: 50, first_date: '2022-01-03' },
        { id: 'b', ticker: 'BBB.SW', currency: 'CHF', weight: 50, first_date: '2022-01-03' },
      ],
      prices,
      dividends: [],
      fxRates: [],
      snbRates: [{ date_month: '2022-01', rate: 0, source: 'LZ' }],
    }
    const result = simulate(input)
    if (isBacktestError(result)) throw new Error('expected success')

    const ffWarnings = result.warnings.filter(
      w => w.kind === 'forward_fill' && w.instrument_id === 'b',
    )
    expect(ffWarnings).toHaveLength(1)
    expect(ffWarnings[0].count).toBe(3)
  })
})

describe('simulate — no overlap error (Pitfall 3)', () => {
  it('returns BacktestError with kind=no_overlap when every instrument first_date is after endDate', () => {
    const input: BacktestInput = {
      portfolio_id: 'p',
      start: '2020-01-01',
      end: '2020-12-31',
      drip: false,
      rebalance: 'none',
      benchmark_ticker: null,
      investmentAmount: 10000,
      instruments: [
        { id: 'a', ticker: 'AAA.SW', currency: 'CHF', weight: 50, first_date: '2025-01-01' },
        { id: 'b', ticker: 'BBB.SW', currency: 'CHF', weight: 50, first_date: '2025-01-01' },
      ],
      prices: [],
      dividends: [],
      fxRates: [],
      snbRates: [{ date_month: '2020-01', rate: 0, source: 'LZ' }],
    }
    const result = simulate(input)
    expect(isBacktestError(result)).toBe(true)
    if (isBacktestError(result)) {
      expect(result.kind).toBe('no_overlap')
    }
  })
})
