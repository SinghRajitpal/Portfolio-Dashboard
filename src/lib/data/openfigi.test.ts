import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isISIN, resolveISIN } from './openfigi'
import { installFetchMock, uninstallFetchMock } from '../../../tests/helpers/mock-fetch'
import { isDataError } from './errors'

describe('isISIN', () => {
  it('returns true for a valid Swiss ISIN', () => {
    expect(isISIN('CH0237935637')).toBe(true)
  })

  it('returns false for a 3-char ticker like SPY', () => {
    expect(isISIN('SPY')).toBe(false)
  })

  it('returns true for an Irish UCITS ETF ISIN (IE prefix)', () => {
    expect(isISIN('IE00B4L5Y983')).toBe(true)
  })

  it('returns false when last char is not a digit', () => {
    expect(isISIN('CH023793563X')).toBe(false)
  })
})

describe('resolveISIN', () => {
  afterEach(() => {
    uninstallFetchMock()
  })

  it('returns OpenFIGI records with ticker=CHDVD and exchange=SW for CH0237935637', async () => {
    installFetchMock([
      {
        match: /openfigi\.com/,
        fixture: 'openfigi/chdvd-isin.json',
      },
    ])
    const result = await resolveISIN('CH0237935637')
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) throw new Error('unexpected error')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].ticker).toBe('CHDVD')
    expect(result[0].exchCode).toBe('SW')
  })

  it('returns rate_limit DataError when OpenFIGI responds with 429', async () => {
    installFetchMock([
      {
        match: /openfigi\.com/,
        fixture: 'openfigi/chdvd-isin.json',
        status: 429,
      },
    ])
    const result = await resolveISIN('CH0237935637')
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) throw new Error('expected error')
    expect(result.kind).toBe('rate_limit')
  })

  it('returns not_found DataError when OpenFIGI returns warning shape', async () => {
    installFetchMock([
      {
        match: /openfigi\.com/,
        fixture: 'openfigi/not-found.json',
      },
    ])
    const result = await resolveISIN('CH0237935637')
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) throw new Error('expected error')
    expect(result.kind).toBe('not_found')
  })

  it('retries 3x on network error before returning transient error', async () => {
    let callCount = 0
    // Use passThrough=false with a custom implementation that throws
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      callCount++
      throw new Error('network failure')
    }
    const result = await resolveISIN('CH0237935637', { baseDelayMs: 0 })
    globalThis.fetch = originalFetch
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) throw new Error('expected error')
    expect(result.kind).toBe('transient')
    // withRetry default: 4 attempts (1 initial + 3 retries)
    expect(callCount).toBe(4)
  })
})
