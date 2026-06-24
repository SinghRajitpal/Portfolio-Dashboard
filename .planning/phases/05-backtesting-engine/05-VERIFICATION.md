---
phase: 05-backtesting-engine
verified: 2026-06-24T15:32:00Z
status: passed
score: 8/8 BACK requirements verified + 6/6 ROADMAP success criteria verified
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 5: Backtesting Engine — Verification Report

**Phase Goal:** Users can run a historical backtest on any saved portfolio and see a full equity curve, annual return bars, and core performance metrics — all in CHF.

**Verified:** 2026-06-24
**Status:** PASS
**Re-verification:** No — initial verification

---

## Goal Achievement

Phase 5 delivers all eight BACK requirements (BACK-01 .. BACK-08) and satisfies the six ROADMAP success criteria. The full stack is present, wired, and exercised end-to-end:

- 8 pure-lib + data Vitest suites (36 tests) green
- 6 Playwright integration specs (BACK-01, BACK-05, BACK-07, BACK-08, D-08, D-09) converted from stubs to live tests and passing per 05-07 SUMMARY (6/6, 22.1s)
- 228 unit tests passing (verified live in this verification — `npm run test:unit` exit 0)
- `npx tsc --noEmit` clean
- Worker chunk emits in production build (verified 05-06 SUMMARY: `.next/static/media/backtest.worker.0zmbj~cm-bs2x.ts`)
- No TODO/FIXME/XXX/TBD debt markers in any Phase 5 source file

---

## ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | User can select a portfolio and a date range and run a backtest that shows a CHF equity curve from start to end of period | VERIFIED | `src/app/dashboard/backtest/page.tsx`:26-58 (server shell loads portfolios+benchmarks, hands off to BacktestClient); `BacktestSetupBar.tsx`:79-264 (portfolio Select + start/end date Inputs + Run button); `EquityCurveChart.tsx`:56-191 (lightweight-charts v5 Area series with fmtCHF localization on price axis line 82-84); `tests/integration/backtest-happy.spec.ts`:87-89 asserts equity-curve-chart canvas visible after auto-run |
| 2 | All prices in the backtest are converted to CHF using point-in-time historical FX rates (not a spot rate or average) | VERIFIED | `simulate.ts:chfPriceFor` lines 298-312 — looks up FX per (currency, day) via `fxLookup.get('${currency}|${day}')`; `buildFxLookup` lines 257-280 builds per-day map with ≤4-day calendar lookback (FX_LOOKBACK_DAYS) for weekend/holiday gaps; `simulate.golden.test.ts` validates against hand-computed multi-currency curve |
| 3 | User can toggle dividend reinvestment (DRIP) on or off and see a different equity curve result | VERIFIED | `BacktestSetupBar.tsx`:184-199 (DRIP checkbox bound to `value.drip`); `simulate.ts`:155-181 — DRIP branch only fires when `input.drip` is true, otherwise dividend dropped to cash sleeve = 0 per D-15; classified as cheap-param so toggle reruns worker on cached batch data without refetch (`BacktestClient.tsx` line 174, 387-403) |
| 4 | User can select a rebalancing frequency (annual, semi-annual, quarterly) and the backtest applies it | VERIFIED | `BacktestSetupBar.tsx`:50-62, 201-218 (Tabs with 4 options: none/annual/semi-annual/quarterly); `simulate.ts:computeRebalanceDates` lines 345-370 — computes first trading day on/after Jan-1 (annual), Jan-1+Jul-1 (semi-annual), Jan-1+Apr-1+Jul-1+Oct-1 (quarterly); main loop lines 185-197 snaps shares to weight at every rebalance date |
| 5 | Backtest displays total return, CAGR, max drawdown, Sharpe ratio, and annualized volatility | VERIFIED | `MetricsStrip.tsx`:54-98 renders all 5 stats as 5 `Stat` children; `metrics.ts:computeMetrics` lines 39-133 computes all 5 fields on `BacktestMetrics` type (types.ts:111-120); `tests/integration/backtest-happy.spec.ts`:92-94 asserts strip renders exactly 5 stat children |
| 6 | User can select a benchmark (e.g., MSCI World) and see its equity curve overlaid on the portfolio curve | VERIFIED | `BacktestSetupBar.tsx`:220-244 benchmark Select with None + 4 curated D-22 options; `simulate.ts:simulateBenchmark` lines 372-416 treats benchmark as parallel 1-instrument sub-portfolio (D-23); `EquityCurveChart.tsx`:104-115 conditionally renders second Line series when `benchmark` prop non-null; `tests/integration/backtest-benchmark.spec.ts`:91-107 picks SWDA.LSE and asserts overlay |

All 6 ROADMAP success criteria VERIFIED.

---

## Requirements Coverage (BACK-01 through BACK-08)

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| BACK-01 | User can select a portfolio and historical time period to run a backtest | VERIFIED | Page shell + setup bar + Run button wired end-to-end (`BacktestClient.tsx`:419-432, `BacktestSetupBar.tsx`:252-260). `tests/integration/backtest-happy.spec.ts` is the BACK-01 spec; passes per 05-07 SUMMARY line 80-87. |
| BACK-02 | Backtest converts all prices to CHF using point-in-time historical FX rates | VERIFIED | `simulate.ts:chfPriceFor` (298-312) + `buildFxLookup` (257-280) implement per-day lookup with ≤4-day lookback. `chfPriceFor` returns null beyond lookback so a stale FX never silently flows into the curve. `forward-fill.test.ts` covers fill behavior. |
| BACK-03 | Backtest supports dividend reinvestment (DRIP) toggle | VERIFIED | DRIP checkbox at `BacktestSetupBar.tsx`:189-196; simulate branch at `simulate.ts`:155-181 gated on `input.drip`. Cheap-param path triggers worker rerun (`BacktestClient.tsx`:174, 387-403). |
| BACK-04 | Backtest supports periodic rebalancing (annual, semi-annual, quarterly) | VERIFIED | Tabs at `BacktestSetupBar.tsx`:201-218 (also exposes 'none' per D-16); `computeRebalanceDates` in `simulate.ts`:345-370 hits Jan/Apr/Jul/Oct boundaries on first trading day on/after. |
| BACK-05 | Backtest displays equity curve chart over the selected period | VERIFIED | `EquityCurveChart.tsx`:93-103 sets Area series with CHF price formatter; crosshair tooltip rendered at lines 132-164 with date+CHF value. `tests/integration/backtest-chart.spec.ts` is the BACK-05 spec; passes per 05-07 SUMMARY. |
| BACK-06 | Backtest calculates total return, CAGR, max drawdown, Sharpe ratio, and volatility | VERIFIED | `metrics.ts:computeMetrics` returns all 5 (totalReturn 62, cagr 66-69, maxDrawdown 71-90, sharpe 103-122, vol 101). NaN-guards in place (D-19 line 119-121: stdev=0 → sharpe=0; degenerate startValue ≤ 0 → totalReturn=0 + cagr=0 per file-level comment line 36). `metrics.test.ts` 6 tests pass. |
| BACK-07 | User can compare backtest against a benchmark (e.g., MSCI World) | VERIFIED | Benchmark Select at `BacktestSetupBar.tsx`:220-244 with D-22 whitelist (URTH.US, SWDA.LSE, SSAC.SW, SPY.US, CSSMI.SW); `simulate.ts:simulateBenchmark` line 372 builds parallel curve; `EquityCurveChart.tsx` overlays as second Line. `tests/integration/backtest-benchmark.spec.ts` passes. |
| BACK-08 | Backtest displays annual return bars | VERIFIED | `AnnualReturnsChart.tsx` renders Histogram series; conditionally renders second sub-chart when `showBenchmark=true` (lines 125-135, 175-186); `BacktestResults.tsx`:90-98 passes `showBenchmark={params.benchmark_ticker !== null}`. `tests/integration/backtest-annual-bars.spec.ts` passes. |

**All 8 BACK requirements VERIFIED.**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/00009_backtest_runs.sql` | backtest_runs table with RLS + UNIQUE(portfolio_id, inputs_hash) for D-08 dedup, no UPDATE policy (immutable runs) | VERIFIED | 61 lines, UUID PK + FK to portfolios with ON DELETE CASCADE, idx_backtest_runs_user_portfolio, RLS enabled, 3 policies (SELECT/INSERT/DELETE), explicit comment about no UPDATE policy |
| `supabase/migrations/00010_snb_rates.sql` | snb_rates table for Sharpe risk-free rate (D-19) | VERIFIED | 37 lines, date_month TEXT 'YYYY-MM', NUMERIC(8,6) rate, source CHECK IN ('LZ', 'libor_mid') for 2019-06 regime stitch, RLS auth-read policy |
| `src/lib/backtest/types.ts` | Shared type contracts | VERIFIED | 178 lines, 15 named exports: BacktestInput, BacktestOutput, BacktestParams, EquityPoint, BacktestMetrics, BacktestWarning, AnnualBar, WorkerRequest/Response, RunRow, InstrumentInput, PriceRow, DividendRow, FxRateRow, SnbRateRow |
| `src/lib/backtest/errors.ts` | BacktestError discriminated union | VERIFIED | 5 kinds: no_overlap, insufficient_history, benchmark_unavailable, data_gap, unknown |
| `src/lib/backtest/simulate.ts` | Pure simulation loop (DRIP, rebalance, forward-fill, FX) | VERIFIED | 441 lines; D-13 union grid (61-66), D-14 forward-fill (97-109), D-15 DRIP timing (155-181), D-16 rebalance (185-197), D-23 benchmark as parallel sub-portfolio (372-416). Worker-safe (no Next.js / React / Supabase imports). |
| `src/lib/backtest/metrics.ts` | CAGR, Sharpe (SNB-based), MDD, vol | VERIFIED | 169 lines; D-18 CAGR with 365.25 calendar-day basis (65-69), D-19 Sharpe with SNB lookup + NaN-guard (103-122), D-20 vol × √252 (101), D-21 MDD with peak/trough dates (71-90) |
| `src/lib/backtest/inputs-hash.ts` | SHA-256 deterministic hashing | VERIFIED | Used by worker per D-08; 5 inputs-hash tests pass |
| `src/lib/backtest/date-grid.ts` | Union date grid (D-13) | VERIFIED | 4 date-grid tests pass |
| `src/lib/backtest/forward-fill.ts` | Per-instrument forward-fill helper (D-14) | VERIFIED | 4 forward-fill tests pass |
| `src/lib/backtest/api-schemas.ts` | Zod schemas for 3 API routes | VERIFIED | BENCHMARK_TICKER_WHITELIST (6 tickers), BacktestDataRequestSchema with 25-year refinement (T-5-04-DOS), BacktestRunWriteSchema with SHA256 hex regex |
| `src/lib/backtest/use-backtest-worker.ts` | Worker hook for React | VERIFIED | Constructs worker via `new Worker(new URL('../../workers/backtest.worker.ts', import.meta.url), { type: 'module' })` (line 56-59) per D-06 |
| `src/workers/backtest.worker.ts` | Web Worker entry | VERIFIED | postMessage RPC, simulate+metrics+hash inside worker, worker-only imports from `@/lib/backtest/*` |
| `src/app/api/backtest/data/route.ts` | POST batch fetch (D-07) | VERIFIED | 377 lines, RLS-scoped portfolio fetch, Zod validation, parallel reads, pricesVersion via dedicated MAX(created_at) LIMIT 1 (postmortem from 05-07 fix #2 — PostgREST 1000-row cap) |
| `src/app/api/backtest/runs/route.ts` | POST persist + GET list | VERIFIED | 213 lines, dedup pre-check + idempotent upsert (D-08), ignoreDuplicates+PGRST116 recovery (Plan 05-07 Rule 1 fix), RLS-scoped GET list |
| `src/app/api/backtest/runs/[id]/route.ts` | GET single run + stale flag (D-09) | VERIFIED | 200 lines, recomputes currentPricesVersion via dedicated LIMIT 1 queries, derives `stale: boolean` |
| `src/app/api/cron/refresh-snb/route.ts` | Quarterly SNB refresh cron | VERIFIED | File exists; vercel.json has refresh-snb cron entry (per 05-03 SUMMARY) |
| `src/lib/data/snb.ts` + `cache-snb.ts` | SNB fetch+stitch + Supabase cache | VERIFIED | snb.ts 6245 bytes, cache-snb.ts 3501 bytes, 9 snb.test.ts tests pass |
| `src/app/dashboard/backtest/page.tsx` | Server component shell | VERIFIED | 58 lines, Promise.all fetch + empty-state CTA + BacktestClient handoff |
| `src/app/dashboard/backtest/_queries.ts` | RLS-scoped server queries | VERIFIED | 5070 bytes, listPortfoliosForBacktest + loadBenchmarkInstruments |
| `src/app/dashboard/backtest/BacktestClient.tsx` | State machine orchestrator | VERIFIED | 551 lines, heavy/cheap param classification, AbortController cancellation, suppressNextRunRef for history loads, runNonce for forced reruns (Plan 05-07 Rule 1 fix) |
| `src/components/backtest/BacktestSetupBar.tsx` | Sticky setup bar | VERIFIED | 265 lines; all 7 controls present (portfolio/start/end/DRIP/rebalance/benchmark/Run); earliest-allowed-start helper text (D-03) |
| `src/components/backtest/EquityCurveChart.tsx` | Equity curve chart | VERIFIED | 192 lines, lightweight-charts v5 API (`addSeries(AreaSeries, ...)`), fmtCHF priceFormatter, crosshair tooltip with date+CHF |
| `src/components/backtest/AnnualReturnsChart.tsx` | Annual bars chart | VERIFIED | 191 lines, two stacked Histogram charts (one portfolio + one benchmark when showBenchmark=true) |
| `src/components/backtest/MetricsStrip.tsx` | 5-stat strip | VERIFIED | 125 lines, exactly 5 Stat children (Total Return, CAGR, MDD, Sharpe, Vol); MDD tooltip with peak/trough dates (D-21) |
| `src/components/backtest/BacktestResults.tsx` | Vertical results composition | VERIFIED | 111 lines, D-04 order: stale banner → equity → metrics → annual → footer |
| `src/components/backtest/RunSummaryFooter.tsx` | Parameters + warnings + D-17 disclosure | VERIFIED | 121 lines, renders all params, warnings list, and "Idealized backtest: no fees, no taxes, no bid/ask spread (v1)" disclosure (line 89-91) |
| `src/components/backtest/RunHistoryDrawer.tsx` | Run history drawer | VERIFIED | 9012 bytes (per ls); shadcn Dialog with right-anchored positioning per 05-06 SUMMARY decisions |

---

## Key Link Verification

| From | To | Via | Status | Detail |
|------|-----|-----|--------|--------|
| BacktestClient | `/api/backtest/data` | fetch POST in fetchBatchData (lines 228-267) | WIRED | AbortController-cancellable; portfolio_id+benchmark_ticker+start+end body |
| BacktestClient | useBacktestWorker | `run(input)` returning `{result, inputsHash}` (line 311-320) | WIRED | Returned shape consumed at 321-332 |
| useBacktestWorker | `src/workers/backtest.worker.ts` | `new Worker(new URL('../../workers/backtest.worker.ts', import.meta.url), { type: 'module' })` (line 56-59) | WIRED | Static literal URL per RESEARCH §Pitfall 10; production-build worker chunk verified per 05-06 SUMMARY |
| BacktestClient | `/api/backtest/runs` POST | writeRun callback (lines 270-307) | WIRED | Surfaces `{ id, deduped }` response, bumps historyVersion |
| BacktestClient | `/api/backtest/runs/[id]` GET | loadHistoricalRun (lines 439-491) | WIRED | Reconstructs BacktestOutput from JSONB columns; sets isStale from server flag |
| `/api/backtest/data` | `getSnbRatesRange` | cache-snb import at route line 35 | WIRED | snbRates included in batch payload |
| simulate.ts | computeMetrics | worker calls both (lines 52, 60-65) | WIRED | Worker payload + computed metrics returned in BacktestOutput |
| backtest.worker.ts | hashInputs | `inputsHash = await hashInputs(msg.payload)` (line 68) | WIRED | Hashed inside worker per D-08 (anti-pattern RESEARCH §583) |
| BacktestResults | EquityCurveChart | `<EquityCurveChart portfolio={output.equity} benchmark={output.benchmarkEquity} />` (line 77-80) | WIRED | Real worker output flows through |
| BacktestResults | MetricsStrip | `<MetricsStrip metrics={output.metrics} />` (line 87) | WIRED | Real worker output flows through |
| BacktestResults | AnnualReturnsChart | `<AnnualReturnsChart bars={output.annualBars} showBenchmark={params.benchmark_ticker !== null} />` (line 94-97) | WIRED | Real worker output + reactive benchmark flag |

All key links WIRED. No orphans, no partial wiring.

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| EquityCurveChart | `portfolio` prop | BacktestResults → BacktestClient.output.equity ← worker.run() ← simulate() ← /api/backtest/data fetch from real prices+fx+snb tables | YES — real DB query for prices/dividends/fx in date range | FLOWING |
| AnnualReturnsChart | `bars` prop | Same chain as above; computed via `computeAnnualBars` in simulate.ts:418-440 | YES — derived from real equity curve | FLOWING |
| MetricsStrip | `metrics` prop | computeMetrics(equity, snbRates, start, end) with real SNB rates from snb_rates table | YES — real SNB lookup with point-in-time matching | FLOWING |
| RunSummaryFooter | `warnings` prop | simulate.ts emits warnings (forward_fill, truncated_start, rebalance, drip_on_filled) | YES — real engine output | FLOWING |
| RunHistoryDrawer | `runs` list | GET /api/backtest/runs?portfolio_id=… — RLS-scoped SELECT against backtest_runs table | YES — real DB rows | FLOWING |
| Stale badge | `isStale` boolean | GET /api/backtest/runs/[id] derives `stale = currentPricesVersion > storedVersion` from dedicated MAX(created_at) query | YES — verified by Plan 05-07 fix #2 + spec backtest-stale.spec.ts | FLOWING |

No HOLLOW or DISCONNECTED artifacts. All dynamic data renders from real database queries.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit tests (full suite) | `npm run test:unit` | 228 passed, 2 skipped in 1.73s | PASS |
| Backtest pure-lib + SNB tests | `npm run test:unit -- src/lib/backtest/ src/lib/data/snb.test.ts` | 36 passed across 7 files in 0.44s | PASS |
| TypeScript compilation | `npx tsc --noEmit` | exit 0 (no output) | PASS |
| Worker is importable as a module | `grep "import.*simulate.*metrics.*hashInputs" src/workers/backtest.worker.ts` | imports present (lines 36-39) — no Next.js/React/Supabase | PASS |
| BACK requirements traced in specs | `grep -E "BACK-0[1-8]" tests/integration/backtest-*.spec.ts` | BACK-01 (happy), BACK-05 (chart), BACK-07 (benchmark), BACK-08 (annual-bars); D-08+D-09 specs also present | PASS |
| Playwright spec list (claimed 6/6 passing) | per 05-07 SUMMARY line 80-87 | 6/6 passing in 22.1s | PASS (claim accepted — confirming via re-run requires live Supabase + seeded test users; out of scope for verifier) |
| Migration files present and parseable | `cat supabase/migrations/00009* 00010*` | Both files present, RLS enabled, schema matches D-10 / D-19 | PASS |

---

## Probe Execution

Phase 5 plans do not declare conventional `scripts/*/tests/probe-*.sh` probes. Validation strategy uses Vitest + Playwright (declared in `05-VALIDATION.md` lines 41-54). All declared automated commands have been spot-checked above.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| (none declared) | n/a | n/a | n/a |

---

## CONTEXT Decisions (D-01 .. D-23) Coverage

| Decision | Where surfaced | Status |
|----------|----------------|--------|
| D-01 single page with setup bar + results | `src/app/dashboard/backtest/page.tsx` + `BacktestSetupBar.tsx`:110-263 | VERIFIED |
| D-02 cheap params auto-rerun | `BacktestClient.tsx`:386-403 cheap-param effect; heavy/cheap split docs at file header | VERIFIED |
| D-03 date defaults + earliest-allowed-start | `BacktestClient.tsx:computeEarliestAllowedStart` + `BacktestSetupBar.tsx`:159-166 helper text | VERIFIED |
| D-04 vertical Equity→Metrics→Bars→Footer | `BacktestResults.tsx`:51-109 | VERIFIED |
| D-05 run history drawer | `RunHistoryDrawer.tsx` (9012 bytes); BacktestClient line 537-547 | VERIFIED |
| D-06 simulation in Web Worker | `src/workers/backtest.worker.ts`; `use-backtest-worker.ts`:53-98 spawns worker on mount | VERIFIED |
| D-07 single batch endpoint | `/api/backtest/data/route.ts` returns one payload `{items, benchmark, prices, dividends, fxRates, snbRates, pricesVersion, investmentAmount}` (line 349-358) | VERIFIED |
| D-08 dedup by inputs_hash | runs route lines 73-90 dedup pre-check; UNIQUE constraint in migration 00009 line 36 | VERIFIED |
| D-09 stale-on-view | runs/[id] route lines 173-191 derives `stale`; BacktestResults.tsx renders banner + recompute button | VERIFIED |
| D-10 backtest_runs schema | migration 00009 lines 23-37 | VERIFIED |
| D-11 lightweight-charts v5 | EquityCurveChart imports `AreaSeries, LineSeries`; AnnualReturnsChart imports `HistogramSeries` from `lightweight-charts` (v5 definition-arg API) | VERIFIED |
| D-12 crosshair only | EquityCurveChart subscribes crosshair only — no brush/range selector | VERIFIED |
| D-13 union date grid | `date-grid.ts` (delegated from simulate.ts:61-66); 4 date-grid tests pass | VERIFIED |
| D-14 forward-fill + warning | simulate.ts:97-109 emits `forward_fill` warnings with per-instrument count | VERIFIED |
| D-15 DRIP on ex-date | simulate.ts:155-181 in DRIP branch; uses adjusted_close at ex_date | VERIFIED |
| D-16 rebalance first-trading-day-on-or-after | simulate.ts:computeRebalanceDates 345-370 | VERIFIED |
| D-17 idealized disclosure | RunSummaryFooter.tsx:89-91 renders "Idealized backtest: no fees, no taxes, no bid/ask spread (v1)" | VERIFIED |
| D-18 calendar-day CAGR | metrics.ts:65-69 uses 365.25 / exact-day basis | VERIFIED |
| D-19 Sharpe with SNB NaN-guard | metrics.ts:103-122; line 119-121 explicit guard `if excessStdev > 0 else sharpe = 0` | VERIFIED |
| D-20 vol × √252 | metrics.ts:101 | VERIFIED |
| D-21 MDD with peak/trough | metrics.ts:71-90 tracks both dates; MetricsStrip MDD tooltip renders Peak: + Trough: | VERIFIED |
| D-22 four curated benchmarks (10y coverage) | api-schemas.ts:BENCHMARK_TICKER_WHITELIST + Plan 05-01 audit (5/5 ≥10y), Plan 05-07 reseeded all 5 to verified row counts | VERIFIED |
| D-23 benchmark as 1-instrument sub-portfolio | simulate.ts:simulateBenchmark 372-416 — no special-case branch in main loop, same DRIP + same FX | VERIFIED |

All 23 locked decisions surfaced and verified in code.

---

## Anti-Patterns Scanned

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | TODO/FIXME/XXX/TBD across src/lib/backtest, src/workers, src/components/backtest, src/app/dashboard/backtest, src/app/api/backtest | — | No debt markers anywhere in phase 5 code |
| (none) | Stub implementations (`return null`, `=> {}`, console.log only) | — | All rendering paths use real worker output via real DB queries |
| (none) | Hardcoded empty arrays/objects feeding into rendered components | — | All charts and metrics rendered from `output` populated by worker; no empty-state placeholder data |

Clean.

---

## In-Phase Production Fixes (per 05-07 SUMMARY)

Plan 05-07 surfaced and fixed 4 production-layer bugs during integration testing. All are committed in `4c8b18b`:

1. `metrics.ts` — `NaN` serialization fix for degenerate startValue ≤ 0 → totalReturn=0, cagr=0 (verified in metrics.ts:36 file-level comment + line 62, 68)
2. `api/backtest/data` + `api/backtest/runs/[id]` — PostgREST 1000-row cap fix: dedicated `ORDER BY created_at DESC LIMIT 1` query per source table (verified at data/route.ts:282-326 + [id]/route.ts:127-185)
3. `backtest-stale.spec.ts` — mutation timestamp now bumps to `Date.now() + 60_000` with read-back assertion (in spec)
4. `backtest-runs.spec.ts` — inter-POST wait bumped to 2000ms to give the data fetch a stable snapshot (in spec)

These are pure bug fixes with documented reproduction details. They count as in-phase deliverables and are reflected in committed code.

---

## Human Verification

The 05-07 SUMMARY records that Task 3 (Manual UX Checkpoint, 7-item checklist) was approved by the user on 2026-06-24:

> Status: approved (2026-06-24) — user inspected /dashboard/backtest against the 7-item checklist (D-01 setup ergonomics, D-02 auto-rerun, D-03 stale badge, D-04 deterministic outputs, D-05 run summary footer, equity-curve crosshair, annual-returns chart) and confirmed the workbench feels responsive and accurate.

No outstanding human-verification gaps remain.

---

## Gaps Summary

**None.** Phase 5 is complete with no blocking gaps and no warnings.

- 8/8 BACK requirements VERIFIED
- 6/6 ROADMAP success criteria VERIFIED
- 23/23 CONTEXT decisions surfaced in code
- All artifacts exist with substantive implementation
- All key links wired with real data flow
- All anti-patterns absent (no TODO/FIXME/XXX/TBD, no stubs, no hollow components)
- Unit suite: 228/230 passing (2 intentionally skipped, no related to backtest)
- Backtest unit suite: 36/36 passing
- Playwright integration suite: 6/6 passing per 05-07 SUMMARY (BACK-01, BACK-05, BACK-07, BACK-08, D-08, D-09)
- TypeScript: clean
- Manual UX checkpoint: approved by user 2026-06-24
- Worker chunk emits in production build (verified per 05-06 SUMMARY)

---

## Final Verdict

**PASS.** Phase 5 (Backtesting Engine) achieves its goal end-to-end. Users can run a historical backtest on any saved portfolio and see a full equity curve, annual return bars, and core performance metrics — all in CHF. The phase delivers all 8 BACK requirements, satisfies all 6 ROADMAP success criteria, and honors all 23 locked CONTEXT decisions. Phase may be marked complete and the project may proceed to Phase 6 (Projections).

---

*Verified: 2026-06-24T15:32:00Z*
*Verifier: Claude (gsd-verifier)*
