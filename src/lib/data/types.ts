// Mirrors prices table columns (open/high/low can be null per schema)
export type PriceRow = {
  date: string            // ISO YYYY-MM-DD
  open: number | null
  high: number | null
  low: number | null
  close: number
  adjusted_close: number
  volume: number | null
}

// Mirrors dividends table columns
export type DividendRow = {
  ex_date: string         // ISO YYYY-MM-DD
  amount: number
  currency: string
}

// Subset of EODHD bulk EOD shape — only fields we persist
export type BulkEodRow = PriceRow & { code: string; exchange_short_name: 'US' | 'SW' | string }

// Search result — superset of EODHD search response, used by /api/instruments/search
export type SearchResult = {
  ticker: string          // e.g., "SPY"
  exchange: string        // e.g., "US", "SW"
  name: string
  type: 'etf' | 'stock' | 'commodity' | 'future' | 'bond' | 'fund' | string
  currency: string
  isin: string | null
}

// Metadata persisted to instruments table on first fetch
export type InstrumentMetadata = {
  ticker: string
  name: string
  isin: string | null
  type: SearchResult['type']
  currency: string
  exchange: string
  expense_ratio: number | null   // EODHD free tier may not provide
  dividend_yield: number | null  // EODHD free tier may not provide
}
