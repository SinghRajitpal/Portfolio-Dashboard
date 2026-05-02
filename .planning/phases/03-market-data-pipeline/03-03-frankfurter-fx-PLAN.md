---
phase: 03-market-data-pipeline
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/data/frankfurter.ts
  - src/lib/data/frankfurter.test.ts
  - src/lib/data/cache-fx.ts
  - src/scripts/seed-fx.ts
  - tests/integration/data/fx-seed.spec.ts
autonomous: true
requirements:
  - DATA-02
must_haves:
  truths:
    - "fetchFrankfurterRates(from, to) returns parsed daily rates for CHF base / USD,EUR,GBP quotes"
    - "Seed script populates fx_rates back to 1999-01-04 idempotently"
    - "After seed, fx_rates has at least 6000 rows and the earliest row is 1999-01-04"
    - "CHF/USD rate for 2020-03-15 is between 0.9 and 1.2 (sanity range)"
    - "Re-running the seed produces zero new inserts (idempotent via UPSERT)"
  artifacts:
    - path: "src/lib/data/frankfurter.ts"
      provides: "Frankfurter API client (fetchFrankfurterRates, parseNdjson)"
      exports: ["fetchFrankfurterRates", "FrankfurterRow"]
    - path: "src/lib/data/cache-fx.ts"
      provides: "Supabase upsert helper for fx_rates"
      exports: ["upsertFxRates", "getFxRate"]
    - path: "src/scripts/seed-fx.ts"
      provides: "One-shot idempotent seed script for FX history 1999-01-04..today"
      contains: "1999-01-04"
  key_links:
    - from: "src/scripts/seed-fx.ts"
      to: "src/lib/data/frankfurter.ts"
      via: "fetchFrankfurterRates() call"
      pattern: "fetchFrankfurterRates"
    - from: "src/scripts/seed-fx.ts"
      to: "src/lib/data/cache-fx.ts"
      via: "upsertFxRates() call"
      pattern: "upsertFxRates"
    - from: "src/lib/data/cache-fx.ts"
      to: "fx_rates table"
      via: "Supabase upsert with onConflict: 'base_currency,quote_currency,date'"
      pattern: "onConflict.*base_currency.*quote_currency.*date"
---

<objective>
Ship the Frankfurter FX pipeline end-to-end: API client, cache helper, idempotent seed script. This is independent of EODHD (no rate limits, no API key) and serves DATA-02 fully on its own.

Purpose: Per `03-RESEARCH.md` Pattern 4, Frankfurter has no API key, no rate limit, and supports a single full-history fetch from 1999-01-04 in NDJSON streaming format. Per CONTEXT.md, FX is computed on read via JOIN — so the cache is write-once, read-many. This plan is parallel to Plan 02 (no shared files except the types module which Plan 02 publishes).

Output: Working FX seed that populates ~6,750+ rows (3 quote currencies × ~27 years of trading days) into `fx_rates`. Daily top-up logic is included so it can be reused later.
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-market-data-pipeline/03-CONTEXT.md
@.planning/phases/03-market-data-pipeline/03-RESEARCH.md
@supabase/migrations/00001_initial_schema.sql
@tests/helpers/supabase-test.ts
@tests/helpers/mock-fetch.ts
@tests/fixtures/frankfurter/chf-rates-sample.ndjson

<interfaces>
<!-- fx_rates table schema (Phase 1, frozen). -->
From supabase/migrations/00001_initial_schema.sql:
```sql
CREATE TABLE public.fx_rates (
  id uuid PK,
  base_currency text NOT NULL,
  quote_currency text NOT NULL,
  date date NOT NULL,
  rate numeric(15,6) NOT NULL,
  source text NOT NULL DEFAULT 'frankfurter',
  UNIQUE (base_currency, quote_currency, date)
);
-- index: idx_fx_rates_currencies_date on (base_currency, quote_currency, date)
```

<!-- Frankfurter NDJSON line shape (per RESEARCH.md). -->
Each NDJSON line:
```json
{"date":"1999-01-04","base":"CHF","rates":{"USD":0.6627,"EUR":0.6213,"GBP":0.3951}}
```

<!-- Helpers from Plan 01. -->
From tests/helpers/supabase-test.ts:
```typescript
export function createTestSupabaseClient(): SupabaseClient
export async function truncateMarketData(client: SupabaseClient): Promise<void>
```

From tests/helpers/mock-fetch.ts:
```typescript
export function installFetchMock(routes: FixtureRoute[]): void
export function uninstallFetchMock(): void
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Frankfurter API client with NDJSON parsing</name>
  <files>src/lib/data/frankfurter.ts, src/lib/data/frankfurter.test.ts</files>
  <behavior>
    Test 1: `parseNdjson(ndjsonString)` returns array of `FrankfurterRow` objects. Each row has `date`, `base: 'CHF'`, `rates: { USD, EUR, GBP }`.
    Test 2: `parseNdjson` skips empty lines and trailing newlines (NDJSON spec tolerance).
    Test 3: `fetchFrankfurterRates({ from: '2020-01-02', to: '2020-01-10', base: 'CHF', quotes: ['USD','EUR','GBP'] })` calls the right URL and parses the response. (Test uses mock-fetch with the sample fixture.)
    Test 4: When fetch returns a 5xx, the function returns `{ kind: 'transient', message, attempt }`.
    Test 5: When fetch returns a 4xx other than 429, returns `{ kind: 'invalid_input', message }` (Frankfurter doesn't rate-limit, so 4xx = bad query).
    Test 6: `parseNdjson` rejects rows with NaN or missing rates (Zod validation) — returns only valid rows.
  </behavior>
  <action>
    Per `03-RESEARCH.md` Pattern 4 + Don't Hand-Roll table (no SDK, hand-rolled fetch with NDJSON streaming):

    1. Create `src/lib/data/frankfurter.ts`:
       ```typescript
       import { z } from 'zod'
       import type { DataError } from './errors'

       const FrankfurterRowSchema = z.object({
         date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
         base: z.string(),
         rates: z.record(z.string(), z.number().finite()),
       })

       export type FrankfurterRow = z.infer<typeof FrankfurterRowSchema>

       export function parseNdjson(text: string): FrankfurterRow[] {
         return text
           .split('\n')
           .map(l => l.trim())
           .filter(l => l.length > 0)
           .map(l => {
             try { return FrankfurterRowSchema.parse(JSON.parse(l)) }
             catch { return null }
           })
           .filter((r): r is FrankfurterRow => r !== null)
       }

       export async function fetchFrankfurterRates(opts: {
         from: string
         to: string
         base: string
         quotes: string[]
       }): Promise<FrankfurterRow[] | DataError> {
         const url = new URL('https://api.frankfurter.dev/v2/rates')
         url.searchParams.set('from', opts.from)
         url.searchParams.set('to', opts.to)
         url.searchParams.set('base', opts.base)
         url.searchParams.set('quotes', opts.quotes.join(','))

         try {
           const res = await fetch(url.toString(), { headers: { Accept: 'application/x-ndjson' } })
           if (res.status >= 500) {
             return { kind: 'transient', message: `Frankfurter ${res.status}`, attempt: 1 }
           }
           if (res.status >= 400) {
             return { kind: 'invalid_input', message: `Frankfurter ${res.status}: ${await res.text()}` }
           }
           const text = await res.text()
           return parseNdjson(text)
         } catch (err) {
           return { kind: 'transient', message: (err as Error).message, attempt: 1 }
         }
       }
       ```

    2. Create `src/lib/data/frankfurter.test.ts` with the 6 cases from `<behavior>`. Use `installFetchMock` from `tests/helpers/mock-fetch.ts` to serve `tests/fixtures/frankfurter/chf-rates-sample.ndjson`.

       Important: `mock-fetch.ts` was written assuming JSON Content-Type. For this test set `contentType: 'application/x-ndjson'` in the FixtureRoute.

    Avoid: streaming the response with `res.body.getReader()` — the dataset is small enough (~5MB for 27 years) that buffering is fine in practice and dramatically simpler. Avoid `p-retry` or any retry library — retry logic lives in `EODHDProvider` (Plan 04) where it's actually needed; Frankfurter is not rate-limited so no retries needed for now.
  </action>
  <verify>
    <automated>npm run test:unit -- src/lib/data/frankfurter.test.ts</automated>
  </verify>
  <done>
    `src/lib/data/frankfurter.ts` exports `fetchFrankfurterRates`, `parseNdjson`, `FrankfurterRow`. All 6 unit tests pass via `npm run test:unit`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Supabase fx_rates upsert helper + getFxRate read helper</name>
  <files>src/lib/data/cache-fx.ts</files>
  <action>
    Per `03-RESEARCH.md` Pattern 3 (Supabase Bulk Upsert) + Pitfall 5 (always specify onConflict):

    1. Create `src/lib/data/cache-fx.ts`:
       ```typescript
       import type { SupabaseClient } from '@supabase/supabase-js'
       import type { FrankfurterRow } from './frankfurter'
       import type { DataError } from './errors'

       const BATCH_SIZE = 500

       /**
        * Convert Frankfurter rows (CHF base, multiple quotes per row) into
        * fx_rates table rows (one quote per row), then upsert in 500-row batches.
        * onConflict matches the UNIQUE (base_currency, quote_currency, date) constraint.
        */
       export async function upsertFxRates(
         supabase: SupabaseClient,
         rows: FrankfurterRow[],
       ): Promise<{ upserted: number } | DataError> {
         const flat: Array<{ base_currency: string; quote_currency: string; date: string; rate: number; source: string }> = []
         for (const r of rows) {
           for (const [quote, rate] of Object.entries(r.rates)) {
             flat.push({
               base_currency: r.base,
               quote_currency: quote,
               date: r.date,
               rate,
               source: 'frankfurter',
             })
           }
         }
         for (let i = 0; i < flat.length; i += BATCH_SIZE) {
           const batch = flat.slice(i, i + BATCH_SIZE)
           const { error } = await supabase
             .from('fx_rates')
             .upsert(batch, { onConflict: 'base_currency,quote_currency,date' })
           if (error) return { kind: 'transient', message: `fx_rates upsert failed: ${error.message}`, attempt: 1 }
         }
         return { upserted: flat.length }
       }

       /**
        * Read a single FX rate. Used by Phase 5 backtest engine (preview/sketch only — full read API arrives in Phase 5).
        */
       export async function getFxRate(
         supabase: SupabaseClient,
         opts: { base: string; quote: string; date: string },
       ): Promise<number | DataError> {
         const { data, error } = await supabase
           .from('fx_rates')
           .select('rate')
           .eq('base_currency', opts.base)
           .eq('quote_currency', opts.quote)
           .eq('date', opts.date)
           .maybeSingle()
         if (error) return { kind: 'transient', message: error.message, attempt: 1 }
         if (!data) return { kind: 'not_found', message: `No FX rate for ${opts.base}/${opts.quote} on ${opts.date}` }
         return data.rate as number
       }
       ```

    2. Why CHF base in the table even though Frankfurter returns CHF base: storage convention is `base=CHF, quote=USD/EUR/GBP`. Backtest engine reads `rate` to convert FROM quote TO CHF (multiply by 1/rate) or FROM CHF TO quote (multiply by rate). Documented inline as a comment.

    Avoid: inserting one row at a time (would be ~20,000 round-trips). Avoid using `insert()` instead of `upsert()` — Pitfall 5 in research. Avoid storing both `CHF/USD` and `USD/CHF` — single direction (CHF base) is sufficient; consumers compute reciprocals.

    No unit test for this task — `cache-fx.ts` is exercised by Task 3's integration test (live Supabase needed).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>
    `src/lib/data/cache-fx.ts` exports `upsertFxRates` and `getFxRate`. Both use `onConflict: 'base_currency,quote_currency,date'`. `tsc --noEmit` passes.
  </done>
</task>

<task type="auto">
  <name>Task 3: Seed script + integration test (mock Frankfurter, verify DB state)</name>
  <files>src/scripts/seed-fx.ts, tests/integration/data/fx-seed.spec.ts</files>
  <action>
    Per `03-RESEARCH.md` Pattern 4 + Pitfall 3 (NDJSON for large ranges):

    1. Create `src/scripts/seed-fx.ts` (executable via `npx tsx src/scripts/seed-fx.ts`):
       ```typescript
       import { createClient } from '@supabase/supabase-js'
       import { fetchFrankfurterRates } from '@/lib/data/frankfurter'
       import { upsertFxRates } from '@/lib/data/cache-fx'
       import { isDataError } from '@/lib/data/errors'

       async function main() {
         const url = process.env.NEXT_PUBLIC_SUPABASE_URL
         const key = process.env.SUPABASE_SERVICE_ROLE_KEY
         if (!url || !key) {
           console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
           process.exit(1)
         }
         const supabase = createClient(url, key, { auth: { persistSession: false } })

         // Idempotent: find latest cached date and start from the day after, OR start from 1999-01-04.
         const { data: latest } = await supabase
           .from('fx_rates')
           .select('date')
           .eq('base_currency', 'CHF')
           .order('date', { ascending: false })
           .limit(1)

         const startDate = latest && latest.length > 0
           ? new Date(new Date(latest[0].date).getTime() + 86400000).toISOString().split('T')[0]
           : '1999-01-04'

         const today = new Date().toISOString().split('T')[0]
         if (startDate > today) { console.log('FX cache up to date'); return }

         console.log(`Fetching Frankfurter rates ${startDate} -> ${today}`)
         const rows = await fetchFrankfurterRates({ from: startDate, to: today, base: 'CHF', quotes: ['USD','EUR','GBP'] })
         if (isDataError(rows)) { console.error('Fetch failed:', rows); process.exit(1) }

         console.log(`Parsed ${rows.length} daily rows`)
         const result = await upsertFxRates(supabase, rows)
         if (isDataError(result)) { console.error('Upsert failed:', result); process.exit(1) }
         console.log(`Upserted ${result.upserted} fx_rate rows`)
       }
       main().catch(err => { console.error(err); process.exit(1) })
       ```

       Install `tsx` if not present: `npm install -D tsx --legacy-peer-deps`. Add npm script `"seed:fx": "tsx src/scripts/seed-fx.ts"`.

    2. Create `tests/integration/data/fx-seed.spec.ts`:
       - Use `mock-fetch.ts` to intercept `https://api.frankfurter.dev/v2/rates*` and serve `tests/fixtures/frankfurter/chf-rates-sample.ndjson` with `content-type: application/x-ndjson`.
       - Use `createTestSupabaseClient()` to talk to local Supabase.
       - `beforeEach`: `truncateMarketData(client)`.
       - Test 1 (cold seed): import `seed-fx.ts` logic (refactor `main()` to export a `runSeed(supabase)` function the test can call directly without env-var dependency). Call `runSeed(client)`. Assert `fx_rates` has rows where `base_currency='CHF'` and `quote_currency='USD'`. Assert min row count >= 5 (matches fixture). Assert `source='frankfurter'`.
       - Test 2 (idempotent): call `runSeed(client)` AGAIN. Assert row count unchanged. (Upsert + earliest-date logic should both be defensive.)
       - Test 3 (sanity range): pick the row for `2020-03-15` (in fixture). Assert `rate` is between 0.5 and 2.0 (plausible CHF/USD).

       Refactor `seed-fx.ts` to export `runSeed(supabase)` so the test imports it directly — `main()` wraps `runSeed` for CLI usage.

    3. Document the manual run (the actual production seed) in the SUMMARY: this happens once in dev against real Frankfurter (no rate limit risk) — `npm run seed:fx`. CI never runs this; CI uses fixtures.

    Avoid: calling real Frankfurter in any automated test (the test environment is locked to mock fetch). Avoid hard-coding 1999-01-04 in the test fixture (use whatever earliest date the fixture has). Avoid running `seed:fx` in CI — only manually in dev.

    On streaming: per Pitfall 3, NDJSON is recommended for the full 27-year range. Our `fetchFrankfurterRates` reads the entire body into memory then splits on newlines. For a one-time seed run that's acceptable (~5-10 MB). True streaming with ReadableStream is deferred — Frankfurter will be queried again only for daily top-ups (a few KB). If memory becomes an issue in production, we revisit.
  </action>
  <verify>
    <automated>npx playwright test tests/integration/data/fx-seed.spec.ts --project=chromium</automated>
  </verify>
  <done>
    `src/scripts/seed-fx.ts` exists, exports `runSeed`, and CLI entry works. `npm run seed:fx` script added to package.json. `tsx` installed. All 3 integration tests pass. Idempotency proven (second run inserts zero new rows).
  </done>
</task>

</tasks>

<verification>
- `npm run test:unit -- src/lib/data/frankfurter.test.ts` passes (API client + NDJSON parser correct)
- `npx tsc --noEmit` passes (cache-fx.ts compiles)
- `npx playwright test tests/integration/data/fx-seed.spec.ts --project=chromium` passes (DB seed end-to-end)
- After `npm run seed:fx` against real Frankfurter (manual), `fx_rates` row for 1999-01-04 base=CHF quote=USD exists with plausible rate
</verification>

<success_criteria>
- DATA-02 fully achievable: CHF/USD, CHF/EUR, CHF/GBP rates available for any date back to 1999 from the cache
- Seed is idempotent — running it twice changes nothing
- All upserts use `onConflict: 'base_currency,quote_currency,date'` (Pitfall 5 avoided)
- No real network call to Frankfurter happens in any automated test
- The pipeline contract returns `data | DataError` consistently — `isDataError` works on Frankfurter responses
</success_criteria>

<output>
After completion, create `.planning/phases/03-market-data-pipeline/03-03-SUMMARY.md` documenting:
- Whether `npm run seed:fx` was run against real Frankfurter (and the resulting row count if yes — the user may run this manually after the plan completes)
- Whether `tsx` was installed (and which version)
- Any deviations from the planned shape of `runSeed(supabase)`
- The total parse time and memory footprint of the full 1999..today fetch (rough numbers from the manual run)
</output>
