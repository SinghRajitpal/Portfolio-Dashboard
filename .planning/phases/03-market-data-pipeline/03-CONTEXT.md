# Phase 3: Market Data Pipeline - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

A server-side data pipeline that fetches historical prices, dividends, FX rates, and instrument metadata from external providers and caches them in Supabase, exposing a typed search/lookup API that Phase 4 (Portfolio Builder) and Phase 5 (Backtest Engine) consume. Schema for `instruments`, `prices`, `dividends`, `fx_rates` already exists from Phase 1; this phase populates them and adds an `isin_lookups` cache table. No production user-facing UI ships in this phase — search is exposed as a typed server function and API route, verified via Playwright tests.

</domain>

<decisions>
## Implementation Decisions

### Data sources (revised from April 2026 research)
- **Primary: EODHD free tier** (20 req/day) — same architecture as the previously recommended paid plan, throttled. Aggressive Supabase caching makes this viable at personal scale: one full-history fetch per ticker, then daily refresh via the bulk-by-day endpoint.
- **FX: Frankfurter** (free, ECB-sourced, no key, back to 1999) — unchanged from research.
- **ISIN resolution: OpenFIGI** (free) — unchanged from research.
- **yahoo-finance2: dropped entirely.** Not part of the v1 pipeline. EODHD is the sole price/dividend provider. The previous "emergency fallback" plan added source-mixing risk for marginal benefit.
- `IMarketDataProvider` interface still ships, but with a single `EODHDProvider` implementation. Future paid-tier upgrade is one env-var change.
- Cost path: $0/mo for v1. Upgrade to EODHD paid ($19.99/mo) only if rate budget becomes a real bottleneck; upgrade to Fundamentals ($59.99/mo) only when ETF holdings drill-down (deferred to v2) is built.

### Fetch & refresh strategy
- **Initial seed**: pre-seed the ~10–20 instruments backing the v1 portfolio templates (the "Classic 60/40", "All-World", and similar templates referenced in PORT-07). Everything else fetches on-demand when a user adds a new instrument in Phase 4.
- **Backfill range**: full available history per ticker on first fetch (one EODHD call covers 30+ years from inception). Never refetch a ticker's history.
- **Daily refresh**: Vercel Cron Jobs hitting an internal Next.js API route. The route calls EODHD's bulk-by-day endpoint, which returns *all* tracked instruments on an exchange in a single call — efficient under the 20/day budget regardless of how many tickers we track.
- **Cron host**: Vercel Cron Jobs, declared in `vercel.ts` (or `vercel.json` if simpler). Hobby tier supports daily granularity for the 2 cron slots we need (SW exchange + US exchange).
- **Rate budget math** (for planner): seed ~15 tickers × 2 endpoints (price + dividends) ≈ 30 calls. Spread across 2 days, or use bulk dividend endpoint if available. Daily steady-state: 2 bulk calls/day total.

### Data integrity & validation
- **Adjustments**: trust EODHD's `adjusted_close` as canonical for total-return backtests in Phase 5. Schema already stores both `close` and `adjusted_close` separately. Re-derive only if drift is observed against specific instruments.
- **Trading-calendar gaps**: do not insert synthetic forward-fill rows at ingest. Surface gap ranges in instrument metadata (e.g., a JSONB column on `instruments` or a sibling `instrument_gaps` table — planner to decide). Phase 5 chooses fill / interpolate / fail per backtest.
- **CHF conversion**: compute on read via JOIN of `prices` × `fx_rates` by date. Prices stored in their native currency only (matches existing schema). FX corrections (ECB occasionally republishes) propagate automatically, no recompute job needed.
- **"Ready for Phase 4" bar (smoke test)**: instrument is exposed when (a) first/last date are present, (b) row count > 0, (c) all `adjusted_close` values non-null. Lenient by design — Phase 5 surfaces real gaps when running specific backtests; we iterate as we discover instrument-specific issues.

### Search & ISIN resolution surface
- **Surface**: server function + API route at `POST /api/instruments/search`. Phase 4 builds the UI on top later. No throwaway debug page in Phase 3.
- **Verification**: Playwright integration tests covering ticker, name, and ISIN inputs end-to-end (fetch → cache → search → return).
- **Inputs**: single `search(query)` function auto-detects input shape: matches `/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/` → OpenFIGI ISIN lookup; otherwise EODHD search (matches both ticker and name).
- **Multi-venue results**: return all matches across exchanges (e.g., a UCITS ETF listed on SIX, XETRA, LSE) with exchange/currency/listing date. Phase 4 picks the disambiguation UI (auto-pick the user's preferred exchange or show a chooser). Phase 3 does not pick on the user's behalf.
- **OpenFIGI usage**: on-demand, with results persisted in a new `isin_lookups` table (`isin TEXT PRIMARY KEY, ticker TEXT, exchange TEXT, fetched_at TIMESTAMPTZ`). A second lookup of the same ISIN is free. Phase 3 ships the migration that creates this table.

### Failure handling & error contract
- **Rate limit (429)**: surface a typed `rate_limit` error to the caller. No silent fallback, no internal queue. Daily seed work resumes the next day; users learn that the budget exists.
- **Transient errors (5xx, timeouts)**: retry 3x with exponential backoff (1s, 2s, 4s). After exhaustion, surface a typed `transient` error. Don't fall back to a different provider for transient issues.
- **Ticker not found (404)**: surface a typed `not_found` error. In v1 this means the ticker genuinely cannot be added — Phase 4 must render this clearly.
- **Error contract**: discriminated union `{ kind: 'rate_limit' | 'not_found' | 'transient' | 'invalid_input', message?: string, retryAfter?: Date }`. All public pipeline functions return either typed data or a typed error. Phase 4 pattern-matches on `kind` to render appropriate UI.

### Claude's Discretion
- Exact shape of gap-tracking metadata (JSONB column on `instruments` vs sibling table)
- Whether to use the official EODHD Node.js SDK (`npm install eodhd`) or a hand-rolled REST client (SDK is preferred unless it pulls in heavy deps)
- Cron run time (likely ~22:00 UTC after EODHD posts EOD data, but planner verifies)
- How to surface cron failures (Vercel logs alone vs adding a `cron_runs` audit table)
- Backoff implementation library choice (or hand-rolled — it's 4 lines)
- Exact `isin_lookups` schema details (TTL on cache, indexed columns)
- The starter list of ~10–20 pre-seed tickers (planner derives from PORT-07 templates and PROJECT.md context)
- Dev vs prod EODHD API key handling (env-var strategy mirrors Supabase: `.env.local` for dev, Vercel env for prod)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/supabase/server.ts` — async createClient pattern (Next.js 16 cookies() Promise API)
- `src/lib/supabase/client.ts` — browser-side client (not used by data pipeline; pipeline is server-only)
- `src/lib/utils.ts` — `cn()` and any utility helpers
- `src/proxy.ts` — Next.js 16 middleware/proxy for auth session enforcement (cron API routes need to be either authed or signed with a Vercel cron secret)
- Phase 1's `00001_initial_schema.sql` — `instruments`, `prices`, `dividends`, `fx_rates` tables already exist with proper indexes (`idx_prices_instrument_date`, `idx_fx_rates_currencies_date`, `idx_instruments_isin`, `idx_dividends_instrument_exdate`) and RLS (read-only for authenticated users)

### Established Patterns
- Supabase Supavisor pooler port 6543 for all connections (locked in STATE.md decisions)
- Migrations named with leading number, version-controlled (`00001_initial_schema.sql` precedent)
- Tailwind v4 + shadcn theming (irrelevant here — no UI in this phase)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY) — server-only EODHD key will be `EODHD_API_KEY` (no `NEXT_PUBLIC_` prefix)
- Playwright test scaffold at `tests/` from Phase 1; Phase 3 adds integration tests for the pipeline
- `@custom-variant dark` and CSS variable theming established in Phase 2 — irrelevant here

### Integration Points
- New API route: `src/app/api/instruments/search/route.ts` — typed POST endpoint
- New API route: `src/app/api/cron/refresh-prices/route.ts` — daily bulk-by-day refresh, secured by Vercel Cron secret
- New library code: `src/lib/data/IMarketDataProvider.ts`, `src/lib/data/EODHDProvider.ts`, `src/lib/data/frankfurter.ts`, `src/lib/data/openfigi.ts`, `src/lib/data/cache.ts`, `src/lib/data/errors.ts`
- New migration: `supabase/migrations/00002_isin_lookups.sql` (and possibly `00003_instrument_gaps.sql` if planner picks the sibling-table approach)
- New `vercel.ts` (or `vercel.json` cron declaration)
- New env vars: `EODHD_API_KEY` (server-only), `CRON_SECRET` (for Vercel Cron auth)
- Seed script (one-shot, runnable locally and idempotent) for the v1 template instruments

</code_context>

<specifics>
## Specific Ideas

- The pipeline is the foundation of the project's core value: "real historical data" backtests. Treat data correctness as the primary success criterion — speed and ergonomics second.
- Personal-scale tool: optimize for "set-and-forget" within the 20/day budget. The system should recover gracefully from a missed cron day without manual intervention.
- The user explicitly chose to drop yahoo-finance2 from the pipeline entirely. This is a deliberate simplification — single source of truth for each ticker.
- Cost ceiling for v1: $0/mo. Document the upgrade path (paid EODHD when rate budget becomes a constraint) but don't build for it.
- `IMarketDataProvider` interface is non-negotiable even with one implementation — it's the contract that lets us swap to a paid plan or a different provider without touching downstream code.

</specifics>

<deferred>
## Deferred Ideas

- ETF holdings / sector / geographic exposure (requires EODHD Fundamentals $59.99/mo) — deferred to v2 (DRILL-01, DRILL-02, DRILL-03 in REQUIREMENTS.md)
- Pre-1999 FX rates (would need SNB data integration) — only relevant for backtests deeper than 1999, niche edge case
- Manual "force refresh ticker X now" admin action — useful operationally but not required for v1
- Instrument metadata staleness policy (expense ratio / dividend yield can change over time) — initial fetch is fine; refresh policy can wait until we observe staleness
- Observability dashboard for cron health (success rate, last run time) — Vercel logs are enough for v1; revisit if cron failures become opaque
- Provider-routing logic (yahoo + EODHD hybrid) — explicitly rejected; revisit only if EODHD reliability becomes a problem

</deferred>

---

*Phase: 03-market-data-pipeline*
*Context gathered: 2026-05-02*
