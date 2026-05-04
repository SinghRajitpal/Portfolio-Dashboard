---
phase: 04-portfolio-builder
plan: 05
type: execute
wave: 4
depends_on: ["04-03", "04-04"]
files_modified:
  - src/app/dashboard/portfolios/page.tsx
  - src/app/dashboard/portfolios/new/page.tsx
  - src/app/dashboard/portfolios/[id]/edit/page.tsx
  - src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx
  - src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx
  - src/app/dashboard/portfolios/_client/PortfolioBuilderClient.tsx
  - src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx
  - src/app/dashboard/portfolios/_client/TemplatePickerDialog.tsx
  - tests/integration/portfolio-create.spec.ts
  - tests/integration/portfolio-edit.spec.ts
  - tests/integration/portfolio-delete.spec.ts
  - tests/integration/portfolio-list.spec.ts
  - tests/integration/instrument-search.spec.ts
  - tests/integration/portfolio-template.spec.ts
autonomous: false

requirements: [PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, META-01]

must_haves:
  truths:
    - "/dashboard/portfolios renders user's portfolios as borderless rows with name, instrument count, weighted TER, weighted yield, last-updated timestamp"
    - "Empty state shows centered message + 'New portfolio' CTA"
    - "Top-right 'New portfolio' button is a dropdown with: Blank, From template, Import CSV"
    - "Clicking a row navigates to /dashboard/portfolios/[id]/edit"
    - "/dashboard/portfolios/new renders PortfolioBuilder in create mode with empty defaults (CHF 10'000 amount)"
    - "/dashboard/portfolios/[id]/edit fetches the portfolio via getPortfolioForEdit, renders PortfolioBuilder in edit mode pre-filled"
    - "Save flow: PortfolioBuilder.onSubmit → savePortfolio Server Action → on ok, router.push to /dashboard/portfolios + sonner success toast"
    - "Save error: action returns {ok:false, error}; builder renders the error banner; no navigation"
    - "Delete: AlertDialog confirm → deletePortfolio Server Action → on ok, list re-renders without the row"
    - "Template picker: 'From template' opens Dialog listing 3 seeded templates with name + description + composition preview; clicking a template navigates to /dashboard/portfolios/new?seed=<templateId> which pre-fills the builder with the template's items + name '[Template] (copy)' but DOES NOT save until user saves"
    - "Templates are NOT in the user's portfolio list (server query filters is_template = false)"
    - "Template picker is also reachable from the empty state (only the new-portfolio CTA visible there)"
    - "Wave 0 stub specs (portfolio-create/edit/delete/list/template/instrument-search) are converted from skip to passing tests"
  artifacts:
    - path: "src/app/dashboard/portfolios/page.tsx"
      provides: "Server Component list page — calls listPortfolios, renders PortfoliosListClient + NewPortfolioMenu + TemplatePickerDialog"
    - path: "src/app/dashboard/portfolios/new/page.tsx"
      provides: "Server Component — supports ?seed=<templateId>; fetches instrumentsMeta + template seed if present; renders PortfolioBuilderClient(mode=create)"
    - path: "src/app/dashboard/portfolios/[id]/edit/page.tsx"
      provides: "Server Component — fetches getPortfolioForEdit + instrumentsMeta; renders PortfolioBuilderClient(mode=edit)"
    - path: "src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx"
      provides: "Client Component — renders rows + DeletePortfolioButton; row click navigates to edit"
      exports: ["PortfoliosListClient"]
    - path: "src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx"
      provides: "Client Component — DropdownMenu with Blank / From template / Import CSV (CSV path stubs to a Plan 06 dialog)"
      exports: ["NewPortfolioMenu"]
    - path: "src/app/dashboard/portfolios/_client/PortfolioBuilderClient.tsx"
      provides: "Thin client wrapper that calls savePortfolio Server Action and handles router.push + sonner toast"
      exports: ["PortfolioBuilderClient"]
    - path: "src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx"
      provides: "Client Component — AlertDialog + deletePortfolio Server Action call"
      exports: ["DeletePortfolioButton"]
    - path: "src/app/dashboard/portfolios/_client/TemplatePickerDialog.tsx"
      provides: "Client Component — Dialog listing templates; on select, router.push('/dashboard/portfolios/new?seed=<id>')"
      exports: ["TemplatePickerDialog"]
  key_links:
    - from: "src/app/dashboard/portfolios/page.tsx"
      to: "listPortfolios + listTemplates from _queries"
      via: "Server Component awaiting both"
      pattern: "listPortfolios\\("
    - from: "src/app/dashboard/portfolios/[id]/edit/page.tsx"
      to: "getPortfolioForEdit + getInstrumentMetaMap"
      via: "params.id → fetch portfolio + meta for items"
      pattern: "getPortfolioForEdit\\("
    - from: "src/app/dashboard/portfolios/_client/PortfolioBuilderClient.tsx"
      to: "savePortfolio Server Action"
      via: "FormData with payload field"
      pattern: "savePortfolio"
    - from: "src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx"
      to: "deletePortfolio Server Action"
      via: "FormData with id field"
      pattern: "deletePortfolio"
    - from: "src/app/dashboard/portfolios/_client/TemplatePickerDialog.tsx"
      to: "/dashboard/portfolios/new?seed=<templateId>"
      via: "router.push with seed query param"
      pattern: "seed="
---

<objective>
Wire the pages and the page-level interactions: list, create, edit, delete confirm, template-picker dialog. Connects Plan 03's server actions/queries with Plan 04's builder. Includes a manual verification checkpoint at the end so we confirm the UX matches CONTEXT before adding CSV import (Plan 06).

Purpose: This is the "feature is usable" milestone. After this plan: PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, META-01 are functionally complete (PORT-08 / CSV is the only remaining requirement, owned by Plan 06).
Output: 3 page Server Components + 5 client components + converted-from-stub Playwright integration specs (6 of 7 stubs become real tests; CSV import stays skipped until Plan 06).
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-portfolio-builder/04-CONTEXT.md
@.planning/phases/04-portfolio-builder/04-RESEARCH.md
@.planning/phases/04-portfolio-builder/04-03-server-actions-rpc-PLAN.md
@.planning/phases/04-portfolio-builder/04-04-builder-components-PLAN.md
@CLAUDE.md
@AGENTS.md
@src/app/dashboard/layout.tsx
@src/components/ui/dropdown-menu.tsx
@src/components/ui/dialog.tsx
@src/components/ui/alert-dialog.tsx

<interfaces>
From Plan 03 (server-only):
```typescript
// _queries.ts
export async function listPortfolios(): Promise<PortfolioListRow[]>
export async function getPortfolioForEdit(id: string): Promise<PortfolioInput | null>
export async function listTemplates(): Promise<{ id; name; description; items[] }[]>
export async function getInstrumentMetaMap(ids: string[]): Promise<Map<...>>

// _actions.ts
export async function savePortfolio(prev: unknown, formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }>
export async function deletePortfolio(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>
```

From Plan 04 (client-only):
```typescript
export function PortfolioBuilder(props: {
  mode: 'create' | 'edit' | 'preview'
  initialData?: PortfolioInput
  instrumentsMeta: Record<string, { expense_ratio: number | null; dividend_yield: number | null }>
  onSubmit: (data: PortfolioInput) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
  saving?: boolean
  errorMessage?: string | null
}): JSX.Element
```
</interfaces>

<critical_constraints>
- Per AGENTS.md: Next.js 16. `params` is `Promise<{ id: string }>` — `const { id } = await params` in `[id]/edit/page.tsx`. `searchParams` is also a Promise.
- Server Components fetch data; Client Components handle interaction. The boundary is explicit:
  - Server: `page.tsx` files → call _queries → pass plain JSON-serializable props to client.
  - Client: anything in `_client/` → wraps PortfolioBuilder, calls Server Actions, uses router.
- Per RESEARCH "Pitfall 9": Server Components MUST NOT import from `_client/` files inside their JSX type imports unless the files are themselves client. They CAN render client components as JSX. They CANNOT call client component functions.
- Underscore prefix on `_client/` makes the folder PRIVATE in Next.js 16 (excluded from routing). Confirms the route segment doesn't accidentally expose `/dashboard/portfolios/_client/...` as a URL.
- AlertDialog pattern (shadcn): the "Cancel"/"Continue" actions are inside `<AlertDialogFooter>`. The destructive action calls the Server Action via a form submit OR an onClick handler that builds a FormData.
- DropdownMenu pattern: each item is a `<DropdownMenuItem onSelect={() => router.push(...)}>`.
- Template seed flow: `/dashboard/portfolios/new?seed=<templateId>`. The `new/page.tsx` Server Component reads searchParams, calls `listTemplates()` (or a more targeted `getTemplateById(id)`), maps the template's items to PortfolioInput shape (with `name = '[Template name] (copy)'`, no id), passes as `initialData` prop to PortfolioBuilderClient.
- Sonner toasts: import from 'sonner' on client; `<Toaster />` is already wired in app/layout.tsx (Plan 01).
- Save flow: client wrapper calls savePortfolio. On `ok:true`, `toast.success('Portfolio saved')` + `router.push('/dashboard/portfolios')`. On `ok:false`, render builder's `errorMessage` prop.
- Delete flow: AlertDialog Confirm → deletePortfolio with FormData → on `ok:true`, `router.refresh()` + `toast.success('Portfolio deleted')`. On `ok:false`, `toast.error(error)`.
- Use `useTransition` for the Server Action call so the UI shows a pending state without blocking input.
- Templates list query in `page.tsx`: `listTemplates()` is called server-side; result passed to `<TemplatePickerDialog templates={...} />`. The dialog renders client-side.
- "Import CSV" item in NewPortfolioMenu: For this plan, render a `<DropdownMenuItem disabled>Import CSV (coming in Plan 06)</DropdownMenuItem>` OR omit the item entirely. Decision: include it, marked disabled with subtitle "(coming soon)" so the empty/list state matches CONTEXT-locked decision; Plan 06 will wire the actual handler.
- The plan has a manual checkpoint after implementation (`autonomous: false`) — full UX verification before Plan 06.
- CSV stub item: this plan creates the menu item but does NOT yet wire the upload dialog. That dialog and its action live in Plan 06. Keep the menu item disabled or routed to a "coming soon" page.
</critical_constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server Component pages — list, new, edit</name>
  <files>src/app/dashboard/portfolios/page.tsx, src/app/dashboard/portfolios/new/page.tsx, src/app/dashboard/portfolios/[id]/edit/page.tsx</files>
  <action>
    Replace the existing placeholder `src/app/dashboard/portfolios/page.tsx` with a Server Component:

    ```tsx
    import { listPortfolios, listTemplates, getInstrumentMetaMap } from './_queries'
    import { PortfoliosListClient } from './_client/PortfoliosListClient'
    import { NewPortfolioMenu } from './_client/NewPortfolioMenu'
    import { TemplatePickerDialog } from './_client/TemplatePickerDialog'

    export default async function PortfoliosPage() {
      const [portfolios, templates] = await Promise.all([listPortfolios(), listTemplates()])
      // Pre-fetch meta for all instruments referenced by all portfolios — needed for list-page weighted metrics.
      // Already computed inside listPortfolios; no second fetch needed.
      return (
        <div className="max-w-5xl mx-auto py-8 space-y-8">
          <header className="flex items-center justify-between">
            <h1 className="text-3xl font-medium tracking-tight">Portfolios</h1>
            <NewPortfolioMenu templates={templates} />
          </header>
          <PortfoliosListClient portfolios={portfolios} />
        </div>
      )
    }
    ```

    NOTE: `NewPortfolioMenu` accepts `templates` so it can pass them down to `<TemplatePickerDialog>` (the dialog is rendered inside the menu's "From template" handler). Do not also render TemplatePickerDialog at page level — single-source-of-truth.

    Create `src/app/dashboard/portfolios/new/page.tsx`:

    ```tsx
    import { listTemplates, getInstrumentMetaMap } from '../_queries'
    import { PortfolioBuilderClient } from '../_client/PortfolioBuilderClient'
    import type { PortfolioInput } from '../_schema'

    type Props = { searchParams: Promise<{ seed?: string }> }

    export default async function NewPortfolioPage({ searchParams }: Props) {
      const sp = await searchParams
      const seedId = sp.seed
      let initialData: PortfolioInput | undefined = undefined

      if (seedId) {
        const templates = await listTemplates()
        const t = templates.find(x => x.id === seedId)
        if (t) {
          initialData = {
            name: `${t.name} (copy)`,
            description: t.description ?? undefined,
            investment_amount: 10000,
            items: t.items, // already shaped {instrument_id, ticker, name, weight}
          }
        }
      } else {
        initialData = { name: '', investment_amount: 10000, items: [] }
      }

      // Fetch meta for any seeded instrument ids; on blank create, empty map (rebuilt as user adds rows via combobox onSelect).
      const ids = (initialData?.items ?? []).map(it => it.instrument_id)
      const metaMap = await getInstrumentMetaMap(ids)
      const instrumentsMeta = Object.fromEntries(metaMap.entries())

      return (
        <div className="max-w-3xl mx-auto py-8">
          <PortfolioBuilderClient mode="create" initialData={initialData} instrumentsMeta={instrumentsMeta} />
        </div>
      )
    }
    ```

    Create `src/app/dashboard/portfolios/[id]/edit/page.tsx`:

    ```tsx
    import { notFound } from 'next/navigation'
    import { getPortfolioForEdit, getInstrumentMetaMap } from '../../_queries'
    import { PortfolioBuilderClient } from '../../_client/PortfolioBuilderClient'

    type Props = { params: Promise<{ id: string }> }

    export default async function EditPortfolioPage({ params }: Props) {
      const { id } = await params
      const portfolio = await getPortfolioForEdit(id)
      if (!portfolio) notFound()
      const metaMap = await getInstrumentMetaMap(portfolio.items.map(it => it.instrument_id))
      const instrumentsMeta = Object.fromEntries(metaMap.entries())
      return (
        <div className="max-w-3xl mx-auto py-8">
          <PortfolioBuilderClient mode="edit" initialData={portfolio} instrumentsMeta={instrumentsMeta} />
        </div>
      )
    }
    ```

    Run `npx tsc --noEmit` and `npm run build` to confirm.

    Per AGENTS.md, double-check `params` and `searchParams` are awaited (Next.js 16). Verify against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` if available.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -10 && grep -q "await params" src/app/dashboard/portfolios/\[id\]/edit/page.tsx && grep -q "await searchParams" src/app/dashboard/portfolios/new/page.tsx && grep -q "listPortfolios" src/app/dashboard/portfolios/page.tsx && grep -q "getPortfolioForEdit" src/app/dashboard/portfolios/\[id\]/edit/page.tsx</automated>
  </verify>
  <done>3 page Server Components exist, await params/searchParams, fetch via _queries, render Client wrappers; tsc clean; no _queries imports leak into client components.</done>
</task>

<task type="auto">
  <name>Task 2: Client wrappers — PortfoliosListClient, NewPortfolioMenu, PortfolioBuilderClient, DeletePortfolioButton, TemplatePickerDialog</name>
  <files>src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx, src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx, src/app/dashboard/portfolios/_client/PortfolioBuilderClient.tsx, src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx, src/app/dashboard/portfolios/_client/TemplatePickerDialog.tsx</files>
  <action>
    PortfoliosListClient.tsx ('use client'):
    - Props: `{ portfolios: PortfolioListRow[] }`
    - Empty state (portfolios.length === 0): centered message "No portfolios yet — start with a template, blank, or CSV import." Do NOT render a CTA inside this client (the page-level NewPortfolioMenu lives in the header). Empty state DOES however render a small inline-link "Create your first portfolio" pointing to `/dashboard/portfolios/new` for clarity.
    - Non-empty state: list of borderless rows. Each row is a `<Link href={`/dashboard/portfolios/${p.id}/edit`}>` wrapping a 5-column grid: name, instrument count, weighted TER (% with 2dp; "—" if null), weighted yield, last-updated relative timestamp ("3 days ago" via `Intl.RelativeTimeFormat` or a small helper).
    - Each row has a `<DeletePortfolioButton id={p.id} name={p.name} />` aligned right. The button MUST `e.stopPropagation()` to prevent the parent Link from navigating.
    - Visual: borderless, whitespace-separated (matches Phase 2). No shadows, no card outlines. A thin `border-t` separator between rows is acceptable.
    - Use `Intl.NumberFormat('de-CH', { style: 'percent', maximumFractionDigits: 2 })` for ter/yield display (returns "0.18%").

    NewPortfolioMenu.tsx ('use client'):
    - Props: `{ templates: ReturnType<typeof listTemplates extends () => Promise<infer R> ? R : never> }` — actually, easier: define a local Type alias TemplateRow.
    - Renders shadcn DropdownMenu with trigger = Swiss-red Button "+ New portfolio".
    - Menu items:
      1. "Blank" → `router.push('/dashboard/portfolios/new')`
      2. "From template" → opens TemplatePickerDialog (controls open state via useState)
      3. "Import CSV" → `disabled` (until Plan 06 wires it). Show subtitle "(coming soon)". Per CONTEXT, this menu has all three options visible.
    - Renders TemplatePickerDialog inline as a sibling: `<TemplatePickerDialog open={open} onOpenChange={setOpen} templates={templates} />`.

    TemplatePickerDialog.tsx ('use client'):
    - Props: `{ open: boolean; onOpenChange: (b: boolean) => void; templates: TemplateRow[] }`
    - Shadcn `<Dialog open onOpenChange>` with `<DialogContent>` size large.
    - Header: "Choose a template"
    - Body: grid of 3 cards (or borderless rows — match Swiss-minimalist). Each shows: template name (large), short description, composition preview (`60% VT · 40% AGG`).
    - On row/card click: `onOpenChange(false)`, then `router.push(`/dashboard/portfolios/new?seed=${template.id}`)`.
    - If templates array is empty (DB seed missing), render "No templates available" message — do not crash.

    PortfolioBuilderClient.tsx ('use client'):
    - Props: `{ mode: 'create'|'edit'; initialData?: PortfolioInput; instrumentsMeta: Record<string, ...> }`
    - State: `[saving, startTransition] = useTransition()`, `[errorMessage, setErrorMessage] = useState<string | null>(null)`
    - onSubmit handler:
      ```ts
      const handleSubmit = async (data: PortfolioInput) => {
        const fd = new FormData()
        fd.append('payload', JSON.stringify(data))
        startTransition(async () => {
          const r = await savePortfolio(null, fd)
          if (r.ok) {
            toast.success(mode === 'create' ? 'Portfolio created' : 'Portfolio saved')
            router.push('/dashboard/portfolios')
          } else {
            setErrorMessage(r.error)
            toast.error(r.error)
          }
        })
      }
      ```
    - Renders `<PortfolioBuilder mode={mode} initialData={initialData} instrumentsMeta={instrumentsMeta} onSubmit={handleSubmit} saving={saving} errorMessage={errorMessage} />`
    - PortfolioBuilder (per Plan 04) already maintains its own `mergedMeta` state seeded from `instrumentsMeta` and extends it on every combobox `onSelect` (the onSelect payload includes `expense_ratio` + `dividend_yield`, sourced from `/api/instruments/resolve`'''s `{ id, meta }` response shape — also locked in Plan 04). PortfolioBuilderClient does NOT need to patch the meta or thread an `onAddInstrument` callback — the builder owns that lifecycle. This plan ONLY consumes the contracts Plan 04 exposes; no Plan 04 files are mutated here.

    DeletePortfolioButton.tsx ('use client'):
    - Props: `{ id: string; name: string }`
    - Renders icon Button (Trash2 from lucide-react, ghost, aria-label='Delete portfolio') wrapped in `<AlertDialog>`.
    - AlertDialog content: title "Delete '{name}'?", description "This cannot be undone. All instruments and weights will be removed.", Cancel + Delete (destructive Swiss-red) buttons.
    - Delete onClick handler:
      ```ts
      const handleDelete = () => {
        const fd = new FormData(); fd.append('id', id)
        startTransition(async () => {
          const r = await deletePortfolio(fd)
          if (r.ok) { toast.success('Portfolio deleted'); router.refresh() }
          else toast.error(r.error)
        })
      }
      ```
    - Uses useTransition for the pending spinner inside the destructive button.
    - The button MUST `e.stopPropagation()` on its outer click handler so it doesn't trigger row navigation when nested inside `<Link>` from PortfoliosListClient.

    Run `npx tsc --noEmit` and `npm run build`.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -15 && npm run build 2>&1 | tail -15 && grep -q "'use client'" src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx && grep -q "'use client'" src/app/dashboard/portfolios/_client/PortfolioBuilderClient.tsx && grep -q "savePortfolio" src/app/dashboard/portfolios/_client/PortfolioBuilderClient.tsx && grep -q "deletePortfolio" src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx && grep -q "AlertDialog" src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx && grep -q "seed=" src/app/dashboard/portfolios/_client/TemplatePickerDialog.tsx</automated>
  </verify>
  <done>5 client wrappers exist; full Next.js build passes; routes are reachable (npm run build emits no errors for the new pages).</done>
</task>

<task type="auto">
  <name>Task 3: Convert Wave 0 Playwright stubs to real integration tests (PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, META-01)</name>
  <files>tests/integration/portfolio-create.spec.ts, tests/integration/portfolio-edit.spec.ts, tests/integration/portfolio-delete.spec.ts, tests/integration/portfolio-list.spec.ts, tests/integration/instrument-search.spec.ts, tests/integration/portfolio-template.spec.ts</files>
  <action>
    Convert each Wave 0 stub spec file (`test.skip`) into real `test()` calls using Playwright + the test helper from Plan 03.

    Common harness (per spec): a `test.beforeAll` creates a test user via `createTestUser()`. `test.afterAll` cleans up. Each test logs in via `loginTestUser(page, {email, password})`.

    Use `page.goto('/dashboard/portfolios')`, `page.getByRole(...)`, etc. PER SPEC, write 3-5 real tests covering the listed scenarios. Examples:

    portfolio-create.spec.ts:
    1. test('user can create a portfolio with name + 2 instruments + sum=100'):
       - Login. Click "+ New portfolio" → "Blank". URL is /new.
       - Fill name "My Portfolio". Investment amount default 10000.
       - Open combobox, type "VT", wait for results, expand the VT group, click first listing.
       - Open combobox again, type "AGG", click first listing.
       - Set weight 60 on row 1, 40 on row 2. Verify TotalBadge shows 100.
       - Verify Save button is enabled.
       - Click Save. Assert URL becomes /dashboard/portfolios. Assert sonner toast "Portfolio created".
       - Assert the new portfolio appears in the list with the expected name and instrument count = 2.
       - Cleanup the portfolio at end (use cleanupTestPortfolio with the fetched id).
    2. test('Save disabled when sum != 100'): verify button has `disabled` attribute when sum is 60+39=99.
    3. test('Normalize-to-100 rescales weights'): set 50,50,50 → click Normalize → verify rows show 33.33, 33.33, 33.34.
    4. test('investment amount displays formatted CHF'): assert helper text contains apostrophe formatting like "CHF 10'000".
    5. test('META-01: instrument metadata renders in row'): after adding VT, assert row text contains "VT" and the instrument name from DB (e.g., contains "Vanguard").

    portfolio-edit.spec.ts:
    1. test('user can edit name and weight'): seed a portfolio via createTestPortfolio with 2 items 60/40. Login, navigate to /dashboard/portfolios/<id>/edit. Change name. Change weight 60→70 and 40→30. Save. Assert toast + redirect. Re-open edit page; assert new values persisted.
    2. test('user can add a row'): edit existing 1-row portfolio (100% in VT); add AGG via combobox; rebalance to 50/50; Save. Assert 2 rows after reopen.
    3. test('user can remove a row'): edit 2-row portfolio; click remove on row 2; sum becomes 60; Save disabled. Add a new row to bring sum to 100; Save succeeds.

    portfolio-delete.spec.ts:
    1. test('Delete confirms via AlertDialog'): seed portfolio. Click delete icon. Assert dialog appears with name in title. Click Cancel; portfolio still exists.
    2. test('Confirm delete removes the row'): seed portfolio. Click delete → Confirm. Assert toast + portfolio not in list. Verify FK cascade by querying portfolio_instruments via service client; expect 0 rows.

    portfolio-list.spec.ts:
    1. test('Empty state shows centered message and inline create link'): user with no portfolios sees the centered text + link.
    2. test('Non-empty list shows borderless rows with metrics'): seed 2 portfolios; assert both names and instrument counts visible.
    3. test('Templates are NOT shown in user list'): seed user portfolio; assert templates ("Classic 60/40", "All-World", "All-Weather") are NOT in the list (test passes if list count = user portfolios count, not + 3).
    4. test('Click row navigates to edit'): seed portfolio; click row; URL becomes /dashboard/portfolios/<id>/edit.

    instrument-search.spec.ts:
    1. test('Combobox searches by ticker'): on /new, open combobox, type "VT". Assert results dropdown contains "VT".
    2. test('Combobox searches by ISIN'): type "US9229087690" (VT ISIN — verify with public source). Assert at least one result; assert displayed text falls back to "ticker (exchange)" when name is empty (ISIN cache hit).
    3. test('Multi-venue grouping'): type "VWCE" or another ticker known to have multiple listings. Assert >1 listing under the same group; expand group; click a specific listing; verify the row displays the chosen exchange suffix (e.g., .SW vs .DE).
    4. test.skip('rate_limit toast'): document but skip — would require mocking the search endpoint to return 429; defer.
    5. test('not_found inline'): type "ZZZZNOTHING" (invalid ticker); assert the popover shows "No matches" or empty state.

    portfolio-template.spec.ts:
    1. test('From template dialog lists 3 templates'): click "+ New portfolio" → "From template". Dialog shows Classic 60/40, All-World, All-Weather (Ray Dalio).
    2. test('Selecting a template pre-fills builder with [name] (copy)'): click "Classic 60/40". URL is /new?seed=<id>. Builder shows name "Classic 60/40 (copy)", investment_amount 10000, 2 rows summing 100.
    3. test('Template-seeded save persists as user portfolio'): on the pre-filled page, click Save without changes. Assert redirect + portfolio in list. Assert via service client the new portfolio has user_id = test user (NOT NULL) and is_template = false.

    Each spec must run the dev server (Playwright `webServer` config likely already in playwright.config.ts from Phase 1; verify). If `playwright.config.ts` does NOT auto-start the dev server, add `webServer: { command: 'npm run dev', port: 3000, reuseExistingServer: true }`.

    All tests use the helper to clean up created users/portfolios after each suite.

    **Smoke tagging for fast per-task feedback (closes checker warning #4):** Tag exactly ONE representative test per spec with `@smoke` in its title. Recommended choices:
    - portfolio-create.spec.ts → tag `'''user can create a portfolio with name + 2 instruments + sum=100''' @smoke`
    - portfolio-edit.spec.ts → tag `'''user can edit name and weight''' @smoke`
    - portfolio-delete.spec.ts → tag `'''Confirm delete removes the row''' @smoke`
    - portfolio-list.spec.ts → tag `'''Non-empty list shows borderless rows with metrics''' @smoke`
    - instrument-search.spec.ts → tag `'''Combobox searches by ticker''' @smoke`
    - portfolio-template.spec.ts → tag `'''Selecting a template pre-fills builder with [name] (copy)''' @smoke`

    The `<automated>` verify uses `--grep @smoke` so per-task feedback completes in well under the 30s feedback target. The full suite is run as a pre-checkpoint sanity command in Task 4.

    Manual checkpoint follows in Task 4.
  </action>
  <verify>
    <automated>npx playwright test tests/integration/portfolio-create.spec.ts tests/integration/portfolio-edit.spec.ts tests/integration/portfolio-delete.spec.ts tests/integration/portfolio-list.spec.ts tests/integration/instrument-search.spec.ts tests/integration/portfolio-template.spec.ts --grep @smoke --project=chromium 2>&1 | tail -25</automated>
  </verify>
  <done>All 6 integration spec files have real test() calls (no test.skip except documented edge cases like rate-limit). Each spec has exactly one @smoke-tagged test that exercises the happy path. The @smoke run completes inside the per-task feedback budget; the full suite is exercised in Task 4 before the human checkpoint.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Manual UX verification of portfolio CRUD + templates</name>
  <files>(no files modified — manual verification gate)</files>
  <action>Before the human verifies the UX, run the FULL Playwright suite (no `--grep @smoke` filter) as a pre-checkpoint sanity command:

  ```bash
  npx playwright test tests/integration/portfolio-create.spec.ts tests/integration/portfolio-edit.spec.ts tests/integration/portfolio-delete.spec.ts tests/integration/portfolio-list.spec.ts tests/integration/instrument-search.spec.ts tests/integration/portfolio-template.spec.ts --project=chromium
  ```

  Allow up to 5 minutes for the full suite. If anything fails, fix it before pausing for the human. Then pause for human verification — run dev server, exercise the flows enumerated in &lt;how-to-verify&gt; below, then resume on user approval. No code changes are performed by the human verification itself.</action>
  <verify>Human confirms all enumerated UX bullets pass. Resume signal: "approved".</verify>
  <done>User has signaled "approved" (or has reported blocking issues that have been fixed in a follow-up task).</done>
  <what-built>
    - List page with borderless rows, "+ New portfolio" dropdown (Blank / From template / Import CSV [disabled])
    - Builder for create + edit with name + investment amount + sticky weighted-metrics strip + instrument list + inline combobox + Σ TotalBadge + Save/Cancel
    - Delete via AlertDialog confirm
    - Template picker dialog showing 3 templates, pre-fill flow into builder with "[Template] (copy)" name
    - Sonner success/error toasts on save and delete
  </what-built>
  <how-to-verify>
    Start the dev server: `npm run dev` (or use the existing dev session). Sign in as a test user.

    1. Navigate to /dashboard/portfolios. Confirm:
       - If empty: centered message + link "Create your first portfolio"; "+ New portfolio" button is top-right with the dropdown
       - If existing portfolios: borderless rows, each shows name + instrument count + weighted TER % + weighted yield % + last-updated timestamp
       - The visual style matches Phase 2 Swiss-minimalist (no card shadows, whitespace separation)
    2. Click "+ New portfolio" → "Blank". Fill in:
       - Name "Manual Test Portfolio"
       - Investment amount: type 10000; helper text below should display "CHF 10'000" with apostrophe
       - Open combobox, type "VT", expand the VT group, pick a listing. Row appears with weight 0.
       - Open combobox, type "AGG", pick a listing. Row appears.
       - Set weight 60 on VT, 40 on AGG. Σ shows 100 in neutral color.
       - Sticky metrics strip recalculates live as you type weights — Weighted TER ≈ 0.05% (depends on seeded ETF data), Weighted Yield > 0, Annual Income > 0.
       - Click Save. Toast "Portfolio created". Redirected to list.
    3. Click the new portfolio row — opens edit page with all values pre-filled. Change one weight, ensure metrics update live, Save. Toast "Portfolio saved".
    4. Click delete icon on the row. AlertDialog appears with portfolio name. Click Confirm. Toast "Portfolio deleted". Row removed from list.
    5. Click "+ New portfolio" → "From template". Dialog appears with Classic 60/40, All-World, All-Weather.
       - Click "Classic 60/40". Builder opens at /new?seed=<id>. Name shows "Classic 60/40 (copy)". Items pre-filled. Investment 10000.
       - Click Save. Redirected to list. New portfolio appears with name "Classic 60/40 (copy)".
    6. Verify the templates do NOT appear as user portfolios in the list.
    7. (Optional) Resize browser to mobile width — confirm builder reflows to a single column and remains usable.
    8. CHF formatting visual check: open the new portfolio in edit mode; helper text under the amount field renders the Swiss apostrophe glyph (U+2019) cleanly.

    Confirm any visual glitches but do NOT block on pixel-perfect polish (per MEMORY.md "Visual design polish handled by Claude design later").
  </how-to-verify>
  <resume-signal>Type "approved" to continue to Plan 06 (CSV import). Or describe any blocking issues for fix-up.</resume-signal>
</task>

</tasks>

<verification>
- Pages and client wrappers exist; `npm run build` passes
- Playwright integration suite for the 6 specs (portfolio-create/edit/delete/list/template/instrument-search) is green
- Manual smoke confirms the UX matches CONTEXT-locked decisions
- Templates appear in the picker but not in the user portfolio list
</verification>

<success_criteria>
1. List page renders user portfolios as borderless rows; templates excluded from list
2. New (blank) page renders empty builder with default CHF 10'000
3. New (?seed=<templateId>) page renders builder pre-filled with template's items + name "[Template] (copy)" + 10000 amount, NO save until user saves
4. Edit page renders pre-filled builder for the requested portfolio id
5. Save flow uses savePortfolio Server Action; sonner toast on success/failure; redirect to list on success
6. Delete flow uses AlertDialog confirm + deletePortfolio Server Action; row disappears post-confirm
7. Template picker dialog lists 3 templates with name + description + composition preview
8. All 6 integration spec files green
9. Manual checkpoint approved
</success_criteria>

<output>
After completion, create .planning/phases/04-portfolio-builder/04-05-SUMMARY.md with:
- All routes verified working (list, new, new?seed=, [id]/edit)
- Manual checkpoint outcome (approved / issues fixed)
- Playwright suite runtime + pass count
- Any deviations from CONTEXT (e.g., if "Import CSV" item ended up hidden vs disabled — should be disabled per CONTEXT)
</output>
