# Phase 5: Backtesting Engine - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A look-ahead-bias-free historical backtest engine for a single saved portfolio. The user picks a portfolio, a date range, DRIP on/off, rebalance frequency (none/annual/semi-annual/quarterly), and one benchmark from a curated CHF-friendly list. The engine — running in a browser Web Worker — simulates the portfolio day-by-day in CHF using point-in-time historical FX, computes an equity curve, annual return bars, and five metrics (Total Return, CAGR, Max Drawdown, Sharpe, annualized Volatility), and overlays the benchmark on the curve and annual bars.

Runs persist to a new `backtest_runs` table so users can revisit prior runs from a drawer on the backtest page. Runs are stamped with a `prices_version` and marked stale (with a one-click rerun) when the Phase 3 daily cron refreshes underlying prices. Multi-portfolio comparison, correlation matrix, projections, and Monte Carlo are out of scope — those belong to Phases 6 and 7.

</domain>

<decisions>
## Implementation Decisions

### End-to-end flow
- **D-01:** Single page at `/dashboard/backtest`. Top setup bar (portfolio dropdown / start date / end date / DRIP toggle / rebalance segmented control / benchmark dropdown / Run button). Results render below.
- **D-02:** Toggling DRIP, rebalance, or benchmark auto-re-runs immediately (data is already in the worker, sim is cheap). Changing portfolio or date range triggers a fresh data fetch + worker reload.
- **D-03:** Date range defaults: end = last fully-cached trading day; start = max(10 years ago, latest first-trading-day across the portfolio's instruments). UI tells the user the earliest possible start ("constrained by SPY listing 2010-04-12").
- **D-04:** Results panel sections, top→bottom: equity curve (CHF, portfolio + benchmark overlay, hover crosshair with date + CHF), 5-stat metrics strip, annual return bars (portfolio vs benchmark side-by-side), run summary footer (parameters + warnings about forward-filled days / truncated start date).
- **D-05:** Run history surfaces as a collapsible drawer on the backtest page — list of recent runs (portfolio name + date range + key metric + relative timestamp). Click reloads that run's inputs and cached results.

### Compute architecture
- **D-06:** Simulation runs in a **browser Web Worker** (per PROJECT.md). Server prepares data; worker runs the math.
- **D-07:** Data API: **single batch endpoint** `POST /api/backtest/data` with `{portfolio_id, benchmark_ticker, start, end}` returns one JSON payload containing instruments[], prices keyed by instrument, dividends, fx_rates, and SNB rates (see D-19). One network round-trip per fetch; RLS enforced server-side.
- **D-08:** Run row written to `backtest_runs` **on successful first render with results** (client POSTs `{inputs, equity_curve, annual_bars, metrics, prices_version, warnings}` to `/api/backtest/runs` after worker finishes). Subsequent identical-input runs dedupe on inputs hash; distinct param combos write new rows.
- **D-09:** Cache invalidation: each run stores `prices_version = max(prices.updated_at, fx_rates.updated_at, dividends.updated_at)` for its instruments. Opening a run whose `prices_version` is older than the current shows a "data refreshed — recompute?" badge with a one-click rerun. **No automatic cron-driven recompute of all runs.**

### Persistence schema (new)
- **D-10:** New migration `00009_backtest_runs.sql`. Schema sketch (planner refines):
  - `backtest_runs(id, user_id, portfolio_id, inputs_hash, params_json, equity_curve_json, annual_bars_json, metrics_json, warnings_json, prices_version, computed_at)`
  - `params_json` includes: date range, drip flag, rebalance frequency, benchmark ticker, simulation conventions snapshot (for reproducibility).
  - RLS: user can read/write their own runs only (same pattern as `portfolios`).
  - Cascading delete from `portfolios` (FK on `portfolio_id`) — Claude's discretion whether also cascade from `auth.users → profiles`.
  - `inputs_hash` is a deterministic hash of the input params (used for run dedup on identical-input writes).

### Charting library
- **D-11:** **TradingView Lightweight Charts** (Apache 2.0, finance-native, canvas-based). Equity curve = Line/Area series; annual return bars = Histogram series; benchmark overlay = a second Line series on the same chart. Phase 6 fan bands = Area series with priceLineSource. Phase 7 correlation matrix charting library decision deferred to Phase 7.
- **D-12:** Interaction in v1: hover crosshair + tooltip showing date + CHF value per series. No brush-to-zoom or marker pinning in v1 (defer to a later polish pass).

### Simulation conventions (deterministic, locked)
- **D-13:** **Date grid: union of all instruments' trading days** (portfolio instruments + benchmark + required FX pairs). Missing instruments on a stepped date carry forward last close.
- **D-14:** **Missing-data policy: forward-fill last close.** Track per-instrument forward-fill count and surface in the run summary footer (e.g., "TLT forward-filled 4 days"). No interpolation. No hard fail.
- **D-15:** **DRIP timing: reinvest on ex-date into the paying instrument at that day's adjusted close.** `cash_chf = shares_held × dividend_per_share × fx[ex_date, dividend_currency→CHF]`. Buy fractional shares of the same instrument at `adjusted_close[ex_date]`. No T+N settlement lag, no cash sleeve.
- **D-16:** **Rebalance mechanic: first trading day on/after the calendar boundary, at that day's CHF-converted close.** Annual = first trading day on/after Jan 1; semi-annual = first trading day on/after Jan 1 and Jul 1; quarterly = first trading day on/after Jan 1 / Apr 1 / Jul 1 / Oct 1. None = no rebalance for the entire run.
- **D-17:** **No transaction costs, no taxes, no bid/ask spread** in v1. Document this explicitly in the run summary footer ("Idealized: no fees, no taxes").

### Metrics conventions
- **D-18:** **Total Return** = (end_value_chf − start_value_chf) / start_value_chf. **CAGR** = (end/start)^(365.25/days) − 1 where `days` = exact calendar days between start_date and end_date.
- **D-19:** **Sharpe** uses the **SNB CHF policy rate (point-in-time)** as the risk-free rate. **Daily excess return = portfolio_daily_return − snb_daily_rate**, where `snb_daily_rate = (1 + snb_annual_rate)^(1/252) − 1`. Sharpe = mean(daily_excess) / stdev(daily_excess) × √252.
  - **New scope addition:** Phase 5 must source SNB CHF policy rate history. Source: SNB data portal (`data.snb.ch` — free, no API key, JSON). Storage: planner decides between (a) a new `snb_rates(date, rate)` table refreshed by a quarterly cron, or (b) a JSONB column on `fx_rates` for `chf_policy_rate` (lighter, no new table). SNB changes rates ~4x/year max, so quarterly refresh is sufficient.
  - SNB rate is included in the batch-data payload (D-07) so the worker has it for Sharpe computation.
- **D-20:** **Volatility** = stdev(daily_returns) × √252. **Annualization basis: trading-days (√252)** for both volatility and Sharpe. (Standard industry convention — matches Bloomberg / Morningstar.)
- **D-21:** **Max Drawdown** = min((value_t − running_max_t) / running_max_t). Display: percentage prominently in the metrics strip; tooltip on hover shows peak date and trough date. No on-chart shaded region in v1.

### Benchmarks (curated v1 dropdown)
- **D-22:** Four benchmarks ship in v1, all pre-seeded in `instruments` and pre-cached in `prices`/`fx_rates`:
  - **MSCI World** — `URTH.US` (USD primary) or `SWDA.L` (LSE listing). Planner picks the listing with longest cached history.
  - **MSCI ACWI All Country World** — `SSAC.SW` preferred (CHF-listed UCITS, matches CHF-native positioning) or `ACWI.US`.
  - **S&P 500** — `SPY.US` (already pre-seeded from Phase 3/4 templates).
  - **Swiss Market Index (SMI)** — `CSSMI.SW` or equivalent SIX-listed SMI ETF.
- **D-23:** Benchmark is treated as just another instrument by the engine — same DRIP, same FX conversion, same date grid handling. No special-case code path. UI: single-select dropdown plus "None".

### Claude's Discretion
- Exact `backtest_runs` schema shape (column types, indexes, JSONB vs separate columns for series data). Planner picks the smallest schema that supports run-history list rendering + cached result reload.
- SNB rate storage (new `snb_rates` table vs JSONB column on `fx_rates`).
- Web Worker bundle wiring (Next.js 16 worker setup; planner picks `new Worker(new URL(...), {type:'module'})` pattern vs Comlink wrapper).
- TradingView Lightweight Charts React wrapper: thin custom wrapper vs an OSS one (`lightweight-charts-react-wrapper` exists but small community — judge currency/quality at plan time).
- Run history retention (keep all forever, or LRU cap per user — start with "all forever" given personal-scale usage).
- Inputs-hash function (SHA-256 of canonical JSON is the obvious answer).
- Sticky-header behavior of the setup bar on scroll (sticky vs not — Claude's discretion).
- Whether the run drawer is fixed (left rail) or modal/Sheet — pick whichever feels less cluttered with the chart canvas.
- Error rendering for engine-side errors (data gaps too large, benchmark not selectable, etc.) — extend the typed `DataError` union or add a sibling `BacktestError` union; either is fine.
- Visual polish (typography weights, spacing, color tuning) — defer per user's standing preference (see memory: visual design handled later by Claude design pass).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & roadmap
- `.planning/PROJECT.md` — Core value: CHF-native, real historical data, browser Web Worker for backtests, $0/mo data cost ceiling.
- `.planning/REQUIREMENTS.md` — BACK-01 through BACK-08 are the requirements this phase must close.
- `.planning/ROADMAP.md` §Phase 5 — Goal statement + 6 success criteria.

### Prior phase context (carry-forward decisions)
- `.planning/phases/03-market-data-pipeline/03-CONTEXT.md` — EODHD/Yahoo/Stooq as price providers; `adjusted_close` is canonical for total-return; FX stored as `base=CHF, quote∈{USD,EUR,GBP}` with consumer-computed reciprocals; trading-calendar gaps explicitly punted to Phase 5 (resolved here as D-13/D-14); typed `DataError` union pattern.
- `.planning/phases/04-portfolio-builder/04-CONTEXT.md` — `portfolios.rebalance_frequency` column reserved by Phase 4 specifically for Phase 5; sticky metrics-strip visual pattern; CHF Swiss-apostrophe formatting convention; Swiss-minimalist design system (borderless cards, Swiss red #E3000F accent).
- `.planning/phases/02-app-shell-design-system/02-CONTEXT.md` — top nav routing; dashboard layout shell that `/dashboard/backtest` must drop into.

### Database schema
- `supabase/migrations/00001_initial_schema.sql` §portfolios — has `investment_amount NUMERIC(15,2)` and `rebalance_frequency TEXT` with CHECK constraint matching the engine's frequency options.
- `supabase/migrations/00001_initial_schema.sql` §prices — `(instrument_id, date)` unique; `adjusted_close NUMERIC(15,4) NOT NULL` is the price field for total-return.
- `supabase/migrations/00001_initial_schema.sql` §dividends — `(instrument_id, ex_date)` unique; `amount` in instrument currency (must FX-convert at ex_date for CHF DRIP).
- `supabase/migrations/00001_initial_schema.sql` §fx_rates — `(base_currency, quote_currency, date)` unique; populated by Frankfurter.

### Existing pipeline libraries (reusable from Phase 3)
- `src/lib/data/cache-fx.ts` — already flagged as "preview/sketch — full read API arrives in Phase 5". Planner extends this for the date-range FX read used by the batch-data endpoint.
- `src/lib/data/cache-prices.ts` — read pattern for cached prices.
- `src/lib/data/getPrices.ts` — cache-first fetch; on-demand instrument loading (used by the batch-data endpoint if benchmark isn't pre-cached).
- `src/lib/data/errors.ts` — typed `DataError` union; engine extends or sibling-unions.
- `src/lib/portfolio/chf-format.ts` — Swiss-apostrophe CHF formatter for chart axis/tooltip labels.

### External docs (planner reads these for unfamiliar APIs)
- TradingView Lightweight Charts docs: https://tradingview.github.io/lightweight-charts/ — Line/Histogram/Area series, crosshair, time-scale axis.
- SNB data portal: https://data.snb.ch — JSON endpoint for `zinssaetze` (policy rate history); planner verifies the exact endpoint/series ID at research time.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/dashboard/backtest/page.tsx` — current placeholder ("Coming soon"); replaced by the real backtest UI.
- `src/app/dashboard/layout.tsx` — top nav already routes "Backtest" link to `/dashboard/backtest` (Phase 2).
- `src/components/ui/{button,card,dialog,input,label,select,table,tabs,dropdown-menu,skeleton,popover,command,sonner}.tsx` — shadcn primitives ready (Phase 2 + Phase 4 installs).
- `src/lib/supabase/{server,client}.ts` — server- and browser-side Supabase clients.
- `src/lib/data/cache-fx.ts` / `cache-prices.ts` / `getPrices.ts` / `errors.ts` — Phase 3 pipeline (extend for batch read).
- `src/lib/portfolio/chf-format.ts`, `src/lib/portfolio/compute-metrics.ts`, `src/lib/portfolio/normalize-weights.ts` — Phase 4 pure libs; CHF formatter directly reused in charts.
- `src/app/dashboard/portfolios/_actions.ts` (Phase 4) — Server Actions pattern to mirror for backtest persistence.

### Established Patterns
- Swiss-minimalist visual system locked in Phase 2: borderless cards, whitespace separation, Swiss red (#E3000F) accent for CTAs/active states, Geist font.
- Sticky metrics strip pattern from Phase 4 PortfolioBuilder — mirror for the 5-stat backtest metrics row.
- Next.js 16 App Router with `proxy.ts` for auth session enforcement (no `middleware.ts`).
- Server Components by default; client components marked with `'use client'`. The backtest page is client-heavy (worker lives in the browser).
- Supabase Supavisor pooler port 6543 for all DB connections.
- Migrations in `supabase/migrations/`, leading-number naming. Phase 5 adds `00009_backtest_runs.sql` (and possibly `00010_snb_rates.sql` if planner chooses table-based SNB storage).
- Vitest for pure-library tests; Playwright integration tests in `tests/`.
- Typed `DataError` union — same `kind`-discriminated pattern for any engine-side errors.

### Integration Points
- Replace `src/app/dashboard/backtest/page.tsx` with the full backtest UI (client component shell).
- New components (sketch — planner refines):
  - `src/components/backtest/BacktestSetupBar.tsx` (top setup bar)
  - `src/components/backtest/BacktestResults.tsx` (chart + metrics + annual bars + footer)
  - `src/components/backtest/EquityCurveChart.tsx` (Lightweight Charts wrapper)
  - `src/components/backtest/AnnualReturnsChart.tsx` (Lightweight Charts histogram)
  - `src/components/backtest/MetricsStrip.tsx` (mirrors Phase 4 WeightedMetricsStrip)
  - `src/components/backtest/RunHistoryDrawer.tsx`
- New library code (worker-shared, pure):
  - `src/lib/backtest/types.ts` — input/output types, RunRow, BacktestParams, EquityPoint, MetricsResult.
  - `src/lib/backtest/simulate.ts` — pure simulation loop (DRIP, rebalance, forward-fill, FX, daily step).
  - `src/lib/backtest/metrics.ts` — pure metrics math (CAGR, Sharpe with SNB rate, MDD, vol).
  - `src/lib/backtest/inputs-hash.ts` — deterministic input hashing for run dedup.
  - `src/lib/backtest/date-grid.ts` — build union date grid + per-instrument forward-fill maps.
- New worker: `src/workers/backtest.worker.ts` — receives serialized batch payload, runs simulate + metrics, posts back equity curve + bars + metrics + warnings.
- New API routes:
  - `POST /api/backtest/data` — RLS-checked batch fetch (portfolio + benchmark + FX + SNB rate, all over the date range).
  - `POST /api/backtest/runs` — write run after worker completes.
  - `GET /api/backtest/runs?portfolio_id=...` — list user's runs for the history drawer.
  - `GET /api/backtest/runs/[id]` — load a specific run's cached series.
- New SNB rate data path (planner picks between `src/lib/data/snb.ts` + `cache-snb.ts` + cron route, or fold into existing `cache-fx.ts`).
- New migration: `supabase/migrations/00009_backtest_runs.sql` (+ optional `00010_snb_rates.sql`).
- New deps to install:
  - `lightweight-charts` (TradingView, Apache 2.0)
  - Possibly `comlink` for cleaner worker RPC (Claude's discretion vs raw `postMessage`).

</code_context>

<specifics>
## Specific Ideas

- "Workbench" / "precision instrument" feel continues from Phase 4 — keyboard-fast iteration, dense info, deterministic outputs. Toggling DRIP or rebalance should feel like a calculator, not a form submission.
- The engine is deterministic by design: given identical inputs + identical `prices_version`, output is bit-identical. This is why we can dedupe runs on `inputs_hash` and why stale-on-view recompute is safe.
- Single source of truth for prices: `adjusted_close` only. No mixing with un-adjusted prices anywhere in the engine.
- Run summary footer is the user's escape hatch for trust: it documents what was forward-filled, what was truncated, what convention was used. The chart can be one number — the footer says how that number came to be.
- The SNB rate addition is small but real new scope (not invented during planning) — the researcher must source it before the planner specifies the schema.
- Out of v1: no transaction costs, no taxes, no bid/ask. Documented in the footer so users can't misread the result as broker-accurate.

</specifics>

<deferred>
## Deferred Ideas

- Multi-portfolio overlay on a single chart — Phase 7 (COMP-01).
- Correlation matrix between portfolios — Phase 7 (COMP-03).
- Side-by-side comparison table across portfolios — Phase 7 (COMP-02).
- Charting library decision for the Phase 7 correlation matrix (heatmap) — deferred to Phase 7.
- Monte Carlo / projection scenarios — Phase 6.
- Brush-to-zoom / range selector on the equity curve — visual polish, defer.
- On-chart shaded region marking the max-drawdown period — visual polish, defer.
- Click-to-pin event markers on the equity curve — defer.
- User-configurable risk-free rate input — using SNB rate (D-19) covers the meaningful case; user override can come later if needed.
- Bid/ask spreads, transaction costs, tax drag — Phase 5 ships idealized backtests; cost modeling is a v2 concern.
- Export equity curve as CSV / PNG download — useful but not required by BACK-01..08.
- LRU cap on saved runs per user — start with "keep all"; revisit if it becomes a problem.
- Auto-recompute all runs nightly when prices refresh — explicitly rejected (D-09 picks stale-on-view instead).
- Settlement-date (T+2) DRIP timing — schema doesn't store pay date; defer unless data correctness demands it.
- Bench against multiple benchmarks simultaneously — Phase 5 is single-benchmark by design; revisit when Phase 7's multi-overlay infra ships.

</deferred>

---

*Phase: 05-backtesting-engine*
*Context gathered: 2026-05-29*
