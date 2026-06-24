---
phase: 05-backtesting-engine
plan: 03
subsystem: data-pipeline
tags: [snb, external-fetch, cron, supabase, sharpe-ratio, risk-free-rate]

requires:
  - phase: 05-backtesting-engine
    plan: 01
    provides: "snb_rates migration applied to live DB; vercel.json refresh-snb cron entry reserved; SnbRateRow type exported from src/lib/backtest/types"
  - phase: 03-market-data-pipeline
    provides: "DataError union, isDataError typeguard, cache-fx upsert pattern, refresh-prices cron pattern, seed-fx ESM isMain pattern"
provides:
  - "src/lib/data/snb.ts exports fetchSnbPolicyRate() (consumed by /api/cron/refresh-snb and the seed script)"
  - "src/lib/data/cache-snb.ts exports upsertSnbRates + getSnbRatesRange (consumed by Plan 05-04 batch-data endpoint)"
  - "/api/cron/refresh-snb GET endpoint (quarterly cron, Bearer CRON_SECRET-gated)"
  - "npm run seed:snb (one-shot bulk seed; live DB now holds 317 rows: 233 libor_mid + 84 LZ covering 2000-01 → 2026-05)"
affects:
  - "Plan 05-04 (batch-data endpoint) can now call getSnbRatesRange() and assume snb_rates is populated"
  - "Plan 05-02 (worker simulate+metrics) Sharpe path has the live CHF risk-free curve available end-to-end"

tech-stack:
  added: []
  patterns:
    - "External fetcher with Content-Type-aware parse (JSON.parse via text() to defeat data.snb.ch's mislabeled text/html responses)"
    - "Regime-stitch fetcher pattern (UG0/OG0 midpoint pre-cutover + LZ post-cutover, both decimalized at fetch boundary)"
    - "Service-role cron handler mirror of refresh-prices/route.ts (CRON_SECRET Bearer auth, no user session)"

key-files:
  created:
    - src/lib/data/snb.ts
    - src/lib/data/cache-snb.ts
    - src/app/api/cron/refresh-snb/route.ts
    - src/scripts/seed-snb.ts
  modified:
    - src/lib/data/snb.test.ts (todos -> 9 real assertions)
    - package.json (added seed:snb npm script)

key-decisions:
  - "Match the live snboffzisa cube header labels via .includes('Lower') / .includes('Upper') instead of literal UG0/OG0 codes — the live API returns human-readable strings, not the cube codes (Rule 1 fix; test fixture still uses the codes so the matcher accepts either form)"
  - "Cron route returns 503 for transient DataErrors, 429 for rate_limit, 404 for not_found — same status-mapping shape used in refresh-prices/route.ts"
  - "Seed script is library-shaped (export runSeed + ESM isMain guard) so a future integration test can call runSeed(mockClient) without spawning a subprocess"

patterns-established:
  - "External JSON via JSON.parse(await response.text()) when upstream lies about Content-Type"
  - "Header dimItem matcher accepts either literal cube code OR human-readable label fragment — bridges test fixtures and live API"
  - "Cron-route status mapper: rate_limit→429, not_found→404, else 503 (transient) or 401 (auth fail)"

requirements-completed: [BACK-06]

duration: ~12 minutes
completed: 2026-06-24
---

# Phase 5 Plan 03: SNB Policy-Rate Data Path Summary

**Stitching SNB fetcher (UG0/OG0 midpoint pre-2019-06 + LZ post-2019-06), Supabase cache wrapper, quarterly cron route, and one-shot seed — 317 rows now live in `snb_rates`.**

## Performance

- **Duration:** ~12 minutes (executor time)
- **Started:** 2026-06-24T11:14:00Z (approx)
- **Completed:** 2026-06-24T09:23:53Z (executor commit)
- **Tasks:** 2/2
- **Files created:** 4
- **Files modified:** 2

## Accomplishments

- 9 vitest cases land on previously-skipped `src/lib/data/snb.test.ts` stubs (stitch midpoint, LZ post-cutover, sorted output, JSON-parse path, decimal conversion, missing-side drop, cutover boundary, 5xx → transient, 4xx → not_found, network error → transient).
- `fetchSnbPolicyRate()` shipped — fetches both LZ (`fromDate=2019-06`) and UG0/OG0 (`fromDate=2000-01`), stitches into one ascending `SnbPoint[]`, decimalizes percent values at the fetch boundary.
- `cache-snb.ts` mirrors `cache-fx.ts` line-for-line: BATCH_SIZE=500 upsert on `date_month`, `getSnbRatesRange()` for the Plan 05-04 batch endpoint with defensive NUMERIC→number coercion via the local `toNum()` helper.
- `/api/cron/refresh-snb` GET handler shipped — CRON_SECRET Bearer auth, service-role client, returns `{ ok, upserted, source_counts: { LZ, libor_mid } }`.
- `src/scripts/seed-snb.ts` ran live against the production Supabase DB. End state: **317 rows** in `snb_rates` — 233 `libor_mid` + 84 `LZ` — matching RESEARCH §Pitfall 1's predicted ~316 (233 + 83).

## Task Commits

1. **Task 1: snb.ts fetcher + cache-snb upsert/read + 9 vitest cases** — `16a4e98` (feat)
2. **Task 2: cron route + seed script + npm script wiring (+ Rule 1 fix to snb.ts header matcher)** — `5553dbd` (feat)

**Plan metadata commit:** _(to follow after self-check)_

## Files Created/Modified

- `src/lib/data/snb.ts` — external fetcher + stitcher (LZ + libor_mid). `JSON.parse(await response.text())` per Pitfall 2. Decimal conversion at boundary.
- `src/lib/data/cache-snb.ts` — `upsertSnbRates` (batched 500/upsert on `date_month`) + `getSnbRatesRange` (ascending, NUMERIC-coerced).
- `src/lib/data/snb.test.ts` — 9 vitest cases replacing 3 `it.todo` stubs from Plan 05-01.
- `src/app/api/cron/refresh-snb/route.ts` — quarterly cron handler. Mirrors `refresh-prices/route.ts` auth (lines 30-35) + service-role client (lines 52-60).
- `src/scripts/seed-snb.ts` — one-shot bulk seed. ESM `isMain` guard, idempotent via upsert.
- `package.json` — added `"seed:snb": "node --env-file=.env.local --import tsx src/scripts/seed-snb.ts"`.

## Decisions Made

- **Header-label matcher accepts either form.** The live snboffzisa cube returns header `dimItem` strings like `"Switzerland - SNB target range for the 3-month Libor rate in CHF - Lower limit"`, NOT the literal `UG0`/`OG0` cube codes that the test fixture uses. To keep both the fixture and the live API working, the matcher accepts either `h.dimItem === 'UG0'` OR `h.dimItem.includes('Lower')` (and symmetrically for upper). This is the same shape RESEARCH §Pattern 4 used (`.find(ts => ts.header[0].dimItem.includes('Lower'))`).
- **Cron status mapping.** `kind === 'rate_limit'` → 429; `kind === 'not_found'` → 404; otherwise (`'transient'`, `'invalid_input'`) → 503. Auth failure short-circuits to 401 before any other work.
- **Seed script returns library entry point.** `runSeed(supabase)` is exported separately from `main()`; the ESM `isMain` guard checks `process.argv[1]` endswith `seed-snb.{ts,js}` (matches `seed-fx.ts` line 84-88 pattern).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Live snboffzisa cube uses human-readable header labels, not literal UG0/OG0 codes**

- **Found during:** Task 2 first `npm run seed:snb` against the live DB.
- **Issue:** Initial implementation matched `h.dimItem === 'UG0'` / `=== 'OG0'`. All vitest cases passed (the offline fixture uses the literal codes per Plan 05-01 capture), but the first live run returned `Stitched 84 rows (0 libor_mid + 84 LZ)` — every pre-2019-06 row was silently dropped because the live API returns `dimItem` strings like `"Switzerland - SNB target range for the 3-month Libor rate in CHF - Lower limit"`. Without the fix, any backtest starting before 2019-06 would have had a zero-row libor_mid stitch.
- **Fix:** Replaced the literal equality checks with predicates that accept EITHER the literal cube code OR a substring match on `'Lower'` / `'Upper'`. The test fixture continues to use `UG0`/`OG0` (still passes); the live API now also matches.
- **Files modified:** `src/lib/data/snb.ts` (~10 lines around the libor_mid block).
- **Verification:** Re-ran `npm run seed:snb` — output `Stitched 317 rows (233 libor_mid + 84 LZ)`. Re-queried live DB via service-role: `count=317 LZ=84 libor_mid=233`. All 9 vitest cases still pass.
- **Committed in:** `5553dbd` (folded into the Task 2 commit because the Task 2 smoke test was what surfaced the bug; commit message documents the deviation).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug).
**Impact on plan:** Critical for correctness. Without the fix, the success criterion "snb_rates table populated with full historical series" would have been met in row-count but not in coverage (only 2019-06 onward). All deviations stay within the declared file scope.

## Issues Encountered

- **Cron-route 401 / live-curl verification skipped.** `npm run dev` failed to start in this worktree because the Next.js 16.2.2 SWC native binary is not hydrated under `node_modules/next/next-swc-fallback/@next/swc-darwin-arm64/next-swc.darwin-arm64.node` (worktree environment limitation, not a code issue — the parallel 05-02 worktree may have the same constraint). The route handler nonetheless verifies as correct by:
  1. `npx tsc --noEmit` clean (all types resolve, all imports valid).
  2. The 401 / service-role / status-mapping code mirrors `refresh-prices/route.ts` line-for-line (lines 30-35 auth, 52-60 service client) — a pattern that was verified live in Phase 3.
  3. The downstream calls (`fetchSnbPolicyRate`, `upsertSnbRates`) were end-to-end verified by the live seed-snb run that wrote 317 rows.

  The 401 / Bearer-token check is unambiguous in the code (`if (!cronSecret || authHeader !== \`Bearer ${cronSecret}\`)`) so the optional live-curl gate is documented here for an out-of-worktree verifier rather than blocking the plan.

## Threat Surface Scan

Plan declared three mitigations in `<threat_model>` (T-5-03-SPOOF, T-5-03-CTYPE, T-5-03-INJ). All three were implemented:

| Threat | Mitigation | Where |
|--------|------------|-------|
| T-5-03-SPOOF (cron spoofing) | Bearer CRON_SECRET check, 401 on mismatch | `src/app/api/cron/refresh-snb/route.ts` lines 33-37 |
| T-5-03-CTYPE (tampering via Content-Type quirk) | `JSON.parse(await response.text())` everywhere; tested via `vi.spyOn(Response.prototype, 'json')` asserting never called | `src/lib/data/snb.ts` line 82, `src/lib/data/snb.test.ts` "parses JSON via text() despite text/html Content-Type" |
| T-5-03-INJ (downstream Sharpe math tampering) | NUMERIC(8,6) column constraint (migration 00010) + decimalization at fetch boundary (`/ 100`) | `src/lib/data/snb.ts` lines 116, 127 |

No new threat surface introduced beyond what the plan registered.

## Known Stubs

None. All in-scope `it.todo` reservations under `src/lib/data/snb.test.ts` have been replaced with real assertions. Out-of-scope `it.todo` stubs in `src/lib/backtest/*.test.ts` (simulate, metrics, etc.) are owned by Plan 05-02 and untouched here.

## Verification Results

- `npx vitest run src/lib/data/snb.test.ts --reporter=basic` — 1 file, 9 tests, all passed (21ms).
- `npx tsc --noEmit` — exits 0 (no output).
- `grep -c "JSON.parse(await" src/lib/data/snb.ts` — 2 occurrences (Pitfall 2 mitigation).
- `grep -c "\.json()" src/lib/data/snb.ts` — 0 occurrences.
- `grep -c "onConflict: 'date_month'" src/lib/data/cache-snb.ts` — 1.
- `grep -c "CRON_SECRET" src/app/api/cron/refresh-snb/route.ts` — 4.
- `grep -c "SUPABASE_SERVICE_ROLE_KEY" src/app/api/cron/refresh-snb/route.ts` — 1.
- `grep "seed:snb" package.json` — present with the exact `node --env-file=.env.local --import tsx ...` invocation pattern.
- `npm run seed:snb` (live, against production Supabase) — `Stitched 317 rows (233 libor_mid + 84 LZ)` / `Upserted 317 snb_rates rows`.
- Live DB row count check via service-role client — `count=317 LZ=84 libor_mid=233`.

## User Setup Required

None. The cron is configured in `vercel.json` (added in Plan 05-01); the only deploy-time env var is `CRON_SECRET`, which was set up for the existing refresh-prices crons (Phase 3) and is reused here.

## Next Phase Readiness

- Plan 05-04 (batch-data endpoint) can now call `getSnbRatesRange(supabase, { from, to })` with confidence — table is populated 2000-01 → 2026-05 and the read function returns `SnbRateRow[]` with NUMERIC properly coerced to `number`.
- Plan 05-02 (worker simulate + metrics) Sharpe-with-SNB code path has the live CHF risk-free curve available end-to-end; metrics tests can use the seeded data instead of mocks.
- Quarterly cron (`vercel.json` entry from 05-01) is now backed by a working route handler — first scheduled invocation on the next quarterly boundary will top-up any new monthly publications.

## Self-Check: PASSED

- `src/lib/data/snb.ts` — present
- `src/lib/data/cache-snb.ts` — present
- `src/lib/data/snb.test.ts` — present (9 real assertions, all passing)
- `src/app/api/cron/refresh-snb/route.ts` — present
- `src/scripts/seed-snb.ts` — present
- `package.json` contains `"seed:snb"` — confirmed
- Commit `16a4e98` (Task 1) — present in `git log`
- Commit `5553dbd` (Task 2) — present in `git log`
- Live DB `snb_rates` row count = 317 (233 libor_mid + 84 LZ) — verified via service-role query

---

*Phase: 05-backtesting-engine*
*Plan: 03*
*Completed: 2026-06-24*
