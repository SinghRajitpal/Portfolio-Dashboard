/**
 * Integration tests for the EODHD cache-first flow.
 *
 * These tests prove DATA-01 (cache-first), DATA-03 (SPY.US + CHDVD.SW), and
 * DATA-04 (instrument metadata persistence).
 *
 * Strategy: inject a fake IMarketDataProvider (no real EODHD API calls) so the
 * test budget is never consumed. Real Supabase is used for all DB operations.
 *
 * Run: npx playwright test tests/integration/data/eodhd-cache-flow.spec.ts --project=chromium
 *
 * Prerequisites: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { test, expect } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import * as fs from 'node:fs'
import { createTestSupabaseClient, truncateMarketData } from '../../helpers/supabase-test'
import { getPricesForTicker } from '../../../src/lib/data/getPrices'
import type { IMarketDataProvider } from '../../../src/lib/data/IMarketDataProvider'
import type { PriceRow, DividendRow } from '../../../src/lib/data/types'

loadDotenv({ path: resolve(process.cwd(), '.env.local') })

// ── Fixture helpers ────────────────────────────────────────────────────────

function loadEodFixture(filename: string): PriceRow[] {
  const raw = JSON.parse(
    fs.readFileSync(resolve(process.cwd(), 'tests/fixtures/eodhd', filename), 'utf-8'),
  ) as Array<{
    date: string; open: number; high: number; low: number;
    close: number; adjusted_close: number; volume: number
  }>
  return raw.map(r => ({
    date: r.date,
    open: r.open ?? null,
    high: r.high ?? null,
    low: r.low ?? null,
    close: r.close,
    adjusted_close: r.adjusted_close,
    volume: r.volume ?? null,
  }))
}

function loadDividendFixture(filename: string): DividendRow[] {
  const raw = JSON.parse(
    fs.readFileSync(resolve(process.cwd(), 'tests/fixtures/eodhd', filename), 'utf-8'),
  ) as Array<{ date: string; value: number; currency: string }>
  return raw.map(r => ({ ex_date: r.date, amount: r.value, currency: r.currency }))
}

// ── Fake provider factory ──────────────────────────────────────────────────

interface FakeProvider extends IMarketDataProvider {
  calls: { getEod: number; getDividends: number }
}

function makeSPYProvider(overrides: Partial<IMarketDataProvider> = {}): FakeProvider {
  const calls = { getEod: 0, getDividends: 0 }
  const spyPrices = loadEodFixture('spy-eod.json')
  const spyDivs = loadDividendFixture('spy-dividends.json')
  return {
    calls,
    async getEod(_symbol) { calls.getEod++; return spyPrices },
    async getDividends(_symbol) { calls.getDividends++; return spyDivs },
    async bulkEod() { return [] },
    async search(_q) {
      return [{
        ticker: 'SPY', exchange: 'US', name: 'SPDR S&P 500 ETF Trust',
        type: 'etf', currency: 'USD', isin: 'US78462F1030',
      }]
    },
    ...overrides,
  } as FakeProvider
}

function makeCHDVDProvider(overrides: Partial<IMarketDataProvider> = {}): FakeProvider {
  const calls = { getEod: 0, getDividends: 0 }
  const prices = loadEodFixture('chdvd-eod.json')
  const divs = loadDividendFixture('chdvd-dividends.json')
  return {
    calls,
    async getEod(_symbol) { calls.getEod++; return prices },
    async getDividends(_symbol) { calls.getDividends++; return divs },
    async bulkEod() { return [] },
    async search(_q) {
      return [{
        ticker: 'CHDVD', exchange: 'SW', name: 'iShares Swiss Dividend ETF',
        type: 'etf', currency: 'CHF', isin: 'IE00B9CQXS71',
      }]
    },
    ...overrides,
  } as FakeProvider
}

// ── Test suite ────────────────────────────────────────────────────────────

test.describe('EODHD cache-first flow', () => {
  let client: ReturnType<typeof createTestSupabaseClient>

  test.beforeAll(() => {
    client = createTestSupabaseClient()
  })

  test.beforeEach(async () => {
    await truncateMarketData(client)
  })

  test('Test 1 (cold fetch): first call hits provider, returns rows with non-null adjusted_close', async () => {
    const fakeProvider = makeSPYProvider()
    const result = await getPricesForTicker(client, 'SPY.US', { provider: fakeProvider })

    expect('kind' in result).toBe(false)   // not a DataError
    const r = result as { rows: PriceRow[]; cached: boolean }
    expect(r.cached).toBe(false)
    expect(r.rows.length).toBeGreaterThan(0)
    for (const row of r.rows) {
      expect(row.adjusted_close).not.toBeNull()
    }
    expect(fakeProvider.calls.getEod).toBe(1)
    expect(fakeProvider.calls.getDividends).toBe(1)
  })

  test('Test 2 (cache hit / DATA-01): second call returns from cache without calling provider', async () => {
    const fakeProvider = makeSPYProvider()

    // Cold fetch
    const first = await getPricesForTicker(client, 'SPY.US', { provider: fakeProvider })
    expect('kind' in first).toBe(false)
    const firstR = first as { rows: PriceRow[]; cached: boolean }
    expect(firstR.cached).toBe(false)

    // Second call — should hit cache
    const second = await getPricesForTicker(client, 'SPY.US', { provider: fakeProvider })
    expect('kind' in second).toBe(false)
    const secondR = second as { rows: PriceRow[]; cached: boolean }
    expect(secondR.cached).toBe(true)
    expect(secondR.rows.length).toBe(firstR.rows.length)

    // Provider should only have been called once total — proves DATA-01
    expect(fakeProvider.calls.getEod).toBe(1)
    expect(fakeProvider.calls.getDividends).toBe(1)
  })

  test('Test 3 (Swiss ETF / DATA-03): CHDVD.SW cold + warm with CHF currency', async () => {
    const fakeProvider = makeCHDVDProvider()

    // Cold fetch
    const first = await getPricesForTicker(client, 'CHDVD.SW', { provider: fakeProvider })
    expect('kind' in first).toBe(false)
    const firstR = first as { rows: PriceRow[]; cached: boolean }
    expect(firstR.cached).toBe(false)
    expect(firstR.rows.length).toBeGreaterThan(0)

    // Verify CHF currency on the persisted instrument
    const { data: inst } = await client
      .from('instruments')
      .select('currency')
      .eq('ticker', 'CHDVD.SW')
      .single()
    expect(inst?.currency).toBe('CHF')

    // Second call — cache hit
    const second = await getPricesForTicker(client, 'CHDVD.SW', { provider: fakeProvider })
    expect('kind' in second).toBe(false)
    const secondR = second as { rows: PriceRow[]; cached: boolean }
    expect(secondR.cached).toBe(true)
  })

  test('Test 4 (first_date/last_date set after cold fetch)', async () => {
    const fakeProvider = makeSPYProvider()
    const spyPrices = loadEodFixture('spy-eod.json')
    const expectedFirst = [...spyPrices].sort((a, b) => a.date.localeCompare(b.date))[0].date
    const expectedLast = [...spyPrices].sort((a, b) => b.date.localeCompare(a.date))[0].date

    await getPricesForTicker(client, 'SPY.US', { provider: fakeProvider })

    const { data: inst } = await client
      .from('instruments')
      .select('first_date, last_date')
      .eq('ticker', 'SPY.US')
      .single()

    // Supabase returns dates as ISO strings (YYYY-MM-DD)
    expect(inst?.first_date).toBe(expectedFirst)
    expect(inst?.last_date).toBe(expectedLast)
  })

  test('Test 5 (rate_limit propagation): rate_limit error from provider is surfaced', async () => {
    const rateLimitProvider = makeSPYProvider({
      getEod: async () => ({ kind: 'rate_limit', message: 'EODHD 429 demo' }),
    })
    const result = await getPricesForTicker(client, 'SPY.US', { provider: rateLimitProvider })
    expect(result).toMatchObject({ kind: 'rate_limit' })
  })

  test('Test 6 (metadata persistence / DATA-04): name, type, currency, data_source populated', async () => {
    const fakeProvider = makeSPYProvider()
    await getPricesForTicker(client, 'SPY.US', { provider: fakeProvider })

    const { data: inst } = await client
      .from('instruments')
      .select('name, type, currency, data_source')
      .eq('ticker', 'SPY.US')
      .single()

    expect(inst?.name).toBe('SPDR S&P 500 ETF Trust')
    expect(inst?.type).toBe('etf')
    expect(inst?.currency).toBe('USD')
    expect(inst?.data_source).toBe('eodhd')
  })
})
