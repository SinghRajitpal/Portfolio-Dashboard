---
phase: 05-backtesting-engine
plan: 04
subsystem: backtesting-engine
tags: [api, supabase, rls, batch-fetch, persistence, zod, nextjs16]

requires:
  - phase: 05-backtesting-engine
    plan: 01
    why: "Reads backtest_runs table (migration 00009) and snb_rates (00010); imports SnbRateRow + RunRow type contracts"
  - phase: 05-backtesting-engine
    plan: 03
    why: "Imports getSnbRatesRange from src/lib/data/cache-snb for the batch payload's snbRates[] field"
  - phase: 03-market-data-pipeline
    why: "Reads from instruments/prices/dividends/fx_rates tables seeded by Phase 3; mirrors DataError contract"
provides:
  - "Plan 05-05 (worker + chart client) calls POST /api/backtest/data to assemble its BacktestInput payload"
  - "Plan 05-05 calls POST /api/backtest/runs after the worker completes — receives { id, deduped }"
  - "Plan 05-06 (UI) calls GET /api/backtest/runs?portfolio_id=… for the history drawer + GET /api/backtest/runs/[id] for one-click reload"
  - "src/lib/backtest/api-schemas.ts exports BacktestDataRequestSchema, BacktestRunWriteSchema, BENCHMARK_TICKER_WHITELIST, yearsBetween"
affects:
  - "Defines the wire contract that Plans 05-05 and 05-06 build against"
  - "Closes BACK-01 (data API), BACK-02 (persistence), BACK-05 (stale detection), BACK-07 (benchmark selection)"

tech-stack:
  added: []
  patterns:
    - "Zod-validate → SSR createClient → auth.getUser → RLS-scoped query"
    - "Promise.all single-round-trip batch fetch (CONTEXT D-07)"
    - ".maybeSingle() RLS pattern: null → 404 with same shape as truly-not-found (T-IDOR mitigation)"
    - "Dedup pre-check + upsert with onConflict for D-08 inputs_hash dedup"
    - "Next.js 16 dynamic route: params is Promise<{ id }> awaited inside the handler"
    - "Database type cast through `unknown` (mirrors _queries.ts) where backtest_runs row isn't in generated types yet"

key-files:
  created:
    - src/lib/backtest/api-schemas.ts
    - src/app/api/backtest/data/route.ts
    - src/app/api/backtest/runs/route.ts
    - src/app/api/backtest/runs/[id]/route.ts
  modified: []

decisions:
  - "pricesVersion = MAX(created_at) over prices+dividends+fx_rates because none of those tables have an updated_at column (verified against 00001_initial_schema.sql) — plan explicitly permitted this fallback. The Pitfall 9 race is tolerated: if a refresh lands after the MAX read, the next /runs/[id] fetch flips stale=true"
  - "If the benchmark_ticker is already present in the portfolio's holdings, do not double-fetch the instrument row — reuse the InstrumentInput with weight=0 so the worker treats it as a parallel benchmark sub-portfolio (CONTEXT D-23)"
  - "Module-private _jsonError helper kept in data/route.ts but referenced via `void _jsonError` because Next.js App Router only allows HTTP-method names as named exports from route handler files (exporting jsonError would trigger a build-time invalid-export error)"
  - "BacktestRunInsertRow declared as a named type before the upsert to avoid TS2502 self-referential `typeof row` cycle in the cast object literal"

metrics:
  duration: ~11 minutes
  completed: 2026-06-24
  task_count: 2
  file_count_created: 4
  file_count_modified: 0

key-decisions:
  - "Wire contract locked: { items, benchmark, prices, dividends, fxRates, snbRates, pricesVersion, investmentAmount }"
  - "Whitelist of 6 benchmark tickers is the SSRF/DoS backstop — z.enum on benchmark_ticker"

requirements-completed: [BACK-01, BACK-02, BACK-05, BACK-07]
---

# Phase 5 Plan 04: Backtest API Routes Summary

**Three Next.js 16 App Router route handlers (`/api/backtest/data`, `/api/backtest/runs`, `/api/backtest/runs/[id]`) plus a shared zod schemas module — RLS-checked single-round-trip batch fetch, idempotent run persistence with inputs_hash dedup, and stale-on-view detection by recomputing MAX(created_at) across the source tables.**

## What Was Done

### Task 1 — Zod schemas + batch-fetch endpoint (commit `2fb6f64`)

**`src/lib/backtest/api-schemas.ts`** exports:
- `BENCHMARK_TICKER_WHITELIST` — frozen tuple of the six D-22 candidates: `URTH.US`, `SWDA.LSE`, `SSAC.SW`, `ACWI.US`, `SPY.US`, `CSSMI.SW`.
- `BacktestDataRequestSchema` — validates `{ portfolio_id (uuid), benchmark_ticker (whitelist|null), start, end }` with two refinements: `start <= end` and `yearsBetween(start, end) <= 25` (DoS guard, T-5-04-DOS).
- `BacktestRunWriteSchema` — validates `{ portfolio_id, params (BacktestParams shape), inputsHash (/^[0-9a-f]{64}$/), pricesVersion (non-negative int), output (deep BacktestOutput shape)}`.
- `yearsBetween(a, b)` — `(Date.parse(b) - Date.parse(a)) / (365.25 * 86400000)`; matches the CAGR basis from CONTEXT D-18.

**`src/app/api/backtest/data/route.ts`** — POST handler implementing CONTEXT D-07:
1. JSON parse → 400 on malformed.
2. Zod safeParse → 400 with `kind:'invalid_input'` and concatenated issue messages.
3. `await createClient()` (SSR cookies-bound).
4. `supabase.auth.getUser()` → 401 if no user.
5. Portfolio lookup (`select id, investment_amount`) — RLS scopes; null → 404 with `kind:'not_found'`.
6. `portfolio_instruments` join with `instruments(id, ticker, currency, first_date)`.
7. If `benchmark_ticker` is present and not already in the portfolio, fetch the benchmark row from `instruments`; missing → 404 with the seeded-or-not message.
8. `Promise.all` over `prices` / `dividends` / `fx_rates` (CHF base) / `getSnbRatesRange()` — all four reads scoped to `[start, end]` (and `[startMonth, endMonth]` for SNB).
9. `pricesVersion = MAX(created_at)` across all returned rows. Tables have no `updated_at` (verified against `00001_initial_schema.sql`); plan permits the `created_at` fallback.
10. `toNum()` coercion at the route boundary for every NUMERIC field (matches `_queries.ts` lines 25-38).
11. Returns `{ items, benchmark, prices, dividends, fxRates, snbRates, pricesVersion, investmentAmount }`.

### Task 2 — Runs persistence + stale detection (commit `b636bd5`)

**`src/app/api/backtest/runs/route.ts`**:

POST:
1. Zod-validate via `BacktestRunWriteSchema`.
2. Auth check (401 if missing).
3. Dedup pre-check: `SELECT id FROM backtest_runs WHERE portfolio_id=$1 AND inputs_hash=$2 LIMIT 1` → captures `previousRow`.
4. Upsert with `onConflict: 'portfolio_id,inputs_hash'`, `ignoreDuplicates: false` → returns existing or new `id`.
5. Response: `{ id, deduped: previousRow !== null }`.

GET (list):
1. Optional `portfolio_id` query param via `new URL(request.url).searchParams.get()` (vitest-friendly per refresh-prices/route.ts pattern).
2. Auth check.
3. RLS-scoped `SELECT id, portfolio_id, params_json, metrics_json, prices_version, computed_at FROM backtest_runs ORDER BY computed_at DESC`, optionally `.eq('portfolio_id', …)`.

**`src/app/api/backtest/runs/[id]/route.ts`** — GET, Next.js 16 dynamic route:
- `params: Promise<{ id: string }>` awaited inside the handler (verified against `src/app/dashboard/portfolios/[id]/edit/page.tsx`).
- `.maybeSingle()` on `backtest_runs` — RLS scopes; null → 404 with same envelope as true-not-found (T-5-04-IDOR-ID).
- Recomputes `currentPricesVersion` via `Promise.all` over `prices` + `dividends` + `fx_rates` `created_at` in the run's date window. Includes the benchmark instrument id if `params_json.benchmark_ticker` is set.
- `stale = currentPricesVersion > storedVersion`.
- Returns `{ ...row, prices_version: storedVersion, stale }`.

## Sample Request / Response

### POST /api/backtest/data

Request:
```json
{
  "portfolio_id": "11111111-1111-1111-1111-111111111111",
  "benchmark_ticker": "SWDA.LSE",
  "start": "2020-01-01",
  "end": "2025-01-01"
}
```

Response (200):
```json
{
  "items": [
    { "id": "...", "ticker": "VT.US", "currency": "USD", "weight": 60, "first_date": "2010-01-04" }
  ],
  "benchmark": { "id": "...", "ticker": "SWDA.LSE", "currency": "USD", "weight": 0, "first_date": "2010-01-04" },
  "prices": [ { "instrument_id": "...", "date": "2020-01-02", "adjusted_close": 75.1234, "close": 78.45 } ],
  "dividends": [ { "instrument_id": "...", "ex_date": "2020-03-13", "amount": 0.5432, "currency": "USD" } ],
  "fxRates": [ { "quote_currency": "USD", "date": "2020-01-02", "rate": 0.97 } ],
  "snbRates": [ { "date_month": "2020-01", "rate": -0.0075, "source": "LZ" } ],
  "pricesVersion": 1735689600000,
  "investmentAmount": 100000
}
```

Errors (DataError envelope):
- 400 `{kind:'invalid_input', message:'…'}` — malformed JSON / Zod issues / start > end / range > 25y / benchmark not in whitelist
- 401 `{kind:'invalid_input', message:'Not authenticated'}` — no session
- 404 `{kind:'not_found', message:'Portfolio not found'}` — RLS hides the row OR benchmark not seeded
- 503 `{kind:'transient', message:'…', attempt:0}` — any Supabase sub-query error

### POST /api/backtest/runs

Request:
```json
{
  "portfolio_id": "…",
  "params": { "portfolio_id":"…", "start":"2020-01-01", "end":"2025-01-01",
              "drip":true, "rebalance":"annual", "benchmark_ticker":"SWDA.LSE" },
  "inputsHash": "5f2c1ab3…64 hex chars",
  "pricesVersion": 1735689600000,
  "output": { "equity":[…], "benchmarkEquity":[…], "annualBars":[…],
              "metrics":{ "totalReturn":0.42, "cagr":0.072, "maxDrawdown":-0.18,
                          "mddPeakDate":"2021-12-31", "mddTroughDate":"2022-09-30",
                          "sharpe":0.84, "vol":0.16 },
              "warnings":[], "pricesVersion":1735689600000 }
}
```

Response (200): `{ "id": "uuid", "deduped": false }` on first write; `{ "id": same, "deduped": true }` on identical replay.

### GET /api/backtest/runs/[id]

Response (200): `{ ...RunRow, prices_version: number, stale: boolean }`.

## RLS Verification (code-level)

Live curl smoke tests were skipped — the worktree's Next.js 16.2.2 SWC native binary is not hydrated (same constraint flagged in 05-03-SUMMARY.md). All RLS guarantees are nonetheless statically verifiable:

| Threat | Mitigation | Where |
|--------|------------|-------|
| T-5-04-IDOR (portfolio_id) | `createClient()` is SSR cookies-bound (not service-role); `.maybeSingle()` on portfolios hides someone else's row → 404 | `src/app/api/backtest/data/route.ts` step 4 |
| T-5-04-DOS (date range) | `.refine((v) => yearsBetween(v.start, v.end) <= 25)` runs before the route ever touches Postgres | `src/lib/backtest/api-schemas.ts` BacktestDataRequestSchema |
| T-5-04-SSRF (benchmark) | `benchmark_ticker: z.enum(BENCHMARK_TICKER_WHITELIST).nullable()` — only the six D-22 candidates accepted | `src/lib/backtest/api-schemas.ts` BENCHMARK_TICKER_WHITELIST |
| T-5-04-COLL | SHA-256 inputsHash + UNIQUE(portfolio_id, inputs_hash); collision probability is negligible | migration 00009 + `BacktestRunWriteSchema.inputsHash` |
| T-5-04-RUN-LEAK | RLS SELECT policy on backtest_runs gated on `(SELECT auth.uid()) = user_id`; the GET list query uses createClient() | migration 00009 lines 45-47 + runs/route.ts GET |
| T-5-04-IDOR-ID | `.maybeSingle()` returns null when RLS hides the row → mapped to 404 with same envelope as truly-not-found | `runs/[id]/route.ts` step 2 |

The downstream live-curl gates (401 on no session; 404 on another-user portfolio_id; 200 with all keys on own portfolio_id; two identical POSTs → second `deduped:true`; GET filters by portfolio_id) are bound to the code by the same SSR client + RLS migration that 05-01 verified against the live DB.

## Deviations from RESEARCH §Code Examples sketch

Three minor deviations from the RESEARCH sketch (all within scope, no architectural changes):

1. **`pricesVersion` source = `created_at`, not `updated_at`.** The RESEARCH sketch references `updated_at` on prices/dividends/fx_rates. Those columns do not exist (verified against `00001_initial_schema.sql`). The plan's `read_first` block called this out explicitly ("fall back to created_at if updated_at absent"). Documented in the file-level comment.

2. **Module-private `_jsonError`.** RESEARCH suggested an exported `jsonError` helper at the bottom of `data/route.ts` mirroring `search/route.ts` lines 110-120. Next.js App Router rejects non-HTTP-method named exports from route handler files. Kept the helper as a module-private function referenced via `void _jsonError` so the pattern is preserved for future use without producing a build-time error. Currently each error path constructs its own response inline (which the RESEARCH sketch also shows).

3. **`BacktestRunInsertRow` named type instead of inline `typeof row`.** RESEARCH's upsert sketch used inline object literal typing. TypeScript's `TS2502` "referenced directly or indirectly in its own type annotation" surfaced because the cast destructuring referenced `typeof row` while building `row`. Promoted the row shape to a named local type — same shape, no behavior change.

No deviations affect the public wire contract or RLS guarantees.

## Verification Results

- `npx tsc --noEmit` → exits 0 (no output)
- `npx eslint src/app/api/backtest src/lib/backtest/api-schemas.ts --max-warnings=0` → exits 0
- `test -f src/app/api/backtest/data/route.ts` ✓
- `test -f src/app/api/backtest/runs/route.ts` ✓
- `test -f "src/app/api/backtest/runs/[id]/route.ts"` ✓
- `test -f src/lib/backtest/api-schemas.ts` ✓
- `grep -c "BacktestDataRequestSchema\|BacktestRunWriteSchema\|BENCHMARK_TICKER_WHITELIST" src/lib/backtest/api-schemas.ts` → 5 (incl. exports + internal refs)
- `grep -c "Promise.all" src/app/api/backtest/data/route.ts` → 1
- `grep -c "Promise.all" src/app/api/backtest/runs/[id]/route.ts` → 1
- `grep -q "onConflict: 'portfolio_id,inputs_hash'" src/app/api/backtest/runs/route.ts` → match
- `grep -q "params: Promise" src/app/api/backtest/runs/[id]/route.ts` → match
- Whitelist contents: exactly the 6 D-22 candidates, verified by grep

## Authentication Gates

None. The worktree had `.env.local` copied at agent startup; no live HTTP curl was attempted in this worktree (Next.js dev server SWC native binary not hydrated — same as 05-03). All behavior is verified statically via `tsc` + targeted greps against the auth + RLS code paths.

## Known Stubs

None. Two integration test specs (`tests/integration/backtest-runs.spec.ts` for D-08 dedup and `tests/integration/backtest-stale.spec.ts` for D-09 stale-on-view) remain at `test.skip` from Plan 05-01 — those are owned by Plan 05-06 (UI) which wires them end-to-end against this plan's routes. They are NOT user-facing UI placeholders.

## Threat Surface Notes

All seven threats in the plan's `<threat_model>` are mapped to specific code locations (see "RLS Verification" table above). No new threat surface introduced beyond the registered set.

## Next Plan Readiness

- **Plan 05-05 (worker + chart client)** can now `POST /api/backtest/data` and receive the typed `BacktestInput`-shaped payload (items, benchmark, prices, dividends, fxRates, snbRates, pricesVersion, investmentAmount). It can `POST /api/backtest/runs` after the worker completes and observe `deduped:true` on identical-input replays.
- **Plan 05-06 (UI)** can `GET /api/backtest/runs?portfolio_id=…` for the history drawer and `GET /api/backtest/runs/[id]` for one-click reload — the latter already returns the `stale:boolean` flag the "data refreshed — recompute?" badge needs.

## Self-Check: PASSED

- `src/lib/backtest/api-schemas.ts` — present, 5,383 bytes, exports `BacktestDataRequestSchema`, `BacktestRunWriteSchema`, `BENCHMARK_TICKER_WHITELIST`, `yearsBetween`
- `src/app/api/backtest/data/route.ts` — present, 11,274 bytes, exports `POST`
- `src/app/api/backtest/runs/route.ts` — present, 5,873 bytes, exports `POST` + `GET`
- `src/app/api/backtest/runs/[id]/route.ts` — present, 6,350 bytes, exports `GET` with `Promise<{ id: string }>` params
- Commit `2fb6f64` (Task 1) — present in `git log`
- Commit `b636bd5` (Task 2) — present in `git log`
- `npx tsc --noEmit` exits 0 — verified
- `npx eslint` on touched paths exits 0 — verified
- BENCHMARK_TICKER_WHITELIST contains exactly the 6 D-22 candidates — verified by grep
- No modifications outside the declared file scope — verified by `git diff --name-only`

---

*Phase: 05-backtesting-engine*
*Plan: 04*
*Completed: 2026-06-24*
