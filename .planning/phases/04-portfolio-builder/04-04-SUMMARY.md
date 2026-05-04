---
phase: 04-portfolio-builder
plan: 04
subsystem: ui

tags: [react-hook-form, zod, base-ui, cmdk, sonner, portfolio-builder, instrument-search]

# Dependency graph
requires:
  - phase: 04-portfolio-builder
    provides: PortfolioSchema + computeMetrics + normalizeTo100 + fmtCHF (Plan 02); shadcn primitives + form wrapper + Toaster (Plan 01); migration 00007 instruments INSERT RLS (Plan 01)
  - phase: 03-market-data-pipeline
    provides: POST /api/instruments/search (SearchResult[] | DataError), instruments table with metadata
provides:
  - Reusable PortfolioBuilder client component (RHF + zod) for create/edit/template/CSV preview flows
  - InstrumentCombobox with 250ms debounce, AbortController-cancelled fetches, all 4 DataError surfaces, ISIN cache-hit fallback display
  - WeightedMetricsStrip with sticky 3-stat layout, useWatch-based live recompute, missing-data footnotes
  - InstrumentRow + TotalBadge composable child components
  - groupSearchResults pure helper (9 vitest cases) — groups SearchResult[] by isin || name
  - POST /api/instruments/resolve route returning { id, meta } from day one (no Plan 05 contract patch needed)
  - Local mergedMeta state pattern: builder seeds from prop, extends inline on each combobox onSelect
affects: [04-05-pages-and-templates, 04-06-csv-import]

# Tech tracking
tech-stack:
  added: []  # all deps installed in Plan 04-01
  patterns:
    - "InstrumentCombobox: hand-rolled setTimeout + AbortController (no useDebouncedCallback dep)"
    - "Combobox onSelect emits { id, meta } so parent extends mergedMeta inline — eliminates Plan 05 post-hoc patching"
    - "DataError pattern-match in client: rate_limit→toast, transient→inline, not_found→empty, invalid_input→inline"
    - "/api/instruments/resolve: existing-row-first SELECT then upsert(onConflict: 'ticker') for race tolerance; cast typed client to SupabaseClient to dodge Database generic narrowing"
    - "InstrumentRow registers via useFormContext + valueAsNumber; FormProvider wraps everything"

key-files:
  created:
    - src/components/portfolio/group-search-results.ts
    - src/components/portfolio/group-search-results.test.ts
    - src/components/portfolio/InstrumentCombobox.tsx
    - src/components/portfolio/InstrumentRow.tsx
    - src/components/portfolio/TotalBadge.tsx
    - src/components/portfolio/WeightedMetricsStrip.tsx
    - src/components/portfolio/PortfolioBuilder.tsx
    - src/app/api/instruments/resolve/route.ts
    - .planning/phases/04-portfolio-builder/deferred-items.md
  modified: []

key-decisions:
  - "InstrumentCombobox does NOT use shadcn Form scaffolding — it's a self-contained popover that emits onSelect; the parent owns RHF state via useFieldArray('items')."
  - "Combobox excludes via excludeTickers (string of ticker.exchange) rather than instrument_id because results-side dedupe must happen before the user picks (instrument_id is only known post-resolve)."
  - "PortfolioBuilder maintains a local mergedMeta state seeded from props.instrumentsMeta and extended inline on every combobox onSelect — closes Plan 04↔05 contract drift; the metrics strip is wired to mergedMeta, not to the prop."
  - "/api/instruments/resolve casts createClient() to untyped SupabaseClient to sidestep an overly-strict Database generic that returns 'never' for instruments .select('id, expense_ratio, dividend_yield') after .upsert. Same precedent already used in src/lib/data/cache-prices.ts."
  - "Investment amount uses Controller (not register) because RHF's `valueAsNumber` does not coerce '' → 0 cleanly; explicit number coercion in onChange keeps fmtCHF preview stable."
  - "Footnote highlighting uses onMouseEnter/Focus → onHighlightIds; clicking also fires highlight (single-target visual link, not a sticky filter)."

patterns-established:
  - "InstrumentCombobox debounce + abort: setTimeout(250ms) wrapped in cleanup; AbortController stored in ref; component-unmount aborts both timer and fetch"
  - "groupSearchResults grouping precedence: isin > name (lowercased+trimmed) > ticker fallback; displayName fixed at first occurrence"
  - "PortfolioBuilder mergedMeta extension: setMergedMeta runs BEFORE append in onSelect handler so the next render's WeightedMetricsStrip already sees the new id"
  - "Save-disabled gate: !isValid OR fields.length===0 OR |sum-100|>0.01 OR saving"

requirements-completed: [PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, META-01]

# Metrics
duration: ~7min
completed: 2026-05-04
---

# Phase 4 Plan 4: Builder Components Summary

**Reusable PortfolioBuilder client component (RHF + zod) plus 4 child components, 1 pure helper with tests, and the /api/instruments/resolve route — all wired so newly-added instruments contribute to live metrics without Plan 05 post-hoc patching.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-04T19:02:24Z
- **Completed:** 2026-05-04T19:10:00Z (approx)
- **Tasks:** 3 / 3
- **Files created:** 9 (7 source + 1 test + 1 deferred-items log)
- **Files modified:** 0

## Accomplishments

- 5 client components + 1 pure helper (with vitest cases) under `src/components/portfolio/`
- `/api/instruments/resolve` POST route returning `{ id, meta: { expense_ratio, dividend_yield } }` from day one
- `groupSearchResults` covers all 8 documented behaviours plus a pinned ordering case (9 tests, all green)
- Combobox debounces 250 ms and cancels stale fetches via `AbortController`; renders all 4 `DataError` kinds correctly
- `WeightedMetricsStrip` uses `useWatch` (no input-row re-render storm) and renders missing-data footnotes with hover-to-highlight callbacks
- `PortfolioBuilder` validates with `zodResolver(PortfolioSchema)` and disables Save while invalid; `Normalize to 100%` button rescales via `normalizeTo100`; mergedMeta extends inline on every combobox onSelect

## Task Commits

1. **Task 1a: Pure helper — groupSearchResults + tests (TDD)** — `50443f1` (feat)
2. **Task 1b: /api/instruments/resolve POST route** — `c7afce6` (feat)
3. **Task 2: InstrumentCombobox + InstrumentRow + TotalBadge** — `da75dcf` (feat)
4. **Task 3: WeightedMetricsStrip + PortfolioBuilder composition root** — `56c8616` (feat)

_Note: Plan 04-03 was executing in parallel during this plan; commits `e37721d`, `bb1a495`, `5bff728`, `ed15646` interleave with Plan 04-04 commits in `git log` and are not part of this plan._

## Files Created/Modified

### Source

- `src/components/portfolio/group-search-results.ts` — pure `groupSearchResults(SearchResult[]) → GroupedResult[]`
- `src/components/portfolio/group-search-results.test.ts` — 9 vitest cases (empty / single / same-isin / different-isin / same-name-no-isin / displayName fallback / ordering × 2 / locked-displayName behaviour)
- `src/components/portfolio/InstrumentCombobox.tsx` — Popover + Command combobox with 250 ms debounce + AbortController; calls `/api/instruments/search` then `/api/instruments/resolve`; emits `SelectedInstrument` (incl. expense_ratio + dividend_yield)
- `src/components/portfolio/InstrumentRow.tsx` — 4-col grid row registering weight via `useFormContext` + `valueAsNumber`; supports `highlighted` prop
- `src/components/portfolio/TotalBadge.tsx` — `useWatch` Σ% with neutral / amber / Swiss-red state colours and tooltip
- `src/components/portfolio/WeightedMetricsStrip.tsx` — sticky `top-16` 3-stat strip; per-stat tooltips + missing-data footnotes that fire `onHighlightIds`
- `src/components/portfolio/PortfolioBuilder.tsx` — composition root: RHF + zod, useFieldArray, FormProvider, mergedMeta state, Cancel router routing per mode, sticky footer
- `src/app/api/instruments/resolve/route.ts` — POST with Zod-validated body; existing-row SELECT then upsert(onConflict:'ticker'); returns `{ id, meta }` or `DataError`

### Documentation

- `.planning/phases/04-portfolio-builder/deferred-items.md` — logs out-of-scope TS errors in Plan 04-03's untracked `_actions.ts` / `_queries.ts` (which were created by 04-03 in a parallel session and produce 11 `tsc --noEmit` errors that pre-date Plan 04-04)

## Decisions Made

- **Resolve route returns `{ id, meta }` from day one** — closes the contract drift the plan-checker flagged; Plan 05 now never needs to retrofit a meta payload onto this route.
- **Builder maintains `mergedMeta`** — local state seeded from `props.instrumentsMeta` and extended inline in the combobox `onSelect` handler. The metrics strip subscribes to `mergedMeta`, so newly-added instruments contribute to live TER / yield / income immediately.
- **Cast typed Supabase client to untyped `SupabaseClient` in the resolve route** — same workaround already used by `src/lib/data/cache-prices.ts`. The `Database` generated type narrows multi-column select-after-upsert chains to `never`; the cast restores ergonomic chaining at the cost of type safety on those specific calls (column names are still validated at runtime by Postgres).
- **`InstrumentCombobox.excludeTickers`** uses `${ticker}.${exchange}` strings (results-side dedupe before pick) rather than `excludeIds` (which would only work post-resolve). The plan's contract used `excludeIds`; we kept that name in the type, but in practice the parent passes ticker strings since instrument_ids only exist after resolve.
- **Investment amount uses `Controller`** rather than `register('investment_amount', { valueAsNumber: true })` because RHF's `valueAsNumber` coerces `''` to `NaN`; the Controller path keeps `fmtCHF(0)` rendering when the field is cleared.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Database generic narrows instruments upsert/select to `never`**
- **Found during:** Task 1b verify (`npx tsc --noEmit`)
- **Issue:** The typed Supabase client (returned by `createClient()`) narrowed `.from('instruments').select('id, expense_ratio, dividend_yield').upsert(...)` to `never`, producing 5 TS errors on legitimate code (TS2339 on `existing.dividend_yield` etc.). Same root cause as the pre-existing errors in Plan 04-03's `_queries.ts` (logged in `deferred-items.md`).
- **Fix:** Cast `createClient()` result to `SupabaseClient` (untyped). Matches the prior precedent in `src/lib/data/cache-prices.ts`. Documented inline.
- **Files modified:** `src/app/api/instruments/resolve/route.ts`
- **Verification:** `npx tsc --noEmit` clean for the resolve route; all 192 unit tests still pass.
- **Committed in:** `c7afce6` (Task 1b commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** No scope creep. The cast keeps the route type-clean and matches an established project pattern.

## Issues Encountered

- **Pre-existing TS errors in Plan 04-03 deliverables** — `src/app/dashboard/portfolios/_actions.ts`, `_queries.ts`, and `tests/unit/save-portfolio-rpc.test.ts` exist on disk and produce 11 `tsc` errors that are not caused by Plan 04-04. They were created by a parallel Plan 04-03 execution. Logged to `.planning/phases/04-portfolio-builder/deferred-items.md` for Plan 04-03's owner; out-of-scope per the GSD scope-boundary rule.
- **Plan's `excludeIds` contract vs. result-side dedupe** — the plan's `InstrumentComboboxProps.excludeIds` only makes sense post-resolve, but combobox dedupe must happen pre-pick. Kept the prop name in the public type and added a parallel `excludeTickers` (string of `${ticker}.${exchange}`) for actual pre-pick filtering; the parent currently passes ticker strings.

## User Setup Required

None — migration `00007_instruments_resolve_policy.sql` was applied as part of Plan 04-01. The resolve route assumes that policy is already live (it gates `INSERT WITH CHECK data_source = 'resolved'`).

## Next Phase Readiness

- **Plan 04-05 (pages and templates):** All builder primitives ready. The new/edit/template-preview pages just need to construct `instrumentsMeta` server-side, render `<PortfolioBuilder mode="…" instrumentsMeta={…} onSubmit={…} />`, and wire `onSubmit` to the Plan 04-03 `savePortfolio` server action.
- **Plan 04-06 (CSV import):** PortfolioBuilder accepts `mode="preview"` + `initialData` seeded from `parsePortfolioCsv` output; `onSubmit` is the parent's preview→server-action bridge.
- **Open follow-up for Plan 04-03 owner:** the typed `Database` generated under `src/types/database.ts` does not surface the `save_portfolio` RPC and narrows multi-column instruments selects to `never`. Either regenerate the types post-migration-00006 or apply the same `SupabaseClient` cast pattern (see `cache-prices.ts` and the new resolve route).

## Self-Check: PASSED

- [x] All 7 source files exist under `src/components/portfolio/` and `src/app/api/instruments/resolve/`
- [x] All 4 task commits present on `main` (`50443f1`, `c7afce6`, `da75dcf`, `56c8616`)
- [x] `npm run test:unit` exits 0 with 192 / 192 passing (1 file skipped, no new failures)
- [x] `npx tsc --noEmit` clean for the new files (`grep -v` confirms zero errors in `components/portfolio/` or `api/instruments/resolve/`)
- [x] Plan verify regexes all match (`'use client'` × 5, `/api/instruments/search`, `/api/instruments/resolve`, `isDataError`, `useWatch`, `zodResolver(PortfolioSchema)`, `useFieldArray`, `computeMetrics`, `normalizeTo100`, `fmtCHF`)

---
*Phase: 04-portfolio-builder*
*Completed: 2026-05-04*
