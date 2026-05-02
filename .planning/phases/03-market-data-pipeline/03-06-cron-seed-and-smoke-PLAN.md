---
phase: 03-market-data-pipeline
plan: 06
type: execute
wave: 5
depends_on: [03, 04, 05]
files_modified:
  - vercel.json
  - src/app/api/cron/refresh-prices/route.ts
  - src/app/api/cron/refresh-prices/route.test.ts
  - src/scripts/seed-instruments.ts
  - tests/integration/data/cron-refresh.spec.ts
  - tests/integration/data/phase3-smoke.spec.ts
autonomous: false
requirements:
  - DATA-01
  - DATA-02
  - DATA-03
  - DATA-04
  - DATA-05
user_setup:
  - service: vercel-cron
    why: "Daily bulk EOD refresh for tracked tickers"
    env_vars:
      - name: CRON_SECRET
        source: "Generate locally with `openssl rand -hex 32` then add to Vercel project env (Production + Preview)"
        scope: "server-only; also added to .env.local for local cron route testing"
must_haves:
  truths:
    - "GET /api/cron/refresh-prices?exchange=US with valid CRON_SECRET upserts new daily rows for tracked US tickers"
    - "GET /api/cron/refresh-prices?exchange=US WITHOUT CRON_SECRET returns 401"
    - "Cron route is NOT redirected by proxy.ts (regression test)"
    - "Seed script populates ~14 v1 template tickers idempotently"
    - "After seed, both CHDVD.SW and SPY.US have rows in prices and dividends"
    - "Phase 3 smoke test asserts all 5 phase success criteria from ROADMAP"
    - "vercel.json declares 2 cron jobs (US + SW exchanges) at 22:00 UTC"
  artifacts:
    - path: "src/app/api/cron/refresh-prices/route.ts"
      provides: "Daily bulk EOD refresh handler — auth via CRON_SECRET, upserts via cache helpers"
      exports: ["GET"]
    - path: "vercel.json"
      provides: "Vercel Cron declaration: 2 jobs, 22:00 UTC daily"
      contains: "crons"
    - path: "src/scripts/seed-instruments.ts"
      provides: "Idempotent seed for v1 template tickers"
      contains: "SPY"
    - path: "tests/integration/data/phase3-smoke.spec.ts"
      provides: "Goal-backward smoke test asserting all 5 ROADMAP success criteria"
  key_links:
    - from: "src/app/api/cron/refresh-prices/route.ts"
      to: "src/lib/data/EODHDProvider.ts"
      via: "provider.bulkEod(exchange, today)"
      pattern: "bulkEod"
    - from: "src/app/api/cron/refresh-prices/route.ts"
      to: "src/lib/data/cache-prices.ts"
      via: "upsertPrices for matching tracked tickers"
      pattern: "upsertPrices"
    - from: "vercel.json"
      to: "/api/cron/refresh-prices"
      via: "crons[].path"
      pattern: "/api/cron/refresh-prices"
    - from: "src/scripts/seed-instruments.ts"
      to: "src/lib/data/getPrices.ts"
      via: "getPricesForTicker for each template ticker"
      pattern: "getPricesForTicker"
---

<objective>
Close the phase: ship the daily refresh cron, the v1 ticker seed script, and a phase-level smoke test that asserts every ROADMAP success criterion is observably TRUE. This plan has a `checkpoint:human-verify` step at the end because real EODHD calls (one-off seed) and real Vercel cron deployment are user-driven.

Purpose: Per CONTEXT.md, daily refresh runs via Vercel Cron at ~22:00 UTC, hitting an internal API route protected by `CRON_SECRET`. Per Plan 01, `src/proxy.ts` already excludes `/api/cron/*` so cron requests bypass auth correctly. The seed script populates the ~14 v1 template tickers from RESEARCH.md "Pre-Seed Ticker List", spread over 2 days to respect the 20/day budget.

Output: Working cron route + vercel.json declaration; idempotent seed script; passing phase-level smoke test that the human approves before `/gsd:verify-work`.
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-market-data-pipeline/03-CONTEXT.md
@.planning/phases/03-market-data-pipeline/03-RESEARCH.md
@.planning/phases/03-market-data-pipeline/03-VALIDATION.md
@.planning/phases/03-market-data-pipeline/03-01-SUMMARY.md
@.planning/phases/03-market-data-pipeline/03-03-SUMMARY.md
@.planning/phases/03-market-data-pipeline/03-04-SUMMARY.md
@.planning/phases/03-market-data-pipeline/03-05-SUMMARY.md
@vercel.json
@src/proxy.ts
@src/lib/data/EODHDProvider.ts
@src/lib/data/getPrices.ts
@src/lib/data/cache-prices.ts
@src/lib/data/cache-fx.ts
@src/lib/data/cache-isin.ts
@tests/helpers/supabase-test.ts
@tests/helpers/mock-fetch.ts
@tests/fixtures/eodhd/bulk-us-sample.json
@node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md

<interfaces>
<!-- All assets from prior plans now exist and import-ready. -->
From src/lib/data/EODHDProvider.ts: `class EODHDProvider implements IMarketDataProvider`
From src/lib/data/getPrices.ts: `getPricesForTicker(supabase, ticker, deps?)`
From src/lib/data/cache-prices.ts: `upsertPrices`, `upsertDividends`, `upsertInstrumentMetadata`, `getInstrumentByTicker`
From src/lib/data/cache-fx.ts: `getFxRate`
From src/lib/data/cache-isin.ts: `readCachedISIN`, `upsertISINMappings`

<!-- Current vercel.json (Plan 01 didn't modify; still {"framework": "nextjs"}). -->
From vercel.json:
```json
{ "framework": "nextjs" }
```

<!-- Current src/proxy.ts matcher (post-Plan-01 fix). -->
From src/proxy.ts (line 53):
```
'/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: GET /api/cron/refresh-prices route + vercel.json crons declaration</name>
  <files>vercel.json, src/app/api/cron/refresh-prices/route.ts, src/app/api/cron/refresh-prices/route.test.ts</files>
  <action>
    READ FIRST: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`. Confirm Next.js 16 Route Handler conventions for GET handlers and how to read URL search params.

    1. Update `vercel.json` to add the `crons` array (preserving `framework: "nextjs"`):
       ```json
       {
         "framework": "nextjs",
         "crons": [
           { "path": "/api/cron/refresh-prices?exchange=US", "schedule": "0 22 * * *" },
           { "path": "/api/cron/refresh-prices?exchange=SW", "schedule": "0 22 * * *" }
         ]
       }
       ```
       Per RESEARCH.md "Vercel Cron Configuration": Hobby tier supports max 2 cron jobs at daily granularity. Schedule `0 22 * * *` = 22:00-22:59 UTC (Vercel invokes within the specified hour). 22:00 UTC is after EODHD posts EOD data (~21:00 UTC for US markets).

    2. Create `src/app/api/cron/refresh-prices/route.ts`:
       ```typescript
       import { NextRequest, NextResponse } from 'next/server'
       import { createClient as createServiceClient } from '@supabase/supabase-js'
       import { EODHDProvider } from '@/lib/data/EODHDProvider'
       import { upsertPrices } from '@/lib/data/cache-prices'
       import { isDataError } from '@/lib/data/errors'

       const ALLOWED_EXCHANGES = new Set(['US', 'SW'])

       /**
        * GET /api/cron/refresh-prices?exchange=US|SW
        *
        * Auth: CRON_SECRET via Authorization: Bearer header. Vercel Cron sends this automatically
        * when CRON_SECRET is set in Vercel project env.
        *
        * Bypassed by proxy.ts matcher (api/cron is excluded — see Plan 01).
        *
        * Strategy: bulkEod(exchange, today) returns all tickers on the exchange.
        * Filter to tracked tickers (instruments table where exchange = X).
        * Upsert matching rows. One bulk call covers many tickers — fits the 20/day budget.
        */
       export async function GET(request: NextRequest) {
         // 1. Auth
         const authHeader = request.headers.get('authorization')
         const cronSecret = process.env.CRON_SECRET
         if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
           return new Response('Unauthorized', { status: 401 })
         }

         // 2. Validate exchange param
         const exchange = request.nextUrl.searchParams.get('exchange')
         if (!exchange || !ALLOWED_EXCHANGES.has(exchange)) {
           return NextResponse.json(
             { kind: 'invalid_input', message: `exchange must be one of ${[...ALLOWED_EXCHANGES].join(', ')}` },
             { status: 400 },
           )
         }

         // 3. Service-role Supabase client (cron has no user session)
         const url = process.env.NEXT_PUBLIC_SUPABASE_URL
         const key = process.env.SUPABASE_SERVICE_ROLE_KEY
         if (!url || !key) return NextResponse.json({ kind: 'transient', message: 'Server config missing', attempt: 0 }, { status: 503 })
         const supabase = createServiceClient(url, key, { auth: { persistSession: false } })

         // 4. Fetch tracked tickers for this exchange
         const { data: tracked, error: trackedErr } = await supabase
           .from('instruments')
           .select('id, ticker')
           .eq('exchange', exchange)
         if (trackedErr) return NextResponse.json({ kind: 'transient', message: trackedErr.message, attempt: 0 }, { status: 503 })
         if (!tracked || tracked.length === 0) {
           return NextResponse.json({ ok: true, exchange, tracked: 0, upserted: 0, note: 'No tracked instruments yet' })
         }

         // 5. Bulk EOD for today
         const apiKey = process.env.EODHD_API_KEY
         if (!apiKey) return NextResponse.json({ kind: 'transient', message: 'Missing EODHD_API_KEY', attempt: 0 }, { status: 503 })
         const provider = new EODHDProvider(apiKey)
         const today = new Date().toISOString().split('T')[0]
         const bulkRows = await provider.bulkEod(exchange as 'US' | 'SW', today)
         if (isDataError(bulkRows)) {
           return NextResponse.json(bulkRows, { status: bulkRows.kind === 'rate_limit' ? 429 : 503 })
         }

         // 6. Filter to tracked tickers and upsert per instrument
         // EODHD's bulk row uses `code` field (without exchange suffix). Tracked.ticker is "SPY.US" — strip the suffix.
         const trackedMap = new Map<string, string>()  // code -> instrument_id
         for (const t of tracked) {
           const code = (t.ticker as string).split('.')[0]
           trackedMap.set(code, t.id as string)
         }

         let upsertedTotal = 0
         const skipped: string[] = []
         for (const row of bulkRows) {
           const instrumentId = trackedMap.get(row.code)
           if (!instrumentId) continue
           const result = await upsertPrices(supabase, instrumentId, [{
             date: row.date,
             open: row.open,
             high: row.high,
             low: row.low,
             close: row.close,
             adjusted_close: row.adjusted_close,
             volume: row.volume,
           }])
           if (isDataError(result)) skipped.push(`${row.code}: ${result.message}`)
           else upsertedTotal += result.upserted
         }

         return NextResponse.json({
           ok: true,
           exchange,
           date: today,
           tracked: tracked.length,
           returnedByEODHD: bulkRows.length,
           upserted: upsertedTotal,
           skipped,
         })
       }
       ```

    3. Create `src/app/api/cron/refresh-prices/route.test.ts` (Vitest unit tests against the GET function):
       - Test 1: GET WITHOUT auth header → 401.
       - Test 2: GET with WRONG bearer → 401.
       - Test 3: GET with correct bearer but no `exchange` param → 400.
       - Test 4: GET with correct bearer and `exchange=ZZ` → 400.
       - Test 5: GET with correct bearer + `exchange=US` + tracked instruments + mocked provider returning fixture bulk → 200, response body has `upserted >= 1` for the matching ticker.
       - Test 6: GET with correct bearer + `exchange=US` + NO tracked instruments → 200 with `upserted: 0` (graceful no-op).

       For Tests 5 & 6, mock the EODHD SDK via the same `vi.mock` strategy used in Plan 04 EODHDProvider tests, OR mock `process.env.EODHD_API_KEY` to a sentinel value and intercept at fetch level. Document approach in SUMMARY.

    Avoid: returning 200 on auth failure. Avoid running the cron handler with the user-scoped supabase client (cron has no user session — must use service role). Avoid hardcoding `today` to a fixed date in tests (the fixture uses 2026-05-01; either mock `Date.now()` or filter the bulk-row matching to be date-agnostic in tests).

    Plan 01 regression: ensure `tests/integration/data/proxy-cron-bypass.spec.ts` still passes (the matcher fix made in Plan 01 covers this NEW route now too).
  </action>
  <verify>
    <automated>npm run test:unit -- src/app/api/cron/refresh-prices/route.test.ts</automated>
  </verify>
  <done>
    `vercel.json` contains the 2 crons declaration. `src/app/api/cron/refresh-prices/route.ts` exports `GET` with auth + bulk-refresh logic. All 6 unit tests pass. The Plan 01 proxy-cron-bypass test still passes (rerun to confirm regression-safe).
  </done>
</task>

<task type="auto">
  <name>Task 2: Idempotent seed-instruments.ts script for v1 template tickers</name>
  <files>src/scripts/seed-instruments.ts</files>
  <action>
    Per RESEARCH.md "Pre-Seed Ticker List (v1 Templates)": 14 instruments. Rate budget = 14 × 2 (prices + dividends) = 28 calls. Spread over 2 days: prices Day 1, dividends Day 2 — but `getPricesForTicker` currently fetches BOTH in parallel. To respect the budget we need a "prices-only" mode.

    1. Refactor `getPricesForTicker` (Plan 04) is OUT of scope here. Instead, the seed script can directly call `provider.getEod` and `provider.getDividends` separately and skip dividends on Day 1 — controlled by a CLI arg. Don't refactor Plan 04's orchestrator.

    2. Create `src/scripts/seed-instruments.ts`:
       ```typescript
       import { createClient } from '@supabase/supabase-js'
       import { EODHDProvider } from '@/lib/data/EODHDProvider'
       import { upsertInstrumentMetadata, upsertPrices, upsertDividends, getInstrumentByTicker } from '@/lib/data/cache-prices'
       import { isDataError } from '@/lib/data/errors'
       import type { InstrumentMetadata } from '@/lib/data/types'

       /**
        * v1 template tickers — see RESEARCH.md "Pre-Seed Ticker List".
        * Hand-curated metadata: name/type/currency/exchange. expense_ratio and dividend_yield are
        * left null — populated lazily when EODHD fundamentals lite is in scope (deferred for v1).
        */
       const SEED: InstrumentMetadata[] = [
         // Classic 60/40
         { ticker: 'SPY.US', name: 'SPDR S&P 500 ETF Trust', isin: 'US78462F1030', type: 'etf', currency: 'USD', exchange: 'US', expense_ratio: null, dividend_yield: null },
         { ticker: 'AGG.US', name: 'iShares Core U.S. Aggregate Bond ETF', isin: 'US4642872265', type: 'etf', currency: 'USD', exchange: 'US', expense_ratio: null, dividend_yield: null },
         { ticker: 'VTI.US', name: 'Vanguard Total Stock Market ETF', isin: 'US9229087690', type: 'etf', currency: 'USD', exchange: 'US', expense_ratio: null, dividend_yield: null },
         { ticker: 'BND.US', name: 'Vanguard Total Bond Market ETF', isin: 'US9219378356', type: 'etf', currency: 'USD', exchange: 'US', expense_ratio: null, dividend_yield: null },
         // All-World (LSE listings have UCITS structure relevant for Swiss residents)
         { ticker: 'VWRL.LSE', name: 'Vanguard FTSE All-World UCITS ETF', isin: 'IE00B3RBWM25', type: 'etf', currency: 'USD', exchange: 'LSE', expense_ratio: null, dividend_yield: null },
         { ticker: 'IWDA.LSE', name: 'iShares Core MSCI World UCITS ETF', isin: 'IE00B4L5Y983', type: 'etf', currency: 'USD', exchange: 'LSE', expense_ratio: null, dividend_yield: null },
         { ticker: 'CSSPX.SW', name: 'iShares Core S&P 500 UCITS ETF', isin: 'IE00B5BMR087', type: 'etf', currency: 'CHF', exchange: 'SW', expense_ratio: null, dividend_yield: null },
         { ticker: '500E.SW', name: 'Amundi S&P 500 UCITS ETF', isin: 'LU1681048804', type: 'etf', currency: 'CHF', exchange: 'SW', expense_ratio: null, dividend_yield: null },
         // Swiss dividend / EM
         { ticker: 'CHDVD.SW', name: 'iShares Swiss Dividend ETF', isin: 'CH0237935637', type: 'etf', currency: 'CHF', exchange: 'SW', expense_ratio: null, dividend_yield: null },
         { ticker: 'IQQA.SW', name: 'iShares MSCI EM UCITS ETF', isin: 'IE00B0M63177', type: 'etf', currency: 'USD', exchange: 'SW', expense_ratio: null, dividend_yield: null },
         // Benchmarks
         { ticker: 'GLD.US', name: 'SPDR Gold Shares', isin: 'US78463V1070', type: 'etf', currency: 'USD', exchange: 'US', expense_ratio: null, dividend_yield: null },
         { ticker: 'QQQ.US', name: 'Invesco QQQ Trust', isin: 'US46090E1038', type: 'etf', currency: 'USD', exchange: 'US', expense_ratio: null, dividend_yield: null },
         { ticker: 'EEM.US', name: 'iShares MSCI Emerging Markets ETF', isin: 'US4642872349', type: 'etf', currency: 'USD', exchange: 'US', expense_ratio: null, dividend_yield: null },
         { ticker: 'NOVN.SW', name: 'Novartis AG', isin: 'CH0012005267', type: 'stock', currency: 'CHF', exchange: 'SW', expense_ratio: null, dividend_yield: null },
       ]

       export async function runSeed(opts: { mode: 'prices' | 'dividends' | 'both' } = { mode: 'both' }) {
         const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
         const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
         const apiKey = process.env.EODHD_API_KEY!
         const supabase = createClient(url, key, { auth: { persistSession: false } })
         const provider = new EODHDProvider(apiKey)

         const summary = { processed: 0, skipped: 0, prices: 0, dividends: 0, errors: [] as string[] }

         for (const meta of SEED) {
           // Idempotency: if instrument already has prices, skip (per Pitfall 2)
           const existing = await getInstrumentByTicker(supabase, meta.ticker)
           if (isDataError(existing)) { summary.errors.push(`${meta.ticker}: lookup ${existing.message}`); continue }
           if (existing && existing.first_date && opts.mode !== 'dividends') {
             console.log(`Skipping ${meta.ticker} — already has prices`)
             summary.skipped++
             continue
           }

           // Upsert metadata
           const upserted = await upsertInstrumentMetadata(supabase, meta)
           if (isDataError(upserted)) { summary.errors.push(`${meta.ticker}: metadata ${upserted.message}`); continue }

           if (opts.mode === 'prices' || opts.mode === 'both') {
             const prices = await provider.getEod(meta.ticker)
             if (isDataError(prices)) { summary.errors.push(`${meta.ticker}: prices ${prices.kind} ${prices.message}`); continue }
             const r = await upsertPrices(supabase, upserted.id, prices)
             if (isDataError(r)) { summary.errors.push(`${meta.ticker}: prices upsert ${r.message}`); continue }
             summary.prices += r.upserted
           }

           if (opts.mode === 'dividends' || opts.mode === 'both') {
             const divs = await provider.getDividends(meta.ticker)
             if (isDataError(divs)) {
               // Some instruments have no dividends — kind='not_found' is acceptable
               if (divs.kind !== 'not_found') summary.errors.push(`${meta.ticker}: dividends ${divs.kind} ${divs.message}`)
             } else {
               const r = await upsertDividends(supabase, upserted.id, divs)
               if (isDataError(r)) { summary.errors.push(`${meta.ticker}: dividends upsert ${r.message}`); continue }
               summary.dividends += r.upserted
             }
           }

           summary.processed++
           console.log(`Seeded ${meta.ticker} — prices: ${opts.mode !== 'dividends'}, divs: ${opts.mode !== 'prices'}`)
         }
         return summary
       }

       async function main() {
         const mode = (process.argv[2] as 'prices' | 'dividends' | 'both') ?? 'both'
         if (!['prices', 'dividends', 'both'].includes(mode)) {
           console.error('Usage: tsx src/scripts/seed-instruments.ts [prices|dividends|both]')
           process.exit(1)
         }
         const result = await runSeed({ mode })
         console.log(JSON.stringify(result, null, 2))
         if (result.errors.length > 0) process.exit(1)
       }
       if (require.main === module) main()
       ```

       Add npm script: `"seed:instruments": "tsx src/scripts/seed-instruments.ts"`. Usage:
       - Day 1: `npm run seed:instruments prices` (14 EODHD calls)
       - Day 2: `npm run seed:instruments dividends` (14 EODHD calls)
       - Or single day: `npm run seed:instruments both` (28 calls — exceeds free tier; use only with paid key)

    3. Document in code comments why ISINs are pre-filled here (saves OpenFIGI lookups during Phase 4 testing): "ISINs hardcoded for v1 template instruments — verified manually against issuer factsheets. Reduces dependency on OpenFIGI for the well-known seed set."

    Avoid: hitting EODHD in any unit test for this script. The seed script is exercised end-to-end manually as part of Task 4's checkpoint. No `<automated>` test exercises the live network path.

    `<verify>` command below: typecheck only (the actual seed run is gated behind the human checkpoint).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>
    `src/scripts/seed-instruments.ts` exists with `runSeed({ mode })` exported and CLI entry point. `tsc --noEmit` passes. ISINs hard-coded for all 14 tickers. Idempotency via `getInstrumentByTicker` check. npm script added.
  </done>
</task>

<task type="auto">
  <name>Task 3: Cron route integration test + phase-level smoke test (goal-backward)</name>
  <files>tests/integration/data/cron-refresh.spec.ts, tests/integration/data/phase3-smoke.spec.ts</files>
  <action>
    Two test files — one for the cron route specifically, one for the phase as a whole.

    1. Create `tests/integration/data/cron-refresh.spec.ts`:
       - `beforeEach`: `truncateMarketData(client)`. Pre-seed: insert 1 instrument `SPY.US` and 1 instrument `CHDVD.SW` (just metadata, no prices) using the test client.
       - Test 1 (proxy bypass regression): GET `/api/cron/refresh-prices?exchange=US` WITHOUT auth, WITHOUT cron secret. Expected: 401 (NOT 302 — that would mean proxy is matching, regression).
       - Test 2 (auth required): GET with `Authorization: Bearer wrong-secret`. Expected: 401.
       - Test 3 (happy path): set `CRON_SECRET=test-secret` env var (in test setup). GET with `Authorization: Bearer test-secret&exchange=US`. Mock the EODHD SDK fetch to serve `tests/fixtures/eodhd/bulk-us-sample.json`. Expected: 200, response body shows `upserted >= 1` (SPY matched). Verify directly: query `prices` table for instrument SPY — has at least 1 new row.
       - Test 4 (no tracked instruments → graceful): same as Test 3 but with `exchange=SW` (CHDVD.SW IS pre-seeded so it would match — adjust test). Actually skip Test 4 since Test 3 already covers happy path; replace with a test where the BULK response contains no matching tickers (e.g., bulk returns AAPL, GOOG which we don't track). Expected: 200 with `upserted: 0, returnedByEODHD: 2, tracked: 1, skipped: []`.

       Same caveat as Plan 05 Task 3: server-side fetch interception is hard. Use the constructor-injection pattern from Plan 04 EODHDProvider tests if needed, but the cron route INSTANTIATES `EODHDProvider` itself — so to inject we'd need to refactor.

       Pragmatic approach: these tests run `POST` directly to the imported `GET` handler function (NOT through HTTP), and use `vi.mock('@/lib/data/EODHDProvider')` to replace the provider class with a fake. This is the same strategy as Plan 05 Task 2 unit tests.

       Add a Test 5 that hits the real dev server (`http://localhost:3000`): GET unauthenticated → 401 (proves proxy bypass + auth check work end-to-end, end of story). This is the regression safety net.

    2. Create `tests/integration/data/phase3-smoke.spec.ts` — the goal-backward verification:
       - This test asserts every ROADMAP success criterion for Phase 3 IS observable.
       - `beforeAll`: pre-seed the test DB with fixture data simulating a successful seed run (`SPY.US` instrument + 5 price rows + 4 dividend rows; `CHDVD.SW` instrument + 5 price rows + 1 dividend row; FX rates for CHF base / USD,EUR,GBP at multiple historical dates including 1999-01-04 and 2020-03-15; `isin_lookups` row for `CH0237935637 -> CHDVD.SW`).
       - Use a SQL fixture file `tests/fixtures/internal/phase3-seed.sql` for clarity (commit alongside the test). Apply via the test supabase client.
       - Criterion 1 (cache hit): call `getPricesForTicker(supabase, 'SPY.US', { provider: failingProvider })` where `failingProvider.getEod` throws if called. Assert `cached: true` and `rows.length > 0`. PROVES: cached data returns without re-calling EODHD.
       - Criterion 2 (FX 1999): query `fx_rates` for base='CHF', quote='USD', date='1999-01-04'. Assert row exists and rate is plausible (0.5..2.0). Repeat for EUR and GBP. PROVES: historical FX back to 1999.
       - Criterion 3 (ISIN): import the search route handler. POST `{ query: 'CH0237935637' }`. Assert response has `ticker: 'CHDVD'` and the cached `isin_lookups` row was returned (no OpenFIGI call needed since fixture pre-populated it). PROVES: ISIN resolves to ticker AND that ticker has price data (from Criterion 1's seed).
       - Criterion 4 (metadata): query `instruments` for SPY. Assert `name`, `type='etf'`, `currency='USD'` are non-null. (`expense_ratio`/`dividend_yield` may be null per CONTEXT.md — that's OK for v1.) PROVES: instrument metadata stored.
       - Criterion 5 (Swiss + US): query `prices` count for both SPY and CHDVD. Assert both have rows. Query `dividends` count for both. Assert both have rows. PROVES: both market types round-trip.

    3. The smoke test is the official answer to "is Phase 3 done?". `must_haves.truths` from this plan AND from Plans 02-05 are all asserted in this single test file.

    Avoid: making the smoke test depend on real network — pure DB + in-process route handler calls. Avoid making it depend on `runSeed` — that path is the manual checkpoint in Task 4. Smoke test verifies the EXIT STATE; checkpoint verifies the path that gets there.
  </action>
  <verify>
    <automated>npx playwright test tests/integration/data/cron-refresh.spec.ts tests/integration/data/phase3-smoke.spec.ts --project=chromium</automated>
  </verify>
  <done>
    Both test files exist. `cron-refresh.spec.ts` has 5 passing tests including the proxy-bypass regression. `phase3-smoke.spec.ts` has 5 passing tests, one per ROADMAP success criterion. The full integration suite passes via `npm run test:integration`.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Run real seed against EODHD + verify production cron deploy</name>
  <files>(no code files modified — env vars + Vercel dashboard only)</files>
  <action>
    Phase 3 is structurally complete after Task 3. All code paths exist, all automated tests pass, all migrations applied. This checkpoint hands control to the user for the parts only the user can do: real external API calls and production deploy verification. See <how-to-verify> below for the 7-step sequence.
  </action>
  <what-built>
    Phase 3 is structurally complete. All code paths exist, all automated tests pass, all migrations applied. What remains is the manual setup that touches real external services and the production environment:
    1. Vercel project env vars (CRON_SECRET, EODHD_API_KEY, SUPABASE_SERVICE_ROLE_KEY)
    2. Real seed run against EODHD free tier (spread over 2 days to respect 20/day budget)
    3. First production cron invocation (manual trigger via Vercel dashboard)
    4. Manual sanity check on EODHD `adjusted_close` for SPY 2020-03-15 vs a public source
  </what-built>
  <how-to-verify>
    Step 1 — Generate `CRON_SECRET` and add to env:
    ```bash
    openssl rand -hex 32
    ```
    Add to `.env.local` (NOT committed) AND to Vercel project: `vercel env add CRON_SECRET` (Production + Preview scopes). While there, confirm `EODHD_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are also set on Vercel (added during Plans 04 and 06 as user_setup items).

    Step 2 — Run the seed locally (Day 1: prices only):
    ```bash
    npm run seed:instruments prices
    ```
    Expected output: 14 tickers processed, 0 skipped, ~14*250+ prices upserted, 0 errors. EODHD free tier daily budget consumed: 14/20.

    Step 3 — WAIT 24 HOURS, then run dividends:
    ```bash
    npm run seed:instruments dividends
    ```
    Expected: 14 tickers processed, ~50-200 dividends upserted total. Some tickers (GLD, QQQ growth-tilted) may have no dividends — that's a `not_found` non-error result.

    Step 4 — Run the phase smoke test against the now-populated DB:
    ```bash
    npm run test:integration -- tests/integration/data/phase3-smoke.spec.ts
    ```
    All 5 criteria assertions must pass.

    Step 5 — Sanity check `adjusted_close` for SPY 2020-03-15:
    ```bash
    psql "$DATABASE_URL" -c "SELECT date, close, adjusted_close FROM prices p JOIN instruments i ON p.instrument_id=i.id WHERE i.ticker='SPY.US' AND p.date='2020-03-15' OR p.date='2020-03-16' ORDER BY date;"
    ```
    Compare `adjusted_close` to the value on Yahoo Finance website for that date. Should be within 0.5%.

    Step 6 — Deploy to Vercel:
    ```bash
    git push origin main
    ```
    Wait for deploy. Then in Vercel dashboard → Cron Jobs → click "Run now" on `/api/cron/refresh-prices?exchange=US`. Check Vercel logs: should see 200 response with JSON body `{ ok: true, exchange: 'US', upserted: <some number> }`. Run again for SW.

    Step 7 — Verify proxy regression: visit `https://portfolioforge-green.vercel.app/dashboard` UNAUTHENTICATED in a fresh incognito browser. Should redirect to `/auth`. Then visit `https://portfolioforge-green.vercel.app/api/cron/refresh-prices?exchange=US` (without bearer token). Should return 401 NOT redirect. Confirms proxy bypass + cron auth both work in production.

    Note any deviations, errors, or surprises in the SUMMARY.
  </how-to-verify>
  <resume-signal>Type "approved" if all 7 steps succeeded, OR describe issues encountered (e.g., "OpenFIGI rate-limited Day 2", "CHDVD has no Day 1 dividend data — irregular ex-date confirmed").</resume-signal>
  <verify>Manual — see <how-to-verify> Steps 4 and 7. The phase smoke test (Step 4) and the unauth-cron-401 check (Step 7) are the two automated proofs the human runs as part of this checkpoint.</verify>
  <done>All 7 steps approved by user. SUMMARY.md captures real seed counts and any deviations.</done>
</task>

</tasks>

<verification>
- `npm run test:unit -- src/app/api/cron/refresh-prices/route.test.ts` passes
- `npx playwright test tests/integration/data/cron-refresh.spec.ts --project=chromium` passes
- `npx playwright test tests/integration/data/phase3-smoke.spec.ts --project=chromium` passes
- `npx playwright test tests/integration/data/proxy-cron-bypass.spec.ts --project=chromium` STILL passes (regression-safe)
- `npm run test:integration` (full integration suite) passes
- `vercel.json` contains `"crons": [...]` with 2 entries
- After human checkpoint: real `prices` rows exist for all 14 seeded tickers; production cron returns 200 when manually triggered
</verification>

<success_criteria>
- All 5 ROADMAP success criteria for Phase 3 are observably TRUE (asserted by phase3-smoke.spec.ts)
- All 5 requirements (DATA-01 through DATA-05) have at least one passing automated test
- Daily refresh cron deployed to Vercel and verified manually firing (human checkpoint)
- Real seed completed within EODHD 20/day budget (spread over 2 days)
- `adjusted_close` for SPY on 2020-03-15 matches public source within 0.5% tolerance
- proxy.ts api/cron exclusion proven in PRODUCTION (Step 7 of checkpoint)
- Both CHDVD.SW and SPY.US have complete price + dividend history in the database
</success_criteria>

<output>
After completion (post-checkpoint), create `.planning/phases/03-market-data-pipeline/03-06-SUMMARY.md` documenting:
- Final `vercel.json` cron schedule (any time-of-day adjustment from 22:00 UTC)
- Whether SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET were added to Vercel env (Production + Preview)
- Real seed outcomes: total rows in prices, dividends, fx_rates, isin_lookups
- Any tickers that failed seed and why (e.g., delisted, EODHD coverage gap)
- adjusted_close sanity check result for SPY 2020-03-15 (DB value vs Yahoo Finance value, % delta)
- First production cron invocation result (Vercel logs link or screenshot, upserted count)
- Any STATE.md blockers/concerns to update (e.g., "Confirmed CHDVD has annual ex-date — regular not irregular" or vice versa)
- Full Phase 3 verification: link to phase3-smoke.spec.ts test results
</output>
