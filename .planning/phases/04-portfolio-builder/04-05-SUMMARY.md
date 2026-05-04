---
phase: 04-portfolio-builder
plan: 05
subsystem: ui
tags: [next-app-router, server-components, server-actions, react-hook-form, base-ui, sonner, playwright, supabase-rls]

# Dependency graph
requires:
  - phase: 04-portfolio-builder
    provides: "_queries (listPortfolios, listTemplates, getPortfolioForEdit, getInstrumentMetaMap), _actions (savePortfolio, deletePortfolio), PortfolioInput zod schema"
  - phase: 04-portfolio-builder
    provides: "PortfolioBuilder client component with mergedMeta extension pattern, /api/instruments/resolve route returning { id, meta }"
  - phase: 02-app-shell-design-system
    provides: "shadcn/base-nova primitives (Dialog, AlertDialog, DropdownMenu, Button), sonner Toaster wired in app/layout"
provides:
  - "/dashboard/portfolios list page (Server Component) — borderless rows + NewPortfolioMenu dropdown"
  - "/dashboard/portfolios/new page (Server Component) — supports ?seed=<templateId> for template pre-fill"
  - "/dashboard/portfolios/[id]/edit page (Server Component) — fetches getPortfolioForEdit + meta map"
  - "5 client wrappers (PortfoliosListClient, NewPortfolioMenu, PortfolioBuilderClient, DeletePortfolioButton, TemplatePickerDialog)"
  - "6 Playwright integration spec files converted from Wave 0 stubs to real tests with @smoke tagging"
  - "Migration 00008_template_instruments_read_policy.sql — RLS read access for portfolio_instruments rows belonging to template portfolios"
affects: [04-06-csv-import, 05-backtesting-engine, 07-portfolio-comparison]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Component → Client wrapper boundary: pages fetch via _queries and pass JSON-serializable props; _client/* owns interactivity + Server Action calls"
    - "_client/ folder convention (underscore prefix) keeps wrappers private to the route segment in Next.js 16"
    - "router.push + sonner toast on Server Action ok=true; setErrorMessage + toast.error on ok=false (no redirect() inside actions)"
    - "DeletePortfolioButton overlay-link pattern: row Link covers full row, Delete button sits absolutely-positioned above with stopPropagation"
    - "Template seed flow: TemplatePickerDialog → router.push('/dashboard/portfolios/new?seed=<id>') → server reads searchParams → maps template items to PortfolioInput with name '[Template] (copy)' and investment_amount 10000"

key-files:
  created:
    - "src/app/dashboard/portfolios/page.tsx"
    - "src/app/dashboard/portfolios/new/page.tsx"
    - "src/app/dashboard/portfolios/[id]/edit/page.tsx"
    - "src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx"
    - "src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx"
    - "src/app/dashboard/portfolios/_client/PortfolioBuilderClient.tsx"
    - "src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx"
    - "src/app/dashboard/portfolios/_client/TemplatePickerDialog.tsx"
    - "supabase/migrations/00008_template_instruments_read_policy.sql"
  modified:
    - "tests/integration/portfolio-create.spec.ts"
    - "tests/integration/portfolio-edit.spec.ts"
    - "tests/integration/portfolio-delete.spec.ts"
    - "tests/integration/portfolio-list.spec.ts"
    - "tests/integration/instrument-search.spec.ts"
    - "tests/integration/portfolio-template.spec.ts"

key-decisions:
  - "Import CSV menu item rendered disabled with 'coming soon' subtitle (per CONTEXT) — Plan 06 wires the actual handler"
  - "Empty list state shows centered message + inline 'Create your first portfolio' link; the page-header NewPortfolioMenu remains the single source of the dropdown trigger"
  - "PortfoliosListClient uses an overlay pattern (row-wide Link beneath, absolutely-positioned Delete button above) to satisfy 'click row → edit' + 'click delete → confirm' without nested interactive elements"
  - "RHF mode switched from 'onChange' to 'all' so template-seeded forms validate on mount (Save button enables immediately when seeded sum=100)"
  - "Migration 00008 added a SELECT policy on portfolio_instruments for template rows so unauthenticated/cross-user template browsing works under RLS"

patterns-established:
  - "Server Component pages await both params and searchParams (Next.js 16 Promise contract) — verified in [id]/edit/page.tsx and new/page.tsx"
  - "PortfolioBuilderClient stays thin: useTransition + savePortfolio call + router.push on ok; PortfolioBuilder owns form state and mergedMeta lifecycle"

requirements-completed: [PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, META-01]

# Metrics
duration: ~110 min
completed: 2026-05-04
---

# Phase 4 Plan 5: Pages and Templates Summary

**Three Server Component pages (list, new, edit) wired to Plan 03 actions/queries through five thin client wrappers, plus six Wave 0 stub specs converted into real Playwright integration tests — Phase 4 portfolio CRUD + templates is now end-to-end usable, leaving only PORT-08 (CSV import) for Plan 06.**

## Performance

- **Duration:** ~110 min (across two sessions, includes auto-fix loop on Task 3)
- **Started:** 2026-05-04 (Tasks 1-3 prior session)
- **Completed:** 2026-05-04T20:59Z
- **Tasks:** 4 (3 implementation + 1 manual verification checkpoint)
- **Files modified:** 15 (9 created, 6 spec files converted)

## Accomplishments
- `/dashboard/portfolios` lists user portfolios as borderless rows with name, instrument count, weighted TER, weighted yield, last-updated relative time; `+ New portfolio` dropdown (Blank / From template / Import CSV [disabled])
- `/dashboard/portfolios/new` supports `?seed=<templateId>` pre-fill flow with `[Template] (copy)` naming and CHF 10'000 default
- `/dashboard/portfolios/[id]/edit` pre-fills the builder via `getPortfolioForEdit` + `getInstrumentMetaMap`, with `notFound()` on missing or RLS-hidden ids
- Save flow: Server Action → sonner toast → `router.push('/dashboard/portfolios')` on success; inline error banner + toast on failure
- Delete flow: AlertDialog confirm → `deletePortfolio` → toast + `router.refresh()`
- Template picker dialog lists 3 seeded templates (Classic 60/40, All-World, All-Weather) with composition preview
- Migration 00008 closes a Plan 03 RLS gap: `portfolio_instruments` rows belonging to template portfolios are now SELECT-able by any authenticated user, fixing the template picker preview and the seeded-builder flow
- All 6 Playwright spec files converted from `test.skip` stubs to real tests; full suite green (18 passed, 2 documented skips, 0 failed in 44s)
- Manual UX verification approved by user: "Approved. Works."

## Task Commits

1. **Task 1: Server Component pages — list, new, edit** — `0f5370d` (feat)
2. **Task 2: Client wrappers (5 components)** — `4d34de5` (feat)
3. **Task 3: Convert Wave 0 stubs to real Playwright tests** — `5d58e77` (test)
3a. **Task 3 auto-fixes: template-instruments RLS + form/dialog UX** — `10335ee` (fix)
4. **Task 4: Manual UX verification checkpoint** — no commit (verification gate, user approved)

**Plan metadata:** committed in this finalization step (docs)

## Files Created/Modified

**Server Components:**
- `src/app/dashboard/portfolios/page.tsx` — list page; awaits `Promise.all([listPortfolios(), listTemplates()])`, renders header + PortfoliosListClient + NewPortfolioMenu
- `src/app/dashboard/portfolios/new/page.tsx` — supports `?seed=` template pre-fill; awaits searchParams
- `src/app/dashboard/portfolios/[id]/edit/page.tsx` — awaits params, calls `getPortfolioForEdit(id)`, `notFound()` on miss

**Client wrappers (`_client/` private folder):**
- `PortfoliosListClient.tsx` — empty state + borderless row list with overlay Link/Delete pattern
- `NewPortfolioMenu.tsx` — DropdownMenu with Blank / From template / Import CSV (disabled)
- `PortfolioBuilderClient.tsx` — useTransition + savePortfolio + sonner toast + router.push
- `DeletePortfolioButton.tsx` — AlertDialog confirm + deletePortfolio + router.refresh
- `TemplatePickerDialog.tsx` — Dialog listing 3 templates + composition preview, routes to `/new?seed=<id>`

**Migration:**
- `supabase/migrations/00008_template_instruments_read_policy.sql` — applied to remote dev DB during Task 3

**Integration tests (converted from `test.skip`):**
- `tests/integration/portfolio-create.spec.ts` — 5 tests (1 @smoke)
- `tests/integration/portfolio-edit.spec.ts` — 3 tests (1 @smoke)
- `tests/integration/portfolio-delete.spec.ts` — 2 tests (1 @smoke)
- `tests/integration/portfolio-list.spec.ts` — 4 tests (1 @smoke)
- `tests/integration/instrument-search.spec.ts` — 4 tests + 1 documented skip (rate-limit) (1 @smoke)
- `tests/integration/portfolio-template.spec.ts` — 3 tests (1 @smoke)

## Decisions Made

- **Import CSV item disabled in NewPortfolioMenu** rather than hidden — CONTEXT-locked decision; keeps the menu shape stable for Plan 06 to enable in place
- **Overlay-link delete pattern** — ships an HTML-valid alternative to the originally-attempted nested `<Link>` + `<button>` (which trips React/HTML interactive-element nesting rules). Delete button is absolutely positioned above a row-wide Link.
- **Migration 00008 rather than refactoring _queries** — the template picker needs to read instruments belonging to template portfolios, but the existing `portfolio_instruments` SELECT policy required ownership. Adding a focused RLS clause for `is_template = true` parents is more durable than bypassing RLS in queries.
- **`mode: 'all'` on the RHF instance** — `'onChange'` does not validate seeded values until the user types, leaving Save disabled on a freshly-seeded template. `'all'` validates on mount + change + blur, which is the desired UX.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PortfoliosListClient nested interactive elements**
- **Found during:** Task 3 (Playwright run)
- **Issue:** Original implementation rendered `<Link>` wrapping the row with `<DeletePortfolioButton>` inside — invalid HTML (nested interactive elements) and React warned in dev. The Delete button's stopPropagation also fought the row Link's navigation in subtle ways.
- **Fix:** Restructured to overlay pattern — row content sits inside a row-wide Link absolutely positioned to fill the row; DeletePortfolioButton is positioned absolutely on top with its own click handler.
- **Files modified:** `src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx`
- **Verification:** Playwright `Click row navigates to edit` and `Delete confirms via AlertDialog` both pass.
- **Committed in:** `10335ee`

**2. [Rule 1 - Bug] sumValid memo dependency**
- **Found during:** Task 3 (Playwright builder seed test)
- **Issue:** PortfolioBuilder's `sumValid` memo depended on `form.getValues().items` directly — this read a stable reference rather than subscribing to form state, so Save did not enable when items changed via combobox add.
- **Fix:** Switched to `useWatch({ control, name: ['items', 'investment_amount'] })` so the memo re-runs on every relevant form change.
- **Files modified:** `src/components/portfolio/PortfolioBuilder.tsx`
- **Verification:** `user can create a portfolio with name + 2 instruments + sum=100` Playwright test passes; Save enables exactly when sum=100.
- **Committed in:** `10335ee`

**3. [Rule 1 - Bug] RHF mode='onChange' does not validate seeded values on mount**
- **Found during:** Task 3 (template-seeded test)
- **Issue:** Template-seeded forms render with valid items+sum=100, but `mode: 'onChange'` only validates after a user-initiated change, so Save stayed disabled until the user touched a field.
- **Fix:** Switched RHF to `mode: 'all'` (validate on mount, change, and blur).
- **Files modified:** `src/components/portfolio/PortfolioBuilder.tsx`
- **Verification:** `Selecting a template pre-fills builder with [name] (copy)` test now sees Save enabled immediately.
- **Committed in:** `10335ee`

**4. [Rule 2 - Missing Critical] template_instruments RLS read policy**
- **Found during:** Task 3 (template-picker preview tests)
- **Issue:** `portfolio_instruments` SELECT policy required `auth.uid() = (select user_id from portfolios where id = portfolio_id)`. Templates have `user_id IS NULL` and `is_template = true`, so the join filtered them out — the template picker rendered "0 items" composition previews and the seeded builder loaded with an empty items array.
- **Fix:** Added migration `00008_template_instruments_read_policy.sql`: `CREATE POLICY ... USING (EXISTS (SELECT 1 FROM portfolios p WHERE p.id = portfolio_id AND p.is_template = true))`. Applied to remote dev DB via `supabase db push --linked`.
- **Files modified:** `supabase/migrations/00008_template_instruments_read_policy.sql`
- **Verification:** Template picker previews show correct compositions; seeded builder loads items + sum=100; cross-user impersonation still blocked (users cannot read others' non-template portfolio rows).
- **Committed in:** `10335ee`

**5. [Rule 1 - Bug] AlertDialog Cancel button interfered with base-ui close**
- **Found during:** Task 3 (delete-confirm test)
- **Issue:** AlertDialogCancel had a `disabled={pending}` prop and a `stopPropagation` — both interfered with base-ui's internal close handling. Cancel sometimes failed to dismiss the dialog cleanly under transition pending state.
- **Fix:** Removed both — the base-ui Cancel primitive already handles close-on-click; no need to gate it during the destructive transition.
- **Files modified:** `src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx`
- **Verification:** `Delete confirms via AlertDialog` Cancel branch passes; portfolio remains after Cancel click.
- **Committed in:** `10335ee`

**6. [Rule 1 - Bug] InstrumentCombobox handlePick race**
- **Found during:** Task 3 (instrument-search tests)
- **Issue:** `handlePick` awaited the resolve POST before closing the popover or clearing the query, so rapid clicks during the in-flight resolve could fire the same pick twice and the popover lingered with stale results.
- **Fix:** Close popover and clear query input synchronously, then await the resolve.
- **Files modified:** `src/components/portfolio/InstrumentCombobox.tsx`
- **Verification:** Combobox tests pass with no double-add and clean popover dismissal after a pick.
- **Committed in:** `10335ee`

---

**Total deviations:** 6 auto-fixed (5 bugs, 1 missing critical RLS policy)
**Impact on plan:** All fixes were necessary to make the implemented surface actually work end-to-end. The RLS gap was a Plan 03 hole that only surfaced when the template picker first ran live; closing it here unblocks the rest of Phase 4 and any future read paths into template_instruments.

## Issues Encountered

None beyond the auto-fixed deviations above. Pre-checkpoint sanity passed cleanly:

- `npx tsc --noEmit`: clean
- `vitest`: 192 passed, 2 skipped
- `npx playwright test (6 specs) --project=chromium`: 18 passed, 2 documented skips, 0 failed (44s)

## User Setup Required

None — no new external services or env vars introduced. Migration 00008 applied to remote dev DB during Task 3.

## Next Phase Readiness

**Ready for Plan 06 (CSV import):**
- NewPortfolioMenu has the disabled "Import CSV (coming soon)" item already in place — Plan 06 enables it and wires the handler.
- `tests/integration/portfolio-csv-import.spec.ts` Wave 0 stub remains skipped, ready for Plan 06 conversion.
- All Phase 4 requirements except PORT-08 are functionally complete.

**No blockers carried forward.**

---
*Phase: 04-portfolio-builder*
*Completed: 2026-05-04*

## Self-Check: PASSED

- All 15 claimed files verified on disk via `[ -f ]`
- All 4 task commit hashes verified via `git log --oneline --all`
- Migration 00008 present in `supabase/migrations/`
