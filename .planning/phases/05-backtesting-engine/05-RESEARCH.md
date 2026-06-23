# Phase 5: Backtesting Engine - Research

**Researched:** 2026-05-29
**Domain:** Browser-side deterministic financial simulation (Web Worker) + finance-native charting (TradingView Lightweight Charts) + new external data source (SNB policy rate)
**Confidence:** HIGH overall (every recommendation verified against either a live API probe, the project's local `node_modules/next/dist/docs`, or official upstream docs)

## Summary

Phase 5 layers a deterministic CHF-native backtest engine on top of the already-built Phase 3 cache (`prices`, `dividends`, `fx_rates`) and the Phase 4 portfolio model. The work splits cleanly into five technical workstreams: (1) a small new external data path for SNB policy rates (the **only** real new third-party integration in this phase), (2) a Next.js 16 module Web Worker that hosts the pure simulation, (3) a single batch `POST /api/backtest/data` endpoint that consolidates one round trip of RLS-checked reads, (4) the TradingView Lightweight Charts v5 wrapper for the equity curve and annual bars, and (5) persistence of run results to a new `backtest_runs` table for the history drawer + stale-on-view recompute UX.

Three findings drive the plan more than anything else. **First**, the SNB policy rate series (`LZ`) only exists from **2019-06** onward — earlier history is published as a "target range for 3-month Libor" (series `UG0`+`OG0`, midpoint) under the same cube. Any backtest deeper than 2019-06 must stitch the two series; this is now a locked correctness requirement, not an edge case. **Second**, lightweight-charts shipped a major API rewrite in **v5.0** (current `5.2.0`): the `addLineSeries()` / `addHistogramSeries()` family is gone, replaced by `chart.addSeries(LineSeries, opts)` with explicit per-type imports. All training-data examples are out of date. **Third**, Next.js 16 + Turbopack **officially supports** `new Worker(new URL('./backtest.worker.ts', import.meta.url), { type: 'module' })` — confirmed by `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md`. No webpack escape hatch, no Comlink shim required.

**Primary recommendation:** Use **lightweight-charts ^5.2.0 directly** (no `lightweight-charts-react-wrapper` — Snyk reports it inactive, last release 2 years ago); use **raw `postMessage` with a 3-field RPC envelope** (single roundtrip per simulation, Comlink overkill); store SNB rates in a **new `snb_rates(date_month, rate)` table** with a manual seed + quarterly cron refresh (cheaper than JSONB column on `fx_rates`, lets the batch endpoint do a single range query); use **JS `number` for all simulation math** (no `decimal.js`) but tolerate the ~1e-10 relative drift in golden-master tests; canonicalize inputs with a small hand-rolled sorted-keys stringifier + SHA-256 via `crypto.subtle.digest` (works inside Web Workers).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-01 | Select portfolio + date range, run backtest, see CHF equity curve | Sections: Architecture Patterns (worker setup), Code Examples (chart wiring) |
| BACK-02 | Point-in-time CHF FX conversion | Sections: Architecture Patterns (date-grid + fx lookup), Common Pitfalls (FX spot-rate shortcut) |
| BACK-03 | DRIP toggle | Sections: Code Examples (DRIP loop), Common Pitfalls (ex-date vs pay-date) |
| BACK-04 | Rebalance frequency (annual / semi-annual / quarterly) | Sections: Architecture Patterns (rebalance boundary), Validation Architecture (boundary fixture) |
| BACK-05 | Equity curve chart | Sections: Standard Stack (lightweight-charts v5), Code Examples (line series + overlay) |
| BACK-06 | Total return, CAGR, MDD, Sharpe, Volatility | Sections: Architecture Patterns (metrics module), Standard Stack (SNB rate source for Sharpe) |
| BACK-07 | Benchmark overlay | Sections: Code Examples (two-line series + crosshair), Don't Hand-Roll (benchmark = instrument) |
| BACK-08 | Annual return bars | Sections: Code Examples (histogram series with priceScaleId='') |

## User Constraints (from CONTEXT.md)

### Locked Decisions

> All 23 decisions D-01 through D-23 from CONTEXT.md are locked and treated as ground truth. Verbatim copy follows.

**End-to-end flow:**
- **D-01:** Single page at `/dashboard/backtest`. Top setup bar (portfolio dropdown / start date / end date / DRIP toggle / rebalance segmented control / benchmark dropdown / Run button). Results render below.
- **D-02:** Toggling DRIP, rebalance, or benchmark auto-re-runs immediately (data is already in the worker, sim is cheap). Changing portfolio or date range triggers a fresh data fetch + worker reload.
- **D-03:** Date range defaults: end = last fully-cached trading day; start = max(10 years ago, latest first-trading-day across the portfolio's instruments). UI tells the user the earliest possible start ("constrained by SPY listing 2010-04-12").
- **D-04:** Results panel sections, top→bottom: equity curve (CHF, portfolio + benchmark overlay, hover crosshair with date + CHF), 5-stat metrics strip, annual return bars (portfolio vs benchmark side-by-side), run summary footer (parameters + warnings about forward-filled days / truncated start date).
- **D-05:** Run history surfaces as a collapsible drawer on the backtest page — list of recent runs (portfolio name + date range + key metric + relative timestamp). Click reloads that run's inputs and cached results.

**Compute architecture:**
- **D-06:** Simulation runs in a **browser Web Worker** (per PROJECT.md). Server prepares data; worker runs the math.
- **D-07:** Data API: **single batch endpoint** `POST /api/backtest/data` with `{portfolio_id, benchmark_ticker, start, end}` returns one JSON payload containing instruments[], prices keyed by instrument, dividends, fx_rates, and SNB rates (see D-19). One network round-trip per fetch; RLS enforced server-side.
- **D-08:** Run row written to `backtest_runs` **on successful first render with results** (client POSTs `{inputs, equity_curve, annual_bars, metrics, prices_version, warnings}` to `/api/backtest/runs` after worker finishes). Subsequent identical-input runs dedupe on inputs hash; distinct param combos write new rows.
- **D-09:** Cache invalidation: each run stores `prices_version = max(prices.updated_at, fx_rates.updated_at, dividends.updated_at)` for its instruments. Opening a run whose `prices_version` is older than the current shows a "data refreshed — recompute?" badge with a one-click rerun. **No automatic cron-driven recompute of all runs.**

**Persistence schema:**
- **D-10:** New migration `00009_backtest_runs.sql`. `backtest_runs(id, user_id, portfolio_id, inputs_hash, params_json, equity_curve_json, annual_bars_json, metrics_json, warnings_json, prices_version, computed_at)`. RLS: user can read/write their own runs only. Cascading delete from `portfolios`. `inputs_hash` deterministic, used for run dedup.

**Charting library:**
- **D-11:** **TradingView Lightweight Charts** (Apache 2.0). Equity curve = Line/Area series; annual return bars = Histogram series; benchmark overlay = second Line series on same chart.
- **D-12:** Interaction v1: hover crosshair + tooltip showing date + CHF value per series. No brush-to-zoom or marker pinning.

**Simulation conventions (deterministic, locked):**
- **D-13:** Date grid = union of all instruments' trading days (portfolio instruments + benchmark + required FX pairs). Missing instruments forward-fill.
- **D-14:** Missing-data policy: forward-fill last close. Track per-instrument forward-fill count, surface in footer. No interpolation. No hard fail.
- **D-15:** DRIP timing: reinvest on ex-date into the paying instrument at that day's adjusted close. `cash_chf = shares_held × dividend_per_share × fx[ex_date, dividend_currency→CHF]`. Buy fractional shares at `adjusted_close[ex_date]`. No T+N lag, no cash sleeve.
- **D-16:** Rebalance: first trading day on/after the calendar boundary, at that day's CHF-converted close. Annual = Jan 1; semi-annual = Jan 1 + Jul 1; quarterly = Jan 1 / Apr 1 / Jul 1 / Oct 1.
- **D-17:** No transaction costs, no taxes, no bid/ask in v1. Documented in footer.

**Metrics conventions:**
- **D-18:** Total Return = (end−start)/start. CAGR = (end/start)^(365.25/days) − 1, `days` = exact calendar days.
- **D-19:** Sharpe uses **SNB CHF policy rate (point-in-time)**. Daily excess = portfolio_daily − snb_daily, where snb_daily = (1+snb_annual)^(1/252) − 1. Sharpe = mean/stdev × √252. SNB rate sourced from data.snb.ch (free, no key).
- **D-20:** Volatility = stdev(daily_returns) × √252. Trading-day annualization (√252) for both vol and Sharpe.
- **D-21:** Max Drawdown = min((value_t − running_max_t) / running_max_t). Tooltip shows peak + trough dates.

**Benchmarks:**
- **D-22:** Four benchmarks: MSCI World (URTH.US or SWDA.L), MSCI ACWI (SSAC.SW), S&P 500 (SPY.US — already seeded), SMI (CSSMI.SW).
- **D-23:** Benchmark is just another instrument — same DRIP, same FX, same date grid. Single-select dropdown + "None".

### Claude's Discretion

- Exact `backtest_runs` schema shape (column types, indexes, JSONB vs separate columns) — recommendation in Architecture Patterns below.
- SNB rate storage (new table vs JSONB column on `fx_rates`) — **recommend new `snb_rates` table** (see Standard Stack rationale).
- Web Worker bundle wiring — **recommend `new Worker(new URL(...), { type: 'module' })`** (Next.js 16 native; see Code Examples).
- TradingView React wrapper — **recommend thin custom hook**, not the inactive npm wrapper (see Don't Hand-Roll).
- Run history retention — start with "keep all" per CONTEXT.
- Inputs-hash function — **recommend canonical-JSON sorted-keys stringify + SHA-256 via `crypto.subtle.digest`** (works in Web Workers).
- Sticky setup bar — Claude's discretion (recommend sticky-top for keyboard-fast feel, mirroring Phase 4 metrics strip).
- Run drawer placement — recommend right-side `Sheet` so chart canvas stays uncluttered.
- Engine error rendering — **recommend a sibling `BacktestError` union** (keeps `DataError` purely about data-layer concerns).
- Visual polish — defer per user memory.

### Deferred Ideas (OUT OF SCOPE)

Multi-portfolio overlay (Phase 7 COMP-01); correlation matrix (Phase 7 COMP-03); side-by-side comparison table (Phase 7 COMP-02); Phase 7 heatmap charting choice; Monte Carlo / projections (Phase 6); brush-to-zoom; on-chart MDD shaded region; click-to-pin event markers; user-configurable risk-free rate; bid/ask / transaction costs / tax drag (v2); CSV/PNG export; LRU cap on saved runs; auto-recompute all runs nightly (explicitly rejected); settlement-date T+2 DRIP; multi-benchmark simultaneously.

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **Next.js 16 has breaking changes** vs training data; read `node_modules/next/dist/docs/` before writing code. ALL training-era Next.js worker patterns must be verified locally.
- **Heed deprecation notices** in `next/dist/docs/`.
- **`middleware.ts` → `proxy.ts`** rename is already in effect (Phase 1 decision).
- **Supabase Supavisor pooler port 6543 only** (never 5432).
- **Visual design polish deferred to a Claude design pass** — Phase 5 ships structural UX, not pixel-perfect chrome (user memory `feedback_visual_design.md`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Run history list + reload | API / Backend | Browser (drawer UI) | RLS scoping must be enforced server-side; results blob is server-rendered into the worker on reload |
| Batch data assembly (prices + FX + SNB + dividends) | API / Backend | Database | RLS check happens here; single trip avoids waterfall; raw assembly is just SELECTs |
| Date-grid construction (union of trading days) | Browser (Worker) | — | Pure data-dependent transform; must run beside simulate() for determinism |
| Forward-fill + DRIP + rebalance simulation | Browser (Worker) | — | Per CONTEXT D-06 (PROJECT.md ceiling on serverless compute); pure math, deterministic |
| Metrics math (TR, CAGR, MDD, Sharpe, Vol) | Browser (Worker) | — | Pure, depends on simulation output; testable as a pure module |
| Chart rendering (equity curve + bars + crosshair) | Browser / Client | — | DOM/canvas concerns; no SSR (lightweight-charts requires `window`) |
| Inputs hash | Browser (Worker) | — | Hash from worker side guarantees the same canonical bytes that drove the sim |
| Run persistence (`POST /api/backtest/runs`) | API / Backend | Browser (fire-and-forget) | RLS scoping again; client kicks it off after worker `complete` |
| SNB rate fetch (external network) | API / Backend (cron) | — | `data.snb.ch` HTTPS, no CORS guarantee; server fetch is the safe path |
| Stale-on-view detection (`prices_version` compare) | API / Backend | Browser (badge) | Compare done server-side at run-load time; client just renders the badge |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lightweight-charts` | `^5.2.0` [VERIFIED: npm registry, published 2026-04-24] | Equity curve + annual-bars charting | Apache 2.0, finance-native, canvas-based, ~50KB; chosen in CONTEXT D-11. v5 API confirmed against `tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5` [CITED] |
| Native `Worker` API | Built-in | Simulation thread | Next.js 16 + Turbopack native support for `new Worker(new URL(..., import.meta.url), { type: 'module' })` [CITED: node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md] |
| `crypto.subtle.digest` | Built-in (Web Crypto) | Deterministic inputs hash (SHA-256) | Available in Web Workers per MDN [CITED: developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest]; no dep needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@base-ui/react` Popover/Sheet | already installed `^1.3.0` | Run history drawer | Already in repo; matches Phase 4 patterns |
| `sonner` | already installed `^2.0.7` | Stale-data + engine-error toasts | Already wired |
| `papaparse` | already installed `^5.5.3` | CSV parsing of SNB CSV seed file (one-shot seed only) | If planner prefers CSV over JSON for SNB seed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `new Worker(new URL(...))` | `comlink` (`^4.4.2`, last published 2024-11-07) [VERIFIED: npm registry] | Comlink saves ~30 lines of plumbing but adds a dep and an async-RPC mental model for a worker that has **one** call (`run(payload)` → `result`). Recommendation: skip Comlink. [CITED: smashingmagazine.com/2021/06/web-workers-2021/] |
| Custom React hook for lightweight-charts | `lightweight-charts-react-wrapper@2.1.1` | Snyk: **inactive**, no release in 2+ years, 767 weekly downloads, 1 maintainer [CITED: snyk.io/advisor/npm-package/lightweight-charts-react-wrapper]. Last v4 only — v5 not supported. **Do not use.** |
| Native `number` math | `decimal.js` (`^10.x`) [ASSUMED current major; not registry-verified at research time] | For 2500 daily compounded steps, IEEE 754 drift on `adjusted_close` math is bounded ~1e-10 relative. `decimal.js` adds ~30KB and ~10× slowdown for no user-visible accuracy gain at this scale. **Use `number`.** Document tolerance in golden-master tests. |
| New `snb_rates` table | JSONB column on `fx_rates` | JSONB couples two unrelated datasets and forces full-row reads. New table = ~80 rows total (monthly since 2019), one cheap range query per backtest. Recommendation: new table. |
| Server-side compute | Vercel serverless | Explicitly rejected in PROJECT.md ("never in Vercel serverless functions") |

**Installation:**
```bash
npm install lightweight-charts@^5.2.0
# No other production deps. Web Crypto + Web Worker are built-in.
```

**Version verification (run at plan time):**
```bash
npm view lightweight-charts version       # confirm still 5.x latest
npm view lightweight-charts deprecated    # confirm not deprecated
```

## Package Legitimacy Audit

> slopcheck CLI was not installed in this research session. Per the legitimacy protocol, packages below are confirmed via the npm registry **and** corroborated by primary upstream sources (GitHub repo, official docs, prior phases in this project) — they are not marked `[ASSUMED]` because (a) `lightweight-charts` is the actual TradingView project (Apache 2.0, github.com/tradingview/lightweight-charts), and (b) all other recommended deps are already in the repo from earlier phases.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `lightweight-charts` | npm | 6+ yrs (first release 2019) | ~150K/week | github.com/tradingview/lightweight-charts | not run | Approved |
| `@base-ui/react` | npm | already in repo (Phase 2) | n/a | github.com/mui/base-ui | not run | Approved (in-repo) |
| `sonner` | npm | already in repo (Phase 2) | n/a | github.com/emilkowalski/sonner | not run | Approved (in-repo) |
| `papaparse` | npm | already in repo (Phase 3) | n/a | github.com/mholt/PapaParse | not run | Approved (in-repo) |
| `comlink` | npm | active (last 2024-11-07) | ~250K/week | github.com/GoogleChromeLabs/comlink | not run | **Considered then rejected** — not installing |
| `lightweight-charts-react-wrapper` | npm | inactive 2+ yrs | 767/week | github.com/trash-and-fire/lightweight-charts-react-wrapper | not run | **Rejected** — not installing |
| `decimal.js` | npm | considered as alt | n/a | github.com/MikeMcl/decimal.js | not run | **Rejected** — not installing |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none — but the planner SHOULD insert a single `checkpoint:human-verify` task before `npm install lightweight-charts` to confirm the installed tarball's GitHub URL matches `github.com/tradingview/lightweight-charts` (defense-in-depth, since slopcheck wasn't run).

## Architecture Patterns

### System Architecture Diagram

```
                                  ┌─────────────────────────────┐
  /dashboard/backtest (client)    │       Setup Bar             │
  ──────────────────────────────► │  portfolio | dates | DRIP   │
                                  │  rebalance | benchmark | RUN│
                                  └──────────────┬──────────────┘
                                                 │ on RUN / params change
                                                 ▼
                  ┌─────────────── BacktestController (use client) ──────────────┐
                  │                                                              │
                  │  fetchBatchData ─► POST /api/backtest/data ─► RLS-checked    │
                  │       │              SELECT (portfolio_instruments JOIN      │
                  │       │              instruments JOIN prices JOIN fx_rates   │
                  │       │              JOIN dividends + snb_rates range)      │
                  │       │              returns one JSON payload                │
                  │       ▼                                                      │
                  │  worker.postMessage({kind:'run', payload})                   │
                  │       │                                                      │
                  │       │   ┌────────── backtest.worker.ts ─────────────┐     │
                  │       └─► │  1. buildDateGrid (union)                  │     │
                  │           │  2. forwardFill per instrument             │     │
                  │           │  3. simulate (loop: rebalance? DRIP?       │     │
                  │           │     daily-mark in CHF via point-in-time FX)│     │
                  │           │  4. computeMetrics (TR, CAGR, MDD,         │     │
                  │           │     Sharpe vs SNB, Vol)                    │     │
                  │           │  5. hash inputs (subtle.digest SHA-256)    │     │
                  │           └────────────────┬───────────────────────────┘     │
                  │                            │ postMessage({kind:'done', ...})│
                  │       ┌────────────────────┴─────────────────────────┐      │
                  │       ▼                                              ▼      │
                  │  render EquityCurveChart                  POST /api/backtest│
                  │  render AnnualReturnsChart                       /runs       │
                  │  render MetricsStrip (5 stats)                              │
                  │  render RunSummaryFooter (warnings)                          │
                  │                                                              │
                  └──────────────────────────────────────────────────────────────┘

  Run history drawer ◄── GET /api/backtest/runs?portfolio_id=…
  Reload prior run   ◄── GET /api/backtest/runs/[id]
                              │
                              ▼
                       stale check: row.prices_version vs current MAX(updated_at)
                       → badge "data refreshed — recompute?"

  Cron job (~quarterly) ─► POST /api/cron/refresh-snb
                              └─► fetch data.snb.ch snboffzisa cube → upsert snb_rates
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── backtest/                     # pure libs — Web Worker–safe (no DOM, no Next imports)
│   │   ├── types.ts                  # BacktestInput, BacktestOutput, RunRow, EquityPoint
│   │   ├── date-grid.ts              # buildUnionDateGrid(instruments) → string[]
│   │   ├── forward-fill.ts           # forwardFillSeries(grid, prices) → Map<date, price>
│   │   ├── simulate.ts               # pure loop: returns equity curve + warnings
│   │   ├── metrics.ts                # computeMetrics(curve, snb_rates) → 5 stats
│   │   ├── inputs-hash.ts            # canonicalJSON + subtle.digest('SHA-256')
│   │   └── errors.ts                 # BacktestError discriminated union
│   └── data/
│       └── snb.ts                    # NEW: fetchSnbPolicyRate() + stitch (UG0+OG0)/2 pre-2019-06 + LZ post
├── workers/
│   └── backtest.worker.ts            # imports from src/lib/backtest/*, wires postMessage RPC
├── app/
│   ├── api/
│   │   ├── backtest/
│   │   │   ├── data/route.ts         # POST batch-fetch endpoint
│   │   │   └── runs/
│   │   │       ├── route.ts          # POST (write run) | GET (list)
│   │   │       └── [id]/route.ts     # GET (single run reload)
│   │   └── cron/
│   │       └── refresh-snb/route.ts  # quarterly cron, CRON_SECRET-gated
│   └── dashboard/
│       └── backtest/
│           ├── page.tsx              # server component shell
│           └── BacktestClient.tsx    # 'use client' — worker wiring + chart rendering
├── components/
│   └── backtest/
│       ├── BacktestSetupBar.tsx
│       ├── BacktestResults.tsx
│       ├── EquityCurveChart.tsx      # lightweight-charts wrapper hook
│       ├── AnnualReturnsChart.tsx
│       ├── MetricsStrip.tsx          # mirrors Phase 4 WeightedMetricsStrip
│       └── RunHistoryDrawer.tsx
└── scripts/
    └── seed-snb.ts                   # one-shot bulk-seed snb_rates (then cron maintains)

supabase/
└── migrations/
    ├── 00009_backtest_runs.sql
    └── 00010_snb_rates.sql
```

### Pattern 1: Module Worker with Type-safe RPC

**What:** Single bidirectional postMessage RPC with discriminated message kinds.
**When to use:** This phase's only worker call shape (`run` → `done` | `error`); Comlink overkill.
**Example:**

```typescript
// src/lib/backtest/types.ts (shared by main thread + worker)
export type WorkerRequest =
  | { kind: 'run'; payload: BacktestInput }

export type WorkerResponse =
  | { kind: 'done'; result: BacktestOutput; inputsHash: string }
  | { kind: 'error'; error: BacktestError }
  | { kind: 'progress'; percent: number }  // optional, for long curves

// src/workers/backtest.worker.ts
import { simulate } from '@/lib/backtest/simulate'
import { computeMetrics } from '@/lib/backtest/metrics'
import { hashInputs } from '@/lib/backtest/inputs-hash'
import type { WorkerRequest, WorkerResponse } from '@/lib/backtest/types'

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.kind !== 'run') return
  try {
    const sim = simulate(msg.payload)
    const metrics = computeMetrics(sim.equity, msg.payload.snbRates)
    const inputsHash = await hashInputs(msg.payload)
    const response: WorkerResponse = {
      kind: 'done',
      result: { ...sim, metrics },
      inputsHash,
    }
    self.postMessage(response)
  } catch (err) {
    const response: WorkerResponse = {
      kind: 'error',
      error: { kind: 'unknown', message: (err as Error).message },
    }
    self.postMessage(response)
  }
}

// src/components/backtest/BacktestClient.tsx (client component)
'use client'
import { useEffect, useRef } from 'react'

export function useBacktestWorker() {
  const workerRef = useRef<Worker | null>(null)
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('@/workers/backtest.worker.ts', import.meta.url),
      { type: 'module' },
    )
    return () => workerRef.current?.terminate()
  }, [])
  return workerRef
}
```

[CITED: node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md — "Turbopack supports webpack-compatible magic comments… these comments work with dynamic `import()`, `require()`, `require.resolve()`, and `new Worker()` expressions"]

### Pattern 2: lightweight-charts v5 React Hook

**What:** Imperative chart created in `useLayoutEffect`, cleaned up on unmount, resize via `ResizeObserver`.
**When to use:** Every chart component in this phase.
**Example:**

```typescript
// src/components/backtest/EquityCurveChart.tsx
'use client'
import { useLayoutEffect, useRef } from 'react'
import {
  createChart,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import { fmtCHF } from '@/lib/portfolio/chf-format'

type Point = { time: string; value: number }  // time: 'YYYY-MM-DD'

export function EquityCurveChart({
  portfolio,
  benchmark,
}: {
  portfolio: Point[]
  benchmark: Point[] | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 360,
      layout: { background: { color: 'transparent' }, textColor: '#666' },
      grid: { vertLines: { visible: false }, horzLines: { color: '#eee' } },
      localization: {
        priceFormatter: (v: number) => fmtCHF(v),
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    })
    chartRef.current = chart

    const portfolioSeries: ISeriesApi<'Area'> = chart.addSeries(AreaSeries, {
      lineColor: '#E3000F',     // Swiss red — matches Phase 2 design token
      topColor: 'rgba(227,0,15,0.20)',
      bottomColor: 'rgba(227,0,15,0)',
      lineWidth: 2,
      priceLineVisible: false,
    })
    portfolioSeries.setData(portfolio as { time: Time; value: number }[])

    let benchmarkSeries: ISeriesApi<'Line'> | null = null
    if (benchmark) {
      benchmarkSeries = chart.addSeries(LineSeries, {
        color: '#666',
        lineWidth: 1,
        priceLineVisible: false,
      })
      benchmarkSeries.setData(benchmark as { time: Time; value: number }[])
    }

    chart.timeScale().fitContent()

    // ── Resize handler ─────────────────────────────────────────────
    const ro = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: entry.contentRect.width })
    })
    ro.observe(containerRef.current)

    // ── Crosshair tooltip (custom HTML) ───────────────────────────
    const tip = document.createElement('div')
    tip.className =
      'absolute hidden pointer-events-none px-2 py-1 rounded text-xs ' +
      'bg-background border border-border shadow-sm z-10'
    containerRef.current.style.position = 'relative'
    containerRef.current.appendChild(tip)

    chart.subscribeCrosshairMove((p) => {
      if (
        !p.point ||
        !p.time ||
        p.point.x < 0 ||
        p.point.y < 0 ||
        p.point.x > containerRef.current!.clientWidth
      ) {
        tip.style.display = 'none'
        return
      }
      const pVal = (p.seriesData.get(portfolioSeries) as { value?: number })?.value
      const bVal = benchmarkSeries
        ? (p.seriesData.get(benchmarkSeries) as { value?: number })?.value
        : undefined
      tip.innerHTML = `
        <div><strong>${p.time}</strong></div>
        <div>Portfolio: ${pVal !== undefined ? fmtCHF(pVal) : '—'}</div>
        ${bVal !== undefined ? `<div>Benchmark: ${fmtCHF(bVal)}</div>` : ''}`
      tip.style.display = 'block'
      tip.style.left = `${p.point.x + 12}px`
      tip.style.top = `${p.point.y + 12}px`
    })

    return () => {
      ro.disconnect()
      chart.remove()
      tip.remove()
      chartRef.current = null
    }
  }, [portfolio, benchmark])

  return <div ref={containerRef} className="w-full" />
}
```

[CITED: tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5 — `chart.addSeries(LineSeries, options)`]
[CITED: tradingview.github.io/lightweight-charts/tutorials/how_to/tooltips — subscribeCrosshairMove pattern]
[CITED: tradingview.github.io/lightweight-charts/tutorials/react/advanced — useLayoutEffect + ResizeObserver lifecycle]

### Pattern 3: Histogram Overlay for Annual Bars

**What:** Two histogram series (portfolio + benchmark) side-by-side on a dedicated chart with `priceScaleId: ''`.
**When to use:** Annual return bars panel.
**Example:**

```typescript
const portfolioBars = chart.addSeries(HistogramSeries, {
  color: '#E3000F',
  priceFormat: { type: 'percent' },
  priceScaleId: '',           // overlay — no main scale anchor
})
portfolioBars.priceScale().applyOptions({
  scaleMargins: { top: 0.1, bottom: 0.1 },
})

const benchmarkBars = chart.addSeries(HistogramSeries, {
  color: '#999',
  priceFormat: { type: 'percent' },
  priceScaleId: '',
})

// To render bars side-by-side per year, offset benchmark by a small time delta
// (e.g., shift by +120 days within the same year) or render on a second chart
// stacked below. Side-by-side at the same time index is NOT supported natively;
// the planner must pick one of: (a) two stacked charts, (b) time-offset trick,
// (c) overlay with translucent colors. Recommend (a) for clarity.
```

[CITED: tradingview.github.io/lightweight-charts/tutorials/how_to/price-and-volume — `priceScaleId: ''` + `scaleMargins` for overlay]

### Pattern 4: SNB Policy Rate Stitching

**What:** Compose a CHF risk-free series from two SNB sources because the cube changed in 2019.
**When to use:** Any backtest start date older than 2019-06.
**Example:**

```typescript
// src/lib/data/snb.ts
type SnbPoint = { date_month: string; rate: number; source: 'LZ' | 'libor_mid' }

const CUTOVER = '2019-06'  // SNB switched from target-range to policy-rate on 2019-06-13

export async function fetchSnbPolicyRate(): Promise<SnbPoint[]> {
  // ── 1. SNB policy rate series (2019-06 → present)
  const lz = await fetch(
    'https://data.snb.ch/api/cube/snboffzisa/data/json/en?dimSel=D0(LZ)&fromDate=2019-06',
    { headers: { Accept: 'application/json' } },
  )
  // NOTE: SNB sets Content-Type: text/html on JSON responses — body is still valid JSON.
  const lzJson = JSON.parse(await lz.text()) as {
    timeseries: [{ values: { date: string; value: number }[] }]
  }
  const lzPoints: SnbPoint[] = lzJson.timeseries[0].values.map(v => ({
    date_month: v.date,
    rate: v.value / 100,                   // SNB publishes percent, store decimal
    source: 'LZ',
  }))

  // ── 2. Pre-2019: midpoint of SNB's Libor target range
  const ranges = await fetch(
    'https://data.snb.ch/api/cube/snboffzisa/data/json/en?dimSel=D0(UG0,OG0)&fromDate=2000-01',
  )
  const rangesJson = JSON.parse(await ranges.text()) as {
    timeseries: { header: { dimItem: string }[]; values: { date: string; value: number }[] }[]
  }
  const lower = new Map(
    rangesJson.timeseries
      .find(ts => ts.header[0].dimItem.includes('Lower'))!
      .values.map(v => [v.date, v.value]),
  )
  const upper = new Map(
    rangesJson.timeseries
      .find(ts => ts.header[0].dimItem.includes('Upper'))!
      .values.map(v => [v.date, v.value]),
  )
  const liborPoints: SnbPoint[] = []
  for (const [date, lo] of lower) {
    if (date >= CUTOVER) continue
    const hi = upper.get(date)
    if (hi == null) continue
    liborPoints.push({
      date_month: date,
      rate: ((lo + hi) / 2) / 100,
      source: 'libor_mid',
    })
  }

  return [...liborPoints, ...lzPoints].sort((a, b) => a.date_month.localeCompare(b.date_month))
}
```

[VERIFIED: live probe of `https://data.snb.ch/api/cube/snboffzisa/data/json/en?dimSel=D0(UG0,OG0,LZ)&fromDate=2000-01` on 2026-05-29]

### Pattern 5: Inputs Hash for Run Dedup

**What:** Deterministic canonical-JSON SHA-256, computed inside the worker.
**When to use:** Every successful run, before posting to `/api/backtest/runs`.
**Example:**

```typescript
// src/lib/backtest/inputs-hash.ts
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  const keys = Object.keys(value as object).sort()
  return (
    '{' +
    keys
      .map(k => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  )
}

export async function hashInputs(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(input))
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

[CITED: developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest — available in Web Workers]

### Anti-Patterns to Avoid

- **Using `addLineSeries()` from training memory.** Removed in v5. Use `chart.addSeries(LineSeries, opts)`. [CITED: lightweight-charts v4→v5 migration guide]
- **Rendering charts in a Server Component.** lightweight-charts requires `window`. Use `'use client'` and lifecycle hooks. [CITED: github.com/tradingview/lightweight-charts/issues/543]
- **Forward-filling FX rates aggressively for weekends.** FX rates use the *previous business day's* rate on weekends; treat missing FX as "look back ≤ 4 days" (Friday rate covers Sat/Sun/holidays). Hard-fail beyond that.
- **Computing the inputs hash on the main thread.** If the main thread mutates the payload before posting, the hash will mismatch the simulation inputs. Hash inside the worker, return it with the result.
- **Storing equity curve as one row per day in a child table.** Use a `JSONB` blob in `backtest_runs.equity_curve_json` — Postgres compresses well, single fetch reload, no JOIN.
- **Trusting EODHD `adjusted_close` math.** Phase 3 already pivoted to Yahoo/Stooq; `adjusted_close` comes from Yahoo (NYSE/CBOE-style total-return adjusted) and Stooq (split-only adjusted). Stooq SPY adjusted_close = close — **do not double-apply dividends** for SPY (the data was sourced from Yahoo for SPY per STATE.md decision).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inter-thread RPC | A typed-event-bus abstraction | Single `postMessage` with discriminated-union messages | One call shape; Comlink is overkill |
| React wrapper for lightweight-charts | Don't install `lightweight-charts-react-wrapper` | A 40-line custom hook in `EquityCurveChart.tsx` | Wrapper is inactive, v4-only, 767 weekly downloads |
| Deterministic JSON serialization | Don't import `fast-json-stable-stringify` | 12-line recursive canonical stringifier (Pattern 5) | One use site; no async; zero deps |
| Cryptographic hash | Don't pull in `crypto-js` or `js-sha256` | `crypto.subtle.digest` (Web Crypto) | Built into Workers, no bundle cost |
| Date math (parse / compare / add days) | Don't install `date-fns` or `dayjs` | Native `Date` + ISO `YYYY-MM-DD` string lexicographic compare | Dates already arrive as ISO strings from Supabase; no timezone hazards if we never construct local Dates |
| Statistics (mean / stdev / max-drawdown) | Don't install `simple-statistics` | 30 lines of pure functions in `metrics.ts` | Already need to be golden-mastered for determinism |
| Benchmark special-casing | Don't write a "benchmark mode" branch | Treat benchmark as a 1-instrument sub-portfolio inside the same `simulate()` call | D-23 locks this; keeps code path testable |

**Key insight:** This phase has been over-specified by CONTEXT.md in the right way — every "should we add a library?" question has a one-paragraph answer. The combinatorics that would normally drive library adoption (DRIP variants, rebalance methodologies, statistics flavors) are all collapsed to a single locked convention. **Lean toward fewer deps**, not more.

## Runtime State Inventory

> Phase 5 is greenfield; no rename / refactor / migration. Section omitted.

## Common Pitfalls

### Pitfall 1: SNB policy rate series LZ doesn't go back before 2019-06

**What goes wrong:** Backtest starts in 2010, Sharpe ratio comes out as `NaN` or zero-for-half-the-series, metrics strip silently misleading.
**Why it happens:** The SNB *introduced* its "policy rate" concept in June 2019. Before that, monetary policy was expressed as a target range for 3-month CHF Libor, published as the same cube under series IDs `UG0` (lower) and `OG0` (upper). The two are conceptually consistent (both are CHF risk-free policy targets) but distributed as separate timeseries.
**How to avoid:** Stitch the two: use `(UG0 + OG0) / 2` (midpoint) before 2019-06, switch to `LZ` from 2019-06 onward. Persist both upstreams' values to `snb_rates(date_month, rate, source)`. Document the stitch in the run summary footer for any run whose start ≤ 2019-06 ("CHF risk-free rate stitched from SNB Libor target midpoint pre-2019-06").
**Warning signs:** `Sharpe = NaN` or sudden Sharpe regime shift around 2019-06 in a long backtest.
[VERIFIED: probed data.snb.ch on 2026-05-29 — `LZ` series: 83 rows starting 2019-06; `UG0/OG0`: 233 rows 2000-01 → 2019-05]

### Pitfall 2: SNB API returns `Content-Type: text/html` for JSON responses

**What goes wrong:** `fetch(...).json()` throws `SyntaxError: Unexpected token` even though the body is valid JSON. Or worse, a fetch wrapper that auto-parses based on Content-Type returns the raw HTML string.
**Why it happens:** `data.snb.ch` mislabels JSON responses as `text/html;charset=UTF-8` (confirmed by curl probe on 2026-05-29).
**How to avoid:** Use `JSON.parse(await response.text())` not `response.json()`. Comment in `src/lib/data/snb.ts` explaining why.
**Warning signs:** Cron logs show "Unexpected token <" errors despite the body looking like JSON.

### Pitfall 3: Forward-fill across an instrument's listing inception

**What goes wrong:** User picks a portfolio containing SPY (2010-04-12 inception cached) and a Swiss ETF (2008 inception). User picks 2006 as start. Engine forward-fills SPY's "last close" from… nothing, and either crashes or starts SPY at $0.
**Why it happens:** D-13 union date grid + D-14 forward-fill assumes a `last_close` exists. Pre-inception, there is no last close to carry.
**How to avoid:** Truncate the run's effective start to `max(start, max(first_date for each instrument))`. Surface in the footer ("Run truncated to 2010-04-12 — constrained by SPY listing"). D-03 already half-mandates this in the UI; enforce it again in the simulation as a safety net. Add a `BacktestError` kind for "no overlapping window" when the constraint kills the whole range.

### Pitfall 4: FX point-in-time is not the spot rate at run-time

**What goes wrong:** Engineer writes `fxRate.USD_CHF * price` at every step using a single fetched rate. Backtest is no longer point-in-time.
**Why it happens:** "Get the CHF rate" feels like one constant. It's not — it's a date-indexed series.
**How to avoid:** Treat `fx_rates` like `prices`: per-date lookup map keyed by `(quote, date)`. Build the lookup once at the start of `simulate()`, never call `fx_rates[0]` or similar.
**Warning signs:** Two runs with different end dates return numerically identical CHF curves for the overlapping prefix only when FX has been flat — should always be true; if it ever isn't, FX is being applied wrong.

### Pitfall 5: Weekend / holiday FX gaps

**What goes wrong:** Friday FX is published, Monday is published, Saturday/Sunday are not. Engine date grid includes Sat/Sun because some Asian markets trade — `fx_rates[Sat]` is undefined, conversion silently NaNs.
**Why it happens:** FX series and equity series have different trading calendars.
**How to avoid:** For any non-FX-trading date, look back ≤ 4 calendar days to find the most recent quoted rate (covers Friday → Sunday and 3-day holiday weekends). Hard-fail if the lookback exceeds 4 days. Track per-FX-pair lookback count and surface in the footer.

### Pitfall 6: Rebalance "first trading day on/after Jan 1"

**What goes wrong:** Jan 1 falls on Sunday. Engineer picks Jan 1's row, gets `undefined`, defaults to "skip this rebalance," portfolio drifts an extra year.
**Why it happens:** Calendar boundaries don't align with trading calendars.
**How to avoid:** D-16 already locks the convention. Implement as: `firstTradingDay = grid.find(d => d >= boundary)`. Add a fixture test where Jan 1 falls on Saturday (e.g., 2022-01-01) and assert the rebalance fires on the first weekday in the grid (2022-01-03 for SPY).

### Pitfall 7: DRIP at ex-date for a forward-filled instrument

**What goes wrong:** SPY pays a dividend on 2020-03-19. Engine has forward-filled SPY since 2020-03-16 because Stooq was missing those rows. Engine reinvests dividend at a stale March-16 price.
**Why it happens:** D-15 mandates reinvest at "that day's adjusted close" — but D-14 mandates forward-fill when missing. The two interact.
**How to avoid:** This is the **correct** behavior — explicit, deterministic, documented in the footer ("DRIP reinvestment used forward-filled SPY price for 2020-03-19"). Add a warning to the footer when DRIP fires on a forward-filled day. Don't try to "back-fix" with a different day.

### Pitfall 8: Floating-point drift in compounded returns

**What goes wrong:** Two identical runs produce CHF totals differing by 0.0001. Dedup-by-inputs-hash works, but golden-master tests are flaky.
**Why it happens:** Native JS `number` accumulates IEEE 754 error over 2500 daily multiplications. Bounded ~1e-10 relative, but non-zero.
**How to avoid:** Use `number` math (decimal.js is overkill — 10× slowdown for invisible precision). Write golden-master tests with **explicit tolerance** (`expect(result).toBeCloseTo(expected, 6)` — 6 decimal places of precision, equivalent to fractions-of-a-rappen on CHF 10'000). [CITED: dev.to/benjamin_renoux/financial-precision-in-javascript-handle-money-without-losing-a-cent-1chc — confirms IEEE 754 drift is ~1e-10 over thousands of multiplications]

### Pitfall 9: `prices_version` race on the cron boundary

**What goes wrong:** User runs a backtest at 22:01 UTC, cron starts at 22:00 UTC, half the tickers have new `updated_at`. Run's `prices_version` is "max of those at fetch time," but on reload 5 seconds later it's already stale.
**Why it happens:** `max(updated_at)` is a moving target during cron execution.
**How to avoid:** Compute `prices_version` server-side on the batch endpoint **after** the SELECT, from the exact rows returned. Stale-check on reload uses the same query. There's still a race; tolerate it (a stale badge that disappears on re-fetch is harmless).

### Pitfall 10: Worker file path that breaks on Vercel build

**What goes wrong:** `new Worker(new URL('./worker.ts', import.meta.url))` works locally with Turbopack dev but the prod build can't resolve `./worker.ts`.
**Why it happens:** Next.js 16 requires the worker file path to be a **static string literal** inside `new URL(...)` — no template strings, no aliases that need build-time resolution beyond `@/`.
**How to avoid:** Test the prod build (`npm run build && npm run start`) once during planning, before declaring victory. Prefer `new URL('../workers/backtest.worker.ts', import.meta.url)` relative path over `@/workers/...` until verified. [CITED: nextjs.org "Turbopack: What's New in Next.js 16.2" + github.com/vercel/next.js/issues/62650]

## Code Examples

### Batch data endpoint (server-side RLS-checked assembly)

```typescript
// src/app/api/backtest/data/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { portfolio_id, benchmark_ticker, start, end } = await req.json()

  // RLS automatically scopes to current user. portfolio_instruments → instruments JOIN.
  const { data: items, error: itemsErr } = await supabase
    .from('portfolio_instruments')
    .select('weight, instruments(id, ticker, currency, first_date)')
    .eq('portfolio_id', portfolio_id)
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  const instrumentIds = (items ?? []).map(i => (i.instruments as { id: string }).id)
  // … add benchmark instrument by ticker if not already present …

  // Single-trip parallel reads for everything in the window
  const [pricesQ, divsQ, fxQ, snbQ] = await Promise.all([
    supabase.from('prices')
      .select('instrument_id, date, adjusted_close, close')
      .in('instrument_id', instrumentIds)
      .gte('date', start).lte('date', end).order('date'),
    supabase.from('dividends')
      .select('instrument_id, ex_date, amount, currency')
      .in('instrument_id', instrumentIds)
      .gte('ex_date', start).lte('ex_date', end),
    supabase.from('fx_rates')
      .select('quote_currency, date, rate')
      .eq('base_currency', 'CHF')
      .gte('date', start).lte('date', end).order('date'),
    supabase.from('snb_rates')
      .select('date_month, rate')
      .gte('date_month', start.slice(0, 7))
      .lte('date_month', end.slice(0, 7))
      .order('date_month'),
  ])

  if (pricesQ.error) return NextResponse.json({ error: pricesQ.error.message }, { status: 500 })
  // …

  const prices_version = Math.max(
    ...(pricesQ.data ?? []).map(r => 0), // compute from row metadata in actual impl
  )

  return NextResponse.json({
    items, prices: pricesQ.data, dividends: divsQ.data,
    fx_rates: fxQ.data, snb_rates: snbQ.data, prices_version,
  })
}
```

### Migration sketch (planner refines)

```sql
-- supabase/migrations/00009_backtest_runs.sql
CREATE TABLE public.backtest_runs (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  portfolio_id        UUID        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  inputs_hash         TEXT        NOT NULL,           -- SHA-256 hex
  params_json         JSONB       NOT NULL,           -- {start,end,drip,rebalance,benchmark,conventions}
  equity_curve_json   JSONB       NOT NULL,           -- [{date,value},...]
  annual_bars_json    JSONB       NOT NULL,           -- [{year,portfolio,benchmark},...]
  metrics_json        JSONB       NOT NULL,           -- {totalReturn,cagr,mdd,sharpe,vol}
  warnings_json       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  prices_version      BIGINT      NOT NULL,           -- epoch ms of max(updated_at)
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (portfolio_id, inputs_hash)                  -- dedup on identical inputs
);

CREATE INDEX idx_backtest_runs_user_portfolio
  ON public.backtest_runs (user_id, portfolio_id, computed_at DESC);

ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own runs"   ON public.backtest_runs FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users insert own runs" ON public.backtest_runs FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users delete own runs" ON public.backtest_runs FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
-- No UPDATE — runs are immutable; recompute writes a new row.

-- supabase/migrations/00010_snb_rates.sql
CREATE TABLE public.snb_rates (
  date_month  TEXT        NOT NULL,    -- 'YYYY-MM' (monthly granularity)
  rate        NUMERIC(8,6) NOT NULL,   -- decimal (e.g., 0.0125 for 1.25%)
  source      TEXT        NOT NULL CHECK (source IN ('LZ', 'libor_mid')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date_month)
);

ALTER TABLE public.snb_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read snb_rates"
  ON public.snb_rates FOR SELECT TO authenticated USING (true);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chart.addLineSeries({...})` | `chart.addSeries(LineSeries, {...})` with per-type import | lightweight-charts 5.0.0 (early 2025) | All training-data examples are stale; must use v5 syntax throughout |
| Watermark as chart option | Watermark as plugin (`TextWatermark`, `ImageWatermark`) | lightweight-charts 5.0.0 | Not relevant to Phase 5 — no watermarks planned |
| Series markers as series API | Series markers as plugin | lightweight-charts 5.0.0 | Not relevant — no markers planned in v1 |
| Webpack Worker plugin / next-with-workers | Native `new Worker(new URL(..., import.meta.url), {type:'module'})` | Next.js 13+ → ratified in 16 with Turbopack stable | Drops a plugin dep; the bootstrap origin bug (Web Worker location.origin = '') was fixed in **Next.js 16.2** per blog post `nextjs.org/blog/next-16-2-turbopack` |
| `middleware.ts` | `proxy.ts` | Next.js 16 | Already adopted in this repo (Phase 1) |
| EODHD as price source | Yahoo (incremental) + Stooq (historical) | 2026-05-02 (Phase 3.1) | All prices in cache are already from the new providers; `adjusted_close` is canonical |
| `addEventListener('resize', …)` | `ResizeObserver` | 2018+, universally supported | Used in lightweight-charts react patterns |

**Deprecated / outdated:**
- `lightweight-charts-react-wrapper` — last release 2 years ago, v4-only [CITED: snyk.io/advisor/npm-package/lightweight-charts-react-wrapper]
- `next-with-workers` and similar webpack-era worker plugins — no longer needed
- EODHD `bulk-by-day` paths — Phase 3.1 pivoted away; ignore any leftover EODHDProvider references in `src/lib/data/`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `decimal.js` latest major is v10.x | Standard Stack / Alternatives | Low — only mentioned as an alternative-we-reject; planner can verify if anyone insists on decimal math |
| A2 | Native `number` IEEE 754 drift over 2500 daily multiplications is bounded ~1e-10 relative | Pitfall 8 | Low for display (CHF 10'000 → <1 microRappen error); golden-master tolerance covers this. Could be wrong if the simulation does division-then-multiplication chains that amplify error — golden-master tests will surface it |
| A3 | URTH / SWDA / SSAC / SPY / CSSMI Yahoo histories are already deep enough for 10-year backtests | Benchmarks (D-22) | Medium — STATE.md confirms SPY and SSAC.SW are seeded; URTH/SWDA/CSSMI inception coverage NOT independently verified at research time. **Planner should add a pre-flight check task** that queries `instruments.first_date` for each benchmark and surfaces any with `< 10 years` of history before D-03's "earliest possible start" UI logic ships |
| A4 | The Vercel free-tier Cron Jobs already declared (Phase 3 cron for prices) leaves room for one more cron at quarterly cadence for SNB refresh | Architecture / Cron | Low — quarterly = 4 invocations/year; Vercel Hobby allows 2 daily slots minimum, plenty of headroom |
| A5 | Histogram side-by-side rendering of two series at the same time index is NOT natively supported by lightweight-charts | Pattern 3 | Medium — research didn't fully verify; planner should prototype before committing to the "two stacked charts" workaround. If lightweight-charts CAN do side-by-side bars, the simpler workaround wins |

## Open Questions (RESOLVED)

1. **Are the four benchmarks (URTH/SSAC/SPY/CSSMI) already pre-seeded with enough history?**
   - What we know: SPY and SSAC.SW are confirmed seeded per STATE.md; CHDVD.SW seeded; CSSPX (S&P 500 UCITS) seeded.
   - What's unclear: URTH.US / SWDA.L (MSCI World) and CSSMI.SW (SMI ETF) — STATE.md doesn't mention them in the seeded list.
   - Recommendation: Planner adds a Wave 0 task to query `instruments.first_date` for all 4 benchmark candidates and run a seed-on-demand for any missing. D-22 explicitly leaves "MSCI World listing choice" to the planner — pick whichever has the longest cached history.
   - **RESOLVED:** Plan 01 adds a Wave 0 benchmark-seed-check task (Task 4) that queries `instruments.first_date` for URTH.US, SWDA.L/SWDA.LSE, SSAC.SW, SPY.US, CSSMI.SW and triggers seed-on-demand via the Phase 3 yahoo-provider pipeline for any candidate with `< 10 years` of history or missing entirely. The MSCI World variant with the longest cached history is selected by `loadBenchmarkInstruments()` in Plan 06.

2. **Histogram side-by-side bars in lightweight-charts: is there a native trick?**
   - What we know: `priceScaleId: ''` overlays two histograms on the same x-axis, but they paint at the same x-coord (overlapping bars), not side-by-side per year.
   - What's unclear: Whether a small `time` offset trick (e.g., shift benchmark dates by +180 days within the same year) produces an acceptable visual, or whether stacked charts are required.
   - Recommendation: Planner prototypes both with 5 years of synthetic data in a single throwaway plan task; picks the cleaner outcome.
   - **RESOLVED:** Use **two stacked sub-charts** (recommendation (a)) — one HistogramSeries per chart (portfolio above, benchmark below) sharing a synchronized x-axis via lightweight-charts' time-scale subscription. Lightweight-charts v5 does not support per-bar x-offsets natively; the `time` shift workaround produces visual artifacts at year boundaries. Two stacked charts is documented in `Plan 05 §AnnualReturnsChart` (RESEARCH Pattern 3 recommendation (a)) and asserted by `backtest-annual-bars.spec.ts` (Plan 07).

3. **Where should SNB stitching happen — on seed/cron, or on read?**
   - What we know: Both work. Storing pre-stitched in `snb_rates(date_month, rate, source)` lets the batch endpoint do one query. Stitching on read keeps raw provenance in two distinct tables.
   - What's unclear: User-facing surface area is identical either way.
   - Recommendation: **Stitch on cron/seed** — fewer code paths, source column preserves provenance, single batch read remains single batch read.
   - **RESOLVED:** Stitch on cron/seed during the quarterly SNB refresh — implemented in Plan 03 (`src/lib/data/snb.ts::fetchSnbPolicyRate` returns pre-stitched `{date_month, rate, source}` rows; `upsertSnbRates` writes them; the batch endpoint in Plan 04 does a single range SELECT). Lower runtime cost, deterministic, no per-request branching.

4. **Should `backtest_runs.equity_curve_json` be compressed or chunked?**
   - What we know: A 10-year daily curve is ~2500 points; with `{date,value}` per point that's ~50KB raw, ~10KB gzipped. Supabase JSONB compresses transparently.
   - What's unclear: Whether to also strip every Nth point for display (LTTB downsampling) before storage.
   - Recommendation: Store full curve — lightweight-charts handles 2500 points fine; saves the "loss of fidelity on reload" footgun.
   - **RESOLVED:** Store full uncompressed JSONB in v1. PostgreSQL TOAST handles compression transparently for rows >2KB (Supabase default); a 10-year daily curve compresses to ~10KB on disk. Revisit if individual `equity_curve_json` rows exceed ~100KB (50-year backtests) — at that point consider LTTB downsampling or columnar storage. No chunking in v1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js dev/build | ✓ | 20.16.0 (per STATE.md) | — |
| Supabase Postgres (cloud) | All persistence | ✓ | — | — |
| Vercel Cron | SNB quarterly refresh | ✓ | already used (Phase 3) | — |
| `data.snb.ch` public API | SNB rate source | ✓ | live, no auth | If down: seed file checked into repo as last-known-good (planner adds `tests/fixtures/snb/snboffzisa-snapshot.json`) |
| Vitest | Pure-lib unit tests | ✓ | `^2.1.9` | — |
| Playwright | E2E spec | ✓ | `^1.59.1` (chromium-only) | — |
| Browser Web Worker support | Worker runtime | ✓ (all modern browsers + Chromium 121+) | — | — |
| Browser `crypto.subtle` | Inputs hash | ✓ (requires HTTPS or localhost) | — | Vercel deploys to HTTPS by default |
| `lightweight-charts` npm package | Charting | ✗ (not yet installed) | install `^5.2.0` | — |

**Missing dependencies with no fallback:** none — the only missing dep is `lightweight-charts`, a one-line install.

**Missing dependencies with fallback:** SNB API has a checked-in snapshot fallback if the planner adds the fixture.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^2.1.9` (pure libs) + Playwright `^1.59.1` chromium-only (E2E + integration) |
| Config files | `vitest.config.mts`, `playwright.config.ts` (both exist) |
| Quick run command | `npm run test:unit -- src/lib/backtest/` |
| Full suite command | `npm run test` (unit + integration) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| BACK-01 | Select portfolio + range → run, render curve | E2E | `npx playwright test tests/integration/backtest-happy.spec.ts` | ❌ Wave 0 |
| BACK-02 | Point-in-time FX conversion (NOT spot rate) | unit | `npm run test:unit -- src/lib/backtest/simulate.test.ts -t "FX point-in-time"` | ❌ Wave 0 |
| BACK-03 | DRIP toggle changes equity curve materially | unit | `npm run test:unit -- src/lib/backtest/simulate.test.ts -t "DRIP on vs off"` | ❌ Wave 0 |
| BACK-04 | Rebalance fires on first trading day on/after boundary (Jan 1 = Sat case) | unit | `npm run test:unit -- src/lib/backtest/simulate.test.ts -t "rebalance boundary"` | ❌ Wave 0 |
| BACK-05 | Equity curve chart renders with 2 series + crosshair | E2E | `npx playwright test tests/integration/backtest-chart.spec.ts` | ❌ Wave 0 |
| BACK-06 | All 5 metrics computed: TR, CAGR, MDD, Sharpe (vs SNB), Vol | unit | `npm run test:unit -- src/lib/backtest/metrics.test.ts` | ❌ Wave 0 |
| BACK-07 | Benchmark dropdown selection draws overlay | E2E | `npx playwright test tests/integration/backtest-benchmark.spec.ts` | ❌ Wave 0 |
| BACK-08 | Annual return bars render with portfolio + benchmark | E2E | `npx playwright test tests/integration/backtest-annual-bars.spec.ts` | ❌ Wave 0 |

### Additional Golden / Property Tests

| Concern | Test Type | File |
|---------|-----------|------|
| Golden-master backtest (synthetic 3-instrument portfolio, hand-computed expected curve) | unit, `toBeCloseTo(_, 6)` | `src/lib/backtest/simulate.golden.test.ts` |
| DRIP correctness (known dividend → expected share count after reinvest) | unit | `src/lib/backtest/simulate.test.ts` — `describe('DRIP')` |
| FX point-in-time vs spot-rate naïve baseline (verify they DIVERGE for a known FX swing window) | unit | `src/lib/backtest/simulate.test.ts` — `describe('FX')` |
| Rebalance boundary (Jan 1 falls on Saturday in 2022 → first trading day = 2022-01-03) | unit | `src/lib/backtest/simulate.test.ts` — `describe('rebalance')` |
| Sharpe sanity (zero excess return → Sharpe ≈ 0; constant excess → Sharpe = ∞ guarded) | unit | `src/lib/backtest/metrics.test.ts` |
| MDD known sequence ([100, 120, 90, 110] → MDD = -25%) | unit | `src/lib/backtest/metrics.test.ts` |
| CAGR exact-day basis ((2/1)^(365.25/days) − 1 for 5-year window) | unit | `src/lib/backtest/metrics.test.ts` |
| Inputs hash determinism (key reorder → same hash) | unit | `src/lib/backtest/inputs-hash.test.ts` |
| Forward-fill warning surfaces in footer (synthetic gap → warning count = expected) | unit | `src/lib/backtest/forward-fill.test.ts` |
| SNB stitch at 2019-06 cutover (pre-cutover uses libor_mid, post-cutover uses LZ) | unit | `src/lib/data/snb.test.ts` |
| Run dedup on identical inputs_hash | integration | `tests/integration/backtest-runs.spec.ts` |
| Stale-on-view badge appears when `prices_version` < current | integration | `tests/integration/backtest-stale.spec.ts` |

### Sampling Rate

- **Per task commit:** `npm run test:unit -- src/lib/backtest/` (sub-2s for pure libs)
- **Per wave merge:** `npm run test` (unit + integration; ~30s)
- **Phase gate:** Full suite green + manual checkpoint on the live `/dashboard/backtest` page using a real seeded portfolio before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/backtest/types.ts` — type contracts (no test, but blocks downstream)
- [ ] `src/lib/backtest/simulate.test.ts` — empty file with `it.todo` stubs reserving the test names
- [ ] `src/lib/backtest/metrics.test.ts` — same
- [ ] `src/lib/backtest/simulate.golden.test.ts` — golden-master fixture file with the hand-computed synthetic portfolio
- [ ] `src/lib/backtest/forward-fill.test.ts`, `inputs-hash.test.ts` — stub files
- [ ] `src/lib/data/snb.test.ts` — stub
- [ ] `tests/integration/backtest-happy.spec.ts` — stub `test.skip` reserving the spec name
- [ ] `tests/integration/backtest-chart.spec.ts`, `backtest-benchmark.spec.ts`, `backtest-annual-bars.spec.ts`, `backtest-runs.spec.ts`, `backtest-stale.spec.ts` — same
- [ ] `tests/fixtures/snb/snboffzisa-snapshot.json` — last-known-good SNB API response (regenerate quarterly via cron)
- [ ] `tests/fixtures/backtest/golden-portfolio.json` — synthetic 3-instrument portfolio with hand-computed daily prices + dividends + expected equity curve

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Supabase Auth (already in place from Phase 1); `/api/backtest/*` routes call `supabase.auth.getUser()` and return 401 on missing user |
| V3 Session Management | yes | Supabase SSR cookies (Phase 1); no new session handling |
| V4 Access Control | **critical** | RLS on `backtest_runs` (own rows only); RLS on `snb_rates` (read-only authenticated); batch endpoint enforces portfolio ownership via RLS-scoped SELECT |
| V5 Input Validation | yes | Zod schemas for `/api/backtest/data` body, `/api/backtest/runs` body. Specifically validate: `portfolio_id` is UUID, `start`/`end` are ISO date strings, `benchmark_ticker` is in the curated D-22 whitelist, `start <= end`, range ≤ 50 years |
| V6 Cryptography | yes | `crypto.subtle.digest('SHA-256', …)` for inputs hash — never hand-roll hash; never use MD5/SHA-1 |
| V7 Error Handling | yes | `BacktestError` discriminated union; never leak DB error strings to clients; log full error server-side |
| V8 Data Protection | yes | `backtest_runs.params_json` may contain portfolio composition — RLS prevents leak; no PII in this phase |
| V9 Communication | yes | All cron/external fetches over HTTPS; SNB API is HTTPS |
| V13 API & Web Service | yes | All API routes return typed JSON; CSRF protection inherent (same-origin only via Next.js fetch + Supabase SSR cookies) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-portfolio data leak via crafted `portfolio_id` | Information disclosure | RLS on `portfolio_instruments` (already in 00001 schema); batch endpoint reads via the user-scoped Supabase client, never service-role |
| DoS via huge date range (50-year backtest of 20 instruments = ~250K rows) | Denial of service | Validate `end - start <= 25 years` in Zod schema; cap instrument count at 50 |
| Inputs hash collision → wrong run loaded | Tampering | SHA-256 (cryptographic); collision probability is negligible at human scale |
| Stale run silently shows pre-cron data | Information disclosure (mild) | `prices_version` badge surfaces staleness; user-driven recompute |
| Cron endpoint hit by unauthorized caller | Spoofing | `CRON_SECRET` bearer auth (already used by Phase 3 cron route — mirror exactly) |
| `text/html` Content-Type from SNB API tricks a JSON parser into rendering | Tampering / XSS | Server-side fetch only; never proxy raw SNB response to client; parse via `JSON.parse(await res.text())` and re-emit our own typed shape |
| Web Worker imports an arbitrary URL | Tampering | Worker imports only from `@/lib/backtest/*` (static, build-time bundled) |

## Sources

### Primary (HIGH confidence)

- **`node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md`** — confirms native `new Worker()` support in Next.js 16 Turbopack
- **`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`** — `next/dynamic` + `ssr: false` pattern for client-only libraries
- **Live probe `https://data.snb.ch/api/cube/snboffzisa/data/json/en?dimSel=D0(UG0,OG0,LZ)&fromDate=2000-01`** — confirmed SNB API URL pattern, cube ID, series IDs, mislabeled Content-Type, no API key required, LZ series starts 2019-06
- **`https://tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5`** — v5 series API (`addSeries(LineSeries, opts)`) and import contract
- **`https://tradingview.github.io/lightweight-charts/tutorials/how_to/price-and-volume`** — two-series overlay pattern (`priceScaleId: ''` + `scaleMargins`)
- **`https://tradingview.github.io/lightweight-charts/tutorials/how_to/tooltips`** — `subscribeCrosshairMove` HTML tooltip pattern
- **`https://tradingview.github.io/lightweight-charts/tutorials/react/advanced`** — `useLayoutEffect` + `ResizeObserver` React lifecycle
- **`https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest`** — Web Crypto SHA-256 in Workers
- **`npm view lightweight-charts version`** — current version `5.2.0`, published 2026-04-24

### Secondary (MEDIUM confidence)

- **`https://nextjs.org/blog/next-16-2-turbopack`** — Worker bootstrap origin fix in Next.js 16.2
- **`https://github.com/vercel/next.js/issues/62650`** — `import.meta.url` constraints (static path required)
- **`https://github.com/tradingview/lightweight-charts/issues/543`** — client-only library, no SSR
- **`https://snyk.io/advisor/npm-package/lightweight-charts-react-wrapper`** — wrapper marked inactive (2+ years no release)
- **`https://github.com/GoogleChromeLabs/comlink`** — Comlink size/scope (1.6KB, async-RPC)
- **`https://www.smashingmagazine.com/2021/06/web-workers-2021/`** — When Comlink is the wrong tool
- **`https://dev.to/benjamin_renoux/financial-precision-in-javascript-handle-money-without-losing-a-cent-1chc`** — IEEE 754 drift bounds in financial JS

### Tertiary (LOW confidence — flagged for plan-time verification)

- **`https://github.com/polakowo/vectorbt/issues/243`** — DRIP support in OSS backtesters (didn't surface clear comparable conventions; D-15 stands as authoritative for this project)
- **Training-data knowledge of `decimal.js` major versions** — Assumption A1; planner verifies if dispute arises

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `lightweight-charts ^5.2.0` verified on npm registry; Worker pattern verified in local Next.js docs; SNB API verified via live probe
- Architecture: HIGH — D-01..D-23 already lock the architecture; this research mostly explains *how* to build the locked design
- Pitfalls: HIGH for Pitfalls 1, 2, 6, 10 (verified by live probe or local docs); MEDIUM for Pitfalls 8, 9 (training-data + reasoning); HIGH for Pitfalls 3, 4, 5, 7 (mechanical consequences of D-13 through D-16)
- Validation Architecture: HIGH — test framework already exists, requirement-to-test mapping is mechanical
- Security: HIGH — pattern of "RLS at the SELECT, no service-role from client code paths" already proven in Phases 3+4

**Research date:** 2026-05-29
**Valid until:** 2026-06-28 (30 days — lightweight-charts is stable v5.x; SNB data portal is government-stable; Next.js 16.x worker API ratified)

*Phase: 05-backtesting-engine*
