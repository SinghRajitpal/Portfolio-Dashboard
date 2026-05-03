/**
 * Unit tests for GET /api/cron/refresh-prices route handler.
 *
 * Strategy: call the imported GET function directly (no live server).
 * - `@supabase/supabase-js` createClient is mocked to return an in-memory fake.
 * - `@/lib/data/YahooProvider` is mocked so getEod returns configurable results.
 * - No real Yahoo Finance API calls or Supabase network calls.
 *
 * Per-ticker loop behavior: each tracked instrument on the exchange gets one
 * YahooProvider.getEod() call. The handler best-efforts all tickers — errors
 * from individual tickers go to skipped[], not a 5xx.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── In-memory Supabase mock ──────────────────────────────────────────────────

type InstrumentRow = { id: string; ticker: string; exchange: string; first_date: string | null }
type PriceRow = { instrument_id: string; date: string; close: number; adjusted_close: number }

let mockInstruments: InstrumentRow[] = []
let mockPrices: PriceRow[] = []
let mockSupabaseError: string | null = null

const mockSupabase = {
  from: (table: string) => {
    if (table === 'instruments') {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, val: string) => {
            if (mockSupabaseError) return Promise.resolve({ data: null, error: { message: mockSupabaseError } })
            const rows = mockInstruments.filter(r => r.exchange === val)
            return Promise.resolve({ data: rows, error: null })
          },
        }),
        update: (_data: unknown) => ({
          eq: (_col: string, _val: string) => Promise.resolve({ error: null }),
        }),
      }
    }
    if (table === 'prices') {
      return {
        upsert: (rows: PriceRow[], _opts: unknown) => {
          for (const row of rows) {
            const idx = mockPrices.findIndex(
              p => p.instrument_id === row.instrument_id && p.date === row.date,
            )
            if (idx >= 0) mockPrices[idx] = row
            else mockPrices.push(row)
          }
          return Promise.resolve({ error: null })
        },
      }
    }
    throw new Error(`mockSupabase: unexpected table "${table}"`)
  },
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}))

// ── YahooProvider mock ───────────────────────────────────────────────────────

// A single row fixture — returned by default for any getEod call
const PRICE_ROW = {
  date: '2026-05-01',
  open: 580,
  high: 585,
  low: 578,
  close: 583,
  adjusted_close: 583,
  volume: 1000000,
}

// Configurable per-ticker result map: ticker -> result
// If null, returns PRICE_ROW by default
let getEodResultMap: Map<string, unknown> | null = null

vi.mock('@/lib/data/YahooProvider', () => ({
  YahooProvider: class {
    async getEod(ticker: string, _opts?: { from?: string; to?: string }) {
      if (getEodResultMap && getEodResultMap.has(ticker)) {
        return getEodResultMap.get(ticker)
      }
      return [PRICE_ROW]
    }
  },
}))

// Import GET AFTER vi.mock is set up
const { GET } = await import('./route')

// ── Request factory ──────────────────────────────────────────────────────────

function makeRequest(opts: {
  authorization?: string
  exchange?: string
}): Request {
  const url = opts.exchange
    ? `http://localhost/api/cron/refresh-prices?exchange=${opts.exchange}`
    : 'http://localhost/api/cron/refresh-prices'
  const headers: Record<string, string> = {}
  if (opts.authorization !== undefined) headers['authorization'] = opts.authorization
  return new Request(url, { method: 'GET', headers })
}

// ── Tests ────────────────────────────────────────────────────────────────────

const CRON_SECRET = 'test-secret-abc123'
const VALID_AUTH = `Bearer ${CRON_SECRET}`

describe('GET /api/cron/refresh-prices', () => {
  beforeEach(() => {
    mockInstruments = []
    mockPrices = []
    mockSupabaseError = null
    getEodResultMap = null

    // Set required env vars
    process.env.CRON_SECRET = CRON_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('Test 1: returns 401 when no Authorization header is provided', async () => {
    const req = makeRequest({})
    const res = await GET(req as never)
    expect(res.status).toBe(401)
    const text = await res.text()
    expect(text).toMatch(/unauthorized/i)
  })

  it('Test 2: returns 401 when wrong Bearer token is provided', async () => {
    const req = makeRequest({ authorization: 'Bearer wrong-secret', exchange: 'US' })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('Test 3: returns 400 when no exchange param is provided', async () => {
    const req = makeRequest({ authorization: VALID_AUTH })
    const res = await GET(req as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.kind).toBe('invalid_input')
  })

  it('Test 4: returns 400 when exchange param is not US, SW, or LSE (e.g. ZZ)', async () => {
    const req = makeRequest({ authorization: VALID_AUTH, exchange: 'ZZ' })
    const res = await GET(req as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.kind).toBe('invalid_input')
  })

  it('Test 5: returns 200 for exchange=US with per-ticker YahooProvider.getEod loop', async () => {
    mockInstruments = [
      { id: 'inst-spy-uuid', ticker: 'SPY.US', exchange: 'US', first_date: null },
    ]

    const req = makeRequest({ authorization: VALID_AUTH, exchange: 'US' })
    const res = await GET(req as never)
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.exchange).toBe('US')
    expect(json.tracked).toBe(1)
    expect(json.upserted).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(json.skipped)).toBe(true)
    expect(json.skipped.length).toBe(0)

    // Verify DB write
    expect(mockPrices.length).toBeGreaterThanOrEqual(1)
    expect(mockPrices.some(p => p.instrument_id === 'inst-spy-uuid')).toBe(true)
  })

  it('Test 6: returns 200 for exchange=LSE (LSE is now a valid exchange)', async () => {
    mockInstruments = [
      { id: 'inst-vwrl-uuid', ticker: 'VWRL.LSE', exchange: 'LSE', first_date: null },
    ]

    const req = makeRequest({ authorization: VALID_AUTH, exchange: 'LSE' })
    const res = await GET(req as never)
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.exchange).toBe('LSE')
    expect(json.tracked).toBe(1)
    expect(json.upserted).toBeGreaterThanOrEqual(1)
  })

  it('Test 7: per-ticker loop — 2 tracked tickers, getEod returns 1 row each → upserted=2', async () => {
    mockInstruments = [
      { id: 'inst-spy-uuid', ticker: 'SPY.US', exchange: 'US', first_date: null },
      { id: 'inst-agg-uuid', ticker: 'AGG.US', exchange: 'US', first_date: null },
    ]

    const req = makeRequest({ authorization: VALID_AUTH, exchange: 'US' })
    const res = await GET(req as never)
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.tracked).toBe(2)
    expect(json.upserted).toBe(2)
    expect(json.skipped).toEqual([])

    // Both instruments should have a price row
    expect(mockPrices.some(p => p.instrument_id === 'inst-spy-uuid')).toBe(true)
    expect(mockPrices.some(p => p.instrument_id === 'inst-agg-uuid')).toBe(true)
  })

  it('Test 8: ticker with getEod error goes to skipped[], request still returns 200', async () => {
    mockInstruments = [
      { id: 'inst-spy-uuid', ticker: 'SPY.US', exchange: 'US', first_date: null },
      { id: 'inst-err-uuid', ticker: 'ERR.US', exchange: 'US', first_date: null },
    ]

    // SPY succeeds, ERR.US returns not_found
    getEodResultMap = new Map([
      ['ERR.US', { kind: 'not_found', message: 'symbol not found' }],
    ])

    const req = makeRequest({ authorization: VALID_AUTH, exchange: 'US' })
    const res = await GET(req as never)
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.tracked).toBe(2)
    // SPY upserted, ERR.US skipped
    expect(json.upserted).toBe(1)
    expect(json.skipped.length).toBe(1)
    expect(json.skipped[0]).toContain('ERR.US')
  })
})
