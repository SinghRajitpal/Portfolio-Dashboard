---
phase: 04-portfolio-builder
plan: 06
type: execute
wave: 5
depends_on: ["04-05"]
files_modified:
  - src/app/dashboard/portfolios/new/page.tsx
  - src/app/dashboard/portfolios/_client/CsvImportDialog.tsx
  - src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx
  - src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx
  - src/app/api/instruments/csv-resolve/route.ts
  - tests/integration/portfolio-csv-import.spec.ts
autonomous: false

requirements: [PORT-08]

must_haves:
  truths:
    - "'+ New portfolio' → 'Import CSV' opens a file picker dialog"
    - "Uploading a well-formed CSV (ticker, weight [, exchange]) routes the user to a preview screen with the same builder UI in 'preview' mode"
    - "Preview screen shows matched instruments + flagged unresolved tickers with inline 'Replace via search' affordance"
    - "Investment amount defaults to CHF 10'000 in preview, editable before save"
    - "Save validation identical to manual save: all instruments resolved + sum = 100"
    - "Save creates a new user portfolio (NOT a template, user_id = current user)"
    - "Malformed CSV (missing columns, non-numeric weight) surfaces row-level errors in the dialog without crashing"
    - "Multi-venue ambiguous tickers (CSV has 'VWCE' with no exchange) flagged as ambiguous; user must pick a specific listing before save can proceed"
    - "Wave 0 portfolio-csv-import.spec.ts converted from skip to passing tests"
  artifacts:
    - path: "src/app/dashboard/portfolios/_client/CsvImportDialog.tsx"
      provides: "Dialog with file picker → calls parsePortfolioCsv → routes to preview screen with parsed rows"
      exports: ["CsvImportDialog"]
    - path: "src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx"
      provides: "Wraps PortfolioBuilder in 'preview' mode, hydrating with CSV-resolved instruments"
      exports: ["CsvPreviewClient"]
    - path: "src/app/api/instruments/csv-resolve/route.ts"
      provides: "Batch resolve endpoint: POST array of {ticker, exchange?} → array of resolution outcomes (matched | ambiguous | unresolved)"
    - path: "src/app/dashboard/portfolios/new/page.tsx"
      provides: "Updated to detect ?from=csv mode and render CsvPreviewClient (state-passed via sessionStorage or URL-encoded data)"
  key_links:
    - from: "src/app/dashboard/portfolios/_client/CsvImportDialog.tsx"
      to: "parsePortfolioCsv (Plan 02)"
      via: "Client-side parse on file upload"
      pattern: "parsePortfolioCsv\\("
    - from: "src/app/dashboard/portfolios/_client/CsvImportDialog.tsx"
      to: "/api/instruments/csv-resolve"
      via: "Batch resolve POST after parse"
      pattern: "/api/instruments/csv-resolve"
    - from: "src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx"
      to: "PortfolioBuilder (Plan 04)"
      via: "mode='preview' with initialData populated from resolved CSV rows"
      pattern: "mode=\"preview\""
---

<objective>
Final Phase 4 plan: implement CSV import (PORT-08). Reuses PortfolioBuilder in 'preview' mode so the visual + validation surface is identical to the manual create flow. Resolves multi-venue ambiguity per CONTEXT-locked decision: no auto-pick.

Purpose: Closes the last unmet requirement of Phase 4. Honors the CONTEXT decision that the preview screen IS the builder UI in a "needs review" state — minimizes net-new components.
Output: 1 new client dialog + 1 new client preview wrapper + 1 batch-resolve API endpoint + converted integration test.
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-portfolio-builder/04-CONTEXT.md
@.planning/phases/04-portfolio-builder/04-RESEARCH.md
@.planning/phases/04-portfolio-builder/04-05-pages-and-templates-PLAN.md
@CLAUDE.md
@AGENTS.md
@src/lib/portfolio/parse-csv.ts
@src/components/portfolio/PortfolioBuilder.tsx
@src/components/ui/dialog.tsx

<interfaces>
From Plan 02 (already implemented):
```typescript
export type CsvRow = { ticker: string; weight: number; exchange?: string }
export async function parsePortfolioCsv(file: File): Promise<{ rows: CsvRow[]; errors: string[] }>
```

From Plan 04 (already implemented):
```typescript
export type PortfolioBuilderMode = 'create' | 'edit' | 'preview'
export function PortfolioBuilder(props: PortfolioBuilderProps): JSX.Element
// preview mode: same UI as create; submitLabel default 'Save imported portfolio'
```

From Plan 03 (already implemented):
```typescript
export async function getInstrumentByTicker(ticker: string, exchange?: string): Promise<...>
export async function savePortfolio(prev, formData): Promise<...>
```
</interfaces>

<contracts_to_export>
```typescript
// /api/instruments/csv-resolve route
// POST { rows: { ticker: string; exchange?: string; weight: number }[] }
// Response: {
//   resolved: { ticker: string; weight: number; matches: SearchResult[]; status: 'matched' | 'ambiguous' | 'unresolved' }[]
// }
// - 'matched': exactly 1 match (auto-fills instrument_id)
// - 'ambiguous': >1 match (user must pick)
// - 'unresolved': 0 matches (user must search/replace)

// CsvImportDialog
export type CsvImportDialogProps = { open: boolean; onOpenChange: (b: boolean) => void }

// CsvPreviewClient
export type CsvPreviewClientProps = {
  initialItems: { instrument_id: string | null; ticker: string; name: string; weight: number; status: 'matched'|'ambiguous'|'unresolved'; alternatives?: SearchResult[] }[]
  initialAmount?: number
  errors?: string[]
}
```
</contracts_to_export>

<critical_constraints>
- Per RESEARCH "Pitfall 4": NEVER auto-pick a venue when CSV row is ambiguous. The preview screen MUST surface ambiguity.
- Save validation: same Zod PortfolioSchema as manual save — sum = 100 ± 0.01, all items have valid instrument_id, etc. Items with `instrument_id === null` (unresolved) MUST block save.
- PortfolioBuilder reused as-is: passes `initialData` with the resolved items. For ambiguous/unresolved rows, the builder needs a UI hint that says "needs picking" — extend PortfolioBuilder ONLY if absolutely needed; prefer to keep extension out by surfacing ambiguity in CsvPreviewClient OUTSIDE the builder (e.g., a banner "2 rows need attention" + visual highlight).

  DECISION: keep PortfolioBuilder unchanged. The ambiguity / unresolved rows are filtered OUT of the items array passed to the builder. They are rendered separately by CsvPreviewClient as an "Unresolved imports" banner + per-row search affordance. When the user resolves a row (picks a listing or searches), it gets appended to the builder via the same mechanism the combobox uses internally — but to avoid re-implementing that, the CsvPreviewClient calls `/api/instruments/resolve` (Plan 04 endpoint) on user pick and then injects the resulting item into the builder's form via a controlled prop or external mutation. Simplest: CsvPreviewClient owns local React state for the "needs-review" rows + the "ready" rows, and recombines them into a single `initialData.items` for PortfolioBuilder ONLY after all are resolved. While reviewing, the builder is hidden behind a "X rows need review" banner; once all resolved, the banner disappears and the full builder appears.

- State transfer between dialog → preview screen: use sessionStorage with a key like `portfolioforge:csv-import:<uuid>`. Why sessionStorage: URL params are too small for CSV data + multi-listing alternatives. After the preview page mounts, it reads + clears the key.
- API endpoint /api/instruments/csv-resolve: server-only batch resolve. Iterates rows, calls `getInstrumentByTicker(ticker, exchange?)`. If exchange omitted, calls without exchange filter (returns first match) AND additionally calls a separate query to find ALL matches for that ticker — if > 1 result, marks 'ambiguous' and returns the alternatives.
- Auth: /api/instruments/csv-resolve must be auth-protected (proxy.ts already covers /api/* except /api/cron).
- UPDATE NewPortfolioMenu.tsx: enable the previously-disabled "Import CSV" item to open `<CsvImportDialog>`.
- Per RESEARCH "Pitfall 4": multi-venue example explicitly mentioned (VWCE on .SW, .DE, .MI). Build a test for this.
</critical_constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: /api/instruments/csv-resolve batch endpoint</name>
  <files>src/app/api/instruments/csv-resolve/route.ts</files>
  <action>
    Create `src/app/api/instruments/csv-resolve/route.ts`:

    POST body schema (Zod):
    ```ts
    const Row = z.object({
      ticker: z.string().trim().min(1).max(40),
      exchange: z.string().trim().max(20).optional(),
      weight: z.number().min(0).max(100),
    })
    const RequestSchema = z.object({ rows: z.array(Row).min(1).max(100) })
    ```

    For each row:
    1. Query: `sb.from('instruments').select('id, ticker, name, exchange, currency, expense_ratio, dividend_yield, isin, type').eq('ticker', row.ticker)`. If exchange specified, also `.eq('exchange', row.exchange)`.
    2. If 0 results AND exchange was specified → status 'unresolved' (do NOT fall back to no-exchange query — user explicitly asked for that exchange).
    3. If 0 results AND exchange was NOT specified → status 'unresolved'.
    4. If 1 result → status 'matched', resolved row carries the matched instrument's metadata.
    5. If >1 result (only possible when exchange not specified, since (ticker, exchange) is effectively unique) → status 'ambiguous', return all matches as `alternatives` so the preview UI can show a per-row picker.

    Response shape:
    ```ts
    type Resolution =
      | { ticker: string; weight: number; status: 'matched'; instrument: { id; ticker; name; exchange; currency; expense_ratio; dividend_yield; isin; type } }
      | { ticker: string; weight: number; status: 'ambiguous'; alternatives: { id; ticker; name; exchange; currency; expense_ratio; dividend_yield; isin; type }[] }
      | { ticker: string; weight: number; status: 'unresolved' }
    type Response = { resolved: Resolution[]; parseErrors?: string[] }
    ```

    Auth: `await createClient()` enforces user via cookies; if no user → 401 with DataError shape.

    Sub-step: extend the existing /api/instruments/resolve (Plan 04) ONLY if needed for "user picks alternative from ambiguous list" — actually NOT needed, because if a row is ambiguous, the alternatives already include `id`. The user simply selects one of the alternatives client-side and we use its id directly. So this plan adds NO changes to /api/instruments/resolve.

    Run tsc clean.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -10 && test -f src/app/api/instruments/csv-resolve/route.ts && grep -q "ambiguous" src/app/api/instruments/csv-resolve/route.ts && grep -q "unresolved" src/app/api/instruments/csv-resolve/route.ts && grep -q "matched" src/app/api/instruments/csv-resolve/route.ts</automated>
  </verify>
  <done>Route exists; classifies rows into matched/ambiguous/unresolved; returns alternatives for ambiguous; auth-gated; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: CsvImportDialog + CsvPreviewClient + NewPortfolioMenu wire-up</name>
  <files>src/app/dashboard/portfolios/_client/CsvImportDialog.tsx, src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx, src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx, src/app/dashboard/portfolios/new/page.tsx</files>
  <action>
    CsvImportDialog.tsx ('use client'):
    - Renders `<Dialog>` with Title "Import portfolio from CSV"
    - Body sections:
      1. Format hint: "CSV requires header row with `ticker, weight` columns. Optional `exchange` column for explicit listing."
      2. File `<Input type="file" accept=".csv,text/csv">`
      3. Optional textarea showing parse errors after file selection
      4. "Continue" button (disabled until at least one valid row)
    - On file selection:
      ```ts
      const { rows, errors } = await parsePortfolioCsv(file)
      setErrors(errors); setRows(rows)
      ```
    - On Continue:
      ```ts
      const r = await fetch('/api/instruments/csv-resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const { resolved, parseErrors } = await r.json()
      // Persist resolved + parseErrors via sessionStorage with a UUID key
      const key = crypto.randomUUID()
      sessionStorage.setItem(`portfolioforge:csv-import:${key}`, JSON.stringify({ resolved, parseErrors }))
      router.push(`/dashboard/portfolios/new?from=csv&key=${key}`)
      ```
    - On Dialog close: clear local state.

    CsvPreviewClient.tsx ('use client'):
    - Props: `{ csvKey: string }`
    - On mount: read `sessionStorage[`portfolioforge:csv-import:${csvKey}`]`, parse JSON, clear the key.
    - Local state: `resolutions` (the array from the API), `instrumentsMeta` (computed from resolved.matched + ambiguous-picked entries).
    - Render:
      1. If unresolved or ambiguous rows exist → top banner: "{N} rows need attention". List each:
         - Ambiguous row: ticker + weight + a small inline `<Select>` of alternatives showing "{exchange} ({currency})". Picking an alternative converts the row to matched (mutate state).
         - Unresolved row: ticker + weight + a small inline `<InstrumentCombobox>` (reused from Plan 04) — once user picks a search result, call /api/instruments/resolve and convert to matched.
      2. Once ALL rows are matched → render `<PortfolioBuilder mode="preview" initialData={...} instrumentsMeta={...} onSubmit={...} submitLabel="Save imported portfolio" />`.
      3. Save handler (passed to onSubmit): same as PortfolioBuilderClient — calls savePortfolio Server Action; on success router.push('/dashboard/portfolios') + toast.
    - Provide a small "Cancel import" button that returns to /dashboard/portfolios without saving.
    - Warning text near top: "Investment amount defaults to CHF 10'000 — change before saving."

    NewPortfolioMenu.tsx (UPDATE existing):
    - Change "Import CSV" item from disabled to active.
    - On select: open `<CsvImportDialog>` (state-controlled, same pattern as TemplatePickerDialog).
    - Render `<CsvImportDialog>` inline as a sibling (controlled by useState).

    new/page.tsx (UPDATE existing Server Component):
    - Add a third branch: if `searchParams.from === 'csv' && searchParams.key`, render `<CsvPreviewClient csvKey={searchParams.key} />` inside the same `max-w-3xl` container.
    - Else if `searchParams.seed` → existing template-seed branch (unchanged).
    - Else → existing blank-create branch (unchanged).
    - Update Props type: `{ searchParams: Promise<{ seed?: string; from?: string; key?: string }> }`.

    Run tsc + build.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tail -15 && npm run build 2>&1 | tail -15 && grep -q "parsePortfolioCsv" src/app/dashboard/portfolios/_client/CsvImportDialog.tsx && grep -q "/api/instruments/csv-resolve" src/app/dashboard/portfolios/_client/CsvImportDialog.tsx && grep -q "mode=\"preview\"" src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx && grep -q "from === 'csv'" src/app/dashboard/portfolios/new/page.tsx</automated>
  </verify>
  <done>Dialog opens from menu; on file upload + continue, navigates to /new?from=csv&key=...; preview screen renders with resolution UI for ambiguous/unresolved; save calls savePortfolio; build passes.</done>
</task>

<task type="auto">
  <name>Task 3: Convert portfolio-csv-import.spec.ts from stub to real Playwright tests</name>
  <files>tests/integration/portfolio-csv-import.spec.ts, tests/fixtures/portfolio-imports/well-formed.csv, tests/fixtures/portfolio-imports/with-exchange.csv, tests/fixtures/portfolio-imports/ambiguous-no-exchange.csv, tests/fixtures/portfolio-imports/malformed.csv</files>
  <action>
    Create CSV fixture files under tests/fixtures/portfolio-imports/:

    well-formed.csv:
    ```
    ticker,weight
    VT,60
    AGG,40
    ```

    with-exchange.csv:
    ```
    ticker,weight,exchange
    VT,50,US
    AGG,50,US
    ```

    ambiguous-no-exchange.csv:
    ```
    ticker,weight
    TESTAMB,100
    ```

    Note: the real `instruments` table has `UNIQUE(ticker)` per `supabase/migrations/00001_initial_schema.sql:36`, so seeding two rows with the same ticker on different exchanges to create ambiguity is impossible without a schema change. Instead, the ambiguous-CSV test uses Playwright network interception (`page.route`) to mock the `/api/instruments/csv-resolve` response for the TESTAMB ticker — keeping the test isolated from DB schema and avoiding any production migration churn.


    malformed.csv:
    ```
    ticker,weight
    VT,sixty
    ,40
    ```

    Convert tests/integration/portfolio-csv-import.spec.ts:
    1. test('Well-formed CSV → preview → save'):
       - Login. Click "+ New portfolio" → "Import CSV". Dialog opens.
       - `await page.setInputFiles('input[type=file]', 'tests/fixtures/portfolio-imports/well-formed.csv')`
       - Click Continue. Wait for navigation to /new?from=csv&key=<uuid>.
       - Assert builder renders with VT and AGG rows, weights 60 and 40.
       - Investment amount defaults to "CHF 10'000".
       - Σ shows 100.
       - Click Save. Assert toast + redirect to /dashboard/portfolios. Assert new portfolio in list.
    2. test('CSV with explicit exchange'):
       - Upload with-exchange.csv. Assert that the resolved rows show the US listings (not picked from another venue).
    3. test('Ambiguous CSV requires user pick'):
       - Setup: use Playwright `page.route('**/api/instruments/csv-resolve', ...)` to intercept the resolve POST. The mock returns a synthetic ambiguous response for the TESTAMB ticker:
         ```ts
         await page.route('**/api/instruments/csv-resolve', async route => {
           const body = JSON.parse(route.request().postData() ?? '{}')
           if (body.rows?.some((r: any) => r.ticker === 'TESTAMB')) {
             await route.fulfill({
               status: 200,
               contentType: 'application/json',
               body: JSON.stringify({
                 resolved: [{
                   ticker: 'TESTAMB',
                   weight: 100,
                   status: 'ambiguous',
                   alternatives: [
                     { id: '11111111-1111-1111-1111-111111111111', ticker: 'TESTAMB', name: 'Test Ambiguous (US)', exchange: 'US', currency: 'USD', expense_ratio: 0.001, dividend_yield: 0.02, isin: null, type: 'etf' },
                     { id: '22222222-2222-2222-2222-222222222222', ticker: 'TESTAMB', name: 'Test Ambiguous (XETRA)', exchange: 'XETRA', currency: 'EUR', expense_ratio: 0.001, dividend_yield: 0.02, isin: null, type: 'etf' },
                   ],
                 }],
               }),
             })
             return
           }
           await route.continue()
         })
         ```
       - The mocked alternatives use stable fake UUIDs; this lets the test assert the picked alternative without polluting the DB or fighting `UNIQUE(ticker)`.
       - Upload ambiguous-no-exchange.csv. Continue → preview shows banner "1 row needs attention".
       - The TESTAMB row has a Select with both alternatives ("US" and "XETRA").
       - Save button is disabled.
       - Click the "US" alternative; banner disappears; builder renders the row.
       - When the user clicks Save, savePortfolio will fail because the synthetic instrument_id does not exist in the DB. EITHER (a) intercept the failing save and assert the user-flow up to "Save attempted with picked alternative" without persisting, OR (b) before clicking Save, swap the picked id for a real instrument_id (e.g., VT'''s id fetched via service client) by re-rendering with that selection. Approach (a) is simpler and matches the test'''s purpose (verifying the ambiguity UI, not end-to-end persistence).
       - No DB rows are created or deleted by this test.
    4. test('Malformed CSV surfaces row errors'):
       - Upload malformed.csv. Dialog shows parse errors (non-numeric weight, missing ticker). Continue is disabled OR Continue routes to preview with the bad rows in the unresolved list. Assert the error UI is visible.
    5. test('Unresolved ticker gets search-replace affordance'):
       - Upload CSV with ticker 'NOTREAL,100'. Preview shows 1 unresolved row with an InstrumentCombobox. Type a real ticker into the combobox, pick a result. Banner disappears. Save succeeds.

    Run: `npx playwright test tests/integration/portfolio-csv-import.spec.ts --project=chromium`.

    All tests must clean up created portfolios/instruments/users via the helper.
  </action>
  <verify>
    <automated>npx playwright test tests/integration/portfolio-csv-import.spec.ts --project=chromium 2>&1 | tail -25</automated>
  </verify>
  <done>Integration spec converted from skip → real tests; all pass; CSV fixtures committed.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Manual UX verification of CSV import flow</name>
  <files>(no files modified — manual verification gate)</files>
  <action>Pause for human verification. Run dev server, exercise the CSV import flows enumerated in &lt;how-to-verify&gt; below, then resume on user approval. No code changes performed in this task.</action>
  <verify>Human confirms all CSV import flow bullets pass. Resume signal: "approved".</verify>
  <done>User has signaled "approved" (or has reported blocking issues that have been fixed in a follow-up task).</done>
  <what-built>
    - "+ New portfolio" → "Import CSV" opens a dialog with file picker
    - Well-formed CSV → preview screen with builder pre-filled, save flows to a new user portfolio
    - Ambiguous tickers (no exchange) trigger an in-preview picker with all venue alternatives
    - Unresolved tickers get an inline combobox to replace via search
    - Malformed CSV surfaces row-level errors
  </what-built>
  <how-to-verify>
    With dev server running and signed in as a test user:

    1. Click "+ New portfolio" → "Import CSV". Confirm dialog appears with format hint.
    2. Upload `tests/fixtures/portfolio-imports/well-formed.csv`. Confirm:
       - Click Continue → navigates to /new?from=csv&key=...
       - Builder shows 2 rows (VT 60%, AGG 40%); Σ = 100
       - Helper text under amount shows "CHF 10'000"
       - Save → toast + list contains new portfolio
    3. Repeat with `with-exchange.csv`. Confirm both rows resolve to US listings without ambiguity prompt.
    4. Hand-craft a CSV with an unresolved ticker (`ZZNOT,100`), upload. Confirm:
       - Preview shows banner "1 row needs attention"
       - The ZZNOT row has an inline combobox; type a real ticker, pick a listing
       - Banner clears; builder appears; Save works
    5. Hand-craft a malformed CSV (`ticker,weight\nVT,sixty`), upload. Confirm:
       - Dialog shows parse error rows (or preview surfaces them)
       - Save is blocked while errors exist
    6. Resize to mobile width — confirm preview screen + dialog are usable.

    Defer pixel-level visual polish per MEMORY.md.
  </how-to-verify>
  <resume-signal>Type "approved" to mark Phase 4 implementation complete. Or describe blocking issues for fix-up.</resume-signal>
</task>

</tasks>

<verification>
- Test strategy: the ambiguous-CSV test uses Playwright `page.route()` interception to mock `/api/instruments/csv-resolve` rather than seeding two synthetic rows in the `instruments` table. This avoids fighting the `UNIQUE(ticker)` constraint in `supabase/migrations/00001_initial_schema.sql:36` and keeps the test free of DB cleanup. All other tests (well-formed, with-exchange, malformed, unresolved) hit the real route against the seeded DB.
- /api/instruments/csv-resolve returns matched/ambiguous/unresolved classifications correctly
- CsvImportDialog parses + resolves + routes to preview
- CsvPreviewClient resolves ambiguous + unresolved rows in-place; builder appears once all resolved
- portfolio-csv-import.spec.ts integration tests all green
- Manual smoke verifies CONTEXT-locked decisions (no auto-pick, preview = builder in needs-review state, default 10000)
</verification>

<success_criteria>
1. Import CSV menu item is enabled and opens CsvImportDialog
2. Well-formed CSV → preview → save creates a user portfolio
3. Ambiguous CSV → user must pick a venue (no auto-pick)
4. Unresolved ticker → inline search/replace
5. Malformed CSV → typed errors visible, no crash
6. PORT-08 covered end-to-end by Playwright integration spec
7. Manual checkpoint approved
</success_criteria>

<output>
After completion, create .planning/phases/04-portfolio-builder/04-06-SUMMARY.md with:
- CSV import flow steps and screenshots references
- Coverage of the 5 spec test cases
- Any deviation from CONTEXT (e.g., if sessionStorage proved unreliable and was replaced with another transfer mechanism)
- Phase 4 wrap-up checklist: PORT-01..08 + META-01 all green
</output>
