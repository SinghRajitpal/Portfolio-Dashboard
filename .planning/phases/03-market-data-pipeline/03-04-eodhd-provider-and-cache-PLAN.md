---
phase: 03-market-data-pipeline
plan: 04
type: execute
wave: 3
depends_on: [02]
files_modified:
  - package.json
  - next.config.ts
  - supabase/migrations/00003_instruments_date_range.sql
  - src/lib/data/EODHDProvider.ts
  - src/lib/data/EODHDProvider.test.ts
  - src/lib/data/backoff.ts
  - src/lib/data/backoff.test.ts
  - src/lib/data/cache-prices.ts
  - src/lib/data/getPrices.ts
  - tests/integration/data/eodhd-cache-flow.spec.ts
autonomous: true
requirements:
  - DATA-01
  - DATA-03
  - DATA-04
user_setup:
  - service: eodhd
    why: "Historical price + dividend + bulk EOD provider (free tier, 20 req/day)"
    env_vars:
      - name: EODHD_API_KEY
        source: "EODHD Dashboard -> Settings -> API tokens"
        scope: "server-only (no NEXT_PUBLIC_ prefix); add to .env.local for dev and Vercel env for prod"
must_haves:
  truths:
    - "EODHDProvider implements IMarketDataProvider with all 4 methods"
    - "First call for a ticker fetches full history from EODHD; second call returns from cache (no second EODHD call)"
    - "After fetch, instruments table has the ticker with first_date and last_date populated"
    - "EODHDProvider returns kind='rate_limit' on HTTP 429 with retryAfter populated"
    - "Transient (5xx) failures retry 3x with exponential backoff (1s, 2s, 4s) before returning kind='transient'"
    - "Both close and adjusted_close are stored; adjusted_close is non-null"
  artifacts:
    - path: "src/lib/data/EODHDProvider.ts"
      provides: "IMarketDataProvider implementation using eodhd SDK"
      exports: ["EODHDProvider"]
    - path: "src/lib/data/cache-prices.ts"
      provides: "Supabase upsert + read helpers for prices and dividends"
      exports: ["upsertPrices", "upsertDividends", "getCachedPrices", "upsertInstrumentMetadata"]
    - path: "src/lib/data/getPrices.ts"
      provides: "Cache-first orchestrator: getPricesForTicker(ticker)"
      exports: ["getPricesForTicker"]
    - path: "src/lib/data/backoff.ts"
      provides: "Hand-rolled exponential backoff (3 retries, 1s/2s/4s)"
      exports: ["withRetry"]
    - path: "supabase/migrations/00003_instruments_date_range.sql"
      provides: "ALTER instruments add first_date, last_date columns"
      contains: "ALTER TABLE public.instruments"
  key_links:
    - from: "src/lib/data/getPrices.ts"
      to: "src/lib/data/EODHDProvider.ts"
      via: "Cache miss path constructs provider and calls getEod + getDividends"
      pattern: "EODHDProvider"
    - from: "src/lib/data/getPrices.ts"
      to: "src/lib/data/cache-prices.ts"
      via: "Cache hit path queries DB; cache miss path upserts after EODHD fetch"
      pattern: "getCachedPrices|upsertPrices"
    - from: "src/lib/data/EODHDProvider.ts"
      to: "src/lib/data/backoff.ts"
      via: "withRetry wraps EODHD calls for 5xx transient errors"
      pattern: "withRetry"
---

<objective>
Implement EODHD as the sole price/dividend provider behind the IMarketDataProvider interface, with retry/backoff, error contract enforcement, and cache-first orchestration. Add the `first_date`/`last_date` columns to `instruments` to track per-ticker coverage. After this plan, the pipeline can fetch and cache full history for any ticker.

Purpose: Per CONTEXT.md, EODHD is the sole price/dividend source — yahoo-finance2 is dropped entirely. The provider implements `IMarketDataProvider` so future paid-tier swaps are one env-var change. Per RESEARCH.md Pitfall 2, the seed must be idempotent and respect the 20/day free-tier budget. Per Pitfall 6, Swiss UCITS ETFs may have shorter inception dates than US stocks — `first_date`/`last_date` columns capture the actual coverage.

Output: A working `getPricesForTicker(ticker)` function that downstream search/cron/seed code calls. First call hits EODHD; second call comes from cache.
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-market-data-pipeline/03-CONTEXT.md
@.planning/phases/03-market-data-pipeline/03-RESEARCH.md
@.planning/phases/03-market-data-pipeline/03-02-SUMMARY.md
@supabase/migrations/00001_initial_schema.sql
@src/lib/data/errors.ts
@src/lib/data/IMarketDataProvider.ts
@src/lib/data/types.ts
@tests/helpers/supabase-test.ts
@tests/helpers/mock-fetch.ts
@tests/fixtures/eodhd/spy-eod.json
@tests/fixtures/eodhd/spy-dividends.json
@tests/fixtures/eodhd/chdvd-eod.json
@tests/fixtures/eodhd/chdvd-dividends.json
@node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md

<interfaces>
<!-- From Plan 02 — these are now real and importable. -->
From src/lib/data/IMarketDataProvider.ts:
```typescript
export interface IMarketDataProvider {
  getEod(symbol: string, opts?: { from?: string; to?: string }): Promise<PriceRow[] | DataError>
  getDividends(symbol: string, opts?: { from?: string; to?: string }): Promise<DividendRow[] | DataError>
  bulkEod(exchange: 'US' | 'SW', date: string): Promise<BulkEodRow[] | DataError>
  search(query: string, opts?: { limit?: number }): Promise<SearchResult[] | DataError>
}
```

From src/lib/data/types.ts:
```typescript
export type PriceRow = { date, open|null, high|null, low|null, close, adjusted_close, volume|null }
export type DividendRow = { ex_date, amount, currency }
export type SearchResult = { ticker, exchange, name, type, currency, isin|null }
export type BulkEodRow = PriceRow & { code, exchange_short_name }
export type InstrumentMetadata = { ticker, name, isin|null, type, currency, exchange, expense_ratio|null, dividend_yield|null }
```

<!-- EODHD SDK — install in this plan. -->
Per RESEARCH.md "EODHD SDK Usage Pattern":
```typescript
import { API } from 'eodhd'
const client = new API(process.env.EODHD_API_KEY!)
const prices = await client.eod('SPY.US', { from: '1990-01-01', order: 'a' })
const dividends = await client.dividends('SPY.US', { from: '1990-01-01' })
const bulkData = await client.bulkEod('US', { date: '2026-05-01' })
const results = await client.search('CHDVD', { limit: 10 })
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: withRetry exponential backoff helper</name>
  <files>src/lib/data/backoff.ts, src/lib/data/backoff.test.ts</files>
  <behavior>
    Test 1: `withRetry(() => Promise.resolve(42))` returns 42 after one attempt.
    Test 2: A function that throws twice then succeeds returns the success value after 3 attempts.
    Test 3: A function that throws all 4 times returns `{ kind: 'transient', message, attempt: 3 }` (3 = retries exhausted, 0-indexed).
    Test 4: Total elapsed time for 3 retries with delays [1ms, 2ms, 4ms] (test override) is between 7ms and 50ms (sanity bound; not flaky).
    Test 5: When the function returns a `DataError` with kind='rate_limit', `withRetry` does NOT retry — returns immediately. (Per CONTEXT.md: no retry on 429.)
    Test 6: When the function returns a `DataError` with kind='not_found', `withRetry` does NOT retry — returns immediately.
    Test 7: When the function returns a `DataError` with kind='transient', `withRetry` DOES retry up to maxAttempts times.
  </behavior>
  <action>
    Per RESEARCH.md "Don't Hand-Roll" — exponential backoff is 4 lines, no library:

    ```typescript
    import type { DataError } from './errors'
    import { isDataError } from './errors'

    export type RetryOpts = {
      maxAttempts?: number          // default 3 (so 1 initial + 2 retries... wait: clarify below)
      baseDelayMs?: number          // default 1000
      // delays: 1s, 2s, 4s for attempts 1, 2, 3
    }

    /**
     * Retries a function up to maxAttempts times for transient failures.
     * Delays: baseDelayMs * 2^(attempt-1) — so 1s, 2s, 4s with default 1000ms base.
     *
     * Does NOT retry: rate_limit, not_found, invalid_input. These are surfaced immediately.
     * DOES retry: transient errors AND thrown exceptions (network failures).
     */
    export async function withRetry<T>(
      fn: () => Promise<T | DataError>,
      opts: RetryOpts = {},
    ): Promise<T | DataError> {
      const max = opts.maxAttempts ?? 3
      const base = opts.baseDelayMs ?? 1000
      let lastError: DataError | null = null
      for (let attempt = 0; attempt < max; attempt++) {
        try {
          const result = await fn()
          if (isDataError(result)) {
            if (result.kind === 'transient') {
              lastError = { ...result, attempt }
              if (attempt < max - 1) {
                await new Promise(r => setTimeout(r, base * Math.pow(2, attempt)))
                continue
              }
              return lastError
            }
            // rate_limit, not_found, invalid_input — surface immediately
            return result
          }
          return result
        } catch (err) {
          lastError = { kind: 'transient', message: (err as Error).message, attempt }
          if (attempt < max - 1) {
            await new Promise(r => setTimeout(r, base * Math.pow(2, attempt)))
            continue
          }
          return lastError
        }
      }
      return lastError ?? { kind: 'transient', message: 'unknown', attempt: max }
    }
    ```

    Decision on attempt count: per CONTEXT.md "retry 3x with exponential backoff (1s, 2s, 4s)". This means 3 RETRIES — a total of 4 attempts (1 initial + 3 retries, with delays before retries 1, 2, 3). Re-read: "3x with exponential backoff (1s, 2s, 4s)" lists three delays = three retries. Implement as: 1 initial attempt + up to 3 retries = `maxAttempts = 4` with delays [1s, 2s, 4s] before retries 1/2/3.

    Adjust the implementation: default `maxAttempts: 4` (1 initial + 3 retries). Delays applied between attempts: index 0->1: 1s, 1->2: 2s, 2->3: 4s. Update tests accordingly: Test 3 says "throws all 4 times → returns transient with attempt=3 (the index of the last attempt)".

    For tests: pass `baseDelayMs: 1` to keep the suite fast.

    Avoid: pulling in `p-retry` (research forbids — single package, 4 lines hand-rolled). Avoid retrying on `rate_limit` (CONTEXT.md: explicit). Avoid jittering — predictable delays are easier to test.
  </action>
  <verify>
    <automated>npm run test:unit -- src/lib/data/backoff.test.ts</automated>
  </verify>
  <done>
    `src/lib/data/backoff.ts` exports `withRetry`. All 7 tests pass. Default behavior: 4 attempts (1 initial + 3 retries) with delays [1000, 2000, 4000] ms between them.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add first_date/last_date columns + cache-prices.ts helpers</name>
  <files>supabase/migrations/00003_instruments_date_range.sql, src/lib/data/cache-prices.ts</files>
  <action>
    Per Plan 02 SUMMARY decision: gap metadata lives as columns on `instruments`, not a sibling table.

    1. Create `supabase/migrations/00003_instruments_date_range.sql`:
       ```sql
       -- Phase 3: Track per-instrument date coverage to support the "ready for Phase 4" smoke test
       -- (first_date and last_date present, row count > 0, all adjusted_close non-null).
       -- See CONTEXT.md "Data integrity & validation" and RESEARCH.md Pitfall 6 (Swiss UCITS ETFs may
       -- have inception dates after 2009; downstream code needs to know actual coverage).

       ALTER TABLE public.instruments
         ADD COLUMN IF NOT EXISTS first_date DATE,
         ADD COLUMN IF NOT EXISTS last_date  DATE;
       ```

       Apply via `npx supabase db reset`.

    2. Create `src/lib/data/cache-prices.ts`:
       ```typescript
       import type { SupabaseClient } from '@supabase/supabase-js'
       import type { PriceRow, DividendRow, InstrumentMetadata } from './types'
       import type { DataError } from './errors'

       const BATCH_SIZE = 500   // RESEARCH.md Pattern 3

       export async function upsertInstrumentMetadata(
         supabase: SupabaseClient,
         meta: InstrumentMetadata,
       ): Promise<{ id: string } | DataError> {
         const { data, error } = await supabase
           .from('instruments')
           .upsert({
             ticker: meta.ticker,
             name: meta.name,
             isin: meta.isin,
             type: meta.type,
             currency: meta.currency,
             exchange: meta.exchange,
             expense_ratio: meta.expense_ratio,
             dividend_yield: meta.dividend_yield,
             data_source: 'eodhd',
           }, { onConflict: 'ticker' })
           .select('id')
           .single()
         if (error) return { kind: 'transient', message: error.message, attempt: 1 }
         return { id: data.id as string }
       }

       export async function upsertPrices(
         supabase: SupabaseClient,
         instrumentId: string,
         rows: PriceRow[],
       ): Promise<{ upserted: number; firstDate: string | null; lastDate: string | null } | DataError> {
         if (rows.length === 0) return { upserted: 0, firstDate: null, lastDate: null }

         const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
         const mapped = sorted.map(r => ({
           instrument_id: instrumentId,
           date: r.date,
           open: r.open,
           high: r.high,
           low: r.low,
           close: r.close,
           adjusted_close: r.adjusted_close,
           volume: r.volume,
         }))

         for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
           const batch = mapped.slice(i, i + BATCH_SIZE)
           const { error } = await supabase
             .from('prices')
             .upsert(batch, { onConflict: 'instrument_id,date' })
           if (error) return { kind: 'transient', message: `prices upsert: ${error.message}`, attempt: 1 }
         }

         const firstDate = sorted[0].date
         const lastDate = sorted[sorted.length - 1].date

         // Update instruments.first_date/last_date — narrowing only (never widen artificially)
         const { error: updErr } = await supabase
           .from('instruments')
           .update({
             first_date: firstDate,  // overwrites OK — first fetch defines the range
             last_date: lastDate,
           })
           .eq('id', instrumentId)
         if (updErr) return { kind: 'transient', message: `instruments update: ${updErr.message}`, attempt: 1 }

         return { upserted: mapped.length, firstDate, lastDate }
       }

       export async function upsertDividends(
         supabase: SupabaseClient,
         instrumentId: string,
         rows: DividendRow[],
       ): Promise<{ upserted: number } | DataError> {
         if (rows.length === 0) return { upserted: 0 }
         const mapped = rows.map(r => ({
           instrument_id: instrumentId,
           ex_date: r.ex_date,
           amount: r.amount,
           currency: r.currency,
         }))
         for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
           const batch = mapped.slice(i, i + BATCH_SIZE)
           const { error } = await supabase
             .from('dividends')
             .upsert(batch, { onConflict: 'instrument_id,ex_date' })
           if (error) return { kind: 'transient', message: `dividends upsert: ${error.message}`, attempt: 1 }
         }
         return { upserted: mapped.length }
       }

       export async function getCachedPrices(
         supabase: SupabaseClient,
         instrumentId: string,
       ): Promise<PriceRow[] | DataError> {
         const { data, error } = await supabase
           .from('prices')
           .select('date, open, high, low, close, adjusted_close, volume')
           .eq('instrument_id', instrumentId)
           .order('date', { ascending: true })
         if (error) return { kind: 'transient', message: error.message, attempt: 1 }
         return (data ?? []) as PriceRow[]
       }

       export async function getInstrumentByTicker(
         supabase: SupabaseClient,
         ticker: string,
       ): Promise<{ id: string; first_date: string | null; last_date: string | null } | null | DataError> {
         const { data, error } = await supabase
           .from('instruments')
           .select('id, first_date, last_date')
           .eq('ticker', ticker)
           .maybeSingle()
         if (error) return { kind: 'transient', message: error.message, attempt: 1 }
         return data
       }
       ```

    Avoid: writing to `prices` without setting `instruments.first_date/last_date` — that breaks the smoke test contract from CONTEXT.md. Avoid storing zero-volume synthetic rows for non-trading days (Pitfall: do not insert synthetic forward-fill rows at ingest).

    No unit test here — this module talks to live Supabase. It's exercised by Task 4's integration test.
  </action>
  <verify>
    <automated>npx supabase db reset && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>
    `00003_instruments_date_range.sql` applies cleanly. `instruments.first_date` and `instruments.last_date` columns exist (verify via `npx supabase db dump --data-only=false | grep first_date`). `cache-prices.ts` exports the 5 documented functions. `tsc --noEmit` passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Install eodhd SDK + write EODHDProvider implementing IMarketDataProvider</name>
  <files>package.json, next.config.ts, src/lib/data/EODHDProvider.ts, src/lib/data/EODHDProvider.test.ts</files>
  <behavior>
    Test 1: `provider.getEod('SPY.US')` (with mock fetch serving `tests/fixtures/eodhd/spy-eod.json`) returns an array of `PriceRow` with `adjusted_close` non-null on every row.
    Test 2: `provider.getDividends('SPY.US')` (mock serving `spy-dividends.json`) returns array of `DividendRow` with `ex_date`, `amount`, `currency: 'USD'`.
    Test 3: `provider.bulkEod('US', '2026-05-01')` (mock serving `bulk-us-sample.json`) returns array of `BulkEodRow` with at least one row whose `code === 'SPY'` and `exchange_short_name === 'US'`.
    Test 4: `provider.search('Apple')` (mock serving `search-apple.json`) returns array of `SearchResult`. The provider normalizes EODHD's `Type` field (e.g., 'ETF', 'Common Stock') to the v1 enum (`etf`, `stock`); unknown types pass through as-is.
    Test 5: When mock-fetch returns HTTP 429, `getEod` returns `{ kind: 'rate_limit', message, retryAfter? }`. No retry attempted.
    Test 6: When mock returns HTTP 503 for the first 2 calls then 200, `getEod` succeeds (proves withRetry wrapping).
    Test 7: When ticker has no rows in EODHD response (empty array), `getEod` returns `{ kind: 'not_found', message }`.
    Test 8: Invalid input — calling `getEod('')` returns `{ kind: 'invalid_input', message }` without making any fetch call.
  </behavior>
  <action>
    Per RESEARCH.md Standard Stack + Open Question 1 (`serverExternalPackages`):

    1. Install the EODHD SDK: `npm install eodhd --legacy-peer-deps`. Per RESEARCH.md, the SDK is the recommended approach (lightweight, first-party, typed).

    2. Update `next.config.ts` to add `eodhd` to `serverExternalPackages` as a precaution (RESEARCH.md Open Question 1):
       ```typescript
       const nextConfig = {
         experimental: {
           serverExternalPackages: ['eodhd'],
         },
       }
       ```
       If `next.config.ts` already has other config, merge — do not overwrite. If it's a `.mjs` file, adjust syntax accordingly. (Read the file first to check.)

    3. Create `src/lib/data/EODHDProvider.ts`:
       ```typescript
       import { API } from 'eodhd'
       import { z } from 'zod'
       import type { IMarketDataProvider } from './IMarketDataProvider'
       import type { PriceRow, DividendRow, BulkEodRow, SearchResult } from './types'
       import type { DataError } from './errors'
       import { withRetry } from './backoff'

       const EodRowSchema = z.object({
         date: z.string(),
         open: z.number().nullable().optional(),
         high: z.number().nullable().optional(),
         low: z.number().nullable().optional(),
         close: z.number(),
         adjusted_close: z.number(),
         volume: z.number().nullable().optional(),
       })
       const DivRowSchema = z.object({
         date: z.string(),
         value: z.number(),
         currency: z.string(),
       })
       const BulkRowSchema = EodRowSchema.extend({
         code: z.string(),
         exchange_short_name: z.string(),
       })
       const SearchRowSchema = z.object({
         Code: z.string(),
         Exchange: z.string(),
         Name: z.string(),
         Type: z.string(),
         Country: z.string().optional(),
         Currency: z.string(),
         ISIN: z.string().nullable().optional(),
       })

       const TYPE_MAP: Record<string, SearchResult['type']> = {
         'ETF': 'etf',
         'ETP': 'etf',
         'Common Stock': 'stock',
         'Preferred Stock': 'stock',
         'Mutual Fund': 'fund',
         'Bond': 'bond',
         'Commodity': 'commodity',
         'Future': 'future',
       }

       export class EODHDProvider implements IMarketDataProvider {
         private client: API
         constructor(apiKey: string) {
           if (!apiKey) throw new Error('EODHDProvider: apiKey required')
           this.client = new API(apiKey)
         }

         async getEod(symbol: string, opts: { from?: string; to?: string } = {}): Promise<PriceRow[] | DataError> {
           if (!symbol || !symbol.includes('.')) {
             return { kind: 'invalid_input', message: `EOD symbol must be SYMBOL.EXCHANGE; got "${symbol}"` }
           }
           return withRetry(async () => {
             try {
               const raw = await this.client.eod(symbol, { from: opts.from ?? '1970-01-01', order: 'a' })
               // SDK may wrap HTTP errors as thrown — but also returns arrays directly. Need to handle both.
               if (!Array.isArray(raw)) {
                 const status = (raw as { status?: number } | undefined)?.status
                 if (status === 429) return { kind: 'rate_limit', message: 'EODHD 429' }
                 if (status === 404) return { kind: 'not_found', message: `EODHD ${symbol} not found` }
                 if (status && status >= 500) return { kind: 'transient', message: `EODHD ${status}`, attempt: 0 }
                 return { kind: 'transient', message: `EODHD unexpected response`, attempt: 0 }
               }
               if (raw.length === 0) return { kind: 'not_found', message: `EODHD ${symbol} returned no rows` }
               const parsed = raw.map(r => {
                 const v = EodRowSchema.parse(r)
                 return {
                   date: v.date,
                   open: v.open ?? null,
                   high: v.high ?? null,
                   low: v.low ?? null,
                   close: v.close,
                   adjusted_close: v.adjusted_close,
                   volume: v.volume ?? null,
                 }
               })
               return parsed
             } catch (err) {
               // Normalize SDK errors to our error contract
               return mapSDKError(err)
             }
           })
         }

         async getDividends(symbol: string, opts: { from?: string; to?: string } = {}): Promise<DividendRow[] | DataError> {
           if (!symbol || !symbol.includes('.')) {
             return { kind: 'invalid_input', message: `Dividend symbol must be SYMBOL.EXCHANGE; got "${symbol}"` }
           }
           return withRetry(async () => {
             try {
               const raw = await this.client.dividends(symbol, { from: opts.from ?? '1970-01-01' })
               if (!Array.isArray(raw)) return mapSDKError(raw)
               const parsed = raw.map(r => {
                 const v = DivRowSchema.parse(r)
                 return { ex_date: v.date, amount: v.value, currency: v.currency }
               })
               return parsed
             } catch (err) {
               return mapSDKError(err)
             }
           })
         }

         async bulkEod(exchange: 'US' | 'SW', date: string): Promise<BulkEodRow[] | DataError> {
           return withRetry(async () => {
             try {
               const raw = await this.client.bulkEod(exchange, { date })
               if (!Array.isArray(raw)) return mapSDKError(raw)
               return raw.map(r => {
                 const v = BulkRowSchema.parse(r)
                 return {
                   date: v.date,
                   open: v.open ?? null,
                   high: v.high ?? null,
                   low: v.low ?? null,
                   close: v.close,
                   adjusted_close: v.adjusted_close,
                   volume: v.volume ?? null,
                   code: v.code,
                   exchange_short_name: v.exchange_short_name,
                 }
               })
             } catch (err) {
               return mapSDKError(err)
             }
           })
         }

         async search(query: string, opts: { limit?: number } = {}): Promise<SearchResult[] | DataError> {
           if (!query || query.trim().length < 2) {
             return { kind: 'invalid_input', message: 'search query must be >= 2 chars' }
           }
           return withRetry(async () => {
             try {
               const raw = await this.client.search(query, { limit: opts.limit ?? 10 })
               if (!Array.isArray(raw)) return mapSDKError(raw)
               return raw.map(r => {
                 const v = SearchRowSchema.parse(r)
                 const t = TYPE_MAP[v.Type] ?? v.Type.toLowerCase()
                 return {
                   ticker: v.Code,
                   exchange: v.Exchange,
                   name: v.Name,
                   type: t,
                   currency: v.Currency,
                   isin: v.ISIN ?? null,
                 }
               })
             } catch (err) {
               return mapSDKError(err)
             }
           })
         }
       }

       function mapSDKError(err: unknown): DataError {
         const msg = err instanceof Error ? err.message : String(err)
         // The eodhd SDK does not document its error shapes well — sniff by message.
         if (/429|rate.?limit|too many/i.test(msg)) {
           return { kind: 'rate_limit', message: msg }
         }
         if (/404|not found/i.test(msg)) {
           return { kind: 'not_found', message: msg }
         }
         if (/5\d\d|timeout|ECONNRESET|ENOTFOUND/i.test(msg)) {
           return { kind: 'transient', message: msg, attempt: 0 }
         }
         return { kind: 'transient', message: msg, attempt: 0 }
       }
       ```

    4. Create `src/lib/data/EODHDProvider.test.ts` with the 8 tests from `<behavior>`. Use mock-fetch to intercept any URL containing `eodhd.com` and serve fixtures based on URL path. Important: the eodhd SDK uses fetch under the hood, so `installFetchMock` works. Verify by inspecting URLs in the SDK source after install:
       ```bash
       grep -r "fetch\|axios" node_modules/eodhd/src 2>/dev/null | head -20
       ```
       If the SDK uses `axios` instead of `fetch`, switch the test strategy to monkey-patch the SDK's fetcher OR set the SDK's `baseURL` to a local test server (`msw` or a simple `http.createServer` in the test file). Document findings in SUMMARY.

       Pragmatic fallback if SDK uses axios and is hard to mock: write the EODHDProvider tests using a hand-rolled fake (a test double class implementing the same `eod()`, `dividends()`, etc. methods) injected via constructor. Restructure constructor to accept an optional `client?: API` so tests can pass a fake.

       Update constructor:
       ```typescript
       constructor(apiKey: string, client?: API) {
         this.client = client ?? new API(apiKey)
       }
       ```

       Then tests pass `new EODHDProvider('test-key', fakeClient)` where `fakeClient` is a TypeScript object implementing the methods we use.

    Avoid: scraping EODHD with raw fetch (research recommends the SDK; SDK handles pagination and ticker formatting). Avoid catching errors and returning generic transient — use `mapSDKError` for accurate kind detection. Avoid retrying on rate_limit (CONTEXT.md: explicit "no retry on 429").

    Note on `next.config.ts`: read the existing file first. If it doesn't exist, check for `next.config.mjs` or `next.config.js`. Use whatever's there.
  </action>
  <verify>
    <automated>npm run test:unit -- src/lib/data/EODHDProvider.test.ts</automated>
  </verify>
  <done>
    `eodhd` package installed. `next.config.*` has `serverExternalPackages: ['eodhd']`. `EODHDProvider` implements all 4 IMarketDataProvider methods. All 8 tests pass. The strategy used to mock the SDK (fetch-level vs constructor injection) is documented in the SUMMARY.
  </done>
</task>

<task type="auto">
  <name>Task 4: getPricesForTicker orchestrator + integration test (cache-first flow)</name>
  <files>src/lib/data/getPrices.ts, tests/integration/data/eodhd-cache-flow.spec.ts</files>
  <action>
    Per RESEARCH.md Pattern 1 (Cache-First Price Fetch):

    1. Create `src/lib/data/getPrices.ts`:
       ```typescript
       import type { SupabaseClient } from '@supabase/supabase-js'
       import { EODHDProvider } from './EODHDProvider'
       import { upsertPrices, upsertDividends, upsertInstrumentMetadata, getCachedPrices, getInstrumentByTicker } from './cache-prices'
       import { isDataError, type DataError } from './errors'
       import type { PriceRow, InstrumentMetadata } from './types'
       import type { IMarketDataProvider } from './IMarketDataProvider'

       export type GetPricesResult = { rows: PriceRow[]; instrumentId: string; cached: boolean }

       /**
        * Cache-first price fetch.
        * - If instrument exists AND has cached prices: return cached rows (cached=true).
        * - Otherwise: fetch from provider, upsert metadata + prices + dividends, return rows (cached=false).
        */
       export async function getPricesForTicker(
         supabase: SupabaseClient,
         ticker: string,           // e.g., "SPY.US"
         deps: { provider?: IMarketDataProvider; metadata?: Partial<InstrumentMetadata> } = {},
       ): Promise<GetPricesResult | DataError> {
         if (!ticker || !ticker.includes('.')) {
           return { kind: 'invalid_input', message: `ticker must be SYMBOL.EXCHANGE; got "${ticker}"` }
         }
         const [symbol, exchange] = ticker.split('.')

         // 1. Check cache via instrument lookup
         const inst = await getInstrumentByTicker(supabase, ticker)
         if (isDataError(inst)) return inst

         if (inst && inst.first_date) {
           // Cache hit
           const rows = await getCachedPrices(supabase, inst.id)
           if (isDataError(rows)) return rows
           if (rows.length > 0) return { rows, instrumentId: inst.id, cached: true }
         }

         // 2. Cache miss — fetch from provider
         const provider = deps.provider ?? new EODHDProvider(process.env.EODHD_API_KEY ?? '')

         // 2a. If we don't have metadata yet, search to get it
         let meta: InstrumentMetadata
         if (deps.metadata && deps.metadata.ticker && deps.metadata.name && deps.metadata.type) {
           meta = {
             ticker,
             name: deps.metadata.name!,
             isin: deps.metadata.isin ?? null,
             type: deps.metadata.type!,
             currency: deps.metadata.currency ?? 'USD',
             exchange,
             expense_ratio: deps.metadata.expense_ratio ?? null,
             dividend_yield: deps.metadata.dividend_yield ?? null,
           }
         } else {
           const searchResults = await provider.search(symbol, { limit: 5 })
           if (isDataError(searchResults)) return searchResults
           const match = searchResults.find(r => r.exchange === exchange && r.ticker === symbol)
           if (!match) return { kind: 'not_found', message: `EODHD search did not return ${ticker}` }
           meta = {
             ticker,
             name: match.name,
             isin: match.isin,
             type: match.type,
             currency: match.currency,
             exchange: match.exchange,
             expense_ratio: null,    // not in EODHD search response
             dividend_yield: null,
           }
         }

         // 2b. Upsert metadata to get instrument_id
         const upserted = await upsertInstrumentMetadata(supabase, meta)
         if (isDataError(upserted)) return upserted
         const instrumentId = upserted.id

         // 2c. Fetch prices + dividends in parallel
         const [prices, divs] = await Promise.all([
           provider.getEod(ticker),
           provider.getDividends(ticker),
         ])
         if (isDataError(prices)) return prices
         // Dividends failure: NOT fatal — log and continue. Some instruments have no divs.
         if (!isDataError(divs)) {
           const divResult = await upsertDividends(supabase, instrumentId, divs)
           if (isDataError(divResult)) return divResult  // upsert failed = real DB problem
         }

         const priceUpsert = await upsertPrices(supabase, instrumentId, prices)
         if (isDataError(priceUpsert)) return priceUpsert

         return { rows: prices, instrumentId, cached: false }
       }
       ```

    2. Create `tests/integration/data/eodhd-cache-flow.spec.ts`:
       - `beforeEach`: `truncateMarketData(client)` to reset.
       - Test 1 (cold fetch): create a fake `IMarketDataProvider` that returns SPY fixture data. Call `getPricesForTicker(supabase, 'SPY.US', { provider: fakeProvider })`. Assert returned `cached: false`, `rows.length > 0`, every row has `adjusted_close` non-null. Track call counts on the fake — `getEod` called exactly once, `getDividends` called exactly once.
       - Test 2 (cache hit): IMMEDIATELY call `getPricesForTicker(supabase, 'SPY.US', { provider: fakeProvider })` again. Assert `cached: true`, `rows.length` matches Test 1's count. Track call count: `getEod` should NOT be called a second time. THIS PROVES DATA-01.
       - Test 3 (Swiss ETF): repeat with CHDVD.SW fixture. Assert `cached: false` first call, `cached: true` second. Assert `currency: 'CHF'` on the persisted instrument row. THIS PROVES DATA-03 partially.
       - Test 4 (instruments.first_date/last_date set): after Test 1, query `instruments` row for SPY. Assert `first_date` and `last_date` are populated and match the min/max dates in the fixture.
       - Test 5 (rate limit propagation): create a fake provider whose `getEod` returns `{ kind: 'rate_limit', message: 'demo' }`. Call `getPricesForTicker`. Assert returned value is `{ kind: 'rate_limit' }` — propagates without retry.
       - Test 6 (metadata persistence): after Test 1, query `instruments` for SPY. Assert `name`, `type`, `currency`, `data_source: 'eodhd'` are populated. THIS PROVES DATA-04.

    3. The fake provider in tests is a plain object satisfying `IMarketDataProvider`:
       ```typescript
       const makeFakeProvider = (overrides: Partial<IMarketDataProvider> = {}): IMarketDataProvider & { calls: { getEod: number; getDividends: number } } => {
         const calls = { getEod: 0, getDividends: 0 }
         return {
           calls,
           async getEod(symbol) { calls.getEod++; return JSON.parse(await fs.readFile(`tests/fixtures/eodhd/spy-eod.json`, 'utf-8')) },
           async getDividends(symbol) { calls.getDividends++; return JSON.parse(await fs.readFile(`tests/fixtures/eodhd/spy-dividends.json`, 'utf-8')) /* note: fixture shape is EODHD raw — needs mapping in test or fixture */ },
           async bulkEod() { return [] },
           async search(q) { return [{ ticker: 'SPY', exchange: 'US', name: 'SPDR S&P 500 ETF Trust', type: 'etf', currency: 'USD', isin: 'US78462F1030' }] },
           ...overrides,
         }
       }
       ```
       Note: the EODHD raw fixtures have shape `{ date, value, currency }` for divs and `{ date, ..., adjusted_close, ... }` for prices. The test's fake provider needs to MAP these to `PriceRow`/`DividendRow` shapes (the provider does this in production; in tests we either use already-mapped fixtures or do the mapping in the fake). Use already-mapped fixtures in tests — write `tests/fixtures/internal/spy-prices.json` (PriceRow shape) and `spy-dividends-mapped.json` (DividendRow shape) for clarity. (These are NEW fixtures — add to the files_modified list mentally; they belong to this plan, not Plan 01's fixture set.)

       Actually, simpler: the test fake can do the mapping inline (fixture is raw EODHD shape; fake maps to PriceRow). This keeps Plan 01 fixtures unchanged.

    Avoid: hardcoding the EODHD API key in tests (always inject the provider via `deps`). Avoid making `getDividends` failure fatal (some instruments legitimately have no dividends — research notes irregular EU ex-dates). Avoid running real EODHD calls in any test.
  </action>
  <verify>
    <automated>npx playwright test tests/integration/data/eodhd-cache-flow.spec.ts --project=chromium</automated>
  </verify>
  <done>
    `getPricesForTicker` exists and implements cache-first flow. All 6 integration tests pass. Test 2 explicitly proves DATA-01 ("no repeat EODHD call"). Test 6 proves DATA-04. Test 3 proves DATA-03 partially (CHDVD.SW + SPY).
  </done>
</task>

</tasks>

<verification>
- `npm run test:unit -- src/lib/data/backoff.test.ts` passes
- `npm run test:unit -- src/lib/data/EODHDProvider.test.ts` passes
- `npx supabase db reset` applies all 3 migrations
- `npx playwright test tests/integration/data/eodhd-cache-flow.spec.ts --project=chromium` passes
- `npx tsc --noEmit -p tsconfig.json` passes
- `instruments.first_date` and `instruments.last_date` columns exist after migration
- `eodhd` appears in `package.json` dependencies and in `next.config.*` `serverExternalPackages`
</verification>

<success_criteria>
- DATA-01: cache-first flow verified — first call hits provider, second call hits Supabase only
- DATA-04: instrument metadata (name, type, currency, exchange) populated on first fetch
- DATA-03 (partial): both SPY.US and CHDVD.SW round-trip through the pipeline successfully
- IMarketDataProvider has exactly one implementation (EODHDProvider); all consumers depend on the interface
- Error contract enforced: rate_limit / not_found / transient / invalid_input all propagate correctly
- Retry semantics: transient retries 3x with [1s, 2s, 4s] delays; rate_limit returns immediately
- All upserts specify onConflict; bulk uses 500-row batches
- adjusted_close is canonical and non-null in every persisted row
</success_criteria>

<output>
After completion, create `.planning/phases/03-market-data-pipeline/03-04-SUMMARY.md` documenting:
- eodhd SDK version installed
- Strategy used to mock the SDK in tests (fetch-level via mock-fetch vs constructor injection — likely the latter)
- Final shape of `mapSDKError` (any kinds detected besides the 4 standard)
- Whether `next.config.ts` existed or was created; final contents of `serverExternalPackages`
- Confirmation that `instruments.first_date/last_date` populated correctly during cache-flow test
- Any deviations in withRetry attempt count (3 retries vs 4 attempts — final implementation choice)
</output>
