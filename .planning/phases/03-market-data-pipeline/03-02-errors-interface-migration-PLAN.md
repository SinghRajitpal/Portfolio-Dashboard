---
phase: 03-market-data-pipeline
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - supabase/migrations/00002_isin_lookups.sql
  - src/lib/data/errors.ts
  - src/lib/data/IMarketDataProvider.ts
  - src/lib/data/types.ts
  - src/lib/data/errors.test.ts
  - tests/integration/data/isin-lookups-migration.spec.ts
autonomous: true
requirements:
  - DATA-04
  - DATA-05
must_haves:
  truths:
    - "Discriminated DataError union exists with kinds rate_limit | not_found | transient | invalid_input"
    - "isDataError type guard returns true for valid errors and false for plain data"
    - "isin_lookups table exists in Supabase with the documented schema and RLS"
    - "IMarketDataProvider interface defines getEod, getDividends, search, bulkEod method signatures"
    - "Shared types (PriceRow, DividendRow, InstrumentMetadata, SearchResult) are exported and usable from all data modules"
  artifacts:
    - path: "src/lib/data/errors.ts"
      provides: "DataError discriminated union + isDataError guard"
      exports: ["DataError", "isDataError"]
    - path: "src/lib/data/IMarketDataProvider.ts"
      provides: "Provider interface — single source of contract truth"
      exports: ["IMarketDataProvider"]
    - path: "src/lib/data/types.ts"
      provides: "Shared row types matching DB schema + EODHD response shapes"
      exports: ["PriceRow", "DividendRow", "InstrumentMetadata", "SearchResult", "BulkEodRow"]
    - path: "supabase/migrations/00002_isin_lookups.sql"
      provides: "isin_lookups table with composite PK (isin, ticker, exchange)"
      contains: "CREATE TABLE public.isin_lookups"
  key_links:
    - from: "src/lib/data/IMarketDataProvider.ts"
      to: "src/lib/data/errors.ts"
      via: "Method return types are T | DataError"
      pattern: "DataError"
    - from: "src/lib/data/IMarketDataProvider.ts"
      to: "src/lib/data/types.ts"
      via: "Method return types use PriceRow, DividendRow, etc."
      pattern: "PriceRow|DividendRow|SearchResult"
---

<objective>
Define the contracts (error union, provider interface, shared types) and ship the `isin_lookups` migration. Every later plan in this phase imports from these files. This is the "interface-first" task ordering — contracts before implementations.

Purpose: Per `03-CONTEXT.md` locked decisions, every public pipeline function returns `data | DataError` with a discriminated union, and `IMarketDataProvider` ships even with a single `EODHDProvider` implementation (so a paid-tier swap is one env-var change). Per `03-RESEARCH.md`, the `isin_lookups` table is needed for OpenFIGI cache (DATA-05).

Output: 4 files (one migration, three TS modules), one passing unit test, one passing integration test that confirms the migration applied to local Supabase.
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/03-market-data-pipeline/03-CONTEXT.md
@.planning/phases/03-market-data-pipeline/03-RESEARCH.md
@supabase/migrations/00001_initial_schema.sql
@tests/helpers/supabase-test.ts

<interfaces>
<!-- DataError contract — locked in CONTEXT.md, copied verbatim from RESEARCH.md Pattern 6. -->
Target src/lib/data/errors.ts:
```typescript
export type DataError =
  | { kind: 'rate_limit'; message: string; retryAfter?: Date }
  | { kind: 'not_found'; message: string }
  | { kind: 'transient'; message: string; attempt: number }
  | { kind: 'invalid_input'; message: string }
export function isDataError(v: unknown): v is DataError
```

<!-- IMarketDataProvider contract — single source for what providers must implement. -->
Target src/lib/data/IMarketDataProvider.ts:
```typescript
import type { DataError } from './errors'
import type { PriceRow, DividendRow, SearchResult, BulkEodRow } from './types'

export interface IMarketDataProvider {
  getEod(symbol: string, opts?: { from?: string; to?: string }): Promise<PriceRow[] | DataError>
  getDividends(symbol: string, opts?: { from?: string; to?: string }): Promise<DividendRow[] | DataError>
  bulkEod(exchange: 'US' | 'SW', date: string): Promise<BulkEodRow[] | DataError>
  search(query: string, opts?: { limit?: number }): Promise<SearchResult[] | DataError>
}
```

<!-- Existing prices table columns (FROM PHASE 1 SCHEMA — do not alter). -->
From supabase/migrations/00001_initial_schema.sql:
```sql
CREATE TABLE public.prices (
  id uuid PK,
  instrument_id uuid NOT NULL,
  date date NOT NULL,
  open, high, low numeric(15,4),
  close numeric(15,4) NOT NULL,
  adjusted_close numeric(15,4) NOT NULL,
  volume bigint,
  UNIQUE (instrument_id, date)
);
-- dividends.UNIQUE (instrument_id, ex_date)
-- fx_rates.UNIQUE (base_currency, quote_currency, date)
-- instruments.ticker UNIQUE; type CHECK IN ('etf','stock','commodity','future','bond','fund')
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Define DataError union, isDataError guard, shared types module</name>
  <files>src/lib/data/errors.ts, src/lib/data/types.ts, src/lib/data/errors.test.ts</files>
  <behavior>
    Test 1: `isDataError({ kind: 'rate_limit', message: 'boom' })` returns true.
    Test 2: `isDataError({ kind: 'transient', message: 'x', attempt: 2 })` returns true.
    Test 3: `isDataError({ foo: 'bar' })` returns false.
    Test 4: `isDataError(null)` returns false.
    Test 5: `isDataError([{ date: '2024-01-01', close: 100 }])` returns false (an array of price rows is data, not error).
    Test 6: `isDataError({ kind: 'made_up_kind', message: 'x' })` returns false (kind must be one of the four allowed).
  </behavior>
  <action>
    1. Create `src/lib/data/errors.ts` with the verbatim `DataError` union from the interfaces block. The `isDataError` guard MUST validate that `kind` is one of the four allowed strings — not just "has a kind property". This guards against shape collisions.

       ```typescript
       const ERROR_KINDS = ['rate_limit', 'not_found', 'transient', 'invalid_input'] as const
       export function isDataError(v: unknown): v is DataError {
         return typeof v === 'object' && v !== null && 'kind' in v &&
                typeof (v as { kind: unknown }).kind === 'string' &&
                (ERROR_KINDS as readonly string[]).includes((v as { kind: string }).kind)
       }
       ```

    2. Create `src/lib/data/types.ts` with these exports (shapes derived from `00001_initial_schema.sql` columns + EODHD response shapes in `03-RESEARCH.md`):

       ```typescript
       // Mirrors prices table columns (open/high/low can be null per schema)
       export type PriceRow = {
         date: string             // ISO YYYY-MM-DD
         open: number | null
         high: number | null
         low: number | null
         close: number
         adjusted_close: number
         volume: number | null
       }

       // Mirrors dividends table columns
       export type DividendRow = {
         ex_date: string          // ISO YYYY-MM-DD
         amount: number
         currency: string
       }

       // Subset of EODHD bulk EOD shape — only fields we persist
       export type BulkEodRow = PriceRow & { code: string; exchange_short_name: 'US' | 'SW' | string }

       // Search result — superset of EODHD search response, used by /api/instruments/search
       export type SearchResult = {
         ticker: string           // e.g., "SPY"
         exchange: string         // e.g., "US", "SW"
         name: string
         type: 'etf' | 'stock' | 'commodity' | 'future' | 'bond' | 'fund' | string
         currency: string
         isin: string | null
       }

       // Metadata persisted to instruments table on first fetch
       export type InstrumentMetadata = {
         ticker: string
         name: string
         isin: string | null
         type: SearchResult['type']
         currency: string
         exchange: string
         expense_ratio: number | null   // EODHD free tier may not provide
         dividend_yield: number | null  // EODHD free tier may not provide
       }
       ```

       Allowed-type values for `SearchResult['type']` and `InstrumentMetadata['type']` MUST align with the `instruments.type` CHECK constraint from `00001_initial_schema.sql` (`'etf', 'stock', 'commodity', 'future', 'bond', 'fund'`). The `| string` fallback exists because EODHD search returns more granular types (e.g., "ETP", "Common Stock") that downstream code normalizes — but the persisted DB value must match the CHECK constraint.

    3. Create `src/lib/data/errors.test.ts` with the 6 cases from `<behavior>`. Use Vitest (`import { describe, it, expect } from 'vitest'`).

    Avoid: making `isDataError` permissive (returning true for any object with a `kind` field) — this causes silent bugs when EODHD response shapes happen to have a `kind` property. Avoid `any` — use `unknown` and narrow.
  </action>
  <verify>
    <automated>npm run test:unit -- src/lib/data/errors.test.ts</automated>
  </verify>
  <done>
    `src/lib/data/errors.ts` exports `DataError` and `isDataError`. `src/lib/data/types.ts` exports `PriceRow`, `DividendRow`, `BulkEodRow`, `SearchResult`, `InstrumentMetadata`. All 6 unit tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Define IMarketDataProvider interface</name>
  <files>src/lib/data/IMarketDataProvider.ts</files>
  <action>
    Create `src/lib/data/IMarketDataProvider.ts` with the verbatim interface from the `<interfaces>` block above.

    Add JSDoc comments that document:
    - `getEod`: "Fetches full price history for a single symbol. Format: 'SPY.US', 'CHDVD.SW'. Returns DataError with kind='not_found' if symbol unknown to provider."
    - `getDividends`: "Fetches full dividend history for a single symbol. Returns DataError with kind='not_found' if symbol unknown."
    - `bulkEod`: "Fetches all instruments traded on `exchange` for `date` (YYYY-MM-DD). Used by daily cron — one call covers many tickers."
    - `search`: "Searches by ticker, name, or partial match. Returns up to opts.limit (default 10) results across exchanges."

    Do NOT implement `EODHDProvider` here — that lands in Plan 04. This task is interface-only.

    Why this is its own file: per CONTEXT.md, the interface ships even with one implementation. Future paid-tier upgrade is one env-var change because consumers depend on `IMarketDataProvider`, not `EODHDProvider`.

    Avoid: adding methods that no v1 consumer needs (e.g., real-time quotes, fundamentals — both deferred to v2). Avoid coupling the interface to EODHD-specific response shapes — the interface returns `PriceRow`, `DividendRow`, etc., which the implementation maps to.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>
    `src/lib/data/IMarketDataProvider.ts` exists, exports `IMarketDataProvider`, and `tsc --noEmit` passes (proves all type imports resolve).
  </done>
</task>

<task type="auto">
  <name>Task 3: Add isin_lookups migration and verify against local Supabase</name>
  <files>supabase/migrations/00002_isin_lookups.sql, tests/integration/data/isin-lookups-migration.spec.ts</files>
  <action>
    Per `03-RESEARCH.md` "New Migration: 00002_isin_lookups.sql":

    1. Create `supabase/migrations/00002_isin_lookups.sql` with EXACTLY this content (no edits — schema is locked):

       ```sql
       -- isin_lookups: cache for OpenFIGI ISIN -> ticker resolutions
       -- Phase 3: One ISIN can map to multiple exchange listings (UCITS ETFs are multi-venue).
       -- Composite PK preserves all venues; idx_isin_lookups_isin enables fast lookup by ISIN alone.

       CREATE TABLE public.isin_lookups (
         isin          TEXT        NOT NULL,
         ticker        TEXT        NOT NULL,
         exchange      TEXT        NOT NULL,
         figi          TEXT,
         security_type TEXT,
         currency      TEXT,
         fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (isin, ticker, exchange)
       );

       CREATE INDEX idx_isin_lookups_isin ON public.isin_lookups (isin);

       ALTER TABLE public.isin_lookups ENABLE ROW LEVEL SECURITY;

       CREATE POLICY "Authenticated users can read isin_lookups"
         ON public.isin_lookups FOR SELECT TO authenticated
         USING (true);
       ```

       Migration naming follows `00001_initial_schema.sql` precedent (locked in STATE.md decisions).

    2. Apply the migration locally:
       ```bash
       npx supabase db reset
       ```
       This re-runs `00001_initial_schema.sql` and now `00002_isin_lookups.sql`. Idempotent — destroys local DB.

    3. Create `tests/integration/data/isin-lookups-migration.spec.ts`:
       - Use `createTestSupabaseClient()` from Plan 01.
       - Test 1: insert a row `{ isin: 'CH0237935637', ticker: 'CHDVD', exchange: 'SW', figi: 'BBG001S5N8V8', security_type: 'ETP', currency: 'CHF' }`. Assert no error.
       - Test 2: insert again — expect a unique-constraint error (composite PK conflict). Confirms PK is enforced.
       - Test 3: insert `{ isin: 'CH0237935637', ticker: 'CHDVD', exchange: 'XETRA', currency: 'EUR' }` — assert success (same ISIN+ticker, different exchange = allowed).
       - Test 4: select all rows where isin = 'CH0237935637'. Assert exactly 2 rows returned (proves the index works and multi-venue storage is correct).
       - `afterAll`: `truncateMarketData(client)` to clean up.

       The test must NOT depend on auth — it uses the service-role key from `tests/helpers/supabase-test.ts` to bypass RLS during the test.

    Why JSONB on instruments was rejected (Claude's discretion, per CONTEXT.md): a sibling table is cleaner because (a) ISIN cache is conceptually distinct from instrument metadata, (b) it lets multiple instruments share an ISIN entry conceptually if needed later, (c) RLS rules are simpler. JSONB on instruments would conflate cache and master data.

    Note on instrument_gaps: per CONTEXT.md "Claude's Discretion", we are NOT shipping `00003_instrument_gaps.sql` in this phase. Instead, gap metadata will live as `first_date` / `last_date` columns on the existing `instruments` table — a single ALTER added in Plan 04 alongside the EODHD provider. Documented in Plan 04 frontmatter.

    Avoid: changing existing `00001_initial_schema.sql` (Phase 1 schema is frozen). Avoid TTL columns or staleness logic — per CONTEXT.md, ISIN mappings are permanent for listed securities, no TTL for v1.
  </action>
  <verify>
    <automated>npx supabase db reset && npx playwright test tests/integration/data/isin-lookups-migration.spec.ts --project=chromium</automated>
  </verify>
  <done>
    `00002_isin_lookups.sql` exists with documented schema. `npx supabase db reset` applies cleanly. All 4 integration tests pass. The composite PK rejects duplicates and allows different-exchange entries.
  </done>
</task>

</tasks>

<verification>
- `npm run test:unit -- src/lib/data/errors.test.ts` passes (DataError + guard work)
- `npx tsc --noEmit -p tsconfig.json` passes (interface + types compile)
- `npx supabase db reset` applies both migrations cleanly
- `npx playwright test tests/integration/data/isin-lookups-migration.spec.ts --project=chromium` passes
- Search for `DataError` in `src/lib/data/IMarketDataProvider.ts`: must be present (interface uses the error type)
</verification>

<success_criteria>
- DataError discriminated union exists and is exhaustive (4 kinds)
- isDataError guard rejects malformed inputs and accepts all 4 valid kinds
- IMarketDataProvider interface published with 4 methods, all returning `T | DataError`
- Shared types align with Phase 1 schema (open/high/low nullable; type CHECK constraint enum)
- isin_lookups table created with composite PK and RLS read-only-for-authenticated policy
- All later plans can import from `@/lib/data/errors`, `@/lib/data/IMarketDataProvider`, `@/lib/data/types` without scavenger-hunting the codebase
</success_criteria>

<output>
After completion, create `.planning/phases/03-market-data-pipeline/03-02-SUMMARY.md` documenting:
- Final shape of DataError union (any deviations from RESEARCH.md)
- Final shape of IMarketDataProvider methods
- Any types added/removed from `types.ts` vs the plan
- Confirmation that `00002_isin_lookups.sql` applied cleanly via `npx supabase db reset`
- Decision recorded: gap-tracking will use `first_date`/`last_date` columns on `instruments` (added in Plan 04), not a sibling table
</output>
