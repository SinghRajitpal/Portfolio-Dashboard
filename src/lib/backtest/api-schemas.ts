/**
 * Zod schemas for the backtest HTTP API surface.
 *
 * Three endpoints share these schemas:
 *   * POST /api/backtest/data — batch fetch (CONTEXT D-07)
 *   * POST /api/backtest/runs — write run, dedupe on inputs_hash (D-08)
 *   * GET  /api/backtest/runs/[id] — single-run reload + stale flag (D-09)
 *
 * The whitelist is the security backbone for the data endpoint: an arbitrary
 * `benchmark_ticker` would otherwise be a tampering / SSRF / DoS-via-seed
 * vector. We pin the field to the D-22 curated set so the route only ever
 * queries pre-seeded instruments. See `<threat_model>` in 05-04-PLAN.md.
 *
 * Cite:
 *   * .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-07, D-08, D-22)
 *   * .planning/phases/05-backtesting-engine/05-RESEARCH.md (§Security Domain)
 */
import { z } from 'zod'

/**
 * D-22 benchmark candidates pre-seeded by Plan 05-01.
 *
 * The UI exposes the four logical benchmarks (MSCI World, MSCI ACWI, S&P 500,
 * SMI) and picks the listing with the longest cached history for each. Plan
 * 05-01 verified all six tickers have ≥10y coverage; the executor that wires
 * the UI dropdown (Plan 05-06) picks SWDA.LSE for MSCI World per the audit.
 *
 * Treat this as a frozen, ordered tuple — z.enum() reads it positionally.
 */
export const BENCHMARK_TICKER_WHITELIST = [
  'URTH.US',
  'SWDA.LSE',
  'SSAC.SW',
  'ACWI.US',
  'SPY.US',
  'CSSMI.SW',
] as const

export type BenchmarkTicker = (typeof BENCHMARK_TICKER_WHITELIST)[number]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SHA256_HEX = /^[0-9a-f]{64}$/

/**
 * Exact-day basis between two ISO-YYYY-MM-DD strings, expressed in years.
 * Uses 365.25 to match the CAGR convention in CONTEXT D-18.
 */
export function yearsBetween(start: string, end: string): number {
  const a = Date.parse(start)
  const b = Date.parse(end)
  return (b - a) / (365.25 * 86_400_000)
}

/**
 * POST /api/backtest/data body schema.
 *
 * Refinements:
 *   - start <= end (caller mistake guard)
 *   - end - start <= 25 years (DoS mitigation — T-5-04-DOS in the threat
 *     register; 25y comfortably exceeds the D-22 SWDA.LSE coverage but caps
 *     the DB scan at ~6.5K rows × N instruments).
 *   - benchmark_ticker constrained to the curated whitelist (T-5-04-SSRF).
 */
export const BacktestDataRequestSchema = z
  .object({
    portfolio_id: z.string().uuid(),
    benchmark_ticker: z.enum(BENCHMARK_TICKER_WHITELIST).nullable(),
    start: z.string().regex(ISO_DATE, 'start must be YYYY-MM-DD'),
    end: z.string().regex(ISO_DATE, 'end must be YYYY-MM-DD'),
  })
  .refine((v) => v.start <= v.end, {
    message: 'start must be on or before end',
    path: ['start'],
  })
  .refine((v) => yearsBetween(v.start, v.end) <= 25, {
    message: 'date range exceeds 25 years (DoS mitigation)',
    path: ['end'],
  })

export type BacktestDataRequest = z.infer<typeof BacktestDataRequestSchema>

// ── BacktestRunWriteSchema ───────────────────────────────────────────────────

const RebalanceFrequency = z.enum(['none', 'annual', 'semi-annual', 'quarterly'])

/**
 * BacktestParams shape mirrors `src/lib/backtest/types.ts BacktestParams`.
 * Kept in sync by hand (TypeScript types don't auto-generate zod schemas in
 * this codebase). If the type changes, this schema must too.
 */
const BacktestParamsSchema = z.object({
  portfolio_id: z.string().uuid(),
  start: z.string().regex(ISO_DATE),
  end: z.string().regex(ISO_DATE),
  drip: z.boolean(),
  rebalance: RebalanceFrequency,
  benchmark_ticker: z.enum(BENCHMARK_TICKER_WHITELIST).nullable(),
})

const EquityPointSchema = z.object({
  date: z.string().regex(ISO_DATE),
  value: z.number(),
})

const AnnualBarSchema = z.object({
  year: z.number().int(),
  portfolio: z.number(),
  benchmark: z.number().nullable(),
})

const BacktestMetricsSchema = z.object({
  totalReturn: z.number(),
  cagr: z.number(),
  maxDrawdown: z.number(),
  mddPeakDate: z.string().regex(ISO_DATE),
  mddTroughDate: z.string().regex(ISO_DATE),
  sharpe: z.number(),
  vol: z.number(),
})

const BacktestWarningSchema = z.object({
  kind: z.enum([
    'forward_fill',
    'truncated_start',
    'drip_on_filled',
    'snb_stitch',
    'fx_lookback',
    'rebalance',
  ]),
  message: z.string(),
  instrument_id: z.string().optional(),
  count: z.number().optional(),
})

const BacktestOutputSchema = z.object({
  equity: z.array(EquityPointSchema),
  benchmarkEquity: z.array(EquityPointSchema).nullable(),
  annualBars: z.array(AnnualBarSchema),
  metrics: BacktestMetricsSchema,
  warnings: z.array(BacktestWarningSchema),
  pricesVersion: z.number().int().nonnegative(),
})

/**
 * POST /api/backtest/runs body schema.
 *
 * `inputsHash` MUST match the worker-computed SHA-256 hex (64 lowercase
 * chars). The route trusts the client to hash deterministically — the
 * server-side dedup UNIQUE(portfolio_id, inputs_hash) is the defence in
 * depth if the client misbehaves.
 */
export const BacktestRunWriteSchema = z.object({
  portfolio_id: z.string().uuid(),
  params: BacktestParamsSchema,
  inputsHash: z.string().regex(SHA256_HEX, 'inputsHash must be 64 lowercase hex chars'),
  pricesVersion: z.number().int().nonnegative(),
  output: BacktestOutputSchema,
})

export type BacktestRunWrite = z.infer<typeof BacktestRunWriteSchema>
