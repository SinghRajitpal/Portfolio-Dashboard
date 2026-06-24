---
phase: 05-backtesting-engine
plan: 02
subsystem: backtesting-engine
tags: [pure-libs, simulation, metrics, tdd, drip, fx, rebalance, sharpe]

requires:
  - phase: 05-backtesting-engine
    plan: 01
    why: "Imports BacktestInput/Output/Metrics/Warning + InstrumentInput + PriceRow/DividendRow/FxRateRow/SnbRateRow from types.ts; uses BacktestError + isBacktestError from errors.ts; uses the test-stub reservations created in Plan 01"
provides:
  - "Plan 05-03 (parallel wave 2) — exports SnbRateRow consumer shape; no direct file dependency on Plan 03 yet"
  - "Plan 05-04 (worker + charts) imports simulate, hashInputs, computeMetrics — full deterministic engine ready behind Web-Worker safe surface"
  - "Plan 05-05 (API routes) imports hashInputs for backtest_runs.inputs_hash dedup column"
  - "Plan 05-06 (UI) consumes BacktestWarning union including the new 'rebalance' kind"
affects:
  - "Extended BacktestWarning union in types.ts with 'rebalance' kind — downstream UI footer + tests gain an audit event"

tech-stack:
  added: []
  patterns:
    - "Pure-fn loop+accumulator from compute-metrics.ts (Phase 4) applied to simulate.ts"
    - "ISO YYYY-MM-DD lexicographic-sort pattern from cache-prices.ts:48 reused in date-grid + forward-fill"
    - "Discriminated BacktestError return-or-success pattern from Plan 05-01"
    - "Web-Crypto SHA-256 via crypto.subtle.digest (works in worker + Node 20+)"

key-files:
  created:
    - src/lib/backtest/date-grid.ts
    - src/lib/backtest/forward-fill.ts
    - src/lib/backtest/inputs-hash.ts
    - src/lib/backtest/metrics.ts
    - src/lib/backtest/simulate.ts
  modified:
    - src/lib/backtest/types.ts  # extended BacktestWarning.kind with 'rebalance'
    - src/lib/backtest/date-grid.test.ts  # it.todo → real assertions
    - src/lib/backtest/forward-fill.test.ts
    - src/lib/backtest/inputs-hash.test.ts
    - src/lib/backtest/metrics.test.ts
    - src/lib/backtest/simulate.test.ts
    - src/lib/backtest/simulate.golden.test.ts

decisions:
  - "Extended BacktestWarning.kind with 'rebalance' so the engine emits an audit event on every fired rebalance — chosen over invisible counters so the UI footer and tests can both observe the cadence"
  - "Boundary-rebalance semantic: a boundary fires only if it falls within the user-requested [start, end] window, not the truncated grid window. This avoids spurious rebalances when the grid pre-dates start due to mixed-instrument first_dates"
  - "DRIP share math: shares += currentShares × amount / adjusted_close (the FX-to-CHF and back cancels out for share-count reinvestment)"
  - "Initial allocation skipped for instruments with no CHF price at the effective start (emits a forward_fill warning with count=0 as a sentinel)"

metrics:
  duration: ~50 minutes
  completed: 2026-06-24

key-decisions:
  - "Rebalance audit emitted as BacktestWarning kind='rebalance' — single union extension keeps downstream type contracts stable"
---

# Phase 5 Plan 02: Pure Backtest Engine Core Summary

One-liner: Shipped the deterministic pure-function backtest core — date-grid, forward-fill, SHA-256 inputs-hash, 5-stat metrics with SNB-based Sharpe, and the simulation loop with point-in-time FX + DRIP toggle + boundary-aware rebalance — 27/27 tests green via strict RED → GREEN TDD.

## What Was Done

### Task 1 — date-grid + forward-fill + inputs-hash (RED commit `590e625`, GREEN commit `988db9b`)

- **RED:** Converted 11 `it.todo` reservations across three test files to real `expect()` assertions covering: union dedup, range filter, lex sort, single-gap fill, multi-day-gap fillCount, pre-inception skip, canonicalize key-reorder identity, hash key-reorder identity, value-change divergence, recursive nested key sort, array order preservation. Confirmed `npx vitest run` failed with module-not-found.
- **GREEN — `src/lib/backtest/date-grid.ts`:** Single-pass Set-based union of `prices.date ∪ fxRates.date`, range-filtered with lexicographic ISO compare (`d >= startDate && d <= endDate`), then `[...set].sort()`. Zero dep.
- **GREEN — `src/lib/backtest/forward-fill.ts`:** Sort rows by date, build a `Map<date, value>` lookup, walk the grid maintaining a `lastValue`. Pre-inception dates are absent from the output Map; `firstDate` captures the earliest real (non-filled) value; `fillCount` increments per filled day.
- **GREEN — `src/lib/backtest/inputs-hash.ts`:** Implements RESEARCH Pattern 5 verbatim. `canonicalize()` is a 12-line recursive sorted-keys JSON stringifier (arrays preserve order). `hashInputs()` uses `crypto.subtle.digest('SHA-256', ...)` which is available in Web Workers, browsers, and Node 20+. Zero external dep.

13/13 tests green at end of Task 1.

### Task 2 — metrics + simulate + golden-master test (RED commit `65c89de`, GREEN commit `ea6fd95`)

- **RED:** Converted 12 `it.todo` reservations across `metrics.test.ts`, `simulate.test.ts`, and `simulate.golden.test.ts` to real assertions:
  - **metrics (6 tests):** total return (end-start)/start; CAGR matches hand-computed `Math.pow(2, 365.25/days)-1` to 4 places (≈0.1487 for 5-year doubling); MDD `[100,120,90,110]` → `-0.25` with peak=index1, trough=index2; Sharpe ≈ 0 when daily return matches the SNB daily rate exactly; Sharpe NaN-guard on flat curve; vol = stdev × √252.
  - **simulate (7 tests):** FX point-in-time CHF curve diverges from naïve spot by > 1000 CHF in a window where USD/CHF moves 0.95 → 1.05; DRIP on with $1 dividend on 100 shares ends at 10100 CHF vs DRIP off ending at 10000 (matches the share-reinvestment formula); annual rebalance with Jan-1-Saturday-2022 fires exactly once on 2022-01-03; quarterly rebalance fires 4 events at 2022-01-03/04-01/07-01/10-03 in a 12-month window; `rebalance='none'` fires 0; per-instrument 3-day gap surfaces a `forward_fill` warning with `count=3`; instruments with `first_date > end` return `BacktestError` kind `no_overlap`.
  - **golden (1 test):** Reads `tests/fixtures/backtest/golden-portfolio.json`, calls `simulate(fixture.input)`, asserts each equity point matches expected with `toBeCloseTo(_, 6)`. The hand-computed fixture curve is `[10000, 10100, 10130, 10250, 10200]`.
- **GREEN — `src/lib/backtest/metrics.ts`:** Implements all 5 metrics. CAGR uses exact-day basis with `(new Date(endDate) - new Date(startDate)) / 86400000` and 365.25 (D-18). MDD walks the curve tracking `runningMax` and the date achieving it; the peak date returned is whichever runningMax was active at the time of the min drawdown (not the global peak). Sharpe builds per-equity-month SNB lookup with most-recent-≤ semantics, computes `snbDaily = (1+snbAnnual)^(1/252) - 1`, excess = dailyReturn - snbDaily, then `mean(excess)/stdev(excess) × √252` with explicit `stdev>0` guard returning 0 (no NaN, D-19).
- **GREEN — `src/lib/backtest/simulate.ts`:** Full simulation per RESEARCH §Architecture + §Pitfalls. Steps: (1) union grid; (2) truncate to `max(start, max(first_date))` with `truncated_start` warning; (3) per-instrument forward-fill with per-instrument warnings; (4) FX lookup with ≤4-day calendar lookback (Pitfall 5); (5) initial allocation = `(investmentAmount × weight%) / chf_price[start]`; (6) daily loop applies DRIP (`shares += currentShares × amount / adjusted_close`), then rebalance (snap each instrument's CHF value to `total × weight%`), then snapshot CHF total to the equity curve; (7) benchmark runs as a parallel 1-instrument sub-portfolio (D-23); (8) annualBars built per calendar year for portfolio + benchmark. `BacktestError` returned for `no_overlap`.
- **types.ts:** Extended `BacktestWarning.kind` with `'rebalance'` so the engine can emit one audit event per fired rebalance. UI footer (Plan 05-06) and the rebalance-cadence tests both rely on this.

27/27 tests green at end of Task 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Extended `BacktestWarning.kind` with `'rebalance'`**

- **Found during:** Task 2 RED phase, writing the rebalance-cadence assertions.
- **Issue:** The plan's `<behavior>` block requires assertions of the form "assert via emitted rebalance audit warnings or by counting post-rebalance weight-snap events in the returned warnings array." The Plan 01 `BacktestWarning` union had no `'rebalance'` kind — there was no way to emit a rebalance audit event under the existing typeshape.
- **Fix:** Added `'rebalance'` to the kind union in `src/lib/backtest/types.ts`. This file is wholly within `src/lib/backtest/` (the boundary I own) and Plan 03 does not touch the warning union (it only touches `SnbRateRow`).
- **Files modified:** `src/lib/backtest/types.ts`.
- **Commit:** `ea6fd95` (the GREEN-task-2 commit).

**2. [Rule 1 - Bug] Boundary-rebalance must filter against requested window, not grid window**

- **Found during:** First GREEN run after Task 2 implementation — the annual-Saturday test got 2 rebalance warnings instead of 1.
- **Issue:** Initial implementation iterated calendar boundaries `firstYear..lastYear` from the grid endpoints. For the annual test with `start=2021-12-29`, the grid starts in 2021 → the Jan-1-2021 boundary "first-on-or-after" trivially maps to 2021-12-29 (the grid's first day), producing a spurious rebalance.
- **Fix:** Compute boundary candidates from `firstYear..lastYear` derived from the user-requested `[start, end]` window and require each boundary `Y-M-01` to satisfy `boundary >= input.start && boundary <= input.end` before mapping it to the first grid day on/after. For the annual test this restricts boundaries to `2022-01-01` only → 1 event. For the quarterly test it correctly admits all 4 boundaries in 2022.
- **Files modified:** `src/lib/backtest/simulate.ts` (`computeRebalanceDates`).
- **Commit:** Folded into `ea6fd95`.

No other deviations.

## Authentication Gates

None. This plan is pure libraries — no Supabase, no network, no env vars.

## Verification Results

- `npx vitest run src/lib/backtest/ --reporter=basic` → **27 passed across 6 files** (4 + 4 + 5 + 6 + 7 + 1).
- `npx tsc --noEmit` → exits 0, no output.
- `npx eslint src/lib/backtest/ --max-warnings=0` → exits 0, no output.
- `grep -c "it.todo" src/lib/backtest/*.test.ts` → 0 in every file.
- `grep -E "from ['\"](next|@supabase|react)" src/lib/backtest/*.ts` → no matches in production modules.
- `grep -E "decimal\.js|date-fns|dayjs|simple-statistics" src/lib/backtest/*.ts` → only docstring mentions (no real imports).

## Golden-Master Tolerance

The golden fixture's expected equity `[10000, 10100, 10130, 10250, 10200]` matches the engine's output exactly to `toBeCloseTo(_, 6)` — the hand-built FX-flat / DRIP-off / rebalance-none scenario hits the engine's arithmetic with no floating-point amplification.

## Known Stubs

None. All test files now have real assertions; all `it.todo` reservations have been converted.

## Threat Surface Notes

Threats per plan's `<threat_model>`:
- **T-5-02-DOS** (DoS via huge date range) — accepted-as-mitigated: the pure lib trusts the caller (Plan 05-05's API route will cap `end - start ≤ 25 years`).
- **T-5-02-NAN** (divide-by-zero) — mitigated: Sharpe explicitly guards `stdev=0` (returns 0); vol on a 1-point curve returns 0 (no division); CAGR guards `start ≤ 0` returning `NaN` with an inline comment.
- **T-5-02-HASH** (collision) — accepted (SHA-256).
- **T-5-02-FX** (stale FX via lookback > 4 days) — mitigated: FX lookup hard-skips beyond 4 days (the relevant instrument becomes priceless → contributes 0 to the CHF total). [Plan 05-05 will translate "instrument went priceless mid-window" into a `BacktestError` data_gap; this plan only ensures the simulator never silently returns NaN.]

No new threat flags beyond the plan's existing register.

## Self-Check: PASSED

- `src/lib/backtest/date-grid.ts` — present, exports `buildUnionDateGrid`
- `src/lib/backtest/forward-fill.ts` — present, exports `forwardFillSeries`
- `src/lib/backtest/inputs-hash.ts` — present, exports `canonicalize` + async `hashInputs`
- `src/lib/backtest/metrics.ts` — present, exports `computeMetrics` returning all 7 `BacktestMetrics` fields
- `src/lib/backtest/simulate.ts` — present, exports `simulate(input: BacktestInput): SimulateResult | BacktestError`
- Commits `590e625` / `988db9b` / `65c89de` / `ea6fd95` — all present in `git log --oneline`
- `npx vitest run src/lib/backtest/` — 27/27 passed
- `npx tsc --noEmit` — clean
- `npx eslint src/lib/backtest/ --max-warnings=0` — clean
- No banned imports / banned libraries in production modules
- No remaining `it.todo` reservations in any backtest test file
