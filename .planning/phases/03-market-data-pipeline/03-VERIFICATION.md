---
phase: 03-market-data-pipeline
verified: 2026-05-02T23:45:00Z
status: gaps_found
score: 4/5 requirements verified (DATA-01 gap confirmed)
re_verification: false
gaps:
  - requirement: DATA-01
    truth: "Full historical price + dividend series (inception to present) available for all v1 tickers"
    status: failed
    reason: "EODHDProvider.getEod() passes from=1970-01-01 but EODHD free tier silently truncates to ~12 months. Confirmed: SPY.US seeded 250 rows starting 2025-05-05 despite requesting from=1970-01-01. All 13 successfully-seeded tickers show the same one-year cap. The getPricesForTicker orchestration and cache layer are correct; the data source is the problem."
    artifacts:
      - path: "src/lib/data/EODHDProvider.ts"
        issue: "EODHDProvider.getEod() is the live provider; must be replaced with YahooProvider + StooqImporter in Phase 3.1. Class can stay as reference but should not be the default in getPricesForTicker."
      - path: "src/lib/data/getPrices.ts"
        issue: "Line 62 hard-codes new EODHDProvider(…) as default provider. Phase 3.1 must swap to YahooProvider here (or inject via deps.provider at the call site)."
      - path: "src/scripts/seed-instruments.ts"
        issue: "runSeed() uses EODHDProvider directly. Phase 3.1 needs a new StooqImporter path for historical bulk load and a YahooProvider path for incremental/day-2 dividends."
      - path: "src/app/api/cron/refresh-prices/route.ts"
        issue: "Cron handler constructs new EODHDProvider(apiKey). Phase 3.1 must swap to YahooProvider for daily incremental. EODHD_API_KEY env var becomes YAHOO_API_KEY (or no key — yahoo-finance2 is keyless)."
    missing:
      - "YahooProvider implementing IMarketDataProvider (getEod via yahoo-finance2 with period1/period2 epoch chunks; getDividends; search)"
      - "StooqImporter one-shot script for historical bulk download (CSV download pattern)"
      - "Symbol mapper: VWRL.LSE → VWRL.L and IWDA.LSE → IWDA.L for Yahoo; re-verify IQQA.SW → likely SSAC.SW"
      - "Re-seed all 14 v1 tickers with full history via Stooq+Yahoo after provider swap"
      - "Verified first_date in instruments table reaching ≥5 years back for all tickers (≥10 years for SPY.US, AGG.US)"
  - requirement: DATA-05
    truth: "Phase 3 smoke test (phase3-smoke.spec.ts) passes against a populated production DB"
    status: failed
    reason: "Smoke test is structurally complete and passes in unit/fixture mode, but was deferred from the Task 4 human-verify checkpoint because the DB was only seeded with truncated EODHD data. Criterion 5 (SPY.US adjusted-close sanity check for 2020-03-16 COVID circuit-breaker day) cannot pass until DATA-01 is closed and full history is in the DB."
    artifacts:
      - path: "tests/integration/data/phase3-smoke.spec.ts"
        issue: "Structurally complete; all 5 criteria are correctly coded. Must be run against the DB after Phase 3.1 re-seed to confirm the real pass."
    missing:
      - "Full DB re-seed (Phase 3.1) before smoke test run is meaningful"
      - "SPY adjusted-close for 2020-03-16 within 0.5% of public reference (manual check)"
human_verification:
  - test: "Run phase3-smoke.spec.ts against production DB after Phase 3.1 re-seed"
    expected: "All 5 criteria pass: cache-hit, FX back to 1999, ISIN→CHDVD, SPY metadata, SPY+CHDVD prices+dividends"
    why_human: "Requires live Supabase env and populated DB; fixture-mode run does not validate real data"
  - test: "Vercel production deploy + manual cron trigger for both exchanges"
    expected: "GET /api/cron/refresh-prices?exchange=US and ?exchange=SW both return 200 with upserted>0"
    why_human: "Requires production Vercel env with CRON_SECRET, EODHD_API_KEY (or yahoo key after swap), and seeded instruments table"
  - test: "Production proxy 401 regression — unauthenticated request to /api/cron/refresh-prices"
    expected: "401 returned directly (not 302 redirect to /auth) — proves proxy.ts matcher excludes api/cron"
    why_human: "Integration test covers this (cron-refresh.spec.ts Test 1) but must be re-confirmed against the production URL after deploy"
  - test: "Day-2 dividends seed (npm run seed:instruments dividends) after Phase 3.1 provider swap"
    expected: "All 14 tickers accumulate dividend rows; summary.dividends > 0; no errors for non-zero-dividend instruments"
    why_human: "Requires live provider call; deferred from 03-06 Task 4 because data-source pivot makes EODHD result moot"
---

# Phase 3: Market Data Pipeline — Verification Report

**Phase Goal:** The system can fetch, validate, and cache historical prices, dividends, and FX rates from all required sources, ready for the backtest engine to consume.
**Verified:** 2026-05-02T23:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Requirement-by-Requirement Assessment

### DATA-01 — Full historical prices cached per ticker

**Requirement (REQUIREMENTS.md):** "System fetches and caches historical daily prices from EODHD"
**ROADMAP success criterion:** "A request for a ticker's historical price series returns cached data from Supabase on subsequent calls (no repeat EODHD call)"

**Status: GAP**

The cache-first orchestration in `getPrices.ts` is correct and wired. The `getPricesForTicker` function checks `first_date` for a cache-hit, falls through to the provider on cache-miss, upserts via `upsertPrices`, and returns `cached: true` on repeat calls. The smoke test Criterion 1 (failingProvider) proves this path programmatically.

The gap is the data source, not the architecture. `EODHDProvider.getEod()` passes `from=1970-01-01` but EODHD free tier silently ignores the `from` parameter and returns only ~12 months of history. Confirmed in Task 4: SPY.US returned 250 rows starting 2025-05-05 when 55 years of data was requested. All 13 successfully-seeded tickers show `first_date` in May 2025.

The `IMarketDataProvider` interface is the correct swap seam. Phase 3.1 targets:
- `src/lib/data/EODHDProvider.ts` — stays as reference; new `YahooProvider.ts` alongside it
- `src/lib/data/getPrices.ts` line 62 — swap default provider from `EODHDProvider` to `YahooProvider`
- `src/scripts/seed-instruments.ts` — new `StooqImporter` path for historical bulk

---

### DATA-02 — FX rates back to 1999

**Requirement:** "System fetches and caches historical FX rates (USD/CHF, EUR/CHF, GBP/CHF)"
**ROADMAP success criterion:** "Historical CHF/USD, CHF/EUR, and CHF/GBP FX rates are available for any date back to 1999 from the Frankfurter cache"

**Status: PASSED**

All components exist and are wired:

| Artifact | Status |
|----------|--------|
| `src/lib/data/frankfurter.ts` — `fetchFrankfurterRates()` with NDJSON parsing | Substantive, wired |
| `src/lib/data/cache-fx.ts` — `upsertFxRates()` and `getFxRate()` | Substantive, wired |
| `src/scripts/seed-fx.ts` — idempotent seed from 1999-01-04, isMain guard | Substantive, wired |
| `package.json` — `seed:fx` with `--env-file=.env.local` | Present |
| Smoke test Criterion 2 — asserts 1999-01-04 CHF/USD,EUR,GBP exist with plausible rates | Coded, fixture-mode verified |
| Unit tests (frankfurter.test.ts) — 5 tests passing | Passing |

**Day-1 Supabase push confirmed:** migrations 00001 (fx_rates table with UNIQUE constraint) pushed to cloud via `npx supabase db push --include-all`. Frankfurter seed was run (13-07 summary confirms FX rows present in DB during Task 4 setup).

Caveat: The smoke test Criterion 2 passes only in fixture-mode (test data inserted in `beforeAll`). A production-DB run after Phase 3.1 re-seed will confirm real Frankfurter data covers 1999-01-04. This is a human-verify item, not a code gap.

---

### DATA-03 — Multi-exchange instrument support (US, Swiss, LSE)

**Requirement:** "System supports US-listed ETFs, Swiss/European ETFs, individual stocks, commodities, and futures"
**ROADMAP success criterion:** implied by Criterion 5 (CHDVD.SW + SPY.US both work)

**Status: PASSED (with a noted limitation)**

The schema, types, and provider interface support all exchange codes without restriction. `InstrumentMetadata.exchange` is a free-form string. The seed list covers:
- US ETFs: SPY.US, AGG.US, VTI.US, BND.US, GLD.US, QQQ.US, EEM.US
- Swiss SIX ETFs: CSSPX.SW, 500E.SW, CHDVD.SW, NOVN.SW (stock), IQQA.SW (flagged wrong)
- LSE UCITS: VWRL.LSE, IWDA.LSE

**Noted limitation — cron daily refresh (US/SW only):** `GET /api/cron/refresh-prices` validates `exchange` against `Set(['US', 'SW'])` only. LSE tickers (VWRL.LSE, IWDA.LSE) are in the seed list but will never be refreshed by the daily cron. This is a known scope decision (EODHD bulkEod supports US and SW; LSE bulk is not in scope for v1 cron). After the Phase 3.1 Yahoo swap, LSE coverage via incremental daily fetch should be added to the cron handler. Not a blocker for Phase 4 (seed provides static data), but noted here.

**IQQA.SW ticker wrong:** EODHD returned 404; likely correct symbol is SSAC.SW. Must be corrected in seed list in Phase 3.1.

---

### DATA-04 — Instrument metadata stored and retrievable

**Requirement:** "System stores instrument metadata (name, type, expense ratio, dividend yield, currency)"
**ROADMAP success criterion:** "Instrument metadata (name, type, currency, expense ratio, dividend yield) is stored and retrievable for a given ticker"

**Status: PASSED**

`upsertInstrumentMetadata()` in `cache-prices.ts` stores ticker, name, isin, type, currency, exchange, expense_ratio, dividend_yield, data_source. `getInstrumentByTicker()` retrieves id, first_date, last_date. Migration 00003 added `first_date`/`last_date` columns. Smoke test Criterion 4 asserts SPY.US has name/type=etf/currency=USD. Unit tests confirm the upsert contract.

`expense_ratio` and `dividend_yield` are stored as null for v1 (EODHD free tier does not provide fundamentals). This is a documented decision, not a gap — Phase 4 can populate lazily.

---

### DATA-05 — ISIN search via OpenFIGI

**Requirement:** "User can search instruments by ISIN via OpenFIGI resolution"
**ROADMAP success criterion:** "An ISIN typed into instrument search resolves to the correct ticker via OpenFIGI and returns price data"

**Status: PASSED (code path) / HUMAN-NEEDED (production smoke)**

| Artifact | Status |
|----------|--------|
| `src/lib/data/openfigi.ts` — `resolveISIN()` with Zod validation, withRetry, OPENFIGI_BASE_URL override | Substantive, wired |
| `src/lib/data/cache-isin.ts` — `readCachedISIN()` / `upsertISINMappings()` | Substantive, wired |
| `src/app/api/instruments/search/route.ts` — auto-detects ISIN regex, cache-first OpenFIGI branch, ticker-search branch | Substantive, wired |
| Unit tests (openfigi.test.ts, search/route.test.ts) — 9 tests passing | All passing |
| Migration 00002 — `isin_lookups` table with composite PK and RLS | Confirmed pushed to cloud |
| Smoke test Criterion 3 — asserts CH0237935637→CHDVD.SW | Coded, fixture-mode |

The route correctly distinguishes ISIN (12-char regex) from ticker/name queries and branches accordingly. Cache-first logic confirmed by unit test 4 (second ISIN call does not re-call OpenFIGI). The production smoke run is a human-verify item (needs live DB after Phase 3.1 re-seed).

---

## Structural Completeness

All Phase 3 code infrastructure is in place:

| Category | Files | Status |
|----------|-------|--------|
| Test infra | vitest.config.mts, mock-fetch, supabase-test helper, playwright.config.ts | In place |
| Proxy cron-bypass | src/proxy.ts (api/cron excluded from redirect) | Confirmed by unit test |
| Error contract | errors.ts (DataError union + isDataError) | All 5 unit tests pass |
| Interface | IMarketDataProvider.ts (getEod, getDividends, bulkEod, search) | In place — correct swap seam |
| FX pipeline | frankfurter.ts, cache-fx.ts, seed-fx.ts | In place |
| Price pipeline | EODHDProvider.ts, backoff.ts, cache-prices.ts, getPrices.ts | In place (provider to be swapped) |
| ISIN pipeline | openfigi.ts, cache-isin.ts | In place |
| Search route | /api/instruments/search/route.ts | In place |
| Cron route | /api/cron/refresh-prices/route.ts + vercel.json | In place |
| Seed scripts | seed-fx.ts, seed-instruments.ts | In place (provider to be swapped) |
| Migrations | 00002_isin_lookups.sql, 00003_instruments_date_range.sql | Pushed to cloud Supabase |
| Smoke test | tests/integration/data/phase3-smoke.spec.ts | Coded; not yet run against real DB |
| Unit tests | 49 tests across 8 files | All passing |
| TypeScript | tsc --noEmit | Clean |

---

## Gaps Summary

**One architectural gap (DATA-01):** EODHD free tier delivers only ~12 months of history, not full inception-to-present history. The gap is in the data source, not the pipeline architecture. The `IMarketDataProvider` interface is the exact swap seam — replacing `EODHDProvider` with `YahooProvider` (incremental daily) and adding a `StooqImporter` (one-time bulk archive) in Phase 3.1 closes DATA-01 without touching the cache layer, cron handler structure, or smoke test criteria.

**One deferred smoke run (DATA-05 / overall):** The `phase3-smoke.spec.ts` test is structurally complete and proves all 5 criteria in fixture-mode, but a real-DB run against a fully re-seeded database is still pending. This is not a code gap — it is a runtime verification deferred to Phase 3.1.

**Phase 3.1 primary targets:**
1. `src/lib/data/YahooProvider.ts` — new file implementing `IMarketDataProvider` via yahoo-finance2
2. `src/scripts/StooqImporter.ts` (or `seed-instruments-stooq.ts`) — one-shot CSV bulk download
3. `src/lib/data/getPrices.ts` line 62 — swap default provider
4. `src/app/api/cron/refresh-prices/route.ts` — swap provider, add LSE exchange support
5. `src/scripts/seed-instruments.ts` — update IQQA.SW → SSAC.SW, use new provider
6. Re-seed all 14 tickers and run `phase3-smoke.spec.ts` against the populated DB

---

_Verified: 2026-05-02T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
