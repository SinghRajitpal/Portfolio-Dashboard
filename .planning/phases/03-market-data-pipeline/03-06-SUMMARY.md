---
phase: 03-market-data-pipeline
plan: "06"
subsystem: cron-and-seed
tags: [vercel-cron, eodhd, bulk-eod, seed-script, smoke-test, phase-close]

dependency_graph:
  requires:
    - phase: 03-market-data-pipeline plan 01
      provides: proxy.ts api/cron bypass, mock-fetch, supabase-test helper
    - phase: 03-market-data-pipeline plan 03
      provides: DataError contract, isDataError
    - phase: 03-market-data-pipeline plan 04
      provides: EODHDProvider.bulkEod, upsertPrices, getInstrumentByTicker, upsertInstrumentMetadata
  provides:
    - daily-cron-refresh-handler (GET /api/cron/refresh-prices)
    - vercel-cron-declaration (2 jobs, 22:00 UTC)
    - seed-instruments-script (14 v1 template tickers)
    - phase3-smoke-test (5 ROADMAP criteria)
  affects:
    - Phase 4 portfolio-builder (seed provides instruments to display)
    - daily refresh (Vercel Cron fires nightly after deployment)

tech_stack:
  added: []
  patterns:
    - URL constructor for searchParams (compatible with Next.js runtime + vitest unit tests)
    - isMain guard in seed scripts (prevents CLI side-effects on import)
    - CRON_SECRET Bearer auth for Vercel Cron route
    - Service-role Supabase client in cron handler (no user session)
    - failingProvider pattern in smoke tests (proves cache-hit without EODHD call)
    - Supabase-enabled env guard (NEXT_PUBLIC_SUPABASE_URL check) for integration tests

key_files:
  created:
    - vercel.json (updated — added crons array)
    - src/app/api/cron/refresh-prices/route.ts
    - src/app/api/cron/refresh-prices/route.test.ts
    - src/scripts/seed-instruments.ts
    - tests/integration/data/cron-refresh.spec.ts
    - tests/integration/data/phase3-smoke.spec.ts
    - tests/fixtures/internal/phase3-seed.sql
  modified:
    - package.json (added seed:instruments script)

decisions:
  - "URL constructor used for searchParams instead of request.nextUrl.searchParams — nextUrl is undefined when GET handler called directly in vitest without Next.js runtime; URL(request.url).searchParams works in both contexts"
  - "cron-refresh integration tests use HTTP path (Playwright) for proxy bypass and auth tests; unit tests cover EODHD mock path (vi.mock). Two layers give full coverage without requiring mock injection into a running server."
  - "phase3-smoke tests insert fixture data programmatically via Supabase JS client (not SQL) — consistent with existing pattern and avoids SQL parser complexity with UUID generation"
  - "FX rates inserted directly to fx_rates table (flat rows) rather than via upsertFxRates — upsertFxRates expects FrankfurterRow[] shape; direct upsert with flat rows is cleaner for test fixtures"
  - "CRON_INTEGRATION_TEST env flag gates real EODHD call in cron happy-path test — prevents accidental budget consumption in CI"

metrics:
  duration: "~6 minutes (Tasks 1-3) + ~1 hour (Task 4 partial run + DATA-01 gap discovery)"
  completed_date: "2026-05-02"
  tasks_completed: 3
  tasks_total: 4
  task_4_status: "deferred to Phase 3.1 — DATA-01 gap discovered during partial run"
  files_created: 7
  files_modified: 2
---

# Phase 03 Plan 06: Cron Seed and Smoke Summary

**Daily bulk EOD refresh cron handler, 14-ticker seed script, and 5-criterion phase-level smoke test — all automated tasks complete; paused at Task 4 checkpoint for user-driven seed run and Vercel deploy verification.**

## Status: PAUSED AT CHECKPOINT (Task 4)

Phase 3 is structurally complete. All code paths exist and pass automated tests. Task 4 is a `checkpoint:human-verify` requiring real EODHD API calls and Vercel production deploy — see checkpoint details below.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Cron route + vercel.json | 7c6da23 | vercel.json, src/app/api/cron/refresh-prices/route.ts, route.test.ts |
| 2 | Seed instruments script | d886468 | src/scripts/seed-instruments.ts, package.json |
| 3 | Cron integration + phase smoke tests | f477bd9 | tests/integration/data/cron-refresh.spec.ts, phase3-smoke.spec.ts |

## What Was Built

### Task 1: GET /api/cron/refresh-prices

Route handler at `src/app/api/cron/refresh-prices/route.ts` with:
- CRON_SECRET Bearer auth (401 on missing or wrong secret)
- exchange param validation (US or SW only, 400 otherwise)
- Service-role Supabase client for no-user-session server context
- bulkEod(exchange, today) → filter to tracked instruments → upsertPrices per match
- Response: `{ ok, exchange, date, tracked, returnedByEODHD, upserted, skipped }`
- 6 unit tests covering auth, validation, happy path, graceful no-op

`vercel.json` updated with 2 cron jobs at `0 22 * * *` (22:00 UTC daily, after EODHD posts EOD data ~21:00 UTC):
- `/api/cron/refresh-prices?exchange=US`
- `/api/cron/refresh-prices?exchange=SW`

### Task 2: seed-instruments.ts

Script at `src/scripts/seed-instruments.ts` with:
- 14 v1 template tickers with hardcoded ISINs (reduces OpenFIGI dependency)
- `runSeed({ mode: 'prices' | 'dividends' | 'both' })` exported for testability
- Idempotency: skips instruments where `first_date` already set
- isMain guard prevents CLI side-effects on import
- `npm run seed:instruments [prices|dividends|both]` usage

### Task 3: Integration + Smoke Tests

`tests/integration/data/cron-refresh.spec.ts` (Playwright):
- Test 1: proxy bypass regression — no auth → 401 NOT 302/307
- Tests 2-4: HTTP-level auth and validation assertions
- Test 5: graceful no-op (gated on Supabase env)
- Test 6: real EODHD happy path (gated on CRON_INTEGRATION_TEST flag)

`tests/integration/data/phase3-smoke.spec.ts` (Playwright):
- Criterion 1: cache-hit (failingProvider proves EODHD not re-called)
- Criterion 2: FX rates CHF/USD,EUR,GBP back to 1999-01-04
- Criterion 3: ISIN → isin_lookups → CHDVD.SW ticker + prices
- Criterion 4: SPY.US instrument has name/type=etf/currency=USD
- Criterion 5: both SPY.US and CHDVD.SW have prices AND dividends rows

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] request.nextUrl.searchParams undefined in vitest**
- **Found during:** Task 1 verification (unit tests failed with TypeError on nextUrl)
- **Issue:** `request.nextUrl` is a Next.js-specific property on `NextRequest`. When `GET` is called directly with a plain `Request` object in vitest (not going through Next.js runtime), `nextUrl` is undefined.
- **Fix:** Changed `request.nextUrl.searchParams.get('exchange')` to `new URL(request.url).searchParams.get('exchange')`. The standard `URL` constructor works in both Next.js runtime (where `request.url` is the full URL) and vitest (where we pass `http://localhost/api/cron/refresh-prices?exchange=US`).
- **Files modified:** `src/app/api/cron/refresh-prices/route.ts`
- **Verification:** All 6 unit tests pass after fix.
- **Commit:** 7c6da23

**2. [Rule 1 - Bug] upsertFxRates type mismatch in smoke test**
- **Found during:** Task 3 (TypeScript compilation)
- **Issue:** `upsertFxRates` from `cache-fx.ts` expects `FrankfurterRow[]` (objects with `{ date, base, rates: Record<string, number> }`). The smoke test fixture used flat rows matching the DB schema shape directly.
- **Fix:** Removed `upsertFxRates` import from smoke test. Added local `upsertFlatFxRates` helper that calls `client.from('fx_rates').upsert(rows)` directly with flat rows. This is cleaner for test fixtures and avoids reshaping data.
- **Files modified:** `tests/integration/data/phase3-smoke.spec.ts`
- **Verification:** `tsc --noEmit` passes cleanly.
- **Commit:** f477bd9

## Task 4: Human-Verify Outcome — Partial Run, DATA-01 Gap Discovered

**Status:** **DEFERRED to Phase 3.1.** Phase 3 closes structurally complete with a documented data-source gap.

### What was actually run

| Step | Result |
|------|--------|
| 1. Generate `CRON_SECRET` | ✓ `openssl rand -hex 32`, added to `.env.local` and Vercel (Prod + Preview) |
| 2. Add `EODHD_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SUPABASE_DB_PASSWORD` | ✓ all set in `.env.local` (brackets stripped from password — Supabase docs placeholder leak) |
| 3. Push migrations 00002, 00003 to cloud Supabase | ✓ `npx supabase db push --include-all` clean |
| 4. Update `package.json` seed scripts to load `.env.local` | ✓ `node --env-file=.env.local --import tsx` |
| 5. Day 1 seed: `npm run seed:instruments prices` | ✓ 13/14 succeeded, 3,246 rows, 14 EODHD calls — but see DATA-01 gap |
| 6. Day 2 dividends seed | ✗ deferred (data-source pivot makes it moot) |
| 7. Smoke test | ✗ deferred (would partially pass on truncated data — misleading) |
| 8. Vercel deploy + manual cron trigger | ✗ deferred (no point until data source is correct) |
| 9. Production proxy 401 regression | ✗ deferred |

### Findings

**1. DATA-01 not delivered (architectural — blocks Phase 5 backtester)**

EODHD free tier silently truncates EOD history to ~12 months regardless of the `from` parameter sent. Confirmed against `SPY.US`: requested `from=1970-01-01`, got 250 rows starting 2025-05-05 (last_date 2026-05-01). All 13 successfully-seeded tickers show the same one-year cap — `SELECT first_date FROM instruments` returns dates clustered in May 2025.

The Phase 3 success criterion "full history fetch + cache for any ticker" is not met. ROADMAP.md `must_haves` for DATA-01 must be re-verified against the gap-closure plan in Phase 3.1, not against the current seed.

**Decision:** Pivot data source in Phase 3.1. Replace EODHD with **Stooq (one-time historical bulk import)** + **yahoo-finance2 (daily incremental refresh)**. Both free, both cover US + Swiss SIX + LSE. Reverses the original PROJECT.md decision *"yahoo-finance2 dropped — single source of truth per ticker, no fallback chain"*; new shape is Stooq-for-archive + yahoo-for-incremental, normalized through the Postgres cache.

The `IMarketDataProvider` interface from 03-02 is exactly the right seam for this swap — most of 03-04's `withRetry`, `cache-prices`, and `getPricesForTicker` orchestration code stays. The `EODHDProvider` class becomes a `YahooProvider` (incremental) + a one-shot `StooqImporter` script.

**2. Yahoo coverage verified for all v1 tickers (Phase 3.1 input)**

Curl-tested against `query2.finance.yahoo.com/v8/finance/chart` with explicit `period1`/`period2`:

| Ticker | Yahoo symbol | 5y rows | First date |
|--------|--------------|---------|------------|
| SPY.US | `SPY` | 1255 | 2021-05-04 |
| CHDVD.SW | `CHDVD.SW` | 1256 | 2021-05-04 |
| NOVN.SW | `NOVN.SW` | 1256 | 2021-05-04 |
| CSSPX.SW | `CSSPX.SW` | 1256 | 2021-05-04 |
| 500E.SW | `500E.SW` | 614 | 2023-11-13 (ETF inception) |
| VWRL.LSE | `VWRL.L` | 1262 | 2021-05-04 |
| IWDA.LSE | `IWDA.L` | 1262 | 2021-05-04 |

LSE tickers need symbol mapping `.LSE` → `.L`. Swiss `.SW` works unchanged. Important: Yahoo's `range=max&interval=1d` silently downsamples to monthly; full daily history requires explicit `period1`/`period2` in epoch seconds, chunked if needed.

**3. IQQA.SW is wrong on EODHD (operational)**

EODHD returned 404 for `IQQA.SW`. Likely correct symbol is `SSAC.SW` for the Acc class of iShares MSCI ACWI UCITS, or the Swiss listing simply isn't on EODHD. Will be verified against Yahoo/Stooq in Phase 3.1.

### Deferred for Phase 3.1

- Replace EODHDProvider with YahooProvider + StooqImporter
- Re-seed all 14 v1 tickers (with corrected ticker for IQQA.SW)
- Run `phase3-smoke.spec.ts` against populated DB with full history
- Verify SPY adjusted-close for 2020-03-16 (COVID circuit-breaker day) within 0.5% of public reference
- Vercel production deploy + manual cron trigger
- Production-side proxy 401 regression check

## Self-Check: PASSED

All key files confirmed on disk. All 3 task commits confirmed in git history.

| Check | Result |
|-------|--------|
| vercel.json with crons array | FOUND |
| src/app/api/cron/refresh-prices/route.ts | FOUND |
| src/app/api/cron/refresh-prices/route.test.ts | FOUND |
| src/scripts/seed-instruments.ts | FOUND |
| tests/integration/data/cron-refresh.spec.ts | FOUND |
| tests/integration/data/phase3-smoke.spec.ts | FOUND |
| commit 7c6da23 (Task 1: cron route) | FOUND |
| commit d886468 (Task 2: seed script) | FOUND |
| commit f477bd9 (Task 3: integration tests) | FOUND |
| 49 unit tests passing | CONFIRMED |
| tsc --noEmit clean | CONFIRMED |
