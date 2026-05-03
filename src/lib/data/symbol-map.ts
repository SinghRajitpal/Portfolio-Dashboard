/**
 * symbol-map — translates project tickers to Yahoo Finance symbols and back.
 *
 * Project tickers use the convention SYMBOL.EXCHANGE (e.g. SPY.US, VWRL.LSE).
 * Yahoo Finance uses a different convention:
 *   - US tickers: no suffix (SPY.US → SPY)
 *   - LSE tickers: .L suffix (VWRL.LSE → VWRL.L)
 *   - Swiss SIX tickers: .SW suffix unchanged (CHDVD.SW → CHDVD.SW)
 *
 * Keep this module tiny: two pure functions, one mapping table, no regex chains.
 */

/** Maps project exchange codes to Yahoo suffix.
 * Empty string means the Yahoo symbol has no exchange suffix. */
export const EXCHANGE_TO_YAHOO: Record<string, string> = {
  US: '',
  LSE: 'L',
  SW: 'SW',
}

/** Inverse: maps Yahoo suffixes back to project exchange codes. */
export const YAHOO_TO_EXCHANGE: Record<string, string> = {
  '': 'US',
  L: 'LSE',
  SW: 'SW',
}

/**
 * Translates a project ticker to a Yahoo Finance symbol.
 *
 * @example
 * toYahooSymbol('SPY.US')   // 'SPY'
 * toYahooSymbol('VWRL.LSE') // 'VWRL.L'
 * toYahooSymbol('CHDVD.SW') // 'CHDVD.SW'
 *
 * @throws Error if ticker has no dot (i.e. no exchange suffix)
 */
export function toYahooSymbol(ticker: string): string {
  const lastDot = ticker.lastIndexOf('.')
  if (lastDot === -1) {
    throw new Error('symbol-map: ticker must be SYMBOL.EXCHANGE')
  }

  const symbol = ticker.slice(0, lastDot)
  const exchange = ticker.slice(lastDot + 1)

  if (!(exchange in EXCHANGE_TO_YAHOO)) {
    // Unknown exchange — pass through as-is (future-proofs new exchanges)
    return ticker
  }

  const yahooSuffix = EXCHANGE_TO_YAHOO[exchange]
  return yahooSuffix === '' ? symbol : `${symbol}.${yahooSuffix}`
}

/**
 * Translates a Yahoo Finance symbol back to a project ticker.
 *
 * @example
 * fromYahooSymbol('SPY')    // 'SPY.US'
 * fromYahooSymbol('VWRL.L') // 'VWRL.LSE'
 * fromYahooSymbol('CHDVD.SW') // 'CHDVD.SW'
 */
export function fromYahooSymbol(yahoo: string): string {
  const lastDot = yahoo.lastIndexOf('.')
  if (lastDot === -1) {
    // No suffix → US market
    return `${yahoo}.US`
  }

  const symbol = yahoo.slice(0, lastDot)
  const yahooSuffix = yahoo.slice(lastDot + 1)

  if (!(yahooSuffix in YAHOO_TO_EXCHANGE)) {
    // Unknown Yahoo suffix — return as-is (defensive)
    return yahoo
  }

  const exchange = YAHOO_TO_EXCHANGE[yahooSuffix]
  return `${symbol}.${exchange}`
}
