# Phase 5: backtesting-engine - Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 18 new/modified files
**Analogs found:** 15 / 18 (3 flagged as no-analog — `EquityCurveChart.tsx`, `AnnualReturnsChart.tsx`, `backtest.worker.ts`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/dashboard/backtest/page.tsx` | page (server component shell) | request-response | `src/app/dashboard/portfolios/page.tsx` | exact |
| `src/components/backtest/BacktestSetupBar.tsx` | component (controlled form) | event-driven | `src/components/portfolio/PortfolioBuilder.tsx` (header section + footer sticky pattern) | role-match |
| `src/components/backtest/BacktestResults.tsx` | component (composition shell) | request-response | `src/components/portfolio/PortfolioBuilder.tsx` (section composition) | role-match |
| `src/components/backtest/MetricsStrip.tsx` | component (sticky stats strip) | request-response | `src/components/portfolio/WeightedMetricsStrip.tsx` | **exact** |
| `src/components/backtest/RunHistoryDrawer.tsx` | component (list + drawer) | CRUD (list/select) | `src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx` + `CsvImportDialog.tsx` | role-match |
| `src/components/backtest/EquityCurveChart.tsx` | component (canvas chart) | streaming (data → canvas) | **no analog** — first chart in repo | new |
| `src/components/backtest/AnnualReturnsChart.tsx` | component (canvas chart) | streaming | **no analog** | new |
| `src/lib/backtest/types.ts` | model (pure types) | n/a | `src/lib/data/types.ts` | exact |
| `src/lib/backtest/simulate.ts` | utility (pure transform) | batch | `src/lib/portfolio/normalize-weights.ts` (pure-fn style) + `src/lib/portfolio/compute-metrics.ts` (loop+accumulator) | role-match |
| `src/lib/backtest/metrics.ts` | utility (pure transform) | batch | `src/lib/portfolio/compute-metrics.ts` | **exact** |
| `src/lib/backtest/inputs-hash.ts` | utility (pure hash) | transform | `src/lib/portfolio/normalize-weights.ts` (pure deterministic fn) | partial |
| `src/lib/backtest/date-grid.ts` | utility (pure transform) | batch | `src/lib/portfolio/compute-metrics.ts` (loop + accumulator) | partial |
| `src/lib/backtest/snb.ts` | service (external HTTP fetcher) | request-response | `src/lib/data/frankfurter.ts` (assumed analog — same pattern) + `src/lib/data/cache-fx.ts` (cache read) | role-match |
| `src/workers/backtest.worker.ts` | worker (compute thread) | event-driven (postMessage RPC) | **no analog** | new |
| `src/app/api/backtest/data/route.ts` | api route handler | request-response (POST) | `src/app/api/instruments/search/route.ts` | role-match |
| `src/app/api/backtest/runs/route.ts` | api route handler | CRUD (POST/GET) | `src/app/api/instruments/search/route.ts` + `src/app/dashboard/portfolios/_queries.ts` | role-match |
| `src/app/api/backtest/runs/[id]/route.ts` | api route handler | request-response (GET) | `src/app/api/instruments/search/route.ts` | role-match |
| `src/app/api/cron/refresh-snb/route.ts` | api route handler (cron) | request-response (GET) | `src/app/api/cron/refresh-prices/route.ts` | **exact** |
| `supabase/migrations/00009_backtest_runs.sql` | migration (table + RLS) | schema | `supabase/migrations/00001_initial_schema.sql` §portfolios (table+RLS) + `00004_portfolio_templates.sql` (additive migration shape) | exact (RLS pattern) |
| `supabase/migrations/00010_snb_rates.sql` | migration (shared-read table) | schema | `supabase/migrations/00001_initial_schema.sql` §fx_rates | exact |

## Pattern Assignments

---

### `src/app/dashboard/backtest/page.tsx` (page, server component)

**Analog:** `src/app/dashboard/portfolios/page.tsx` (lines 1-21)

**Server component → client component handoff** — fetch initial data server-side, hand it to a `'use client'` shell:
```tsx
import { listPortfolios, listTemplates } from './_queries'
import { PortfoliosListClient } from './_client/PortfoliosListClient'

export default async function PortfoliosPage() {
  const [portfolios, templates] = await Promise.all([listPortfolios(), listTemplates()])
  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-medium tracking-tight">Portfolios</h1>
        ...
      </header>
      <PortfoliosListClient portfolios={portfolios} />
    </main>
  )
}
```
The Phase 5 page mirrors this shape: server-fetch the user's portfolios list (for the dropdown) + the curated benchmarks (static or via a `_queries.ts`), then render a `<BacktestClient>` client component for the worker-driven UX. The placeholder at `src/app/dashboard/backtest/page.tsx` lines 1-8 is what gets replaced.

---

### `src/components/backtest/BacktestSetupBar.tsx` (component, event-driven)

**Analog:** `src/components/portfolio/PortfolioBuilder.tsx` (lines 76-302)

**Form-state pattern** — `'use client'` + `useForm` + `Controller` for numeric inputs + sticky footer:
```tsx
// Phase 4 lines 100-115: RHF form setup
const methods = useForm<PortfolioInput>({
  resolver: zodResolver(PortfolioSchema),
  defaultValues: initialData ?? ({ ... } as PortfolioInput),
  mode: 'all',
})

// Phase 4 lines 269-296: Controller for numeric input
<Controller control={control} name="investment_amount"
  render={({ field }) => (
    <Input type="number" inputMode="decimal" value={...}
      onChange={e => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      onBlur={field.onBlur} name={field.name} ref={field.ref} />
  )}
/>

// Phase 4 lines 372-384: sticky footer pattern (reuse for setup-bar sticky header)
<footer className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
```
Reuse the sticky `bg-background/95 backdrop-blur border-y` skin but flip to `sticky top-16` (under the dashboard nav). The Setup Bar contains: portfolio `<Select>`, two date `<Input type="date">`, DRIP `<Switch>`/checkbox, rebalance `<Tabs>` segmented control (D-01), benchmark `<Select>`, Run `<Button>`.

For the auto-rerun on toggle (D-02), use `useWatch` like `PortfolioBuilder.tsx` lines 190-198 plus a `useEffect` keyed on the cheap-param subset.

---

### `src/components/backtest/BacktestResults.tsx` (component, composition shell)

**Analog:** `src/components/portfolio/PortfolioBuilder.tsx` (lines 223-385) — section composition.

**Vertical composition with section headers** (D-04 top→bottom order: curve, metrics, bars, footer):
```tsx
// Phase 4 lines 311-370: section pattern
<section className="space-y-3">
  <div className="flex items-center justify-between">
    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
      Instruments
    </h2>
    ...
  </div>
  ...
</section>
```
Same `text-sm font-semibold uppercase tracking-wider text-muted-foreground` heading treatment for each result section. Wrap each chart in its own `<section>`; render the run-summary footer (warnings, conventions, forward-fill counts) as a borderless final block.

---

### `src/components/backtest/MetricsStrip.tsx` (component, sticky stats strip)

**Analog:** `src/components/portfolio/WeightedMetricsStrip.tsx` (lines 1-159) — **direct mirror**.

**Imports & layout** (lines 16-28, 68-76):
```tsx
'use client'
import * as React from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fmtCHF } from '@/lib/portfolio/chf-format'

<TooltipProvider>
  <div className={cn(
    'sticky top-16 z-10 grid grid-cols-3 gap-8 border-y border-border/60 bg-background/95 px-1 py-3 backdrop-blur',
    className,
  )}>
```
Change `grid-cols-3` → `grid-cols-5` for the 5 backtest stats (Total Return, CAGR, MDD, Sharpe, Vol). Reuse the inner `Stat` component verbatim (lines 121-158) — value uses `font-mono text-2xl tabular-nums`, label is `text-[10px] font-medium tracking-wider text-muted-foreground uppercase`.

For MDD's peak/trough tooltip (D-21), use the same `<Tooltip>` wrapper but render two dates inside `<TooltipContent>`.

For percentage formatting, follow `PortfoliosListClient.tsx` lines 24-28:
```tsx
const pctFmt = new Intl.NumberFormat('de-CH', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
```

---

### `src/components/backtest/RunHistoryDrawer.tsx` (component, list + drawer)

**Analog:** `src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx` (lines 56-133) for the **list-row pattern**; `src/app/dashboard/portfolios/_client/CsvImportDialog.tsx` (lines 123-191) for the **dialog wrapper pattern**.

**Relative-time formatter** (PortfoliosListClient.tsx lines 35-50) — reuse verbatim:
```tsx
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const now = Date.now()
  const diffSec = Math.round((then - now) / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const abs = Math.abs(diffSec)
  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
  ...
}
```

**List rendering** (PortfoliosListClient.tsx lines 78-132):
```tsx
<ul className="divide-y divide-border/50">
  {runs.map(r => (
    <li key={r.id} className="group relative grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-4 px-2 py-4 text-sm transition-colors hover:bg-muted/40">
      ...
    </li>
  ))}
</ul>
```

**Drawer wrapper** — `Dialog` from CsvImportDialog.tsx lines 124-189, or substitute the `@base-ui/react` Popover/Sheet noted in RESEARCH (recommend right-side Sheet per research D-discretion).

---

### `src/components/backtest/EquityCurveChart.tsx` (no analog)

**No analog in repo** — first lightweight-charts component. Use **RESEARCH.md Pattern 2** (lines 336-446 of RESEARCH) verbatim as the starting scaffold. Key items the planner must enforce:

- `'use client'` directive (lightweight-charts needs `window`)
- `useLayoutEffect` not `useEffect` (avoid flash on first paint)
- v5 API: `chart.addSeries(LineSeries, opts)` NOT `chart.addLineSeries()`
- `localization.priceFormatter` uses `fmtCHF` from `@/lib/portfolio/chf-format`
- Swiss red `#E3000F` for portfolio series (matches Phase 2 design token)
- `ResizeObserver` for width tracking
- Cleanup: `chart.remove()` + `ro.disconnect()` on unmount

---

### `src/components/backtest/AnnualReturnsChart.tsx` (no analog)

**No analog in repo.** Use **RESEARCH.md Pattern 3** (lines 459-481 of RESEARCH). Planner must pick one of (a) two stacked charts, (b) time-offset trick, (c) overlay with translucent colors — research recommends (a) for clarity. Use the same `'use client'` + `useLayoutEffect` lifecycle scaffold as `EquityCurveChart.tsx`.

---

### `src/lib/backtest/types.ts` (model, pure types)

**Analog:** `src/lib/data/types.ts` (lines 1-43) — **direct mirror**.

**Pattern** — flat type aliases per Postgres row + extended structural types:
```typescript
// src/lib/data/types.ts lines 2-10
export type PriceRow = {
  date: string            // ISO YYYY-MM-DD
  open: number | null
  high: number | null
  low: number | null
  close: number
  adjusted_close: number
  volume: number | null
}
```
Apply this style for `EquityPoint`, `RunRow`, `BacktestParams`, `MetricsResult`, `WorkerRequest`/`WorkerResponse` (discriminated unions per RESEARCH Pattern 1 lines 274-281). Dates are always ISO `YYYY-MM-DD` strings — no `Date` objects in serialised payloads.

---

### `src/lib/backtest/simulate.ts` (utility, pure transform)

**Analog:** `src/lib/portfolio/compute-metrics.ts` (lines 31-65) — **loop+accumulator style** and **Map-based lookups**.

**Pure-function shape with documented contract**:
```typescript
// compute-metrics.ts lines 18-35: function-level contract comment + signature
/**
 * Pure function: ...
 * Contract notes:
 * - `weight` is a percent (0-100). Internally divided by 100 ...
 * - Items whose `instrument_id` is absent from `meta` are silently skipped ...
 * - `null` ... contributes 0 and the id is pushed to the corresponding missing list ...
 * - Results are NOT rounded — caller decides display rounding.
 */
export function computeMetrics(items: Item[], investmentAmount: number, meta: Map<string, InstrumentMeta>): Metrics {
  let ter = 0
  let dy = 0
  const terMissingIds: string[] = []
  ...
  for (const it of items) {
    const m = meta.get(it.instrument_id)
    if (!m) continue
    ...
  }
  return { ter, yield: dy, annualIncome: investmentAmount * dy, ... }
}
```
Use the same shape for `simulate(input: BacktestInput): { equity: EquityPoint[], warnings: BacktestWarning[] }`. Build per-instrument `Map<date, price>` lookups once outside the daily loop (mirrors `meta.get(it.instrument_id)` pattern). Track forward-fill counts per instrument in a `Record<instrument_id, number>` accumulator and emit them in `warnings` (mirrors `terMissingIds.push(...)` pattern).

---

### `src/lib/backtest/metrics.ts` (utility, pure transform)

**Analog:** `src/lib/portfolio/compute-metrics.ts` — **exact match**, same return-shape pattern.

```typescript
// compute-metrics.ts lines 8-16: return-type definition first
export type Metrics = {
  ter: number
  yield: number
  annualIncome: number
  terMissingCount: number
  yieldMissingCount: number
  terMissingIds: string[]
  yieldMissingIds: string[]
}
```
Mirror for `BacktestMetrics = { totalReturn, cagr, maxDrawdown, mddPeakDate, mddTroughDate, sharpe, vol }`. Like compute-metrics, **do not round** — caller (MetricsStrip) decides display formatting. Use `number` math per RESEARCH "Don't Hand-Roll" (decimal.js rejected).

---

### `src/lib/backtest/inputs-hash.ts` (utility, pure hash)

**Analog:** `src/lib/portfolio/normalize-weights.ts` (assumed — pure deterministic fn).

**Concrete implementation** — use **RESEARCH.md Pattern 5** verbatim (lines 553-573). Web Crypto `crypto.subtle.digest('SHA-256', ...)` works in Web Workers. No external dep.

Important: per RESEARCH Anti-Patterns (line 583), **compute the hash inside the worker** — not on the main thread — so it commits to the exact bytes the simulation ran on.

---

### `src/lib/backtest/date-grid.ts` (utility, pure transform)

**Analog:** `src/lib/portfolio/compute-metrics.ts` (loop pattern) + ISO-date string comparisons used throughout `src/lib/data/cache-prices.ts` (line 48: `sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))`).

**Pattern** — keep dates as ISO strings, sort lexicographically, deduplicate via `Set`:
```typescript
// cache-prices.ts line 48 — canonical date-sort pattern
const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
```
Build the union date grid as:
```typescript
const grid = [...new Set(allInstruments.flatMap(i => i.prices.map(p => p.date)))]
  .sort()  // lexicographic = chronological for ISO YYYY-MM-DD
```
Per RESEARCH "Don't Hand-Roll" (line 595), no `date-fns` / `dayjs` — native string compare is sufficient.

---

### `src/lib/backtest/snb.ts` (service, external HTTP fetcher)

**Analog:** `src/lib/data/cache-fx.ts` (lines 60-81) for the **cache read** half; `src/lib/data/getPrices.ts` for the **cache-first orchestration** shape; `src/lib/data/errors.ts` for the **DataError union return** discipline. The external-fetch HTTP shape mirrors what `frankfurter.ts` does (not read in this session — planner should consult during implementation).

**Cache read** (cache-fx.ts lines 60-81):
```typescript
export async function getFxRate(
  supabase: SupabaseClient,
  opts: { base: string; quote: string; date: string },
): Promise<number | DataError> {
  const { data, error } = await supabase
    .from('fx_rates')
    .select('rate')
    .eq('base_currency', opts.base)
    .eq('quote_currency', opts.quote)
    .eq('date', opts.date)
    .maybeSingle()

  if (error) return { kind: 'transient', message: error.message, attempt: 1 }
  if (!data) return { kind: 'not_found', message: `No FX rate for ...` }
  return data.rate as number
}
```
Mirror for `getSnbRate(supabase, { date_month })` and `getSnbRatesRange(supabase, { from, to })`.

**External fetch** — implement per **RESEARCH.md Pattern 4** (lines 489-541). Critical pitfall (RESEARCH Pitfall 2, line 615): `data.snb.ch` returns `Content-Type: text/html` for JSON; **use `JSON.parse(await response.text())`** not `response.json()`.

**Bulk-upsert shape** — mirror cache-fx.ts lines 17-52 (BATCH_SIZE=500, `onConflict` matches UNIQUE constraint, return `{ upserted } | DataError`).

---

### `src/workers/backtest.worker.ts` (no analog)

**No analog in repo** — first Web Worker. Use **RESEARCH.md Pattern 1** (lines 283-309) verbatim. Two critical pitfalls flagged in RESEARCH:

1. **Pitfall 10 (line 666)** — worker file path inside `new Worker(new URL(...))` must be a static literal; verify `npm run build && npm run start` works before declaring victory. Prefer relative `'../workers/backtest.worker.ts'` over `'@/workers/...'` alias until verified.
2. **Anti-pattern (line 583)** — main thread must NOT mutate the payload between sending and hash computation; hash inside the worker.

Worker imports must only pull from `@/lib/backtest/*` — no Next.js APIs, no DOM, no `@/lib/supabase/*`.

---

### `src/app/api/backtest/data/route.ts` (api route, POST)

**Analog:** `src/app/api/instruments/search/route.ts` (lines 17-108).

**Auth + Zod validation + DataError JSON envelope** (lines 17-52):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isDataError, type DataError } from '@/lib/data/errors'

const RequestSchema = z.object({
  query: z.string().trim().min(2).max(200),
  ...
})

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() }
  catch {
    return NextResponse.json(
      { kind: 'invalid_input', message: 'Body must be valid JSON' } satisfies DataError,
      { status: 400 },
    )
  }
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { kind: 'invalid_input', message: parsed.error.issues.map(i => i.message).join('; ') } satisfies DataError,
      { status: 400 },
    )
  }
  ...
  const supabase = await createClient()
  ...
}

// Error → HTTP status mapper (lines 110-120)
function jsonError(err: DataError) {
  const status = err.kind === 'rate_limit' ? 429
    : err.kind === 'not_found' ? 404
    : err.kind === 'invalid_input' ? 400
    : 503 // transient
  return NextResponse.json(err, { status })
}
```
Apply for the batch-data endpoint:
- Zod-validate `{ portfolio_id, benchmark_ticker, start, end }`
- `await createClient()` (server SSR client; RLS auto-scopes to current user)
- Auth check via `supabase.auth.getUser()` (mirror `_actions.ts` lines 24-27)
- `Promise.all([pricesQ, divsQ, fxQ, snbQ])` (RESEARCH Code Examples lines 698-716)
- Reject with 401 if no user; 400 on Zod fail; 503 on Supabase error

**Note on `DataError` extension (Claude's discretion in CONTEXT):** RESEARCH recommends a sibling `BacktestError` union in `src/lib/backtest/errors.ts` (not extending `DataError`) so the data-layer union stays focused.

---

### `src/app/api/backtest/runs/route.ts` (api route, POST/GET)

**Analog:** `src/app/api/instruments/search/route.ts` (route handler shape) + `src/app/dashboard/portfolios/_queries.ts` lines 53-98 (`listPortfolios` — RLS-scoped SELECT with derived fields).

**GET (list) — RLS-scoped list pattern** (`_queries.ts` lines 53-65):
```typescript
const supabase = await createClient()
const { data, error } = await supabase
  .from('portfolios')
  .select('id, name, updated_at, ...')
  .eq('is_template', false)
  .order('updated_at', { ascending: false })
if (error) throw new Error(`listPortfolios: ${error.message}`)
```
For the runs list, mirror:
```typescript
.from('backtest_runs')
.select('id, portfolio_id, params_json, metrics_json, prices_version, computed_at')
.eq('portfolio_id', portfolioId)  // optional filter
.order('computed_at', { ascending: false })
```
RLS does the user_id scoping (matches migration 00009 pattern).

**POST (write run)** — mirror search/route.ts auth+validation prologue, then `supabase.from('backtest_runs').upsert({...}, { onConflict: 'inputs_hash,user_id' })` for D-08 inputs-hash dedup (mirrors `cache-fx.ts` lines 43-45 onConflict pattern).

---

### `src/app/api/backtest/runs/[id]/route.ts` (api route, GET)

**Analog:** `src/app/api/instruments/search/route.ts` (auth+error envelope) + dynamic route param shape per Next.js 16 (planner must verify against `node_modules/next/dist/docs/` per CLAUDE.md).

**Single-row fetch with stale-detection** — per CONTEXT D-09 + RESEARCH Pitfall 9, compute `prices_version` as `MAX(updated_at)` over the run's instruments at fetch time, compare to stored `prices_version`, return `{ ...row, stale: boolean }`. Use `.maybeSingle()` like `_actions.ts` line 94.

---

### `src/app/api/cron/refresh-snb/route.ts` (api route, cron)

**Analog:** `src/app/api/cron/refresh-prices/route.ts` (lines 1-124) — **direct mirror**.

**CRON_SECRET auth pattern** (lines 30-35):
```typescript
const authHeader = request.headers.get('authorization')
const cronSecret = process.env.CRON_SECRET
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return new Response('Unauthorized', { status: 401 })
}
```

**Service-role Supabase client** (lines 52-60) — cron has no user session:
```typescript
import { createClient as createServiceClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  return NextResponse.json({ kind: 'transient', message: 'Server config missing', attempt: 0 }, { status: 503 })
}
const supabase = createServiceClient(url, key, { auth: { persistSession: false } })
```

**Proxy exclusion** — `refresh-prices/route.ts` lines 4-9 documents that `api/cron` is excluded by `proxy.ts` (the new file inherits this — no proxy work needed).

For the SNB cron body, call `fetchSnbPolicyRate()` from `src/lib/data/snb.ts` and upsert into `snb_rates` (mirror `upsertPrices` batch pattern from `cache-prices.ts` lines 41-79).

---

### `supabase/migrations/00009_backtest_runs.sql` (migration, new table + RLS)

**Analog:** `supabase/migrations/00001_initial_schema.sql` §portfolios (lines 20-31 — table) and lines 194-209 (RLS policies). Also `supabase/migrations/00004_portfolio_templates.sql` (lines 22-39) for the **additive-migration file shape**.

**Table definition pattern** (00001 lines 20-31):
```sql
CREATE TABLE public.portfolios (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  ...
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
```

**Full CRUD RLS for owned rows** (00001 lines 192-209):
```sql
CREATE POLICY "Users can view own portfolios"
  ON public.portfolios FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own portfolios"
  ON public.portfolios FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own portfolios"
  ON public.portfolios FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own portfolios"
  ON public.portfolios FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
```

**updated_at trigger** (00001 lines 116-124, 152-154):
```sql
CREATE TRIGGER set_backtest_runs_updated_at
  BEFORE UPDATE ON public.backtest_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
```
(Function `handle_updated_at()` already exists from 00001.)

**FK with cascade** (00001 line 53):
```sql
portfolio_id   UUID        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
```
Apply to `backtest_runs.portfolio_id` per D-10.

**JSONB columns** — Postgres native; no special pattern needed. Per RESEARCH Anti-Pattern (line 585), **store equity curve as a single JSONB column**, not a child table.

**Idempotent additive migration shape** — see `00004_portfolio_templates.sql` lines 22-89: ALTER → ADD CONSTRAINT → CREATE POLICY → INSERT … SELECT WHERE …. Mirror for the new-table migration with `CREATE TABLE IF NOT EXISTS` if planner wants idempotency.

---

### `supabase/migrations/00010_snb_rates.sql` (migration, shared-read table)

**Analog:** `supabase/migrations/00001_initial_schema.sql` §fx_rates (lines 89-100) — **exact same shape** (shared reference data, read-only for authenticated users).

```sql
-- fx_rates: shared reference data (read-only for users)
CREATE TABLE public.fx_rates (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  base_currency   TEXT        NOT NULL,
  quote_currency  TEXT        NOT NULL,
  date            DATE        NOT NULL,
  rate            NUMERIC(15,6) NOT NULL,
  source          TEXT        NOT NULL DEFAULT 'frankfurter',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (base_currency, quote_currency, date)
);

-- 00001 lines 277-282: read-only policy
CREATE POLICY "Authenticated users can read fx_rates"
  ON public.fx_rates FOR SELECT TO authenticated
  USING (true);
```
Mirror for `snb_rates(id, date_month TEXT, rate NUMERIC, source TEXT, ...)` with `UNIQUE (date_month)` + `idx_snb_rates_date_month` index pattern (00001 lines 106-109).

---

## Shared Patterns

### Authentication (server-side)
**Source:** `src/app/dashboard/portfolios/_actions.ts` lines 22-27 and `src/app/api/instruments/search/route.ts` lines 54-55.
**Apply to:** All `/api/backtest/*` route handlers, all Server Actions.
```typescript
const supabase = await createClient()  // SSR client, cookies auto-bound
const { data: authData } = await supabase.auth.getUser()
if (!authData.user) return { ok: false, error: 'Not authenticated' }
// OR (route handler): return NextResponse.json({ kind: 'invalid_input', ... }, { status: 401 })
```
Note from `_actions.ts` line 14 comment: **`createClient()` is awaited** (`cookies()` is async in Next.js 16).

### Error Discriminated Union
**Source:** `src/lib/data/errors.ts` (lines 1-22) — `DataError` union with `isDataError` typeguard.
**Apply to:** All worker, library, and API errors. Per RESEARCH/CONTEXT, create a **sibling `BacktestError` union** in `src/lib/backtest/errors.ts`:
```typescript
// Mirror pattern from src/lib/data/errors.ts
export type BacktestError =
  | { kind: 'no_overlap'; message: string }
  | { kind: 'insufficient_history'; message: string; minStart: string }
  | { kind: 'benchmark_unavailable'; message: string; ticker: string }
  | { kind: 'data_gap'; message: string; ticker: string; gapDays: number }
  | { kind: 'unknown'; message: string }

const VALID_KINDS = new Set<string>(['no_overlap', 'insufficient_history', ...])
export function isBacktestError(v: unknown): v is BacktestError { ... }
```
Mirrors `DataError` pattern verbatim. Don't extend `DataError` — keep concerns separated (data-layer vs sim-layer).

### CHF formatting
**Source:** `src/lib/portfolio/chf-format.ts` (lines 1-17).
**Apply to:** All chart axis labels, tooltips, metrics strip values, run-history rows.
```typescript
import { fmtCHF } from '@/lib/portfolio/chf-format'
// Output: "CHF 12'345.67" with U+2019 apostrophe (Swiss)
```
Wire into lightweight-charts `localization.priceFormatter` (see RESEARCH Pattern 2 line 369).

### Percentage formatting
**Source:** `src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx` lines 24-33.
```typescript
const pctFmt = new Intl.NumberFormat('de-CH', {
  style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2,
})
function formatPct(v: number | null): string {
  if (v === null) return '—'
  return pctFmt.format(v)
}
```
**Apply to:** Total Return, CAGR, MDD, Vol in MetricsStrip; annual-bars chart axis labels.

### Server Actions
**Source:** `src/app/dashboard/portfolios/_actions.ts` (full file).
**Apply to:** Any Server Action wrapper added in Phase 5 (CONTEXT cites this as the canonical pattern). Note: RESEARCH leans on **API routes** for `/api/backtest/*` rather than Server Actions (RLS + JSON envelope are uniform there), but if a "Save preferences" or similar mutation is added, mirror this file:
- `'use server'` directive
- `await createClient()` + auth check
- `try { JSON.parse(formData.get('payload')) } catch { return { ok: false, ... } }`
- Zod `safeParse` with first-issue message
- Discriminated `{ ok: true, ... } | { ok: false, error }` return
- `revalidatePath` on success, no `redirect()`

### Numeric coercion from Supabase
**Source:** `src/app/dashboard/portfolios/_queries.ts` lines 25-38 — Postgres `NUMERIC` can come back as string OR number.
```typescript
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}
```
**Apply to:** Reading `prices.adjusted_close`, `dividends.amount`, `fx_rates.rate`, `snb_rates.rate`, `portfolio_instruments.weight` in the batch-data endpoint. The worker math assumes `number` — coerce at the API boundary, not inside the worker.

### Cache-first / batch upsert (BATCH_SIZE=500)
**Source:** `src/lib/data/cache-prices.ts` lines 41-79 and `src/lib/data/cache-fx.ts` lines 17-52.
**Apply to:** SNB-rates bulk-seed script and cron upsert.
```typescript
const BATCH_SIZE = 500
for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
  const batch = mapped.slice(i, i + BATCH_SIZE)
  const { error } = await supabase.from('snb_rates')
    .upsert(batch, { onConflict: 'date_month' })
  if (error) return { kind: 'transient', message: `snb_rates upsert: ${error.message}`, attempt: 1 }
}
```

### Proxy exclusion for cron
**Source:** `src/app/api/cron/refresh-prices/route.ts` lines 4-9 — `/api/cron/*` is excluded by `proxy.ts` negative-lookahead matcher.
**Apply to:** The new `/api/cron/refresh-snb` route — no proxy work needed (inherits exclusion).

### Sticky-with-backdrop chrome
**Source:** `src/components/portfolio/WeightedMetricsStrip.tsx` line 72 + `PortfolioBuilder.tsx` line 372.
```tsx
'sticky top-16 z-10 ... border-y border-border/60 bg-background/95 ... backdrop-blur'
// or for bottom-sticky footer:
'sticky bottom-0 ... border-t border-border/60 bg-background/95 ... backdrop-blur'
```
**Apply to:** BacktestSetupBar (`sticky top-16`) and MetricsStrip (sticky below results-section top). Phase 4 metrics strip sits at `top-16` (under TopNav); the backtest page may need `top-32` if both setup bar and metrics strip are sticky — planner picks.

### File-level documentation comment
**Source:** Every Phase 4 file (e.g., `_actions.ts` lines 3-13, `WeightedMetricsStrip.tsx` lines 3-14, `cache-prices.ts` lines 1-9).
**Apply to:** Every new file. Pattern: top-of-file `/** ... */` block describing purpose, key contract notes, and any pitfalls referenced by line number to RESEARCH/CONTEXT.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/backtest/EquityCurveChart.tsx` | component (canvas chart) | streaming | First lightweight-charts integration in repo. Use RESEARCH Pattern 2 as scaffold. |
| `src/components/backtest/AnnualReturnsChart.tsx` | component (canvas chart) | streaming | No histogram-chart code in repo. Use RESEARCH Pattern 3. |
| `src/workers/backtest.worker.ts` | worker | event-driven (postMessage) | First Web Worker in repo. Use RESEARCH Pattern 1; verify prod-build path per RESEARCH Pitfall 10. |

For these three, the planner should reference the RESEARCH.md "Code Examples" / "Architecture Patterns" sections verbatim — there is no in-repo prior art to copy. Insert a `checkpoint:human-verify` task for the worker-bundle prod build (per RESEARCH §"Package Legitimacy Audit" recommendation) before declaring the worker shipped.

## Metadata

**Analog search scope:** `src/lib/`, `src/components/`, `src/app/`, `supabase/migrations/`
**Files scanned:** ~25 (full read of 14 analogs; partial read of 11 reference files)
**Pattern extraction date:** 2026-06-23
