import type { DataError } from './errors'
import type { PriceRow, DividendRow, SearchResult, BulkEodRow } from './types'

export interface IMarketDataProvider {
  /**
   * Fetches full price history for a single symbol.
   * Format: 'SPY.US', 'CHDVD.SW'.
   * Returns DataError with kind='not_found' if symbol unknown to provider.
   */
  getEod(symbol: string, opts?: { from?: string; to?: string }): Promise<PriceRow[] | DataError>

  /**
   * Fetches full dividend history for a single symbol.
   * Returns DataError with kind='not_found' if symbol unknown.
   */
  getDividends(symbol: string, opts?: { from?: string; to?: string }): Promise<DividendRow[] | DataError>

  /**
   * Fetches all instruments traded on `exchange` for `date` (YYYY-MM-DD).
   * Used by daily cron — one call covers many tickers.
   */
  bulkEod(exchange: 'US' | 'SW', date: string): Promise<BulkEodRow[] | DataError>

  /**
   * Searches by ticker, name, or partial match.
   * Returns up to opts.limit (default 10) results across exchanges.
   */
  search(query: string, opts?: { limit?: number }): Promise<SearchResult[] | DataError>
}
