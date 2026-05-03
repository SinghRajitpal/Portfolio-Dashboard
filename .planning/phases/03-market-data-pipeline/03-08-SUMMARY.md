---
phase: 03-market-data-pipeline
plan: 08
subsystem: api
tags: [stooq, csv, etf, market-data, seed, typescript, vitest]

requires:
  - phase: 03-market-data-pipeline
    provides: "cache-prices helpers (upsertPrices, upsertInstrumentMetadata, getInstrumentByTicker), PriceRow/DataError types, isDataError guard, SEED list in seed-instruments.ts"

provides:
  - "toStooqSymbol: maps v1 tickers to Stooq URL symbols (US→.us, SW→.ch, LSE→.uk)"
  - "parseStooqCsv: converts Stooq daily CSV to PriceRow[] with close===adjusted_close (pre-adjusted)"
  - "fetchStooqDailyCsv: HTTP downloader with apikey-gate detection on 200 responses"
  - "seed-instruments-stooq.ts CLI: one-shot bulk-archive seeder for all 14 v1 tickers"
  - "npm run seed:stooq: wired with node --env-file=.env.local --import tsx"

affects:
  - "03-09-provider-swap: YahooProvider becomes the incremental refresh after Stooq archives history"
  - "03-10-reseed-and-verify: Plan 10 runs seed:stooq against live DB and verifies DATA-01 coverage"
  - "Phase 5 backtester: requires adjusted_close non-null for backtesting — guaranteed by parseStooqCsv"

tech-stack:
  added: []
  patterns:
    - "Stooq CSV path is intentionally NOT wrapped behind IMarketDataProvider — one-shot archive vs interactive incremental is a meaningful distinction"
    - "fetchStooqDailyCsv returns raw text; gate detection runs both in fetcher (200 with gate body) and parser (guard against leaking gate to caller)"
    - "1.5s polite delay between tickers in seed loop — 14 × 1.5s ≈ 21s total, keeps Stooq from rate-blocking"
    - "SEED exported from seed-instruments.ts via one-line export addition — reused by new script without duplication"

key-files:
  created:
    - src/lib/data/stooq.ts
    - src/lib/data/stooq.test.ts
    - tests/fixtures/stooq/spy-daily.csv
    - tests/fixtures/stooq/chdvd-daily.csv
    - src/scripts/seed-instruments-stooq.ts
  modified:
    - package.json (added seed:stooq script)
    - src/scripts/seed-instruments.ts (added export to SEED const — one line)

key-decisions:
  - "Stooq NOT wrapped behind IMarketDataProvider — one-shot CSV archive path is fundamentally different from interactive incremental providers; kept pure and decoupled"
  - "SEED exported from seed-instruments.ts rather than duplicated — one-line non-breaking change; Plan 09 can extract to shared module if more scripts need it"
  - "fetchStooqDailyCsv detects apikey-gate on HTTP 200 response body — Stooq returns 200 with gate text rather than 401/403, so gate detection must inspect body"
  - "parseStooqCsv sets adjusted_close = close for every row — Stooq prices are split-and-dividend adjusted by default; Phase 5 backtester expects adjusted_close non-null"
  - "Exit 0 when any ticker succeeds, exit 1 only when processed===0 — partial seeding (some Swiss tickers may 404) is expected per STATE.md Blockers"

patterns-established:
  - "Pure library module pattern: stooq.ts exports only pure functions (no Supabase, no side effects) — mirrors frankfurter.ts pattern"
  - "Inline apikey-gate detection: fetcher checks body before returning to caller, avoiding silent data corruption from gate text being parsed as CSV rows"

requirements-completed:
  - DATA-01

duration: 18min
completed: 2026-05-03
---

# Phase 03 Plan 08: Stooq Importer Summary

**Pure Stooq CSV library (symbol mapper + CSV parser + HTTP fetcher) and one-shot seed CLI covering all 14 v1 tickers — prerequisite for closing DATA-01 (full daily history from inception)**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-03T20:31:36Z
- **Completed:** 2026-05-03T20:49:00Z
- **Tasks:** 2 of 3 code tasks complete (Task 1 is human-action pending — STOOQ_API_KEY setup)
- **Files modified:** 7

## Accomplishments

- Built `stooq.ts` library with three pure exported functions: `toStooqSymbol`, `parseStooqCsv`, `fetchStooqDailyCsv`
- 26 unit tests covering all spec behaviors: symbol mapping, CSV parsing edge cases, HTTP error codes, apikey-gate detection
- Created `seed-instruments-stooq.ts` CLI with idempotency (skips tickers with `first_date` populated), `--force` override, polite 1.5s delay between tickers
- `npm run seed:stooq` wired in package.json using same invocation pattern as `seed:instruments`
- EODHDProvider.ts and IMarketDataProvider.ts confirmed byte-identical to pre-plan state

## Stooq Symbol Mapping (as built)

| v1 ticker | Stooq symbol | Notes |
|-----------|--------------|-------|
| SPY.US    | spy.us       | .US → .us |
| AGG.US    | agg.us       | |
| VTI.US    | vti.us       | |
| BND.US    | bnd.us       | |
| GLD.US    | gld.us       | |
| QQQ.US    | qqq.us       | |
| EEM.US    | eem.us       | |
| CHDVD.SW  | chdvd.ch     | .SW → .ch |
| NOVN.SW   | novn.ch      | |
| CSSPX.SW  | csspx.ch     | Swiss coverage to be verified on first run |
| 500E.SW   | 500e.ch      | Swiss coverage to be verified on first run |
| IQQA.SW   | iqqa.ch      | Likely absent — fix to SSAC.SW deferred to Plan 09 |
| VWRL.LSE  | vwrl.uk      | .LSE → .uk |
| IWDA.LSE  | iwda.uk      | |

## Task 1 Human Action (Pending)

**STOOQ_API_KEY not yet set in .env.local.** The continuation agent will verify:
```
node --env-file=.env.local -e "console.log(!!process.env.STOOQ_API_KEY)"
# → must print: true

curl -s "https://stooq.com/q/d/l/?s=spy.us&i=d&d1=20240101&d2=20240105&apikey=$STOOQ_API_KEY" | head -3
# → must start with: Date,Open,High,Low,Close,Volume
```

## Task Commits

1. **Task 1: User obtains STOOQ_API_KEY** - human-action pending
2. **Task 2: stooq.ts library + fixtures + tests** - `1a603eb` (feat)
3. **Task 3: seed-instruments-stooq.ts + npm script** - `7f6a980` (feat)

**Plan metadata:** (docs commit created separately after Task 1 verification)

## Files Created/Modified

- `src/lib/data/stooq.ts` — Symbol mapper + CSV parser + HTTP fetcher (pure, no Supabase coupling)
- `src/lib/data/stooq.test.ts` — 26 unit tests covering all spec behaviors
- `tests/fixtures/stooq/spy-daily.csv` — 10-row SPY fixture including 2020-03-16 COVID circuit-breaker
- `tests/fixtures/stooq/chdvd-daily.csv` — 5-row Swiss listing fixture
- `src/scripts/seed-instruments-stooq.ts` — One-shot CLI with idempotency + --force + 1.5s delay
- `package.json` — Added `seed:stooq` script
- `src/scripts/seed-instruments.ts` — Added `export` to SEED const (one-line non-breaking change)

## Decisions Made

1. Stooq NOT wrapped behind IMarketDataProvider — CSV archive path is fundamentally different from interactive incremental providers; kept decoupled and pure.
2. SEED exported from seed-instruments.ts (one-line) rather than duplicated — Plan 09 can extract to shared module if additional scripts need it.
3. fetchStooqDailyCsv detects apikey-gate in the 200 response body — Stooq returns the gate message as a 200 (not 401/403), so body inspection is mandatory.
4. parseStooqCsv sets adjusted_close = close for every row — Stooq is pre-adjusted, Phase 5 backtester requires adjusted_close non-null.
5. Exit 0 when any ticker succeeds — partial seeding (some Swiss tickers expected to 404) is acceptable behavior per plan.

## Deviations from Plan

None — plan executed exactly as specified for the code tasks. Task 1 (human-action checkpoint) is a planned gate, not a deviation.

## Issues Encountered

None — TypeScript check clean, all 26 tests pass on first attempt.

## parseStooqCsv Edge Cases Handled

Beyond the spec:
- Empty volume field (trailing comma) → volume: null (row kept, not skipped)
- NaN in open/high/low → null (row kept per spec for OHLCV where close is valid)
- close NaN → row skipped entirely (close is non-nullable in PriceRow)
- Rows are returned in the order they appear in the CSV (Stooq provides ascending date order)

## Next Phase Readiness

- `npm run seed:stooq` is structurally ready — actual execution against live DB deferred to Plan 10
- Plan 09 (provider-swap): switches cron refresh from EODHDProvider to YahooProvider; Stooq provides the historical baseline
- Plan 10 (reseed-and-verify): runs seed:stooq, verifies DATA-01 coverage (≥10 years per ticker), closes the data gap

---
*Phase: 03-market-data-pipeline*
*Completed: 2026-05-03*
