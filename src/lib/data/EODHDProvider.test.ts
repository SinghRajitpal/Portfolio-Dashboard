/**
 * EODHDProvider unit tests.
 *
 * Strategy: constructor injection.
 * EODHDProvider accepts an optional `client` parameter so tests pass a fake
 * EODHDClient. This is required because the SDK's built-in fetch-based transport
 * is hard to intercept at the fetch level (it wraps fetch with its own retry
 * logic). Constructor injection is cleaner and documented in the plan's
 * "Pragmatic fallback" note.
 *
 * Fixtures: tests/fixtures/eodhd/*.json (raw EODHD SDK response shapes)
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { EODHDProvider } from './EODHDProvider'
import type { EODHDClient } from 'eodhd'

// ── helpers ──────────────────────────────────────────────────────────────────

function fixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/eodhd', name), 'utf-8'),
  )
}

// Minimal fake EODHDClient shape
type FakeEodhdClient = Pick<EODHDClient, 'eod' | 'dividends' | 'bulkEod' | 'search'>

function makeClient(overrides: Partial<FakeEodhdClient> = {}): EODHDClient {
  return {
    eod: async () => fixture('spy-eod.json'),
    dividends: async () => fixture('spy-dividends.json'),
    bulkEod: async () => fixture('bulk-us-sample.json'),
    search: async () => fixture('search-apple.json'),
    ...overrides,
  } as unknown as EODHDClient
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('EODHDProvider', () => {
  it('Test 1: getEod returns PriceRow[] with adjusted_close non-null on every row', async () => {
    const provider = new EODHDProvider('test-key', makeClient())
    const result = await provider.getEod('SPY.US')
    expect(Array.isArray(result)).toBe(true)
    const rows = result as Array<{ adjusted_close: number }>
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.adjusted_close).not.toBeNull()
      expect(typeof row.adjusted_close).toBe('number')
    }
  })

  it('Test 2: getDividends returns DividendRow[] with ex_date, amount, currency', async () => {
    const provider = new EODHDProvider('test-key', makeClient())
    const result = await provider.getDividends('SPY.US')
    expect(Array.isArray(result)).toBe(true)
    const rows = result as Array<{ ex_date: string; amount: number; currency: string }>
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(typeof row.ex_date).toBe('string')
      expect(typeof row.amount).toBe('number')
      expect(row.currency).toBe('USD')
    }
  })

  it('Test 3: bulkEod returns BulkEodRow[] with SPY row having exchange_short_name US', async () => {
    const provider = new EODHDProvider('test-key', makeClient())
    const result = await provider.bulkEod('US', '2026-05-01')
    expect(Array.isArray(result)).toBe(true)
    const rows = result as Array<{ code: string; exchange_short_name: string }>
    expect(rows.length).toBeGreaterThan(0)
    const spy = rows.find(r => r.code === 'SPY')
    expect(spy).toBeDefined()
    expect(spy!.exchange_short_name).toBe('US')
  })

  it('Test 4: search normalizes EODHD Type field to v1 enum', async () => {
    const provider = new EODHDProvider('test-key', makeClient())
    const result = await provider.search('Apple')
    expect(Array.isArray(result)).toBe(true)
    const rows = result as Array<{ ticker: string; type: string; currency: string }>
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      // 'Common Stock' → 'stock'
      expect(row.type).toBe('stock')
    }
  })

  it('Test 5: getEod returns rate_limit error on 429 — no retry attempted', async () => {
    let calls = 0
    const client = makeClient({
      eod: async () => {
        calls++
        const { EODHDRateLimitError } = await import('eodhd')
        throw new EODHDRateLimitError('too many requests', undefined, undefined, undefined)
      },
    })
    const provider = new EODHDProvider('test-key', client)
    const result = await provider.getEod('SPY.US')
    expect(result).toMatchObject({ kind: 'rate_limit' })
    // withRetry does NOT retry on rate_limit — should be exactly 1 attempt
    expect(calls).toBe(1)
  })

  it('Test 6: getEod succeeds after 2 failures via withRetry', async () => {
    let calls = 0
    const client = makeClient({
      eod: async () => {
        calls++
        if (calls < 3) throw new Error('503 Service Unavailable')
        return fixture('spy-eod.json') as ReturnType<EODHDClient['eod']> extends Promise<infer T> ? T : never
      },
    })
    const provider = new EODHDProvider('test-key', client)
    const result = await provider.getEod('SPY.US', { baseDelayMs: 1 })
    expect(Array.isArray(result)).toBe(true)
    expect(calls).toBe(3)
  })

  it('Test 7: getEod returns not_found when EODHD returns empty array', async () => {
    const client = makeClient({ eod: async () => [] })
    const provider = new EODHDProvider('test-key', client)
    const result = await provider.getEod('FAKE.US')
    expect(result).toMatchObject({ kind: 'not_found' })
  })

  it('Test 8: getEod returns invalid_input without calling SDK when symbol has no dot', async () => {
    let called = false
    const client = makeClient({ eod: async () => { called = true; return [] } })
    const provider = new EODHDProvider('test-key', client)
    const result = await provider.getEod('')
    expect(result).toMatchObject({ kind: 'invalid_input' })
    expect(called).toBe(false)
  })
})
