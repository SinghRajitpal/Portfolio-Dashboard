---
phase: 04-portfolio-builder
plan: 03
type: execute
wave: 3
depends_on: ["04-02"]
files_modified:
  - supabase/migrations/00006_save_portfolio_rpc.sql
  - src/app/dashboard/portfolios/_actions.ts
  - src/app/dashboard/portfolios/_queries.ts
  - tests/helpers/test-portfolio.ts
  - tests/unit/save-portfolio-rpc.test.ts
autonomous: true
requirements: [PORT-01, PORT-03, PORT-04, PORT-07]
user_setup:
  - service: supabase
    why: "Apply migration 00006 (save_portfolio RPC) before tests or UI hits /dashboard/portfolios"
    dashboard_config:
      - task: "Run `npx supabase db push` after migration is committed"
        location: "Local terminal — uses .env.local Supabase pooler URL"

must_haves:
  truths:
    - "Migration 00006 creates a SECURITY INVOKER function save_portfolio(...) returning portfolio UUID"
    - "save_portfolio upserts the portfolios row, deletes existing portfolio_instruments, inserts new ones, all in one transaction"
    - "savePortfolio Server Action validates body with PortfolioSchema and returns {ok:true,id} | {ok:false,error}"
    - "savePortfolio rejects unauthenticated callers with {ok:false,error:'Not authenticated'}"
    - "deletePortfolio Server Action deletes the user's portfolio (RLS enforces ownership) and revalidates list path"
    - "listPortfolios returns only the calling user's non-template portfolios with computed instrument count"
    - "getPortfolioForEdit returns full PortfolioInput shape (id, name, description, investment_amount, items[]) hydrated with ticker + name from instruments table"
    - "listTemplates returns the 3 seeded templates visible to authenticated users (RLS allows is_template=true read)"
    - "Round-trip via the RPC: createTestPortfolio helper creates a portfolio, listPortfolios returns it, deletePortfolio removes it"
  artifacts:
    - path: "supabase/migrations/00006_save_portfolio_rpc.sql"
      provides: "Atomic save_portfolio(p_id, p_user_id, p_name, p_description, p_investment_amount, p_items) RETURNS UUID"
      contains: "CREATE OR REPLACE FUNCTION public.save_portfolio"
    - path: "src/app/dashboard/portfolios/_actions.ts"
      provides: "'use server' RPC actions: savePortfolio, deletePortfolio"
      exports: ["savePortfolio", "deletePortfolio"]
    - path: "src/app/dashboard/portfolios/_queries.ts"
      provides: "Server-only DB reads: listPortfolios, getPortfolioForEdit, listTemplates, getInstrumentMetaMap, getInstrumentByTicker"
      exports: ["listPortfolios", "getPortfolioForEdit", "listTemplates", "getInstrumentMetaMap", "getInstrumentByTicker"]
    - path: "tests/helpers/test-portfolio.ts"
      provides: "Real (no longer stub) createTestPortfolio + cleanupTestPortfolio + loginTestUser helpers"
  key_links:
    - from: "src/app/dashboard/portfolios/_actions.ts"
      to: "supabase.rpc('save_portfolio', ...)"
      via: "Server-action atomic upsert"
      pattern: "rpc\\('save_portfolio'"
    - from: "src/app/dashboard/portfolios/_actions.ts"
      to: "PortfolioSchema (Plan 02)"
      via: "safeParse on incoming FormData JSON before DB hit"
      pattern: "PortfolioSchema\\.safeParse"
    - from: "supabase/migrations/00006_save_portfolio_rpc.sql"
      to: "RLS"
      via: "SECURITY INVOKER — caller-context, RLS still applies"
      pattern: "SECURITY INVOKER"
---

<objective>
Server-side persistence layer for Phase 4: a Postgres RPC for atomic save + Next.js Server Actions wrapping it + read queries for the list, edit, and template flows.

Purpose: One round-trip atomic save (upsert portfolio + diff items in one transaction) prevents partial-write bugs. Server Actions are the Next.js 16 idiom — useActionState integrates them with the client form without manual fetch wiring. Read queries are colocated with the route per Next.js convention.
Output: 1 migration + 2 server-only TS files + a real test helper, exercised by an integration-style RPC round-trip test.
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
@src/lib/supabase/server.ts
@src/lib/supabase/client.ts
@supabase/migrations/00001_initial_schema.sql

<interfaces>
From src/app/dashboard/portfolios/_schema.ts (Plan 02):
```typescript
export const PortfolioSchema: z.ZodType
export type PortfolioInput = {
  id?: string
  name: string
  description?: string
  investment_amount: number
  items: { instrument_id: string; ticker: string; name: string; weight: number }[]
}
```

From src/lib/supabase/server.ts (Phase 1):
```typescript
export async function createClient(): Promise<SupabaseClient> // user-scoped, async because cookies() is async
```

DB schema (Phase 1, 00001):
- portfolios(id, user_id, name, description, investment_amount, rebalance_frequency, is_template, timestamps)
- portfolio_instruments(id, portfolio_id, instrument_id, weight, UNIQUE(portfolio_id, instrument_id))
- instruments(id, ticker, name, isin, type, currency, exchange, expense_ratio, dividend_yield, ...)
- RLS: (SELECT auth.uid()) = user_id on portfolios; portfolio_instruments inherits via FK
</interfaces>

<contracts_to_export>
```typescript
// src/app/dashboard/portfolios/_actions.ts
'use server'
export async function savePortfolio(prev: unknown, formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }>
export async function deletePortfolio(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>

// src/app/dashboard/portfolios/_queries.ts
export type PortfolioListRow = {
  id: string; name: string; updated_at: string
  instrument_count: number
  weighted_ter: number | null
  weighted_yield: number | null
}
export async function listPortfolios(): Promise<PortfolioListRow[]>
export async function getPortfolioForEdit(id: string): Promise<PortfolioInput | null>
export async function listTemplates(): Promise<{ id: string; name: string; description: string | null; items: { instrument_id: string; ticker: string; name: string; weight: number }[] }[]>
export async function getInstrumentMetaMap(ids: string[]): Promise<Map<string, { expense_ratio: number | null; dividend_yield: number | null }>>
export async function getInstrumentByTicker(ticker: string, exchange?: string): Promise<{ id: string; ticker: string; name: string; exchange: string | null; currency: string; expense_ratio: number | null; dividend_yield: number | null } | null>
```
</contracts_to_export>

<critical_constraints>
- AGENTS.md / Next.js 16: cookies() is async; supabase server createClient() is async. All _queries.ts and _actions.ts calls MUST `await createClient()`.
- Per RESEARCH "Pitfall 5": Validate FIRST in the Server Action; only call redirect() after success. NEVER wrap redirect() in try/catch. Decision for this plan: do NOT call redirect() inside the action — return {ok,id} and let the client (Plan 04 builder) call router.push. Keeps action testable.
- Per RESEARCH "Pitfall 9": _actions.ts and _queries.ts are server-only. Add `import 'server-only'` at the top of _queries.ts to fail-fast if a client component imports it. _actions.ts uses `'use server'` directive, which serves the same purpose.
- RPC save_portfolio MUST be SECURITY INVOKER (default) so RLS continues to apply. INSERT against public.portfolios is blocked if user_id != auth.uid().
- RPC body uses INSERT ... ON CONFLICT (id) DO UPDATE for upsert. For items: DELETE WHERE portfolio_id = ? followed by bulk INSERT FROM jsonb_array_elements(p_items). The whole function body runs in a single implicit transaction.
- RPC accepts p_id UUID (nullable; COALESCE(p_id, gen_random_uuid())). Server Action passes null for new portfolios.
- Server Action receives FormData with a single field `payload` containing JSON.stringify of PortfolioInput. This pattern allows complex nested data through Server Actions.
- Use revalidatePath('/dashboard/portfolios') after save and delete.
- The CHECK constraint added in 00004 (is_template = false AND user_id IS NOT NULL) means save_portfolio with NULL user_id will fail; the action MUST always pass the authenticated user's UUID.
- tests/helpers/test-portfolio.ts upgrade: replace stub throw with real implementations using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS for setup/teardown only — never used by app code).
</critical_constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration 00006 — atomic save_portfolio RPC</name>
  <files>supabase/migrations/00006_save_portfolio_rpc.sql</files>
  <action>
    Create supabase/migrations/00006_save_portfolio_rpc.sql per RESEARCH Pattern 2:

    1. Function signature (SECURITY INVOKER, LANGUAGE plpgsql):
       - p_id UUID (nullable), p_user_id UUID, p_name TEXT, p_description TEXT, p_investment_amount NUMERIC, p_items JSONB
       - Returns UUID (the portfolio id)
       - Body: INSERT ... ON CONFLICT (id) DO UPDATE on portfolios; DELETE FROM portfolio_instruments WHERE portfolio_id = v_portfolio_id; INSERT INTO portfolio_instruments SELECT FROM jsonb_array_elements(p_items)
       - Use COALESCE(p_id, gen_random_uuid()) for the upsert id source
       - SET updated_at = now() on the conflict update branch

    2. Grant execute to authenticated:
       REVOKE ALL ON FUNCTION public.save_portfolio(UUID, UUID, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC;
       GRANT EXECUTE ON FUNCTION public.save_portfolio(UUID, UUID, TEXT, TEXT, NUMERIC, JSONB) TO authenticated;

    3. Apply migration: `npx supabase db push`

    4. Smoke-test the function exists by running a service-role rpc call:
       node --env-file=.env.local --import tsx -e "import {createClient} from '@supabase/supabase-js'; const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); sb.rpc('save_portfolio', { p_id: null, p_user_id: '00000000-0000-0000-0000-000000000000', p_name: 'smoke', p_description: null, p_investment_amount: 1, p_items: [] }).then(r => console.log(JSON.stringify(r)))"

    Expect either success (returns UUID) or RLS-related error (proves callable). Do NOT leave the smoke row in the DB.

    Use the migration approach (NOT inline SQL execution) per established Phase 1-3 pattern.
  </action>
  <verify>
    <automated>test -f supabase/migrations/00006_save_portfolio_rpc.sql && grep -q "CREATE OR REPLACE FUNCTION public.save_portfolio" supabase/migrations/00006_save_portfolio_rpc.sql && grep -q "SECURITY INVOKER" supabase/migrations/00006_save_portfolio_rpc.sql && grep -q "GRANT EXECUTE" supabase/migrations/00006_save_portfolio_rpc.sql && grep -q "ON CONFLICT" supabase/migrations/00006_save_portfolio_rpc.sql</automated>
  </verify>
  <done>Migration file exists with RPC body, SECURITY INVOKER, GRANT to authenticated, ON CONFLICT upsert + DELETE/INSERT items pattern. Migration applied to dev DB (verified by execute log).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Server Actions (savePortfolio, deletePortfolio) + queries module</name>
  <files>src/app/dashboard/portfolios/_actions.ts, src/app/dashboard/portfolios/_queries.ts</files>
  <behavior>
    savePortfolio:
    - Unauthenticated → {ok:false, error:'Not authenticated'}
    - Invalid payload (sum != 100, empty name, etc.) → {ok:false, error: <Zod issue message>}
    - Valid payload with no id → {ok:true, id: <fresh UUID>}, calls revalidatePath('/dashboard/portfolios')
    - Valid payload with existing id owned by user → upserts, replaces items, returns {ok:true, id}
    - Existing id NOT owned by user → {ok:false, error: <RLS error>}
    - Never throws — always returns the discriminated tuple
    - Never calls redirect() — caller decides

    deletePortfolio:
    - Unauthenticated → {ok:false, error:'Not authenticated'}
    - Missing id field → {ok:false, error:'Missing id'}
    - Owner deletes → {ok:true}, revalidatePath
    - Non-owner attempt: re-query post-delete; if row still exists return {ok:false, error:'Delete blocked (not owner or RLS)'}

    _queries.ts:
    - listPortfolios: user's portfolios where is_template=false; compute instrument_count + weighted_ter + weighted_yield (null when no instruments have data); ordered by updated_at desc
    - getPortfolioForEdit(id): join portfolios + portfolio_instruments + instruments → PortfolioInput; null if not found
    - listTemplates: select where is_template=true with embedded items (uses Plan 04 RLS read policy)
    - getInstrumentMetaMap(ids): single SELECT id, expense_ratio, dividend_yield FROM instruments WHERE id = ANY → Map<id, meta>
    - getInstrumentByTicker(ticker, exchange?): SELECT instruments by ticker [+ optional exchange]; used by CSV import
  </behavior>
  <action>
    Create src/app/dashboard/portfolios/_actions.ts (per RESEARCH Pattern 1, refined):

    Top of file: `'use server'` directive.
    Imports: revalidatePath from next/cache; createClient from @/lib/supabase/server; PortfolioSchema from ./_schema.

    savePortfolio body:
    1. await createClient()
    2. await supabase.auth.getUser() — return {ok:false, error:'Not authenticated'} if no user
    3. JSON.parse(formData.get('payload')) wrapped in try/catch — return {ok:false, error:'Invalid payload JSON'} on parse fail
    4. PortfolioSchema.safeParse(raw) — return {ok:false, error: parsed.error.issues[0].message} on validation fail
    5. Call supabase.rpc('save_portfolio', { p_id: id ?? null, p_user_id: user.id, p_name: name, p_description: description ?? null, p_investment_amount: investment_amount, p_items: items.map(it => ({instrument_id: it.instrument_id, weight: it.weight})) })
    6. On error → {ok:false, error: error.message}
    7. revalidatePath('/dashboard/portfolios') and revalidatePath(`/dashboard/portfolios/${portfolioId}/edit`)
    8. Return {ok:true, id: portfolioId}

    deletePortfolio body:
    1. await createClient()
    2. Auth check
    3. id = String(formData.get('id') ?? '') — empty → {ok:false, error:'Missing id'}
    4. supabase.from('portfolios').delete().eq('id', id) — error → {ok:false, error: error.message}
    5. Re-query: supabase.from('portfolios').select('id').eq('id', id).maybeSingle() — if row still exists → {ok:false, error:'Delete blocked (not owner or RLS)'}
    6. revalidatePath('/dashboard/portfolios')
    7. Return {ok:true}

    Create src/app/dashboard/portfolios/_queries.ts:
    Top of file: `import 'server-only'`.
    Imports: createClient from @/lib/supabase/server; type PortfolioInput from './_schema'.

    listPortfolios:
    - sb.from('portfolios').select with embedded portfolio_instruments(weight, instruments(expense_ratio, dividend_yield))
    - .eq('is_template', false).order('updated_at', { ascending: false })
    - For each row, compute weighted_ter and weighted_yield in JS (null if no items have the metric); instrument_count = items.length

    getPortfolioForEdit(id):
    - sb.from('portfolios').select with embedded portfolio_instruments(weight, instruments(id, ticker, name))
    - .eq('id', id).maybeSingle()
    - Map to PortfolioInput shape; convert NUMERIC fields via Number(...)

    listTemplates:
    - Same shape as getPortfolioForEdit but with .eq('is_template', true).order('name')
    - Returns array of {id, name, description, items[]}

    getInstrumentMetaMap(ids):
    - Empty input → empty Map
    - sb.from('instruments').select('id, expense_ratio, dividend_yield').in('id', ids)
    - Convert NUMERIC fields via Number(...) — Supabase returns string for NUMERIC by default

    getInstrumentByTicker(ticker, exchange?):
    - sb.from('instruments').select(...).eq('ticker', ticker)
    - Optional .eq('exchange', exchange)
    - .limit(1).maybeSingle()
    - Convert NUMERIC fields

    NUMERIC handling caveat: Supabase JS client returns NUMERIC columns as either string or number depending on driver/version. Always wrap via `Number(...)` defensively (with null check). Test this in Task 3.

    Run `npx tsc --noEmit` to confirm types.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -20 && grep -q "'use server'" src/app/dashboard/portfolios/_actions.ts && grep -q "import 'server-only'" src/app/dashboard/portfolios/_queries.ts && grep -q "PortfolioSchema.safeParse" src/app/dashboard/portfolios/_actions.ts && grep -q "rpc('save_portfolio'" src/app/dashboard/portfolios/_actions.ts && grep -q "is_template" src/app/dashboard/portfolios/_queries.ts</automated>
  </verify>
  <done>_actions.ts and _queries.ts exist with the documented exports; tsc passes; required string patterns present (use server, server-only, safeParse, rpc, is_template).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Real test helper + RPC round-trip integration test</name>
  <files>tests/helpers/test-portfolio.ts, tests/unit/save-portfolio-rpc.test.ts</files>
  <behavior>
    tests/helpers/test-portfolio.ts (replaces Wave 0 stub):
    - getServiceClient() returns a service-role Supabase client (auth.persistSession=false)
    - createTestUser(): creates auth.users row via service-role, returns {userId, email, accessToken, signOut}
      - Uses supabase.auth.admin.createUser({email, password, email_confirm:true})
      - Returns access token by signing in via separate anon client
    - createTestPortfolio({userId, name, items?, investmentAmount?}): direct INSERT via service client (bypasses RLS for setup); returns {id}
    - cleanupTestPortfolio(id): DELETE via service client
    - cleanupTestUser(userId): supabase.auth.admin.deleteUser(userId) — also cascades portfolios via FK
    - loginTestUser(page): playwright helper — uses createTestUser + UI-driven sign-in (used by integration specs in later plans)

    tests/unit/save-portfolio-rpc.test.ts:
    - Skipped by default (gated by `process.env.SUPABASE_SERVICE_ROLE_KEY`); when key present, runs real round-trip
    - it('round-trips a portfolio via the RPC', async () => { create user → call save_portfolio with 2 items summing 100 → assert id returned → assert portfolios row exists → assert 2 portfolio_instruments rows exist → cleanup })
    - it('replaces items on second call (DELETE+INSERT semantics)', async () => { call save_portfolio twice with different items → assert only 2nd-call items remain })
    - it('rejects invalid user_id (RLS / FK)', async () => { call with random user_id → expect error })
  </behavior>
  <action>
    Step 1 — Replace tests/helpers/test-portfolio.ts. Use SUPABASE_SERVICE_ROLE_KEY for admin operations. The anon client (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY per STATE.md note: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY used (not ANON_KEY)") is separate; the helper uses both depending on need.

    ```ts
    import { createClient as createSupabaseClient } from '@supabase/supabase-js'
    import type { Page } from '@playwright/test'

    function envOrThrow(k: string): string {
      const v = process.env[k]
      if (!v) throw new Error(`Missing env ${k}`)
      return v
    }

    export function getServiceClient() {
      return createSupabaseClient(
        envOrThrow('NEXT_PUBLIC_SUPABASE_URL'),
        envOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
        { auth: { persistSession: false } },
      )
    }

    export async function createTestUser() {
      const sb = getServiceClient()
      const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
      const password = 'test-password-12345'
      const { data, error } = await sb.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (error || !data.user) throw error ?? new Error('createUser failed')
      return { userId: data.user.id, email, password }
    }

    export async function cleanupTestUser(userId: string) {
      const sb = getServiceClient()
      await sb.auth.admin.deleteUser(userId)
    }

    export type SeedPortfolioInput = {
      userId: string
      name: string
      investmentAmount?: number
      items?: { instrument_id: string; weight: number }[]
    }

    export async function createTestPortfolio({ userId, name, investmentAmount = 10000, items = [] }: SeedPortfolioInput) {
      const sb = getServiceClient()
      const { data, error } = await sb
        .from('portfolios')
        .insert({ user_id: userId, name, investment_amount: investmentAmount, is_template: false })
        .select('id')
        .single()
      if (error || !data) throw error ?? new Error('insert portfolio failed')
      const portfolioId = data.id as string
      if (items.length > 0) {
        const { error: e2 } = await sb
          .from('portfolio_instruments')
          .insert(items.map(it => ({ portfolio_id: portfolioId, instrument_id: it.instrument_id, weight: it.weight })))
        if (e2) throw e2
      }
      return { id: portfolioId }
    }

    export async function cleanupTestPortfolio(id: string) {
      const sb = getServiceClient()
      await sb.from('portfolios').delete().eq('id', id)
    }

    export async function loginTestUser(page: Page, opts?: { email?: string; password?: string }) {
      const user = opts?.email && opts.password
        ? { userId: '', email: opts.email, password: opts.password }
        : await createTestUser()
      await page.goto('/')
      await page.getByRole('tab', { name: /sign in/i }).click()
      await page.getByLabel(/email/i).fill(user.email)
      await page.getByLabel(/password/i).fill(user.password)
      await page.getByRole('button', { name: /sign in/i }).click()
      await page.waitForURL('**/dashboard**')
      return user
    }
    ```

    NOTE: loginTestUser may need adjustment to match Phase 1 auth UI exactly. Plans that consume it (05+) will refine. The contract surface is fixed.

    Step 2 — Create tests/unit/save-portfolio-rpc.test.ts:

    ```ts
    import { describe, it, expect, beforeAll, afterAll } from 'vitest'
    import { getServiceClient, createTestUser, cleanupTestUser } from '../helpers/test-portfolio'

    const ENABLED = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL

    describe.skipIf(!ENABLED)('save_portfolio RPC (PORT-01, PORT-03, PORT-04)', () => {
      let userId: string
      let instrumentIds: string[] = []

      beforeAll(async () => {
        const u = await createTestUser()
        userId = u.userId
        // Use 2 known seeded tickers
        const sb = getServiceClient()
        const { data } = await sb.from('instruments').select('id').in('ticker', ['VT', 'AGG']).limit(2)
        instrumentIds = (data ?? []).map(r => r.id as string)
        if (instrumentIds.length < 2) throw new Error('Seeded instruments VT/AGG missing')
      })

      afterAll(async () => {
        if (userId) await cleanupTestUser(userId)
      })

      it('round-trips a portfolio with 2 items summing 100', async () => {
        const sb = getServiceClient()
        const { data: id, error } = await sb.rpc('save_portfolio', {
          p_id: null,
          p_user_id: userId,
          p_name: 'TestRPC',
          p_description: null,
          p_investment_amount: 10000,
          p_items: [
            { instrument_id: instrumentIds[0], weight: 60 },
            { instrument_id: instrumentIds[1], weight: 40 },
          ],
        })
        expect(error).toBeNull()
        expect(typeof id).toBe('string')

        const { data: items } = await sb.from('portfolio_instruments').select('weight').eq('portfolio_id', id as string)
        expect(items).toHaveLength(2)
      })

      it('replaces items on second call (DELETE+INSERT)', async () => {
        const sb = getServiceClient()
        const { data: id1 } = await sb.rpc('save_portfolio', {
          p_id: null, p_user_id: userId, p_name: 'Replace', p_description: null,
          p_investment_amount: 10000,
          p_items: [{ instrument_id: instrumentIds[0], weight: 100 }],
        })
        const { data: id2 } = await sb.rpc('save_portfolio', {
          p_id: id1, p_user_id: userId, p_name: 'Replace', p_description: null,
          p_investment_amount: 10000,
          p_items: [
            { instrument_id: instrumentIds[0], weight: 50 },
            { instrument_id: instrumentIds[1], weight: 50 },
          ],
        })
        expect(id1).toBe(id2)
        const { data: items } = await sb.from('portfolio_instruments').select('weight').eq('portfolio_id', id2 as string)
        expect(items).toHaveLength(2)
      })
    })
    ```

    The describe.skipIf gate ensures local devs without service key still pass `npm run test:unit`. CI must set the env var.

    Run vitest: `npm run test:unit -- tests/unit/save-portfolio-rpc.test.ts`
  </action>
  <verify>
    <automated>npm run test:unit -- tests/unit/save-portfolio-rpc.test.ts 2>&1 | tail -15 && grep -q "createTestUser" tests/helpers/test-portfolio.ts && grep -q "save_portfolio" tests/unit/save-portfolio-rpc.test.ts</automated>
  </verify>
  <done>Helper module exposes createTestUser/createTestPortfolio/cleanup* + loginTestUser; RPC round-trip test passes (or skips cleanly when env missing); no Wave 0 throws remain in test-portfolio.ts.</done>
</task>

</tasks>

<verification>
- Migration 00006 applied to dev DB; save_portfolio function exists and accepts JSONB items
- Server Actions return discriminated tuples (no thrown errors, no redirects from inside actions)
- Queries module returns typed shapes matching contracts
- RPC round-trip test passes against real DB when service key is set
- `npx tsc --noEmit` clean
</verification>

<success_criteria>
1. supabase/migrations/00006_save_portfolio_rpc.sql exists, applies, function callable
2. src/app/dashboard/portfolios/_actions.ts exports savePortfolio + deletePortfolio with documented contract
3. src/app/dashboard/portfolios/_queries.ts exports listPortfolios + getPortfolioForEdit + listTemplates + getInstrumentMetaMap + getInstrumentByTicker
4. tests/helpers/test-portfolio.ts replaces Wave 0 stubs with working service-role helpers
5. tests/unit/save-portfolio-rpc.test.ts passes when SUPABASE_SERVICE_ROLE_KEY is set; skips otherwise
6. npx tsc --noEmit reports zero errors
</success_criteria>

<output>
After completion, create .planning/phases/04-portfolio-builder/04-03-SUMMARY.md with:
- Migration apply log + smoke RPC call output
- Server-side contracts (savePortfolio + deletePortfolio + queries)
- Confirmed RLS behavior (templates readable by authenticated; user CRUD policies block templates from modification because user_id IS NULL → check fails)
- Any deviation in NUMERIC string vs number handling discovered during testing
</output>
