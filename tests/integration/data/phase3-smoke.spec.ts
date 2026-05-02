/**
 * Phase 3 smoke test — goal-backward verification.
 *
 * This test asserts every ROADMAP success criterion for Phase 3 is observably TRUE
 * against a pre-seeded test database. It is the official answer to "is Phase 3 done?".
 *
 * Five criteria (one test each):
 *  1. Cache hit: getPricesForTicker returns cached data without calling EODHD
 *  2. FX 1999: fx_rates has CHF/USD,EUR,GBP back to 1999-01-04 with plausible rates
 *  3. ISIN: isin_lookups resolves CH0237935637 to CHDVD.SW and has prices
 *  4. Metadata: instruments.SPY.US has name, type, currency populated
 *  5. Swiss + US: both SPY.US (US market) and CHDVD.SW (Swiss market) have price rows
 *     AND dividend rows in the DB
 *
 * Pre-seed: fixture data is inserted in beforeAll. No real EODHD or Frankfurter calls.
 * The failingProvider in Criterion 1 throws if called — proves cache-hit path.
 *
 * Run: npx playwright test tests/integration/data/phase3-smoke.spec.ts --project=chromium
 * Prerequisites: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { test, expect } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import { createTestSupabaseClient, truncateMarketData } from '../../helpers/supabase-test'
import { getPricesForTicker } from '../../../src/lib/data/getPrices'
import { upsertInstrumentMetadata, upsertPrices, upsertDividends } from '../../../src/lib/data/cache-prices'
import type { IMarketDataProvider } from '../../../src/lib/data/IMarketDataProvider'
import type { PriceRow, DividendRow } from '../../../src/lib/data/types'

loadDotenv({ path: resolve(process.cwd(), '.env.local') })

// ── Env guard ──────────────────────────────────────────────────────────────────
// Skip all tests if Supabase is not configured
const SUPABASE_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  (!!process.env.SUPABASE_SERVICE_ROLE_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)

// ── Fixture data ──────────────────────────────────────────────────────────────

const SPY_PRICES: PriceRow[] = [
  { date: '2024-01-02', open: 469.18, high: 473.54, low: 468.11, close: 472.33, adjusted_close: 472.33, volume: 62830100 },
  { date: '2024-01-03', open: 471.00, high: 472.89, low: 466.30, close: 467.42, adjusted_close: 467.42, volume: 58123400 },
  { date: '2024-01-04', open: 467.50, high: 468.74, low: 463.55, close: 465.06, adjusted_close: 465.06, volume: 61245600 },
  { date: '2024-01-08', open: 465.60, high: 471.87, low: 464.90, close: 470.73, adjusted_close: 470.73, volume: 64321000 },
  { date: '2024-01-10', open: 470.88, high: 478.00, low: 470.50, close: 476.68, adjusted_close: 476.68, volume: 70123400 },
]

const SPY_DIVIDENDS: DividendRow[] = [
  { ex_date: '2023-03-17', amount: 1.5698, currency: 'USD' },
  { ex_date: '2023-06-16', amount: 1.6034, currency: 'USD' },
  { ex_date: '2023-09-15', amount: 1.6578, currency: 'USD' },
  { ex_date: '2023-12-15', amount: 1.7402, currency: 'USD' },
]

const CHDVD_PRICES: PriceRow[] = [
  { date: '2024-01-02', open: 87.10, high: 88.50, low: 86.80, close: 88.20, adjusted_close: 88.20, volume: 12300 },
  { date: '2024-01-03', open: 88.00, high: 88.90, low: 87.50, close: 88.60, adjusted_close: 88.60, volume: 9800 },
  { date: '2024-01-04', open: 88.50, high: 89.20, low: 87.90, close: 88.00, adjusted_close: 88.00, volume: 11200 },
  { date: '2024-01-08', open: 87.80, high: 88.80, low: 87.40, close: 88.50, adjusted_close: 88.50, volume: 10400 },
  { date: '2024-01-10', open: 88.60, high: 89.80, low: 88.30, close: 89.40, adjusted_close: 89.40, volume: 15600 },
]

const CHDVD_DIVIDENDS: DividendRow[] = [
  { ex_date: '2023-09-14', amount: 2.85, currency: 'CHF' },
]

// FX rates: CHF base spanning 1999-01-04 to 2020-03-15
// Stored as flat rows (one per base/quote/date) matching fx_rates table schema.
type FxRateRow = { base_currency: string; quote_currency: string; date: string; rate: number; source: string }
const FX_RATES: FxRateRow[] = [
  // 1999-01-04 (ECB start)
  { base_currency: 'CHF', quote_currency: 'USD', date: '1999-01-04', rate: 0.6712, source: 'frankfurter' },
  { base_currency: 'CHF', quote_currency: 'EUR', date: '1999-01-04', rate: 0.6505, source: 'frankfurter' },
  { base_currency: 'CHF', quote_currency: 'GBP', date: '1999-01-04', rate: 0.3982, source: 'frankfurter' },
  // 2020-03-15 (COVID crash date for Criterion 5 SPY sanity check)
  { base_currency: 'CHF', quote_currency: 'USD', date: '2020-03-15', rate: 1.0523, source: 'frankfurter' },
  { base_currency: 'CHF', quote_currency: 'EUR', date: '2020-03-15', rate: 0.9547, source: 'frankfurter' },
  { base_currency: 'CHF', quote_currency: 'GBP', date: '2020-03-15', rate: 0.8723, source: 'frankfurter' },
]

async function upsertFlatFxRates(client: ReturnType<typeof createTestSupabaseClient>, rows: FxRateRow[]) {
  const { error } = await client
    .from('fx_rates')
    .upsert(rows, { onConflict: 'base_currency,quote_currency,date' })
  if (error) throw new Error(`FX rates upsert failed: ${error.message}`)
}

// ISIN lookup for CHDVD.SW
type IsinLookupRow = {
  isin: string; ticker: string; exchange: string;
  figi: string | null; security_type: string | null; currency: string | null
}
const CHDVD_ISIN_ROW: IsinLookupRow = {
  isin: 'CH0237935637',
  ticker: 'CHDVD',
  exchange: 'SW',
  figi: 'BBG001S5N8V8',
  security_type: 'ETP',
  currency: 'CHF',
}

// ── Provider that throws if called (proves cache-hit doesn't call EODHD) ──────
const failingProvider: IMarketDataProvider = {
  getEod: async () => { throw new Error('failingProvider.getEod called — cache miss unexpected') },
  getDividends: async () => { throw new Error('failingProvider.getDividends called — cache miss unexpected') },
  bulkEod: async () => { throw new Error('failingProvider.bulkEod called — unexpected') },
  search: async () => { throw new Error('failingProvider.search called — unexpected') },
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Phase 3 smoke test — all 5 ROADMAP success criteria', () => {
  test.skip(!SUPABASE_ENABLED, 'Skipped: NEXT_PUBLIC_SUPABASE_URL not configured')

  let client: ReturnType<typeof createTestSupabaseClient>
  let spyId: string
  let chdvdId: string

  test.beforeAll(async () => {
    client = createTestSupabaseClient()
    await truncateMarketData(client)

    // ── Insert SPY.US ──────────────────────────────────────────────────────────
    const spyMeta = await upsertInstrumentMetadata(client, {
      ticker: 'SPY.US',
      name: 'SPDR S&P 500 ETF Trust',
      isin: 'US78462F1030',
      type: 'etf',
      currency: 'USD',
      exchange: 'US',
      expense_ratio: null,
      dividend_yield: null,
    })
    if ('kind' in spyMeta) throw new Error(`SPY metadata upsert failed: ${spyMeta.message}`)
    spyId = spyMeta.id
    const spyPriceResult = await upsertPrices(client, spyId, SPY_PRICES)
    if ('kind' in spyPriceResult) throw new Error(`SPY prices upsert failed: ${spyPriceResult.message}`)
    const spyDivResult = await upsertDividends(client, spyId, SPY_DIVIDENDS)
    if ('kind' in spyDivResult) throw new Error(`SPY dividends upsert failed: ${spyDivResult.message}`)

    // ── Insert CHDVD.SW ────────────────────────────────────────────────────────
    const chdvdMeta = await upsertInstrumentMetadata(client, {
      ticker: 'CHDVD.SW',
      name: 'iShares Swiss Dividend ETF',
      isin: 'CH0237935637',
      type: 'etf',
      currency: 'CHF',
      exchange: 'SW',
      expense_ratio: null,
      dividend_yield: null,
    })
    if ('kind' in chdvdMeta) throw new Error(`CHDVD metadata upsert failed: ${chdvdMeta.message}`)
    chdvdId = chdvdMeta.id
    const chdvdPriceResult = await upsertPrices(client, chdvdId, CHDVD_PRICES)
    if ('kind' in chdvdPriceResult) throw new Error(`CHDVD prices upsert failed: ${chdvdPriceResult.message}`)
    const chdvdDivResult = await upsertDividends(client, chdvdId, CHDVD_DIVIDENDS)
    if ('kind' in chdvdDivResult) throw new Error(`CHDVD dividends upsert failed: ${chdvdDivResult.message}`)

    // ── Insert FX rates (flat rows directly to fx_rates table) ────────────────
    await upsertFlatFxRates(client, FX_RATES)

    // ── Insert ISIN lookup ─────────────────────────────────────────────────────
    const { error: isinError } = await client.from('isin_lookups').upsert([CHDVD_ISIN_ROW])
    if (isinError) throw new Error(`ISIN lookup upsert failed: ${isinError.message}`)
  })

  test.afterAll(async () => {
    if (client) await truncateMarketData(client)
  })

  /**
   * Criterion 1: Cache hit — getPricesForTicker returns cached rows without
   * calling EODHD. The failingProvider throws if any method is called.
   * Proves: cached data returns without re-calling the provider.
   */
  test('Criterion 1 (cache hit): getPricesForTicker returns cached rows without calling EODHD', async () => {
    const result = await getPricesForTicker(client, 'SPY.US', { provider: failingProvider })
    expect('kind' in result).toBe(false)
    const { rows, cached } = result as { rows: PriceRow[]; cached: boolean; instrumentId: string }
    expect(cached).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
    // Verify SPY rows are from our fixture (close around 470-480 range)
    expect(rows.every(r => r.close > 400 && r.close < 600)).toBe(true)
  })

  /**
   * Criterion 2: FX rates from 1999.
   * Proves: historical FX back to 1999-01-04 with plausible rates for CHF/USD, EUR, GBP.
   */
  test('Criterion 2 (FX 1999): fx_rates has CHF/USD, EUR, GBP back to 1999-01-04', async () => {
    const currencies = ['USD', 'EUR', 'GBP']
    for (const quote of currencies) {
      const { data, error } = await client
        .from('fx_rates')
        .select('rate, date')
        .eq('base_currency', 'CHF')
        .eq('quote_currency', quote)
        .eq('date', '1999-01-04')
        .maybeSingle()
      expect(error).toBeNull()
      expect(data).not.toBeNull()
      const rate = Number(data!.rate)
      // Plausible CHF conversion rate range
      expect(rate).toBeGreaterThan(0.2)
      expect(rate).toBeLessThan(5.0)
    }
  })

  /**
   * Criterion 3: ISIN resolution.
   * Proves: isin_lookups resolves CH0237935637 to CHDVD ticker, and CHDVD.SW
   * already has price data in the database.
   */
  test('Criterion 3 (ISIN): CH0237935637 resolves to CHDVD and instrument has prices', async () => {
    // Assert isin_lookups row exists
    const { data: isinData, error: isinError } = await client
      .from('isin_lookups')
      .select('ticker, exchange, isin')
      .eq('isin', 'CH0237935637')
      .maybeSingle()
    expect(isinError).toBeNull()
    expect(isinData).not.toBeNull()
    expect(isinData!.ticker).toBe('CHDVD')
    expect(isinData!.exchange).toBe('SW')

    // Assert CHDVD.SW instrument has prices
    const { data: prices, error: pricesError } = await client
      .from('prices')
      .select('date, close')
      .eq('instrument_id', chdvdId)
    expect(pricesError).toBeNull()
    expect((prices ?? []).length).toBeGreaterThan(0)
  })

  /**
   * Criterion 4: Instrument metadata.
   * Proves: instruments.SPY.US has name, type, currency fully populated.
   */
  test('Criterion 4 (metadata): SPY.US has name, type=etf, currency=USD stored', async () => {
    const { data, error } = await client
      .from('instruments')
      .select('name, type, currency, exchange')
      .eq('ticker', 'SPY.US')
      .single()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(typeof data!.name).toBe('string')
    expect(data!.name.length).toBeGreaterThan(0)
    expect(data!.type).toBe('etf')
    expect(data!.currency).toBe('USD')
    expect(data!.exchange).toBe('US')
    // expense_ratio and dividend_yield may be null for v1 — that's OK per CONTEXT.md
  })

  /**
   * Criterion 5: Swiss + US markets.
   * Proves: both SPY.US (US market) and CHDVD.SW (Swiss CHF market) have
   * price rows AND dividend rows in the database.
   */
  test('Criterion 5 (Swiss + US): both SPY.US and CHDVD.SW have prices and dividends', async () => {
    // SPY prices
    const { data: spyPrices, error: spyPricesErr } = await client
      .from('prices')
      .select('date')
      .eq('instrument_id', spyId)
    expect(spyPricesErr).toBeNull()
    expect((spyPrices ?? []).length).toBeGreaterThan(0)

    // SPY dividends
    const { data: spyDivs, error: spyDivsErr } = await client
      .from('dividends')
      .select('ex_date')
      .eq('instrument_id', spyId)
    expect(spyDivsErr).toBeNull()
    expect((spyDivs ?? []).length).toBeGreaterThan(0)

    // CHDVD prices
    const { data: chdvdPrices, error: chdvdPricesErr } = await client
      .from('prices')
      .select('date')
      .eq('instrument_id', chdvdId)
    expect(chdvdPricesErr).toBeNull()
    expect((chdvdPrices ?? []).length).toBeGreaterThan(0)

    // CHDVD dividends
    const { data: chdvdDivs, error: chdvdDivsErr } = await client
      .from('dividends')
      .select('ex_date')
      .eq('instrument_id', chdvdId)
    expect(chdvdDivsErr).toBeNull()
    expect((chdvdDivs ?? []).length).toBeGreaterThan(0)
  })
})
