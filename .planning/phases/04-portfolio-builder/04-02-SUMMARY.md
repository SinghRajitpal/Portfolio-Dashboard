---
phase: 04-portfolio-builder
plan: 02
subsystem: portfolio-builder/pure-libs
tags: [zod, schema, pure-functions, vitest, tdd, papaparse, intl, chf]
requires:
  - phase: 04-portfolio-builder
    plan: 01
    provides: "Wave 0 stub test files (it.todo placeholders) and installed deps (zod, papaparse, vitest)"
provides:
  - "PortfolioSchema (z.infer<typeof PortfolioSchema> = PortfolioInput)"
  - "PortfolioItemSchema + PortfolioItemInput type"
  - "computeMetrics(items, investmentAmount, meta) → Metrics"
  - "normalizeTo100(weights[]) → weights[] summing exactly 100.00 (2dp)"
  - "fmtCHF(amount) → Swiss apostrophe currency string via Intl.NumberFormat('de-CH')"
  - "parsePortfolioCsv(file) → Promise<{ rows, errors }>; CsvRow + CsvRowSchema"
affects:
  - "src/app/dashboard/portfolios/* (downstream RHF resolver + Server Action share PortfolioSchema)"
  - "src/lib/portfolio/* (portfolio computation surface for plans 03-06)"
tech-stack:
  added: []
  patterns:
    - "Zod superRefine for cross-field validation with path:['items']"
    - "Intl.NumberFormat('de-CH') instead of hand-rolled separator strings"
    - "papaparse with header:true + skipEmptyLines + transformHeader (case-insensitive)"
    - "File.text() preflight so papaparse runs identically in vitest Node and browser"
    - "Drift-correction rounding: rescale to 2dp, fold residual into last element → exact 100.00 sum"
    - "computeMetrics returns unrounded results; caller decides display precision"
key-files:
  created:
    - "src/app/dashboard/portfolios/_schema.ts"
    - "src/lib/portfolio/compute-metrics.ts"
    - "src/lib/portfolio/normalize-weights.ts"
    - "src/lib/portfolio/chf-format.ts"
    - "src/lib/portfolio/parse-csv.ts"
  modified:
    - "src/app/dashboard/portfolios/_schema.test.ts (it.todo → 15 passing assertions)"
    - "src/lib/portfolio/compute-metrics.test.ts (it.todo → 8 passing assertions)"
    - "src/lib/portfolio/normalize-weights.test.ts (it.todo → 7 passing assertions)"
    - "src/lib/portfolio/chf-format.test.ts (it.todo → 6 passing assertions)"
    - "src/lib/portfolio/parse-csv.test.ts (it.todo → 8 passing assertions)"
decisions:
  - "fmtCHF spec uses minimumFractionDigits:0 + maximumFractionDigits:2 (per plan); single-decimal inputs render as '.5', not '.50'. Added explicit 10000.55 case to lock 2dp truncation."
  - "parsePortfolioCsv reads File via file.text() before handing to Papa.parse. Direct File input requires browser FileReader/FileReaderSync, neither of which exists in vitest Node env. The string path is also correct in browsers."
  - "computeMetrics: items absent from `meta` are silently skipped (not pushed to missing lists); only items with meta entries containing null counts qualify as 'missing'. Distinction matters for downstream UI footnotes."
  - "Zod CsvRowSchema treats weight as string-with-numeric-regex then transforms to Number — preserves Papa's raw string output and rejects 'sixty' cleanly."
metrics:
  duration: "4min"
  completed: "2026-05-04"
  task_count: 3
  file_count: 10
  tests_added: 44
---

# Phase 4 Plan 02: Pure Libs and Schema Summary

Implemented the framework-agnostic Zod schema and pure-function library that all Phase 4 UI and Server Actions consume — `PortfolioSchema` (shared between RHF resolver and server actions), `computeMetrics` (weighted TER/yield/income with null handling), `normalizeTo100` (drift-corrected 2dp rebalance), `fmtCHF` (Swiss apostrophe formatting via Intl), and `parsePortfolioCsv` (papaparse + Zod) — all unit-tested via TDD with all Wave 0 `it.todo` stubs converted to real assertions.

## Test Counts

| File | Tests | Status |
|---|---|---|
| `src/app/dashboard/portfolios/_schema.test.ts` | 15 | green |
| `src/lib/portfolio/compute-metrics.test.ts` | 8 | green |
| `src/lib/portfolio/normalize-weights.test.ts` | 7 | green |
| `src/lib/portfolio/chf-format.test.ts` | 6 | green |
| `src/lib/portfolio/parse-csv.test.ts` | 8 | green |
| **Plan total** | **44** | **44/44** |
| **Project unit suite (regression check)** | **183** | **183/183 in 1.87s** |

## Commits

| Phase | Commit | Description |
|---|---|---|
| Task 1 RED | `0149bc2` | Failing schema tests |
| Task 1 GREEN | `a1dbc82` | PortfolioSchema implementation |
| Task 2 RED | `d6e06e3` | Failing compute-libs tests |
| Task 2 GREEN | `037e785` | computeMetrics + normalizeTo100 + fmtCHF |
| Task 3 RED | `e6624e0` | Failing parse-csv tests |
| Task 3 GREEN | `986f6cd` | parsePortfolioCsv implementation |

## RED→GREEN Cycles That Revealed Pitfalls

### 1. `Intl.NumberFormat('de-CH')` minimum/maximum digits asymmetry

**Discovered:** Task 2 first GREEN run.
**Symptom:** Test asserted `fmtCHF(10000.5) → 'CHF 10’000.50'`, but Intl with the plan's spec (`minimumFractionDigits:0, maximumFractionDigits:2`) emits `CHF 10’000.5` — single decimal preserved as-is.
**Resolution:** The plan's formatter config is intentional (integer CHF amounts render clean as `CHF 10’000` instead of `CHF 10’000.00`). Test was wrong, not implementation. Asserted `\.5\b` for the 10000.5 case and added a `10000.55 → 10’000.55` case to lock down 2dp truncation behavior. Documented in Decisions.

### 2. papaparse File-input requires browser FileReader

**Discovered:** Task 3 first GREEN run.
**Symptom:** `ReferenceError: FileReaderSync is not defined` from `papaparse.js:762`. The library checks for File input and routes through worker-style FileReader APIs that vitest's Node env does not provide.
**Resolution:** Read the file body to a string via `await file.text()` first, then pass the string to `Papa.parse`. Standard `File.text()` is part of the File API and works identically in both browsers and Node 20. Single-line change, no functional impact, deviation tracked under Rule 1.

### 3. Empty-string optional CSV fields fail Zod `.optional()`

**Discovered:** While dogfooding the parser internals.
**Symptom:** A CSV row with header `ticker,weight,exchange` but an empty exchange cell would emit `{ exchange: '' }`. `z.string().min(1).optional()` rejects empty string (it's a present value, not undefined).
**Resolution:** Strip empty-string fields from the raw row before `safeParse`. This makes the optional column genuinely optional and avoids spurious "exchange: must be at least 1 character" errors.

## NUMERIC(5,4) vs NUMERIC(5,2) — confirmed correct

The plan was explicit about the percent-vs-fraction split, and the `does not double-multiply` test in `compute-metrics.test.ts` locks it in:
- `weight` is stored as percent (`60.00`) per `portfolio_instruments.weight NUMERIC(5,2)`
- `expense_ratio` and `dividend_yield` are stored as fractions (`0.0007`) per `instruments.{expense_ratio,dividend_yield} NUMERIC(5,4)`
- `computeMetrics` uses `weight/100 × fraction` exactly once → contribution `= 0.6 × 0.0007 = 0.00042`
No double-multiply pitfall hit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fmtCHF test expectation matched fictional spec**
- **Found during:** Task 2 GREEN run
- **Issue:** Test asserted `\.50$` for `fmtCHF(10000.5)`, but spec is `minimumFractionDigits:0, maximumFractionDigits:2` which yields `\.5$`.
- **Fix:** Updated test to match Intl's actual output for the spec the plan mandated; added a 10000.55 case for 2dp coverage.
- **Files modified:** `src/lib/portfolio/chf-format.test.ts`
- **Commit:** `037e785` (combined with GREEN — the spec is correct, only the test was wrong)

**2. [Rule 3 - Blocker] papaparse File input incompatible with vitest Node env**
- **Found during:** Task 3 GREEN run
- **Issue:** `Papa.parse(file, ...)` triggered `ReferenceError: FileReaderSync is not defined` because Node has no FileReader/FileReaderSync.
- **Fix:** Read File body via `await file.text()` then call `Papa.parse(string, ...)`. Same behavior in browsers; unblocks Node tests.
- **Files modified:** `src/lib/portfolio/parse-csv.ts`
- **Commit:** `986f6cd`

**3. [Rule 2 - Critical functionality] Strip empty-string optional CSV fields before Zod parse**
- **Found during:** Task 3 implementation
- **Issue:** Empty `exchange` cells produced `{ exchange: '' }`, which `z.string().min(1).optional()` rejects.
- **Fix:** Filter empty-string fields from the raw row before `CsvRowSchema.safeParse`.
- **Files modified:** `src/lib/portfolio/parse-csv.ts`
- **Commit:** `986f6cd`

## Downstream Confirmation

- Plan 03 (server actions + RPC): MAY now `import { PortfolioSchema, type PortfolioInput } from '@/app/dashboard/portfolios/_schema'` for server-side validation (single source of truth shared with client RHF resolver).
- Plan 04 (builder components): MAY `import { computeMetrics, normalizeTo100, fmtCHF } from '@/lib/portfolio/...'` for live metric badges and rebalance buttons.
- Plan 06 (CSV import): MAY `import { parsePortfolioCsv } from '@/lib/portfolio/parse-csv'` to feed import-flow rows back into the same `PortfolioSchema`.
- All five modules are framework-agnostic — no React, no Next.js runtime, no Supabase coupling.

## Verification

- `npm run test:unit` → 17 files / 183 tests / 0 failures / 0 todo
- Phase 4 portfolio suite runtime: ~31ms across 5 files
- Total project unit suite: 1.87s
- Zero new dependencies (papaparse + zod were installed in Plan 01)

## Self-Check: PASSED

Files verified to exist (all absolute paths confirmed via `ls`):
- FOUND: `src/app/dashboard/portfolios/_schema.ts`
- FOUND: `src/app/dashboard/portfolios/_schema.test.ts`
- FOUND: `src/lib/portfolio/compute-metrics.ts`
- FOUND: `src/lib/portfolio/compute-metrics.test.ts`
- FOUND: `src/lib/portfolio/normalize-weights.ts`
- FOUND: `src/lib/portfolio/normalize-weights.test.ts`
- FOUND: `src/lib/portfolio/chf-format.ts`
- FOUND: `src/lib/portfolio/chf-format.test.ts`
- FOUND: `src/lib/portfolio/parse-csv.ts`
- FOUND: `src/lib/portfolio/parse-csv.test.ts`

Commits verified via `git log`:
- FOUND: `0149bc2` test(04-02) RED schema
- FOUND: `a1dbc82` feat(04-02) GREEN schema
- FOUND: `d6e06e3` test(04-02) RED compute libs
- FOUND: `037e785` feat(04-02) GREEN compute libs
- FOUND: `e6624e0` test(04-02) RED parse-csv
- FOUND: `986f6cd` feat(04-02) GREEN parse-csv

No `it.todo` markers remain in any Phase 4 source/test files.
