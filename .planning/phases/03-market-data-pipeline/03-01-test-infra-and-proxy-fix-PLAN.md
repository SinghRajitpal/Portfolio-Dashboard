---
phase: 03-market-data-pipeline
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - vitest.config.ts
  - src/proxy.ts
  - tests/integration/data/.gitkeep
  - tests/fixtures/eodhd/spy-eod.json
  - tests/fixtures/eodhd/spy-dividends.json
  - tests/fixtures/eodhd/chdvd-eod.json
  - tests/fixtures/eodhd/chdvd-dividends.json
  - tests/fixtures/eodhd/bulk-us-sample.json
  - tests/fixtures/eodhd/search-apple.json
  - tests/fixtures/frankfurter/chf-rates-sample.ndjson
  - tests/fixtures/openfigi/chdvd-isin.json
  - tests/helpers/supabase-test.ts
  - tests/helpers/mock-fetch.ts
  - tests/integration/data/proxy-cron-bypass.spec.ts
autonomous: true
requirements:
  - DATA-01
  - DATA-02
  - DATA-03
  - DATA-04
  - DATA-05
must_haves:
  truths:
    - "Vitest runs and reports pass/fail for unit tests"
    - "Playwright integration tests can run against a clean Supabase DB"
    - "A request to /api/cron/anything is NOT redirected to /auth by the proxy"
    - "Test fixtures for EODHD, Frankfurter, OpenFIGI exist on disk"
    - "Test helpers can truncate market-data tables between tests"
  artifacts:
    - path: "vitest.config.ts"
      provides: "Vitest config with Next.js 16 + TS path resolution"
      contains: "defineConfig"
    - path: "src/proxy.ts"
      provides: "Updated matcher excluding api/cron"
      contains: "api/cron"
    - path: "tests/helpers/supabase-test.ts"
      provides: "Test DB cleanup helpers"
      exports: ["truncateMarketData", "createTestSupabaseClient"]
    - path: "tests/helpers/mock-fetch.ts"
      provides: "fetch interceptor that serves fixtures by URL pattern"
      exports: ["installFetchMock", "uninstallFetchMock"]
    - path: "tests/fixtures/eodhd/spy-eod.json"
      provides: "Recorded EODHD price fixture for SPY"
      min_lines: 5
    - path: "tests/fixtures/frankfurter/chf-rates-sample.ndjson"
      provides: "Sample Frankfurter NDJSON fixture"
      min_lines: 5
    - path: "tests/fixtures/openfigi/chdvd-isin.json"
      provides: "OpenFIGI ISIN response for CH0237935637"
      min_lines: 5
  key_links:
    - from: "src/proxy.ts"
      to: "/api/cron/*"
      via: "matcher exclusion"
      pattern: "api/cron"
    - from: "tests/helpers/mock-fetch.ts"
      to: "tests/fixtures/"
      via: "URL pattern -> fixture file mapping"
      pattern: "fixtures/(eodhd|frankfurter|openfigi)"
---

<objective>
Lay Wave 0 test infrastructure and apply the day-1 proxy fix that unblocks every later plan in this phase.

Purpose: Per `03-VALIDATION.md` Wave 0 Requirements, the phase needs Vitest, fixture directories, mock-fetch helper, and Supabase test cleanup helpers BEFORE any task can claim an `<automated>` verify. Per `03-RESEARCH.md` Pitfall 1, the existing `src/proxy.ts` matcher matches `/api/cron/refresh-prices` and would 302-redirect Vercel cron invocations to `/auth` — silently failing the daily refresh. This plan makes the cron-bypass change before the cron route is even written, and proves it with a Playwright test against a placeholder route.

Output: Working test runner, recorded fixtures, mock-fetch helper, Supabase test cleanup, and a proxy that does NOT match `/api/cron/*`.
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-market-data-pipeline/03-CONTEXT.md
@.planning/phases/03-market-data-pipeline/03-RESEARCH.md
@.planning/phases/03-market-data-pipeline/03-VALIDATION.md
@src/proxy.ts
@playwright.config.ts
@package.json
@node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md

<interfaces>
<!-- Current src/proxy.ts matcher (the thing that breaks cron). Executor must edit this exact line. -->
From src/proxy.ts:
```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

<!-- Required helper signatures the rest of the phase will import -->
Target tests/helpers/supabase-test.ts:
```typescript
export function createTestSupabaseClient(): SupabaseClient
export async function truncateMarketData(client: SupabaseClient): Promise<void>
// Truncates: prices, dividends, fx_rates, instruments, isin_lookups (the last is added in plan 02 — handle "table does not exist" gracefully)
```

Target tests/helpers/mock-fetch.ts:
```typescript
export type FixtureRoute = { match: RegExp; fixture: string; status?: number; contentType?: string }
export function installFetchMock(routes: FixtureRoute[]): void  // monkey-patches global fetch
export function uninstallFetchMock(): void                       // restores original fetch
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install Vitest, write vitest.config.ts, add npm scripts</name>
  <files>package.json, vitest.config.ts</files>
  <action>
    Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` first — confirms Next.js 16 expectations and reminds you this is NOT the Next.js you know.

    1. Install Vitest as a dev dependency: `npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths --legacy-peer-deps`. Use `--legacy-peer-deps` per the established Phase 2 pattern (React 19.2.x peer-dep mismatches).
    2. Create `vitest.config.ts` at repo root with:
       - `defineConfig` from `vitest/config`
       - `plugins: [tsconfigPaths()]` so `@/` path alias works
       - `test: { environment: 'node', globals: false, include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'], exclude: ['tests/integration/**', 'tests/e2e/**', 'node_modules/**'] }`
       - NO watch mode in CI — never set `watch: true`. The default `vitest run` is one-shot.
    3. Add npm scripts to `package.json`:
       - `"test:unit": "vitest run"`
       - `"test:integration": "playwright test --project=chromium tests/integration"`
       - `"test": "npm run test:unit && npm run test:integration"`
       - Keep existing `test:e2e` script (Phase 1 Playwright e2e suite).
    4. Run `npm run test:unit` — expect "no test files found" exit 0 (acceptable — confirms runner works).

    Avoid: pulling in `jsdom` or `happy-dom` environments (this phase is server-only). Avoid `vitest --watch` anywhere. Avoid running `npm install` without `--legacy-peer-deps`.
  </action>
  <verify>
    <automated>npm run test:unit</automated>
  </verify>
  <done>
    `npm run test:unit` exits 0 with "No test files found" or similar. `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths` appear in `package.json` devDependencies. `vitest.config.ts` exists at repo root.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update src/proxy.ts matcher to exclude api/cron and prove with a Playwright test</name>
  <files>src/proxy.ts, tests/integration/data/proxy-cron-bypass.spec.ts, src/app/api/cron/_probe/route.ts</files>
  <action>
    Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` AGAIN before touching `proxy.ts` — Next.js 16 matcher semantics are subtly different from the middleware.ts world.

    1. In `src/proxy.ts`, update the matcher to insert `api/cron` into the negative lookahead, in alphabetical position after `favicon.ico`:
       ```typescript
       export const config = {
         matcher: [
           '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
         ],
       }
       ```
       Per `03-RESEARCH.md` Pattern 2: ANY path under `/api/cron/...` must skip the proxy entirely. Cron routes authenticate via their own `CRON_SECRET` header check (added in Plan 06).

    2. Create `src/app/api/cron/_probe/route.ts` — a minimal probe route used ONLY by this test. Returns `Response.json({ ok: true, ua: request.headers.get('user-agent') })`. Mark with a comment `// Probe route — DO NOT DELETE: tests/integration/data/proxy-cron-bypass.spec.ts depends on this`.

    3. Create `tests/integration/data/proxy-cron-bypass.spec.ts`:
       - Test 1: GET `/api/cron/_probe` while UNauthenticated. Assert status 200, response body `{ ok: true }`. (If proxy were still matching, this would 302 to `/auth`.)
       - Test 2: GET `/dashboard` while UNauthenticated. Assert status 302 with Location ending in `/auth`. (Confirms proxy STILL protects non-cron routes.)
       - Use `request.fetch` from Playwright with `maxRedirects: 0` to observe redirects.

    4. Run the test. Both must pass.

    Avoid: removing `_next/static` or any other existing exclusion — only ADD `api/cron`. Avoid catching the cron path in any startsWith logic inside the proxy body — the matcher exclusion is the correct layer.

    Why the underscore prefix on `_probe`: per Next.js 16 conventions, leading-underscore segments are private/internal — signals this is not a real product route.
  </action>
  <verify>
    <automated>npx playwright test tests/integration/data/proxy-cron-bypass.spec.ts --project=chromium</automated>
  </verify>
  <done>
    `src/proxy.ts` matcher contains `api/cron`. The probe route returns 200 unauthenticated. `/dashboard` still redirects to `/auth` unauthenticated. Both Playwright tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create test fixtures, mock-fetch helper, and Supabase test cleanup helper</name>
  <files>tests/helpers/supabase-test.ts, tests/helpers/mock-fetch.ts, tests/fixtures/eodhd/spy-eod.json, tests/fixtures/eodhd/spy-dividends.json, tests/fixtures/eodhd/chdvd-eod.json, tests/fixtures/eodhd/chdvd-dividends.json, tests/fixtures/eodhd/bulk-us-sample.json, tests/fixtures/eodhd/search-apple.json, tests/fixtures/frankfurter/chf-rates-sample.ndjson, tests/fixtures/openfigi/chdvd-isin.json, tests/integration/data/.gitkeep</files>
  <action>
    Per `03-VALIDATION.md` Wave 0 Requirements and `03-RESEARCH.md` "CI Rate Budget Protection": real EODHD/OpenFIGI calls in CI burn the 20/day budget. Tests must use fixtures.

    1. Create directories: `tests/integration/data/` (with `.gitkeep`), `tests/fixtures/eodhd/`, `tests/fixtures/frankfurter/`, `tests/fixtures/openfigi/`, `tests/helpers/`.

    2. Create hand-authored fixtures (do NOT call real APIs to record — synthesize realistic shape from `03-RESEARCH.md` examples):
       - `tests/fixtures/eodhd/spy-eod.json`: JSON array of ~10 daily SPY rows spanning 2024-01-02..2024-01-15. Each row: `{ date, open, high, low, close, adjusted_close, volume }`. Use plausible values (close ~470-480 range).
       - `tests/fixtures/eodhd/spy-dividends.json`: ~4 quarterly dividends 2023-Q1..2023-Q4. Shape per RESEARCH.md (`date, value, unadjustedValue, currency: "USD", declarationDate, recordDate, paymentDate, period: "Quarterly"`).
       - `tests/fixtures/eodhd/chdvd-eod.json`: ~10 rows for CHDVD.SW spanning 2024-01-02..2024-01-15. Currency CHF, close ~85-90.
       - `tests/fixtures/eodhd/chdvd-dividends.json`: 1 annual CHF dividend (Swiss UCITS ETFs typically annual, per STATE.md blocker note about irregular EU ex-dates — single row is fine for fixture).
       - `tests/fixtures/eodhd/bulk-us-sample.json`: array of 3 rows (SPY, AGG, VTI) for one date 2026-05-01. Shape: `{ code, exchange_short_name: "US", date, open, high, low, close, adjusted_close, volume }`.
       - `tests/fixtures/eodhd/search-apple.json`: array of 2 search results (e.g., AAPL.US and AAPL.LSE). Shape: `{ Code, Exchange, Name, Type, Country, Currency, ISIN }`.
       - `tests/fixtures/frankfurter/chf-rates-sample.ndjson`: 5 lines. Each line a JSON object `{"date":"YYYY-MM-DD","base":"CHF","rates":{"USD":0.xx,"EUR":0.xx,"GBP":0.xx}}`. Span 1999-01-04, 2010-06-15, 2020-03-15, 2024-01-02, 2026-05-01.
       - `tests/fixtures/openfigi/chdvd-isin.json`: array with one element `{ data: [{ figi: "BBG001S5N8V8", name: "ISHARES SWISS DIVIDEND", ticker: "CHDVD", exchCode: "SW", securityType: "ETP", currency: "CHF" }] }`.

    3. Create `tests/helpers/mock-fetch.ts`:
       ```typescript
       export type FixtureRoute = { match: RegExp; fixture: string; status?: number; contentType?: string }
       let originalFetch: typeof globalThis.fetch | null = null
       export function installFetchMock(routes: FixtureRoute[]): void {
         originalFetch = globalThis.fetch
         globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
           const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
           for (const r of routes) {
             if (r.match.test(url)) {
               const fs = await import('node:fs/promises')
               const path = await import('node:path')
               const body = await fs.readFile(path.join(process.cwd(), 'tests/fixtures', r.fixture), 'utf-8')
               return new Response(body, { status: r.status ?? 200, headers: { 'Content-Type': r.contentType ?? 'application/json' } })
             }
           }
           throw new Error(`mock-fetch: no fixture matched ${url}`)
         }
       }
       export function uninstallFetchMock(): void {
         if (originalFetch) { globalThis.fetch = originalFetch; originalFetch = null }
       }
       ```

    4. Create `tests/helpers/supabase-test.ts`:
       ```typescript
       import { createClient, SupabaseClient } from '@supabase/supabase-js'
       export function createTestSupabaseClient(): SupabaseClient {
         const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
         // Use service role for tests to bypass RLS during truncate
         const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
         return createClient(url, key, { auth: { persistSession: false } })
       }
       export async function truncateMarketData(client: SupabaseClient): Promise<void> {
         // Order matters: child tables first.
         const tables = ['prices', 'dividends', 'fx_rates', 'isin_lookups', 'instruments']
         for (const t of tables) {
           const { error } = await client.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000')
           // Tolerate "relation does not exist" (isin_lookups added in plan 02)
           if (error && !error.message.includes('does not exist')) throw error
         }
       }
       ```

    5. Add a smoke unit test `tests/unit/mock-fetch.test.ts` that calls `installFetchMock([{ match: /openfigi/, fixture: 'openfigi/chdvd-isin.json' }])`, fetches `https://api.openfigi.com/v3/mapping`, asserts `data[0].data[0].ticker === 'CHDVD'`, then uninstalls. This proves the helper works AND gives Plan 05 confidence the mock is wired correctly.

    Avoid: recording fixtures by hitting real APIs (would burn rate budget). Avoid using a service-role key in non-test code paths — `tests/helpers/supabase-test.ts` is the ONLY place that key is consumed.

    Note on env vars: `SUPABASE_SERVICE_ROLE_KEY` is added to `.env.local` for local test runs. For CI we'll set it in GitHub Actions secrets later (out of scope here — local-only for now).
  </action>
  <verify>
    <automated>npm run test:unit -- tests/unit/mock-fetch.test.ts</automated>
  </verify>
  <done>
    All 9 fixture files exist with valid JSON/NDJSON. `tests/helpers/mock-fetch.ts` and `tests/helpers/supabase-test.ts` exist with the documented exports. The `mock-fetch.test.ts` unit test passes via `npm run test:unit`.
  </done>
</task>

</tasks>

<verification>
- `npm run test:unit` exits 0 (Vitest configured and runnable)
- `npx playwright test tests/integration/data/proxy-cron-bypass.spec.ts --project=chromium` passes (proxy fix proven)
- `tests/fixtures/` contains directories `eodhd/`, `frankfurter/`, `openfigi/` with at least one fixture each
- `tests/helpers/mock-fetch.ts` and `tests/helpers/supabase-test.ts` export the documented symbols
- Search `src/proxy.ts` matcher: must contain literal `api/cron`
</verification>

<success_criteria>
- Vitest installed and configured; `npm run test:unit` runs
- `src/proxy.ts` matcher excludes `api/cron` BEFORE any cron route is added downstream
- Probe route + Playwright test prove the proxy bypass works (200 unauth on `/api/cron/_probe`)
- Existing `/dashboard` redirect behavior is untouched (regression-safe)
- Fixtures + mock-fetch helper + Supabase test helper exist and are exercised by at least one passing test
- All later plans in Phase 3 can declare `<automated>` verify commands without "MISSING" placeholders
</success_criteria>

<output>
After completion, create `.planning/phases/03-market-data-pipeline/03-01-SUMMARY.md` documenting:
- Vitest install command used (note `--legacy-peer-deps`)
- Final `src/proxy.ts` matcher string
- Fixture directory tree
- Whether `SUPABASE_SERVICE_ROLE_KEY` was added to `.env.local`
- Any deviation from the plan
</output>
