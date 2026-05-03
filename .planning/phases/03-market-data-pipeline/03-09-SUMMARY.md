---
phase: 03-market-data-pipeline
plan: 09
subsystem: api
tags: [yahoo-finance2, provider-swap, cron, seed-instruments, symbol-map, typescript]

requires:
  - phase: 03-market-data-pipeline
    plan: 07
    provides: YahooProvider implementing IMarketDataProvider

provides:
  - YahooProvider wired as default in getPricesForTicker (cache-miss path)
  - YahooProvider wired in seed-instruments.ts runSeed() for dividends mode
  - Cron route per-ticker YahooProvider.getEod loop covering US, SW, and LSE exchanges
  - SSAC.SW replacing IQQA.SW in v1 SEED list
  - No production code path constructs EODHDProvider

affects:
  - 03-10-reseed-and-verify (next plan — re-seeds all 14 tickers and runs smoke test)
  - src/app/api/instruments/search/route.ts (also swapped in same plan — auto-fix Rule 1)

tech-stack:
  added: []
  patterns:
    - Per-ticker incremental loop replacing bulkEod in cron route (Yahoo has no bulk endpoint)
    - 250ms throttle between tickers in cron loop (anonymous rate-limit protection)
    - prices mode no-op guard in seed-instruments.ts (Stooq owns historical bulk seeding)

key-files:
  created:
    - src/lib/data/getPrices.test.ts
  modified:
    - src/lib/data/getPrices.ts
    - src/scripts/seed-instruments.ts
    - src/app/api/cron/refresh-prices/route.ts
    - src/app/api/cron/refresh-prices/route.test.ts
    - src/app/api/instruments/search/route.ts

decisions:
  - "SSAC.SW ISIN confirmed as IE00B6R52259 — iShares MSCI ACWI UCITS ETF (Acc) on SIX. CHF-denominated. Replaces IQQA.SW which returned EODHD 404."
  - "seed-instruments.ts prices mode is now a no-op — Stooq owns historical bulk seeding; only dividends and both modes invoke YahooProvider"
  - "Cron route response drops returnedByEODHD; adds attempted (= tracked.length) to preserve response shape compat"
  - "instruments/search route text-search branch also swapped to YahooProvider (Rule 1 auto-fix — production path still had new EODHDProvider)"

requirements:
  - DATA-01
  - DATA-03

duration: 7min
completed: 2026-05-03
---

# Phase 03 Plan 09: Provider Swap Summary

**YahooProvider wired as default across all three production call sites; IQQA.SW corrected to SSAC.SW; cron route reworked for per-ticker incremental loop with LSE support — DATA-01 and DATA-03 closure unblocked**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-03T20:50:09Z
- **Completed:** 2026-05-03T20:57:30Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

### Task 1: getPrices.ts + seed-instruments.ts provider swap

- `getPrices.ts` line 62: `new EODHDProvider(process.env.EODHD_API_KEY ?? '')` → `new YahooProvider()` (keyless)
- `seed-instruments.ts`: SEED list corrected (IQQA.SW → SSAC.SW); `runSeed()` now uses `YahooProvider`; `prices` mode returns immediately with a no-op warning (Stooq owns historical bulk seeding)
- New test file `getPrices.test.ts`: 3 tests covering invalid input, cache-miss path with stub provider, and a source-level assertion that `YahooProvider` is imported (not `EODHDProvider`)
- 122 unit tests passing after Task 1

### Task 2: Cron route + search route provider swap

- `route.ts`: EODHD bulk EOD loop replaced with YahooProvider per-ticker getEod loop; `ALLOWED_EXCHANGES` extended to `['US', 'SW', 'LSE']` so VWRL.LSE and IWDA.LSE refresh nightly; 250ms inter-ticker throttle; best-effort design (individual ticker errors go to `skipped[]`, request still returns 200)
- `route.test.ts`: Fully rewritten for the new YahooProvider interface — 8 tests: auth (Tests 1-2), exchange validation (Tests 3-4), US per-ticker success (Test 5), LSE now valid (Test 6), dual-ticker loop with upserted=2 (Test 7), one-ticker error → skipped with 200 (Test 8)
- `instruments/search/route.ts`: Text search branch swapped from EODHDProvider to YahooProvider (Rule 1 auto-fix — this production path was missed in the plan's list of 3 call sites)
- 138 unit tests passing; tsc clean

## SSAC.SW ISIN Confirmation

**Ticker:** SSAC.SW  
**ISIN:** IE00B6R52259  
**Name:** iShares MSCI ACWI UCITS ETF (Acc)  
**Exchange:** SIX Swiss Exchange (SW)  
**Currency:** CHF  
**Type:** ETF (accumulating — no dividend distributions)

This ISIN was hardcoded per plan instructions ("Spot-check ISIN against issuer factsheet during execution"). The ISIN IE00B6R52259 is the BlackRock-confirmed ISIN for the iShares MSCI ACWI Acc UCITS ETF listed on SIX. Currency set to CHF (CHF share class on SIX). No blocker — Phase 4 UI tolerates null expense_ratio/dividend_yield.

## Cron Route Integration Test Status

The integration test at `tests/integration/data/cron-refresh.spec.ts` was NOT modified per plan instructions (deferred to Plan 10). That test may need updating because:

1. It previously mocked/expected EODHD bulk behavior
2. The response shape changed: `returnedByEODHD` field replaced by `attempted`

Per plan: "Do NOT modify tests/integration/data/cron-refresh.spec.ts in this plan — if any assertions break, document in SUMMARY but defer fix to Plan 10's verification step."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EODHDProvider in instruments/search/route.ts text search branch**
- **Found during:** Task 2 verification (`grep -rn "new EODHDProvider" src/` check)
- **Issue:** `src/app/api/instruments/search/route.ts` line 108 still constructed `new EODHDProvider(apiKey)` for the text search branch. This is a production code path and violates the plan's success criterion "no production code path constructs EODHDProvider."
- **Fix:** Swapped to `new YahooProvider()` (keyless); removed EODHD_API_KEY check in that branch; updated doc comment from "EODHD search" to "YahooProvider text search"
- **Files modified:** `src/app/api/instruments/search/route.ts`
- **Tests verified:** All 5 existing tests in `route.test.ts` still pass (none hit the text search branch)
- **Commit:** d7bf706

---

**Total deviations:** 1 auto-fixed (Rule 1 — production path bug)  
**Impact on plan:** Fix was necessary for the stated success criterion. No scope creep.

## EODHDProvider.ts Confirmation

`git diff src/lib/data/EODHDProvider.ts` — empty. File untouched, byte-identical to pre-plan state. Kept on disk as reference implementation per VERIFICATION.md note. `EODHDProvider.test.ts` continues passing (8 tests).

## Verification Results

```
grep -rn "new EODHDProvider" src/ (excl *.test.ts) → CLEAN (0 matches)
grep -n "IQQA" src/scripts/seed-instruments.ts → PASS (0 matches)
grep -n "SSAC.SW" src/scripts/seed-instruments.ts → 1 match (line 131)
grep -n "LSE" src/app/api/cron/refresh-prices/route.ts → matches (ALLOWED_EXCHANGES, comments)
All 138 unit tests passing
tsc --noEmit clean
EODHDProvider.ts still on disk (unmodified)
```

## Task Commits

1. **Task 1: Swap default provider in getPrices.ts + seed-instruments.ts** — `e125157`
2. **Task 2: Rework cron route + swap search route** — `d7bf706`

## Self-Check

### File existence
- FOUND: src/lib/data/getPrices.ts
- FOUND: src/lib/data/getPrices.test.ts
- FOUND: src/scripts/seed-instruments.ts
- FOUND: src/app/api/cron/refresh-prices/route.ts
- FOUND: src/app/api/cron/refresh-prices/route.test.ts
- FOUND: src/lib/data/EODHDProvider.ts (kept on disk, unmodified)

### Commits
- e125157: FOUND
- d7bf706: FOUND

## Self-Check: PASSED

---

*Phase: 03-market-data-pipeline*  
*Completed: 2026-05-03*
