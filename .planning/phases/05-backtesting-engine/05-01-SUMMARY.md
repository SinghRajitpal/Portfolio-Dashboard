---
phase: 05-backtesting-engine
plan: 01
subsystem: backtesting-engine
tags: [scaffolding, migrations, schema, types, test-stubs, lightweight-charts, benchmark-seed]

requires:
  - phase: 03-market-data-pipeline
    why: "instruments, prices, dividends, fx_rates already cached; YahooProvider used for benchmark seed-on-demand"
  - phase: 04-portfolio-builder
    why: "portfolios + portfolio_instruments are the FK targets for backtest_runs.portfolio_id"
provides:
  - "Plan 05-02 imports BacktestInput/Output/Metrics/Warning + RunRow + InstrumentInput from @/lib/backtest/types"
  - "Plan 05-02 imports BacktestError + isBacktestError from @/lib/backtest/errors"
  - "Plan 05-03 imports SnbRateRow from @/lib/backtest/types; writes against snb_rates table"
  - "Plan 05-04 imports lightweight-charts (v5 API) for EquityCurveChart + AnnualReturnsChart"
  - "Plan 05-05 inserts into and selects from the public.backtest_runs table"
  - "Plan 05-06 reads the SWDA.LSE canonical MSCI World ticker for the benchmark dropdown (Open Q1 resolution)"
  - "Quarterly /api/cron/refresh-snb cron entry is reserved in vercel.json — Plan 05-03 implements the route"
affects:
  - "Plans 05-02..05-07 can run in parallel because every test file and shared type they reference already exists"

tech-stack:
  added:
    - "lightweight-charts ^5.2.0 (TradingView, Apache-2.0)"
  patterns:
    - "Sibling discriminated-union error contract (BacktestError) mirroring DataError"
    - "Vitest stub discipline via it.todo (matches Phase 4 Wave 0 pattern)"
    - "Playwright stub discipline via test.skip"

key-files:
  created:
    - supabase/migrations/00009_backtest_runs.sql
    - supabase/migrations/00010_snb_rates.sql
    - src/lib/backtest/types.ts
    - src/lib/backtest/errors.ts
    - src/lib/backtest/simulate.test.ts
    - src/lib/backtest/metrics.test.ts
    - src/lib/backtest/forward-fill.test.ts
    - src/lib/backtest/inputs-hash.test.ts
    - src/lib/backtest/date-grid.test.ts
    - src/lib/backtest/simulate.golden.test.ts
    - src/lib/data/snb.test.ts
    - tests/integration/backtest-happy.spec.ts
    - tests/integration/backtest-chart.spec.ts
    - tests/integration/backtest-benchmark.spec.ts
    - tests/integration/backtest-annual-bars.spec.ts
    - tests/integration/backtest-runs.spec.ts
    - tests/integration/backtest-stale.spec.ts
    - tests/fixtures/snb/snboffzisa-snapshot.json
    - tests/fixtures/backtest/golden-portfolio.json
    - src/scripts/audit-benchmark-history.ts
  modified:
    - package.json (added lightweight-charts dep + audit:benchmarks script)
    - package-lock.json (npm install lockfile)
    - vercel.json (added refresh-snb cron entry)

decisions:
  - "Use Yahoo Finance (not Stooq) as the seed provider for the audit script — Stooq currently returns an anti-bot JavaScript-challenge HTML page for every request"
  - "Resolve Open Question 1: SWDA.LSE wins the MSCI World canonical pick (first_date=2010-01-04 vs URTH.US first_date=2012-01-12)"
  - "Store the SNB risk-free rate in a dedicated snb_rates table (not as a JSONB column on fx_rates) — per CONTEXT D-19 alternative (a)"
  - "Omit the UPDATE policy on backtest_runs — runs are immutable; recompute writes a new row"
  - "Pre-write the BacktestWarning, AnnualBar, and WorkerResponse types now (not in Plan 05-02) so downstream parallel plans don't need to coordinate"

metrics:
  duration: ~50 minutes
  completed: 2026-06-24

key-decisions:
  - "Auto-fix: swap audit script's seed source from Stooq to YahooProvider (Rule 1) when Stooq returned anti-bot HTML for every CSV request"
---

# Phase 5 Plan 01: Scaffold Backtesting Engine Foundation Summary

One-liner: Wave 0 foundation — installed lightweight-charts, applied two migrations (backtest_runs + snb_rates) to the live DB, shipped the shared types/errors modules, stubbed 7 vitest + 6 playwright suites, captured offline fixtures, and seeded all five D-22 benchmark candidates to ≥10y coverage.

## What Was Done

### Task 1 (pre-approved checkpoint)
The user pre-approved the `lightweight-charts` legitimacy gate before the executor ran. Verified evidence (recorded in commit body): `github.com/tradingview/lightweight-charts` repo URL, Apache-2.0 license, ~150K weekly downloads, latest 5.2.0 (2026-04-24), blue-checkmark maintainer, no deprecation notice.

### Task 2 — Install lightweight-charts, write both migrations, push schema, register cron (commit `dd596ba`)
- Installed `lightweight-charts@^5.2.0` (added 755 transitive packages — lightweight-charts pulled in fewer than 10 direct deps; the rest were existing npm pkgs not yet hydrated in this fresh worktree).
- Authored `supabase/migrations/00009_backtest_runs.sql`:
  - UUID PK, FKs to `profiles.id` and `portfolios.id` with `ON DELETE CASCADE`
  - `UNIQUE (portfolio_id, inputs_hash)` for D-08 dedup
  - `idx_backtest_runs_user_portfolio` for the run-history drawer query
  - RLS enabled; three policies (SELECT/INSERT/DELETE) gated on `(SELECT auth.uid()) = user_id`; no UPDATE policy
  - Header comment explains immutability rationale
- Authored `supabase/migrations/00010_snb_rates.sql`:
  - `date_month TEXT` keyed (monthly granularity per D-19)
  - `source TEXT CHECK (source IN ('LZ', 'libor_mid'))` for the 2019-06 regime stitch
  - RLS enabled; single authenticated-read SELECT policy (mirrors `fx_rates`); writes via service-role only
- Updated `vercel.json` to add `{ path: '/api/cron/refresh-snb', schedule: '0 22 1 */3 *' }`
- Applied both migrations to the live Supabase project via `supabase db push --db-url $DATABASE_URL`; verified both tables exist with a service-role `count` query

### Task 3 — Shared types + errors + test stubs + fixtures (commit `01f80a1`)
- `src/lib/backtest/errors.ts`: discriminated union (`BacktestError`) + `VALID_KINDS` Set + `isBacktestError` typeguard; five kinds: `no_overlap`, `insufficient_history`, `benchmark_unavailable`, `data_gap`, `unknown`. Mirrors `src/lib/data/errors.ts` verbatim.
- `src/lib/backtest/types.ts`: 15 named exports including `BacktestInput`, `BacktestOutput`, `BacktestParams`, `EquityPoint`, `BacktestMetrics`, `BacktestWarning`, `AnnualBar`, `WorkerRequest`, `WorkerResponse`, `RunRow`, `InstrumentInput`, `PriceRow`, `DividendRow`, `FxRateRow`, `SnbRateRow`. Re-exports `BacktestError` and `isBacktestError` for downstream convenience. All dates are ISO `YYYY-MM-DD` strings; all numeric fields are `number`.
- 7 vitest stub files (25 `it.todo` reservations) reserving the test names called out by 05-RESEARCH.md §Validation Architecture: simulate, metrics, forward-fill, inputs-hash, date-grid, simulate.golden, snb.
- 6 Playwright stub files (`test.skip`): backtest-happy (BACK-01), backtest-chart (BACK-05), backtest-benchmark (BACK-07), backtest-annual-bars (BACK-08), backtest-runs (D-08), backtest-stale (D-09).
- `tests/fixtures/snb/snboffzisa-snapshot.json`: SNB cube response shape with LZ, UG0, OG0, libor_mid series covering pre- and post-2019-06 dates.
- `tests/fixtures/backtest/golden-portfolio.json`: synthetic 3-instrument (CHF/USD/EUR) portfolio over 5 business days with flat 1:1 FX. Round-number prices produce a hand-checkable equity curve `[10000, 10100, 10130, 10250, 10200]` and `totalReturn = 0.02`.

Runner status: `npx vitest run src/lib/backtest/ src/lib/data/snb.test.ts` reports 7 skipped suites with 25 todos. `npx playwright test tests/integration/backtest-*.spec.ts --list` enumerates 6 specs. `npx tsc --noEmit` and `npm run lint` exit 0.

### Task 4 — Benchmark history audit + seed-on-demand (commit `c8c9d6c`)
- Authored `src/scripts/audit-benchmark-history.ts` exporting `runAudit()` (default export) for the five D-22 candidates: `URTH.US`, `SWDA.LSE`, `SSAC.SW`, `SPY.US`, `CSSMI.SW`.
- Added `npm run audit:benchmarks` to `package.json`.
- Ran the script against the live DB. End state:

  | Ticker    | first_date  | last_date   | Years | Status |
  | --------- | ----------- | ----------- | ----- | ------ |
  | URTH.US   | 2012-01-12  | 2026-06-23  | 14.4  | seeded (3631 rows + 31 dividends) |
  | SWDA.LSE  | 2010-01-04  | 2026-06-24  | 16.5  | seeded (4161 rows)                |
  | SSAC.SW   | 2011-10-21  | 2026-06-24  | 14.7  | seeded (3680 rows)                |
  | SPY.US    | 2010-01-04  | 2026-06-23  | 16.5  | seeded (4142 rows + 66 dividends) |
  | CSSMI.SW  | 2010-01-04  | 2026-06-24  | 16.5  | seeded (4138 rows + 101 dividends)|

- MSCI World canonical pick (D-22 Open Question 1 RESOLVED): **SWDA.LSE** (earliest first_date).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Swap audit-script seed source from Stooq to YahooProvider**

- **Found during:** Task 4 first run.
- **Issue:** Stooq's CSV endpoint at `https://stooq.com/q/d/l/` currently returns a 796-byte anti-bot HTML page (`<noscript>This site requires JavaScript to verify your browser`) for every request — verified with and without `apikey=$STOOQ_API_KEY`, with and without a browser User-Agent header (`Mozilla/5.0 ...`). The seed loop then succeeded against `upsertPrices` with an empty array because `parseStooqCsv` correctly returns `[]` on non-CSV input — every benchmark candidate ended up with `first_date=null` and `status=failed`.
- **Fix:** Rewrote the audit script to use `YahooProvider.getEod()` as its seed source. Yahoo serves the same `PriceRow[]` shape and returns 14-16.5y of history for all five candidates. The broader bulk-seed pipeline already moved off Stooq in Phases 03-07 / 03-09, so this aligns the audit script with that direction without re-introducing Stooq into a critical path.
- **Files modified:** `src/scripts/audit-benchmark-history.ts` (one-shot rewrite before commit).
- **Commit:** `c8c9d6c` (final version).
- **Risk:** None for this plan. Yahoo Finance is the current production seed provider (Phase 3 outcome). Stooq's outage may be transient (Cloudflare turnstile / IP block), but the audit script no longer depends on it.

No other deviations.

## Authentication Gates

None. The plan's `user_setup` block expected `SUPABASE_ACCESS_TOKEN`, but the worktree had `DATABASE_URL` already configured, so `supabase db push --db-url $DATABASE_URL` worked without a separate access-token login.

## Verification Results

- `npm run lint` — 0 errors, 43 warnings (all pre-existing in unrelated files, e.g. `_signIn`, `_symbol` in old tests)
- `npx tsc --noEmit` — clean (no output)
- `npx vitest run src/lib/backtest/ src/lib/data/snb.test.ts --reporter=basic` — 7 skipped files, 25 todos
- `npx playwright test tests/integration/backtest-*.spec.ts --list` — 6 specs listed
- Live DB: `backtest_runs` exists (count=0); `snb_rates` exists (count=0)
- `grep "lightweight-charts" package.json` — present (`^5.2.0`)
- `grep "refresh-snb" vercel.json` — present
- `npm run audit:benchmarks` — exit 0, 5/5 benchmarks at ≥10y coverage

## Known Stubs

| Stub | File | Reason | Resolved By |
| ---- | ---- | ------ | ----------- |
| 25 `it.todo` reservations | `src/lib/backtest/*.test.ts`, `src/lib/data/snb.test.ts` | Wave-0 scaffolding; downstream plans land real assertions | Plans 05-02 (sim/metrics/hash/grid), 05-03 (snb) |
| 6 `test.skip` reservations | `tests/integration/backtest-*.spec.ts` | UI/route handlers not yet written | Plans 05-04, 05-05, 05-06 |

All stubs are intentional and explicitly named in the plan. They are NOT user-facing UI placeholders.

## Self-Check: PASSED

- `supabase/migrations/00009_backtest_runs.sql` — present
- `supabase/migrations/00010_snb_rates.sql` — present
- `src/lib/backtest/types.ts` — present (15 named type exports verified)
- `src/lib/backtest/errors.ts` — present
- `src/scripts/audit-benchmark-history.ts` — present
- `tests/fixtures/snb/snboffzisa-snapshot.json` — present, parses as valid JSON
- `tests/fixtures/backtest/golden-portfolio.json` — present, parses as valid JSON
- All 7 vitest stub files — present
- All 6 playwright stub files — present
- Commits dd596ba / 01f80a1 / c8c9d6c — all present in `git log`
- Live DB `backtest_runs` table — present (RLS gated; SELECT/INSERT/DELETE policies)
- Live DB `snb_rates` table — present (RLS gated; authenticated read)
- Live DB `instruments` — all five D-22 benchmark tickers present with ≥10y coverage
