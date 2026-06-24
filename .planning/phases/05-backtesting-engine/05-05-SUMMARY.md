---
phase: 05-backtesting-engine
plan: 05
subsystem: backtesting-engine
tags: [worker, lightweight-charts, client-only, ui-primitives, wave-3]

requires:
  - phase: 05-backtesting-engine
    plan: 01
    why: "Imports WorkerRequest/WorkerResponse, BacktestInput/Output, EquityPoint, AnnualBar from types.ts; uses isBacktestError typeguard"
  - phase: 05-backtesting-engine
    plan: 02
    why: "Worker imports simulate, computeMetrics, hashInputs — the pure engine core"
provides:
  - "Plan 05-06 (UI) imports { useBacktestWorker } from '@/lib/backtest/use-backtest-worker' and the two chart components"
affects:
  - "Adds the first Web Worker and the first lightweight-charts integration in the repo"

tech-stack:
  added: []  # lightweight-charts already declared in package.json since 05 planning
  patterns:
    - "Web Worker postMessage RPC scaffolded from RESEARCH §Pattern 1 (lines 274-309)"
    - "lightweight-charts v5 imperative chart lifecycle from RESEARCH §Pattern 2 (lines 332-446)"
    - "Two-stacked-histogram annual-bars per RESEARCH §Pattern 3 recommendation (a)"
    - "ResizeObserver + useLayoutEffect lifecycle (avoids first-paint flash)"
    - "'use client' boundary for canvas-based libraries that need window"

key-files:
  created:
    - src/workers/backtest.worker.ts
    - src/lib/backtest/use-backtest-worker.ts
    - src/components/backtest/EquityCurveChart.tsx
    - src/components/backtest/AnnualReturnsChart.tsx
  modified: []

decisions:
  - "Worker URL uses RELATIVE path '../../workers/backtest.worker.ts' per RESEARCH Pitfall 10 — the @/ alias has been observed to resolve in Turbopack dev but fail in Vercel prod builds"
  - "Hash computed inside the worker, not on the main thread (RESEARCH Anti-Pattern line 583) — prevents the UI from mutating the payload between send and hash and producing a wrong dedup key"
  - "Annual bars rendered as TWO stacked Histogram charts (RESEARCH Pattern 3 rec a) — side-by-side at the same time index is not natively supported and stacked is the most readable v1 option"
  - "Tooltip XSS mitigation (T-5-05-XSS): innerHTML composes only fmtCHF() output + ISO date strings; no external user content reaches the tooltip"
  - "One-in-flight RPC guard in the hook (rejects concurrent run() with 'Worker busy') — v1 UX has a single Run button so this is a defensive guard, not a queueing feature"

metrics:
  duration: ~25 minutes
  completed: 2026-06-24
  files_created: 4

key-decisions:
  - "Relative worker URL chosen over the @/ alias per RESEARCH Pitfall 10 — Task 3 checkpoint:human-verify enforces prod-build verification before shipping"
  - "Histogram bars stacked, not overlaid — clarity over density per RESEARCH Pattern 3 rec a"
---

# Phase 5 Plan 05: Worker + Lightweight-Charts Wiring Summary

One-liner: Shipped the first Web Worker (sandboxed simulate → metrics → hash RPC) and the first lightweight-charts v5 integrations (Area+Line equity curve with CHF crosshair tooltip, two-stacked Histogram annual bars) — three client-only primitives with the worker bundling deferred to a `checkpoint:human-verify` gate per RESEARCH Pitfall 10.

## Tasks Completed

### Task 1 — Worker entry + useBacktestWorker hook (commit `7e79c7d`)

- **`src/workers/backtest.worker.ts`** — `self.onmessage` dispatches `{ kind: 'run' }` to `simulate() → computeMetrics() → hashInputs()`, returns `WorkerResponse { kind: 'done', result, inputsHash }` or `{ kind: 'error', error }`. `isBacktestError` typeguard routes simulate's discriminated-union return.
- **Sandboxing verified:** `grep -E "from 'next|from 'react|from '@supabase|document\.|window\."` returns empty. Worker imports only from `@/lib/backtest/{simulate,metrics,inputs-hash,errors,types}`.
- **`src/lib/backtest/use-backtest-worker.ts`** — `'use client'` hook. Lifecycle: mount → `new Worker(new URL('../../workers/backtest.worker.ts', import.meta.url), { type: 'module' })`, unmount → terminate + reject in-flight pending. Returns `{ run, terminate, isRunning }`. `run()` is a single-flight Promise (rejects "Worker busy" on concurrent calls).

### Task 2 — Chart components (commit `1b86ced`)

- **`src/components/backtest/EquityCurveChart.tsx`**
  - Props: `{ portfolio: EquityPoint[]; benchmark: EquityPoint[] | null; height?: number; className?: string }`
  - v5 API: `chart.addSeries(AreaSeries, …)` for portfolio (Swiss red `#E3000F`, `topColor: rgba(227,0,15,0.20)`), `chart.addSeries(LineSeries, …)` for benchmark (`#666`).
  - `localization.priceFormatter` wired to `fmtCHF` from `@/lib/portfolio/chf-format`.
  - Crosshair: `subscribeCrosshairMove` updates a custom absolute-positioned HTML tooltip; tooltip is clamped horizontally to stay in-bounds.
  - `ResizeObserver` tracks container width; cleanup removes chart, tooltip, observer, and restores `container.style.position`.

- **`src/components/backtest/AnnualReturnsChart.tsx`**
  - Props: `{ bars: AnnualBar[]; showBenchmark: boolean; height?: number; className?: string }`
  - Two stacked Histogram charts (RESEARCH Pattern 3 rec a). Portfolio (`#E3000F`, darker `#B30009` for negatives), benchmark (`#999`).
  - `priceFormat: { type: 'percent', precision: 2 }`, `priceScaleId: ''` overlay, `scaleMargins: { top: 0.1, bottom: 0.1 }`.
  - Year → `Time` encoding: `'${year}-01-02'` (stable non-weekend day) for clean year axis labels.
  - Single shared `ResizeObserver` observes both containers and routes resize events to the matching chart.

### Task 3 — Production-build worker URL resolution

**STATUS: checkpoint pending human verification** (gate="blocking-human", per RESEARCH Pitfall 10). See "Checkpoint Pending" section below.

## Verification

### Worker import-sandbox check

```
$ grep -E "from 'next|from 'react|from '@supabase|document\.|window\." src/workers/backtest.worker.ts
(no output — pass)
```

### v5 API exclusivity

```
$ grep -E "addLineSeries|addAreaSeries|addHistogramSeries" \
    src/components/backtest/EquityCurveChart.tsx \
    src/components/backtest/AnnualReturnsChart.tsx
(no output — pass)
```

### Type check

```
$ npx tsc --noEmit
(exit 0 — clean)
```

### Production build (Task 2 acceptance)

`npm run build` ran cleanly against Next.js 16.2.2 + Turbopack:

- Compiled successfully in 9.2s
- TypeScript pass in 5.0s
- 19 static pages generated
- All routes (existing + future-stub `/dashboard/backtest`) finalized without errors
- No "module not found" warnings for the worker path

Note: the worker chunk does NOT appear in `.next/static/` yet because no consumer imports `useBacktestWorker`. The hook will first be imported in Plan 06; Task 3's human-verify checkpoint should be re-evaluated then with `/dashboard/backtest` actually rendering the hook. See "Checkpoint Pending" below.

## Component Prop Signatures (downstream contracts)

```typescript
// Consumed by Plan 06 — single source of truth.

useBacktestWorker(): {
  run: (input: BacktestInput) => Promise<{ result: BacktestOutput; inputsHash: string }>
  terminate: () => void
  isRunning: boolean
}

<EquityCurveChart
  portfolio={EquityPoint[]}                   // required; date 'YYYY-MM-DD'
  benchmark={EquityPoint[] | null}
  height={number}                             // default 360
  className={string}
/>

<AnnualReturnsChart
  bars={AnnualBar[]}                          // [{ year, portfolio, benchmark | null }]
  showBenchmark={boolean}
  height={number}                             // default 200 (per stacked chart)
  className={string}
/>
```

## Deviations from Plan

**None** — both implemented tasks followed RESEARCH Patterns 1, 2, and 3 verbatim in shape. One small clarifying edit was applied to a doc comment in `EquityCurveChart.tsx` so the v4-API-banned grep gate (`! grep "addLineSeries|addAreaSeries|addHistogramSeries"`) stays clean even when scanning documentation lines — wording-only, no behavior change.

## Checkpoint Pending — Task 3 (human-verify, blocking)

Per the plan, Task 3 requires manual verification of the worker URL resolution in the production bundle. The orchestrator should:

1. Re-run `npm run build` after Plan 06 (or a temporary scratch route) imports `useBacktestWorker`. This is when the worker chunk first lands in `.next/static/`.
2. Run `npm run start` and open `/dashboard/backtest` in Chrome with DevTools → Network filtered to "worker".
3. Confirm: the worker chunk loads with status 200, no "Failed to construct 'Worker'" console error, no "Module not found".
4. If a 404 appears, the relative path is already in place per RESEARCH Pitfall 10's recommended fallback — escalate via blocker.

The current build (`npm run build` at commit `1b86ced`) succeeded with no warnings; the worker bundling pathway is in place and ready for Plan 06 to exercise it.

## Threat Surface

All threats in the plan's `<threat_model>` are addressed:

- **T-5-05-WORKER-SCOPE** (Tampering): mitigated — worker has only static imports from `@/lib/backtest/*`; no dynamic `import()`.
- **T-5-05-XSS** (XSS via tooltip innerHTML): mitigated — every interpolated value is either an ISO date string from our own data or `fmtCHF()` output; no external user input flows through `innerHTML`. Documented at the call site.
- **T-5-05-SSR** (info disclosure via SSR): accepted — both chart components are `'use client'` and use `useLayoutEffect`; never SSR-rendered.
- **T-5-05-BUNDLE** (worker URL prod-vs-dev mismatch): mitigated by Task 3 checkpoint (gated on human verification).

No threat flags introduced beyond the registered set.

## Self-Check: PASSED

```
$ test -f src/workers/backtest.worker.ts && echo FOUND
FOUND
$ test -f src/lib/backtest/use-backtest-worker.ts && echo FOUND
FOUND
$ test -f src/components/backtest/EquityCurveChart.tsx && echo FOUND
FOUND
$ test -f src/components/backtest/AnnualReturnsChart.tsx && echo FOUND
FOUND
$ git log --oneline --all | grep -E "7e79c7d|1b86ced"
1b86ced feat(05-05): add EquityCurveChart + AnnualReturnsChart (lightweight-charts v5)
7e79c7d feat(05-05): add backtest Web Worker + useBacktestWorker hook
```
