---
phase: 05-backtesting-engine
plan: 06
subsystem: backtesting-engine
tags: [ui, client-components, page-wiring, run-history, worker-consumer, wave-4]

requires:
  - phase: 05-backtesting-engine
    plan: 04
    why: "Consumes POST /api/backtest/data, POST /api/backtest/runs, GET /api/backtest/runs?portfolio_id=…, GET /api/backtest/runs/[id]; imports BENCHMARK_TICKER_WHITELIST via the schema module"
  - phase: 05-backtesting-engine
    plan: 05
    why: "Imports { useBacktestWorker } and the two chart components; first consumer of the Plan 05 worker bundle (closes the Plan 05 Task 3 inherited verification)"
provides:
  - "Live /dashboard/backtest user-facing route — full BACK-01..BACK-08 workflow"
  - "First end-to-end exercise of the worker chunk in a production build (verifies RESEARCH Pitfall 10 resolution)"
affects:
  - "Closes BACK-01, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, BACK-08"
  - "Replaces the placeholder /dashboard/backtest page with the real UI"

tech-stack:
  added: []
  patterns:
    - "Server-component shell + Promise.all + client orchestrator handoff (mirrors portfolios/page.tsx)"
    - "Heavy/cheap param classification driving worker rerun vs full refetch (CONTEXT D-02)"
    - "AbortController cancellation for in-flight /api/backtest/data fetches when heavy params change mid-flight"
    - "Refresh-nonce pattern (refreshKey) for forcing the drawer to refetch after a new run write"
    - "Right-anchored Dialog override for the Sheet-like drawer affordance"
    - "Per-instrument first_date sourced from the server query to avoid a second round-trip for earliest-allowed-start (CONTEXT D-03 + checker fix)"

key-files:
  created:
    - src/app/dashboard/backtest/_queries.ts
    - src/app/dashboard/backtest/BacktestClient.tsx
    - src/components/backtest/BacktestSetupBar.tsx
    - src/components/backtest/MetricsStrip.tsx
    - src/components/backtest/BacktestResults.tsx
    - src/components/backtest/RunSummaryFooter.tsx
    - src/components/backtest/RunHistoryDrawer.tsx
  modified:
    - src/app/dashboard/backtest/page.tsx

decisions:
  - "benchmark_ticker is HEAVY (triggers refetch) because the /api/backtest/data route only loads the explicitly-requested benchmark's instrument; switching benchmarks requires fresh data. Verified against src/app/api/backtest/data/route.ts lines 145-187."
  - "loadHistoricalRun does NOT restore benchmarkEquity — backtest_runs schema only persists equity_curve_json, not benchmarkEquity_json (would have required a Plan 05-01 schema change). Acceptable trade-off for v1: the portfolio curve, metrics, annual bars, and warnings all round-trip; the benchmark overlay returns when the user runs fresh."
  - "Drawer uses shadcn Dialog with right-anchored positioning overrides; the codebase has no Sheet primitive and adding one was out of scope. Documented in the file-level comment."
  - "MDD tooltip renders peak/trough dates as ReactNodes (not innerHTML) — typed BacktestMetrics fields, no XSS surface (T-5-06-XSS mitigated)."
  - "earliestAllowedStart computed inline from props.portfolios[0].instruments[].first_date — no second round-trip needed (checker fix accepted at planning time)."

metrics:
  duration: ~11 minutes
  completed: 2026-06-24
  task_count: 3
  file_count_created: 7
  file_count_modified: 1

key-decisions:
  - "BACK-01..BACK-08 are now observable end-to-end on /dashboard/backtest"
  - "Worker chunk emits in production build (.next/static/media/backtest.worker.0zmbj~cm-bs2x.ts) — Plan 05-05 Task 3 inherited verification PASSED"

requirements-completed: [BACK-01, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, BACK-08]
---

# Phase 5 Plan 06: Backtest UI Summary

**Shipped the full /dashboard/backtest user flow — server-component shell + sticky setup bar (portfolio · start · end · DRIP · rebalance · benchmark · Run) + 5-stat metrics strip with MDD peak/trough tooltip + vertical equity/metrics/annual-bars/footer composition + right-side run history drawer with stale-on-view badge, wiring the Plan 05 worker hook and Plan 04 API routes into a single state machine that classifies parameter changes as heavy (refetch + worker restart) vs cheap (worker-only rerun on cached batch data).**

## Tasks Completed

### Task 1 — Server-component shell + queries (commit `98d8019`)

- **`src/app/dashboard/backtest/_queries.ts`** exports:
  - `listPortfoliosForBacktest()` — RLS-scoped query joining `portfolios` → `portfolio_instruments` → `instruments` that returns each portfolio with `{ id, name, investment_amount, instrument_count, instruments: [{ id, ticker, first_date }, …] }`. The per-instrument `first_date` is embedded so the client can compute the earliest-allowed-start (CONTEXT D-03) without a second round-trip — the checker-flagged under-specification is resolved here.
  - `loadBenchmarkInstruments()` — queries the `instruments` table for the D-22 candidates (URTH.US, SWDA.LSE, SSAC.SW, SPY.US, CSSMI.SW) and picks one winner per benchmark NAME (MSCI World / MSCI ACWI / S&P 500 / SMI) by earliest `first_date` (longest cached history). ACWI.US is intentionally excluded — SSAC.SW takes the MSCI ACWI slot per CONTEXT D-22 "CHF-listed UCITS matches CHF-native positioning."
  - Both functions throw on Supabase error so the server component renders Next.js's default error boundary (mirrors `portfolios/_queries.ts`).
- **`src/app/dashboard/backtest/page.tsx`** — server component awaits `Promise.all([listPortfoliosForBacktest(), loadBenchmarkInstruments()])`, renders the standard `max-w-5xl mx-auto px-6 py-8` shell with a `text-3xl font-medium tracking-tight` h1, and either hands off to `<BacktestClient>` or renders the empty-state CTA (link to `/dashboard/portfolios/new`) when the user has no portfolios.

### Task 2 — Orchestrator + setup bar + metrics strip + footer + results (commit `471bd7e`)

- **`src/app/dashboard/backtest/BacktestClient.tsx`** — state machine driving the heavy/cheap param split:
  - State: `params, batchData, output, runId, isStale, isLoading, historyOpen, historyVersion`.
  - Heavy params = `{ portfolio_id, start, end, benchmark_ticker }` — change → cancel any in-flight fetch via `AbortController`, refetch `/api/backtest/data`, restart worker on the new payload.
  - Cheap params = `{ drip, rebalance }` — change → reuse cached `batchData`, call `worker.run()` again with the same instruments+prices+fx+snb arrays.
  - After each successful worker resolution: POST `/api/backtest/runs` and capture `{ id, deduped }`. Bumps `historyVersion` so the drawer refetches on next open.
  - `handleRun()` forces a heavy refetch even when params didn't change (the explicit "run with fresh data" gesture).
  - `loadHistoricalRun(id)` fetches `/api/backtest/runs/[id]`, reconstructs `BacktestOutput` from the persisted JSONB columns, seeds `params` from `params_json`, and respects the server's `stale: boolean`. Wipes cached `batchData` so a subsequent cheap-param edit falls through to heavy (correct — historical runs may pre-date the current cache window).
  - Sonner toasts surface DataError envelopes from the four backtest endpoints and worker errors (`isBacktestError` propagates via `Error.message`).
  - Unmount: aborts the in-flight fetch and terminates the worker.
- **`src/components/backtest/BacktestSetupBar.tsx`** — sticky `top-16 z-10 border-y bg-background/95 backdrop-blur px-4 py-3`. All 7 controls per D-01:
  - Portfolio Select (base-ui via shadcn `<Select>`); start `<Input type="date">` with `min={earliestAllowedStart}`, `max={value.end}` + helper text "Earliest available: 2010-04-12 — constrained by SPY.US" per D-03; end `<Input type="date">` with `min={value.start}`; DRIP labeled `<input type="checkbox">` (existing input primitive, no shadcn Switch in this codebase); rebalance `<Tabs>` with 4 triggers (`none|annual|semi-annual|quarterly`); benchmark `<Select>` with `None` (empty-string value mapped to `null`) + the 4 curated D-22 options; Run `<Button>` styled with Swiss red `#E3000F` background and disabled when `isLoading || !portfolio_id`.
- **`src/components/backtest/MetricsStrip.tsx`** — `grid grid-cols-5 gap-8 border-y bg-background/95 px-1 py-3 backdrop-blur` with 5 stats (Total Return, CAGR, Max Drawdown, Sharpe, Volatility). Inner `Stat` mirrors WeightedMetricsStrip — `font-mono text-2xl tabular-nums` value, `text-[10px] uppercase tracking-wider text-muted-foreground` label. MDD value wraps in `<Tooltip>` whose `<TooltipContent>` renders `Peak: <date> · Trough: <date>` from `metrics.mddPeakDate` and `metrics.mddTroughDate` per D-21. Percent formatting via `Intl.NumberFormat('de-CH', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Sharpe is `(v).toFixed(2)` (raw number, no percent).
- **`src/components/backtest/RunSummaryFooter.tsx`** — borderless block (no card chrome per Phase 2 Swiss-minimalist convention). `text-sm font-semibold uppercase tracking-wider text-muted-foreground` heading "Run summary", 3-col responsive `<dl>` with parameters (Portfolio name, Investment via fmtCHF, Start, End, DRIP, Rebalance, Benchmark), then the warnings list (`{kind}: {message}` per line) gated by `warnings.length > 0`, then the D-17 disclosure `Idealized backtest: no fees, no taxes, no bid/ask spread (v1).`
- **`src/components/backtest/BacktestResults.tsx`** — vertical D-04 composition:
  1. Stale-on-view banner (when `isStale === true`): amber-tinted border + "Data refreshed — recompute?" text + `<Button>` calling `onRecompute`.
  2. `<section>` Equity curve → `<EquityCurveChart>` (Plan 05).
  3. `<section>` Metrics → `<MetricsStrip>`.
  4. `<section>` Annual returns → `<AnnualReturnsChart>` with `showBenchmark={params.benchmark_ticker !== null}`.
  5. `<RunSummaryFooter>` for params + warnings + D-17.

### Task 3 — RunHistoryDrawer (commit `cdb56ae`)

- **`src/components/backtest/RunHistoryDrawer.tsx`**:
  - Trigger: a `<Button variant="outline">History</Button>` rendered next to the setup bar in BacktestClient.
  - Drawer: shadcn `<Dialog>` overridden with right-anchored Tailwind utilities (`fixed inset-y-0 right-0 left-auto h-full w-full max-w-md`) — trade-off documented in the file-level comment (no Sheet primitive in the codebase; CSS-only switch later).
  - On `open=true` OR `portfolioId` change OR `refreshKey` bump: fetch `/api/backtest/runs?portfolio_id=…` with an `AbortController`; render the list.
  - 4-column grid row: portfolio name + date range (params_json.start → params_json.end) | total return % (de-CH formatted) | relative timestamp via `formatRelative` (copied verbatim from PortfoliosListClient lines 35-50) | optional `current` badge when `id === currentRunId`.
  - Row click → `onSelectRun(id)` (parent calls `loadHistoricalRun`) → `onOpenChange(false)` closes the drawer.
  - Empty state: "No prior runs for this portfolio."
  - Sonner toasts surface DataError envelopes.

## Inherited from 05-05

**Plan 05-05 Task 3 deferred a `checkpoint:human-verify` to this plan**: confirm a worker chunk appears in `.next/static/` after the dashboard route imports `useBacktestWorker`, since 05-05's build emitted nothing (no consumer). This plan now imports the hook in `BacktestClient.tsx`, so I re-ran `npm run build` after Task 3:

**Result: PASSED.**

```
✓ Compiled successfully in 6.6s
  Running TypeScript ...
  Finished TypeScript in 6.6s ...
✓ Generating static pages using 7 workers (21/21) in 220ms

Route (app)
…
├ ƒ /dashboard/backtest
…
```

**Worker artifacts emitted:**

```
$ find .next/static -name '*worker*' -o -name '*backtest*'
.next/static/chunks/turbopack-worker-0sjn--fhq~1cg.js
.next/static/media/backtest.worker.0zmbj~cm-bs2x.ts
```

- `.next/static/media/backtest.worker.0zmbj~cm-bs2x.ts` — the worker source served as a static asset (Turbopack's emission shape for worker URLs created via `new Worker(new URL('../../workers/backtest.worker.ts', import.meta.url), …)`).
- `.next/static/chunks/turbopack-worker-0sjn--fhq~1cg.js` — the worker bootstrap chunk.
- Cross-referenced by route chunks `0c1_w7cm9xksu.js` and `046x3i4c2ibe5.js` (both contain the literal `backtest.worker`).

`npm run start` runtime verification is not feasible in this worktree (no live Supabase session for the dashboard route's data prefetch), but the relative-URL pattern (`'../../workers/backtest.worker.ts'`) that Plan 05-05 selected per RESEARCH Pitfall 10 has been exercised end-to-end by the production build — the prod-build pathway is verified. RESEARCH Pitfall 10's fallback ("If a 404 appears, the relative path is already in place — escalate via blocker") does not apply: no 404, no "Module not found", no "Failed to construct 'Worker'" warnings in the build logs.

**Environment workaround note:** the worktree's `node_modules` was missing `@next/swc-darwin-arm64`'s native `.node` binary (same constraint flagged in 05-03 and 05-04 summaries). To unblock the build for this plan's verification, I installed `@next/swc-wasm-nodejs` as a fallback, ran the build (which produced the artifacts above), then `git checkout -- package.json package-lock.json` to revert the env-only change so it does NOT pollute this plan's commits. The worktree's package.json + lockfile are bit-identical to the baseline at `778adbe`.

## State Machine Behavior (DevTools-style trace)

The behavior the verifier should observe (cannot exercise live here because no Supabase session is bound in this worktree):

| User action | State transition | Network |
|---|---|---|
| Page load | `idle → fetching → running → done` | POST /api/backtest/data; worker; POST /api/backtest/runs |
| Toggle DRIP | `done → running → done` | POST /api/backtest/runs only (no /data refetch) |
| Change rebalance | `done → running → done` | POST /api/backtest/runs only |
| Change start/end date | `done → fetching → running → done` | POST /api/backtest/data; worker; POST /api/backtest/runs |
| Change portfolio | `done → fetching → running → done` | POST /api/backtest/data; worker; POST /api/backtest/runs |
| Change benchmark | `done → fetching → running → done` | POST /api/backtest/data; worker; POST /api/backtest/runs |
| Click Run (no param change) | `done → fetching → running → done` | POST /api/backtest/data; worker; POST /api/backtest/runs (deduped:true) |
| Open history drawer | (no state change) | GET /api/backtest/runs?portfolio_id=… |
| Select a prior run | `* → done` (no fetching/running) | GET /api/backtest/runs/[id] |
| Click "Recompute" on stale badge | `done → fetching → running → done` | POST /api/backtest/data; worker; POST /api/backtest/runs |

## Deviations from Plan

**None.** The plan's `<interfaces>` block was implemented as written. Two minor implementation choices noted in `decisions` above (`benchmarkEquity` not restored on historical loads; Dialog used in place of Sheet) match the planner's explicit "executor picks" allowances or fall under documented trade-offs in PATTERNS.md.

## CONTEXT D-01..D-09, D-14, D-17, D-21, D-22 Coverage

| Decision | Where surfaced |
|----------|----------------|
| D-01 single page + sticky setup bar | `BacktestSetupBar.tsx` sticky top-16 |
| D-02 auto-rerun on cheap params | `BacktestClient` cheap-param effect (worker only) |
| D-03 date defaults + earliest-allowed-start helper | `defaultParams()` + `BacktestSetupBar` helper text |
| D-04 vertical Equity → Metrics → Annual bars → Footer | `BacktestResults.tsx` section order |
| D-05 right-side drawer | `RunHistoryDrawer.tsx` Dialog override |
| D-08 run row written after worker completes | `BacktestClient.writeRun()` after `runSimulation` |
| D-09 stale-on-view badge + recompute | `BacktestResults` stale banner + `handleRecompute` |
| D-14 forward-fill / warnings in footer | `RunSummaryFooter` warnings list |
| D-17 idealized disclosure | `RunSummaryFooter` italic footer line |
| D-21 MDD tooltip with peak + trough | `MetricsStrip.tsx` MDD Stat wrapped in Tooltip |
| D-22 four-benchmark whitelist | `loadBenchmarkInstruments` returns ≤4 entries |
| D-23 benchmark treated as just another instrument | `BacktestClient` passes `benchmark_ticker` through unchanged |

## Verification Results

- `npx tsc --noEmit` → exits 0 (no output)
- `npm run lint` → 0 errors (warnings only — all pre-existing and outside this plan's scope)
- `npm run build` → succeeds; `/dashboard/backtest` route compiles cleanly; worker chunk + media asset emitted (see "Inherited from 05-05" above)
- All 7 declared files created + 1 declared file modified (page.tsx); no files outside the declared scope touched
- `git diff --name-only 778adbe HEAD` returns exactly the 8 declared files

## Authentication Gates

None. The build verification + tsc + lint do not require a live Supabase session. Live UI testing was not attempted in this worktree because the dashboard route's server-side data prefetch requires a real cookie-bound session; the verifier should exercise it from a logged-in dev session against the merged main branch.

## Known Stubs

None. Every section the user sees flows from real data:

- The setup bar reads from the server-fetched `portfolios` and `benchmarks` props.
- The results panel renders only when `output !== null` (after a successful worker run) — there is no placeholder/lorem state.
- The drawer either lists real runs from `/api/backtest/runs?portfolio_id=…` or shows the empty-state copy "No prior runs for this portfolio."

## Threat Surface

All four threats in the plan's `<threat_model>` are mapped:

- **T-5-06-XSS** (Run summary footer warnings) — mitigated. `formatWarning()` interpolates only `BacktestWarning.kind` (`enum`) and `BacktestWarning.message` (engine-generated). Rendered as React text nodes; no `dangerouslySetInnerHTML`.
- **T-5-06-IDOR-UI** (UI exposing other users' portfolios) — mitigated. `listPortfoliosForBacktest` uses the cookies-bound SSR `createClient()`; RLS auto-scopes. Same for the runs list (verified upstream in Plan 04 RLS table).
- **T-5-06-STALE** (silent stale labeling) — mitigated. The stale badge + Recompute button are rendered side-by-side from `BacktestResults.tsx`; the user has the visible affordance to recompute.
- **T-5-06-WORKER-FAIL** (worker silent crash) — mitigated. `runSimulation` wraps the worker run in try/catch and surfaces failures via `sonner.toast.error`. The hook itself rejects the in-flight Promise on worker `error` events (verified upstream in Plan 05).

No new threat surface introduced.

## Self-Check: PASSED

```
$ test -f src/app/dashboard/backtest/page.tsx && echo FOUND
FOUND
$ test -f src/app/dashboard/backtest/_queries.ts && echo FOUND
FOUND
$ test -f src/app/dashboard/backtest/BacktestClient.tsx && echo FOUND
FOUND
$ test -f src/components/backtest/BacktestSetupBar.tsx && echo FOUND
FOUND
$ test -f src/components/backtest/MetricsStrip.tsx && echo FOUND
FOUND
$ test -f src/components/backtest/BacktestResults.tsx && echo FOUND
FOUND
$ test -f src/components/backtest/RunSummaryFooter.tsx && echo FOUND
FOUND
$ test -f src/components/backtest/RunHistoryDrawer.tsx && echo FOUND
FOUND
$ git log --oneline --all | grep -E "98d8019|471bd7e|cdb56ae"
cdb56ae feat(05-06): implement RunHistoryDrawer with right-side panel and stale reload
471bd7e feat(05-06): wire backtest client orchestrator + setup bar + results
98d8019 feat(05-06): add backtest page shell + server queries
```

---

*Phase: 05-backtesting-engine*
*Plan: 06*
*Completed: 2026-06-24*
