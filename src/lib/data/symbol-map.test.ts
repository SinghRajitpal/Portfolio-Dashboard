/**
 * symbol-map unit tests.
 *
 * Covers every v1 ticker from src/scripts/seed-instruments.ts.
 * Uses parametric it.each so adding tickers is a one-line change.
 */
import { describe, it, expect } from 'vitest'
import { toYahooSymbol, fromYahooSymbol } from './symbol-map'

// ── v1 ticker → expected Yahoo symbol ────────────────────────────────────────

const TO_YAHOO_CASES: [ticker: string, yahoo: string][] = [
  // .US — strip suffix (Yahoo defaults to US market)
  ['SPY.US',    'SPY'],
  ['AGG.US',    'AGG'],
  ['VTI.US',    'VTI'],
  ['BND.US',    'BND'],
  ['GLD.US',    'GLD'],
  ['QQQ.US',    'QQQ'],
  ['EEM.US',    'EEM'],
  // .LSE → .L (LSE-listed ETFs)
  ['VWRL.LSE',  'VWRL.L'],
  ['IWDA.LSE',  'IWDA.L'],
  // .SW → .SW (Swiss SIX unchanged)
  ['CSSPX.SW',  'CSSPX.SW'],
  ['500E.SW',   '500E.SW'],
  ['CHDVD.SW',  'CHDVD.SW'],
  ['IQQA.SW',   'IQQA.SW'],
  ['NOVN.SW',   'NOVN.SW'],
]

// ── v1 ticker Yahoo symbol → expected project ticker (inverse) ───────────────

const FROM_YAHOO_CASES: [yahoo: string, ticker: string][] = [
  // No suffix → .US
  ['SPY',       'SPY.US'],
  ['AGG',       'AGG.US'],
  ['VTI',       'VTI.US'],
  ['BND',       'BND.US'],
  ['GLD',       'GLD.US'],
  ['QQQ',       'QQQ.US'],
  ['EEM',       'EEM.US'],
  // .L → .LSE
  ['VWRL.L',    'VWRL.LSE'],
  ['IWDA.L',    'IWDA.LSE'],
  // .SW → .SW
  ['CSSPX.SW',  'CSSPX.SW'],
  ['500E.SW',   '500E.SW'],
  ['CHDVD.SW',  'CHDVD.SW'],
  ['IQQA.SW',   'IQQA.SW'],
  ['NOVN.SW',   'NOVN.SW'],
]

describe('toYahooSymbol', () => {
  it.each(TO_YAHOO_CASES)('%s → %s', (ticker, expected) => {
    expect(toYahooSymbol(ticker)).toBe(expected)
  })

  it('throws when no exchange suffix is present', () => {
    expect(() => toYahooSymbol('NOEXCHANGE')).toThrow('symbol-map: ticker must be SYMBOL.EXCHANGE')
  })
})

describe('fromYahooSymbol', () => {
  it.each(FROM_YAHOO_CASES)('%s → %s', (yahoo, expected) => {
    expect(fromYahooSymbol(yahoo)).toBe(expected)
  })
})

describe('round-trip', () => {
  it.each(TO_YAHOO_CASES.map(([t]) => t))('%s round-trips via toYahooSymbol → fromYahooSymbol', (ticker) => {
    expect(fromYahooSymbol(toYahooSymbol(ticker))).toBe(ticker)
  })
})
