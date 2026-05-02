/**
 * EODHDProvider — implements IMarketDataProvider using the eodhd SDK.
 *
 * Notes:
 * - SDK uses fetch internally and has its own retry. We disable SDK retry
 *   (maxRetries: 0) and wrap with our withRetry for consistent error contract.
 * - Constructor accepts optional `client` for test injection.
 * - Rate limit errors from SDK (EODHDRateLimitError) map to kind='rate_limit'.
 *   withRetry will NOT retry them per CONTEXT.md.
 * - 5xx / network errors map to kind='transient' and ARE retried by withRetry.
 */
import { EODHDClient, EODHDRateLimitError } from 'eodhd'
import type { IMarketDataProvider } from './IMarketDataProvider'
import type { PriceRow, DividendRow, BulkEodRow, SearchResult } from './types'
import type { DataError } from './errors'
import { withRetry, type RetryOpts } from './backoff'

const TYPE_MAP: Record<string, SearchResult['type']> = {
  ETF: 'etf',
  ETP: 'etf',
  'Common Stock': 'stock',
  'Preferred Stock': 'stock',
  'Mutual Fund': 'fund',
  Bond: 'bond',
  Commodity: 'commodity',
  Future: 'future',
}

export class EODHDProvider implements IMarketDataProvider {
  private client: EODHDClient

  constructor(apiKey: string, client?: EODHDClient) {
    if (client) {
      this.client = client
    } else {
      if (!apiKey) throw new Error('EODHDProvider: apiKey required')
      this.client = new EODHDClient({ apiToken: apiKey, maxRetries: 0 })
    }
  }

  async getEod(
    symbol: string,
    opts: { from?: string; to?: string; baseDelayMs?: number } = {},
  ): Promise<PriceRow[] | DataError> {
    if (!symbol || !symbol.includes('.')) {
      return { kind: 'invalid_input', message: `EOD symbol must be SYMBOL.EXCHANGE; got "${symbol}"` }
    }
    const retryOpts: RetryOpts = { maxAttempts: 4, baseDelayMs: opts.baseDelayMs ?? 1000 }
    return withRetry(async () => {
      try {
        const raw = await this.client.eod(symbol, { from: opts.from ?? '1970-01-01', order: 'a' })
        if (!Array.isArray(raw)) {
          return mapSDKError(raw)
        }
        if (raw.length === 0) {
          return { kind: 'not_found', message: `EODHD returned no rows for ${symbol}` }
        }
        return raw.map(r => ({
          date: r.date,
          open: r.open ?? null,
          high: r.high ?? null,
          low: r.low ?? null,
          close: r.close,
          adjusted_close: r.adjusted_close,
          volume: r.volume ?? null,
        }))
      } catch (err) {
        return mapSDKError(err)
      }
    }, retryOpts)
  }

  async getDividends(
    symbol: string,
    opts: { from?: string; to?: string } = {},
  ): Promise<DividendRow[] | DataError> {
    if (!symbol || !symbol.includes('.')) {
      return { kind: 'invalid_input', message: `Dividend symbol must be SYMBOL.EXCHANGE; got "${symbol}"` }
    }
    return withRetry(async () => {
      try {
        const raw = await this.client.dividends(symbol, { from: opts.from ?? '1970-01-01' })
        if (!Array.isArray(raw)) return mapSDKError(raw)
        return raw.map(r => ({
          ex_date: r.date,
          amount: r.value,
          currency: r.currency ?? 'USD',
        }))
      } catch (err) {
        return mapSDKError(err)
      }
    })
  }

  async bulkEod(exchange: 'US' | 'SW', date: string): Promise<BulkEodRow[] | DataError> {
    return withRetry(async () => {
      try {
        const raw = await this.client.bulkEod(exchange, { date })
        if (!Array.isArray(raw)) return mapSDKError(raw)
        return raw.map(r => ({
          date: r.date,
          open: r.open ?? null,
          high: r.high ?? null,
          low: r.low ?? null,
          close: r.close,
          adjusted_close: r.adjusted_close,
          volume: r.volume ?? null,
          code: r.code,
          exchange_short_name: r.exchange_short_name,
        }))
      } catch (err) {
        return mapSDKError(err)
      }
    })
  }

  async search(
    query: string,
    opts: { limit?: number } = {},
  ): Promise<SearchResult[] | DataError> {
    if (!query || query.trim().length < 2) {
      return { kind: 'invalid_input', message: 'search query must be >= 2 chars' }
    }
    return withRetry(async () => {
      try {
        const raw = await this.client.search(query, { limit: opts.limit ?? 10 })
        if (!Array.isArray(raw)) return mapSDKError(raw)
        return raw.map(r => ({
          ticker: r.Code,
          exchange: r.Exchange,
          name: r.Name,
          type: TYPE_MAP[r.Type] ?? r.Type.toLowerCase(),
          currency: r.Currency,
          isin: r.ISIN ?? null,
        }))
      } catch (err) {
        return mapSDKError(err)
      }
    })
  }
}

function mapSDKError(err: unknown): DataError {
  // SDK throws typed errors: EODHDRateLimitError, EODHDAuthError, EODHDNetworkError, etc.
  if (err instanceof EODHDRateLimitError) {
    return { kind: 'rate_limit', message: err.message }
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (/429|rate.?limit|too many/i.test(msg)) {
    return { kind: 'rate_limit', message: msg }
  }
  if (/404|not.?found/i.test(msg)) {
    return { kind: 'not_found', message: msg }
  }
  // Everything else is transient (5xx, timeout, network)
  return { kind: 'transient', message: msg, attempt: 0 }
}
