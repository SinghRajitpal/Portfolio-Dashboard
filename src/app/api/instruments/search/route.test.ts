/**
 * Unit tests for POST /api/instruments/search route handler.
 *
 * Strategy: call the imported POST function directly (no live server).
 * Supabase createClient is fully mocked (no env vars needed for unit tests).
 * OpenFIGI fetch is mocked via mock-fetch helper.
 *
 * For cache-hit test (Test 4): the mock supabase client starts empty, so the
 * first ISIN call goes to OpenFIGI. We then seed the in-memory mock cache with
 * the returned records and make a second call — which should read from cache.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installFetchMock, uninstallFetchMock } from '../../../../../tests/helpers/mock-fetch'

// In-memory isin_lookups mock
type IsinRow = {
  isin: string
  ticker: string
  exchange: string
  figi: string | null
  security_type: string | null
  currency: string | null
}

let mockIsinStore: IsinRow[] = []

const mockSupabase = {
  from: (table: string) => {
    if (table === 'isin_lookups') {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, val: string) => {
            const rows = mockIsinStore.filter(r => r.isin === val)
            return Promise.resolve({ data: rows, error: null })
          },
        }),
        upsert: (rows: IsinRow[], _opts: unknown) => {
          for (const row of rows) {
            const idx = mockIsinStore.findIndex(
              r => r.isin === row.isin && r.ticker === row.ticker && r.exchange === row.exchange,
            )
            if (idx >= 0) {
              mockIsinStore[idx] = row
            } else {
              mockIsinStore.push(row)
            }
          }
          return Promise.resolve({ error: null })
        },
      }
    }
    throw new Error(`mockSupabase: unexpected table "${table}"`)
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => mockSupabase,
}))

// Import POST AFTER vi.mock is set up
const { POST } = await import('./route')

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/instruments/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/instruments/search', () => {
  beforeEach(() => {
    mockIsinStore = []
  })

  afterEach(() => {
    uninstallFetchMock()
  })

  it('Test 1: returns 400 for empty query string', async () => {
    const req = makeRequest({ query: '' })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.kind).toBe('invalid_input')
  })

  it('Test 2: returns 400 for a 1-character query', async () => {
    const req = makeRequest({ query: 'x' })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.kind).toBe('invalid_input')
  })

  it('Test 3: returns 200 with CHDVD result for ISIN CH0237935637 (cache miss → OpenFIGI)', async () => {
    installFetchMock([
      {
        match: /openfigi\.com/,
        fixture: 'openfigi/chdvd-isin.json',
      },
    ])
    const req = makeRequest({ query: 'CH0237935637' })
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json.length).toBeGreaterThan(0)
    expect(json[0].ticker).toBe('CHDVD')
    expect(json[0].exchange).toBe('SW')
    expect(json[0].isin).toBe('CH0237935637')
  })

  it('Test 4: second ISIN call returns cached result without calling OpenFIGI again', async () => {
    let openFigiCallCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url
      if (/openfigi\.com/.test(url)) {
        openFigiCallCount++
        const fs = await import('node:fs/promises')
        const path = await import('node:path')
        const body = await fs.readFile(
          path.join(process.cwd(), 'tests/fixtures/openfigi/chdvd-isin.json'),
          'utf-8',
        )
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (originalFetch) return originalFetch(input, init)
      throw new Error(`Unmatched URL: ${url}`)
    }

    try {
      // First call — cache miss → hits OpenFIGI
      const req1 = makeRequest({ query: 'CH0237935637' })
      const res1 = await POST(req1 as never)
      expect(res1.status).toBe(200)
      expect(openFigiCallCount).toBe(1)

      // Second call — cache hit → should NOT call OpenFIGI again
      const req2 = makeRequest({ query: 'CH0237935637' })
      const res2 = await POST(req2 as never)
      expect(res2.status).toBe(200)
      expect(openFigiCallCount).toBe(1) // still 1, not 2

      const json2 = await res2.json()
      expect(json2[0].ticker).toBe('CHDVD')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('Test 5: returns 400 for malformed JSON body', async () => {
    const req = new Request('http://localhost/api/instruments/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.kind).toBe('invalid_input')
  })
})
