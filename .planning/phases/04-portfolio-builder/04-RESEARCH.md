# Phase 4: Portfolio Builder - Research

**Researched:** 2026-05-04
**Domain:** Next.js 16 App Router CRUD UI on Supabase (Postgres + RLS) — portfolio editor with live computed metrics, instrument search, templates, and CSV import
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Portfolios list page (`/dashboard/portfolios`)
- Borderless rows, whitespace-separated — no shadows, no outlines (matches Phase 2 Swiss-minimalist card pattern)
- Each row shows: portfolio name, instrument count, weighted TER, weighted dividend yield, last-updated timestamp
- Clicking a row opens the full-page builder in edit mode at `/dashboard/portfolios/[id]/edit`
- Single primary CTA top-right: Swiss-red "New portfolio" button with a dropdown menu offering: **Blank**, **From template**, **Import CSV**
- Empty state: centered message + the same single "New portfolio" CTA (no triple-CTA layout)

#### Builder layout
- Full-page builder at `/dashboard/portfolios/new` (create) and `/dashboard/portfolios/[id]/edit` (edit) — same component, route differs
- Single scrollable page composition (top → bottom):
  1. Portfolio name input + investment amount input
  2. Sticky weighted-metrics strip (TER / yield / est. annual income)
  3. Instrument list (rows: ticker, name, weight input, remove button) with running total badge
  4. Inline combobox below the list for adding instruments
- Same layout for create and edit; edit mode pre-fills fields from the existing row
- Save button bottom-right, primary Swiss-red. Cancel/Back returns to the list page

#### Instrument search & adding
- Inline combobox below the instrument list — type-as-you-search (ticker, name, or ISIN auto-detected)
- Backed by `POST /api/instruments/search` (Phase 3). No new search endpoint
- Component: shadcn Popover + Command (Combobox) — these are not yet installed; planner adds them
- Render the typed Phase 3 errors per `kind`: `not_found` → "No matches" inline; `rate_limit` → toast/banner with retry-after; `transient` → "Search temporarily unavailable, try again"; `invalid_input` → inline "Invalid input"

#### Multi-venue disambiguation
- Phase 3 returns all matches across exchanges; Phase 4 must let the user pick the venue explicitly
- Pattern: one row per **logical instrument** in the dropdown (grouped/expandable). Expanding reveals the per-venue listings (exchange + currency + ticker suffix, e.g., `.SW`, `.DE`, `.L`)
- User clicks a specific listing to add it. No auto-pick. Honors Phase 3's "don't pick on the user's behalf" decision
- Phase 3 already returns all matches with exchange/currency/listing-date metadata — no upstream changes needed

#### Weight input & validation
- Numeric inputs per instrument row, range 0–100, step 0.5 (or 1 — Claude's discretion)
- Persistent total badge (e.g., "Σ 87.5%") next to the running list — neutral when 100%, warning color when ≠100%, Swiss-red error state with tooltip when invalid
- "Normalize to 100%" button rescales all weights proportionally (rounded to 2 decimals to fit `NUMERIC(5,2)` schema constraint)
- Save button disabled when total ≠ 100% (within ±0.01% floating-point tolerance). No silent auto-normalize on save
- Removing a row leaves the gap — no auto-redistribute. User runs "Normalize to 100%" or adjusts manually

#### Investment amount (PORT-04)
- **Required** field; builder pre-fills `CHF 10'000` as the default placeholder when creating a blank portfolio
- Templates and CSV imports also default to `CHF 10'000` if no amount is supplied
- Always CHF (project is CHF-native per PROJECT.md). No currency selector
- Display formatting: Swiss apostrophe thousands separator preferred (`CHF 10'000`); fall back to comma if Intl/locale handling adds disproportionate complexity — Claude's discretion
- Stored in the existing `portfolios.investment_amount NUMERIC(15,2)` column

#### Live weighted metrics (PORT-05, PORT-06)
- Sticky 3-stat strip near the top of the builder, updates live as weights / instruments / amount change
- Stats: **Weighted TER**, **Weighted Yield**, **Est. Annual Income**
- Formulas:
  - Weighted TER = Σ (weight_i × expense_ratio_i) / 100
  - Weighted Yield = Σ (weight_i × dividend_yield_i) / 100
  - Est. Annual Income = investment_amount × Weighted Yield / 100
- Tooltip on each stat explains the formula in plain language
- Mirrors Phase 2 dashboard "metrics strip" visual pattern

#### Missing-data handling for metrics
- Compute weighted metrics treating `null` `expense_ratio` or `dividend_yield` as `0%`
- When any instrument has missing data, show a small footnote under that metric: e.g., "Excludes 1 instrument with no expense-ratio data"
- Clicking/hovering the footnote highlights the affected rows in the instrument list
- Truthful, visible, doesn't block save

#### Templates (PORT-07)
- Templates surfaced via the **"From template"** picker in the "New portfolio" dropdown — a Dialog listing each template with name, short description, and a composition preview
- Clicking a template opens the full-page builder pre-filled with name `"[Template name] (copy)"`, the template's instruments and weights, and the default `CHF 10'000` amount — **nothing is saved yet**
- After save, the new portfolio is fully owned by the user with no link back to the source template
- Templates stored as DB rows with `is_template = true`, owned by a system/seed user (or `user_id IS NULL` if simpler — Claude's discretion in planning)
- `is_template = true` rows are excluded from the user's normal portfolio list query
- Initial template set (3 templates): **Classic 60/40**, **All-World**, **All-Weather (Ray Dalio)**
- Tickers used should overlap with Phase 3's pre-seed list (~10–15 unique tickers covered)

#### CSV import (PORT-08)
- Format: required columns `ticker`, `weight`. Optional `exchange` for explicit multi-venue disambiguation. Header row required (case-insensitive)
- Flow: upload (file picker) → parse → **preview & edit screen** → save
- Preview screen lists: matched instruments (resolved via Phase 3 search), unresolved tickers (with inline "Search/replace" affordance), all weights editable, sum-total badge
- Save validation identical to manual save: all instruments resolved + sum = 100%
- Investment amount defaults to `CHF 10'000` (user can change on the preview screen before saving)
- The preview screen is essentially the same builder UI in a "needs review" state

#### Persistence
- Use existing tables: `portfolios` and `portfolio_instruments`
- `rebalance_frequency` is **not surfaced in the Phase 4 UI** — that's a Phase 5 concern
- `description` field exists in schema but is **not** required — Claude's discretion whether to expose it
- Save = upsert pattern: insert or update `portfolios` row, then diff `portfolio_instruments` rows. Wrap in a single transaction
- Delete portfolio = standard cascading delete (FK already configured). Show a confirm dialog before delete

### Claude's Discretion
- Exact step value for weight inputs (0.5 vs 1)
- Whether to install/use the shadcn `Form` component on top of `react-hook-form` + `zod`, or hand-roll form state
- Combobox keyboard interaction details beyond shadcn defaults
- Sticky-strip exact positioning
- Whether to expose the `description` field as an optional textarea in v1 or defer it
- Toast/notification library choice (`sonner` is the shadcn default — fine to install)
- Mobile breakpoint behavior for the builder (single column stack)
- Save indicator pattern (toast on success vs inline checkmark vs route change to detail view)
- Template storage detail (`user_id IS NULL` vs dedicated system user) so long as RLS still allows authenticated users to **read** templates and forbids modifying them
- Where to put the "Estimate based on..." disclaimer for dividend income

### Deferred Ideas (OUT OF SCOPE)
- Sortable/filterable portfolios list — list will be small in v1
- Portfolio duplication / "Save as copy"
- Drag-to-reorder instrument rows
- Per-row inline notes/tags on instruments
- Public/shareable portfolio links
- "Recently viewed instruments" autocomplete history
- Instrument-level drill-down (sector, geography, holdings) — DRILL-01/02/03 in v2
- Rebalancing UI / settings — Phase 5
- CSV export of a portfolio
- Multi-currency portfolios where the user picks a base currency
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PORT-01 | Create, edit, delete named portfolios | List page + builder routes (`/dashboard/portfolios`, `/new`, `/[id]/edit`); Server Actions for upsert/delete on `portfolios` table; existing RLS policies cover full CRUD on `(SELECT auth.uid()) = user_id` |
| PORT-02 | Search and add instruments by ticker or name | Reuse `POST /api/instruments/search` (Phase 3); shadcn Popover + Command Combobox for client UI; render `DataError` kinds explicitly |
| PORT-03 | Set percentage weights that validate to 100% | Client state + Zod refinement (`sum === 100 ± 0.01`); Save button disabled until valid; `weight NUMERIC(5,2)` already on `portfolio_instruments`; "Normalize to 100%" button performs proportional rescale |
| PORT-04 | Set total investment amount per portfolio | Required CHF input; `Intl.NumberFormat('de-CH', {style:'currency', currency:'CHF'})` produces apostrophe separator; default `CHF 10'000`; persisted to `portfolios.investment_amount NUMERIC(15,2)` |
| PORT-05 | Weighted expense ratio | Pure-function compute over `instruments.expense_ratio NUMERIC(5,4)`; live recomputation on every state change; treat null as 0 with footnote |
| PORT-06 | Weighted dividend yield + estimated annual income | Same compute pattern as PORT-05 over `instruments.dividend_yield NUMERIC(5,4)`; Est. Income = amount × yield / 100 |
| PORT-07 | Create from template | New migration `00004_portfolio_templates.sql` — seeds `portfolios` rows with `is_template = true` + `portfolio_instruments` rows; new RLS policy allowing authenticated read of `is_template = true`; "From template" Dialog → builder pre-fill (no DB write until Save) |
| PORT-08 | Import CSV | Add `papaparse` (~46KB gzipped, 5M weekly DLs); parse client-side; reuse Phase 3 search to resolve `ticker[+exchange]` strings to instrument rows; preview screen = same builder component in `needs-review` state |
| META-01 | View basic ETF metadata | `instruments` table already stores name, expense_ratio, dividend_yield, currency, exchange, type; surfaced as columns in instrument list rows + tooltip on combobox results |
</phase_requirements>

## Summary

Phase 4 is a Next.js 16 App Router CRUD UI on top of an already-deployed Supabase schema. The technical risk is low — schema, RLS, auth, and the search endpoint are all in place from Phases 1–3. The actual work concentrates in three areas: **(1) form state and validation** for a multi-row portfolio editor with a precise sum=100% invariant, **(2) an instrument combobox** built on shadcn `Popover` + `Command` that calls the existing `/api/instruments/search` endpoint and surfaces multi-venue disambiguation, and **(3) live computed metrics** that recalculate on every keystroke without re-fetching data.

The locked CONTEXT decisions remove most architectural ambiguity. The remaining technical choices are tactical: the form-state library (react-hook-form + zod, or hand-rolled `useState` + zod), the CSV parser (papaparse vs. hand-rolled), and how templates are owned in Postgres (system user vs. `user_id IS NULL`). All three have a clear winning answer below.

**Primary recommendation:** Use **react-hook-form 7 + @hookform/resolvers + zod** with shadcn's `Form` wrapper for the builder, **Server Actions** (`'use server'`) for create/update/delete, **papaparse 5** for CSV parsing, **sonner** for toasts, and store templates as **`user_id IS NULL`** rows with a dedicated `SELECT` policy `WHERE is_template = true`. Use `Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' })` for CHF display — it produces the apostrophe separator natively, no custom formatter needed.

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.2 | App Router, Server Actions | Project baseline |
| react / react-dom | 19.2.4 | UI + `useActionState`, `useOptimistic`, `useFormStatus` | React 19 form primitives |
| @supabase/ssr | ^0.10.0 | Server-side Supabase client (cookies-aware) | Already wired in `src/lib/supabase/server.ts` |
| @base-ui/react | ^1.3.0 | Underlying primitives for shadcn base-nova style | shadcn config in `components.json` |
| zod | (already a transitive of `eodhd`/`@supabase`) | Schema validation | Used in `/api/instruments/search` route already; install explicit dep if not present |
| lucide-react | ^1.7.0 | Icons (X for remove, Plus, etc.) | Already used by Phase 2 |
| tailwind-merge / clsx / cva | latest | Tailwind class composition via `cn()` | Established Phase 2 pattern |

### New dependencies to add
| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| react-hook-form | ^7 | Form state for the builder | The builder has 1 + N rows of inputs; RHF's `useFieldArray` is purpose-built for this |
| @hookform/resolvers | ^3 | Zod ↔ RHF bridge | Single source of truth for validation (client + Server Action share Zod schema) |
| zod | ^3 | Validation schema (declare explicitly) | Shared with Server Action; `safeParse` returns typed errors |
| papaparse | ^5 | CSV parsing for PORT-08 | 5M weekly downloads; auto-detects delimiters; clean Promise API; ~46 KB gzipped |
| @types/papaparse | ^5 | Types | Dev-only |
| sonner | (transitive via shadcn) | Toast notifications | Default toast lib in shadcn since Toast component was deprecated; install via `npx shadcn@latest add sonner` |

### shadcn components to install
| Component | CLI | Purpose |
|-----------|-----|---------|
| popover | `npx shadcn@latest add popover` | Combobox container |
| command | `npx shadcn@latest add command` | Combobox menu (cmdk-based) |
| form | `npx shadcn@latest add form` | RHF wrapper (FormField, FormItem, FormLabel, FormMessage) |
| sonner | `npx shadcn@latest add sonner` | Toaster component for `<RootLayout>` |
| tooltip | `npx shadcn@latest add tooltip` | Metric formula explanations + footnote highlights |
| alert-dialog | `npx shadcn@latest add alert-dialog` | Delete-confirmation dialog |
| separator | `npx shadcn@latest add separator` | Optional list dividers |

**Already installed (verified):** button, card, dialog, dropdown-menu, input, label, select, skeleton, table, tabs.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-hook-form | `useState` + manual validation | Works for tiny forms, but `useFieldArray` saves significant code for the dynamic instrument list. RHF reduces re-render churn — important when 10+ weight inputs are bound to the live metrics strip. |
| papaparse | Hand-rolled split-on-comma | Hand-rolled fails on quoted fields, embedded newlines, BOMs, CRLF, and multi-byte UTF-8. Papaparse handles all four cleanly. |
| Server Actions | API route handlers (`/api/portfolios/...`) | Server Actions are the Next.js 16 idiom and integrate with `useActionState` for pending/error UI without manual fetch wiring. Use API routes only when called from non-React clients. |
| sonner | Toast (deprecated shadcn) | sonner is the official replacement in current shadcn; lighter, simpler API. |
| custom CHF formatter | `Intl.NumberFormat('de-CH', ...)` | The browser already produces `CHF 10'000.00` natively for `de-CH`. No custom code needed. |

**Installation:**
```bash
npm install react-hook-form @hookform/resolvers zod papaparse
npm install --save-dev @types/papaparse
npx shadcn@latest add popover command form sonner tooltip alert-dialog separator
```

## Architecture Patterns

### Recommended File Layout

```
src/
├── app/
│   └── dashboard/
│       └── portfolios/
│           ├── page.tsx                          # List page (Server Component)
│           ├── _actions.ts                       # 'use server' — create/update/delete
│           ├── _schema.ts                        # Shared Zod schema (client + server)
│           ├── _queries.ts                       # Server-only DB reads (list, detail, templates)
│           ├── new/
│           │   └── page.tsx                      # Create — renders <PortfolioBuilder/>
│           └── [id]/
│               └── edit/
│                   └── page.tsx                  # Edit — fetches and pre-fills <PortfolioBuilder/>
├── components/
│   └── portfolio/
│       ├── PortfolioBuilder.tsx                  # Client — main editor, wraps RHF
│       ├── InstrumentRow.tsx                     # Client — one row in the list
│       ├── InstrumentCombobox.tsx                # Client — Popover+Command, calls /api/instruments/search
│       ├── WeightedMetricsStrip.tsx              # Client — derived from form state via useWatch
│       ├── TotalBadge.tsx                        # Client — Σ display + state colors
│       ├── TemplatePickerDialog.tsx              # Client — lists templates, "Use" → router.push with seed
│       ├── CsvImportDialog.tsx                   # Client — file picker → papaparse → preview
│       └── PortfoliosListRow.tsx                 # Server — borderless list row
└── lib/
    └── portfolio/
        ├── compute-metrics.ts                    # Pure: weight×ratio sum; tested with vitest
        ├── compute-metrics.test.ts
        ├── normalize-weights.ts                  # Pure: proportional rescale to 100%, 2dp rounding
        ├── normalize-weights.test.ts
        ├── chf-format.ts                         # Wraps Intl.NumberFormat('de-CH', ...)
        └── parse-csv.ts                          # Wraps papaparse with explicit schema
```

**Why this layout:**
- `_actions.ts` / `_schema.ts` / `_queries.ts` are colocated with the route — Next.js convention for app-internal modules. Underscore prefix is decorative (Next 16 only treats underscore-prefixed *folders* as private; files under route folders are fine).
- `lib/portfolio/` holds pure functions — testable in vitest without React or Supabase. The metrics logic is the algorithmic heart of Phase 4 and must have unit tests.
- `components/portfolio/` are reusable across new/edit/CSV preview without duplication.

### Pattern 1: Server Action with Zod-shared schema

The same Zod schema validates on the client (RHF resolver) and inside the Server Action — single source of truth.

```typescript
// src/app/dashboard/portfolios/_schema.ts
import { z } from 'zod'

export const PortfolioItemSchema = z.object({
  instrument_id: z.string().uuid(),
  ticker: z.string().min(1),       // for display only
  name: z.string(),                // for display only
  weight: z.number().min(0).max(100),
})

export const PortfolioSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(120),
  description: z.string().trim().max(500).optional(),
  investment_amount: z.number().positive().max(99_999_999),
  items: z.array(PortfolioItemSchema)
    .min(1, 'Add at least one instrument')
    .superRefine((items, ctx) => {
      const sum = items.reduce((acc, it) => acc + it.weight, 0)
      if (Math.abs(sum - 100) > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Weights must sum to 100% (current: ${sum.toFixed(2)}%)`,
        })
      }
    }),
})

export type PortfolioInput = z.infer<typeof PortfolioSchema>
```

```typescript
// src/app/dashboard/portfolios/_actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortfolioSchema } from './_schema'

export async function savePortfolio(
  prev: unknown,
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // FormData carries JSON-stringified payload (multi-row form)
  const raw = JSON.parse(String(formData.get('payload')))
  const parsed = PortfolioSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { id } = (raw as { id?: string }) ?? {}
  // Upsert pattern — see "Pattern 2"
  // ...
  revalidatePath('/dashboard/portfolios')
  redirect(`/dashboard/portfolios/${id}/edit`)
}
```

**Source:** Next.js 16 App Router forms guide (`node_modules/next/dist/docs/01-app/02-guides/forms.md`), [Markus Oberlehner — react-hook-form + useActionState + Next.js 15+](https://markus.oberlehner.net/blog/using-react-hook-form-with-react-19-use-action-state-and-next-js-15-app-router/)

### Pattern 2: Save = upsert + diff in a single transaction

Supabase JS client doesn't expose Postgres transactions directly. The idiomatic approach is a `pg`-style **RPC function** (database function via SQL migration):

```sql
-- Migration: save_portfolio() function
CREATE OR REPLACE FUNCTION public.save_portfolio(
  p_id UUID,
  p_user_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_investment_amount NUMERIC,
  p_items JSONB  -- [{ instrument_id, weight }, ...]
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER  -- runs as caller; RLS applies
AS $$
DECLARE
  v_portfolio_id UUID;
BEGIN
  -- Upsert portfolio row (RLS will block if user_id mismatch)
  INSERT INTO public.portfolios (id, user_id, name, description, investment_amount)
  VALUES (COALESCE(p_id, gen_random_uuid()), p_user_id, p_name, p_description, p_investment_amount)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        investment_amount = EXCLUDED.investment_amount,
        updated_at = now()
  RETURNING id INTO v_portfolio_id;

  -- Replace portfolio_instruments rows (delete + insert is simplest in PL/pgSQL)
  DELETE FROM public.portfolio_instruments WHERE portfolio_id = v_portfolio_id;
  INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
  SELECT v_portfolio_id, (item->>'instrument_id')::UUID, (item->>'weight')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item;

  RETURN v_portfolio_id;
END;
$$;
```

Call from the Server Action:
```typescript
const { data: portfolioId, error } = await supabase
  .rpc('save_portfolio', { p_id: id, p_user_id: user.id, p_name, p_description, p_investment_amount, p_items: items })
```

**Why RPC:**
- Atomicity — partial saves never appear (`save` half-succeeds otherwise).
- RLS still applies because `SECURITY INVOKER` (default) means the function runs with the caller's permissions.
- One round-trip instead of N.

**Alternative** (simpler but two-step): `delete from portfolio_instruments where portfolio_id = ?` then bulk `insert` after the upsert. Acceptable if you accept a small window where the portfolio has zero items. Planner picks; RPC is preferred for correctness.

### Pattern 3: Live metrics via `useWatch` (no re-render storm)

react-hook-form's `useWatch` subscribes only the `WeightedMetricsStrip` component to the `items` array — the input rows don't re-render when the strip recomputes:

```tsx
// WeightedMetricsStrip.tsx
'use client'
import { useWatch, type Control } from 'react-hook-form'
import { computeMetrics } from '@/lib/portfolio/compute-metrics'
import type { PortfolioInput } from '@/app/dashboard/portfolios/_schema'

export function WeightedMetricsStrip({ control, instruments }: {
  control: Control<PortfolioInput>
  instruments: Map<string, { expense_ratio: number | null; dividend_yield: number | null }>
}) {
  const items = useWatch({ control, name: 'items' })
  const amount = useWatch({ control, name: 'investment_amount' })
  const m = computeMetrics(items, amount, instruments)
  return (
    <div className="sticky top-16 grid grid-cols-3 gap-8 ...">
      <Stat label="Weighted TER" value={`${(m.ter * 100).toFixed(2)}%`} note={m.terMissing} />
      <Stat label="Weighted Yield" value={`${(m.yield * 100).toFixed(2)}%`} note={m.yieldMissing} />
      <Stat label="Est. Annual Income" value={fmtCHF(m.annualIncome)} />
    </div>
  )
}
```

### Pattern 4: Instrument combobox

```tsx
// InstrumentCombobox.tsx
'use client'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { isDataError } from '@/lib/data/errors'
import type { SearchResult } from '@/lib/data/types'

export function InstrumentCombobox({ onSelect }: { onSelect: (r: SearchResult) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const search = useDebouncedCallback(async (q: string) => {
    if (q.length < 2) return setResults([])
    const r = await fetch('/api/instruments/search', {
      method: 'POST',
      body: JSON.stringify({ query: q, limit: 20 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const json = await r.json()
    if (isDataError(json)) {
      // Per CONTEXT: render kind-specific UI
      switch (json.kind) {
        case 'rate_limit':   toast.error('Search rate-limited; retry shortly'); break
        case 'transient':    setError('Search temporarily unavailable'); break
        case 'invalid_input':setError('Invalid input'); break
        case 'not_found':    setResults([]); break
      }
      return
    }
    setResults(json)
  }, 250)

  // Group by ISIN/name to surface "logical instrument" with expandable venues
  const grouped = groupByLogicalInstrument(results)
  // ...
}
```

Phase 3's search returns `SearchResult[]` (see `src/lib/data/types.ts`) including `ticker`, `exchange`, `name`, `type`, `currency`, `isin`. Phase 4 groups by `isin || name`, expanding to per-venue listings on click. The UCITS UC-multi-listing case (e.g., `VWCE.SW`, `VWCE.DE`, `VWRL.AS`, `VWRL.L`) is the primary motivation.

### Pattern 5: Templates with `user_id IS NULL`

```sql
-- Migration: 00004_portfolio_templates.sql

-- Allow templates to skip the user_id FK by making it nullable when is_template = true.
-- (Keep the FK; just allow NULL.)
ALTER TABLE public.portfolios ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.portfolios
  ADD CONSTRAINT portfolios_template_user_check
  CHECK ((is_template = true AND user_id IS NULL)
      OR (is_template = false AND user_id IS NOT NULL));

-- New SELECT policy: anyone authenticated can read templates
CREATE POLICY "Authenticated users can read templates"
  ON public.portfolios FOR SELECT TO authenticated
  USING (is_template = true);

-- Templates have no INSERT/UPDATE/DELETE policy for users — only DB admin/seed.
-- Existing CRUD policies use (auth.uid() = user_id) which is FALSE for NULL — safe.

-- Seed three templates
INSERT INTO public.portfolios (id, user_id, name, description, investment_amount, is_template) VALUES
  ('00000000-0000-0000-0000-000000000060', NULL, 'Classic 60/40', '60% global equities, 40% US aggregate bonds.', 10000, true),
  ('00000000-0000-0000-0000-000000000040', NULL, 'All-World',     '100% global equities (Vanguard FTSE All-World).',  10000, true),
  ('00000000-0000-0000-0000-000000000041', NULL, 'All-Weather (Ray Dalio)', '30/40/15/7.5/7.5 stocks/long-bonds/intermediate-bonds/gold/commodities.', 10000, true);

-- Then portfolio_instruments rows referencing instruments by ticker via subselects
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000060', id, 60 FROM public.instruments WHERE ticker = 'VT'
UNION ALL
SELECT '00000000-0000-0000-0000-000000000060', id, 40 FROM public.instruments WHERE ticker = 'AGG';
-- ... etc
```

**Source:** [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security). The `(SELECT auth.uid()) = user_id` check returns NULL (treated as false) when `user_id IS NULL`, so existing user CRUD policies don't accidentally permit modifying templates.

### Anti-Patterns to Avoid
- **Computing metrics in a Server Component, re-fetching on every keystroke.** Metrics must be pure-client; `instruments.expense_ratio` is the only DB-sourced input and is fetched once on builder mount.
- **`useState` per row.** With 10–30 rows the bookkeeping (add/remove/reorder/diff) explodes. Use `useFieldArray`.
- **Storing weights as integers ×100.** Schema is already `NUMERIC(5,2)` — store as decimals (e.g., `12.50`).
- **Auto-normalizing on save.** CONTEXT explicitly forbids this. Disable Save instead.
- **A second instrument-search endpoint.** Reuse `/api/instruments/search` — that's why it returns `SearchResult[]` directly.
- **Computing weighted metrics with `floats` and showing `0.18000000000000002%`.** Round at display only; keep math in Number; or use `Number.toFixed(2)`.
- **Server Action fetches user via cookie but then runs DB queries with the service role key.** Always use the user-scoped Supabase client (`createClient()` from `src/lib/supabase/server.ts`); RLS does the right thing.
- **Loading the whole portfolios table on the list page.** Add a `select(id, name, updated_at, ...)` projection plus `eq('is_template', false)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-row form state with add/remove | `useState<Row[]>` + manual indexing | `react-hook-form` `useFieldArray` | Re-render isolation, key tracking, validation per row |
| CSV parsing | `text.split('\n').map(l => l.split(','))` | `papaparse` | Quoted commas, embedded newlines, BOM, CRLF, encoding detection |
| Combobox keyboard navigation | Custom `<input>` + `<ul>` + key handlers | shadcn `Popover` + `Command` (cmdk) | ARIA roles, arrow keys, Home/End, type-ahead, enter-to-select all built-in |
| CHF formatting | `n.toFixed(2).replace(...).replace(...)` | `Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' })` | Native apostrophe separator; locale-aware; correct minor units |
| Toast/notification | Custom portal + animation | `sonner` (via shadcn) | Stacking, positioning, dismissal, accessibility |
| Confirm-delete dialog | Custom `<dialog>` | shadcn `AlertDialog` | Focus trap, escape-to-close, ARIA |
| Validation across client + server | Two copies of rules | One `Zod` schema imported by both | Single source of truth, drift impossible |
| Atomic save (portfolio + items) | Two sequential `supabase.from(...).insert(...)` calls | Postgres function (`rpc('save_portfolio', ...)`) | Atomicity; no partial state |

**Key insight:** Phase 4 has zero novel computation. Every problem has a battle-tested library. The phase's complexity is in *composition*, not invention.

## Common Pitfalls

### Pitfall 1: Floating-point sum of weights never equals exactly 100
**What goes wrong:** User enters `33.33`, `33.33`, `33.34` — sum is `100.00000000000001` due to IEEE-754. Naive `sum === 100` rejects valid input.
**Why it happens:** Binary float representation of decimals.
**How to avoid:** Tolerance check: `Math.abs(sum - 100) <= 0.01`. Always round at display: `sum.toFixed(2)`. Persist `weight` rounded to 2dp before insert (matches `NUMERIC(5,2)` schema).
**Warning sign:** "It works locally but fails on save sometimes."

### Pitfall 2: RLS blocks template seeding silently
**What goes wrong:** Migration `INSERT INTO portfolios (..., user_id) VALUES (..., NULL)` fails or is silently filtered if seeded through the user-context client.
**Why it happens:** `user_id NOT NULL` constraint exists in `00001_initial_schema.sql`. Need migration to drop it.
**How to avoid:** Use `ALTER TABLE` to drop NOT NULL + add CHECK constraint that enforces NULL only when `is_template = true`. Run seed inside the migration SQL (runs as DB owner, bypasses RLS).
**Warning sign:** Migration succeeds but "no templates found" at runtime.

### Pitfall 3: ISIN search returns rows with empty `name`
**What goes wrong:** Phase 3 search route documents this: ISIN cache hits return `name: ''` (cache doesn't store name). Combobox displays blank rows.
**Why it happens:** `src/app/api/instruments/search/route.ts:69` — `// name not stored in cache; Phase 4 can enrich via YahooProvider if needed`.
**How to avoid:** When `name === ''`, fall back to `${ticker} (${exchange})` in the combobox display. Optional: client-side enrichment via a second search round-trip with `query = ticker` if needed.
**Warning sign:** ISIN-search results look "headerless".

### Pitfall 4: Multi-venue duplicates after CSV import
**What goes wrong:** User imports CSV with `VWCE` (no exchange suffix). Search returns `VWCE.SW`, `VWCE.DE`, `VWCE.MI`. Importer auto-picks first match → wrong currency, wrong listing.
**Why it happens:** CONTEXT explicitly forbids auto-pick.
**How to avoid:** CSV preview screen surfaces multi-match rows as "ambiguous — pick a venue" with a per-row mini-combobox. Save disabled until all rows resolved to a single instrument_id.
**Warning sign:** "Why are my CSV-imported portfolios showing the German listing instead of Swiss?"

### Pitfall 5: Server Action returns redirect during error
**What goes wrong:** Server Action calls `redirect()` which throws a special error → wraps any exception → `useActionState` never sees the validation error message.
**Why it happens:** `next/navigation`'s `redirect()` throws a `NEXT_REDIRECT` error to short-circuit rendering.
**How to avoid:** Validate first, return `{ ok: false, error }`. Only call `redirect()` after a successful save. Never wrap `redirect()` in `try/catch` (it must propagate).
**Warning sign:** Form errors flash briefly then disappear.

### Pitfall 6: Combobox triggers on every keystroke (rate-limit risk)
**What goes wrong:** Each character fires a fetch. User types "VWCE" → 4 requests. Compounded by all users → Yahoo/OpenFIGI rate-limit.
**Why it happens:** No debounce.
**How to avoid:** 250–300ms debounce on input. Min length 2 chars. Cancel in-flight fetches with `AbortController` when query changes.
**Warning sign:** `429 rate_limit` in production.

### Pitfall 7: `instruments.expense_ratio` and `dividend_yield` are mostly NULL
**What goes wrong:** Per Phase 3 STATE.md note: "EODHD free tier may not provide [expense_ratio/dividend_yield]". After the EODHD→Yahoo pivot, these fields are likely **NULL for most rows**.
**Why it happens:** Yahoo's chart API doesn't return ETF metadata; `eodhd` SDK was the source. After pivot, no current pipeline populates these columns.
**How to avoid:** Phase 4 must accept NULLs gracefully (CONTEXT covers this — treat as 0 + footnote). **However**, planner may want a small Phase-4-internal step to manually backfill `expense_ratio` and `dividend_yield` for the ~14 v1 tickers from public ETF factsheets, so the metrics aren't all "Excludes N instruments…". A SQL update in a migration is sufficient. **Highly recommended for the first impression of the feature.**
**Warning sign:** Every metric strip says "Excludes 14 instruments with no data" — the feature looks broken.

### Pitfall 8: Next.js 16 `params` and `cookies` are async
**What goes wrong:** Code copy-pasted from Next.js 14/15 tutorials uses `params.id` synchronously — fails in Next.js 16.
**Why it happens:** Next.js 15+ made `params`, `searchParams`, `cookies()`, `headers()` Promises.
**How to avoid:** `const { id } = await params` in route segment files. Already proven in `src/lib/supabase/server.ts` (`async createClient()`).
**Warning sign:** Build errors `Property 'id' does not exist on type 'Promise<{ id: string }>'`.

### Pitfall 9: Server Component imports a Client Component that imports `createClient` from server
**What goes wrong:** Hydration error or "module not found" at runtime.
**Why it happens:** `@/lib/supabase/server` uses `next/headers` which is server-only.
**How to avoid:** Builder is a Client Component (`'use client'`). It receives `initialPortfolio`, `instruments` map, etc. as props from a Server Component (`page.tsx`) that does the fetching. Server Actions in `_actions.ts` can be imported from a Client Component because their `'use server'` directive marks them as RPC.
**Warning sign:** "You're importing a component that needs `next/headers`. That only works in a Server Component."

## Code Examples

### Example 1: CHF formatting via Intl.NumberFormat

```typescript
// src/lib/portfolio/chf-format.ts
const formatter = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: 'CHF',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function fmtCHF(amount: number): string {
  return formatter.format(amount)
}

// fmtCHF(10000)        → "CHF 10'000"
// fmtCHF(10000.5)      → "CHF 10'000.50"
// fmtCHF(1234567.89)   → "CHF 1'234'567.89"
```

**Verified:** `(new Intl.NumberFormat('de-CH', {style:'currency', currency:'CHF'})).format(123456.789)` → `"CHF 123'456.79"` (per [MDN Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) and Node 20.x ICU).

### Example 2: Pure metrics computation

```typescript
// src/lib/portfolio/compute-metrics.ts
export type Item = { instrument_id: string; weight: number }
export type InstrumentMeta = { expense_ratio: number | null; dividend_yield: number | null }

export type Metrics = {
  ter: number              // 0.0018 = 0.18%
  yield: number            // 0.0192 = 1.92%
  annualIncome: number     // CHF
  terMissingCount: number
  yieldMissingCount: number
  terMissingIds: string[]
  yieldMissingIds: string[]
}

export function computeMetrics(
  items: Item[],
  investmentAmount: number,
  meta: Map<string, InstrumentMeta>,
): Metrics {
  let ter = 0, dy = 0
  const terMissingIds: string[] = [], yieldMissingIds: string[] = []
  for (const it of items) {
    const m = meta.get(it.instrument_id)
    if (!m) continue
    if (m.expense_ratio == null) terMissingIds.push(it.instrument_id)
    else ter += (it.weight / 100) * m.expense_ratio
    if (m.dividend_yield == null) yieldMissingIds.push(it.instrument_id)
    else dy += (it.weight / 100) * m.dividend_yield
  }
  return {
    ter,
    yield: dy,
    annualIncome: investmentAmount * dy,
    terMissingCount: terMissingIds.length,
    yieldMissingCount: yieldMissingIds.length,
    terMissingIds,
    yieldMissingIds,
  }
}
```

Notes:
- `expense_ratio NUMERIC(5,4)` is stored as a fraction (`0.0007` = 0.07%). Don't multiply by 100 inside compute — multiply at display.
- `weight NUMERIC(5,2)` is stored as percent (`60.00`). Hence `weight / 100` to get fraction.
- Pure function = trivial vitest unit tests.

### Example 3: Normalize-to-100 with NUMERIC(5,2) safety

```typescript
// src/lib/portfolio/normalize-weights.ts
export function normalizeTo100(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) return weights.map(() => 0)
  // Scale and round to 2dp
  const scaled = weights.map(w => Math.round((w / sum) * 100 * 100) / 100)
  // Fix rounding drift on the last element so the sum is exactly 100.00
  const drift = 100 - scaled.reduce((a, b) => a + b, 0)
  if (scaled.length > 0) scaled[scaled.length - 1] = Math.round((scaled[scaled.length - 1] + drift) * 100) / 100
  return scaled
}
```

### Example 4: CSV parsing with explicit schema

```typescript
// src/lib/portfolio/parse-csv.ts
import Papa from 'papaparse'
import { z } from 'zod'

const CsvRowSchema = z.object({
  ticker: z.string().trim().min(1),
  weight: z.string().regex(/^\d+(\.\d+)?$/).transform(Number),
  exchange: z.string().trim().optional(),
})

export type CsvRow = z.infer<typeof CsvRowSchema>

export async function parsePortfolioCsv(file: File): Promise<{ rows: CsvRow[]; errors: string[] }> {
  return new Promise(resolve => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.toLowerCase().trim(),
      complete: ({ data, errors }) => {
        const rows: CsvRow[] = []
        const errs: string[] = errors.map(e => `Row ${e.row}: ${e.message}`)
        for (const [i, raw] of data.entries()) {
          const parsed = CsvRowSchema.safeParse(raw)
          if (parsed.success) rows.push(parsed.data)
          else errs.push(`Row ${i + 2}: ${parsed.error.issues[0].message}`)  // +2 for header + 1-index
        }
        resolve({ rows, errors: errs })
      },
    })
  })
}
```

**Source:** [Papa Parse docs](https://www.papaparse.com/), [npm-compare CSV libraries](https://npm-compare.com/csv-parse,csv-parser,fast-csv,papaparse)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pages/api/...` route handlers + `useFormState` | Server Actions + `useActionState` | React 19 / Next.js 15 | Native form-action wiring; less fetch boilerplate |
| `react-hook-form` v6 + manual zod validate | `react-hook-form` v7 + `@hookform/resolvers/zod` | RHF 7 | Built-in Zod resolver, smaller bundle |
| shadcn `Toast` component | `sonner` | shadcn 2024 | Toast deprecated; sonner is the new default (`npx shadcn add sonner`) |
| `middleware.ts` | `proxy.ts` (Next.js 16) | Next.js 16.0 | This project already uses `src/proxy.ts` |
| Synchronous `params`, `cookies()` | Async `await params`, `await cookies()` | Next.js 15 | Project already async (verified in supabase server client) |
| Manual ICU number formatting | `Intl.NumberFormat('de-CH', ...)` | Always available; just underused | One-liner replaces 20-line custom formatter |

**Deprecated/outdated:**
- `useFormState` — replaced by `useActionState` (React 19)
- shadcn `Toast` — replaced by `Sonner`
- EODHD free tier for prices/dividends (project history) — replaced by Yahoo + Stooq; relevant here because instrument metadata enrichment may need a different source

## Open Questions

1. **Should Phase 4 backfill `instruments.expense_ratio` and `dividend_yield` for the seeded tickers?**
   - What we know: STATE.md confirms these are likely NULL in DB after the EODHD→Yahoo pivot. CONTEXT permits the metrics strip to display a footnote when data is missing.
   - What's unclear: Whether v1 ships with empty metric strips ("Excludes 14 instruments…") or with hand-curated ETF metadata.
   - Recommendation: Add a small migration `00005_seed_etf_metadata.sql` updating the ~14 v1 tickers' `expense_ratio` and `dividend_yield` from public factsheets. Cost: 30 minutes of data entry. Benefit: the feature looks complete on day one. Mark these rows with `data_source = 'manual'` so a future Phase can refresh them automatically.

2. **Can a Postgres function (`save_portfolio` RPC) be used, or must persistence be plain Supabase JS calls?**
   - What we know: RPC gives atomicity in one round-trip. `SECURITY INVOKER` keeps RLS in force.
   - What's unclear: Project preference (project hasn't created any PL/pgSQL functions beyond `handle_updated_at`/`handle_new_user`).
   - Recommendation: Use RPC. The pattern is already in the codebase (handle_new_user is `SECURITY DEFINER`). Document the function in the migration; test atomicity in a Playwright integration test.

3. **Does the builder need optimistic UI for save?**
   - What we know: React 19's `useOptimistic` exists; CONTEXT lists "save indicator pattern" as Claude's discretion.
   - What's unclear: Whether the latency of `saveAction` → `revalidatePath` → `redirect` is fast enough that optimistic UI is overkill.
   - Recommendation: Ship without `useOptimistic` first. Add a `pending` spinner via `useFormStatus` or `useActionState`'s third tuple element. Toast on success. If users complain, add optimistic rendering.

4. **Multi-venue grouping key: `isin`, `name`, or both?**
   - What we know: `SearchResult.isin` is `string | null`. ISIN cache hits have ISIN; Yahoo text search returns no ISIN.
   - What's unclear: How to group `VWCE.SW` and `VWCE.DE` when neither row has an ISIN.
   - Recommendation: Group by `isin || name`. When two rows share `name` but have different ISINs (rare — different share classes), do NOT group. Add a unit test for the grouping function.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x (unit) + Playwright 1.59 (integration/e2e) |
| Config files | `vitest.config.mts`, `playwright.config.ts` |
| Quick run command | `npm run test:unit` (vitest run) |
| Full suite command | `npm test` (vitest + playwright chromium) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-01 | Create portfolio: name + at least one instrument + sum=100 → row in `portfolios` | integration (Playwright) | `npx playwright test tests/integration/portfolio-create.spec.ts` | ❌ Wave 0 |
| PORT-01 | Edit portfolio: change name, weights → diff applied | integration | `npx playwright test tests/integration/portfolio-edit.spec.ts` | ❌ Wave 0 |
| PORT-01 | Delete portfolio with confirm → row gone, FKs cascade | integration | `npx playwright test tests/integration/portfolio-delete.spec.ts` | ❌ Wave 0 |
| PORT-02 | Combobox calls `/api/instruments/search` and renders results | integration | `npx playwright test tests/integration/instrument-search.spec.ts` | ❌ Wave 0 |
| PORT-02 | DataError `kind` rendering (rate_limit/transient/not_found/invalid_input) | unit | `npm run test:unit -- src/components/portfolio/InstrumentCombobox.test.tsx` | ❌ Wave 0 |
| PORT-03 | `PortfolioSchema` rejects sum ≠ 100 ± 0.01 | unit | `npm run test:unit -- src/app/dashboard/portfolios/_schema.test.ts` | ❌ Wave 0 |
| PORT-03 | `normalizeTo100` rescales proportionally; sum = 100 exactly post-rounding | unit | `npm run test:unit -- src/lib/portfolio/normalize-weights.test.ts` | ❌ Wave 0 |
| PORT-04 | Investment amount required + persisted to `portfolios.investment_amount` | integration | covered in portfolio-create.spec.ts | ❌ Wave 0 |
| PORT-04 | `fmtCHF(10000)` → `"CHF 10'000"` | unit | `npm run test:unit -- src/lib/portfolio/chf-format.test.ts` | ❌ Wave 0 |
| PORT-05 | `computeMetrics` weighted TER over given items | unit | `npm run test:unit -- src/lib/portfolio/compute-metrics.test.ts` | ❌ Wave 0 |
| PORT-06 | `computeMetrics` yield + annual income; null handling + missing-ids list | unit | same file | ❌ Wave 0 |
| PORT-07 | "From template" Dialog → builder pre-filled but not yet saved | integration | `npx playwright test tests/integration/portfolio-template.spec.ts` | ❌ Wave 0 |
| PORT-07 | Templates excluded from list page | unit (DB query) or integration | covered in portfolio-list.spec.ts | ❌ Wave 0 |
| PORT-08 | CSV parse: well-formed → matched rows | unit | `npm run test:unit -- src/lib/portfolio/parse-csv.test.ts` | ❌ Wave 0 |
| PORT-08 | CSV parse: malformed → typed errors surface in preview | unit | same file | ❌ Wave 0 |
| PORT-08 | CSV import end-to-end: upload → preview → save | integration | `npx playwright test tests/integration/portfolio-csv-import.spec.ts` | ❌ Wave 0 |
| META-01 | Instrument metadata renders in list rows + tooltip | integration | covered in portfolio-create.spec.ts (asserts ETF name/expense in DOM) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:unit` (target: < 10s for the Phase 4 unit suite)
- **Per wave merge:** `npm test` (vitest + chromium playwright)
- **Phase gate:** Full suite green + manual smoke (create/edit/delete/template/CSV) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/integration/portfolio-create.spec.ts` — covers PORT-01, PORT-04, META-01
- [ ] `tests/integration/portfolio-edit.spec.ts` — covers PORT-01
- [ ] `tests/integration/portfolio-delete.spec.ts` — covers PORT-01
- [ ] `tests/integration/portfolio-list.spec.ts` — covers PORT-01 list view, template exclusion
- [ ] `tests/integration/instrument-search.spec.ts` — covers PORT-02 (live search via existing endpoint)
- [ ] `tests/integration/portfolio-template.spec.ts` — covers PORT-07 (template pre-fill, no save until user saves)
- [ ] `tests/integration/portfolio-csv-import.spec.ts` — covers PORT-08 (upload → preview → save)
- [ ] `src/app/dashboard/portfolios/_schema.test.ts` — Zod schema unit tests (PORT-03)
- [ ] `src/lib/portfolio/normalize-weights.test.ts` — pure function (PORT-03)
- [ ] `src/lib/portfolio/compute-metrics.test.ts` — pure function (PORT-05, PORT-06)
- [ ] `src/lib/portfolio/chf-format.test.ts` — Intl wrapper (PORT-04)
- [ ] `src/lib/portfolio/parse-csv.test.ts` — papaparse wrapper (PORT-08)
- [ ] `src/components/portfolio/InstrumentCombobox.test.tsx` — DataError kind rendering (PORT-02). **Note:** RTL/jsdom not yet installed; planner adds `@testing-library/react` + `jsdom` + a `vitest.config.mts` `environment: 'jsdom'` override for `*.test.tsx` if testing component DOM. Alternative: drive everything via Playwright (no extra deps).
- [ ] Test helper: `tests/helpers/test-portfolio.ts` — utility to create + clean up test portfolios via Supabase service role
- [ ] Migration `00004_portfolio_templates.sql` (must apply before any test touches templates)
- [ ] Migration `00005_seed_etf_metadata.sql` (recommended; backfills the ~14 v1 tickers — see Open Question 1)

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/02-guides/forms.md` — Next.js 16 Server Actions / `useActionState` / `useFormStatus` reference
- `node_modules/next/dist/docs/01-app/...` — App Router file conventions (verified `proxy.ts`, async `params`)
- `src/app/api/instruments/search/route.ts` — Phase 3 search endpoint contract (POST, body `{query, limit}`, returns `SearchResult[]` or `DataError`)
- `src/lib/data/types.ts` — `SearchResult` shape consumed by combobox
- `src/lib/data/errors.ts` — `DataError` discriminated union for typed error rendering
- `supabase/migrations/00001_initial_schema.sql` — `portfolios`, `portfolio_instruments`, `instruments` schema; existing RLS policies; `weight NUMERIC(5,2)`, `expense_ratio NUMERIC(5,4)`
- [MDN — Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) — confirms `de-CH` locale produces apostrophe separator natively
- [Papa Parse](https://www.papaparse.com/) — official docs (chunking, header parsing, error reporting)
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — policy semantics with NULL `user_id`
- [shadcn/ui Combobox](https://ui.shadcn.com/docs/components/radix/combobox) — composition of Popover + Command (cmdk)
- [shadcn/ui Sonner](https://ui.shadcn.com/docs/components/radix/sonner) — toast replacement

### Secondary (MEDIUM confidence)
- [Markus Oberlehner — react-hook-form + useActionState + Next.js 15+](https://markus.oberlehner.net/blog/using-react-hook-form-with-react-19-use-action-state-and-next-js-15-app-router/) — verified pattern for combining client RHF with Server Actions
- [npm-compare — papaparse vs csv-parse](https://npm-compare.com/csv-parse,csv-parser,fast-csv,papaparse) — papaparse 5M weekly DLs, browser-optimized
- [LeanyLabs CSV parser benchmarks](https://leanylabs.com/blog/js-csv-parsers-benchmarks/) — papaparse fastest of tested parsers
- Phase 3 STATE.md decisions — `expense_ratio`/`dividend_yield` likely NULL in DB after EODHD pivot

### Tertiary (LOW confidence)
- (None — all critical claims verified against either local code, official docs, or MDN.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is in active use; versions verified in package.json or shadcn registry
- Architecture: HIGH — Next.js 16 forms guide read directly; existing project patterns (server.ts, proxy.ts) confirm the model
- Pitfalls: HIGH — most are derived from local code (`route.ts:69` empty-name issue, `weight NUMERIC(5,2)` precision, NUMERIC(5,4) expense format), Next.js docs (async params), or directly from CONTEXT
- Persistence (RPC vs sequential calls): MEDIUM — RPC is recommended but the project hasn't used custom PL/pgSQL functions for app logic before; planner may decide differently
- Template RLS pattern: HIGH — `(SELECT auth.uid()) = user_id` returns NULL when `user_id IS NULL`, treated as false; verified against Supabase docs

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days — Next.js 16 + React 19 + shadcn are the current stable; Phase 3 endpoint contract is locked)
