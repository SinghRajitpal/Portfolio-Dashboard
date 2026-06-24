/**
 * Discriminated union error contract for the backtest engine.
 *
 * Sibling to `src/lib/data/errors.ts` (DataError) — data-layer concerns
 * stay there; simulation-layer concerns live here. Engine functions
 * return `result | BacktestError` so callers can pattern-match on `kind`
 * and render targeted UI (e.g., "MSCI World benchmark history starts
 * 2008-03-25 — adjust the start date" for `insufficient_history`).
 *
 * See also: .planning/phases/05-backtesting-engine/05-CONTEXT.md
 */
export type BacktestError =
  | { kind: 'no_overlap'; message: string }
  | { kind: 'insufficient_history'; message: string; minStart: string }
  | { kind: 'benchmark_unavailable'; message: string; ticker: string }
  | { kind: 'data_gap'; message: string; ticker: string; gapDays: number }
  | { kind: 'unknown'; message: string }

const VALID_KINDS = new Set<string>([
  'no_overlap',
  'insufficient_history',
  'benchmark_unavailable',
  'data_gap',
  'unknown',
])

export function isBacktestError(v: unknown): v is BacktestError {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'kind' in v &&
    VALID_KINDS.has((v as { kind: unknown }).kind as string)
  )
}
