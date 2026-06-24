/**
 * Union date grid for the backtest engine (D-13).
 *
 * The simulation loop walks a single, deduplicated, sorted list of ISO
 * date strings ("YYYY-MM-DD") that spans every calendar where input data
 * exists — portfolio instruments' trading days plus the FX series'
 * publication days. Forward-fill (see forward-fill.ts, D-14) handles
 * per-instrument gaps inside this grid.
 *
 * Per RESEARCH "Don't Hand-Roll" (§Date math): no date-fns / dayjs.
 * ISO strings sort lexicographically === chronologically, and the
 * ≤ / ≥ comparisons used here for range filtering are well-defined.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-13)
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md (§Architecture, §Don't Hand-Roll)
 *   - src/lib/data/cache-prices.ts line 48 (canonical ISO date sort pattern)
 */
import type { PriceRow, FxRateRow } from './types'

/**
 * Build the union of trading days across price rows + FX rate rows,
 * deduplicated, filtered to [startDate, endDate] inclusive, sorted
 * lexicographically (which equals chronologically for ISO YYYY-MM-DD).
 *
 * Pure function: no side effects, no I/O.
 *
 * @example
 *   buildUnionDateGrid({
 *     prices: [{ instrument_id:'a', date:'2020-01-02', close:1, adjusted_close:1 }],
 *     fxRates: [{ quote_currency:'USD', date:'2020-01-04', rate:1 }],
 *     startDate: '2020-01-01',
 *     endDate: '2020-01-31',
 *   })
 *   // → ['2020-01-02', '2020-01-04']
 */
export function buildUnionDateGrid(args: {
  prices: PriceRow[]
  fxRates: FxRateRow[]
  startDate: string
  endDate: string
}): string[] {
  const { prices, fxRates, startDate, endDate } = args

  // Single-pass collection into a Set — O(n) where n = total row count.
  const set = new Set<string>()
  for (const p of prices) {
    if (p.date >= startDate && p.date <= endDate) set.add(p.date)
  }
  for (const f of fxRates) {
    if (f.date >= startDate && f.date <= endDate) set.add(f.date)
  }

  // Array#sort with default lexicographic order is correct for ISO strings.
  return [...set].sort()
}
