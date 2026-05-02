---
phase: 03-market-data-pipeline
plan: 05
type: execute
wave: 4
depends_on: [04]
files_modified:
  - src/lib/data/openfigi.ts
  - src/lib/data/openfigi.test.ts
  - src/lib/data/cache-isin.ts
  - src/app/api/instruments/search/route.ts
  - src/app/api/instruments/search/route.test.ts
  - tests/integration/data/search-route.spec.ts
autonomous: true
requirements:
  - DATA-05
  - DATA-04
  - DATA-03
must_haves:
  truths:
    - "POST /api/instruments/search with a valid ISIN returns matching ticker(s) via OpenFIGI"
    - "POST /api/instruments/search with a text query returns EODHD search results"
    - "ISIN lookups are cached in isin_lookups; second call for same ISIN does not hit OpenFIGI"
    - "Multi-venue results (e.g., UCITS ETF on SIX + XETRA + LSE) all returned to caller"
    - "Search route requires authentication (proxy still applies — non-cron route)"
    - "Invalid input (empty query, malformed ISIN) returns 400 with kind='invalid_input'"
  artifacts:
    - path: "src/lib/data/openfigi.ts"
      provides: "OpenFIGI ISIN resolver (hand-rolled fetch)"
      exports: ["resolveISIN", "isISIN"]
    - path: "src/lib/data/cache-isin.ts"
      provides: "isin_lookups cache helpers"
      exports: ["readCachedISIN", "upsertISINMappings"]
    - path: "src/app/api/instruments/search/route.ts"
      provides: "POST handler — auto-detects ISIN vs text, returns SearchResult[]"
      exports: ["POST"]
  key_links:
    - from: "src/app/api/instruments/search/route.ts"
      to: "src/lib/data/openfigi.ts"
      via: "resolveISIN call when query matches ISIN regex"
      pattern: "resolveISIN|isISIN"
    - from: "src/app/api/instruments/search/route.ts"
      to: "src/lib/data/EODHDProvider.ts"
      via: "EODHDProvider.search call when query is text"
      pattern: "EODHDProvider"
    - from: "src/app/api/instruments/search/route.ts"
      to: "src/lib/data/cache-isin.ts"
      via: "Cache check before OpenFIGI; cache write after"
      pattern: "readCachedISIN|upsertISINMappings"
---

<objective>
Build the public search surface — `POST /api/instruments/search` — and the OpenFIGI ISIN resolver behind it. After this plan, Phase 4's portfolio builder UI can call a single endpoint and get back consistent typed results regardless of whether the user typed a ticker, name, or ISIN.

Purpose: Per CONTEXT.md, search is exposed as a typed server function + API route only — no debug UI page. ISIN auto-detection via regex `/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/`. OpenFIGI is on-demand with results persisted to `isin_lookups` (cache miss next time = free). Multi-venue results returned, Phase 4 disambiguates. Must use the EODHDProvider from Plan 04 for non-ISIN search.

Output: A single POST endpoint that auto-detects input shape and returns `SearchResult[]` (or a typed error). All wired to the existing IMarketDataProvider from Plan 04 plus a new OpenFIGI client.
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-market-data-pipeline/03-CONTEXT.md
@.planning/phases/03-market-data-pipeline/03-RESEARCH.md
@.planning/phases/03-market-data-pipeline/03-04-SUMMARY.md
@src/lib/data/errors.ts
@src/lib/data/IMarketDataProvider.ts
@src/lib/data/EODHDProvider.ts
@src/lib/data/types.ts
@src/lib/data/getPrices.ts
@src/lib/supabase/server.ts
@tests/helpers/mock-fetch.ts
@tests/fixtures/openfigi/chdvd-isin.json
@tests/fixtures/eodhd/search-apple.json
@node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md

<interfaces>
<!-- Existing primitives from Plan 04 — import don't reimplement. -->
From src/lib/data/errors.ts: `DataError`, `isDataError`
From src/lib/data/types.ts: `SearchResult`
From src/lib/data/EODHDProvider.ts: `class EODHDProvider implements IMarketDataProvider`
From src/lib/data/getPrices.ts: `getPricesForTicker(supabase, ticker, deps?)`

<!-- Supabase server client (Phase 1 established async pattern). -->
From src/lib/supabase/server.ts:
```typescript
export async function createClient(): Promise<SupabaseClient>
```

<!-- isin_lookups schema (from 00002_isin_lookups.sql, Plan 02). -->
```sql
isin TEXT, ticker TEXT, exchange TEXT, figi TEXT, security_type TEXT, currency TEXT, fetched_at TIMESTAMPTZ
PRIMARY KEY (isin, ticker, exchange)
```

<!-- OpenFIGI request/response shape (from RESEARCH.md). -->
POST https://api.openfigi.com/v3/mapping
Body: [{ idType: "ID_ISIN", idValue: "CH0237935637" }]
Response: [{ data: [{ figi, name, ticker, exchCode, securityType, currency }] }]
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: OpenFIGI client with ISIN regex + isin_lookups cache helpers</name>
  <files>src/lib/data/openfigi.ts, src/lib/data/openfigi.test.ts, src/lib/data/cache-isin.ts</files>
  <behavior>
    Test 1: `isISIN('CH0237935637')` returns true.
    Test 2: `isISIN('SPY')` returns false (3 chars, not 12).
    Test 3: `isISIN('IE00B4L5Y983')` returns true (Irish UCITS ETF format).
    Test 4: `isISIN('CH023793563X')` returns false (last char must be digit).
    Test 5: `resolveISIN('CH0237935637')` (mock-fetch serving `tests/fixtures/openfigi/chdvd-isin.json`) returns array with at least one element where `ticker === 'CHDVD'`, `exchange === 'SW'`.
    Test 6: When OpenFIGI returns 429, `resolveISIN` returns `{ kind: 'rate_limit', message }`. (OpenFIGI free tier has rate limits despite no daily quota.)
    Test 7: When OpenFIGI returns `[{ warning: "No identifier found." }]` (their not-found shape), `resolveISIN` returns `{ kind: 'not_found', message }`.
    Test 8: When OpenFIGI returns network error, retry 3x via withRetry.
  </behavior>
  <action>
    Per RESEARCH.md Pattern 5 + Don't Hand-Roll table (no SDK; pure REST):

    1. Create `src/lib/data/openfigi.ts`:
       ```typescript
       import { z } from 'zod'
       import type { DataError } from './errors'
       import { withRetry } from './backoff'

       const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

       export function isISIN(s: string): boolean {
         return ISIN_REGEX.test(s)
       }

       const OpenFIGIRecordSchema = z.object({
         figi: z.string().nullable().optional(),
         name: z.string(),
         ticker: z.string(),
         exchCode: z.string(),
         securityType: z.string().optional(),
         currency: z.string().optional(),
       })

       const OpenFIGIResponseSchema = z.array(z.union([
         z.object({ data: z.array(OpenFIGIRecordSchema) }),
         z.object({ warning: z.string() }),
         z.object({ error: z.string() }),
       ]))

       export type OpenFIGIRecord = z.infer<typeof OpenFIGIRecordSchema>

       export async function resolveISIN(isin: string): Promise<OpenFIGIRecord[] | DataError> {
         if (!isISIN(isin)) {
           return { kind: 'invalid_input', message: `Not a valid ISIN: ${isin}` }
         }

         return withRetry(async () => {
           try {
             const headers: Record<string, string> = { 'Content-Type': 'application/json' }
             if (process.env.OPENFIGI_API_KEY) {
               headers['X-OPENFIGI-APIKEY'] = process.env.OPENFIGI_API_KEY
             }
             const res = await fetch('https://api.openfigi.com/v3/mapping', {
               method: 'POST',
               headers,
               body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
             })
             if (res.status === 429) {
               const ra = res.headers.get('retry-after')
               return { kind: 'rate_limit', message: 'OpenFIGI 429', retryAfter: ra ? new Date(Date.now() + parseInt(ra) * 1000) : undefined }
             }
             if (res.status >= 500) {
               return { kind: 'transient', message: `OpenFIGI ${res.status}`, attempt: 0 }
             }
             if (res.status >= 400) {
               return { kind: 'invalid_input', message: `OpenFIGI ${res.status}: ${await res.text()}` }
             }
             const json = await res.json()
             const parsed = OpenFIGIResponseSchema.parse(json)
             const first = parsed[0]
             if ('warning' in first) return { kind: 'not_found', message: first.warning }
             if ('error' in first) return { kind: 'invalid_input', message: first.error }
             return first.data
           } catch (err) {
             return { kind: 'transient', message: (err as Error).message, attempt: 0 }
           }
         })
       }
       ```

    2. Create `src/lib/data/cache-isin.ts`:
       ```typescript
       import type { SupabaseClient } from '@supabase/supabase-js'
       import type { DataError } from './errors'
       import type { OpenFIGIRecord } from './openfigi'

       export type ISINMapping = {
         isin: string
         ticker: string
         exchange: string
         figi: string | null
         security_type: string | null
         currency: string | null
       }

       export async function readCachedISIN(
         supabase: SupabaseClient,
         isin: string,
       ): Promise<ISINMapping[] | DataError> {
         const { data, error } = await supabase
           .from('isin_lookups')
           .select('isin, ticker, exchange, figi, security_type, currency')
           .eq('isin', isin)
         if (error) return { kind: 'transient', message: error.message, attempt: 0 }
         return (data ?? []) as ISINMapping[]
       }

       export async function upsertISINMappings(
         supabase: SupabaseClient,
         isin: string,
         records: OpenFIGIRecord[],
       ): Promise<{ upserted: number } | DataError> {
         if (records.length === 0) return { upserted: 0 }
         const rows = records.map(r => ({
           isin,
           ticker: r.ticker,
           exchange: r.exchCode,
           figi: r.figi ?? null,
           security_type: r.securityType ?? null,
           currency: r.currency ?? null,
         }))
         const { error } = await supabase
           .from('isin_lookups')
           .upsert(rows, { onConflict: 'isin,ticker,exchange' })
         if (error) return { kind: 'transient', message: error.message, attempt: 0 }
         return { upserted: rows.length }
       }
       ```

    3. Create `src/lib/data/openfigi.test.ts` covering the 8 test cases. Use mock-fetch from Plan 01.

    Avoid: assuming OpenFIGI returns `{ data: [...] }` always — sometimes returns `{ warning: ... }` (Pitfall: handle both). Avoid `OPENFIGI_API_KEY` as required — basic free tier works without it (research confirms). Avoid implementing TTL / staleness on `isin_lookups` (CONTEXT.md: ISIN mappings are permanent for v1).

    Note on `exchCode` vs EODHD exchange code: per RESEARCH.md Open Question 2, OpenFIGI returns codes like "SW" (matches EODHD), "GS" (XETRA in OpenFIGI vocabulary; EODHD uses "XETRA"). For v1 we cache `exchCode` as-is and add a small mapper if needed. Document this in the SUMMARY — full mapping table can be added when a mapping mismatch surfaces in Phase 4 testing.
  </action>
  <verify>
    <automated>npm run test:unit -- src/lib/data/openfigi.test.ts</automated>
  </verify>
  <done>
    `src/lib/data/openfigi.ts` exports `resolveISIN`, `isISIN`. `src/lib/data/cache-isin.ts` exports `readCachedISIN`, `upsertISINMappings`. All 8 unit tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: POST /api/instruments/search route — auto-detect ISIN vs text, cache-first ISIN resolution</name>
  <files>src/app/api/instruments/search/route.ts, src/app/api/instruments/search/route.test.ts</files>
  <action>
    READ FIRST: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`. This is NOT the Next.js you know — Route Handler conventions in Next.js 16 differ from older versions. Confirm: file path is `src/app/api/instruments/search/route.ts`, exports a named `POST` async function taking `(request: NextRequest)`, returns `Response` or `NextResponse`.

    1. Create `src/app/api/instruments/search/route.ts`:
       ```typescript
       import { NextRequest, NextResponse } from 'next/server'
       import { z } from 'zod'
       import { createClient } from '@/lib/supabase/server'
       import { isISIN, resolveISIN } from '@/lib/data/openfigi'
       import { readCachedISIN, upsertISINMappings } from '@/lib/data/cache-isin'
       import { EODHDProvider } from '@/lib/data/EODHDProvider'
       import { isDataError, type DataError } from '@/lib/data/errors'
       import type { SearchResult } from '@/lib/data/types'
       import type { IMarketDataProvider } from '@/lib/data/IMarketDataProvider'

       const RequestSchema = z.object({
         query: z.string().trim().min(2).max(200),
         limit: z.number().int().min(1).max(50).optional(),
       })

       /**
        * POST /api/instruments/search
        * Body: { query: string, limit?: number }
        * Returns: SearchResult[] | DataError (as JSON)
        *
        * Auto-detects:
        * - 12-char ISIN regex match -> OpenFIGI lookup (cache-first via isin_lookups)
        * - Otherwise -> EODHD search by ticker/name
        *
        * Auth: enforced by proxy.ts (this is NOT in the api/cron exclusion). Caller must be authenticated.
        */
       export async function POST(request: NextRequest) {
         let body: unknown
         try { body = await request.json() }
         catch { return NextResponse.json({ kind: 'invalid_input', message: 'Body must be valid JSON' } satisfies DataError, { status: 400 }) }

         const parsed = RequestSchema.safeParse(body)
         if (!parsed.success) {
           return NextResponse.json(
             { kind: 'invalid_input', message: parsed.error.issues.map(i => i.message).join('; ') } satisfies DataError,
             { status: 400 },
           )
         }
         const { query, limit = 10 } = parsed.data
         const supabase = await createClient()

         // Branch 1: ISIN
         if (isISIN(query)) {
           // Cache check
           const cached = await readCachedISIN(supabase, query)
           if (isDataError(cached)) return jsonError(cached)
           if (cached.length > 0) {
             return NextResponse.json(cached.map(c => ({
               ticker: c.ticker,
               exchange: c.exchange,
               name: '',                 // not stored in cache; Phase 4 can enrich via EODHD if needed
               type: c.security_type ?? '',
               currency: c.currency ?? '',
               isin: c.isin,
             } satisfies SearchResult)))
           }
           // Cache miss -> OpenFIGI
           const records = await resolveISIN(query)
           if (isDataError(records)) return jsonError(records)
           // Persist for next time
           const upserted = await upsertISINMappings(supabase, query, records)
           if (isDataError(upserted)) return jsonError(upserted)
           return NextResponse.json(records.map(r => ({
             ticker: r.ticker,
             exchange: r.exchCode,
             name: r.name,
             type: r.securityType ?? '',
             currency: r.currency ?? '',
             isin: query,
           } satisfies SearchResult)))
         }

         // Branch 2: text search via EODHD
         const apiKey = process.env.EODHD_API_KEY
         if (!apiKey) return jsonError({ kind: 'invalid_input', message: 'Server missing EODHD_API_KEY' })
         const provider: IMarketDataProvider = new EODHDProvider(apiKey)
         const results = await provider.search(query, { limit })
         if (isDataError(results)) return jsonError(results)
         return NextResponse.json(results)
       }

       function jsonError(err: DataError) {
         const status = err.kind === 'rate_limit' ? 429
                      : err.kind === 'not_found' ? 404
                      : err.kind === 'invalid_input' ? 400
                      : 503  // transient
         return NextResponse.json(err, { status })
       }
       ```

    2. Create `src/app/api/instruments/search/route.test.ts` (Vitest unit tests against the POST function directly — no live server needed):
       - Build a `NextRequest` for each test using `new Request('http://localhost/api/instruments/search', { method: 'POST', body: JSON.stringify({ query }) })` and pass it to the imported `POST` handler.
       - Test 1: `POST { query: '' }` → 400, `kind: 'invalid_input'`.
       - Test 2: `POST { query: 'x' }` (1 char) → 400.
       - Test 3: `POST { query: 'CH0237935637' }` with mock-fetch serving OpenFIGI fixture → 200 with array containing `{ ticker: 'CHDVD', exchange: 'SW', isin: 'CH0237935637' }`.
       - Test 4: `POST { query: 'CH0237935637' }` again (after Test 3 wrote to cache; use same supabase client across tests OR pre-seed the table) → 200 with the cached row, AND mock-fetch should NOT have been called for OpenFIGI a second time. Verify by tracking call count in the mock.
       - Test 5: malformed JSON body → 400.

       For tests that need a Supabase client, use `tests/helpers/supabase-test.ts` to create a service-role client. The `createClient` from `@/lib/supabase/server` reads cookies — mocking it cleanly is hard. Two options:
       (a) Restructure the route to accept an optional injected `supabase` client (NOT idiomatic for Route Handlers; would require a wrapper).
       (b) Use `vi.mock('@/lib/supabase/server', ...)` to replace `createClient` with a service-role client for tests.

       Option (b) is cleaner. In the test file:
       ```typescript
       import { vi } from 'vitest'
       import { createTestSupabaseClient, truncateMarketData } from '@/../tests/helpers/supabase-test'
       const testSupabase = createTestSupabaseClient()
       vi.mock('@/lib/supabase/server', () => ({ createClient: async () => testSupabase }))
       ```
       Then `beforeEach: truncateMarketData(testSupabase)`.

    3. Add a smoke note in code: `// Phase 3: This route requires authentication via proxy.ts. Plan 01 confirmed proxy DOES match this path (only api/cron is excluded).`

    Avoid: implementing custom auth (proxy handles it). Avoid returning EODHD raw shape — always normalize to `SearchResult`. Avoid making OpenFIGI calls when the cache already has the ISIN.
  </action>
  <verify>
    <automated>npm run test:unit -- src/app/api/instruments/search/route.test.ts</automated>
  </verify>
  <done>
    `src/app/api/instruments/search/route.ts` exists, exports `POST`. All 5 unit tests pass. Cache-first behavior for ISIN proven (Test 4: no second OpenFIGI call after cache write).
  </done>
</task>

<task type="auto">
  <name>Task 3: End-to-end Playwright integration test against the live route</name>
  <files>tests/integration/data/search-route.spec.ts</files>
  <action>
    Per `03-VALIDATION.md` Phase Requirements → Test Map: this is the test that proves DATA-05 (ISIN → ticker via OpenFIGI → return) end-to-end against a running Next.js server.

    1. Create `tests/integration/data/search-route.spec.ts`:
       - Pre-seed the local test DB with a known instrument so authenticated calls work. Use `tests/helpers/supabase-test.ts` + a fixture user. Authentication: Phase 1's auth flow uses Supabase email/password — for tests we either (a) call the route from a Playwright browser context that's already authenticated, or (b) mock the proxy (not ideal since we want to test the real path).

         Pragmatic approach: Phase 1's existing Playwright tests (`tests/auth.spec.ts`) include a test login flow. Reuse that pattern. Create a helper `tests/helpers/auth.ts` that:
         - Signs up a test user (email like `test-${Date.now()}@portfolioforge.test`) via Supabase signup.
         - Confirms email by calling Supabase admin API (service role) to mark the user confirmed.
         - Logs in via Playwright `page.goto('/auth')` and form submit.
         - Returns the authenticated `page` and `request` contexts.

         If Phase 1's tests already have such a helper, REUSE IT. Read `tests/auth.spec.ts` first to see the existing pattern.

       - `beforeAll`: install fetch mocks for OpenFIGI + EODHD. The Next.js dev server runs in a SEPARATE process from the Playwright test runner — `installFetchMock` only patches the test-runner-side fetch, not the server's fetch. This is a problem.

         Solution: use Playwright's request interception via `page.route()` does NOT work for server-side fetches either (only browser-side). For server-side, the cleanest option is environment variable injection: set `EODHD_API_KEY=test-mode` and have the EODHDProvider check `if (process.env.EODHD_API_KEY === 'test-mode')` to use a fixture loader instead of the SDK. Alternatively, set `NEXT_PUBLIC_OPENFIGI_BASE_URL` to a local mock server started by the test.

         Cleanest pragmatic solution: start a local HTTP mock server in the test (using Node's `http.createServer` listening on an ephemeral port) that responds with fixture JSON for OpenFIGI requests. Then set `OPENFIGI_BASE_URL` env var (added in this plan to `openfigi.ts`) to `http://localhost:<port>`. Ditto for EODHD via an `EODHD_BASE_URL` env var if the SDK supports it (check the SDK docs — likely accepts via constructor option or doesn't).

         If the eodhd SDK does NOT support a baseURL override, fall back to: bypass the route's text-search path in this integration test and ONLY exercise the ISIN path (which uses our own `fetch` for OpenFIGI and CAN be redirected via `OPENFIGI_BASE_URL`). Document the limitation in SUMMARY: "Text-search e2e is covered by route.test.ts at the unit level. ISIN flow is covered end-to-end here."

         Update `src/lib/data/openfigi.ts` to read `process.env.OPENFIGI_BASE_URL ?? 'https://api.openfigi.com'` for the base URL. Add this in the same task.

       - Test 1 (DATA-05 end-to-end): with mock OpenFIGI server returning the CHDVD fixture, POST to `http://localhost:3000/api/instruments/search` with `{ query: 'CH0237935637' }`. Authenticated via fixture user. Assert 200 and response array contains `{ ticker: 'CHDVD', exchange: 'SW' }`. Then query `isin_lookups` directly via `testSupabase` and assert the row was persisted.
       - Test 2 (cache hit, no OpenFIGI call): repeat the same POST. Track call count on the mock server — should remain at 1. Assert second response matches first.
       - Test 3 (auth required): POST WITHOUT authentication. Assert 302 redirect to `/auth`. (Confirms proxy still protects this route — regression for Plan 01.)

    2. If the auth helper from Phase 1 is too complex to wire up here, the Playwright test can use `request.post()` with a Supabase access token in a cookie set manually. Document the approach in SUMMARY.

    Avoid: spending 2+ hours wiring perfect auth. The unit tests in Task 2 already cover most route behavior. This integration test's PRIMARY purpose is DATA-05 end-to-end. If auth integration is too fiddly, settle for: (a) a smoke test that confirms unauth → 302 (Test 3), and (b) a server-side test that calls the POST handler function directly with a service-role supabase client (similar to Task 2 unit test, but running against actual Next.js server not just the function). The latter is essentially Task 2's tests + a confirmation that the dev server boots and routes correctly.

    Outcome priority: DATA-05 must be provably tested SOMEWHERE before Plan 06. If the Playwright e2e is too brittle, document the gap and rely on Task 2 unit tests + Plan 06's smoke test.
  </action>
  <verify>
    <automated>npx playwright test tests/integration/data/search-route.spec.ts --project=chromium</automated>
  </verify>
  <done>
    `tests/integration/data/search-route.spec.ts` exists. Test 3 (unauth → 302) MUST pass (regression-safe). Tests 1 + 2 (DATA-05 end-to-end) SHOULD pass — if auth wiring proves too fragile, document in SUMMARY which tests are gated and rely on Task 2 unit coverage.
  </done>
</task>

</tasks>

<verification>
- `npm run test:unit -- src/lib/data/openfigi.test.ts` passes
- `npm run test:unit -- src/app/api/instruments/search/route.test.ts` passes
- `npx playwright test tests/integration/data/search-route.spec.ts --project=chromium` passes (or documented gap)
- `curl -X POST http://localhost:3000/api/instruments/search -H 'Content-Type: application/json' -d '{"query":""}'` returns 400
- After authenticated POST with `{"query":"CH0237935637"}`, `isin_lookups` table contains the row (verified manually after dev server runs)
</verification>

<success_criteria>
- DATA-05 fully implemented: ISIN typed into search resolves to ticker via OpenFIGI and is cached
- Multi-venue results returned (Phase 4 disambiguates — Phase 3 does not pick on user's behalf)
- Search route auto-detects ISIN vs text via the documented regex
- ISIN cache hit avoids OpenFIGI call (proven by mock call counts)
- Error contract surfaces correctly through HTTP status codes (429, 404, 400, 503)
- Route still protected by proxy auth (regression-safe — only `/api/cron/*` is excluded)
</success_criteria>

<output>
After completion, create `.planning/phases/03-market-data-pipeline/03-05-SUMMARY.md` documenting:
- Whether `OPENFIGI_BASE_URL` env override was added (likely yes for testability)
- Whether `EODHD_BASE_URL` override is feasible with the SDK (probably not — document the gap)
- Auth strategy used in `tests/integration/data/search-route.spec.ts` (reused Phase 1 helper vs new approach)
- exchCode → EODHD exchange code mismatches discovered (if any)
- Which DATA-05 tests are unit vs e2e
</output>
