---
phase: 04-portfolio-builder
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - components.json
  - vitest.config.mts
  - playwright.config.ts
  - src/components/ui/popover.tsx
  - src/components/ui/command.tsx
  - src/components/ui/form.tsx
  - src/components/ui/sonner.tsx
  - src/components/ui/tooltip.tsx
  - src/components/ui/alert-dialog.tsx
  - src/components/ui/separator.tsx
  - supabase/migrations/00004_portfolio_templates.sql
  - supabase/migrations/00005_seed_etf_metadata.sql
  - tests/integration/portfolio-create.spec.ts
  - tests/integration/portfolio-edit.spec.ts
  - tests/integration/portfolio-delete.spec.ts
  - tests/integration/portfolio-list.spec.ts
  - tests/integration/instrument-search.spec.ts
  - tests/integration/portfolio-template.spec.ts
  - tests/integration/portfolio-csv-import.spec.ts
  - tests/helpers/test-portfolio.ts
  - src/app/dashboard/portfolios/_schema.test.ts
  - src/lib/portfolio/normalize-weights.test.ts
  - src/lib/portfolio/compute-metrics.test.ts
  - src/lib/portfolio/chf-format.test.ts
  - src/lib/portfolio/parse-csv.test.ts
autonomous: true
requirements: [PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, PORT-08, META-01]
user_setup:
  - service: supabase
    why: "Apply new migrations to dev DB (00004 templates, 00005 ETF metadata backfill)"
    dashboard_config:
      - task: "Run `npx supabase db push` (or `supabase db reset` for local) after Wave 0 lands"
        location: "Local terminal — uses .env.local Supabase pooler URL"

must_haves:
  truths:
    - "All Wave 0 dependencies install cleanly (npm install exits 0)"
    - "All shadcn primitives (popover, command, form, sonner, tooltip, alert-dialog, separator) render without import errors"
    - "Migration 00004 applies cleanly: portfolios.user_id becomes nullable, CHECK constraint enforces NULL only when is_template=true, RLS allows authenticated read of templates"
    - "Migration 00005 applies cleanly: ~14 v1 tickers have non-null expense_ratio and dividend_yield"
    - "Every Wave 0 test file exists, contains describe/it stubs that import the (not-yet-existing) target modules, and is marked .skip or it.todo so vitest/playwright runs green"
    - "vitest.config.mts environment can resolve jsdom for *.test.tsx files (or test files use Playwright instead)"
  artifacts:
    - path: "supabase/migrations/00004_portfolio_templates.sql"
      provides: "Template storage schema + RLS read policy + seeded 3 templates (Classic 60/40, All-World, All-Weather)"
      contains: "is_template"
    - path: "supabase/migrations/00005_seed_etf_metadata.sql"
      provides: "Backfill of expense_ratio and dividend_yield for v1 seeded tickers (SPY, VT, AGG, TLT, IEI, GLD, DJP, VTI, CSSPX.SW, 500E.SW, CHDVD.SW, SSAC.SW, NOVN.SW, VWRL.LSE)"
      contains: "UPDATE public.instruments"
    - path: "tests/helpers/test-portfolio.ts"
      provides: "createTestPortfolio + cleanupTestPortfolio helpers for integration specs (uses service role)"
      exports: ["createTestPortfolio", "cleanupTestPortfolio", "loginTestUser"]
    - path: "tests/integration/portfolio-create.spec.ts"
      provides: "Stub specs for PORT-01 create + PORT-04 amount + META-01 metadata"
    - path: "tests/integration/portfolio-edit.spec.ts"
      provides: "Stub specs for PORT-01 edit"
    - path: "tests/integration/portfolio-delete.spec.ts"
      provides: "Stub specs for PORT-01 delete"
    - path: "tests/integration/portfolio-list.spec.ts"
      provides: "Stub specs for PORT-01 list view + template exclusion"
    - path: "tests/integration/instrument-search.spec.ts"
      provides: "Stub specs for PORT-02 combobox + DataError rendering"
    - path: "tests/integration/portfolio-template.spec.ts"
      provides: "Stub specs for PORT-07 template pre-fill"
    - path: "tests/integration/portfolio-csv-import.spec.ts"
      provides: "Stub specs for PORT-08 CSV upload→preview→save"
    - path: "src/app/dashboard/portfolios/_schema.test.ts"
      provides: "Stub PORT-03 Zod schema tests"
    - path: "src/lib/portfolio/normalize-weights.test.ts"
      provides: "Stub PORT-03 normalize-to-100 tests"
    - path: "src/lib/portfolio/compute-metrics.test.ts"
      provides: "Stub PORT-05/06 weighted metrics tests"
    - path: "src/lib/portfolio/chf-format.test.ts"
      provides: "Stub PORT-04 CHF format tests"
    - path: "src/lib/portfolio/parse-csv.test.ts"
      provides: "Stub PORT-08 papaparse wrapper tests"
  key_links:
    - from: "supabase/migrations/00004_portfolio_templates.sql"
      to: "public.portfolios"
      via: "ALTER TABLE drop NOT NULL on user_id + CHECK constraint"
      pattern: "ALTER COLUMN user_id DROP NOT NULL"
    - from: "supabase/migrations/00004_portfolio_templates.sql"
      to: "RLS policy"
      via: "Authenticated read of is_template=true"
      pattern: "USING \\(is_template = true\\)"
    - from: "supabase/migrations/00005_seed_etf_metadata.sql"
      to: "public.instruments"
      via: "UPDATE statements per ticker"
      pattern: "UPDATE public.instruments SET expense_ratio"
---

<objective>
Wave 0 establishes everything downstream waves need to sample test feedback: dependencies, shadcn components, DB migrations, and stub test files for every PORT-* requirement. No production code yet — only scaffolding.

Purpose: Per 04-VALIDATION.md, "Wave 0 must complete before any feature plan begins so that subsequent task commits have a real test target to sample." Without these stubs, downstream plans have no `<verify>` target and the Nyquist sampling discipline collapses.
Output: Installed deps, shadcn UI primitives, two migrations applied, 12 test stub files, all green (skipped/todo).
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-portfolio-builder/04-CONTEXT.md
@.planning/phases/04-portfolio-builder/04-RESEARCH.md
@.planning/phases/04-portfolio-builder/04-VALIDATION.md
@CLAUDE.md
@AGENTS.md
@supabase/migrations/00001_initial_schema.sql
@src/lib/data/types.ts
@src/lib/data/errors.ts
@src/app/api/instruments/search/route.ts

<interfaces>
<!-- Existing contracts the executor will compose against. -->

From src/lib/data/types.ts (Phase 3):
```typescript
export type SearchResult = {
  ticker: string
  exchange: string
  name: string
  type: 'etf' | 'stock' | 'commodity' | 'future' | 'bond' | 'fund' | string
  currency: string
  isin: string | null
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

From supabase/migrations/00001_initial_schema.sql:
- `portfolios(id, user_id NOT NULL, name, description, investment_amount NUMERIC(15,2), rebalance_frequency, is_template, timestamps)`
- `portfolio_instruments(id, portfolio_id, instrument_id, weight NUMERIC(5,2) CHECK (weight > 0 AND weight <= 100), UNIQUE(portfolio_id, instrument_id))`
- `instruments(id, ticker UNIQUE, name, isin, type, currency, exchange, expense_ratio NUMERIC(5,4), dividend_yield NUMERIC(5,4), data_source, timestamps)`
- RLS: `(SELECT auth.uid()) = user_id` on portfolios for SELECT/INSERT/UPDATE/DELETE
</interfaces>

<critical_constraints>
- AGENTS.md: This is Next.js 16 with breaking changes — consult `node_modules/next/dist/docs/` before writing Next.js code. `params`, `cookies()`, `headers()` are async Promises. `middleware.ts` is renamed to `proxy.ts`.
- Migrations file naming convention from STATE.md: leading-number `0000N_*.sql`. Existing through 00003. New ones MUST be 00004 and 00005.
- `weight NUMERIC(5,2)` schema CHECK is `weight > 0 AND weight <= 100` — all stub seed data must comply.
- `expense_ratio NUMERIC(5,4)` stores fractions (e.g., `0.0007` for 0.07%, max 9.9999).
- shadcn install must use `npx shadcn@latest add <component>` — `shadcn ^4.1.2` is in package.json.
- Wave 0 stubs MUST be green (skipped/todo) — not red. They establish file existence so downstream `<automated>` commands point at real files.
- Testing-library + jsdom: `@testing-library/react` + `jsdom` are NOT yet installed. Decision (Claude's discretion per VALIDATION.md): defer DOM component test to Playwright — do NOT install RTL/jsdom in Wave 0; the InstrumentCombobox DataError rendering is exercised via `tests/integration/instrument-search.spec.ts` instead. The unit-level "stub" for `InstrumentCombobox.test.tsx` is therefore NOT created here; downstream Plan 04 may create it as a Playwright spec under `tests/integration/instrument-combobox-errors.spec.ts` if needed.
</critical_constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install Phase 4 runtime + dev dependencies and add shadcn primitives</name>
  <files>package.json, package-lock.json, components.json, src/components/ui/popover.tsx, src/components/ui/command.tsx, src/components/ui/form.tsx, src/components/ui/sonner.tsx, src/components/ui/tooltip.tsx, src/components/ui/alert-dialog.tsx, src/components/ui/separator.tsx, src/app/layout.tsx</files>
  <action>
    Step 1 — Install runtime + dev deps in two npm calls (do NOT pin minor versions tighter than research range):

    ```bash
    npm install react-hook-form@^7 @hookform/resolvers@^3 zod@^3 papaparse@^5
    npm install --save-dev @types/papaparse@^5
    ```

    Verify package.json includes all 5 packages. Do NOT install `@testing-library/react` or `jsdom` (deferred per critical_constraints).

    Step 2 — Add shadcn components in one command (CLI is interactive-style but shadcn ^4 supports flag-based add):

    ```bash
    npx shadcn@latest add popover command form sonner tooltip alert-dialog separator --yes
    ```

    If `--yes` is not supported on shadcn v4.1.2, run each in sequence accepting defaults. Each command writes a file to `src/components/ui/`. After completion, verify all 7 files exist.

    Step 3 — Wire `<Toaster />` into the app root layout. Edit `src/app/layout.tsx` to import `{ Toaster } from '@/components/ui/sonner'` and render `<Toaster />` once inside the `<body>` (after `{children}`). This is the only global wiring sonner requires.

    Step 4 — Run `npm run lint` and `npm run build` (or at minimum `npx tsc --noEmit`) to confirm no type errors from the new imports. Sonner package adds `next-themes` peer (already installed).

    NOTE: Per AGENTS.md / Next.js 16 docs, `<Toaster />` is a Client Component (it must be — sonner uses portals). The `app/layout.tsx` is a Server Component; importing a Client Component into a Server Component is allowed (this is the standard shadcn pattern). Do NOT add `'use client'` to `app/layout.tsx`.

    Use react-hook-form + zod resolver (NOT a hand-rolled solution) per RESEARCH "Don't Hand-Roll" section.
  </action>
  <verify>
    <automated>npm run build 2>&1 | tail -20 && test -f src/components/ui/popover.tsx && test -f src/components/ui/command.tsx && test -f src/components/ui/form.tsx && test -f src/components/ui/sonner.tsx && test -f src/components/ui/tooltip.tsx && test -f src/components/ui/alert-dialog.tsx && test -f src/components/ui/separator.tsx && grep -q "react-hook-form" package.json && grep -q "papaparse" package.json && grep -q "Toaster" src/app/layout.tsx</automated>
  </verify>
  <done>All 7 shadcn primitives exist under src/components/ui/, all 5 npm deps in package.json, Toaster wired in app layout, build passes.</done>
</task>

<task type="auto">
  <name>Task 2: Author migrations 00004 (templates schema + seed) and 00005 (ETF metadata backfill)</name>
  <files>supabase/migrations/00004_portfolio_templates.sql, supabase/migrations/00005_seed_etf_metadata.sql</files>
  <action>
    Create `supabase/migrations/00004_portfolio_templates.sql` implementing the Pattern 5 from RESEARCH.md exactly:

    1. `ALTER TABLE public.portfolios ALTER COLUMN user_id DROP NOT NULL;`
    2. Add CHECK constraint named `portfolios_template_user_check`:
       `CHECK ((is_template = true AND user_id IS NULL) OR (is_template = false AND user_id IS NOT NULL))`
    3. Add SELECT policy `"Authenticated users can read templates"` on `public.portfolios FOR SELECT TO authenticated USING (is_template = true)`. Existing user CRUD policies already use `(SELECT auth.uid()) = user_id` which evaluates to NULL → false for templates, so they remain safe.
    4. Insert 3 template rows with stable UUIDs (use `'00000000-0000-0000-0000-000000000060'` for 60/40, `'00000000-0000-0000-0000-000000000040'` for All-World, `'00000000-0000-0000-0000-000000000041'` for All-Weather):
       - Classic 60/40: `60% VT, 40% AGG`
       - All-World: `100% VT` (use VT — it is in the v1 seed list per STATE.md; VWCE.SW would be CHF-native but not seeded)
       - All-Weather (Ray Dalio): `30% VTI, 40% TLT, 15% IEI, 7.5% GLD, 7.5% DJP`
    5. Insert `portfolio_instruments` rows for each template using subselects on `instruments.ticker`. Use `INSERT ... SELECT` — gracefully handles a missing ticker by inserting zero rows for that line, but for v1 the ticker list overlaps with the seeded set.
    6. Each template row: `user_id = NULL, is_template = true, investment_amount = 10000, name = '<Template>', description = '<short description>'`. Do NOT set `rebalance_frequency`.

    Create `supabase/migrations/00005_seed_etf_metadata.sql` per RESEARCH "Open Question 1" recommendation:

    Hand-curated UPDATE statements for the 14 v1 tickers. Use public-factsheet values as of late 2024 (data_source = 'manual'). Source values once in the migration header as a comment. Use NUMERIC(5,4) format (fraction, not percent):

    ```sql
    -- Source: ETF issuer factsheets (Vanguard, iShares, SPDR, Invesco) verified 2024 Q4
    -- Format: NUMERIC(5,4) — 0.0003 = 0.03%, 0.0192 = 1.92%
    UPDATE public.instruments SET expense_ratio = 0.0009, dividend_yield = 0.0148, data_source = 'manual' WHERE ticker = 'SPY';
    UPDATE public.instruments SET expense_ratio = 0.0007, dividend_yield = 0.0186, data_source = 'manual' WHERE ticker = 'VT';
    UPDATE public.instruments SET expense_ratio = 0.0003, dividend_yield = 0.0136, data_source = 'manual' WHERE ticker = 'VTI';
    UPDATE public.instruments SET expense_ratio = 0.0003, dividend_yield = 0.0398, data_source = 'manual' WHERE ticker = 'AGG';
    UPDATE public.instruments SET expense_ratio = 0.0015, dividend_yield = 0.0387, data_source = 'manual' WHERE ticker = 'TLT';
    UPDATE public.instruments SET expense_ratio = 0.0015, dividend_yield = 0.0364, data_source = 'manual' WHERE ticker = 'IEI';
    UPDATE public.instruments SET expense_ratio = 0.0040, dividend_yield = 0.0000, data_source = 'manual' WHERE ticker = 'GLD';
    UPDATE public.instruments SET expense_ratio = 0.0075, dividend_yield = 0.0000, data_source = 'manual' WHERE ticker = 'DJP';
    UPDATE public.instruments SET expense_ratio = 0.0007, dividend_yield = 0.0125, data_source = 'manual' WHERE ticker = 'CSSPX.SW';
    UPDATE public.instruments SET expense_ratio = 0.0009, dividend_yield = 0.0140, data_source = 'manual' WHERE ticker = '500E.SW';
    UPDATE public.instruments SET expense_ratio = 0.0014, dividend_yield = 0.0345, data_source = 'manual' WHERE ticker = 'CHDVD.SW';
    UPDATE public.instruments SET expense_ratio = 0.0020, dividend_yield = 0.0192, data_source = 'manual' WHERE ticker = 'SSAC.SW';
    UPDATE public.instruments SET expense_ratio = 0.0022, dividend_yield = 0.0214, data_source = 'manual' WHERE ticker = 'VWRL.LSE';
    -- NOVN.SW is a stock not an ETF; expense_ratio is 0; use trailing 12-mo dividend yield
    UPDATE public.instruments SET expense_ratio = 0.0000, dividend_yield = 0.0386, data_source = 'manual' WHERE ticker = 'NOVN.SW';
    ```

    Apply both migrations:
    ```bash
    npx supabase db push --include-all 2>&1 || npx supabase db push 2>&1
    ```
    If the project uses a remote Supabase via Supavisor (per STATE.md `port 6543`), run against the actual dev DB. Verify by querying:
    ```bash
    node --env-file=.env.local --import tsx -e "import {createClient} from '@supabase/supabase-js'; const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); sb.from('portfolios').select('id, name, is_template').eq('is_template', true).then(r => console.log(JSON.stringify(r.data)))"
    ```
    Expect 3 rows.

    Use the migration approach (NOT manual SQL execution) per established Phase 1-3 pattern.
  </action>
  <verify>
    <automated>test -f supabase/migrations/00004_portfolio_templates.sql && test -f supabase/migrations/00005_seed_etf_metadata.sql && grep -q "is_template = true" supabase/migrations/00004_portfolio_templates.sql && grep -q "ALTER COLUMN user_id DROP NOT NULL" supabase/migrations/00004_portfolio_templates.sql && grep -q "Classic 60/40" supabase/migrations/00004_portfolio_templates.sql && grep -q "All-Weather" supabase/migrations/00004_portfolio_templates.sql && grep -cE "UPDATE public.instruments SET expense_ratio" supabase/migrations/00005_seed_etf_metadata.sql | awk '$1>=14{exit 0} {exit 1}'</automated>
  </verify>
  <done>Both migration files exist with correct DDL/DML; 3 template rows seedable; 14+ UPDATE statements for ETF metadata; both apply cleanly to dev DB (manual verification of remote DB rows acceptable in execute log).</done>
</task>

<task type="auto">
  <name>Task 3: Create Wave 0 test stub files (vitest unit + Playwright integration) and shared helper</name>
  <files>vitest.config.mts, tests/helpers/test-portfolio.ts, tests/integration/portfolio-create.spec.ts, tests/integration/portfolio-edit.spec.ts, tests/integration/portfolio-delete.spec.ts, tests/integration/portfolio-list.spec.ts, tests/integration/instrument-search.spec.ts, tests/integration/portfolio-template.spec.ts, tests/integration/portfolio-csv-import.spec.ts, src/app/dashboard/portfolios/_schema.test.ts, src/lib/portfolio/normalize-weights.test.ts, src/lib/portfolio/compute-metrics.test.ts, src/lib/portfolio/chf-format.test.ts, src/lib/portfolio/parse-csv.test.ts</files>
  <action>
    Create stub files. Each MUST satisfy: (a) file exists, (b) imports/declarations type-check, (c) test runner does not fail (use `it.todo` for unit tests and `test.skip` for Playwright specs).

    EXISTING vitest.config.mts already exists from Phase 3 — DO NOT recreate it. Read it first; only edit if it is missing `*.test.tsx` glob coverage. Per critical_constraints, do NOT add jsdom env (RTL not installed). The current node-env config remains.

    Step 1 — Create `tests/helpers/test-portfolio.ts`:

    ```ts
    import { createClient as createServiceClient } from '@supabase/supabase-js'

    type Service = ReturnType<typeof createServiceClient>

    export function getServiceClient(): Service {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
      if (!url || !key) throw new Error('Missing SUPABASE service env')
      return createServiceClient(url, key, { auth: { persistSession: false } })
    }

    export type SeedPortfolioInput = {
      userId: string
      name: string
      investmentAmount?: number
      items?: { ticker: string; weight: number }[]
    }

    export async function createTestPortfolio(input: SeedPortfolioInput): Promise<{ id: string }> {
      // STUB — full implementation in Plan 03 (uses RPC). For now throws so callers know stub.
      throw new Error('createTestPortfolio not yet implemented (Wave 0 stub)')
    }

    export async function cleanupTestPortfolio(portfolioId: string): Promise<void> {
      const sb = getServiceClient()
      await sb.from('portfolios').delete().eq('id', portfolioId)
    }

    export async function loginTestUser(page: import('@playwright/test').Page): Promise<{ userId: string; email: string }> {
      // Reuse Phase 1 auth flow. Implementation in Plan 05; stub for Wave 0.
      throw new Error('loginTestUser not yet implemented (Wave 0 stub)')
    }
    ```

    Step 2 — Create unit-test stubs (each is a vitest file with `it.todo` declarations referencing the requirement IDs):

    `src/app/dashboard/portfolios/_schema.test.ts`:
    ```ts
    import { describe, it } from 'vitest'

    describe('PortfolioSchema (PORT-03)', () => {
      it.todo('rejects portfolio with weights summing < 99.99')
      it.todo('rejects portfolio with weights summing > 100.01')
      it.todo('accepts portfolio with weights summing exactly 100')
      it.todo('accepts portfolio with weights summing 99.99–100.01 (tolerance)')
      it.todo('rejects empty items array (PORT-03 + PORT-01: at least one instrument)')
      it.todo('rejects negative weights')
      it.todo('rejects weight > 100')
      it.todo('rejects empty name')
      it.todo('rejects investment_amount <= 0')
    })
    ```

    `src/lib/portfolio/normalize-weights.test.ts`:
    ```ts
    import { describe, it } from 'vitest'

    describe('normalizeTo100 (PORT-03)', () => {
      it.todo('proportionally rescales [50, 50, 50] to [33.33, 33.33, 33.34]')
      it.todo('handles all zeros without division-by-zero')
      it.todo('rounds to 2 decimal places (NUMERIC(5,2) safety)')
      it.todo('drift correction: result sum is exactly 100.00')
      it.todo('preserves zero entries as zero')
    })
    ```

    `src/lib/portfolio/compute-metrics.test.ts`:
    ```ts
    import { describe, it } from 'vitest'

    describe('computeMetrics (PORT-05, PORT-06)', () => {
      it.todo('weighted TER = sum(weight_i × expense_ratio_i) / 100')
      it.todo('weighted dividend yield = sum(weight_i × dividend_yield_i) / 100')
      it.todo('annualIncome = investment_amount × yield')
      it.todo('null expense_ratio treated as 0 and tracked in terMissingIds')
      it.todo('null dividend_yield treated as 0 and tracked in yieldMissingIds')
      it.todo('returns zero metrics for empty items')
      it.todo('does not double-multiply: expense_ratio is a fraction, weight is percent')
    })
    ```

    `src/lib/portfolio/chf-format.test.ts`:
    ```ts
    import { describe, it } from 'vitest'

    describe('fmtCHF (PORT-04)', () => {
      it.todo("fmtCHF(10000) returns 'CHF 10\\u2019000' or 'CHF 10\\'000' (Swiss apostrophe)")
      it.todo("fmtCHF(10000.5) returns 'CHF 10\\'000.50'")
      it.todo("fmtCHF(1234567.89) returns 'CHF 1\\'234\\'567.89'")
      it.todo('fmtCHF(0) returns CHF 0')
      it.todo('handles negative amounts')
    })
    ```

    `src/lib/portfolio/parse-csv.test.ts`:
    ```ts
    import { describe, it } from 'vitest'

    describe('parsePortfolioCsv (PORT-08)', () => {
      it.todo('parses well-formed CSV with ticker,weight headers')
      it.todo('handles optional exchange column')
      it.todo('case-insensitive headers')
      it.todo('rejects rows missing ticker or weight')
      it.todo('rejects non-numeric weight')
      it.todo('handles BOM, CRLF, quoted fields')
      it.todo('returns errors[] for malformed rows without throwing')
    })
    ```

    Step 3 — Create Playwright integration stubs. Each must use `test.skip(...)` so the runner does not actually exercise the missing UI. Pattern:

    `tests/integration/portfolio-create.spec.ts`:
    ```ts
    import { test } from '@playwright/test'

    test.describe('PORT-01 / PORT-04 / META-01: create portfolio', () => {
      test.skip('user can create a portfolio with name + 1+ instrument + sum=100', async () => {})
      test.skip('investment_amount required, defaults to CHF 10,000', async () => {})
      test.skip('instrument metadata (name, expense_ratio, dividend_yield) renders in row', async () => {})
      test.skip('Save disabled when sum != 100', async () => {})
      test.skip('Normalize-to-100 button rescales weights', async () => {})
    })
    ```

    Repeat the same pattern (skipped describe block + multiple `test.skip` lines) for the remaining 6 integration files. Each MUST reference the relevant requirement IDs in the describe name. Suggested test counts:
    - portfolio-edit.spec.ts: 3 skipped tests (load, change weights, save diff applied)
    - portfolio-delete.spec.ts: 3 (confirm dialog, delete, FK cascade verified)
    - portfolio-list.spec.ts: 4 (empty state, list rows, template-row excluded, click→edit)
    - instrument-search.spec.ts: 5 (search by ticker, by ISIN, multi-venue dropdown, not_found inline, rate_limit toast)
    - portfolio-template.spec.ts: 3 (dialog opens, click→builder pre-filled with "(copy)", save persists as user portfolio)
    - portfolio-csv-import.spec.ts: 4 (upload→preview, unresolved tickers flagged, edit weights in preview, save end-to-end)

    Step 4 — Sanity run:
    ```bash
    npm run test:unit  # all unit stubs should report `todo`, exit 0
    npx playwright test tests/integration --list  # should list skipped specs without errors
    ```

    Do NOT run full Playwright (it requires a dev server). `--list` confirms file discovery.

    Per AGENTS.md: do not import Next.js APIs (`next/navigation`, `next/headers`) into vitest stubs — they require runtime context. Stubs only reference module paths that will exist; do NOT import yet (use only describe + it.todo + test.skip).
  </action>
  <verify>
    <automated>npm run test:unit 2>&1 | tail -10 && npx playwright test tests/integration --list 2>&1 | tail -20 && test -f tests/helpers/test-portfolio.ts && for f in tests/integration/portfolio-create.spec.ts tests/integration/portfolio-edit.spec.ts tests/integration/portfolio-delete.spec.ts tests/integration/portfolio-list.spec.ts tests/integration/instrument-search.spec.ts tests/integration/portfolio-template.spec.ts tests/integration/portfolio-csv-import.spec.ts src/app/dashboard/portfolios/_schema.test.ts src/lib/portfolio/normalize-weights.test.ts src/lib/portfolio/compute-metrics.test.ts src/lib/portfolio/chf-format.test.ts src/lib/portfolio/parse-csv.test.ts; do test -f "$f" || { echo "MISSING $f"; exit 1; }; done</automated>
  </verify>
  <done>All 12 stub test files + helper exist; vitest run reports `todo` (not `fail`); playwright --list discovers all 7 integration specs without parse errors.</done>
</task>

</tasks>

<verification>
- All shadcn components install at expected paths
- Two new migrations (00004, 00005) apply cleanly to the dev Supabase via supavisor pooler
- 3 template rows queryable post-migration (`SELECT count(*) FROM portfolios WHERE is_template = true` returns 3)
- 14+ instruments rows have non-null expense_ratio and dividend_yield post-migration
- All 12 stub test files green (todo/skip), no fail
- npm run build passes (no type errors from new shadcn imports)
</verification>

<success_criteria>
1. `npm install` clean exit; `package.json` lists react-hook-form, @hookform/resolvers, zod, papaparse, @types/papaparse
2. `src/components/ui/{popover,command,form,sonner,tooltip,alert-dialog,separator}.tsx` all exist
3. `<Toaster />` rendered globally in `src/app/layout.tsx`
4. `supabase/migrations/00004_portfolio_templates.sql` and `00005_seed_etf_metadata.sql` exist and apply cleanly
5. Post-migration DB has: portfolios.user_id is nullable; 3 template rows present; 14 v1 instruments have non-null TER + yield
6. All 12 Wave 0 test stub files exist; `npm run test:unit` reports todos (green); `npx playwright test --list` discovers all integration specs without errors
7. Test helper `tests/helpers/test-portfolio.ts` exposes the documented stub API
</success_criteria>

<output>
After completion, create `.planning/phases/04-portfolio-builder/04-01-SUMMARY.md` capturing:
- Final shadcn versions installed (run `npx shadcn@latest --version` and the relevant package versions)
- Migration row counts post-apply (templates: 3 expected; instruments updated: 14 expected)
- List of stub files with their requirement-ID coverage
- Any deviations from the plan (e.g., shadcn `--yes` flag behavior, RTL deferral confirmed)
</output>
