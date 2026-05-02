/**
 * Unit tests for GET /api/cron/refresh-prices route handler.
 *
 * Strategy: call the imported GET function directly (no live server).
 * - `@supabase/supabase-js` createClient is mocked to return an in-memory fake.
 * - `@/lib/data/EODHDProvider` is mocked so bulkEod returns fixture data.
 * - No real EODHD API calls or Supabase network calls.
 *
 * For date-agnostic matching: the bulk fixture uses date "2026-05-01". The route
 * derives `today` from `new Date()`. Tests do not assert the date field on the
 * response body — they assert upserted counts and error kinds instead. This
 * avoids fragile date coupling to fixture contents.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

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

// ── EODHDProvider mock ───────────────────────────────────────────────────────

function loadBulkFixture(): unknown[] {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/eodhd/bulk-us-sample.json'), 'utf-8'),
  )
}

// Fixture bulk rows: SPY, AGG, VTI on 2026-05-01
const bulkFixture = loadBulkFixture()

// Mock bulkEod to return fixture data by default; can be overridden per-test
let mockBulkResult: unknown = bulkFixture

vi.mock('@/lib/data/EODHDProvider', () => ({
  EODHDProvider: class {
    async bulkEod(_exchange: string, _date: string) {
      return mockBulkResult
    }
  },
}))

// Import GET AFTER vi.mock is set up
const { GET } = await import('./route')

// ── Request factory ──────────────────────────────────────────────────────────

function makeRequest(opts: {
  authorization?: string
  exchange?: string
  envOverrides?: Record<string, string | undefined>
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
    mockBulkResult = bulkFixture

    // Set required env vars for most tests
    process.env.CRON_SECRET = CRON_SECRET
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.EODHD_API_KEY = 'test-eodhd-key'
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.EODHD_API_KEY
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

  it('Test 4: returns 400 when exchange param is not US or SW (e.g. ZZ)', async () => {
    const req = makeRequest({ authorization: VALID_AUTH, exchange: 'ZZ' })
    const res = await GET(req as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.kind).toBe('invalid_input')
  })

  it('Test 5: returns 200 and upserts matching tracked ticker from bulk fixture', async () => {
    // Pre-seed instruments: SPY.US tracked in exchange US
    mockInstruments = [
      { id: 'inst-spy-uuid', ticker: 'SPY.US', exchange: 'US', first_date: null },
    ]

    const req = makeRequest({ authorization: VALID_AUTH, exchange: 'US' })
    const res = await GET(req as never)
    expect(res.status).toBe(200)
    const json = await res.json()

    // Response shape assertions
    expect(json.ok).toBe(true)
    expect(json.exchange).toBe('US')
    // SPY is in fixture — should be upserted
    expect(json.upserted).toBeGreaterThanOrEqual(1)
    // 3 rows in bulk fixture, 1 tracked — 2 unmatched, 0 in skipped (just unmatched != skipped)
    expect(json.returnedByEODHD).toBe(3)
    expect(json.tracked).toBe(1)
    expect(Array.isArray(json.skipped)).toBe(true)
    expect(json.skipped.length).toBe(0)

    // Verify DB write: prices table should have the SPY row
    expect(mockPrices.length).toBeGreaterThanOrEqual(1)
    expect(mockPrices.some(p => p.instrument_id === 'inst-spy-uuid')).toBe(true)
  })

  it('Test 6: returns 200 with upserted=0 when bulk contains no matching tracked tickers', async () => {
    // Tracked instrument is TSLA.US — but fixture only has SPY, AGG, VTI
    mockInstruments = [
      { id: 'inst-tsla-uuid', ticker: 'TSLA.US', exchange: 'US', first_date: null },
    ]
    // Override bulk to return AAPL and GOOG (neither tracked)
    mockBulkResult = [
      { code: 'AAPL', exchange_short_name: 'US', date: '2026-05-01', open: 170, high: 172, low: 169, close: 171, adjusted_close: 171, volume: 1000 },
      { code: 'GOOG', exchange_short_name: 'US', date: '2026-05-01', open: 180, high: 182, low: 179, close: 181, adjusted_close: 181, volume: 2000 },
    ]

    const req = makeRequest({ authorization: VALID_AUTH, exchange: 'US' })
    const res = await GET(req as never)
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.upserted).toBe(0)
    expect(json.returnedByEODHD).toBe(2)
    expect(json.tracked).toBe(1)
    expect(json.skipped).toEqual([])
    // No DB writes
    expect(mockPrices.length).toBe(0)
  })
})
