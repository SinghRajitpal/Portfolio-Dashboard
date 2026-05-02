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
  duration: "~6 minutes (Tasks 1-3)"
  completed_date: "2026-05-02"
  tasks_completed: 3
  tasks_total: 4
  files_created: 7
  files_modified: 2
  checkpoint_at: "Task 4 (human-verify: real seed + Vercel deploy)"
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

## Checkpoint: Task 4 (human-verify)

**Status:** Awaiting human verification of real EODHD seed + Vercel production deploy.

See checkpoint details in the plan. Key steps:
1. Generate CRON_SECRET: `openssl rand -hex 32`
2. Add to `.env.local` AND Vercel project env (Production + Preview)
3. Day 1: `npm run seed:instruments prices` (14 EODHD calls)
4. Day 2: `npm run seed:instruments dividends` (14 EODHD calls)
5. Run smoke test against populated DB: `npm run test:integration -- tests/integration/data/phase3-smoke.spec.ts`
6. Deploy: `git push origin main`, then trigger cron manually in Vercel dashboard
7. Production verification: visit cron URL without bearer → 401 (not 302)

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
