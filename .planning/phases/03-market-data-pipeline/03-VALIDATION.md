---
phase: 3
slug: market-data-pipeline
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-02
last_updated: 2026-05-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (integration) |
| **Config files** | `vitest.config.ts` (added in Plan 01) + `playwright.config.ts` (Phase 1 inheritance) |
| **Quick run command** | `npm run test:unit -- {affected file}` |
| **Full suite command** | `npm run test` (vitest + playwright integration) |
| **Estimated runtime** | ~30s unit, ~90s integration |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- {affected file}` (or the integration spec named in the task's `<verify>`)
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green AND Plan 06 Task 4 human checkpoint approved
- **Max feedback latency:** 30 seconds (unit), 120 seconds (integration)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 01 | 1 | (infra) | unit | `npm run test:unit` | created in task | pending |
| 03-01-T2 | 01 | 1 | DATA-01,02,03,04,05 (regression for cron) | integration | `npx playwright test tests/integration/data/proxy-cron-bypass.spec.ts --project=chromium` | created in task | pending |
| 03-01-T3 | 01 | 1 | (infra) | unit | `npm run test:unit -- tests/unit/mock-fetch.test.ts` | created in task | pending |
| 03-02-T1 | 02 | 2 | DATA-04 | unit | `npm run test:unit -- src/lib/data/errors.test.ts` | created in task | pending |
| 03-02-T2 | 02 | 2 | DATA-04 | typecheck | `npx tsc --noEmit -p tsconfig.json` | created in task | pending |
| 03-02-T3 | 02 | 2 | DATA-05 | integration | `npx playwright test tests/integration/data/isin-lookups-migration.spec.ts --project=chromium` | created in task | pending |
| 03-03-T1 | 03 | 2 | DATA-02 | unit | `npm run test:unit -- src/lib/data/frankfurter.test.ts` | created in task | pending |
| 03-03-T2 | 03 | 2 | DATA-02 | typecheck | `npx tsc --noEmit -p tsconfig.json` | created in task | pending |
| 03-03-T3 | 03 | 2 | DATA-02 | integration | `npx playwright test tests/integration/data/fx-seed.spec.ts --project=chromium` | created in task | pending |
| 03-04-T1 | 04 | 3 | DATA-01 | unit | `npm run test:unit -- src/lib/data/backoff.test.ts` | created in task | pending |
| 03-04-T2 | 04 | 3 | DATA-01,03 | typecheck | `npx supabase db reset && npx tsc --noEmit -p tsconfig.json` | created in task | pending |
| 03-04-T3 | 04 | 3 | DATA-01,03,04 | unit | `npm run test:unit -- src/lib/data/EODHDProvider.test.ts` | created in task | pending |
| 03-04-T4 | 04 | 3 | DATA-01,03,04 | integration | `npx playwright test tests/integration/data/eodhd-cache-flow.spec.ts --project=chromium` | created in task | pending |
| 03-05-T1 | 05 | 4 | DATA-05 | unit | `npm run test:unit -- src/lib/data/openfigi.test.ts` | created in task | pending |
| 03-05-T2 | 05 | 4 | DATA-05,03,04 | unit | `npm run test:unit -- src/app/api/instruments/search/route.test.ts` | created in task | pending |
| 03-05-T3 | 05 | 4 | DATA-05 | integration | `npx playwright test tests/integration/data/search-route.spec.ts --project=chromium` | created in task | pending |
| 03-06-T1 | 06 | 5 | DATA-01 | unit | `npm run test:unit -- src/app/api/cron/refresh-prices/route.test.ts` | created in task | pending |
| 03-06-T2 | 06 | 5 | DATA-01,03,04 | typecheck | `npx tsc --noEmit -p tsconfig.json` | created in task | pending |
| 03-06-T3 | 06 | 5 | DATA-01..05 | integration | `npx playwright test tests/integration/data/cron-refresh.spec.ts tests/integration/data/phase3-smoke.spec.ts --project=chromium` | created in task | pending |
| 03-06-T4 | 06 | 5 | DATA-01..05 | manual | human checkpoint (real seed + Vercel cron deploy) | n/a | pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (covered by Plan 01)

- [x] `vitest.config.ts` — installed via Plan 01 Task 1
- [x] `tests/integration/data/` — directory created in Plan 01 Task 3
- [x] `tests/fixtures/eodhd/` — fixtures created in Plan 01 Task 3 (spy-eod, spy-dividends, chdvd-eod, chdvd-dividends, bulk-us-sample, search-apple)
- [x] `tests/fixtures/frankfurter/` — fixture created in Plan 01 Task 3 (chf-rates-sample.ndjson)
- [x] `tests/fixtures/openfigi/` — fixture created in Plan 01 Task 3 (chdvd-isin.json)
- [x] `tests/helpers/supabase-test.ts` — created in Plan 01 Task 3
- [x] `tests/helpers/mock-fetch.ts` — created in Plan 01 Task 3

All Wave 0 dependencies are satisfied by Plan 01 (wave: 1, depends_on: []). All later plans (waves 2-5) can declare `<automated>` verify commands without MISSING placeholders.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Plan / Task |
|----------|-------------|------------|-------------------|-------------|
| Vercel Cron actually fires daily | DATA-01 | Cron schedule executes only on real Vercel deploys | After deploy: trigger via Vercel dashboard "Run now"; confirm new rows in `prices` for prior trading day; check Vercel logs for 200 response | Plan 06 / Task 4 |
| Real EODHD key burns ≤ daily budget | DATA-01, DATA-04 | Production rate limit can only be observed against real API | Manually run seed script in dev with prod key once; confirm ≤20 calls per day; document in STATE.md and `03-06-SUMMARY.md` | Plan 06 / Task 4 |
| EODHD `adjusted_close` matches public source for SPY 2020-03-15 | DATA-01 | Sanity check on adjustment correctness for total-return backtests | Compare DB row to Yahoo Finance for 2020-03-15 — within 0.5% tolerance | Plan 06 / Task 4 |
| Production proxy STILL excludes /api/cron/ | (regression) | Vercel deploy is the only way to confirm prod proxy.ts behavior | Hit `https://portfolioforge-green.vercel.app/api/cron/refresh-prices?exchange=US` unauthenticated; expect 401 not 302 | Plan 06 / Task 4 |
| FX seed full 1999..today run | DATA-02 | One-shot manual run; ~5MB NDJSON download | `npm run seed:fx`; expect ~6,750+ rows; confirm no OOM | Plan 03 / Task 3 (post-merge manual) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are marked manual (Plan 06 / Task 4 is the only manual gate; it depends on automated completion of all prior tasks)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has either a unit, integration, or typecheck verify; the manual checkpoint follows 19 automated tasks)
- [x] Wave 0 covers all MISSING references — Plan 01 ships Vitest, fixtures, helpers, mock-fetch
- [x] No watch-mode flags — all `npm run test:unit` invocations use Vitest's default `vitest run` one-shot
- [x] Feedback latency < 30s for unit, < 120s for integration
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by gsd-planner (2026-05-02)

---

## Goal-Backward Coverage Map (Phase Success Criteria → Tests)

| ROADMAP Success Criterion | Truth | Test File | Test Name |
|---------------------------|-------|-----------|-----------|
| 1. Cached price returns from Supabase, no repeat EODHD call | "Second call for same ticker returns from cache" | `tests/integration/data/eodhd-cache-flow.spec.ts` + `tests/integration/data/phase3-smoke.spec.ts` | "cache hit returns rows without provider call" |
| 2. CHF/USD, CHF/EUR, CHF/GBP available since 1999 | "fx_rates row for 1999-01-04 exists for all 3 quote currencies" | `tests/integration/data/fx-seed.spec.ts` + `tests/integration/data/phase3-smoke.spec.ts` | "fx rates back to 1999" |
| 3. ISIN resolves to ticker, returns price data | "POST /api/instruments/search with ISIN returns ticker; that ticker has price rows" | `tests/integration/data/search-route.spec.ts` + `tests/integration/data/phase3-smoke.spec.ts` | "isin resolves to ticker with prices" |
| 4. Instrument metadata stored | "instruments row has name, type, currency, exchange after first fetch" | `tests/integration/data/eodhd-cache-flow.spec.ts` + `tests/integration/data/phase3-smoke.spec.ts` | "instrument metadata persisted" |
| 5. Swiss UCITS ETF + US ETF round-trip | "Both CHDVD.SW and SPY.US have prices and dividends rows" | `tests/integration/data/eodhd-cache-flow.spec.ts` + `tests/integration/data/phase3-smoke.spec.ts` | "swiss and us instruments return data" |
