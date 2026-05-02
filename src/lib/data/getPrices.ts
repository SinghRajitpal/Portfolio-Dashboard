import type { SupabaseClient } from '@supabase/supabase-js'
import { EODHDProvider } from './EODHDProvider'
import {
  upsertPrices,
  upsertDividends,
  upsertInstrumentMetadata,
  getCachedPrices,
  getInstrumentByTicker,
} from './cache-prices'
import { isDataError } from './errors'
import type { DataError } from './errors'
import type { PriceRow, InstrumentMetadata } from './types'
import type { IMarketDataProvider } from './IMarketDataProvider'

export type GetPricesResult = {
  rows: PriceRow[]
  instrumentId: string
  cached: boolean
}

/**
 * Cache-first price fetch.
 *
 * - If instrument exists AND has cached prices: return cached rows (cached=true).
 * - Otherwise: fetch from provider, upsert metadata + prices + dividends, return
 *   rows (cached=false).
 *
 * Per CONTEXT.md: Dividends failure is NOT fatal — some instruments legitimately
 * have no dividends (irregular EU ex-dates, etc.). Prices failure IS fatal.
 *
 * @param supabase  - Service-role client (pipeline is server-only)
 * @param ticker    - Full ticker with exchange, e.g. "SPY.US" or "CHDVD.SW"
 * @param deps      - Optional provider and metadata overrides (used by tests and seed scripts)
 */
export async function getPricesForTicker(
  supabase: SupabaseClient,
  ticker: string,
  deps: {
    provider?: IMarketDataProvider
    metadata?: Partial<InstrumentMetadata>
  } = {},
): Promise<GetPricesResult | DataError> {
  if (!ticker || !ticker.includes('.')) {
    return { kind: 'invalid_input', message: `ticker must be SYMBOL.EXCHANGE; got "${ticker}"` }
  }
  const dotIndex = ticker.lastIndexOf('.')
  const symbol = ticker.substring(0, dotIndex)
  const exchange = ticker.substring(dotIndex + 1)

  // ── 1. Cache check ────────────────────────────────────────────────────────
  const inst = await getInstrumentByTicker(supabase, ticker)
  if (isDataError(inst)) return inst

  if (inst && inst.first_date) {
    // Cache hit — instrument exists and has been fully loaded before
    const rows = await getCachedPrices(supabase, inst.id)
    if (isDataError(rows)) return rows
    if (rows.length > 0) return { rows, instrumentId: inst.id, cached: true }
  }

  // ── 2. Cache miss — fetch from provider ──────────────────────────────────
  const provider = deps.provider ?? new EODHDProvider(process.env.EODHD_API_KEY ?? '')

  // ── 2a. Resolve instrument metadata ──────────────────────────────────────
  let meta: InstrumentMetadata
  const m = deps.metadata
  if (m && m.ticker && m.name && m.type) {
    // Caller supplied metadata — use it directly (seed / test path)
    meta = {
      ticker,
      name: m.name,
      isin: m.isin ?? null,
      type: m.type,
      currency: m.currency ?? 'USD',
      exchange,
      expense_ratio: m.expense_ratio ?? null,
      dividend_yield: m.dividend_yield ?? null,
    }
  } else {
    // Search EODHD to resolve name/type/currency
    const searchResults = await provider.search(symbol, { limit: 10 })
    if (isDataError(searchResults)) return searchResults
    const match = searchResults.find(r => r.exchange === exchange && r.ticker === symbol)
    if (!match) {
      return {
        kind: 'not_found',
        message: `EODHD search did not return ${ticker} (search returned ${searchResults.length} results for "${symbol}")`,
      }
    }
    meta = {
      ticker,
      name: match.name,
      isin: match.isin,
      type: match.type,
      currency: match.currency,
      exchange: match.exchange,
      expense_ratio: null,    // not available in EODHD search response
      dividend_yield: null,
    }
  }

  // ── 2b. Upsert metadata to get instrument_id ──────────────────────────────
  const upserted = await upsertInstrumentMetadata(supabase, meta)
  if (isDataError(upserted)) return upserted
  const instrumentId = upserted.id

  // ── 2c. Fetch prices + dividends in parallel ──────────────────────────────
  const [prices, divs] = await Promise.all([
    provider.getEod(ticker),
    provider.getDividends(ticker),
  ])
  if (isDataError(prices)) return prices

  // Dividends failure is non-fatal — log and continue
  if (!isDataError(divs) && divs.length > 0) {
    const divResult = await upsertDividends(supabase, instrumentId, divs)
    if (isDataError(divResult)) return divResult   // DB failure is fatal
  }

  const priceUpsert = await upsertPrices(supabase, instrumentId, prices)
  if (isDataError(priceUpsert)) return priceUpsert

  return { rows: prices, instrumentId, cached: false }
}
