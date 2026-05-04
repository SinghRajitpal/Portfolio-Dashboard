---
phase: 04-portfolio-builder
plan: 04
type: execute
wave: 3
depends_on: ["04-02"]
files_modified:
  - src/components/portfolio/PortfolioBuilder.tsx
  - src/components/portfolio/InstrumentRow.tsx
  - src/components/portfolio/InstrumentCombobox.tsx
  - src/components/portfolio/WeightedMetricsStrip.tsx
  - src/components/portfolio/TotalBadge.tsx
  - src/components/portfolio/group-search-results.ts
  - src/components/portfolio/group-search-results.test.ts
autonomous: true
requirements: [PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, META-01]

must_haves:
  truths:
    - "PortfolioBuilder renders a single full-page form with: name input, investment_amount input, sticky metrics strip, instrument list, inline combobox, save/cancel buttons"
    - "Builder uses react-hook-form 7 with zodResolver(PortfolioSchema) for validation"
    - "Save button is disabled while form is invalid (sum != 100, empty name, empty items, etc.)"
    - "InstrumentCombobox calls POST /api/instruments/search with debounce >= 250ms and renders DataError kinds per CONTEXT (rate_limit→toast, transient→inline, not_found→empty, invalid_input→inline)"
    - "Search results group by isin || name; expanding a group reveals per-venue listings; user picks a specific listing (no auto-pick)"
    - "ISIN search results with name='' display fallback `{ticker} ({exchange})`"
    - "WeightedMetricsStrip renders TER/Yield/AnnualIncome live via useWatch + computeMetrics, with footnotes for missing data"
    - "TotalBadge renders Σ% with state colors: neutral=100, warning=close, error=invalid"
    - "Normalize-to-100 button rescales weights via normalizeTo100 and updates form state"
    - "Removing a row leaves the gap (no auto-redistribute)"
    - "Builder accepts initialData prop for edit mode and seedData prop for template/CSV pre-fill"
    - "Builder calls onSubmit with FormData containing 'payload' field; parent decides what to do (Server Action vs preview)"
    - "groupSearchResults groups by isin || name, returning [{key, displayName, listings: SearchResult[]}]"
  artifacts:
    - path: "src/components/portfolio/PortfolioBuilder.tsx"
      provides: "Client builder component (RHF + zod) — used by new/edit pages and CSV preview"
      exports: ["PortfolioBuilder", "PortfolioBuilderProps"]
    - path: "src/components/portfolio/InstrumentRow.tsx"
      provides: "Single row: ticker, name, weight input, remove button"
      exports: ["InstrumentRow"]
    - path: "src/components/portfolio/InstrumentCombobox.tsx"
      provides: "Popover+Command-based combobox calling /api/instruments/search with debounce"
      exports: ["InstrumentCombobox"]
    - path: "src/components/portfolio/WeightedMetricsStrip.tsx"
      provides: "Sticky strip with weighted TER, weighted yield, est. annual income, footnotes"
      exports: ["WeightedMetricsStrip"]
    - path: "src/components/portfolio/TotalBadge.tsx"
      provides: "Σ% running total badge"
      exports: ["TotalBadge"]
    - path: "src/components/portfolio/group-search-results.ts"
      provides: "Pure: group SearchResult[] by logical instrument (isin || name)"
      exports: ["groupSearchResults", "GroupedResult"]
  key_links:
    - from: "src/components/portfolio/PortfolioBuilder.tsx"
      to: "PortfolioSchema (Plan 02)"
      via: "useForm({ resolver: zodResolver(PortfolioSchema) })"
      pattern: "zodResolver\\(PortfolioSchema\\)"
    - from: "src/components/portfolio/InstrumentCombobox.tsx"
      to: "POST /api/instruments/search"
      via: "fetch with body {query, limit}, response is SearchResult[] | DataError"
      pattern: "/api/instruments/search"
    - from: "src/components/portfolio/WeightedMetricsStrip.tsx"
      to: "computeMetrics (Plan 02)"
      via: "useWatch on items + investment_amount → computeMetrics"
      pattern: "computeMetrics\\("
    - from: "src/components/portfolio/PortfolioBuilder.tsx"
      to: "normalizeTo100 (Plan 02)"
      via: "Normalize button click handler"
      pattern: "normalizeTo100\\("
---

<objective>
Build the client-side editor used by the create, edit, template-preview, and CSV-preview flows. One reusable PortfolioBuilder component owns the form state; smaller components compose into it. Zero direct DB access — everything flows through the parent's `onSubmit` callback.

Purpose: The builder is the single most-used surface in Phase 4. Encapsulating it in one component means the new/edit/template/CSV flows all reuse the exact same UI and validation, eliminating drift.
Output: 5 client components + 1 pure helper (with tests). All client components are 'use client' and consume Plan 02 pure libraries + the existing /api/instruments/search endpoint.
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-portfolio-builder/04-CONTEXT.md
@.planning/phases/04-portfolio-builder/04-RESEARCH.md
@.planning/phases/04-portfolio-builder/04-02-pure-libs-and-schema-PLAN.md
@CLAUDE.md
@AGENTS.md
@src/components/ui/popover.tsx
@src/components/ui/command.tsx
@src/components/ui/form.tsx
@src/components/ui/sonner.tsx
@src/components/ui/tooltip.tsx
@src/components/ui/input.tsx
@src/components/ui/button.tsx
@src/lib/data/types.ts
@src/lib/data/errors.ts
@src/app/api/instruments/search/route.ts

<interfaces>
From src/lib/data/types.ts (Phase 3):
```typescript
export type SearchResult = {
  ticker: string; exchange: string; name: string
  type: string; currency: string; isin: string | null
}
```

From src/lib/data/errors.ts (Phase 3):
```typescript
export type DataError =
  | { kind: 'rate_limit'; message: string; retryAfter?: Date }
  | { kind: 'not_found'; message: string }
  | { kind: 'transient'; message: string; attempt: number }
  | { kind: 'invalid_input'; message: string }
export function isDataError(v: unknown): v is DataError
```

From src/app/dashboard/portfolios/_schema.ts (Plan 02):
```typescript
export const PortfolioSchema: z.ZodType
export type PortfolioInput = {
  id?: string; name: string; description?: string
  investment_amount: number
  items: { instrument_id: string; ticker: string; name: string; weight: number }[]
}
```

From src/lib/portfolio/{compute-metrics,normalize-weights,chf-format}.ts (Plan 02):
```typescript
export function computeMetrics(items, investmentAmount, meta): Metrics
export function normalizeTo100(weights: number[]): number[]
export function fmtCHF(amount: number): string
```

POST /api/instruments/search (Phase 3 contract):
- Body: { query: string (min 2, max 200), limit?: number }
- Response: SearchResult[] | DataError (JSON)
- Auth required (proxy.ts protects this path)
</interfaces>

<contracts_to_export>
```typescript
// PortfolioBuilder.tsx
export type PortfolioBuilderMode = 'create' | 'edit' | 'preview'
export type PortfolioBuilderProps = {
  mode: PortfolioBuilderMode
  initialData?: PortfolioInput            // edit mode pre-fill OR template/CSV seed
  instrumentsMeta: Record<string, { expense_ratio: number | null; dividend_yield: number | null }>
  onSubmit: (data: PortfolioInput) => Promise<void>
  onCancel?: () => void
  submitLabel?: string                    // defaults: 'Save' / 'Save changes' / 'Save imported portfolio'
  saving?: boolean                        // parent-controlled pending state
  errorMessage?: string | null            // parent-controlled error to display
}
export function PortfolioBuilder(props: PortfolioBuilderProps): JSX.Element

// InstrumentRow.tsx
export type InstrumentRowProps = {
  index: number
  ticker: string
  name: string
  weightFieldName: string                 // RHF field path
  onRemove: () => void
  highlighted?: boolean                   // for footnote→row hover
}
export function InstrumentRow(props: InstrumentRowProps): JSX.Element

// InstrumentCombobox.tsx
export type InstrumentComboboxProps = {
  excludeIds: string[]                    // already-added instruments
  onSelect: (result: SelectedInstrument) => void
}
export type SelectedInstrument = {
  instrument_id: string                   // resolved id from search results
  ticker: string
  name: string
  exchange: string
  currency: string
}
export function InstrumentCombobox(props: InstrumentComboboxProps): JSX.Element

// WeightedMetricsStrip.tsx
export type WeightedMetricsStripProps = {
  control: Control<PortfolioInput>
  instrumentsMeta: Record<string, { expense_ratio: number | null; dividend_yield: number | null }>
  onHighlightIds?: (ids: string[]) => void
}

// TotalBadge.tsx
export type TotalBadgeProps = { control: Control<PortfolioInput> }

// group-search-results.ts
export type GroupedResult = {
  key: string                             // isin || name
  displayName: string                     // first listing's name OR ticker fallback
  listings: SearchResult[]
}
export function groupSearchResults(results: SearchResult[]): GroupedResult[]
```
</contracts_to_export>

<critical_constraints>
- ALL files in this plan are Client Components — first line of each .tsx is `'use client'`.
- Per RESEARCH "Pitfall 9": These components NEVER import from `@/lib/supabase/server` or `@/app/dashboard/portfolios/_queries` (server-only). They receive `instrumentsMeta` as a prop from a Server Component parent (Plan 05).
- InstrumentCombobox MUST debounce search requests (250ms minimum per RESEARCH "Pitfall 6"). Use a hand-rolled `setTimeout`/`clearTimeout` wrapper or the `useDebouncedCallback` pattern (no new dep).
- Search input MIN length: 2 characters (mirrors API contract).
- AbortController to cancel in-flight fetches when query changes.
- ISIN search results have `name === ''` per RESEARCH "Pitfall 3" — InstrumentCombobox display falls back to `${ticker} (${exchange})`.
- DataError rendering per CONTEXT:
  - `rate_limit` → toast.error('Search rate-limited; retry shortly') via sonner
  - `transient` → inline text 'Search temporarily unavailable, try again'
  - `not_found` → empty results (no error UI)
  - `invalid_input` → inline 'Invalid input'
- The combobox does NOT own a database id. Search returns SearchResult (ticker + exchange) without instrument id. To get instrument_id for the form, the combobox EITHER (a) calls a separate resolve endpoint OR (b) the upstream Plan 05 page provides a `resolveInstrument(ticker, exchange) → instrument_id` callback that hits getInstrumentByTicker. Decision for this plan: option (b) — combobox accepts an optional `onResolve` prop OR emits the SearchResult and lets the parent resolve.

  Actually, re-reading the contract: search-route response covers ISIN cache hits which already imply the ticker exists in `instruments` (see `route.ts:69`); but Yahoo text search returns instruments NOT in our DB. The flow must:
  1. User selects a SearchResult
  2. Builder POSTs `/api/instruments/resolve` (NEW — but actually we can reuse upsert behavior in /api/instruments/search) OR calls a new lightweight endpoint
  
  Decision: ADD a lightweight POST /api/instruments/resolve endpoint in this plan that accepts `{ticker, exchange?, name?, currency?, type?, isin?}` and either returns the existing instruments.id or upserts a stub row (so the user can save the portfolio). This endpoint runs server-side and uses the user-context Supabase client.

- Sticky metrics strip uses CSS `position: sticky` with `top: 4rem` (or matching the top nav height — confirm against Phase 2 nav height).
- `useFieldArray` from react-hook-form for the items array (CONTEXT-locked decision, RESEARCH Pattern 3).
- Per AGENTS.md: Next.js 16 docs in node_modules are authoritative. The `<Form />` shadcn wrapper requires `FormProvider` from RHF — the import path is `@/components/ui/form` (added in Plan 01) which is itself a client component. shadcn `Form` exposes `Form`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `FormField`. Use these for input rows; raw inputs OK for the dynamic items array (use `useFieldArray` directly).
- META-01: every InstrumentRow displays ticker + name (and optionally currency/exchange in muted text). The expense_ratio + dividend_yield are not shown per-row in v1 (they aggregate into the metrics strip); deferred to a future hover/expand if needed.
</critical_constraints>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure helper — groupSearchResults + tests + /api/instruments/resolve route</name>
  <files>src/components/portfolio/group-search-results.ts, src/components/portfolio/group-search-results.test.ts, src/app/api/instruments/resolve/route.ts</files>
  <behavior>
    groupSearchResults:
    - Empty input → []
    - Single result → [{ key: result.isin||result.name, displayName: result.name || result.ticker, listings: [result] }]
    - Two results with same isin → grouped: listings has both
    - Two results with same name but different isin → NOT grouped (different logical instruments / share classes)
    - Two results with same name and both isin=null → grouped by name
    - displayName: prefer first listing's non-empty name; else `{ticker} ({exchange})` fallback (covers ISIN cache hits with empty name)
    - Result order within a group preserves input order
    - Group order preserves first-occurrence order

    /api/instruments/resolve:
    - POST { ticker: string, exchange?: string, name?: string, currency?: string, type?: string, isin?: string | null }
    - Response: { id: string } (200) | DataError (400/4xx)
    - Validates body with Zod
    - Auth required (proxy.ts already covers this path since it's not /api/cron)
    - Behavior: SELECT from instruments WHERE ticker = $1 AND (exchange IS NOT DISTINCT FROM $2). If found, return id. If not, INSERT a stub row with the provided fields (currency default 'USD', type default 'etf', data_source 'resolved') and return the new id.
    - The unique constraint on instruments.ticker means concurrent resolves for the same ticker must coexist; use upsert with ON CONFLICT (ticker) DO NOTHING then SELECT.
  </behavior>
  <action>
    Step 1 — Implement groupSearchResults:

    ```ts
    // src/components/portfolio/group-search-results.ts
    import type { SearchResult } from '@/lib/data/types'

    export type GroupedResult = {
      key: string
      displayName: string
      listings: SearchResult[]
    }

    export function groupSearchResults(results: SearchResult[]): GroupedResult[] {
      const groups = new Map<string, GroupedResult>()
      for (const r of results) {
        // Use isin if present and non-empty; else name (lowercased + trimmed) as the logical key.
        // Fall back to ticker if name is also empty (defensive — should not happen in practice).
        const key = r.isin && r.isin.length > 0
          ? `isin:${r.isin}`
          : r.name && r.name.trim().length > 0
            ? `name:${r.name.trim().toLowerCase()}`
            : `ticker:${r.ticker}`
        if (!groups.has(key)) {
          const displayName = r.name && r.name.trim().length > 0
            ? r.name
            : `${r.ticker} (${r.exchange})`
          groups.set(key, { key, displayName, listings: [] })
        }
        groups.get(key)!.listings.push(r)
      }
      return Array.from(groups.values())
    }
    ```

    Step 2 — Tests in group-search-results.test.ts: cover all behaviors listed. Use vitest.

    Step 3 — Implement /api/instruments/resolve:

    ```ts
    // src/app/api/instruments/resolve/route.ts
    import { NextRequest, NextResponse } from 'next/server'
    import { z } from 'zod'
    import { createClient } from '@/lib/supabase/server'
    import type { DataError } from '@/lib/data/errors'

    const RequestSchema = z.object({
      ticker: z.string().trim().min(1).max(40),
      exchange: z.string().trim().max(20).optional(),
      name: z.string().trim().max(500).optional(),
      currency: z.string().trim().max(10).optional(),
      type: z.string().trim().max(40).optional(),
      isin: z.string().trim().length(12).optional().nullable(),
    })

    export async function POST(request: NextRequest) {
      let body: unknown
      try { body = await request.json() } catch {
        return NextResponse.json(
          { kind: 'invalid_input', message: 'Body must be valid JSON' } satisfies DataError,
          { status: 400 },
        )
      }
      const parsed = RequestSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { kind: 'invalid_input', message: parsed.error.issues[0].message } satisfies DataError,
          { status: 400 },
        )
      }
      const { ticker, exchange, name, currency, type, isin } = parsed.data
      const sb = await createClient()

      // Try existing first
      let q = sb.from('instruments').select('id').eq('ticker', ticker)
      if (exchange) q = q.eq('exchange', exchange)
      const { data: existing } = await q.limit(1).maybeSingle()
      if (existing?.id) return NextResponse.json({ id: existing.id })

      // Upsert stub
      const { data: inserted, error } = await sb
        .from('instruments')
        .upsert(
          {
            ticker,
            name: name ?? ticker,
            exchange: exchange ?? null,
            currency: currency ?? 'USD',
            type: (type ?? 'etf') as 'etf',
            isin: isin ?? null,
            data_source: 'resolved',
          },
          { onConflict: 'ticker' },
        )
        .select('id')
        .single()

      if (error || !inserted) {
        return NextResponse.json(
          { kind: 'transient', message: error?.message ?? 'resolve failed', attempt: 1 } satisfies DataError,
          { status: 503 },
        )
      }
      return NextResponse.json({ id: inserted.id })
    }
    ```

    NOTE: instruments table RLS (Phase 1) — verify whether INSERT is allowed for authenticated users. Re-read 00001_initial_schema.sql. If instruments INSERT is NOT permitted by RLS, this endpoint will fail. In that case, either (a) add an INSERT policy in a new migration `00007_instruments_resolve_policy.sql` with `WITH CHECK (data_source = 'resolved')` to allow user-driven resolves only, or (b) call the supabase service role from this route (less safe). Choose (a) and add the migration as a sub-step of this task.

    Migration sub-step:
    ```sql
    -- supabase/migrations/00007_instruments_resolve_policy.sql
    CREATE POLICY "Authenticated users can resolve new instruments"
      ON public.instruments FOR INSERT TO authenticated
      WITH CHECK (data_source = 'resolved');

    CREATE POLICY "Authenticated users can read instruments"
      ON public.instruments FOR SELECT TO authenticated
      USING (true);
    ```

    First inspect 00001 to confirm whether SELECT/INSERT policies exist on instruments. If a SELECT-all policy already exists, omit it from 00007 (idempotency only matters for INSERT).

    Apply migration: `npx supabase db push`.
  </action>
  <verify>
    <automated>npm run test:unit -- src/components/portfolio/group-search-results.test.ts 2>&1 | tail -15 && test -f src/app/api/instruments/resolve/route.ts && grep -q "data_source" src/app/api/instruments/resolve/route.ts && npx tsc --noEmit 2>&1 | tail -10</automated>
  </verify>
  <done>groupSearchResults exported with passing tests; /api/instruments/resolve POST handler exists with Zod validation; required RLS migration applied if needed; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: InstrumentCombobox + InstrumentRow + TotalBadge — small focused components</name>
  <files>src/components/portfolio/InstrumentCombobox.tsx, src/components/portfolio/InstrumentRow.tsx, src/components/portfolio/TotalBadge.tsx</files>
  <action>
    Create InstrumentCombobox.tsx ('use client') per RESEARCH Pattern 4:

    Imports: `useState`, `useEffect`, `useRef` from 'react'; Popover/PopoverContent/PopoverTrigger from `@/components/ui/popover`; Command/CommandInput/CommandList/CommandEmpty/CommandGroup/CommandItem from `@/components/ui/command`; toast from 'sonner'; isDataError from '@/lib/data/errors'; SearchResult from '@/lib/data/types'; groupSearchResults + GroupedResult from './group-search-results'; ChevronRight icon from lucide-react.

    Implementation:
    1. State: `open`, `query`, `results: SearchResult[]`, `error: string | null`, `loading: boolean`, `expandedKey: string | null`.
    2. Debounced search: `useEffect` watches `query`; sets a `setTimeout(250ms)` that fires the fetch; cleans up on next change. Track an `AbortController` ref to cancel stale fetches.
    3. Fetch logic:
       ```ts
       const r = await fetch('/api/instruments/search', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ query: q, limit: 20 }),
         signal: ac.signal,
       })
       const json = await r.json()
       if (isDataError(json)) {
         switch (json.kind) {
           case 'rate_limit':    toast.error('Search rate-limited; retry shortly'); break
           case 'transient':     setError('Search temporarily unavailable'); break
           case 'invalid_input': setError('Invalid input'); break
           case 'not_found':     setResults([]); break  // no error UI
         }
         return
       }
       setResults(json as SearchResult[])
       ```
    4. Render: `<Popover open={open} onOpenChange={setOpen}>` with a Trigger button labelled "Add instrument" (Swiss-red outline). PopoverContent contains `<Command>` with CommandInput bound to query, CommandList showing groups via groupSearchResults(results.filter(r => !excludeIds.includes(r.ticker+r.exchange))). Each group: a CommandItem header (click toggles expandedKey); when expanded, render listings as nested CommandItems with `{ticker}.{exchange}` + currency + listing-date (if available).
    5. Selecting a listing: call POST /api/instruments/resolve with the SearchResult to get instrument_id, then call props.onSelect({ instrument_id, ticker, name, exchange, currency }).
    6. ISIN-cache fallback: when result.name === '', display `{ticker} ({exchange})` per RESEARCH Pitfall 3.
    7. Accessibility: aria-label='Add instrument' on trigger; CommandInput has `placeholder='Search ticker, name, or ISIN…'`; ESC closes popover (cmdk default).
    8. The combobox does NOT participate in RHF state — it just emits onSelect, and the PortfolioBuilder appends to its useFieldArray.

    Create InstrumentRow.tsx ('use client'):
    - Props: `{ index, ticker, name, weightFieldName, onRemove, highlighted? }`
    - Layout: 4-col grid (`grid-cols-[80px_1fr_120px_auto]`): ticker (mono, bold), name (truncate-on-overflow), weight Input (numeric, step=0.5, min=0, max=100, suffix='%'), remove Button (icon X, ghost, aria-label='Remove').
    - Highlighted state: `bg-muted/40` ring when `highlighted` is true (footnote→row link from metrics strip).
    - Weight input: register via `register(weightFieldName, { valueAsNumber: true })` from RHF parent — this row component takes `register` via context (`useFormContext`) since RHF supports nested provider. Document the parent must wrap children in `<FormProvider>` from RHF (NOT shadcn `<Form>` which is a wrapper around the same).
    - Borderless visual style per Phase 2 Swiss-minimalist (no shadow, just whitespace + thin separator if needed).

    Create TotalBadge.tsx ('use client'):
    - Props: `{ control }` (RHF Control)
    - useWatch({ control, name: 'items' }) → compute sum
    - Render `Σ {sum.toFixed(2)}%` with state colors:
      - Math.abs(sum - 100) <= 0.01 → text-foreground (neutral)
      - Math.abs(sum - 100) <= 5    → text-amber-600 (warning)
      - else                        → text-[#E3000F] (Swiss-red error)
    - Tooltip (using @/components/ui/tooltip) explaining "Total must be 100%; current: ..."
    - Position: aside the running list (parent decides exact placement).

    Use react-hook-form + sonner + shadcn primitives directly (NO custom popover or toast — RESEARCH "Don't Hand-Roll").
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -20 && grep -q "'use client'" src/components/portfolio/InstrumentCombobox.tsx && grep -q "'use client'" src/components/portfolio/InstrumentRow.tsx && grep -q "'use client'" src/components/portfolio/TotalBadge.tsx && grep -q "/api/instruments/search" src/components/portfolio/InstrumentCombobox.tsx && grep -q "/api/instruments/resolve" src/components/portfolio/InstrumentCombobox.tsx && grep -q "isDataError" src/components/portfolio/InstrumentCombobox.tsx && grep -q "useWatch" src/components/portfolio/TotalBadge.tsx</automated>
  </verify>
  <done>Three components exist as Client Components; combobox calls /api/instruments/search + /api/instruments/resolve, handles DataError kinds; TotalBadge uses useWatch with state colors; tsc passes.</done>
</task>

<task type="auto">
  <name>Task 3: WeightedMetricsStrip + PortfolioBuilder — main composition</name>
  <files>src/components/portfolio/WeightedMetricsStrip.tsx, src/components/portfolio/PortfolioBuilder.tsx</files>
  <action>
    Create WeightedMetricsStrip.tsx ('use client') per RESEARCH Pattern 3:

    Props: `{ control, instrumentsMeta, onHighlightIds }`
    Implementation:
    1. `const items = useWatch({ control, name: 'items' }) ?? []`
    2. `const amount = useWatch({ control, name: 'investment_amount' }) ?? 0`
    3. Convert instrumentsMeta record to a Map<id, {expense_ratio, dividend_yield}>.
    4. `const m = computeMetrics(items, amount, metaMap)`
    5. Render 3-stat strip (grid-cols-3 gap-8 sticky top-16):
       - Weighted TER: `${(m.ter * 100).toFixed(2)}%` (×100 because compute returns fraction)
       - Weighted Yield: `${(m.yield * 100).toFixed(2)}%`
       - Est. Annual Income: `fmtCHF(m.annualIncome)`
    6. Each stat: small uppercase label on top, large number below — mirrors Phase 2 dashboard "metrics strip" pattern.
    7. Tooltip (shadcn Tooltip) on each stat with formula explanation:
       - TER tooltip: "Weighted by holding percentage. Σ (weight_i × expense_ratio_i)"
       - Yield tooltip: "Weighted by holding percentage. Σ (weight_i × dividend_yield_i)"
       - Income tooltip: "Estimated annual dividend income. Investment amount × Weighted Yield. Past yields don't predict future dividends."
    8. Footnote per stat when missing data:
       - `m.terMissingCount > 0` → small text "Excludes {count} instrument(s) with no expense-ratio data"; on hover/click, call `onHighlightIds(m.terMissingIds)` so parent highlights affected rows
       - Same pattern for yield (`m.yieldMissingCount`)

    Create PortfolioBuilder.tsx ('use client') — the composition root:

    Imports: useForm, useFieldArray, FormProvider, Controller, useFormContext from 'react-hook-form'; zodResolver from '@hookform/resolvers/zod'; PortfolioSchema, PortfolioInput from '@/app/dashboard/portfolios/_schema'; normalizeTo100 from '@/lib/portfolio/normalize-weights'; fmtCHF from '@/lib/portfolio/chf-format'; Input, Button, Label from shadcn; useState, useMemo from 'react'; toast from 'sonner'; useRouter from 'next/navigation'; child components.

    Layout (top → bottom, single scrollable page, max-w-3xl mx-auto py-8):
    1. Header: portfolio name input (large) + investment_amount input. Inline labels above each.
    2. Sticky WeightedMetricsStrip (top-16) — uses control + instrumentsMeta from prop.
    3. Instrument list: rendered via useFieldArray('items'). Each row = InstrumentRow. Above the list: Σ TotalBadge + "Normalize to 100%" Button (calls normalizeTo100 on current weights, calls fields.update or fields.replace).
    4. Inline InstrumentCombobox below the list — onSelect appends a new field {instrument_id, ticker, name, weight: 0}. After append, the row appears with weight=0; user must enter a weight.
    5. Sticky footer (bottom or below content): Cancel (calls onCancel or router.back()) + Save (Swiss-red primary, type=submit, disabled when !isValid OR saving).
    6. Error banner (top of form): displays errorMessage prop OR formState.errors top-level.

    State / wiring:
    - useForm<PortfolioInput>({ resolver: zodResolver(PortfolioSchema), defaultValues: initialData ?? { name: '', investment_amount: 10000, items: [] }, mode: 'onChange' })
    - mode 'onChange' so isValid updates live and Save button reactivity is immediate.
    - useFieldArray({ control, name: 'items' }) — gives append/remove/update/replace.
    - handleSubmit(async (data) => { await onSubmit(data) }) — parent decides what to do (Server Action with FormData wrapper, or just preview state).
    - Hover state for missing-data footnotes: `const [highlightedIds, setHighlightedIds] = useState<string[]>([])` — passed to each InstrumentRow's `highlighted` prop based on its instrument_id.
    - Submit label defaults: 'Save' (create), 'Save changes' (edit), 'Save imported portfolio' (preview).
    - Wrap whole form in `<FormProvider {...methods}>` so InstrumentRow can use useFormContext().

    Investment amount input formatting:
    - The raw input is a numeric `<Input type="number" step="100" min="0">`.
    - A small helper text below the input shows the formatted value: `fmtCHF(amount)` — gives the user a live preview ("CHF 10'000").

    Cancel button:
    - mode 'create' → `router.push('/dashboard/portfolios')`
    - mode 'edit' → `router.push('/dashboard/portfolios')`
    - mode 'preview' → call `onCancel()` (parent decides, e.g., reopen file picker)

    DO NOT call any Server Action inside this component. The parent (Plan 05) wires onSubmit to savePortfolio.

    Run `npx tsc --noEmit` after.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -20 && grep -q "'use client'" src/components/portfolio/PortfolioBuilder.tsx && grep -q "'use client'" src/components/portfolio/WeightedMetricsStrip.tsx && grep -q "zodResolver(PortfolioSchema)" src/components/portfolio/PortfolioBuilder.tsx && grep -q "useFieldArray" src/components/portfolio/PortfolioBuilder.tsx && grep -q "computeMetrics" src/components/portfolio/WeightedMetricsStrip.tsx && grep -q "normalizeTo100" src/components/portfolio/PortfolioBuilder.tsx && grep -q "fmtCHF" src/components/portfolio/PortfolioBuilder.tsx</automated>
  </verify>
  <done>WeightedMetricsStrip + PortfolioBuilder exist as Client Components, wire RHF + zod + computeMetrics + normalizeTo100 + fmtCHF; tsc clean; full build passes (`npm run build` may be deferred to Plan 05 since pages haven't wired yet, but all components type-check standalone).</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean across all new components
- `npm run test:unit` includes group-search-results tests, all green
- All components use 'use client' and consume Plan 02 pure libs + shadcn primitives + RHF + zod
- /api/instruments/resolve endpoint exists and is auth-protected (proxy.ts already covers /api/* except /api/cron)
</verification>

<success_criteria>
1. 5 client components + 1 pure helper file all created with documented contracts
2. /api/instruments/resolve route accepts ticker [+exchange] and returns {id} (existing or upserted)
3. groupSearchResults unit tests pass for all 6 behavioral cases
4. PortfolioBuilder is reusable across new/edit/template-preview/CSV-preview modes via the `mode` + `initialData` props
5. WeightedMetricsStrip uses useWatch (no input row re-render storm) and displays footnotes for null data
6. InstrumentCombobox debounces 250ms+, cancels stale fetches via AbortController, renders all 4 DataError kinds correctly
7. tsc passes; build can be run as smoke (may have unused-import warnings since pages don't import yet — that's fine)
</success_criteria>

<output>
After completion, create .planning/phases/04-portfolio-builder/04-04-SUMMARY.md with:
- Final list of components and their props (matching contracts)
- Whether RLS migration 00007 (instruments insert policy) was needed and applied
- Confirmation of debounce + AbortController pattern in combobox
- Any edge cases discovered in groupSearchResults grouping (e.g., name-only with empty ISIN)
</output>
