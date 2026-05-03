/**
 * YahooProvider unit tests.
 *
 * Strategy: vi.mock('yahoo-finance2') to inject fixture responses.
 * YahooProvider accepts an optional `client` parameter for test injection.
 *
 * Fixtures: inline (no external fixture files needed for this provider).
 *
 * Note: yahoo-finance2 v3 default export is a class (YahooFinanceWithModules),
 * not a plain object. vi.mock replaces it with a controllable instance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChartResultArray, ChartEventDividend } from 'yahoo-finance2/modules/chart'
import { YahooProvider } from './YahooProvider'
import type { PriceRow, DividendRow } from './types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeChartResult(overrides: Partial<ChartResultArray> = {}): ChartResultArray {
  return {
    meta: {
      currency: 'USD',
      symbol: 'SPY',
      exchangeName: 'PCX',
      instrumentType: 'ETF',
      firstTradeDate: new Date('1993-01-29'),
      regularMarketTime: new Date('2026-05-01'),
      gmtoffset: -18000,
      timezone: 'EST',
      exchangeTimezoneName: 'America/New_York',
      regularMarketPrice: 520.0,
      priceHint: 2,
      currentTradingPeriod: {
        pre: { timezone: 'EST', start: new Date(), end: new Date(), gmtoffset: 0 },
        regular: { timezone: 'EST', start: new Date(), end: new Date(), gmtoffset: 0 },
        post: { timezone: 'EST', start: new Date(), end: new Date(), gmtoffset: 0 },
      },
      dataGranularity: '1d',
      range: '',
      validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'],
    },
    quotes: [
      { date: new Date('2020-01-02'), open: 300.0, high: 305.0, low: 299.0, close: 304.0, volume: 1000000, adjclose: 302.5 },
      { date: new Date('2020-01-03'), open: 304.0, high: 307.0, low: 303.0, close: 306.0, volume: 900000, adjclose: 304.5 },
      { date: new Date('2020-01-06'), open: 306.0, high: 310.0, low: 305.0, close: 309.0, volume: 1100000, adjclose: 307.0 },
      { date: new Date('2020-01-07'), open: 309.0, high: 311.0, low: 308.0, close: 310.0, volume: 800000, adjclose: 308.0 },
      { date: new Date('2020-01-08'), open: 310.0, high: 315.0, low: 309.0, close: 314.0, volume: 1200000, adjclose: 312.0 },
    ],
    ...overrides,
  }
}

function makeDividendChartResult(): ChartResultArray {
  return makeChartResult({
    events: {
      dividends: [
        { amount: 1.57, date: new Date('2020-03-20') },
        { amount: 1.35, date: new Date('2020-06-19') },
        { amount: 1.44, date: new Date('2020-09-18') },
      ] as ChartEventDividend[],
    },
  })
}

// ── Fake client ───────────────────────────────────────────────────────────────

type FakeClient = {
  chart: ReturnType<typeof vi.fn>
  search: ReturnType<typeof vi.fn>
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    chart: vi.fn().mockResolvedValue(makeChartResult()),
    search: vi.fn().mockResolvedValue({
      explains: [],
      count: 2,
      quotes: [
        { symbol: 'SPY', exchange: 'PCX', quoteType: 'ETF', longname: 'SPDR S&P 500 ETF Trust', isYahooFinance: true },
        { symbol: 'AAPL', exchange: 'NMS', quoteType: 'EQUITY', longname: 'Apple Inc.', isYahooFinance: true },
      ],
      news: [],
    }),
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('YahooProvider', () => {
  describe('getEod', () => {
    it('Test 1: returns PriceRow[] with adjusted_close populated for each row', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      const result = await provider.getEod('SPY.US')
      expect(Array.isArray(result)).toBe(true)
      const rows = result as PriceRow[]
      expect(rows.length).toBe(5)
      for (const row of rows) {
        expect(typeof row.adjusted_close).toBe('number')
        expect(row.adjusted_close).not.toBeNull()
        expect(typeof row.close).toBe('number')
        expect(typeof row.date).toBe('string')
        expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    })

    it('Test 2: maps SPY.US to "SPY" Yahoo symbol (strips .US)', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      await provider.getEod('SPY.US')
      expect(client.chart).toHaveBeenCalledWith(
        'SPY',
        expect.objectContaining({ interval: '1d' }),
      )
    })

    it('Test 3: maps VWRL.LSE to "VWRL.L" Yahoo symbol', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      await provider.getEod('VWRL.LSE')
      expect(client.chart).toHaveBeenCalledWith(
        'VWRL.L',
        expect.anything(),
      )
    })

    it('Test 4: converts from="2020-01-01" to epoch seconds in period1', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      await provider.getEod('SPY.US', { from: '2020-01-01' })
      const call = client.chart.mock.calls[0]
      const opts = call[1] as { period1: number }
      // 2020-01-01 epoch = 1577836800
      expect(opts.period1).toBe(1577836800)
    })

    it('Test 5: uses period1=0 when no from is specified (full history)', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      await provider.getEod('SPY.US')
      const call = client.chart.mock.calls[0]
      const opts = call[1] as { period1: number }
      expect(opts.period1).toBe(0)
    })

    it('Test 6: does NOT pass range=max to chart call', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      await provider.getEod('SPY.US')
      const call = client.chart.mock.calls[0]
      const opts = call[1] as Record<string, unknown>
      expect(opts).not.toHaveProperty('range')
    })

    it('Test 7: returns kind="not_found" when Yahoo throws "Symbol not found"', async () => {
      const client = makeClient({
        chart: vi.fn().mockRejectedValue(new Error('Symbol not found: FAKE')),
      })
      const provider = new YahooProvider({ client })
      const result = await provider.getEod('FAKE.US')
      expect(result).toMatchObject({ kind: 'not_found' })
    })

    it('Test 8: returns kind="transient" when Yahoo throws a 5xx error (withRetry exhausts)', async () => {
      let calls = 0
      const client = makeClient({
        chart: vi.fn().mockImplementation(async () => {
          calls++
          throw new Error('500 Internal Server Error')
        }),
      })
      const provider = new YahooProvider({ client, baseDelayMs: 0 })
      const result = await provider.getEod('SPY.US')
      expect(result).toMatchObject({ kind: 'transient' })
      // withRetry with maxAttempts=4 should call exactly 4 times
      expect(calls).toBe(4)
    })

    it('Test 9: returns kind="invalid_input" for symbol without exchange suffix', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      const result = await provider.getEod('NOEXCHANGE')
      expect(result).toMatchObject({ kind: 'invalid_input' })
      expect(client.chart).not.toHaveBeenCalled()
    })
  })

  describe('getDividends', () => {
    it('Test 10: extracts events.dividends and returns DividendRow[] with ISO ex_date', async () => {
      const client = makeClient({
        chart: vi.fn().mockResolvedValue(makeDividendChartResult()),
      })
      const provider = new YahooProvider({ client })
      const result = await provider.getDividends('SPY.US')
      expect(Array.isArray(result)).toBe(true)
      const rows = result as DividendRow[]
      expect(rows.length).toBe(3)
      for (const row of rows) {
        expect(row.ex_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(typeof row.amount).toBe('number')
        expect(row.amount).toBeGreaterThan(0)
        expect(row.currency).toBe('USD')
      }
    })

    it('Test 11: returns empty array when chart has no dividend events', async () => {
      const client = makeClient({
        chart: vi.fn().mockResolvedValue(makeChartResult()),
      })
      const provider = new YahooProvider({ client })
      const result = await provider.getDividends('SPY.US')
      expect(Array.isArray(result)).toBe(true)
      expect((result as DividendRow[]).length).toBe(0)
    })

    it('Test 12: calls chart with events="div" to request dividend data', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      await provider.getDividends('SPY.US')
      expect(client.chart).toHaveBeenCalledWith(
        'SPY',
        expect.objectContaining({ events: 'div' }),
      )
    })
  })

  describe('bulkEod', () => {
    it('Test 13: returns kind="invalid_input" — Yahoo has no bulk endpoint', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      const result = await provider.bulkEod('US', '2026-05-01')
      expect(result).toMatchObject({
        kind: 'invalid_input',
        message: expect.stringContaining('bulkEod'),
      })
    })
  })

  describe('search', () => {
    it('Test 14: returns SearchResult[] with type mapping (ETF→"etf", EQUITY→"stock")', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      const result = await provider.search('SPY')
      expect(Array.isArray(result)).toBe(true)
      const rows = result as Array<{ ticker: string; type: string }>
      expect(rows.length).toBeGreaterThan(0)
      const spy = rows.find(r => r.ticker === 'SPY')
      const aapl = rows.find(r => r.ticker === 'AAPL')
      expect(spy?.type).toBe('etf')
      expect(aapl?.type).toBe('stock')
    })

    it('Test 15: respects opts.limit by passing quotesCount to Yahoo search', async () => {
      const client = makeClient()
      const provider = new YahooProvider({ client })
      await provider.search('Apple', { limit: 5 })
      expect(client.search).toHaveBeenCalledWith(
        'Apple',
        expect.objectContaining({ quotesCount: 5 }),
      )
    })
  })
})
