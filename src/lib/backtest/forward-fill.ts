/**
 * Forward-fill a sparse value series across a dense date grid (D-14).
 *
 * Walks the grid in order. For each grid date:
 *   - if a row exists, use its value and remember it as `lastValue`.
 *   - if no row but a `lastValue` is known, fill with it and bump fillCount.
 *   - if no row and no prior value (pre-inception), skip silently — the
 *     date is absent from the returned Map. Callers (simulate.ts) treat
 *     absence as "instrument not yet listed; contribute nothing".
 *
 * `fillCount` is what gets surfaced to the UI footer as a BacktestWarning
 * (`kind: 'forward_fill', count: N`) per D-14.
 *
 * Pure function: no side effects, no I/O.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-14)
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md Pitfalls 3 & 7
 *   - 05-PATTERNS.md §forward-fill
 */

export function forwardFillSeries(args: {
  grid: string[]
  rows: { date: string; value: number }[]
}): { values: Map<string, number>; fillCount: number; firstDate: string | null } {
  const { grid, rows } = args

  // Build a date → value lookup for O(1) per-grid-date access. Defensive
  // sort guards against unordered input — same pattern as cache-prices.ts:48.
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const lookup = new Map<string, number>()
  for (const r of sorted) lookup.set(r.date, r.value)

  const values = new Map<string, number>()
  let lastValue: number | null = null
  let fillCount = 0
  let firstDate: string | null = null

  for (const d of grid) {
    const real = lookup.get(d)
    if (real !== undefined) {
      lastValue = real
      values.set(d, real)
      if (firstDate === null) firstDate = d
    } else if (lastValue !== null) {
      values.set(d, lastValue)
      fillCount++
    }
    // else: pre-inception — leave absent.
  }

  return { values, fillCount, firstDate }
}
