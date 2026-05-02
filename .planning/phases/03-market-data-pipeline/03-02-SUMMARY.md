---
phase: 03-market-data-pipeline
plan: "02"
subsystem: database
tags: [typescript, supabase, postgres, rls, discriminated-union, interface, types, migration]

# Dependency graph
requires:
  - phase: 03-market-data-pipeline plan 01
    provides: vitest-runner, supabase-test-helper, mock-fetch-helper, test infrastructure
  - phase: 01-foundation
    provides: 00001_initial_schema.sql (instruments, prices, dividends columns/constraints)
provides:
  - DataError discriminated union with 4 error kinds (rate_limit, not_found, transient, invalid_input)
  - isDataError type guard that validates kind against an allowlist (not just presence of kind field)
  - IMarketDataProvider interface — single source of contract truth for all provider implementations
  - Shared types: PriceRow, DividendRow, BulkEodRow, SearchResult, InstrumentMetadata
  - isin_lookups migration (00002_isin_lookups.sql) with composite PK and RLS
  - Integration test spec for isin_lookups migration
affects:
  - 03-03 and all later phase-3 plans (import from errors, IMarketDataProvider, types)
  - 03-04 EODHDProvider implements IMarketDataProvider
  - 04-portfolio-builder (uses SearchResult, InstrumentMetadata)
  - 05-backtest-engine (uses PriceRow, DividendRow)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - discriminated-union error contract (DataError with kind guard, not just presence check)
    - interface-first ordering (IMarketDataProvider ships before EODHDProvider implementation)
    - composite PK migration for multi-venue ISIN caching
    - no-id table (isin_lookups has composite PK — truncate helper uses .not('isin', 'is', null))

key-files:
  created:
    - src/lib/data/errors.ts
    - src/lib/data/types.ts
    - src/lib/data/errors.test.ts
    - src/lib/data/IMarketDataProvider.ts
    - supabase/migrations/00002_isin_lookups.sql
    - tests/integration/data/isin-lookups-migration.spec.ts
  modified:
    - tests/helpers/supabase-test.ts (fix truncateMarketData for composite-PK isin_lookups table)

key-decisions:
  - "isDataError validates kind against a Set allowlist, not just checks presence — guards against EODHD response shapes that happen to have a kind property"
  - "Gap tracking uses first_date/last_date columns on instruments (added in Plan 04), not a sibling instrument_gaps table — per CONTEXT.md Claude's Discretion"
  - "isin_lookups composite PK (isin, ticker, exchange) preserves all venue listings — one ISIN can appear multiple times for multi-venue UCITS ETFs"
  - "supabase db reset requires Docker Desktop (unavailable in sandbox) — migration SQL written and type-verified; developer applies via db push with SUPABASE_DB_PASSWORD"

patterns-established:
  - "Pattern: DataError-first returns — all public pipeline functions return T | DataError (never throws)"
  - "Pattern: Interface before implementation — IMarketDataProvider ships in Plan 02, EODHDProvider in Plan 04"
  - "Pattern: Kind-allowlist guard — isDataError uses a const Set to prevent accidental true on arbitrary objects with kind property"

requirements-completed:
  - DATA-04
  - DATA-05

# Metrics
duration: 5min
completed: "2026-05-02"
---

# Phase 3 Plan 02: Errors, Interface, and Migration Summary

**DataError discriminated union (4 kinds), IMarketDataProvider interface, shared types (PriceRow/DividendRow/BulkEodRow/SearchResult/InstrumentMetadata), and isin_lookups migration with composite PK for multi-venue UCITS ETF caching**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-02T21:32:01Z
- **Completed:** 2026-05-02T21:37:00Z
- **Tasks:** 3 of 3
- **Files modified:** 7

## Accomplishments

- `DataError` discriminated union with 4 kinds: `rate_limit`, `not_found`, `transient`, `invalid_input` — all Phase 3+ code returns `T | DataError`, never throws
- `isDataError` type guard uses a `Set` allowlist (not just `'kind' in v`) — prevents false positives on EODHD API response shapes that incidentally have a `kind` field
- `IMarketDataProvider` interface ships before any implementation — `getEod`, `getDividends`, `bulkEod`, `search` all typed against shared types and `DataError`
- Five shared types exported from `types.ts` aligned with Phase 1 schema constraints (open/high/low nullable, `type` CHECK enum)
- `00002_isin_lookups.sql` migration with composite PK `(isin, ticker, exchange)` enables multi-venue UCITS ETF storage; RLS read-only for authenticated users
- Integration test spec (4 tests) covers insert, PK-conflict rejection, multi-venue insert, and ISIN-only select via index

## Task Commits

Each task was committed atomically:

1. **Task 1: DataError union, isDataError guard, shared types** - `1e4bb38` (feat)
2. **Task 2: IMarketDataProvider interface** - `e43af6b` (feat)
3. **Task 3: isin_lookups migration and integration test** - `dbacb2b` (feat)

## Files Created/Modified

- `src/lib/data/errors.ts` — DataError discriminated union + isDataError kind-allowlist guard
- `src/lib/data/types.ts` — PriceRow, DividendRow, BulkEodRow, SearchResult, InstrumentMetadata
- `src/lib/data/errors.test.ts` — 6 unit tests: 2 true cases (rate_limit, transient), 4 false cases (no kind, null, array, unknown kind)
- `src/lib/data/IMarketDataProvider.ts` — Provider interface with JSDoc per method; imports from errors and types
- `supabase/migrations/00002_isin_lookups.sql` — isin_lookups table with composite PK, ISIN index, RLS
- `tests/integration/data/isin-lookups-migration.spec.ts` — 4 integration tests for migration correctness
- `tests/helpers/supabase-test.ts` — Fixed truncateMarketData to handle isin_lookups composite PK (used .not('isin', 'is', null) instead of .neq('id', ...) which would fail on a table with no id column)

## Decisions Made

- **isDataError uses Set allowlist**: `const VALID_KINDS = new Set<string>([...])` — a plain `includes()` on a readonly array would work too, but Set.has() is O(1) and more explicit about intent
- **Gap tracking deferred to Plan 04**: `first_date`/`last_date` columns added to `instruments` table in Plan 04 alongside EODHDProvider. No `instrument_gaps` sibling table. Per CONTEXT.md "Claude's Discretion" — sibling table would over-normalize a simple first/last date pair.
- **isin_lookups composite PK**: UCITS ETFs are multi-venue; storing `(isin, ticker, exchange)` as PK means CHDVD.SW and CHDVD.XETRA are different rows. `idx_isin_lookups_isin` covers the common lookup-by-ISIN-only case.
- **No TTL on isin_lookups**: Per CONTEXT.md, ISIN mappings are permanent for listed securities in v1. No staleness column needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed truncateMarketData for isin_lookups composite PK**
- **Found during:** Task 3 (isin_lookups migration and integration test)
- **Issue:** `truncateMarketData` in `tests/helpers/supabase-test.ts` tried to delete from `isin_lookups` using `.neq('id', '00000000-...')` — but `isin_lookups` has no `id` column (composite PK only). This would throw a PostgREST column-not-found error during test cleanup.
- **Fix:** Split tables into two groups: `tablesWithId` (prices, dividends, fx_rates, instruments) use `.neq('id', ...)`, and `isin_lookups` uses `.not('isin', 'is', null)` (all isin values are NOT NULL by schema constraint).
- **Files modified:** `tests/helpers/supabase-test.ts`
- **Verification:** TypeScript compiles cleanly; unit tests pass
- **Committed in:** `dbacb2b` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix is necessary for test cleanup correctness. No scope creep.

## Issues Encountered

**Docker / remote Supabase not available in sandbox:**

`npx supabase db reset` requires Docker Desktop (not installed in this execution environment). The `npx supabase db push` path requires `SUPABASE_DB_PASSWORD` environment variable.

Both the migration SQL and the integration test spec are complete and type-correct. To apply:

```bash
# Option 1 — local (requires Docker Desktop running)
npx supabase db reset

# Option 2 — remote (requires DB password from Supabase dashboard > Settings > Database)
SUPABASE_DB_PASSWORD=<password> npx supabase db push

# Then run integration tests (requires Next.js dev server running)
npx playwright test tests/integration/data/isin-lookups-migration.spec.ts --project=chromium
```

This is the same constraint as Phase 01-01 Task 2, where migration SQL was written and structurally verified without a running Postgres instance.

## User Setup Required

To complete Task 3 verification, run:

1. Apply migration to remote Supabase:
   ```bash
   SUPABASE_DB_PASSWORD=<your-db-password> npx supabase db push
   ```
   (Password: Supabase dashboard > Project Settings > Database > Database password)

2. Run integration tests with dev server:
   ```bash
   npm run dev &
   npx playwright test tests/integration/data/isin-lookups-migration.spec.ts --project=chromium
   ```

Note: `SUPABASE_SERVICE_ROLE_KEY` must be in `.env.local` for the test client to bypass RLS during cleanup.

## Next Phase Readiness

- All contracts are locked: `DataError`, `IMarketDataProvider`, `PriceRow`, `DividendRow`, `BulkEodRow`, `SearchResult`, `InstrumentMetadata`
- Plans 03-04 through 03-06 can import from `@/lib/data/errors`, `@/lib/data/IMarketDataProvider`, `@/lib/data/types`
- `isin_lookups` migration SQL is ready to push; integration test spec ready to run after push
- `first_date`/`last_date` columns on `instruments` table are Plan 04's responsibility (tracked in STATE.md)

---
*Phase: 03-market-data-pipeline*
*Completed: 2026-05-02*
