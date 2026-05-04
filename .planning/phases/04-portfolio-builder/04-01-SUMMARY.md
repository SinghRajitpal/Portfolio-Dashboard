---
phase: 04-portfolio-builder
plan: 01
subsystem: testing

tags: [react-hook-form, zod, papaparse, shadcn, sonner, supabase-rls, vitest, playwright]

# Dependency graph
requires:
  - phase: 03-market-data-pipeline
    provides: instruments table populated with 14 v1 tickers; data_source field; @base-ui/react UI primitives
  - phase: 02-app-shell-design-system
    provides: ThemeProvider wired in root layout; shadcn base-nova style configured
provides:
  - react-hook-form + zod + papaparse runtime deps installed
  - Hand-rolled shadcn-style Form wrapper (RHF + cloneElement) compatible with @base-ui/react
  - Six new shadcn primitives: popover, command, sonner, tooltip, alert-dialog, separator (plus form, input-group, textarea)
  - Toaster wired globally inside ThemeProvider
  - 3 new Supabase migrations (00004 templates schema/seed, 00005 ETF metadata backfill, 00007 instruments INSERT RLS)
  - 3 seeded portfolio templates with 8 portfolio_instruments rows
  - 14 instruments rows now have non-null expense_ratio + dividend_yield
  - 5 vitest unit stubs (33 it.todo) + 7 Playwright integration stubs (27 test.skip) + tests/helpers/test-portfolio.ts
affects: [04-portfolio-builder, 04-02-pure-libs-and-schema, 04-03-server-actions-rpc, 04-04-builder-components, 04-05-pages-and-templates, 04-06-csv-import]

# Tech tracking
tech-stack:
  added:
    - react-hook-form@7.75.0
    - "@hookform/resolvers@3.10.0"
    - zod@3.25.76
    - papaparse@5.5.3
    - "@types/papaparse@5.5.2"
    - sonner@2.0.7 (transitive via shadcn add)
  patterns:
    - "shadcn Form wrapper for base-ui projects: RHF + React.cloneElement instead of Radix Slot"
    - "Wave-0 stub pattern: it.todo (vitest) + test.skip (playwright) keeps runners green while reserving file paths"
    - "Supabase template pattern: nullable user_id + CHECK constraint scoping is_template ↔ user_id, plus authenticated SELECT-only RLS"
    - "Instruments RLS gate: data_source='resolved' WITH CHECK confines user inserts to /api/instruments/resolve"

key-files:
  created:
    - src/components/ui/popover.tsx
    - src/components/ui/command.tsx
    - src/components/ui/form.tsx
    - src/components/ui/sonner.tsx
    - src/components/ui/tooltip.tsx
    - src/components/ui/alert-dialog.tsx
    - src/components/ui/separator.tsx
    - src/components/ui/input-group.tsx
    - src/components/ui/textarea.tsx
    - supabase/migrations/00004_portfolio_templates.sql
    - supabase/migrations/00005_seed_etf_metadata.sql
    - supabase/migrations/00007_instruments_resolve_policy.sql
    - tests/helpers/test-portfolio.ts
    - tests/integration/portfolio-create.spec.ts
    - tests/integration/portfolio-edit.spec.ts
    - tests/integration/portfolio-delete.spec.ts
    - tests/integration/portfolio-list.spec.ts
    - tests/integration/instrument-search.spec.ts
    - tests/integration/portfolio-template.spec.ts
    - tests/integration/portfolio-csv-import.spec.ts
    - src/app/dashboard/portfolios/_schema.test.ts
    - src/lib/portfolio/normalize-weights.test.ts
    - src/lib/portfolio/compute-metrics.test.ts
    - src/lib/portfolio/chf-format.test.ts
    - src/lib/portfolio/parse-csv.test.ts
  modified:
    - package.json
    - package-lock.json
    - src/app/layout.tsx
    - src/components/ui/button.tsx (shadcn CLI dropped 'use client' directive)

key-decisions:
  - "shadcn base-nova style does not ship a Form component, so the standard shadcn Form pattern was hand-rolled using react-hook-form's Controller + React.cloneElement (Slot equivalent for non-Radix UIs)"
  - "Migration 00004 uses actually-seeded ticker analogues (VTI.US, AGG.US, IWDA.LSE, BND.US, GLD.US, EEM.US) since plan-referenced VT/TLT/IEI/DJP are not in the v1 seed; templates retain conceptual intent"
  - "Migration 00005 backfills the 14 actually-seeded tickers (.US/.SW/.LSE suffixes), not the bare-ticker list in the original plan"
  - "Test stubs use it.todo (vitest) + test.skip (playwright) so runners stay green; @testing-library/react + jsdom intentionally NOT installed per plan critical_constraints"

patterns-established:
  - "Form scaffolding: RHF FormProvider + Controller + cloneElement-based FormControl (compatible with @base-ui/react)"
  - "Template seeding: stable UUIDs + INSERT...SELECT subselects on instruments.ticker for idempotency"
  - "Stub-test discipline: every PORT-* requirement has a placeholder test that downstream verify blocks can target"

requirements-completed: []  # Wave 0 is scaffolding only — no PORT-* requirement is closed by stubs alone; downstream Wave 1+ plans flip these as their tests turn green.

# Metrics
duration: ~10min
completed: 2026-05-04
---

# Phase 4 Plan 1: Wave 0 Scaffolds Summary

**Wave 0 scaffolding: Phase 4 deps installed, shadcn primitives + hand-rolled Form wrapper added, three Supabase migrations applied (templates + metadata backfill + instruments INSERT RLS), 13 stub test files seeded with todos/skips so downstream `<verify>` blocks have real targets.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-04T18:42:38Z
- **Completed:** 2026-05-04T18:53:00Z (approx)
- **Tasks:** 3 / 3
- **Files created:** 25
- **Files modified:** 4

## Accomplishments

- Installed Phase 4 runtime deps (`react-hook-form`, `@hookform/resolvers`, `zod`, `papaparse`) and dev types
- Added 6 shadcn primitives required by Plan 04+ (popover, command, sonner, tooltip, alert-dialog, separator) plus form, input-group, textarea
- Wrote a custom `form.tsx` wrapper because the `base-nova` shadcn registry does not ship one for non-Radix projects; mirrors the standard FormField/FormItem/FormLabel/FormControl/FormDescription/FormMessage API surface
- Wired `<Toaster />` into `src/app/layout.tsx` inside the existing `ThemeProvider`
- Authored and applied 3 migrations: 00004 (templates schema + RLS + 3 seeded templates), 00005 (ETF metadata backfill for all 14 v1 tickers), 00007 (`instruments` INSERT RLS gated on `data_source = 'resolved'` for Plan 04's `/api/instruments/resolve`)
- Created 5 vitest unit stub files (33 todos) and 7 Playwright integration stub specs (27 skipped tests) covering every PORT-* requirement, plus `tests/helpers/test-portfolio.ts`
- Verified post-migration DB state: 3 templates, 8 template_instrument rows, 14 instruments with non-null TER + dividend yield

## Task Commits

1. **Task 1: Install Phase 4 deps and add shadcn primitives** — `c937562` (feat)
2. **Task 2: Author migrations 00004/00005/00007** — `9b49a52` (feat)
3. **Task 3: Create Wave 0 test stub files** — `158ff2f` (test)

## Files Created/Modified

### Dependencies
- `package.json`, `package-lock.json` — added 5 deps for Phase 4

### shadcn primitives (new)
- `src/components/ui/popover.tsx` — base-ui popover wrapper
- `src/components/ui/command.tsx` — combobox primitive (used by InstrumentCombobox in Plan 04)
- `src/components/ui/form.tsx` — hand-rolled RHF wrapper (Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage, useFormField)
- `src/components/ui/sonner.tsx` — Toaster primitive
- `src/components/ui/tooltip.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/input-group.tsx` — added by shadcn CLI as a side effect
- `src/components/ui/textarea.tsx` — added by shadcn CLI as a side effect

### Layout wiring
- `src/app/layout.tsx` — imports `Toaster`, renders inside `ThemeProvider` after `{children}`
- `src/components/ui/button.tsx` — shadcn CLI removed leading `"use client"` directive (modern shadcn pattern: directive lives on the consumer)

### Database migrations
- `supabase/migrations/00004_portfolio_templates.sql` — `ALTER COLUMN user_id DROP NOT NULL` + CHECK constraint + authenticated-read RLS for templates + 3 seeded templates with stable UUIDs + 8 portfolio_instruments rows
- `supabase/migrations/00005_seed_etf_metadata.sql` — 14 UPDATE statements seeding `expense_ratio` and `dividend_yield` for all v1 tickers (data_source='manual')
- `supabase/migrations/00007_instruments_resolve_policy.sql` — `CREATE POLICY ... FOR INSERT TO authenticated WITH CHECK (data_source = 'resolved')`

### Test stubs (vitest)
- `src/app/dashboard/portfolios/_schema.test.ts` — 9 todos for PORT-03 schema
- `src/lib/portfolio/normalize-weights.test.ts` — 5 todos for PORT-03 normalize-to-100
- `src/lib/portfolio/compute-metrics.test.ts` — 7 todos for PORT-05/06 weighted metrics
- `src/lib/portfolio/chf-format.test.ts` — 5 todos for PORT-04 CHF format
- `src/lib/portfolio/parse-csv.test.ts` — 7 todos for PORT-08 papaparse wrapper

### Test stubs (Playwright integration)
- `tests/helpers/test-portfolio.ts` — exposes `getServiceClient`, `createTestPortfolio` (stub throws), `cleanupTestPortfolio` (functional), `loginTestUser` (stub throws)
- `tests/integration/portfolio-create.spec.ts` — 5 skipped tests (PORT-01 / PORT-04 / META-01)
- `tests/integration/portfolio-edit.spec.ts` — 3 skipped tests
- `tests/integration/portfolio-delete.spec.ts` — 3 skipped tests
- `tests/integration/portfolio-list.spec.ts` — 4 skipped tests
- `tests/integration/instrument-search.spec.ts` — 5 skipped tests (PORT-02 + DataError surfaces)
- `tests/integration/portfolio-template.spec.ts` — 3 skipped tests (PORT-07)
- `tests/integration/portfolio-csv-import.spec.ts` — 4 skipped tests (PORT-08)

## Decisions Made

- **Hand-rolled `form.tsx`** — the `base-nova` shadcn registry returns no payload for the `form` component (silent CLI exit). Rather than block downstream plans, a faithful copy of shadcn's standard Form API was authored that uses `React.cloneElement` instead of Radix `Slot`. Same exports, same prop surface; downstream plans can `import { Form, FormField, FormItem, … } from "@/components/ui/form"` without modification.
- **Templates use the actually-seeded ticker analogues** — Phase 3 seed established `.US`/`.SW`/`.LSE` exchange-suffixed tickers, and the v1 universe is {SPY.US, VTI.US, AGG.US, BND.US, GLD.US, QQQ.US, EEM.US, IWDA.LSE, VWRL.LSE, 500E.SW, CHDVD.SW, CSSPX.SW, NOVN.SW, SSAC.SW}. The plan's bare tickers (VT, TLT, IEI, DJP) are not present. Templates were rewritten to use available analogues (VTI.US/AGG.US for 60/40, IWDA.LSE for All-World, etc.) preserving each template's conceptual intent.
- **Migration 00006 reserved** — kept the existing 00006 (Phase 3) untouched; new instruments INSERT RLS migration is numbered 00007 to preserve linear history.
- **No `"use client"` directive on button.tsx** — shadcn CLI's modern pattern offloads the directive to consumers; build verifies this works.
- **No RTL/jsdom installed** — per plan critical_constraints; Playwright covers DOM tests in subsequent waves.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `form` component missing from `base-nova` shadcn registry**
- **Found during:** Task 1 (shadcn add)
- **Issue:** `npx shadcn@latest add form --yes --overwrite` returned with no output and no file created (only `✔ Checking registry.` was logged). Downstream plans depend on `@/components/ui/form` for RHF integration.
- **Fix:** Authored `src/components/ui/form.tsx` by hand. Mirrors shadcn's canonical exports (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`). Replaces Radix `Slot` with `React.cloneElement` so it composes with arbitrary children (e.g., the project's `<Input>` from `@base-ui/react`).
- **Files modified:** `src/components/ui/form.tsx` (created)
- **Verification:** `npx tsc --noEmit` clean; `npm run build` passes.
- **Committed in:** `c937562` (Task 1 commit)

**2. [Rule 1 — Bug] Plan 00004/00005 referenced bare tickers (VT, AGG, VTI, …) but Phase 3 seed used exchange-suffixed tickers (`SPY.US`, `VTI.US`, `IWDA.LSE`, …)**
- **Found during:** Task 2 verification (post-`db push` query showed 0 template_instruments rows and only 6/14 metadata UPDATEs took effect)
- **Issue:** All 8 US-listed UPDATE statements missed (no rows changed) because `WHERE ticker = 'SPY'` matched zero rows; the seed had `SPY.US`. Same for the template's `INSERT … SELECT … WHERE ticker = 'VT'` — VT/TLT/IEI/DJP simply do not exist in the v1 seed.
- **Fix:** Rewrote 00004 to use available ticker analogues (VTI.US/AGG.US for Classic 60/40, IWDA.LSE for All-World, VTI.US/BND.US/AGG.US/GLD.US/EEM.US for All-Weather). Rewrote 00005 to UPDATE the actually-seeded 14 tickers. Backfilled the missing rows on the live dev DB via service-role script (since migrations are already recorded as applied).
- **Files modified:** `supabase/migrations/00004_portfolio_templates.sql`, `supabase/migrations/00005_seed_etf_metadata.sql`
- **Verification:** Post-fix DB shows 3 templates, 8 template_instrument rows, 14 instruments with non-null TER+yield (vs. 6 before).
- **Committed in:** `9b49a52` (Task 2 commit)

**3. [Rule 1 — Bug] `FOR INSERT` and `TO authenticated` were on separate lines in 00007, breaking the verify regex `grep -q "FOR INSERT TO authenticated"`**
- **Found during:** Task 2 verify
- **Issue:** Multi-line policy declaration is valid SQL but the plan's verify command searches for a single-line match.
- **Fix:** Collapsed `FOR INSERT TO authenticated` onto one line.
- **Files modified:** `supabase/migrations/00007_instruments_resolve_policy.sql`
- **Verification:** `grep -q "FOR INSERT TO authenticated" supabase/migrations/00007_instruments_resolve_policy.sql` → 0 (matches)
- **Committed in:** `9b49a52` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All deviations addressed plan↔reality mismatches that would have left downstream plans without working scaffolds. No scope creep — every fix kept the plan's intent.

## Issues Encountered

- **shadcn CLI interactive prompt despite `--yes`** — first invocation paused at "overwrite button.tsx?". Re-ran with `--yes --overwrite` which completed non-interactively.
- **Migration `db push` is one-shot** — once 00004/00005 were marked as applied, the corrected versions could not re-run via `supabase db push`. Backfilled the data deltas via a service-role script directly. Migration files on disk match the corrected state, so a future `db reset` will produce the right outcome on a fresh DB.

## User Setup Required

None — migrations were applied non-interactively against the existing dev Supabase pooler. No new env vars introduced. The plan's `user_setup` block (run `npx supabase db push` after Wave 0 lands) was performed as part of Task 2.

## Next Phase Readiness

- Plan 04-02 (pure libs and schema) can begin: `src/lib/portfolio/` directory exists, all PORT-03/04/05/06/08 vitest stubs exist with todos to flip.
- Plan 04-03 (server actions / RPC) can begin: `tests/helpers/test-portfolio.ts` exposes the helper API the spec needs to import; templates are seeded so `loadTemplate` flows have real data to read.
- Plan 04-04 (builder components): all required shadcn primitives present; `<Toaster />` already wired.
- Plan 04-06 (CSV import): `papaparse` + `@types/papaparse` installed.
- Open follow-up: Plan 04-04 may need `@testing-library/react` + `jsdom` if a unit test for `<InstrumentCombobox>` DataError rendering is desired. Per plan critical_constraints, that test is currently expected to live in `tests/integration/instrument-search.spec.ts` (Playwright), which is already stubbed.

## Self-Check: PASSED

- [x] All listed files exist (verified via `ls`)
- [x] All three task commits exist on `main` (verified via `git log --oneline`)
- [x] `npm run test:unit` exits 0 with 33 todos (verified)
- [x] `npx playwright test --list` discovers 56 tests across 14 spec files including all 7 new stubs (verified)
- [x] DB query confirms 3 templates, 14 instruments with metadata, 8 template_instrument rows (verified via service-role script)

---
*Phase: 04-portfolio-builder*
*Completed: 2026-05-04*
