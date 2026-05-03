/**
 * Stooq market data library.
 *
 * Pure functions — no Supabase coupling.
 * Intentionally NOT wrapped behind IMarketDataProvider: Stooq is a one-shot
 * bulk-archive CSV path, not an interactive incremental provider.
 *
 * Exports:
 *   toStooqSymbol   - v1 ticker → Stooq URL symbol (e.g. SPY.US → spy.us)
 *   fetchStooqDailyCsv - HTTP download of Stooq daily CSV
 *   parseStooqCsv   - CSV string → PriceRow[] (or DataError)
 */
import type { PriceRow } from './types'
import type { DataError } from './errors'

// ── Symbol mapping ────────────────────────────────────────────────────────────

const EXCHANGE_SUFFIX: Record<string, string> = {
  US: 'us',
  SW: 'ch',
  LSE: 'uk',
}

/**
 * Convert a v1 ticker (e.g. "SPY.US", "CHDVD.SW", "VWRL.LSE") to the
 * Stooq URL symbol convention (e.g. "spy.us", "chdvd.ch", "vwrl.uk").
 *
 * Throws Error (not DataError) on unrecognised exchange — this is a
 * programmer error in the seed list; fail fast, don't swallow.
 */
export function toStooqSymbol(ticker: string): string {
  const lastDot = ticker.lastIndexOf('.')
  if (lastDot === -1) {
    throw new Error(`toStooqSymbol: ticker "${ticker}" has no exchange suffix`)
  }
  const symbol = ticker.slice(0, lastDot).toLowerCase()
  const exchange = ticker.slice(lastDot + 1)
  const suffix = EXCHANGE_SUFFIX[exchange]
  if (suffix === undefined) {
    throw new Error(
      `toStooqSymbol: unknown exchange "${exchange}" in ticker "${ticker}". ` +
      `Known exchanges: ${Object.keys(EXCHANGE_SUFFIX).join(', ')}`,
    )
  }
  return `${symbol}.${suffix}`
}

// ── CSV parser ────────────────────────────────────────────────────────────────

const APIKEY_GATE_PREFIX = 'Get your apikey'

/**
 * Parse a Stooq daily CSV string into PriceRow[].
 *
 * Stooq CSV shape:
 *   Date,Open,High,Low,Close,Volume
 *   1993-01-29,43.97,43.97,43.75,43.94,1003200
 *   ...
 *
 * Stooq prices are split-and-dividend adjusted by default.
 * close and adjusted_close are set to the same value.
 *
 * Returns DataError when:
 *   - csv starts with the apikey-gate message → kind='invalid_input'
 *   - csv has no data rows after the header  → kind='not_found'
 */
export function parseStooqCsv(csv: string): PriceRow[] | DataError {
  if (csv.startsWith(APIKEY_GATE_PREFIX)) {
    return {
      kind: 'invalid_input',
      message: 'Stooq apikey gate hit — STOOQ_API_KEY is missing or invalid',
    }
  }

  const lines = csv.split('\n').filter(l => l.trim().length > 0)
  // Drop the header row (first line: "Date,Open,High,Low,Close,Volume")
  const dataLines = lines.slice(1)

  if (dataLines.length === 0) {
    return { kind: 'not_found', message: 'Stooq CSV has no data rows' }
  }

  const rows: PriceRow[] = []
  for (const line of dataLines) {
    const [date, openStr, highStr, lowStr, closeStr, volumeStr] = line.split(',')
    const close = parseFloat(closeStr)
    if (isNaN(close)) continue  // skip malformed rows

    const open = parseFloat(openStr)
    const high = parseFloat(highStr)
    const low = parseFloat(lowStr)
    const volume = parseInt(volumeStr ?? '', 10)

    rows.push({
      date: date.trim(),
      open: isNaN(open) ? null : open,
      high: isNaN(high) ? null : high,
      low: isNaN(low) ? null : low,
      close,
      adjusted_close: close, // Stooq is pre-adjusted — same value in both columns
      volume: isNaN(volume) ? null : volume,
    })
  }

  return rows
}

// ── HTTP downloader ───────────────────────────────────────────────────────────

const STOOQ_BASE = 'https://stooq.com/q/d/l/'

export type FetchStooqOpts = {
  from?: string   // YYYYMMDD
  to?: string     // YYYYMMDD
  apiKey?: string
}

/**
 * Download the Stooq daily CSV for a given symbol.
 *
 * Returns the raw CSV string on success so the caller can pass it to
 * parseStooqCsv(). Returns DataError on auth/network failures.
 *
 * No retry logic here — caller wraps with withRetry if desired.
 * Gate detection: if the 200 response body starts with the apikey-gate prefix,
 * returns kind='invalid_input' (key wrong or expired).
 */
export async function fetchStooqDailyCsv(
  stooqSymbol: string,
  opts: FetchStooqOpts = {},
): Promise<string | DataError> {
  const apiKey = opts.apiKey ?? process.env.STOOQ_API_KEY
  if (!apiKey) {
    return {
      kind: 'invalid_input',
      message: 'STOOQ_API_KEY not set — provide opts.apiKey or set the STOOQ_API_KEY env var',
    }
  }

  const params = new URLSearchParams({
    s: stooqSymbol,
    i: 'd',
  })
  if (opts.from) params.set('d1', opts.from)
  if (opts.to) params.set('d2', opts.to)
  params.set('apikey', apiKey)

  const url = `${STOOQ_BASE}?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    return { kind: 'transient', message: `fetch error: ${String(err)}`, attempt: 0 }
  }

  if (res.status === 404) {
    return { kind: 'not_found', message: `Stooq: 404 for symbol ${stooqSymbol}` }
  }
  if (res.status >= 500) {
    return { kind: 'transient', message: `Stooq: HTTP ${res.status} for ${stooqSymbol}`, attempt: 0 }
  }

  const text = await res.text()

  // Gate detection: 200 but body is the apikey-gate page
  if (text.startsWith(APIKEY_GATE_PREFIX)) {
    return {
      kind: 'invalid_input',
      message: 'Stooq apikey gate hit — STOOQ_API_KEY is missing or invalid',
    }
  }

  return text
}
