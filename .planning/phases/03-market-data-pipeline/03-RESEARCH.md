# Phase 3: Market Data Pipeline - Research

**Researched:** 2026-05-02
**Domain:** Financial data ingestion — EODHD, Frankfurter, OpenFIGI, Vercel Cron, Supabase bulk upsert, TypeScript error contracts
**Confidence:** HIGH (stack decisions locked; API shapes verified against official docs and GitHub SDK; Next.js 16 proxy.ts behavior verified against in-repo docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Primary price/dividend source**: EODHD free tier (20 req/day). Aggressive Supabase caching makes this viable — fetch full history once, daily bulk-by-day refresh thereafter.
- **FX rates**: Frankfurter API (free, ECB-sourced, no key, back to 1999). No alternatives considered.
- **ISIN resolution**: OpenFIGI (free, Bloomberg-backed). No alternatives considered.
- **yahoo-finance2 dropped entirely**. Not in the v1 pipeline. EODHD is the sole price/dividend source.
- **`IMarketDataProvider` interface ships** with a single `EODHDProvider` implementation.
- **Cost ceiling**: $0/mo for v1. Upgrade to EODHD paid ($19.99/mo) only if rate budget becomes a real bottleneck.
- **Initial seed**: pre-seed the ~10–20 instruments backing the v1 portfolio templates.
- **Backfill range**: full available history on first fetch. Never refetch a ticker's history.
- **Daily refresh**: Vercel Cron Jobs hitting `src/app/api/cron/refresh-prices/route.ts`.
- **Daily steady-state budget**: 2 bulk calls/day (one per exchange — SW + US).
- **`adjusted_close` is canonical** for total-return backtests. Both `close` and `adjusted_close` stored.
- **Trading-calendar gaps**: do not insert synthetic forward-fill rows at ingest.
- **CHF conversion**: compute on read via JOIN; prices stored in native currency only.
- **Search surface**: `POST /api/instruments/search` — server function + API route only. No debug UI page.
- **ISIN auto-detection**: `/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/` → OpenFIGI; otherwise EODHD search.
- **Multi-venue results**: return all matches, Phase 4 handles disambiguation. Phase 3 does not pick.
- **`isin_lookups` table ships in this phase** — migration `00002_isin_lookups.sql`.
- **Rate limit error contract**: discriminated union `{ kind: 'rate_limit' | 'not_found' | 'transient' | 'invalid_input', message?: string, retryAfter?: Date }`.
- **Retry policy**: 3x exponential backoff (1s, 2s, 4s) for transient errors. No retry on 429.
- **Verification**: Playwright integration tests covering ticker, name, and ISIN inputs end-to-end.

### Claude's Discretion
- Exact shape of gap-tracking metadata (JSONB column on `instruments` vs sibling `instrument_gaps` table)
- Whether to use the official EODHD Node.js SDK (`npm install eodhd`) or a hand-rolled REST client
- Cron run time (likely ~22:00 UTC after EODHD posts EOD data)
- How to surface cron failures (Vercel logs alone vs a `cron_runs` audit table)
- Backoff implementation library choice (or hand-rolled — it's 4 lines)
- Exact `isin_lookups` schema details (TTL on cache, indexed columns)
- The starter list of ~10–20 pre-seed tickers (planner derives from PORT-07 templates)
- Dev vs prod EODHD API key handling (env-var strategy mirrors Supabase)

### Deferred Ideas (OUT OF SCOPE)
- ETF holdings / sector / geographic exposure (requires EODHD Fundamentals $59.99/mo) — DRILL-01, DRILL-02, DRILL-03
- Pre-1999 FX rates (SNB data integration)
- Manual "force refresh ticker X now" admin action
- Instrument metadata staleness policy
- Observability dashboard for cron health
- Provider-routing logic (yahoo + EODHD hybrid) — explicitly rejected
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | System fetches and caches historical daily prices from EODHD | EODHD SDK `eod()` + `bulkEod()` methods; Supabase upsert on `prices` table with `(instrument_id, date)` conflict target |
| DATA-02 | System fetches and caches historical FX rates (USD/CHF, EUR/CHF, GBP/CHF) | Frankfurter `/v2/rates?from=1999-01-04&to=TODAY&base=CHF&quotes=USD,EUR,GBP` → upsert to `fx_rates` |
| DATA-03 | System supports US-listed ETFs, Swiss/European ETFs, individual stocks, commodities, and futures | EODHD covers 70+ exchanges; SW exchange confirmed 1,600+ instruments; US exchange full coverage |
| DATA-04 | System stores instrument metadata (name, type, currency, expense ratio, dividend yield) | `instruments` table already exists in schema; EODHD search endpoint returns name/type/currency; expense_ratio and dividend_yield populated from seed script or EODHD fundamentals lite |
| DATA-05 | User can search instruments by ISIN via OpenFIGI resolution | OpenFIGI `POST /v3/mapping` with `{idType: "ID_ISIN", idValue: "..."}` → resolve ticker → cache in `isin_lookups` |
</phase_requirements>

---

## Summary

Phase 3 builds the data plumbing everything downstream (Phase 4 portfolio builder, Phase 5 backtest engine) depends on. The core architecture is cache-first: external APIs are called once per ticker for full history, then daily via a cheap bulk endpoint. Supabase holds all historical data; no user request ever touches an external API after the first fetch.

The stack is fully locked from CONTEXT.md decisions. Research focus here is on exact API shapes, Next.js 16 cron/proxy.ts integration patterns, Supabase bulk upsert ergonomics, and concrete implementation details needed by the planner.

The most critical correctness concern is the EODHD `adjusted_close` field — it is adjusted for both splits AND dividends, which is what Phase 5's total-return backtest requires. This has been verified against EODHD documentation: "OHLC we provide in raw adjusted neither to splits nor to dividends, while adjusted closes are adjusted to both splits and dividends."

**Primary recommendation:** Build the pipeline in this order: (1) error types + IMarketDataProvider interface, (2) Frankfurter FX seeder (simplest, no rate limit risk), (3) EODHD provider with EODHDProvider class, (4) search route, (5) cron route, (6) seed script.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `eodhd` (official Node SDK) | Latest (Mar 2026 release) | EODHD API calls — price history, dividends, bulk EOD, search | First-party typed SDK; methods match all endpoints needed; lightweight (no heavy deps per BundlePhobia badge) |
| `@supabase/supabase-js` | Already installed (Phase 1) | Bulk upsert of prices/dividends/fx_rates; `isin_lookups` CRUD | Already in project; server client pattern established |
| `zod` | v4.x (already installed) | Validate API responses from EODHD, Frankfurter, OpenFIGI before writing to DB | Single source of type truth; prevents bad rows from corrupting cache |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Hand-rolled `fetch` client | Native (no package) | Frankfurter and OpenFIGI calls | These APIs are pure REST with trivial request shapes — no SDK needed, no extra dependency |
| Hand-rolled backoff | ~4 lines | Exponential retry for transient errors (1s, 2s, 4s) | Simpler than adding `p-retry` for 3 retries |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `eodhd` SDK | Hand-rolled `fetch` client | SDK is preferred per CONTEXT.md unless it pulls heavy deps — it doesn't, so use SDK |
| Hand-rolled backoff | `p-retry` npm | `p-retry` adds a dependency for 4 lines of logic; not worth it |
| `vercel.json` for cron | `vercel.ts` | Vercel docs exclusively show `vercel.json` for cron configuration; no `vercel.ts` cron format exists |

**Installation:**
```bash
npm install eodhd
```
(All other dependencies already installed from Phases 1-2)

---

## Architecture Patterns

### Recommended File Structure

```
src/
├── app/api/
│   ├── instruments/search/route.ts   # POST — auto-detects ISIN vs text query
│   └── cron/refresh-prices/route.ts  # GET — bulk-by-day refresh, CRON_SECRET auth
├── lib/data/
│   ├── errors.ts                      # Discriminated union error types
│   ├── IMarketDataProvider.ts         # Interface (swappable)
│   ├── EODHDProvider.ts               # Implementation using eodhd SDK
│   ├── frankfurter.ts                 # FX rate fetcher (hand-rolled fetch)
│   ├── openfigi.ts                    # ISIN resolver (hand-rolled fetch)
│   └── cache.ts                       # Supabase read/write helpers for prices, fx_rates, isin_lookups
└── scripts/
    └── seed-instruments.ts            # One-shot seed script (idempotent)

supabase/migrations/
├── 00001_initial_schema.sql           # Already exists
├── 00002_isin_lookups.sql             # New: isin_lookups cache table
└── 00003_instrument_gaps.sql          # Optional: planner decides vs JSONB column

vercel.json                            # Add "crons" array to existing file
```

### Pattern 1: Cache-First Price Fetch

**What:** Check Supabase for existing price rows before calling EODHD. On first fetch, download full history and upsert. On subsequent requests, only the daily bulk refresh adds new rows.

**When to use:** Every price/dividend/FX request path.

```typescript
// Source: ARCHITECTURE.md Pattern 1 + EODHD SDK docs
async function getPricesForTicker(ticker: string): Promise<PriceRow[] | DataError> {
  const instrument = await getInstrumentByTicker(ticker)
  if (!instrument) return { kind: 'not_found', message: `Ticker ${ticker} not in instruments table` }

  // Check if we already have data
  const { data: existing } = await supabase
    .from('prices')
    .select('date')
    .eq('instrument_id', instrument.id)
    .order('date', { ascending: false })
    .limit(1)

  if (existing && existing.length > 0) {
    // Cache hit — return all cached rows
    return fetchCachedPrices(instrument.id)
  }

  // Cache miss — fetch full history from EODHD
  const client = new API(process.env.EODHD_API_KEY!)
  const prices = await client.eod(`${ticker}`, { from: '1970-01-01', order: 'a' })
  await bulkUpsertPrices(instrument.id, prices)
  return fetchCachedPrices(instrument.id)
}
```

### Pattern 2: Vercel Cron with CRON_SECRET Authentication

**What:** Cron route declared in `vercel.json`. Route authenticates via `Authorization: Bearer ${CRON_SECRET}` header. The existing `src/proxy.ts` matcher currently covers all routes with `/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)` — this will match `/api/cron/refresh-prices` and attempt a Supabase auth check.

**Critical:** The cron route must bypass the proxy auth check OR handle the case where `user` is null. Since Vercel cron requests carry no user session, the proxy will redirect them to `/auth`. The fix is to add `/api/cron/` to the proxy exclusion list OR check for `CRON_SECRET` header in proxy before the Supabase auth check.

**Recommended approach:** Modify the proxy matcher to exclude `/api/cron/` entirely — cron routes authenticate via their own secret, not via user session.

```typescript
// Source: Next.js 16 proxy.ts docs + Vercel cron docs
// In src/proxy.ts — update the matcher config:
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

// In src/app/api/cron/refresh-prices/route.ts:
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Run bulk refresh...
  return Response.json({ success: true })
}
```

```json
// In vercel.json (add "crons" to existing {"framework": "nextjs"}):
{
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/refresh-prices?exchange=SW",
      "schedule": "0 22 * * *"
    },
    {
      "path": "/api/cron/refresh-prices?exchange=US",
      "schedule": "0 22 * * *"
    }
  ]
}
```

**Hobby tier cron limits (HIGH confidence — Vercel official docs 2026-02-27):**
- Maximum 2 cron jobs total (matches our need exactly)
- Can only run once per day (daily granularity only)
- Invoked at any point within the specified hour (not exactly at HH:00)
- Vercel does NOT retry on failure — errors visible in Vercel logs only

### Pattern 3: Supabase Bulk Upsert for Large Price Series

**What:** Insert 10k+ price rows on first fetch. Use `upsert()` with explicit `onConflict` targeting the composite unique key `(instrument_id, date)`. Batch into chunks of ~500 rows to avoid PostgREST request body size limits.

```typescript
// Source: Supabase JS client docs + established schema from 00001_initial_schema.sql
async function bulkUpsertPrices(instrumentId: string, rows: EODHDPriceRow[]) {
  const BATCH_SIZE = 500
  const mapped = rows.map(r => ({
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
    if (error) throw error
  }
}
```

**Why 500-row batches:** PostgREST has no hard documented row limit but practical upper bounds sit around 1000-2000 rows per request before timeout risk and memory pressure. 500 is a safe conservative batch that keeps each request well under 1MB.

### Pattern 4: Frankfurter Full-History Fetch (One-Shot)

**What:** Fetch CHF/USD, CHF/EUR, CHF/GBP from 1999-01-04 to today in a single call. Frankfurter supports date-range queries returning all daily rates. Use NDJSON for large date ranges.

```typescript
// Source: frankfurter.dev official docs (verified 2026-05-02)
// Endpoint: GET https://api.frankfurter.dev/v2/rates?from=1999-01-04&to=2026-05-02&base=CHF&quotes=USD,EUR,GBP
// Returns daily rates for each trading day in the range

async function seedFXRates() {
  const today = new Date().toISOString().split('T')[0]
  const url = `https://api.frankfurter.dev/v2/rates?from=1999-01-04&to=${today}&base=CHF&quotes=USD,EUR,GBP`

  const res = await fetch(url, {
    headers: { 'Accept': 'application/x-ndjson' } // streaming for large range
  })
  // Parse NDJSON: each line is a JSON object { date, base, rates: { USD, EUR, GBP } }
}
```

**No rate limit concerns:** Frankfurter has no daily/monthly quotas. One-shot seed + daily top-up is the right pattern.

### Pattern 5: OpenFIGI ISIN Resolution

**What:** POST to `/v3/mapping` with ISIN. Returns all exchange listings for that ISIN. No API key required for basic use (key increases rate limits).

```typescript
// Source: OpenFIGI API overview (openfigi.com/api) — free, no limits
async function resolveISIN(isin: string): Promise<OpenFIGIResult[] | DataError> {
  const res = await fetch('https://api.openfigi.com/v3/mapping', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 'X-OPENFIGI-APIKEY': process.env.OPENFIGI_API_KEY  // optional but increases limits
    },
    body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }])
  })
  const data = await res.json()
  // data[0].data = array of { figi, name, ticker, exchCode, securityType, currency }
  return data[0].data
}
```

### Pattern 6: Discriminated Union Error Contract

**What:** All public pipeline functions return `data | DataError`. Phase 4 pattern-matches on `kind`.

```typescript
// Source: CONTEXT.md locked decision
// In src/lib/data/errors.ts:
export type DataError =
  | { kind: 'rate_limit'; message: string; retryAfter?: Date }
  | { kind: 'not_found'; message: string }
  | { kind: 'transient'; message: string; attempt: number }
  | { kind: 'invalid_input'; message: string }

export function isDataError(v: unknown): v is DataError {
  return typeof v === 'object' && v !== null && 'kind' in v
}
```

### Anti-Patterns to Avoid

- **Calling EODHD from the user request path**: Every search and data lookup must check Supabase first. EODHD is only called during seed, daily cron, and on-demand first-fetch for new tickers.
- **Using EODHD `close` instead of `adjusted_close` for backtests**: Phase 5 must use `adjusted_close` which is adjusted for both splits and dividends. Storing both is correct; never let Phase 5 accidentally use raw `close`.
- **Using a single FX rate for the whole portfolio**: Phase 2 pitfall documented — all FX conversions must use point-in-time rates from `fx_rates` table.
- **Calling EODHD search for every keystroke**: The search route should require a minimum query length (3+ chars) and the ISIN regex match must run before any API call.
- **Trusting the cron route is protected by proxy auth**: The proxy runs a Supabase `getUser()` call. Cron requests have no user session. The proxy matcher must exclude `/api/cron/` or cron calls will get 302-redirected to `/auth` silently.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EODHD API calls | Custom fetch wrapper with ticker formatting | `eodhd` official SDK | SDK handles SYMBOL.EXCHANGE formatting, response typing, pagination |
| ISIN validation regex | Custom regex builder | Inline regex `/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/` | 12-char ISO 6166 format; single known rule |
| FX rate caching | TTL-based invalidation logic | Simple "does date exist in fx_rates?" check | Historical rates are immutable; check existence, not staleness |
| Bulk upsert chunking | Stream-based ingest | Simple `for` loop with 500-row slices | ~20 iterations for 10k rows; no streaming complexity needed |
| Exponential backoff | Retry library | `const delay = (n: number) => new Promise(r => setTimeout(r, 1000 * 2 ** n))` | 3 retries = 4 lines |

---

## Common Pitfalls

### Pitfall 1: Proxy Blocks Cron Requests
**What goes wrong:** The existing `src/proxy.ts` runs a Supabase `getUser()` on every request matching the current matcher. Vercel cron requests carry no user session. The proxy sees `user === null` and redirects to `/auth`. The cron route returns 302, Vercel logs it as a redirect, and Vercel docs state "cron jobs do not follow redirects" — the job silently fails.

**Why it happens:** The proxy matcher `/((?!_next/static|_next/image|favicon.ico|.*\\....)*)` matches `/api/cron/refresh-prices`.

**How to avoid:** Add `api/cron` to the proxy exclusion list:
```
'/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
```
The cron route then handles its own auth via CRON_SECRET header check.

**Warning signs:** Vercel logs show 302 responses for cron invocations.

### Pitfall 2: EODHD 20-Request Daily Budget Exhaustion During Development
**What goes wrong:** Running the seed script multiple times during development, or triggering full-history fetches for many tickers, exhausts the 20/day free tier budget. Development stops for 24 hours.

**Why it happens:** The seed script fetches prices + dividends per ticker = 2 calls × 15 tickers = 30 calls in one run.

**How to avoid:**
- Seed script must be idempotent — check if instrument already has prices before fetching.
- Spread seed across 2 days: Day 1: prices for all tickers. Day 2: dividends for all tickers.
- Use a dedicated `EODHD_API_KEY_DEV` pointing to a free-tier key for local dev; reserve the paid key for production.
- During testing: mock EODHD responses. Never call real EODHD in Playwright tests.

**Warning signs:** HTTP 429 response from EODHD with "You have reached the limit" message.

### Pitfall 3: Frankfurter Full-History Response Size
**What goes wrong:** Fetching CHF rates from 1999-01-04 to today (~27 years × ~250 trading days = ~6,750 data points) in JSON format buffers the entire response in memory before parsing.

**Why it happens:** Default JSON fetch reads the full body. The Frankfurter docs recommend NDJSON (`Accept: application/x-ndjson`) for large date ranges to stream results line-by-line.

**How to avoid:** Use `Accept: application/x-ndjson` header. Parse line by line. Batch-upsert every 500 lines.

**Warning signs:** Seed script hangs or OOMs on the FX seeding step.

### Pitfall 4: OpenFIGI Returns Multiple Listings, Phase 3 Must Return All
**What goes wrong:** ISIN resolves to 4+ listings (e.g., a UCITS ETF listed on SIX, XETRA, LSE, and Euronext). If Phase 3 picks one arbitrarily, users in CH can't find the CHF-denominated listing.

**Why it happens:** OpenFIGI returns all exchange listings for a given ISIN; there's no "primary" flag.

**How to avoid:** Return all results. The `isin_lookups` cache stores the full mapping. The search response returns all venues with their `exchCode` and `currency`. Phase 4 handles the disambiguation UI.

### Pitfall 5: Supabase Upsert Without `onConflict` Causes Duplicate Rows
**What goes wrong:** Daily bulk refresh calls `insert()` instead of `upsert()`. Prices table accumulates duplicate `(instrument_id, date)` rows. The `UNIQUE (instrument_id, date)` constraint causes a PostgreSQL error and the cron job fails.

**Why it happens:** Default Supabase `.insert()` throws on unique constraint violation.

**How to avoid:** Always use `.upsert(batch, { onConflict: 'instrument_id,date' })` for prices and `.upsert(batch, { onConflict: 'instrument_id,ex_date' })` for dividends. The `UNIQUE` constraints are already defined in the Phase 1 schema.

### Pitfall 6: Swiss ETF History May Start After 2006
**What goes wrong:** Phase 5 tries to backtest CHDVD.SW from 1999. The ETF was incepted in 2009. The price series starts at 2009-xx-xx. If Phase 5 treats this as complete data and runs a 20-year backtest, it silently uses only 15 years.

**Why it happens:** EODHD returns all available data which may be far less than the "full 30-year history" claim (US stocks). Swiss UCITS ETFs have shorter inception dates.

**How to avoid:** After first fetch, store `first_date` and `last_date` on the `instruments` row (or in gap metadata). The "ready for Phase 4" smoke test (row count > 0, all adjusted_close non-null) is lenient by design per CONTEXT.md. Phase 5 surfaces the constraint when building backtests.

---

## EODHD API Reference (Phase 3 Endpoints)

### Historical Prices Endpoint
```
GET https://eodhd.com/api/eod/{SYMBOL}.{EXCHANGE}?api_token={KEY}&fmt=json&order=a
```
Response is a JSON array:
```json
[
  {
    "date": "2024-01-02",
    "open": 475.21,
    "high": 480.56,
    "low": 472.50,
    "close": 478.93,
    "adjusted_close": 476.12,
    "volume": 4321000
  }
]
```
**Key fact (HIGH confidence — EODHD official docs):** `adjusted_close` is adjusted for BOTH splits AND dividends. `open/high/low/close` are raw (unadjusted).

### Dividends Endpoint
```
GET https://eodhd.com/api/div/{SYMBOL}.{EXCHANGE}?api_token={KEY}&fmt=json&from=1970-01-01
```
Response is a JSON array:
```json
[
  {
    "date": "2024-03-14",
    "value": 1.65,
    "unadjustedValue": 1.65,
    "currency": "USD",
    "declarationDate": "2024-02-01",
    "recordDate": "2024-03-15",
    "paymentDate": "2024-03-28",
    "period": "Quarterly"
  }
]
```
**Note on European ETFs (BLOCKER per STATE.md):** Irregular ex-dates for European ETFs may affect DRIP modeling. The `date` field in the EODHD dividend response is the ex-date. Phase 3 stores this as `ex_date` in the `dividends` table per the existing schema.

### Bulk EOD Endpoint (Daily Refresh)
```
GET https://eodhd.com/api/eod-bulk-last-day/{EXCHANGE}?api_token={KEY}&fmt=json&date={YYYY-MM-DD}
```
Returns EOD data for all tracked instruments on the exchange for the given date. One call covers the entire exchange — 1,600+ SW instruments or 10,000+ US instruments in a single API response.

**Exchange codes:** `SW` for SIX Swiss Exchange, `US` for NYSE+NASDAQ combined.

Bulk response shape (per instrument):
```json
[
  {
    "code": "CHDVD",
    "exchange_short_name": "SW",
    "date": "2026-05-01",
    "open": 89.45,
    "high": 90.12,
    "low": 89.10,
    "close": 89.78,
    "adjusted_close": 89.78,
    "volume": 12345
  }
]
```
**Usage for daily cron:** Filter the bulk response to only tickers we track (the pre-seeded instrument list). Upsert matching rows. This means the cron does not need per-ticker API calls.

### Search Endpoint (via SDK)
```typescript
const results = await client.search('Apple', { limit: 10, type: 'stock' })
// Also works: client.search('CHDVD', { limit: 5 })
```
Response includes: `Code`, `Exchange`, `Name`, `Type`, `Country`, `Currency`, `ISIN`.

### EODHD SDK Usage Pattern
```typescript
// Source: github.com/EodHistoricalData/EODHD-APIs-Node-Financial-Library
import { API } from 'eodhd'

const client = new API(process.env.EODHD_API_KEY!)

// Full history (first fetch)
const prices = await client.eod('SPY.US', { from: '1990-01-01', order: 'a' })

// Dividends
const dividends = await client.dividends('SPY.US', { from: '1990-01-01' })

// Bulk daily refresh
const bulkData = await client.bulkEod('US', { date: '2026-05-01' })

// Search
const results = await client.search('CHDVD', { limit: 10 })
```

---

## Frankfurter API Reference

### Full History Fetch (One-Shot Seed)
```
GET https://api.frankfurter.dev/v2/rates?from=1999-01-04&to={TODAY}&base=CHF&quotes=USD,EUR,GBP
Accept: application/x-ndjson
```
Each NDJSON line:
```json
{"date":"1999-01-04","base":"CHF","rates":{"USD":0.6627,"EUR":0.6213,"GBP":0.3951}}
```

### Daily Top-Up (After Initial Seed)
```
GET https://api.frankfurter.dev/v2/rates?from={LAST_CACHED_DATE}&to={TODAY}&base=CHF&quotes=USD,EUR,GBP
```

**Key facts (HIGH confidence — frankfurter.dev official docs verified 2026-05-02):**
- No API key required
- No daily/monthly quotas
- Rate limiting only to prevent abuse
- Data from 1999-01-04 (ECB start date)
- Weekends and bank holidays return no data (expected — markets closed)

---

## OpenFIGI API Reference

### ISIN to Ticker Mapping
```
POST https://api.openfigi.com/v3/mapping
Content-Type: application/json
# X-OPENFIGI-APIKEY: {KEY}  — optional; increases rate limits

Body: [{ "idType": "ID_ISIN", "idValue": "CH0237935637" }]
```
Response:
```json
[{
  "data": [
    {
      "figi": "BBG001S5N8V8",
      "name": "ISHARES SWISS DIVIDEND",
      "ticker": "CHDVD",
      "exchCode": "SW",
      "securityType": "ETP",
      "currency": "CHF"
    }
  ]
}]
```
**Key facts (HIGH confidence — openfigi.com/api overview):**
- Free with no daily/weekly/monthly limits
- Returns all exchange listings for the ISIN (multi-venue)
- No API key required for basic use; key available for higher throughput
- `exchCode` maps to EODHD exchange codes (SW, US, XETRA, LSE, etc.)

---

## Vercel Cron Configuration

**Confirmed format (HIGH confidence — Vercel official docs last_updated 2026-02-27):** Crons are declared in `vercel.json` only. There is no `vercel.ts` cron format — the Vercel docs show exclusively `vercel.json`. The existing `/Users/singhs/portfolioforge/vercel.json` contains only `{"framework": "nextjs"}` and needs a `"crons"` array added.

```json
{
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/refresh-prices?exchange=SW",
      "schedule": "0 22 * * *"
    },
    {
      "path": "/api/cron/refresh-prices?exchange=US",
      "schedule": "0 22 * * *"
    }
  ]
}
```

**Hobby tier constraints (HIGH confidence):**
- Maximum 2 cron jobs — exactly matches our need (SW exchange + US exchange)
- Once per day only — `0 22 * * *` is valid; more frequent schedules fail deployment
- Invoked any time within the specified UTC hour (22:00–22:59 UTC)
- Vercel will NOT retry on failure
- Cron invocations carry `vercel-cron/1.0` User-Agent header
- EODHD EOD data is typically posted 20-22 UTC for US markets (Eastern close 21:00 UTC) — 22:00 UTC schedule is appropriate

---

## Pre-Seed Ticker List (v1 Templates)

Derived from PORT-07 requirements ("Classic 60/40", "All-World", and similar templates) cross-referenced with EODHD SW/US coverage:

### Classic 60/40 Template
| Ticker | Exchange | Name | Type | Currency |
|--------|----------|------|------|----------|
| SPY | US | SPDR S&P 500 ETF Trust | ETF | USD |
| AGG | US | iShares Core U.S. Aggregate Bond ETF | ETF | USD |
| VTI | US | Vanguard Total Stock Market ETF | ETF | USD |
| BND | US | Vanguard Total Bond Market ETF | ETF | USD |

### All-World Template
| Ticker | Exchange | Name | Type | Currency |
|--------|----------|------|------|----------|
| VWRL | LSE | Vanguard FTSE All-World UCITS ETF | ETF | USD |
| IWDA | LSE | iShares Core MSCI World UCITS ETF | ETF | USD |
| CSSPX | SW | iShares Core S&P 500 UCITS ETF | ETF | CHF |
| 500E | SW | Amundi S&P 500 UCITS ETF | ETF | CHF |

### Swiss Dividend / Income Template
| Ticker | Exchange | Name | Type | Currency |
|--------|----------|------|------|----------|
| CHDVD | SW | iShares Swiss Dividend ETF | ETF | CHF |
| IQQA | SW | iShares MSCI EM UCITS ETF | ETF | USD |

### Individual Benchmark Instruments
| Ticker | Exchange | Name | Type | Currency |
|--------|----------|------|------|----------|
| GLD | US | SPDR Gold Shares | ETF | USD |
| QQQ | US | Invesco QQQ Trust (NASDAQ-100) | ETF | USD |
| EEM | US | iShares MSCI Emerging Markets ETF | ETF | USD |
| NOVN | SW | Novartis AG (Swiss blue chip benchmark) | Stock | CHF |

**Total: 14 instruments.** Rate budget: 14 × 2 (prices + dividends) = 28 calls. Spread over 2 days (Day 1: prices, Day 2: dividends) = 14 calls/day each — stays within the 20/day free tier budget.

**Note on ticker formats for EODHD SDK:** `SPY.US`, `CHDVD.SW`, `VWRL.LSE` — exchange suffix required.

---

## New Migration: `00002_isin_lookups.sql`

```sql
-- isin_lookups: cache for OpenFIGI ISIN → ticker resolutions
CREATE TABLE public.isin_lookups (
  isin         TEXT        NOT NULL,
  ticker       TEXT        NOT NULL,
  exchange     TEXT        NOT NULL,
  figi         TEXT,
  security_type TEXT,
  currency     TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (isin, ticker, exchange)
);

CREATE INDEX idx_isin_lookups_isin ON public.isin_lookups (isin);

-- RLS: read-only for authenticated users (same as instruments table)
ALTER TABLE public.isin_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read isin_lookups"
  ON public.isin_lookups FOR SELECT TO authenticated
  USING (true);
```

**Rationale for composite PK `(isin, ticker, exchange)`:** One ISIN maps to multiple exchange listings. Each (isin, ticker, exchange) combination is a unique row. No TTL — ISIN mappings are permanent for listed securities. Staleness risk is low enough for v1.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `yahoo-finance2` as primary | EODHD official SDK | Apr 2026 decision (CONTEXT.md) | Stable paid API vs scraper; explicit decision |
| `middleware.ts` + `export function middleware()` | `proxy.ts` + `export function proxy()` | Next.js 16.0.0 (Oct 2025) | File and export renamed; codemod available |
| `middleware()` catches all API routes | Proxy matcher excludes cron routes explicitly | This phase | Cron requests have no user session; must bypass proxy auth |
| Vercel cron via `vercel.ts` (speculative) | `vercel.json` `"crons"` array | Always has been `vercel.json` | Confirmed from official docs — no `vercel.ts` for cron |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Next.js 15+ | Already done in Phase 1 |

**Deprecated/outdated:**
- `middleware.ts` / `export function middleware()`: Renamed to `proxy.ts` / `export function proxy()` in Next.js 16. A codemod (`npx @next/codemod@canary middleware-to-proxy .`) exists. Project already uses `proxy.ts` correctly.
- `eodhd` npm package prior to March 2026 release: No official SDK existed before March 2026; pre-March tutorials using custom fetch clients are correct but now superseded.

---

## Open Questions

1. **EODHD `serverExternalPackages` requirement**
   - What we know: The `eodhd` SDK is a Node.js package. Next.js 16 bundles server components differently. Heavy native Node.js packages sometimes need `serverExternalPackages` in `next.config.ts` to avoid bundling issues.
   - What's unclear: Whether `eodhd` SDK has any native dependencies requiring external package exclusion.
   - Recommendation: Add `eodhd` to `serverExternalPackages` in `next.config.ts` as a precaution; remove if build succeeds without it. Pattern: `experimental: { serverExternalPackages: ['eodhd'] }`.

2. **OpenFIGI `exchCode` → EODHD exchange code mapping**
   - What we know: OpenFIGI returns `exchCode` values (e.g., "SW", "GS" for XETRA). EODHD uses exchange codes in its API (SW, XETRA, LSE).
   - What's unclear: Whether the codes align 1:1 or need a translation map for all relevant exchanges.
   - Recommendation: Build a small mapping table in `openfigi.ts` for the exchanges relevant to v1 instruments: `{ SW: 'SW', GS: 'XETRA', LN: 'LSE', US: 'US' }`. Expand as new exchanges surface.

3. **EODHD bulk endpoint behavior when no instruments match**
   - What we know: The bulk endpoint returns all tickers on an exchange. We filter to tracked tickers.
   - What's unclear: If a tracked ticker had no trading activity on a given day (holiday, halted), does the bulk response include a row with zeroed values or omit it entirely?
   - Recommendation: During bulk refresh, only upsert rows that appear in the bulk response for tickers we track. Missing rows = no trading that day = expected gap. Do not insert synthetic rows.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (already configured in project) |
| Config file | `playwright.config.ts` (root, already exists) |
| Quick run command | `npx playwright test tests/market-data.spec.ts --project=chromium` |
| Full suite command | `npx playwright test --project=chromium` |

**Note:** Phase 3 has no heavy compute paths. Playwright integration tests against the running dev server (with local Supabase) are the right validation layer. Playwright already uses `baseURL: http://localhost:3000` and `webServer` config that starts Next.js automatically.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Second call for same ticker returns data from Supabase (no EODHD call) | integration | `npx playwright test tests/market-data.spec.ts::test('cached price returns from DB')` | ❌ Wave 0 |
| DATA-02 | CHF/USD rate available for 1999-01-05 from fx_rates cache | integration | `npx playwright test tests/market-data.spec.ts::test('fx rates available since 1999')` | ❌ Wave 0 |
| DATA-03 | CHDVD.SW and SPY both return price + dividend history | integration | `npx playwright test tests/market-data.spec.ts::test('swiss and us instruments return data')` | ❌ Wave 0 |
| DATA-04 | Instrument metadata retrievable for SPY: name, type, currency | integration | `npx playwright test tests/market-data.spec.ts::test('instrument metadata is populated')` | ❌ Wave 0 |
| DATA-05 | ISIN CH0237935637 resolves to CHDVD via POST /api/instruments/search | integration | `npx playwright test tests/market-data.spec.ts::test('isin resolves to ticker')` | ❌ Wave 0 |

### Validation Strategy Per Success Criterion

**Criterion 1 (Cache hit — no repeat EODHD call):**
- Playwright: POST `/api/instruments/search` with `{ query: "SPY" }` twice. Second response must return within 200ms (cache hit latency) and response body must contain price rows. First call allowed up to 2000ms (EODHD call). Use `page.route()` to intercept outbound EODHD requests — assert it is only called once.
- Alternatively: Mock EODHD at the test level via `process.env.EODHD_API_KEY = 'demo'` and inspect DB row count before/after.

**Criterion 2 (FX rates back to 1999):**
- Playwright: After running the seed script, GET `/api/fx-rates?date=1999-01-05&base=CHF&quote=USD`. Assert `rate` is a non-null number. Assert `rate` is between 0.5 and 2.0 (plausible CHF/USD range for 1999).

**Criterion 3 (ISIN → ticker via OpenFIGI → price data):**
- Playwright: POST `/api/instruments/search` with `{ query: "CH0237935637" }`. Assert response contains `ticker: "CHDVD"` and `exchange: "SW"`. Assert `isin_lookups` table has a row for this ISIN after the call (verify via a separate Supabase client in the test).

**Criterion 4 (Instrument metadata populated):**
- Playwright: After seeding, GET or POST search for `SPY`. Assert response includes `name`, `type: "etf"`, `currency: "USD"`. For `expense_ratio` and `dividend_yield` — these may be null if EODHD free tier doesn't include them in search results. Verify if the seed script populates them or if they remain null for v1.

**Criterion 5 (Swiss + US ETF complete history):**
- Playwright: After seeding, search for both `CHDVD.SW` and `SPY.US`. Assert each instrument has `rowCount > 0` price rows in `prices` table. Assert `adjusted_close` is non-null for the earliest and latest rows. Assert `last_date` is within 5 trading days of today.

### Test Data Isolation Strategy
- Use local Supabase (`npx supabase start` + `npx supabase db reset`) for all integration tests — pattern established in Phase 1.
- Never call real EODHD in Playwright tests. Use Playwright's `page.route()` to mock EODHD API calls OR set `EODHD_API_KEY=demo` and pre-seed the local DB with fixture data before tests run.
- Mock OpenFIGI similarly for the ISIN test to avoid external dependency in CI.
- FX rate test can call real Frankfurter (no rate limit, no key) OR use pre-seeded fixture rows.

### CI Rate Budget Protection
- Set `EODHD_API_KEY` in CI to a test/demo key value OR mock at the fetch level.
- Never run the real seed script against the free-tier key in CI pipelines.
- Pattern: Playwright test fixture populates `prices`, `dividends`, `fx_rates`, `instruments`, `isin_lookups` tables with fixture SQL before the test suite runs. Tests validate the API routes read from and write to the DB correctly, not that EODHD returns data.

### Sampling Rate
- **Per task commit:** `npx playwright test tests/market-data.spec.ts --project=chromium`
- **Per wave merge:** `npx playwright test --project=chromium`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/market-data.spec.ts` — integration tests for DATA-01 through DATA-05
- [ ] `tests/fixtures/seed-test-data.sql` — fixture SQL to pre-populate prices/dividends/fx_rates/instruments/isin_lookups for test runs
- [ ] `tests/helpers/mock-eodhd.ts` — Playwright route intercept helpers for EODHD mocking

---

## Sources

### Primary (HIGH confidence)
- Next.js 16 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — proxy.ts conventions, matcher patterns, migration from middleware.ts
- Next.js 16 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — Route Handler patterns, GET method, headers() API
- Vercel Cron Jobs docs `vercel.com/docs/cron-jobs` (last_updated 2025-06-25) — cron expression format, vercel.json syntax
- Vercel Managing Cron Jobs `vercel.com/docs/cron-jobs/manage-cron-jobs` (last_updated 2026-02-27) — CRON_SECRET pattern, Hobby limits (2 jobs, once/day), redirect behavior
- `frankfurter.dev` official docs (verified 2026-05-02) — `/v2/rates` endpoint, NDJSON streaming, no-quota confirmation
- EODHD official docs `eodhd.com/financial-apis/api-for-historical-data-and-volumes/` — adjusted_close definition, endpoint shapes
- EODHD bulk API docs `eodhd.com/financial-apis/bulk-api-eod-splits-dividends/` — bulk endpoint URL, dividend bulk endpoint
- EODHD Node SDK GitHub `github.com/EodHistoricalData/EODHD-APIs-Node-Financial-Library` — SDK methods: `eod()`, `dividends()`, `bulkEod()`, `search()`
- OpenFIGI API overview `openfigi.com/api` — free tier, no daily limits, ISIN mapping
- `/Users/singhs/portfolioforge/supabase/migrations/00001_initial_schema.sql` — confirmed existing table schemas, indexes, RLS policies
- `/Users/singhs/portfolioforge/src/proxy.ts` — confirmed matcher pattern that must be updated
- `/Users/singhs/portfolioforge/vercel.json` — confirmed existing content (`{"framework": "nextjs"}`) requiring crons addition
- `/Users/singhs/portfolioforge/playwright.config.ts` — confirmed test framework config
- `.planning/phases/03-market-data-pipeline/03-CONTEXT.md` — locked decisions, code context

### Secondary (MEDIUM confidence)
- `.planning/research/DATA_APIS.md` (project research, 2026-04-04) — EODHD SIX Swiss coverage verified, Frankfurter confirmed, OpenFIGI confirmed
- `.planning/research/STACK.md` (project research, 2026-04-04) — established patterns for Supabase server client, Next.js 16 conventions
- `.planning/research/PITFALLS.md` (project research, 2026-04-04) — Supabase connection pool, RLS indexes, Yahoo Finance reliability

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — EODHD SDK verified on GitHub, Frankfurter verified on official site, OpenFIGI verified on official site
- API shapes: HIGH — endpoint patterns verified from EODHD docs and SDK README; Frankfurter from official docs
- Cron configuration: HIGH — Vercel official docs confirm vercel.json format; Hobby limits confirmed
- Proxy/cron interaction: HIGH — confirmed from reading actual proxy.ts in codebase + Next.js 16 docs
- Architecture patterns: HIGH — established from existing project patterns + official docs
- Pre-seed ticker list: MEDIUM — tickers are known major instruments; EODHD SW coverage for specific tickers should be validated on first run
- OpenFIGI exchCode mapping: MEDIUM — codes derived from known standards; full mapping should be verified against actual API responses

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 (EODHD SDK and Vercel cron format stable; Frankfurter API stable)
