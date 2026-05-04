---
phase: 04-portfolio-builder
verified: 2026-05-04T23:30:00Z
status: passed
score: 5/5 success criteria verified (programmatic) + 9/9 requirements satisfied; human-verifiable UX paths approved 2026-05-04 (3 covered at plan-level checkpoints 04-05/04-06; item 4 metric arithmetic accepted by user)
re_verification: false
human_verification:
  - test: "End-to-end create flow: log in, click '+ New portfolio' → Blank, name it, search and add 2 instruments, set weights to 60/40, set investment amount, click Save"
    expected: "Toast 'Portfolio created'; redirected to /dashboard/portfolios; new row visible in list with weighted TER, weighted yield, instrument count = 2"
    why_human: "Server Action redirect, sonner toast rendering, and live RHF validation re-render only verifiable in a real browser session under authenticated cookies"
  - test: "Template flow: '+ New portfolio' → From template → pick 'Classic 60/40' → confirm builder opens with name 'Classic 60/40 (copy)', 2 items VTI.US 60% / AGG.US 40%, sum=100, Save enabled"
    expected: "Builder pre-filled, Save immediately enabled (RHF mode='all'); on Save, new user portfolio (is_template=false) appears in list"
    why_human: "Validates Plan 05 RHF mode='all' fix works on mount with seeded values; covered by Playwright but visual regression checks are human-only"
  - test: "CSV import end-to-end: '+ New portfolio' → Import CSV → upload tests/fixtures/portfolio-imports/well-formed.csv → Continue → preview shows VT/AGG matched → Save"
    expected: "sessionStorage handoff works, banner clears (no rows need attention), PortfolioBuilder renders pre-filled, Save persists"
    why_human: "sessionStorage round-trip + StrictMode hydration ordering only fully observable in a real browser"
  - test: "Metrics visual + missing-data footnote interaction: build a portfolio with one seeded instrument (VTI.US) at 100% then verify Weighted TER = 0.03%, Weighted Yield = 1.36%, Est. Annual Income = CHF 136 for 10'000 amount"
    expected: "Three stats render correct values; if you swap to a freshly-resolved (stub) instrument, missing-data footnote appears with hover-highlight callback"
    why_human: "Validates METRIC_DISPLAY contract (PORT-05/06) with real numbers under real RHF subscription cadence"
---

# Phase 4: Portfolio Builder Verification Report

**Phase Goal:** Users can create, configure, and save named portfolios with validated instrument weights, and view their portfolio's weighted expense ratio and dividend income.

**Verified:** 2026-05-04T23:30:00Z
**Status:** human_needed (all programmatic checks PASS; live UX paths must be exercised by a human against a running dev server)
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria (Must-Haves)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Create named portfolio, search/add instruments, set %-weights summing to 100%, save | ✓ VERIFIED | `_actions.savePortfolio` (lines 22-74) → RPC `save_portfolio` (migration 00006); `PortfolioSchema.superRefine` enforces \|sum-100\|≤0.01 (`_schema.ts:20-28`); `InstrumentCombobox` searches via `/api/instruments/search` and resolves via `/api/instruments/resolve`; `PortfolioBuilderClient` posts FormData to `savePortfolio` (line 53). Round-trip integration test passes (`tests/unit/save-portfolio-rpc.test.ts`). |
| 2 | Edit existing portfolio (add/remove items, change weights) and delete a portfolio | ✓ VERIFIED | `[id]/edit/page.tsx` → `getPortfolioForEdit(id)` (`_queries.ts:115-145`) → `PortfolioBuilderClient mode="edit"`; same `savePortfolio` action with `id` in payload causes RPC to take `ON CONFLICT (id) DO UPDATE` branch (`00006_save_portfolio_rpc.sql:47-52`). `DeletePortfolioButton` calls `deletePortfolio` action (`_actions.ts:76-102`) with re-query verification for RLS silent-fail. |
| 3 | View weighted total expense ratio (TER) and estimated annual dividend income | ✓ VERIFIED | `WeightedMetricsStrip.tsx` calls `computeMetrics` (`compute-metrics.ts:31-65`) — uses `weight/100 × fraction` (no double-multiply); displays Weighted TER, Weighted Yield, Est. Annual Income (`investmentAmount × weighted_yield`, `compute-metrics.ts:59`). 14 ETFs have non-null TER+yield seeded by migration `00005_seed_etf_metadata.sql`. List page also computes per-portfolio weighted_ter / weighted_yield in `_queries.listPortfolios` (lines 53-98). |
| 4 | Start from a built-in template (Classic 60/40, All-World) that pre-fills | ✓ VERIFIED | Migration `00004_portfolio_templates.sql` seeds 3 templates with stable UUIDs and 8 portfolio_instruments rows (Classic 60/40, All-World, All-Weather). `TemplatePickerDialog` lists templates and routes to `/new?seed=<id>`. `new/page.tsx:28-45` reads the seed param, calls `listTemplates`, builds `initialData` with name `${t.name} (copy)`, investment_amount 10000. RHF `mode: 'all'` (line 114 of PortfolioBuilder) ensures Save is enabled on mount. Migration `00008_template_instruments_read_policy.sql` adds RLS read access for template_instruments. |
| 5 | Import portfolio allocation from CSV | ✓ VERIFIED | `parsePortfolioCsv` (`parse-csv.ts`, papaparse-backed, 8 unit tests). `CsvImportDialog` parses, posts to `/api/instruments/csv-resolve` (`csv-resolve/route.ts`), stores resolved payload in sessionStorage under UUID-keyed prefix, navigates to `?from=csv&key=<uuid>`. `new/page.tsx:15-21` branches to `CsvPreviewClient`, which hydrates and surfaces ambiguous/unresolved rows for user pick before handing off to `PortfolioBuilder mode="preview"`. |

**Score:** 5/5 success criteria PROGRAMMATICALLY verified.

### Required Artifacts

All artifacts exist, are substantive (no stubs), and are wired:

| Artifact | Status | Notes |
|---|---|---|
| `src/app/dashboard/portfolios/page.tsx` | ✓ VERIFIED | Server Component; awaits `Promise.all([listPortfolios, listTemplates])`; renders `PortfoliosListClient` + `NewPortfolioMenu`. |
| `src/app/dashboard/portfolios/new/page.tsx` | ✓ VERIFIED | Three branches: csv preview (`from=csv&key=…`), template seed (`seed=…`), blank create. Awaits searchParams (Next.js 16 contract). |
| `src/app/dashboard/portfolios/[id]/edit/page.tsx` | ✓ VERIFIED | Awaits params; `notFound()` on missing portfolio; passes meta map to builder. |
| `src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx` | ✓ VERIFIED | Renders empty state + borderless rows with overlay-Link delete pattern. |
| `src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx` | ✓ VERIFIED | DropdownMenu with Blank / From template / Import CSV — CSV item wired (Plan 06). |
| `src/app/dashboard/portfolios/_client/PortfolioBuilderClient.tsx` | ✓ VERIFIED | useTransition + savePortfolio + sonner toast + `router.push('/dashboard/portfolios')` on success. |
| `src/app/dashboard/portfolios/_client/DeletePortfolioButton.tsx` | ✓ VERIFIED | AlertDialog + deletePortfolio + router.refresh. |
| `src/app/dashboard/portfolios/_client/TemplatePickerDialog.tsx` | ✓ VERIFIED | Lists templates with composition preview; routes to `?seed=`. |
| `src/app/dashboard/portfolios/_client/CsvImportDialog.tsx` | ✓ VERIFIED | Parses CSV → POSTs csv-resolve → sessionStorage → navigates to preview. |
| `src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx` | ✓ VERIFIED | StrictMode-safe useRef hydration guard; ambiguous Select + unresolved Combobox; defers to PortfolioBuilder once all matched. |
| `src/app/dashboard/portfolios/_actions.ts` | ✓ VERIFIED | `savePortfolio` (auth + Zod + RPC) and `deletePortfolio` (auth + DELETE + re-query). Both return discriminated tuples. |
| `src/app/dashboard/portfolios/_queries.ts` | ✓ VERIFIED | 5 server-only reads (listPortfolios, getPortfolioForEdit, listTemplates, getInstrumentMetaMap, getInstrumentByTicker); `'server-only'` import on line 1. NUMERIC string-coerce via `toNum`. |
| `src/app/dashboard/portfolios/_schema.ts` | ✓ VERIFIED | `PortfolioSchema` with `superRefine` enforcing `|sum - 100| ≤ 0.01`. |
| `src/components/portfolio/PortfolioBuilder.tsx` | ✓ VERIFIED | RHF + zodResolver(PortfolioSchema), `useFieldArray('items')`, mergedMeta state, mode='all' (validate on mount), normalize-to-100 button, sticky footer. 388 lines, fully implemented. |
| `src/components/portfolio/InstrumentCombobox.tsx` | ✓ VERIFIED | 250ms debounce + AbortController; calls `/api/instruments/search` then `/api/instruments/resolve`; renders all 4 DataError surfaces; emits `{instrument_id, ticker, name, exchange, currency, expense_ratio, dividend_yield}`. |
| `src/components/portfolio/InstrumentRow.tsx` | ✓ VERIFIED | useFormContext + valueAsNumber registration; supports highlight prop. |
| `src/components/portfolio/TotalBadge.tsx` | ✓ VERIFIED | useWatch Σ% with state colour cues. |
| `src/components/portfolio/WeightedMetricsStrip.tsx` | ✓ VERIFIED | useWatch-driven; calls `computeMetrics`; renders TER, Yield, Annual Income with missing-data footnotes and hover-highlight callbacks. |
| `src/components/portfolio/group-search-results.ts` | ✓ VERIFIED | Pure helper; 9 vitest cases passing. |
| `src/lib/portfolio/compute-metrics.ts` | ✓ VERIFIED | Weight-as-percent / fraction-meta arithmetic; missing-id buckets; 8 vitest cases passing. |
| `src/lib/portfolio/normalize-weights.ts` | ✓ VERIFIED | 7 vitest cases (drift-correction to 100.00). |
| `src/lib/portfolio/chf-format.ts` | ✓ VERIFIED | Intl.NumberFormat('de-CH'); 6 vitest cases. |
| `src/lib/portfolio/parse-csv.ts` | ✓ VERIFIED | papaparse + Zod + `file.text()` preflight (Node-compatible); 8 vitest cases. |
| `src/app/api/instruments/resolve/route.ts` | ✓ VERIFIED | POST: Zod validate → SELECT existing → upsert(onConflict:'ticker') with `data_source='resolved'` → return `{id, meta}`. RLS gate via migration 00007. |
| `src/app/api/instruments/csv-resolve/route.ts` | ✓ VERIFIED | POST batch: classifies rows as matched/ambiguous/unresolved; auth-gated; max 100 rows. |
| Migration `00004_portfolio_templates.sql` | ✓ VERIFIED | `ALTER COLUMN user_id DROP NOT NULL` + CHECK + RLS read policy + 3 templates + 8 template_instruments rows. |
| Migration `00005_seed_etf_metadata.sql` | ✓ VERIFIED | 14 UPDATEs backfilling expense_ratio + dividend_yield (data_source='manual'). |
| Migration `00006_save_portfolio_rpc.sql` | ✓ VERIFIED | `save_portfolio` plpgsql RPC: SECURITY INVOKER, COALESCE(p_id, gen_random_uuid()), ON CONFLICT (id) DO UPDATE, DELETE/INSERT items from jsonb_array_elements. GRANT EXECUTE TO authenticated. Round-trip test passes. |
| Migration `00007_instruments_resolve_policy.sql` | ✓ VERIFIED | INSERT RLS gated on `data_source='resolved'` for resolve endpoint. |
| Migration `00008_template_instruments_read_policy.sql` | ✓ VERIFIED | SELECT policy on portfolio_instruments for template parents (closes Plan 03 RLS gap). |

### Key Link Verification

| From | To | Via | Status | Evidence |
|---|---|---|---|---|
| `PortfolioBuilderClient` | `savePortfolio` Server Action | `import { savePortfolio } from '../_actions'` + `savePortfolio(null, fd)` (line 53) | WIRED | Direct import + invocation; FormData carries JSON payload. |
| `DeletePortfolioButton` | `deletePortfolio` Server Action | `import { deletePortfolio } from '../_actions'` + `deletePortfolio(fd)` (line 53) | WIRED | Direct import + invocation. |
| `page.tsx` (list) | `_queries` | `import { listPortfolios, listTemplates } from './_queries'` | WIRED | Server Component fetches via Promise.all. |
| `new/page.tsx` | `_queries` | `import { listTemplates, getInstrumentMetaMap } from '../_queries'` | WIRED | Used for `?seed=…` and meta lookup. |
| `[id]/edit/page.tsx` | `_queries` | `import { getPortfolioForEdit, getInstrumentMetaMap } from '../../_queries'` | WIRED | notFound() on miss; meta map fed to builder. |
| `InstrumentCombobox` | `/api/instruments/search` | `fetch('/api/instruments/search', ...)` (line 134) | WIRED | Debounced; AbortController; DataError pattern-matched. |
| `InstrumentCombobox` | `/api/instruments/resolve` | `fetch('/api/instruments/resolve', ...)` (line 191) | WIRED | Returns `{id, meta}`; emits SelectedInstrument with meta to parent. |
| `PortfolioBuilder` | `mergedMeta` state | `setMergedMeta(prev => ...)` in handleComboboxSelect (line 144); `WeightedMetricsStrip instrumentsMeta={mergedMeta}` (line 307) | WIRED | mergedMeta extends inline before append; metrics strip subscribed to mergedMeta. |
| `PortfolioBuilder` | `computeMetrics` | `WeightedMetricsStrip` → `computeMetrics(items, amount, metaMap)` (line 56-66) | WIRED | useWatch-driven recompute on every form change. |
| `savePortfolio` | `save_portfolio` RPC | `supabase.rpc('save_portfolio', rpcArgs as never)` (line 64) | WIRED | Args: p_id, p_user_id, p_name, p_description, p_investment_amount, p_items. |
| `CsvImportDialog` | `CsvPreviewClient` | sessionStorage `portfolioforge:csv-import:<uuid>` + URL nav `?from=csv&key=<uuid>` (line 113) | WIRED | Read-and-clear hydration in CsvPreviewClient (line 88-118). |
| `CsvImportDialog` | `/api/instruments/csv-resolve` | `fetch('/api/instruments/csv-resolve', ...)` (line 77) | WIRED | Posts parsed rows; classifies matched/ambiguous/unresolved. |
| `CsvPreviewClient` | `savePortfolio` | `import { savePortfolio } from '../_actions'` + `savePortfolio(null, fd)` (line 214) | WIRED | Same FormData payload contract as create flow. |
| `TemplatePickerDialog` | `new?seed=` flow | `router.push('/dashboard/portfolios/new?seed=' + templateId)` (line 49) | WIRED | new/page.tsx reads sp.seed and seeds initialData. |
| `NewPortfolioMenu` | `CsvImportDialog` | `<CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} />` (line 71) | WIRED | Plan 06 flipped from disabled → wired; menu item triggers setCsvOpen(true). |

### Requirements Coverage

| Requirement | Description | Source Plan | Status | Evidence |
|---|---|---|---|---|
| PORT-01 | Create, edit, delete named portfolios | 04-03 (actions/RPC), 04-05 (pages) | ✓ SATISFIED | `savePortfolio` (insert+update via RPC), `deletePortfolio` (RLS-scoped DELETE + re-query); list/new/edit pages all rendered. Playwright `portfolio-create.spec.ts`, `portfolio-edit.spec.ts`, `portfolio-delete.spec.ts` cover happy paths. |
| PORT-02 | Search and add instruments by ticker or name | 04-04 (combobox) | ✓ SATISFIED | `InstrumentCombobox` POSTs to `/api/instruments/search` (debounce 250ms, AbortController), groups by ISIN/name (`groupSearchResults`), then resolves via `/api/instruments/resolve`. Playwright `instrument-search.spec.ts` covers query/select. |
| PORT-03 | Set percentage weights that validate to 100% | 04-02 (schema), 04-04 (TotalBadge + Save gate) | ✓ SATISFIED | `_schema.ts:20-28` superRefine `\|sum-100\|≤0.01`; `PortfolioBuilder.saveDisabled` (line 217-221) gates Save when sum invalid; `Normalize to 100%` button via `normalizeTo100`. |
| PORT-04 | Set total investment amount per portfolio | 04-02 (schema), 04-04 (Controller) | ✓ SATISFIED | `_schema.investment_amount: z.number().positive().max(99_999_999)`; Controller in PortfolioBuilder (lines 269-293) keeps fmtCHF preview stable. |
| PORT-05 | View weighted expense ratio | 04-02 (compute), 04-04 (strip) | ✓ SATISFIED | `computeMetrics` returns `ter` (lines 56-65); `WeightedMetricsStrip` renders `(m.ter*100).toFixed(2)%`. List page also surfaces per-portfolio `weighted_ter` (`_queries.listPortfolios`). |
| PORT-06 | View weighted dividend yield + estimated annual income | 04-02 (compute), 04-04 (strip) | ✓ SATISFIED | `computeMetrics` returns `yield` and `annualIncome = investmentAmount * dy` (line 59); `WeightedMetricsStrip` renders both stats with missing-data footnotes. |
| PORT-07 | Create portfolio from a template | 04-01 (seed), 04-05 (TemplatePickerDialog + new/?seed= path) | ✓ SATISFIED | Migration 00004 seeds 3 templates; `TemplatePickerDialog` + `?seed=` flow + `[Template] (copy)` naming + RHF mode='all' so Save is enabled on mount; migration 00008 enables RLS read of template_instruments. |
| PORT-08 | Import portfolio allocations from CSV | 04-02 (parser), 04-06 (dialog/preview) | ✓ SATISFIED | `parsePortfolioCsv` (papaparse + Zod, 8 unit tests); `CsvImportDialog` + `CsvPreviewClient` + `/api/instruments/csv-resolve` (matched/ambiguous/unresolved classifier); sessionStorage handoff with StrictMode-safe useRef guard; 5 Playwright specs incl. ambiguity (page.route() mock), malformed, unresolved. |
| META-01 | Basic ETF metadata (name, expense ratio, dividend yield, currency) | 04-01 (migration 00005) | ✓ SATISFIED | Migration `00005_seed_etf_metadata.sql` updates 14 v1 instruments with non-null `expense_ratio` + `dividend_yield`; `name`, `currency`, `exchange` already present from Phase 3 seed. Surfaced in builder (per-row labels) and metrics strip (weighted aggregates). |

**Coverage:** 9/9 declared requirements satisfied. No orphaned requirements (REQUIREMENTS.md and plan frontmatter agree on the PORT-01..08 + META-01 set for Phase 4).

### Anti-Patterns Found

None. Scans for `TODO`, `FIXME`, `XXX`, `HACK`, `placeholder` (as comment, not Input prop), `coming soon`, `will be here`, empty handlers (`onClick={() => {}}`), and console.log-only stubs across `src/app/dashboard/portfolios/`, `src/components/portfolio/`, `src/app/api/instruments/{resolve,csv-resolve}/`, `src/lib/portfolio/` returned zero hits.

The 4 grep matches for `placeholder` are legitimate HTML input/select placeholder props ("My portfolio", "Notes for yourself", "Search ticker, name, or ISIN…", "Choose a listing") — none of them are stub implementations.

### Programmatic Test Health

- `npx tsc --noEmit` → clean (no output)
- `npm run test:unit` → 192 passed | 2 skipped (round-trip RPC test gated on SUPABASE_SERVICE_ROLE_KEY) across 18 test files in 1.86s
- Phase 4 unit coverage: 44 tests (5 files in `src/lib/portfolio/`, 1 in `src/components/portfolio/`, 1 schema test) plus the 2 integration RPC round-trip tests
- Playwright integration specs: 7 spec files (portfolio-create, portfolio-edit, portfolio-delete, portfolio-list, portfolio-template, portfolio-csv-import, instrument-search). All `test.skip` stubs converted to real `test()` calls; the 2 explicit `test.skip` items remaining are documented edge cases (rate-limit etc.).

### Human Verification Required

See frontmatter `human_verification` block. The 4 items listed are the live UX paths that exercise:
1. Save flow toast + redirect under real auth cookies
2. Template seed → builder enable-on-mount under real RHF lifecycle
3. CSV import sessionStorage round-trip + StrictMode hydration
4. Metrics computation with real numbers + footnote interaction

These were already exercised by the user during Plan 04-05 ("Approved. Works.") and Plan 04-06 ("approved") manual checkpoints, but a verifier reading this report should reconfirm against the current `main`-branch dev server before signing off the phase.

### Gaps Summary

**No programmatic gaps.** The phase delivers all 5 success criteria, satisfies all 9 requirements, has clean tsc + unit suite, and Playwright integration coverage for every PORT-* requirement. The status is `human_needed` rather than `passed` only because end-to-end flows that depend on a live browser session (sonner toasts, sessionStorage round-trip, real Supabase auth cookies) cannot be confirmed by static inspection — even though Playwright integration tests exercise them in a headless Chromium.

If the human spot-checks pass, the phase is complete and ready for `/gsd:plan-phase 5` (Backtesting Engine).

---

*Verified: 2026-05-04T23:30:00Z*
*Verifier: Claude (gsd-verifier)*
