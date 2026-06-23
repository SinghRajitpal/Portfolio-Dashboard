---
phase: 5
slug: backtesting-engine
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Sourced from `05-RESEARCH.md §Validation Architecture` (lines 842-901). Per-task `Automated Command` columns mirror the `<automated>` blocks inside each PLAN.md task.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^2.1.9` (pure libs) + Playwright `@playwright/test ^1.59.1` (E2E + integration, chromium-only) |
| **Config files** | `vitest.config.mts`, `playwright.config.ts` (both already present in repo) |
| **Quick run command** | `npm run test:unit -- src/lib/backtest/` |
| **Full suite command** | `npm test && npx playwright test --project=chromium` |
| **Estimated runtime** | Unit ~5s · Integration ~30s · Playwright (6 specs, chromium) ~60-90s · **Total full suite ~2 minutes** |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit -- src/lib/backtest/` (pure libs sub-2s) and, if the task touched a `tests/integration/*` spec, also `npx playwright test {that-spec} --project=chromium`
- **After every wave merge:** Run `npm test` (unit + integration)
- **Before `/gsd:verify-work`:** `npm test && npx playwright test --project=chromium` — full suite must be green
- **Max feedback latency:** ~120 seconds (full suite); ~5s for the quick command after a typical pure-lib task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | — | T-5-01-SC | Human verifies `lightweight-charts` legitimacy on npm before install | manual checkpoint | `<human-check>` | N/A | ⬜ pending |
| 5-01-02 | 01 | 1 | BACK-01..08 | T-5-01-DB, T-5-01-RLS, T-5-01-SHARED | RLS policies on `backtest_runs` + `snb_rates`; cron secret on /api/cron/refresh-snb | integration (script) | `npm view lightweight-charts version \| grep -q "^5\\." && grep -q "lightweight-charts" package.json && test -f supabase/migrations/00009_backtest_runs.sql && test -f supabase/migrations/00010_snb_rates.sql && grep -q "CREATE TABLE public.backtest_runs" supabase/migrations/00009_backtest_runs.sql && grep -q "CREATE TABLE public.snb_rates" supabase/migrations/00010_snb_rates.sql && grep -q "refresh-snb" vercel.json` | ✅ (will create) | ⬜ pending |
| 5-01-03 | 01 | 1 | BACK-01..08 | — | Wave 0 test scaffolding so downstream `<automated>` blocks resolve | scaffolding | `test -f src/lib/backtest/types.ts && grep -q "export type BacktestInput" src/lib/backtest/types.ts && npx vitest run src/lib/backtest/ --reporter=basic && npx playwright test tests/integration/backtest-happy.spec.ts --list \| grep -q "BACK-01"` | ❌ W0 (this task creates) | ⬜ pending |
| 5-01-04 | 01 | 1 | BACK-01, BACK-07 | — | Benchmark-seed-check (RESOLVED Q1) — `instruments.first_date` audit for URTH.US, SWDA.LSE, SSAC.SW, SPY.US, CSSMI.SW; seed any with <10y history via Phase 3 yahoo-provider | integration (script) | `psql "$DATABASE_URL" -tAc "SELECT count(*) FROM instruments WHERE ticker IN ('URTH.US','SWDA.LSE','SSAC.SW','SPY.US','CSSMI.SW') AND first_date <= (now() - interval '10 years')::date" \| grep -q "^[3-9]\\\|^[0-9][0-9]"` | ❌ W0 (this task adds) | ⬜ pending |
| 5-02-01 | 02 | 2 | BACK-02 indirectly | T-5-02-HASH | date-grid/forward-fill/hashInputs deterministic + worker-safe (no `next/`, `react`, `@supabase/` imports) | unit (TDD) | `npx vitest run src/lib/backtest/date-grid.test.ts src/lib/backtest/forward-fill.test.ts src/lib/backtest/inputs-hash.test.ts --reporter=basic` | ❌ W0 → created Plan 01 Task 3 | ⬜ pending |
| 5-02-02 | 02 | 2 | BACK-02, BACK-03, BACK-04, BACK-06 | T-5-02-DOS, T-5-02-NAN, T-5-02-FX | simulate() guards no_overlap, FX lookback ≤4 days, Sharpe stdev=0 → 0; computeMetrics returns all 5 metrics with SNB-based Sharpe | unit (TDD) + golden | `npx vitest run src/lib/backtest/metrics.test.ts src/lib/backtest/simulate.test.ts src/lib/backtest/simulate.golden.test.ts --reporter=basic` | ❌ W0 → created Plan 01 Task 3 | ⬜ pending |
| 5-03-01 | 03 | 2 | BACK-06 | T-5-03-CRON (CRON_SECRET), T-5-03-XSS (text/html parse) | SNB fetch + stitch; `JSON.parse(await res.text())`; cron route 401 without CRON_SECRET | unit + integration | `npx vitest run src/lib/data/snb.test.ts --reporter=basic` | ❌ W0 → created Plan 01 Task 3 | ⬜ pending |
| 5-04-01 | 04 | 3 | BACK-01, BACK-02, BACK-05, BACK-07 | T-5-04-AUTH (401), T-5-04-IDOR (RLS), T-5-04-DOS (range cap) | Zod validation on `/api/backtest/data` (UUID portfolio_id, ISO dates, end-start ≤25y, benchmark in BENCHMARK_TICKER_WHITELIST); RLS-scoped via SSR client | integration | `npx playwright test tests/integration/backtest-runs.spec.ts --project=chromium --reporter=line` | ❌ W0 → created Plan 01 Task 3 | ⬜ pending |
| 5-05-01 | 05 | 3 | BACK-05, BACK-08 | T-5-05-WORKER (static imports only) | Worker imports only from `@/lib/backtest/*`; chart components client-only (no SSR) | build + manual | `npm run build` exits 0; manual: worker URL resolves in prod bundle | N/A (no test file) | ⬜ pending |
| 5-06-01 | 06 | 4 | BACK-01..08 | T-5-06-IDOR-UI | `listPortfoliosForBacktest` + `loadBenchmarkInstruments` RLS-scoped; benchmark dropdown sourced from D-22 whitelist; `instruments[].first_date` included in payload for `earliestAllowedStart` UI helper | type-check + manual | `npx tsc --noEmit` exits 0; manual: empty-state CTA shows for new user | N/A | ⬜ pending |
| 5-06-02 | 06 | 4 | BACK-01, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, BACK-08 | T-5-06-XSS, T-5-06-STALE, T-5-06-WORKER-FAIL | BacktestClient state-machine (idle/fetching/running/done/error); heavy-vs-cheap param split (heavy=fetch+rerun, cheap=worker rerun only); error toast on worker reject | type-check + lint + manual | `npx tsc --noEmit && npm run lint` | N/A | ⬜ pending |
| 5-06-03 | 06 | 4 | BACK-01 (D-05, D-09) | T-5-06-STALE | Run history drawer RLS-scoped; stale badge appears when `prices_version < current` | type-check + lint + manual | `npx tsc --noEmit && npm run lint` | N/A | ⬜ pending |
| 5-07-01 | 07 | 5 | BACK-01, BACK-05, BACK-07, BACK-08 | T-5-07-FLAKE, T-5-07-CRON-PRIV, T-5-07-DATA-MUTATE | 6 Playwright specs assert canvas + selector visibility (no pixel-diff); CRON_SECRET test-env-only; stale spec uses direct DB mutation against seeded test user (RLS-isolated) | E2E (Playwright) | `npx playwright test tests/integration/backtest-happy.spec.ts tests/integration/backtest-chart.spec.ts tests/integration/backtest-benchmark.spec.ts tests/integration/backtest-annual-bars.spec.ts tests/integration/backtest-runs.spec.ts tests/integration/backtest-stale.spec.ts --project=chromium --reporter=line` | ❌ W0 → created Plan 01 Task 3 | ⬜ pending |
| 5-07-02 | 07 | 5 | BACK-01..08 (D-01..D-09) | — | Manual UX walkthrough — 11 numbered observations against live `/dashboard/backtest` | manual checkpoint | `<human-check>` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 scaffolding is created by **Plan 01 Task 3** (stub files) and **Plan 01 Task 4** (benchmark seed audit). Every `<automated>` block in Plans 02-07 references one of the files below.

Stub test files (vitest, with `it.todo` reservations):
- [ ] `src/lib/backtest/simulate.test.ts`
- [ ] `src/lib/backtest/metrics.test.ts`
- [ ] `src/lib/backtest/forward-fill.test.ts`
- [ ] `src/lib/backtest/inputs-hash.test.ts`
- [ ] `src/lib/backtest/date-grid.test.ts`
- [ ] `src/lib/backtest/simulate.golden.test.ts`
- [ ] `src/lib/data/snb.test.ts`

Stub integration specs (Playwright, with `test.skip` reservations):
- [ ] `tests/integration/backtest-happy.spec.ts`
- [ ] `tests/integration/backtest-chart.spec.ts`
- [ ] `tests/integration/backtest-benchmark.spec.ts`
- [ ] `tests/integration/backtest-annual-bars.spec.ts`
- [ ] `tests/integration/backtest-runs.spec.ts`
- [ ] `tests/integration/backtest-stale.spec.ts`

Type contract + offline fixtures:
- [ ] `src/lib/backtest/types.ts` — shared type contracts (blocks all downstream imports)
- [ ] `src/lib/backtest/errors.ts` — `BacktestError` discriminated union + `isBacktestError` guard
- [ ] `tests/fixtures/snb/snboffzisa-snapshot.json` — last-known-good SNB API response (offline tests)
- [ ] `tests/fixtures/backtest/golden-portfolio.json` — synthetic 3-instrument hand-computed expected curve

Benchmark history audit (RESOLVED Open Question 1):
- [ ] Plan 01 Task 4: query `instruments.first_date` for URTH.US / SWDA.LSE / SSAC.SW / SPY.US / CSSMI.SW; seed any with <10y history before `/dashboard/backtest` ships

Framework installation: not required — Vitest `^2.1.9` and Playwright `^1.59.1` already in `package.json`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Package legitimacy — `lightweight-charts` on npm registry | T-5-01-SC | Human judgment on repo-URL match, license, deprecation status — slopcheck not run for this phase | Plan 01 Task 1 `<how-to-verify>` — 7 npmjs.com confirmations + `npm view lightweight-charts deprecated` |
| Worker URL resolves in Vercel production bundle | BACK-01 (D-02) | Per RESEARCH Pitfall 10, Worker file path resolution is build-environment-specific; only a real `npm run build` + production runtime exercises it | Plan 05 manual: `npm run build` exits 0 + smoke-test `/dashboard/backtest` against a Vercel preview deploy |
| Full Phase 5 UX walkthrough (D-02 perceived responsiveness, D-04 section order, D-17 disclosure, D-09 stale-on-view, history drawer) | BACK-01..08 + D-01..D-09 | Automated tests assert presence; only a human can judge "calculator feel" perceived latency on cheap-param toggles and the honesty of the warning footer | Plan 07 Task 2 `<how-to-verify>` — 11 numbered observations in the live `/dashboard/backtest` flow |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicitly marked `manual checkpoint` (Plan 01 Task 1, Plan 07 Task 2, Plan 05 build verification)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every wave includes at least one vitest or Playwright command)
- [x] Wave 0 covers all MISSING references (Plan 01 Task 3 stubs every file referenced by Plans 02-07; Plan 01 Task 4 seeds benchmark history)
- [x] No watch-mode flags (all commands use `vitest run` and `playwright test`, not `vitest`/`vitest watch`)
- [x] Feedback latency: quick command <5s; full suite ~2min
- [x] `nyquist_compliant: true` set in frontmatter
- [ ] `wave_0_complete: true` — flip to `true` after Plan 01 Wave 0 executes

**Approval:** pending (auto-approves when Wave 0 completes and full suite green)
