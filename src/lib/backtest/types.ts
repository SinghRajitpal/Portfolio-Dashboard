/**
 * Shared type contracts for the backtest engine.
 *
 * Every type here is consumed by at least one downstream Plan 5.0X module —
 * the worker, the API routes, the pure simulate/metrics libraries, the
 * lightweight-charts wrappers, and the run-history drawer. Keep the surface
 * here as the single source of truth.
 *
 * Conventions:
 *   * All dates are ISO `YYYY-MM-DD` strings (worker payloads serialize cleanly).
 *   * All numeric fields are plain `number` (decimal.js was rejected — see RESEARCH).
 *   * Discriminated unions for worker RPC are tagged with `kind`.
 *   * Currency is always CHF for portfolio-level outputs (engine converts internally).
 *
 * See:
 *   * .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-13..D-22)
 *   * .planning/phases/05-backtesting-engine/05-PATTERNS.md (§types.ts)
 */
import type { BacktestError } from './errors'

// Re-export for downstream convenience so consumers can `import { BacktestError, BacktestInput, ... } from '@/lib/backtest/types'`.
export type { BacktestError } from './errors'
export { isBacktestError } from './errors'

// ── Row-shaped inputs (mirror DB column types after numeric coercion) ─────────

/** A single instrument participating in the backtest. */
export type InstrumentInput = {
  id: string
  ticker: string
  currency: string
  /** Percent 0-100 (matches `portfolio_instruments.weight` DB convention). */
  weight: number
  /** Earliest cached trading day for this instrument; null if unseeded. */
  first_date: string | null
}

/** Minimal price row used by the worker. Distinct from data/types.ts PriceRow
 *  (which also carries open/high/low/volume). Worker only consumes close +
 *  adjusted_close so we keep the shape tight to minimize postMessage cost. */
export type PriceRow = {
  instrument_id: string
  date: string
  adjusted_close: number
  close: number
}

export type DividendRow = {
  instrument_id: string
  ex_date: string
  amount: number
  currency: string
}

/** FX rate row. Base currency is always CHF (consumer computes the reciprocal
 *  to convert from a foreign currency back to CHF). */
export type FxRateRow = {
  quote_currency: string
  date: string
  rate: number
}

/** SNB CHF policy-rate row (monthly granularity per D-19). */
export type SnbRateRow = {
  date_month: string
  rate: number
  source: 'LZ' | 'libor_mid'
}

// ── Parameters and inputs ─────────────────────────────────────────────────────

export type RebalanceFrequency = 'none' | 'annual' | 'semi-annual' | 'quarterly'

/** User-controlled parameters (the contents of the setup bar). */
export type BacktestParams = {
  portfolio_id: string
  /** ISO YYYY-MM-DD inclusive. */
  start: string
  /** ISO YYYY-MM-DD inclusive. */
  end: string
  drip: boolean
  rebalance: RebalanceFrequency
  /** Curated benchmark ticker, or null for "None". */
  benchmark_ticker: string | null
}

/** Full payload passed to the worker. The worker treats this as immutable. */
export type BacktestInput = BacktestParams & {
  instruments: InstrumentInput[]
  prices: PriceRow[]
  dividends: DividendRow[]
  fxRates: FxRateRow[]
  snbRates: SnbRateRow[]
  /** Investment amount in CHF (mirrors portfolios.investment_amount). */
  investmentAmount: number
}

// ── Outputs ───────────────────────────────────────────────────────────────────

export type EquityPoint = {
  date: string
  value: number
}

export type AnnualBar = {
  year: number
  portfolio: number
  benchmark: number | null
}

export type BacktestMetrics = {
  totalReturn: number
  cagr: number
  /** Negative number, e.g., -0.25 for a 25% drawdown. */
  maxDrawdown: number
  mddPeakDate: string
  mddTroughDate: string
  sharpe: number
  vol: number
}

/** Soft warnings that don't fail the run but should surface in the footer.
 *
 * `rebalance` is an audit event — every time the engine fires a rebalance
 * (first trading day on/after a calendar boundary per D-16) it emits one
 * warning. The UI shows the count in the footer; tests assert ordering. */
export type BacktestWarning = {
  kind:
    | 'forward_fill'
    | 'truncated_start'
    | 'drip_on_filled'
    | 'snb_stitch'
    | 'fx_lookback'
    | 'rebalance'
  message: string
  instrument_id?: string
  count?: number
}

export type BacktestOutput = {
  equity: EquityPoint[]
  benchmarkEquity: EquityPoint[] | null
  annualBars: AnnualBar[]
  metrics: BacktestMetrics
  warnings: BacktestWarning[]
  /** Snapshot of MAX(updated_at) across instruments at fetch time (D-09). */
  pricesVersion: number
}

// ── Worker RPC (postMessage payloads) ─────────────────────────────────────────

export type WorkerRequest = {
  kind: 'run'
  payload: BacktestInput
}

export type WorkerResponse =
  | { kind: 'done'; result: BacktestOutput; inputsHash: string }
  | { kind: 'error'; error: BacktestError }
  | { kind: 'progress'; percent: number }

// ── DB row mirror ─────────────────────────────────────────────────────────────

/** Mirrors public.backtest_runs columns post-numeric-coercion. */
export type RunRow = {
  id: string
  user_id: string
  portfolio_id: string
  inputs_hash: string
  params_json: BacktestParams
  equity_curve_json: EquityPoint[]
  annual_bars_json: AnnualBar[]
  metrics_json: BacktestMetrics
  warnings_json: BacktestWarning[]
  prices_version: number
  computed_at: string
}
