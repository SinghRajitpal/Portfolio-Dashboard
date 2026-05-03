/**
 * stooq.ts unit tests.
 *
 * Strategy:
 * - toStooqSymbol: pure function, no mocking needed.
 * - parseStooqCsv: reads fixture files via fs; pure function.
 * - fetchStooqDailyCsv: mocks global.fetch via mock-fetch helper.
 *
 * Fixtures: tests/fixtures/stooq/spy-daily.csv, chdvd-daily.csv
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { toStooqSymbol, parseStooqCsv, fetchStooqDailyCsv } from './stooq'
import { isDataError } from './errors'
import { installFetchMock, uninstallFetchMock } from '../../../tests/helpers/mock-fetch'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function readFixture(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'tests/fixtures/stooq', name),
    'utf-8',
  )
}

const APIKEY_GATE_BODY = 'Get your apikey: https://stooq.com/q/d/?s=spy.us&get_apikey'

// ── toStooqSymbol ─────────────────────────────────────────────────────────────

describe('toStooqSymbol', () => {
  it('converts US ticker', () => {
    expect(toStooqSymbol('SPY.US')).toBe('spy.us')
  })

  it('converts AGG.US', () => {
    expect(toStooqSymbol('AGG.US')).toBe('agg.us')
  })

  it('converts Swiss SW ticker to .ch suffix', () => {
    expect(toStooqSymbol('CHDVD.SW')).toBe('chdvd.ch')
  })

  it('converts NOVN.SW to novn.ch', () => {
    expect(toStooqSymbol('NOVN.SW')).toBe('novn.ch')
  })

  it('converts LSE ticker to .uk suffix', () => {
    expect(toStooqSymbol('VWRL.LSE')).toBe('vwrl.uk')
  })

  it('converts IWDA.LSE to iwda.uk', () => {
    expect(toStooqSymbol('IWDA.LSE')).toBe('iwda.uk')
  })

  it('throws Error on unknown exchange', () => {
    expect(() => toStooqSymbol('XYZ.UNKNOWN')).toThrow()
  })

  it('throws Error on ticker with no dot (missing exchange)', () => {
    expect(() => toStooqSymbol('NOECHANGE')).toThrow()
  })
})

// ── parseStooqCsv ─────────────────────────────────────────────────────────────

describe('parseStooqCsv', () => {
  it('parses spy-daily.csv fixture into 10 PriceRows', () => {
    const csv = readFixture('spy-daily.csv')
    const result = parseStooqCsv(csv)
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return
    expect(result).toHaveLength(10)
  })

  it('returns rows with close === adjusted_close (Stooq pre-adjusted)', () => {
    const csv = readFixture('spy-daily.csv')
    const result = parseStooqCsv(csv)
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return
    for (const row of result) {
      expect(row.adjusted_close).toBe(row.close)
    }
  })

  it('returns correct date for first row of spy fixture (1993-01-29)', () => {
    const csv = readFixture('spy-daily.csv')
    const result = parseStooqCsv(csv)
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return
    expect(result[0].date).toBe('1993-01-29')
  })

  it('returns correct close for COVID circuit-breaker row (2020-03-16: 239.85)', () => {
    const csv = readFixture('spy-daily.csv')
    const result = parseStooqCsv(csv)
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return
    const row = result.find(r => r.date === '2020-03-16')
    expect(row).toBeDefined()
    expect(row!.close).toBeCloseTo(239.85, 2)
    expect(row!.volume).toBe(531380400)
  })

  it('parses chdvd-daily.csv fixture identically (5 rows)', () => {
    const csv = readFixture('chdvd-daily.csv')
    const result = parseStooqCsv(csv)
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return
    expect(result).toHaveLength(5)
    expect(result[0].date).toBe('2020-03-16')
    expect(result[0].close).toBeCloseTo(67.30, 2)
    expect(result[0].adjusted_close).toBe(result[0].close)
  })

  it('ignores blank lines in the CSV', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n1993-01-29,43.97,43.97,43.75,43.94,1003200\n\n2024-01-02,469.18,473.54,468.11,472.33,62830100\n'
    const result = parseStooqCsv(csv)
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return
    expect(result).toHaveLength(2)
  })

  it('drops the header row (not parsed as data)', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n1993-01-29,43.97,43.97,43.75,43.94,1003200'
    const result = parseStooqCsv(csv)
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('1993-01-29')
  })

  it('returns invalid_input DataError on apikey-gate body', () => {
    const result = parseStooqCsv(APIKEY_GATE_BODY)
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('invalid_input')
    expect(result.message).toMatch(/apikey/i)
  })

  it('returns not_found DataError on header-only CSV (no data rows)', () => {
    const result = parseStooqCsv('Date,Open,High,Low,Close,Volume')
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('not_found')
  })

  it('coerces missing volume to null without skipping the row', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n2024-01-02,469.18,473.54,468.11,472.33,'
    const result = parseStooqCsv(csv)
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return
    expect(result).toHaveLength(1)
    expect(result[0].volume).toBeNull()
    expect(result[0].close).toBeCloseTo(472.33, 2)
  })
})

// ── fetchStooqDailyCsv ────────────────────────────────────────────────────────

describe('fetchStooqDailyCsv', () => {
  beforeEach(() => {
    // Clean process.env between tests
    delete process.env.STOOQ_API_KEY
  })

  afterEach(() => {
    uninstallFetchMock()
    delete process.env.STOOQ_API_KEY
  })

  it('returns invalid_input DataError when apiKey missing from opts and env', async () => {
    const result = await fetchStooqDailyCsv('spy.us')
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('invalid_input')
    expect(result.message).toMatch(/STOOQ_API_KEY/i)
  })

  it('uses apiKey from opts when provided', async () => {
    installFetchMock([
      { match: /stooq\.com/, fixture: 'stooq/spy-daily.csv', contentType: 'text/csv' },
    ])
    const result = await fetchStooqDailyCsv('spy.us', { apiKey: 'test-key' })
    expect(isDataError(result)).toBe(false)
    expect(typeof result).toBe('string')
  })

  it('uses STOOQ_API_KEY from process.env when no opts.apiKey', async () => {
    process.env.STOOQ_API_KEY = 'env-key'
    installFetchMock([
      { match: /stooq\.com/, fixture: 'stooq/spy-daily.csv', contentType: 'text/csv' },
    ])
    const result = await fetchStooqDailyCsv('spy.us')
    expect(isDataError(result)).toBe(false)
  })

  it('appends apikey as query param in URL', async () => {
    let capturedUrl = ''
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      return new Response(readFixture('spy-daily.csv'), { status: 200 })
    }
    await fetchStooqDailyCsv('spy.us', { apiKey: 'mykey123' })
    globalThis.fetch = originalFetch
    expect(capturedUrl).toContain('apikey=mykey123')
    expect(capturedUrl).toContain('s=spy.us')
    expect(capturedUrl).toContain('i=d')
  })

  it('includes d1 and d2 params when from/to provided', async () => {
    let capturedUrl = ''
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
      return new Response(readFixture('spy-daily.csv'), { status: 200 })
    }
    await fetchStooqDailyCsv('spy.us', { apiKey: 'k', from: '20240101', to: '20240105' })
    globalThis.fetch = originalFetch
    expect(capturedUrl).toContain('d1=20240101')
    expect(capturedUrl).toContain('d2=20240105')
  })

  it('returns not_found DataError on HTTP 404', async () => {
    installFetchMock([
      { match: /stooq\.com/, fixture: 'stooq/spy-daily.csv', status: 404, contentType: 'text/plain' },
    ])
    const result = await fetchStooqDailyCsv('iqqa.ch', { apiKey: 'test' })
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('not_found')
  })

  it('returns transient DataError on HTTP 500', async () => {
    installFetchMock([
      { match: /stooq\.com/, fixture: 'stooq/spy-daily.csv', status: 500, contentType: 'text/plain' },
    ])
    const result = await fetchStooqDailyCsv('spy.us', { apiKey: 'test' })
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('transient')
  })

  it('returns invalid_input DataError when 200 response is apikey-gate body', async () => {
    // Override fetch directly to return gate body
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(APIKEY_GATE_BODY, { status: 200 })
    const result = await fetchStooqDailyCsv('spy.us', { apiKey: 'wrong-key' })
    globalThis.fetch = originalFetch
    // fetchStooqDailyCsv returns raw text; gate detection is in parseStooqCsv
    // But per spec: "on HTTP 200 with the apikey-gate body returns kind='invalid_input'"
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('invalid_input')
  })
})
