/**
 * Unit tests for getPricesForTicker cache-first orchestrator.
 *
 * Strategy: inject stub provider via deps.provider seam — no real network calls.
 * The key regression tested here is that the DEFAULT provider (no deps.provider)
 * is YahooProvider, not EODHDProvider. This is verified by checking that the
 * module does NOT import EODHDProvider in its production path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IMarketDataProvider } from './IMarketDataProvider'
import type { PriceRow, DividendRow, SearchResult } from './types'

// ── Minimal fake Supabase client ─────────────────────────────────────────────

type InstRow = { id: string; first_date: string | null }
let mockInst: InstRow | null = null
let mockPrices: PriceRow[] = []

const fakeSupabase = {
  from: (table: string) => {
    if (table === 'instruments') {
      return {
        // getInstrumentByTicker uses select().eq().maybeSingle()
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: () =>
              Promise.resolve({ data: mockInst, error: null }),
          }),
        }),
        // upsertInstrumentMetadata uses upsert().select('id').single()
        upsert: (_data: unknown, _opts: unknown) => ({
          select: (_cols: string) => ({
            single: () =>
              Promise.resolve({ data: { id: 'new-inst-id' }, error: null }),
          }),
        }),
        // updateFirst/lastDate uses update().eq()
        update: (_data: unknown) => ({
          eq: (_col: string, _val: string) =>
            Promise.resolve({ error: null }),
        }),
      }
    }
    if (table === 'prices') {
      return {
        // getCachedPrices uses select().eq()
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) =>
            Promise.resolve({ data: mockPrices, error: null }),
        }),
        // upsertPrices uses upsert()
        upsert: (_data: unknown, _opts: unknown) =>
          Promise.resolve({ error: null }),
      }
    }
    if (table === 'dividends') {
      return {
        upsert: (_data: unknown, _opts: unknown) =>
          Promise.resolve({ error: null }),
      }
    }
    throw new Error(`fakeSupabase: unexpected table "${table}"`)
  },
} as unknown as SupabaseClient

// ── Minimal stub provider ─────────────────────────────────────────────────────

const SPY_ROW: PriceRow = {
  date: '2026-01-02',
  open: 580,
  high: 585,
  low: 578,
  close: 583,
  adjusted_close: 583,
  volume: 1000000,
}

const stubProvider: IMarketDataProvider = {
  getEod: vi.fn().mockResolvedValue([SPY_ROW]),
  getDividends: vi.fn().mockResolvedValue([] as DividendRow[]),
  bulkEod: vi.fn().mockResolvedValue([]),
  search: vi.fn().mockResolvedValue([
    {
      ticker: 'SPY',
      exchange: 'US',
      name: 'SPDR S&P 500 ETF Trust',
      type: 'etf',
      currency: 'USD',
      isin: null,
    } satisfies SearchResult,
  ]),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getPricesForTicker', () => {
  beforeEach(() => {
    mockInst = null
    mockPrices = []
    vi.clearAllMocks()
  })

  it('T1: returns invalid_input for a ticker with no dot', async () => {
    const { getPricesForTicker } = await import('./getPrices')
    const result = await getPricesForTicker(fakeSupabase, 'NODOT', {
      provider: stubProvider,
    })
    expect(result).toMatchObject({ kind: 'invalid_input' })
  })

  it('T2: cache miss — fetches from injected stub provider and returns rows', async () => {
    const { getPricesForTicker } = await import('./getPrices')
    const result = await getPricesForTicker(fakeSupabase, 'SPY.US', {
      provider: stubProvider,
      metadata: {
        ticker: 'SPY.US',
        name: 'SPDR S&P 500 ETF Trust',
        type: 'etf',
        currency: 'USD',
        exchange: 'US',
        isin: 'US78462F1030',
        expense_ratio: null,
        dividend_yield: null,
      },
    })
    expect(result).not.toHaveProperty('kind') // not a DataError
    if ('rows' in result) {
      expect(result.cached).toBe(false)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].date).toBe('2026-01-02')
    }
  })

  it('T3: default provider is YahooProvider (module imports YahooProvider, not EODHDProvider)', async () => {
    // Read the source of getPrices.ts and verify YahooProvider import is present
    // and that EODHDProvider is NOT imported as the default
    const fs = await import('node:fs')
    const src = fs.readFileSync(
      new URL('./getPrices.ts', import.meta.url).pathname,
      'utf-8',
    )
    // Must import YahooProvider
    expect(src).toMatch(/import.*YahooProvider.*from.*YahooProvider/)
    // Must NOT use EODHDProvider as the default in production path
    expect(src).not.toMatch(/new EODHDProvider/)
  })
})
