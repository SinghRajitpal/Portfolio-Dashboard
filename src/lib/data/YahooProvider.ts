/**
 * YahooProvider — implements IMarketDataProvider using yahoo-finance2.
 *
 * Key design decisions:
 * - Uses yahoo-finance2 chart() with explicit period1/period2 epoch seconds.
 *   NEVER uses range=max (STATE.md decision: silently downsamples to monthly).
 * - Symbol mapper (toYahooSymbol) runs first inside each method so the user-
 *   facing ticker (e.g. "SPY.US") is always translated to Yahoo format ("SPY").
 * - Constructor accepts optional `client` and `baseDelayMs` for test injection.
 * - bulkEod returns kind='invalid_input' — Yahoo has no bulk endpoint.
 * - All methods wrapped in withRetry({ maxAttempts: 4 }) — same as EODHDProvider.
 *
 * Error mapping:
 *   - 404 / "Symbol not found" / "No fundamentals" → kind='not_found'
 *   - 5xx / network error → kind='transient' (retried by withRetry)
 *   - Empty/invalid symbol → kind='invalid_input' (not retried)
 */
import type { IMarketDataProvider } from './IMarketDataProvider'
import type { PriceRow, DividendRow, BulkEodRow, SearchResult } from './types'
import type { DataError } from './errors'
import { withRetry, type RetryOpts } from './backoff'
import { toYahooSymbol } from './symbol-map'
import type { ChartResultArray } from 'yahoo-finance2/modules/chart'
import type { SearchResult as YahooSearchResult } from 'yahoo-finance2/modules/search'

/** Minimal interface for test injection — only the methods we call. */
interface YahooFinanceClient {
  chart(
    symbol: string,
    opts: {
      period1: number
      period2?: number
      interval: '1d'
      events?: string
      return?: 'array'
    },
  ): Promise<ChartResultArray>
  search(
    query: string,
    opts?: { quotesCount?: number },
  ): Promise<YahooSearchResult>
}

/** Map Yahoo quoteType values to our SearchResult.type enum. */
const QUOTE_TYPE_MAP: Record<string, SearchResult['type']> = {
  ETF: 'etf',
  ETP: 'etf',
  EQUITY: 'stock',
  MUTUALFUND: 'fund',
  BOND: 'bond',
  COMMODITY: 'commodity',
  FUTURE: 'future',
  INDEX: 'stock',
}

export interface YahooProviderOpts {
  /** Injected client — used in tests to avoid real network calls. */
  client?: YahooFinanceClient
  /** Base retry delay in ms — override in tests to keep them fast. */
  baseDelayMs?: number
}

export class YahooProvider implements IMarketDataProvider {
  private client: YahooFinanceClient
  private baseDelayMs: number

  constructor(opts: YahooProviderOpts = {}) {
    this.baseDelayMs = opts.baseDelayMs ?? 1000
    if (opts.client) {
      this.client = opts.client
    } else {
      // Lazy-loaded to avoid top-level ESM side-effects in server environments.
      // yahoo-finance2 default export is a class; instantiate it here.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const YahooFinance = require('yahoo-finance2').default
      this.client = new YahooFinance() as YahooFinanceClient
    }
  }

  /**
   * Fetches full daily price history for a single ticker.
   * Maps from project ticker (SPY.US) → Yahoo symbol (SPY) before calling.
   * Uses explicit period1/period2 epoch seconds — never range=max.
   */
  async getEod(
    symbol: string,
    opts: { from?: string; to?: string } = {},
  ): Promise<PriceRow[] | DataError> {
    let yahooSymbol: string
    try {
      yahooSymbol = toYahooSymbol(symbol)
    } catch {
      return { kind: 'invalid_input', message: `YahooProvider: ${symbol} — ticker must be SYMBOL.EXCHANGE` }
    }

    const period1 = opts.from
      ? Math.floor(Date.parse(opts.from) / 1000)
      : 0
    let period2 = opts.to
      ? Math.floor(Date.parse(opts.to) / 1000)
      : Math.floor(Date.now() / 1000)
    // Yahoo chart() treats period2 as exclusive — requires period2 > period1.
    // Callers passing from===to (e.g. cron asking for "today") need the window expanded.
    if (period2 <= period1) period2 = period1 + 86400

    const retryOpts: RetryOpts = { maxAttempts: 4, baseDelayMs: this.baseDelayMs }

    return withRetry(async () => {
      try {
        const result = await this.client.chart(yahooSymbol, {
          period1,
          period2,
          interval: '1d',
          events: 'div',
          return: 'array',
        })
        const quotes = result.quotes ?? []
        if (quotes.length === 0) {
          return { kind: 'not_found', message: `YahooProvider: no price data returned for ${symbol}` }
        }
        return quotes.map(q => ({
          date: formatDate(q.date),
          open: q.open ?? null,
          high: q.high ?? null,
          low: q.low ?? null,
          close: q.close ?? 0,
          adjusted_close: q.adjclose ?? q.close ?? 0,
          volume: q.volume ?? null,
        }))
      } catch (err) {
        return mapYahooError(err)
      }
    }, retryOpts)
  }

  /**
   * Fetches dividend history for a single ticker.
   * Reuses the chart() call with events='div'; extracts events.dividends.
   */
  async getDividends(
    symbol: string,
    opts: { from?: string; to?: string } = {},
  ): Promise<DividendRow[] | DataError> {
    let yahooSymbol: string
    try {
      yahooSymbol = toYahooSymbol(symbol)
    } catch {
      return { kind: 'invalid_input', message: `YahooProvider: ${symbol} — ticker must be SYMBOL.EXCHANGE` }
    }

    const period1 = opts.from
      ? Math.floor(Date.parse(opts.from) / 1000)
      : 0
    let period2 = opts.to
      ? Math.floor(Date.parse(opts.to) / 1000)
      : Math.floor(Date.now() / 1000)
    if (period2 <= period1) period2 = period1 + 86400

    const retryOpts: RetryOpts = { maxAttempts: 4, baseDelayMs: this.baseDelayMs }

    return withRetry(async () => {
      try {
        const result = await this.client.chart(yahooSymbol, {
          period1,
          period2,
          interval: '1d',
          events: 'div',
          return: 'array',
        })
        const dividends = result.events?.dividends ?? []
        const currency = result.meta.currency ?? 'USD'
        return dividends.map(d => ({
          ex_date: formatDate(d.date),
          amount: d.amount,
          currency,
        }))
      } catch (err) {
        return mapYahooError(err)
      }
    }, retryOpts)
  }

  /**
   * Yahoo Finance has no bulk endpoint.
   * Returns invalid_input so callers fall back to per-ticker getEod via cron.
   */
  async bulkEod(_exchange: 'US' | 'SW', _date: string): Promise<BulkEodRow[] | DataError> {
    return {
      kind: 'invalid_input',
      message: 'YahooProvider does not support bulkEod — use per-ticker getEod via cron',
    }
  }

  /**
   * Searches Yahoo Finance for tickers matching the query.
   * Maps Yahoo quoteType to our SearchResult.type enum.
   */
  async search(
    query: string,
    opts: { limit?: number } = {},
  ): Promise<SearchResult[] | DataError> {
    if (!query || query.trim().length < 1) {
      return { kind: 'invalid_input', message: 'YahooProvider: search query must not be empty' }
    }

    const retryOpts: RetryOpts = { maxAttempts: 4, baseDelayMs: this.baseDelayMs }

    return withRetry(async () => {
      try {
        const raw = await this.client.search(query, {
          quotesCount: opts.limit ?? 10,
        })
        const quotes = raw.quotes ?? []
        return quotes
          .filter((q): q is Extract<typeof q, { quoteType: string; symbol: string; exchange: string }> =>
            'quoteType' in q && 'symbol' in q && 'exchange' in q,
          )
          .slice(0, opts.limit ?? 10)
          .map(q => ({
            ticker: q.symbol,
            exchange: q.exchange,
            name: ('longname' in q && typeof q.longname === 'string' ? q.longname : null) ??
              ('shortname' in q && typeof q.shortname === 'string' ? q.shortname : null) ??
              q.symbol,
            type: QUOTE_TYPE_MAP[(q as { quoteType: string }).quoteType] ?? 'stock',
            currency: ('currency' in q && typeof q.currency === 'string' ? q.currency : null) ?? 'USD',
            isin: null,
          }))
      } catch (err) {
        return mapYahooError(err)
      }
    }, retryOpts)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats a Date to YYYY-MM-DD string (local ISO date, no time component).
 * Yahoo returns Date objects; we need string format per PriceRow.date spec.
 */
function formatDate(d: Date): string {
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Maps Yahoo Finance errors to DataError kinds.
 * - 404 / "not found" / "Symbol not found" → not_found
 * - Everything else → transient (5xx, network, etc.)
 */
function mapYahooError(err: unknown): DataError {
  const msg = err instanceof Error ? err.message : String(err)
  if (/404|not.?found|no.?result|invalid.?symbol|unknown.?symbol/i.test(msg)) {
    return { kind: 'not_found', message: msg }
  }
  return { kind: 'transient', message: msg, attempt: 0 }
}
