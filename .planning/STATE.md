---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: "Completed 03-10 (all tasks) — Phase 3 fully complete. Next: Phase 4 Portfolio Builder"
last_updated: "2026-05-04T16:44:19.744Z"
last_activity: "2026-05-04 — Completed 03-10: Vercel cron triggers verified (US 7/7, SW 4/5, LSE 1/2), 401 regression confirmed, 3 deploy fixes landed"
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 16
  completed_plans: 16
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Before you invest real money, you can see — with real historical data, in your own currency — exactly what would have happened and what might happen next.
**Current focus:** Phase 3 — Market Data Pipeline

## Current Position

Phase: 3 of 7 COMPLETE (Market Data Pipeline)
Plan: 10 of 10 in Phase 3 (Plan 10 complete — live re-seed + smoke 5/5 + Vercel cron verified)
Status: Phase 3 complete — all 10 plans done; DATA-01 and DATA-05 closed
Last activity: 2026-05-04 — Completed 03-10: Vercel cron triggers verified (US 7/7, SW 4/5, LSE 1/2), 401 regression confirmed, 3 deploy fixes landed

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-foundation P01 | 5 | 2 tasks | 13 files |
| Phase 01-foundation P01 | 2min | 3 tasks | 13 files |
| Phase 01-foundation P01 | 15min | 3 tasks | 14 files |
| Phase 01-foundation P02 | 3min | 2 tasks | 11 files |
| Phase 02-app-shell-design-system P01 | 14min | 3 tasks | 10 files |
| Phase 02-app-shell-design-system P02 | 5min | 2 tasks | 3 files |
| Phase 02-app-shell-design-system P03 | 3min | 2 tasks | 8 files |
| Phase 03-market-data-pipeline P01 | 7min | 3 tasks | 17 files |
| Phase 03-market-data-pipeline P02 | 5min | 3 tasks | 7 files |
| Phase 03-market-data-pipeline P03 | 15 | 3 tasks | 8 files |
| Phase 03-market-data-pipeline P04 | 8min | 4 tasks | 10 files |
| Phase 03-market-data-pipeline P05 | 7min | 3 tasks | 7 files |
| Phase 03-market-data-pipeline PP06 | 6min | 3 tasks | 9 files |
| Phase 03-market-data-pipeline P07 | 5min | 2 tasks | 6 files |
| Phase 03-market-data-pipeline P08 | 25min | 3 tasks | 7 files |
| Phase 03-market-data-pipeline P09 | 7min | 2 tasks | 6 files |
| Phase 03-market-data-pipeline P10 | 90min | 3 tasks | 2 files |

## Accumulated Context

### Decisions

- ~~Data source: EODHD free tier (20 req/day) as primary for v1~~ **REVERSED 2026-05-02** — EODHD free tier silently truncates EOD history to ~12 months regardless of `from` parameter, breaking DATA-01 (full history per ticker). Pivoting in Phase 3.1 to Stooq (one-time bulk historical import) + yahoo-finance2 (daily incremental). Both free, both cover US + Swiss SIX + LSE (Yahoo needs `.LSE` → `.L` symbol mapping). EODHDProvider code stays as a reference; consumers swap to YahooProvider behind the IMarketDataProvider seam from 03-02.
- ~~yahoo-finance2 dropped from the pipeline — single source of truth per ticker. EODHD-only, no fallback chain.~~ **REVERSED 2026-05-02** — new shape is two providers (Stooq archive + yahoo incremental) normalized through the Postgres cache; cache layer remains the single source of truth at consumption time.
- FX rates: Frankfurter API (free, ECB-sourced, no key required)
- ISIN resolution: OpenFIGI (free, Bloomberg-backed)
- Computation: All backtest and Monte Carlo runs in browser Web Workers via comlink — never in Vercel serverless functions
- Stack: Next.js 16 + TypeScript + Supabase (Postgres + Auth) + Vercel
- Supabase connection: Always Supavisor pooler port 6543, never direct port 5432
- Charting: Recharts for dashboards, lightweight-charts for financial time-series
- UI component library: shadcn/ui configured in Phase 2 with project theme before any feature UI is built
- [Phase 01-foundation]: Supabase server.ts createClient is async — required by Next.js 15+ cookies() Promise API
- [Phase 01-foundation]: RLS uses (SELECT auth.uid()) subselect — caches per statement for performance vs raw auth.uid()
- [Phase 01-foundation]: Migration named 00001_initial_schema.sql (not timestamped) — deterministic ordering for Phase 1 bootstrap
- [Phase 01-foundation]: Task 3 automated parts (env files) were completed in Task 1; user handles Supabase cloud dashboard steps manually
- [Phase 01-foundation]: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY used (not ANON_KEY) — matches existing code in client.ts/server.ts
- [Phase 01-foundation]: .env.example tracked in git via !.env.example exception in .gitignore — enables developer onboarding
- [Phase 01-foundation]: Next.js 16 renames middleware.ts to proxy.ts — must use src/proxy.ts and export proxy() function, not middleware()
- [Phase 01-foundation]: base-ui Button does not support asChild prop — use buttonVariants() with <Link> for link-styled buttons
- [Phase 01-foundation P03]: Production URL is https://portfolioforge-green.vercel.app — all future phases deploy here
- [Phase 01-foundation P03]: buttonVariants() cannot be used in Next.js server components — inline styles instead
- [Phase 01-foundation P03]: Playwright uses chromium only (no firefox/webkit) for speed in local/CI runs
- [Phase 02-app-shell-design-system]: next-themes installed with --legacy-peer-deps for React 19.2.x compatibility
- [Phase 02-app-shell-design-system]: ThemeProvider uses attribute='class' to match existing @custom-variant dark declaration
- [Phase 02-app-shell-design-system]: sidebar-* CSS variables removed from globals.css as dead scaffold code
- [Phase 02-app-shell-design-system]: buttonVariants() applied directly to DropdownMenuTrigger — wrapping Button inside trigger creates nested buttons (invalid HTML); MenuPrimitive.Trigger renders its own button element
- [Phase 02-app-shell-design-system]: AccountMenu aria-label set to 'Your account' to avoid regex conflict with hamburger 'Open menu' in UI-04 Playwright test
- [Phase 02-app-shell-design-system]: Dashboard page simplified to pure Server Component by removing Supabase getUser() — auth enforced by middleware, skeleton layout has no user-specific data
- [Phase 02-app-shell-design-system]: SummaryCards use plain divs (not Card component) to enforce borderless whitespace-separated design matching Swiss minimalist aesthetic
- [Phase 03-market-data-pipeline]: vitest.config.mts (ESM extension) required — vite-tsconfig-paths v6 is ESM-only and vitest v2 uses CJS for .ts config loading
- [Phase 03-market-data-pipeline]: Probe route named 'probe' not '_probe' — Next.js 16 treats underscore-prefixed folders as private, excluded from routing
- [Phase 03-market-data-pipeline]: vitest pinned to ^2 (not ^4) — vitest 4.x requires node >=20.19.0 via rolldown dependency; machine runs 20.16.0
- [Phase 03-market-data-pipeline]: isDataError validates kind against Set allowlist (not just presence) — guards against EODHD response shape collisions
- [Phase 03-market-data-pipeline]: Gap tracking uses first_date/last_date columns on instruments (added Plan 04), not sibling instrument_gaps table
- [Phase 03-market-data-pipeline]: isin_lookups composite PK (isin, ticker, exchange) preserves all venue listings for multi-venue UCITS ETFs; no TTL for v1
- [Phase 03-market-data-pipeline]: mock-fetch passThrough option added — integration tests mix real Supabase REST calls with mocked Frankfurter API; without passThrough the mock intercepts all fetch calls including Supabase
- [Phase 03-market-data-pipeline]: seed-fx.ts main() guarded by isMain (process.argv check) — ESM equivalent of require.main === module; prevents CLI side-effects when runSeed imported by tests
- [Phase 03-market-data-pipeline]: errors.ts created in plan 03 (not 02) — plan 02 IMarketDataProvider was not yet complete; errors.ts is self-contained and needed by frankfurter.ts
- [Phase 03-market-data-pipeline]: eodhd SDK exports EODHDClient (not API); SDK retry disabled (maxRetries: 0) so withRetry has exclusive control; constructor injection used for test isolation
- [Phase 03-market-data-pipeline]: serverExternalPackages is top-level in Next.js 15+ (not under experimental); withRetry default maxAttempts: 4 (1 initial + 3 retries with 1s/2s/4s delays)
- [Phase 03-market-data-pipeline]: getDividends failure is non-fatal in getPricesForTicker — instruments with no dividends still ingest correctly; first_date presence determines cache-hit detection
- [Phase 03-market-data-pipeline]: OPENFIGI_BASE_URL env override added to openfigi.ts for mock server injection in integration tests
- [Phase 03-market-data-pipeline]: Proxy does not protect /api routes — proxy.ts only redirects /dashboard; API routes rely on RLS; architectural gap documented and deferred
- [Phase 03-market-data-pipeline]: exchCode stored as-is from OpenFIGI (SW=SW matches EODHD, GS=XETRA mismatch documented, mapper deferred to Phase 4)
- [Phase 03-market-data-pipeline]: URL constructor used for searchParams in cron route — request.nextUrl is undefined when GET called directly in vitest without Next.js runtime; URL(request.url).searchParams works in both contexts
- [Phase 03-market-data-pipeline]: CRON_SECRET Bearer auth protects /api/cron/refresh-prices; proxy.ts api/cron exclusion proved by Test 1 (401 not 302 on no-auth request)
- [Phase 03-market-data-pipeline P06]: EODHD free tier silently truncates EOD history to ~12 months — confirmed against SPY.US (250 rows starting 2025-05-05 despite from=1970-01-01). DATA-01 not delivered; pivoting to Stooq + yahoo-finance2 in Phase 3.1.
- [Phase 03-market-data-pipeline P06]: Yahoo `range=max&interval=1d` silently downsamples to monthly — full daily history requires explicit period1/period2 epoch seconds, possibly chunked.
- [Phase 03-market-data-pipeline P06]: Yahoo LSE symbols use `.L` suffix not `.LSE`; Swiss `.SW` works unchanged. Symbol mapper required when swapping to YahooProvider.
- [Phase 03-market-data-pipeline P06]: Supabase docs `[YOUR-PASSWORD]` placeholder syntax can leak into env files — strip `[` and `]` from DATABASE_URL and SUPABASE_DB_PASSWORD before use.
- [Phase 03-market-data-pipeline P06]: tsx CLI does not auto-load .env.local — `node --env-file=.env.local --import tsx <script>` is the working invocation; package.json seed scripts updated accordingly.
- [Phase 03-market-data-pipeline]: yahoo-finance2 v3 (not v2) required — v2 ESM build lacks chart() module needed for daily OHLCV history
- [Phase 03-market-data-pipeline]: YahooProvider uses period1/period2 epoch seconds in all chart() calls, never range=max — confirmed safe from monthly downsampling
- [Phase 03-market-data-pipeline]: Types imported from yahoo-finance2/modules/chart subpath — main index does not re-export ChartResultArray/ChartEventDividend
- [Phase 03-market-data-pipeline]: Stooq NOT wrapped behind IMarketDataProvider — CSV archive path is fundamentally different from interactive incremental providers; toStooqSymbol+parseStooqCsv+fetchStooqDailyCsv are pure functions in stooq.ts
- [Phase 03-market-data-pipeline]: fetchStooqDailyCsv detects apikey-gate on HTTP 200 response body — Stooq returns gate message as 200 (not 401/403); body inspection mandatory to prevent gate text leaking as malformed CSV
- [Phase 03-market-data-pipeline]: STOOQ_API_KEY confirmed working via live curl spot-check — CSV header returned (not gate page); 32-char key stored server-only in .env.local, no NEXT_PUBLIC_ prefix
- [Phase 03-market-data-pipeline]: fetchStooqDailyCsv detects apikey-gate on HTTP 200 response body — Stooq returns gate message as 200 not 401/403; body inspection mandatory to prevent gate text leaking as malformed CSV
- [Phase 03-market-data-pipeline]: parseStooqCsv sets adjusted_close=close for every row — Stooq prices are split-and-dividend adjusted by default; Phase 5 backtester requires adjusted_close non-null
- [Phase 03-market-data-pipeline]: SSAC.SW ISIN confirmed as IE00B6R52259 — iShares MSCI ACWI UCITS ETF (Acc) CHF on SIX; replaces IQQA.SW which returned EODHD 404
- [Phase 03-market-data-pipeline]: seed-instruments.ts prices mode is a no-op from Plan 09 — Stooq owns historical bulk seeding via seed:stooq
- [Phase 03-market-data-pipeline]: Cron route per-ticker YahooProvider.getEod loop replaces EODHD bulkEod; 250ms inter-ticker throttle; LSE added to ALLOWED_EXCHANGES
- [Phase 03-market-data-pipeline]: SPY seeded from Yahoo not Stooq — Stooq backward-adjusts cumulative dividends; Yahoo nominal close matches public reference exactly (2020-03-16: .85)
- [Phase 03-market-data-pipeline]: Swiss SIX tickers (CSSPX/500E/CHDVD/SSAC/NOVN) use Yahoo not Stooq — Stooq returns empty CSV for all Swiss tickers; Yahoo covers full SIX history
- [Phase 03-market-data-pipeline P10]: Per-ticker skips (VWRL.LSE on UK bank holiday, 500E.SW inconsistent Yahoo .SW surface) are data-availability gaps, not code bugs — cron best-effort design (errors→skipped[]) confirmed working as specified
- [Phase 03-market-data-pipeline P10]: YahooProvider period2 must be period1+86400 when from===to — Yahoo chart API treats period2 as exclusive; single-day requests (daily cron "today" calls) returned no bars without this fix
- [Phase 03-market-data-pipeline]: Per-ticker cron skips (VWRL.LSE on UK bank holiday, 500E.SW inconsistent Yahoo .SW) are data-availability gaps not code bugs — cron best-effort design confirmed working
- [Phase 03-market-data-pipeline]: YahooProvider period2 must be period1+86400 when from===to — Yahoo chart API treats period2 as exclusive; single-day cron requests returned no bars without this expansion fix

### Pending Todos

- ~~Phase 3.1: Replace EODHDProvider with YahooProvider (incremental) + StooqImporter (one-time bulk archive); re-seed all 14 v1 tickers~~ **DONE — Plans 07-10**
- ~~Phase 3.1: Replace IQQA.SW in v1 seed list — EODHD 404; verify correct ticker against Yahoo (likely SSAC.SW for iShares MSCI ACWI Acc)~~ **DONE — SSAC.SW confirmed in production DB**
- ~~Phase 3.1: Vercel deploy + manual cron trigger + production proxy 401 regression check (deferred from 03-06 Task 4)~~ **DONE — 2026-05-04, all 4 checks pass**
- ~~Phase 3.1: SPY 2020-03-16 (COVID circuit-breaker) adjusted-close sanity check vs public reference, within 0.5%~~ **DONE — close=$239.85, 0.0000% delta**
- Phase 4: 500E.SW — investigate why Yahoo does not consistently surface under `.SW` suffix; may need symbol alias

### Blockers/Concerns

- ~~Phase 3: Validate UCITS ETF dividend schedule coverage in EODHD~~ — moot, pivoting away from EODHD
- ~~Phase 3.1: Verify Stooq Swiss SIX coverage before committing~~ — confirmed empty for all SIX tickers; Yahoo fallback covers all 5
- Phase 6: Monte Carlo distribution choice (Gaussian vs. historical bootstrap vs. fat-tail) must be decided before Phase 6 planning
- Phase 6: Swiss CPI data source for inflation adjustment not yet confirmed — BFS API ergonomics unclear

## Session Continuity

Last session: 2026-05-04T16:44:19.740Z
Stopped at: Completed 03-10 (all tasks) — Phase 3 fully complete. Next: Phase 4 Portfolio Builder
Resume file: None
