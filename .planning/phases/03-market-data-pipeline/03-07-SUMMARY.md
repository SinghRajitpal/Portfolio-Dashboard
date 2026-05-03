---
phase: 03-market-data-pipeline
plan: 07
subsystem: api
tags: [yahoo-finance2, market-data, provider, symbol-mapping, typescript]

requires:
  - phase: 03-market-data-pipeline
    provides: IMarketDataProvider interface, DataError types, withRetry backoff, EODHDProvider as reference

provides:
  - YahooProvider class implementing IMarketDataProvider using yahoo-finance2 chart() with period1/period2 epoch seconds
  - symbol-map module (toYahooSymbol/fromYahooSymbol) for .US/.LSE/.SW ticker translation
  - 58 unit tests (43 symbol-map, 15 YahooProvider) all passing

affects:
  - 03-08-stooq-importer (needs YahooProvider for incremental after bulk import)
  - 03-09-provider-swap (swaps getPricesForTicker to use YahooProvider as default)
  - 03-10-reseed-and-verify (uses YahooProvider to seed full history)

tech-stack:
  added:
    - yahoo-finance2@3.14.0 (keyless Yahoo Finance API client; ESM-only, CJS via require works in Next.js server context)
  patterns:
    - Constructor injection for test isolation (opts.client?: YahooFinanceClient)
    - Symbol map split-on-last-dot: no regex chains, pure mapping table
    - period1=0 for full history (1970-epoch), explicit period2=now — never range=max
    - Lazy require('yahoo-finance2') in constructor to avoid top-level ESM side-effects

key-files:
  created:
    - src/lib/data/YahooProvider.ts
    - src/lib/data/YahooProvider.test.ts
    - src/lib/data/symbol-map.ts
    - src/lib/data/symbol-map.test.ts
  modified:
    - next.config.ts (added 'yahoo-finance2' to serverExternalPackages)
    - package.json / package-lock.json (yahoo-finance2@3.14.0 added)

key-decisions:
  - "yahoo-finance2 v3.14.0 used (not ^2) — v2.x ESM build only ships autoc+quote, no chart module; v3 is required for chart() and search()"
  - "range=max avoided entirely — period1/period2 epoch seconds used per STATE.md decision (range=max silently downsamples to monthly)"
  - "ChartResultArray format (return='array') used — gives quotes[] with date:Date and adjclose field directly, simpler than object format"
  - "require('yahoo-finance2') inside constructor — avoids top-level ESM import issues in vitest/Node.js CJS context"
  - "YahooFinanceClient interface (local) typed for test injection — avoids importing full YahooFinance class in tests"

patterns-established:
  - "Symbol mapper: toYahooSymbol/fromYahooSymbol as pure functions with exported mapping table constant"
  - "Provider error mapping: mapYahooError() function, same pattern as EODHDProvider.mapSDKError()"
  - "TDD with constructor injection: write failing tests first, then implement minimal code to pass"

requirements-completed:
  - DATA-01

duration: 5min
completed: 2026-05-03
---

# Phase 03 Plan 07: Yahoo Provider Summary

**Keyless IMarketDataProvider via yahoo-finance2 chart() with explicit epoch ranges and deterministic .US/.LSE/.SW symbol mapping — DATA-01 closure unblocked**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-03T20:23:21Z
- **Completed:** 2026-05-03T20:28:40Z
- **Tasks:** 2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `symbol-map.ts` — `toYahooSymbol`/`fromYahooSymbol` pure functions with mapping table; 43 parametric tests cover all 14 v1 tickers and round-trip correctness
- `YahooProvider.ts` — full IMarketDataProvider implementation using yahoo-finance2 v3.14.0; period1/period2 epoch seconds, never `range=max`, withRetry wrapping all methods
- 58 unit tests passing; `tsc --noEmit` clean; EODHDProvider.ts byte-identical to pre-plan

## Pinned yahoo-finance2 version

`yahoo-finance2@3.14.0` — v2.x was installed first but its ESM build only includes `autoc` and `quote` modules; `chart()` required for full daily history is only present in v3+. Upgraded to `^3` and pinned to the installed version 3.14.0 in package.json.

## range=max status

**Avoided — confirmed.** `getEod` passes `period1` (0 for full history, epoch seconds for bounded range) and `period2` (current epoch). No `range` key appears in any chart call. Test 6 asserts `opts` does NOT have a `range` property.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build symbol mapper with unit tests** - `1276330` (feat)
2. **Task 2: Install yahoo-finance2 and implement YahooProvider** - `425222e` (feat)

**Plan metadata:** (final commit — see below)

## Files Created/Modified

- `src/lib/data/symbol-map.ts` — `toYahooSymbol`/`fromYahooSymbol` pure functions, `EXCHANGE_TO_YAHOO`/`YAHOO_TO_EXCHANGE` mapping constants
- `src/lib/data/symbol-map.test.ts` — 43 parametric tests (14 toYahoo, 14 fromYahoo, 14 round-trip, 1 throws)
- `src/lib/data/YahooProvider.ts` — IMarketDataProvider implementation using yahoo-finance2 chart() and search()
- `src/lib/data/YahooProvider.test.ts` — 15 unit tests covering all methods, symbol mapping, epoch conversion, error kinds, retry exhaustion
- `next.config.ts` — added `'yahoo-finance2'` to `serverExternalPackages`
- `package.json` / `package-lock.json` — yahoo-finance2@3.14.0 added

## Decisions Made

- **yahoo-finance2 v3 (not v2):** v2.x ESM build only ships `autoc` + `quote` modules; `chart()` required for daily OHLCV history only exists in v3.
- **`require('yahoo-finance2')` in constructor:** Lazy CJS require avoids ESM module graph issues when running in vitest (CJS context). Tests use constructor injection, never hit the require branch.
- **`ChartResultArray` (return='array'):** Gives `quotes[]` with `date:Date` + `adjclose` directly on each row; simpler than parsing the `ChartResultObject` `indicators` array path.
- **Types from `yahoo-finance2/modules/chart`:** The main `yahoo-finance2` index does not re-export `ChartResultArray`/`ChartEventDividend`; subpath import required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Upgraded yahoo-finance2 from ^2 to ^3**
- **Found during:** Task 2 (install step)
- **Issue:** Plan said "Pin to ^2 if 3.x has breaking changes; otherwise accept latest." v2.14.0 ESM build only includes `autoc` and `quote` modules — `chart()` absent, implementation impossible with v2.
- **Fix:** Installed `yahoo-finance2@^3` instead; received 3.14.0. No breaking changes found — `chart()` API matches documented interface. Plan explicitly allowed this: "otherwise accept latest."
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm run test:unit` passes; chart() method confirmed present via inspection of `esm/src/modules/`
- **Committed in:** 425222e (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed type import path for ChartResultArray**
- **Found during:** Task 2 (tsc check)
- **Issue:** Test file imported `ChartResultArray` from `'yahoo-finance2'` — main index does not re-export module types; tsc error TS2614.
- **Fix:** Changed import to `from 'yahoo-finance2/modules/chart'` (subpath export confirmed in package.json exports map).
- **Files modified:** src/lib/data/YahooProvider.test.ts
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** 425222e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary to complete implementation. No scope creep.

## EODHDProvider.ts confirmation

`git diff src/lib/data/EODHDProvider.ts` — empty. File untouched, byte-identical to pre-plan state. Kept as reference implementation per VERIFICATION.md note.

## Issues Encountered

None beyond the deviations documented above.

## Next Phase Readiness

- `YahooProvider` is ready for Plan 09 (`provider-swap`) to wire into `getPricesForTicker` behind the `deps.provider` seam
- `symbol-map` is ready for Stooq importer (Plan 08) to reuse `fromYahooSymbol` when normalising Stooq tickers back to project format
- All v1 tickers (14) translate correctly; adding new tickers is a one-line change in `EXCHANGE_TO_YAHOO`

---
*Phase: 03-market-data-pipeline*
*Completed: 2026-05-03*
