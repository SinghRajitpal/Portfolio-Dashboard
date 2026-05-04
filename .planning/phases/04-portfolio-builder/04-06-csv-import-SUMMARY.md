---
phase: 04-portfolio-builder
plan: 06
subsystem: ui
tags: [csv-import, portfolio, playwright, sessionstorage, batch-resolve, react-strictmode]

requires:
  - phase: 04-portfolio-builder (Plan 02)
    provides: parsePortfolioCsv pure lib (papaparse-backed File→rows parser)
  - phase: 04-portfolio-builder (Plan 03)
    provides: savePortfolio Server Action (save_portfolio RPC)
  - phase: 04-portfolio-builder (Plan 04)
    provides: PortfolioBuilder mode='preview', InstrumentCombobox, /api/instruments/resolve
  - phase: 04-portfolio-builder (Plan 05)
    provides: NewPortfolioMenu (with disabled "Import CSV" item awaiting wire-up)

provides:
  - "POST /api/instruments/csv-resolve — batch resolver classifying CSV rows as matched | ambiguous | unresolved"
  - "CsvImportDialog — file-picker dialog driving parsePortfolioCsv → resolve → sessionStorage handoff"
  - "CsvPreviewClient — banner-driven 'needs review' UX wrapping PortfolioBuilder once all rows are matched"
  - "Real Playwright coverage for PORT-08 (5 specs, including page.route-mocked ambiguity test)"

affects: [05-backtesting-engine, 07-portfolio-comparison]

tech-stack:
  added: []
  patterns:
    - "sessionStorage handoff for client→client state transfer too large for URL params (UUID-keyed payload, read-and-clear on mount)"
    - "Playwright page.route() mocking for resolver responses to test ambiguous multi-venue UX without DB schema changes"
    - "StrictMode-safe one-shot effect via useRef guard (avoids double-clear in dev double-invoke)"
    - "Banner-mode preview: PortfolioBuilder reused unchanged; ambiguous/unresolved rows live in CsvPreviewClient state until all are matched, then full builder appears"

key-files:
  created:
    - src/app/api/instruments/csv-resolve/route.ts
    - src/app/dashboard/portfolios/_client/CsvImportDialog.tsx
    - src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx
    - tests/fixtures/portfolio-imports/well-formed.csv
    - tests/fixtures/portfolio-imports/with-exchange.csv
    - tests/fixtures/portfolio-imports/ambiguous-no-exchange.csv
    - tests/fixtures/portfolio-imports/malformed.csv
  modified:
    - src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx
    - src/app/dashboard/portfolios/new/page.tsx
    - tests/integration/portfolio-csv-import.spec.ts

key-decisions:
  - "sessionStorage UUID-keyed handoff (`portfolioforge:csv-import:<uuid>`) for dialog→preview state transfer — URL params are too small for resolved rows + multi-venue alternatives, and we wanted the back-button on /new to land cleanly without re-uploading"
  - "Never auto-pick a venue for ambiguous CSV rows — preview surfaces a per-row Select with all alternatives; Save stays blocked until every row is matched (CONTEXT-locked, RESEARCH Pitfall 4)"
  - "PortfolioBuilder reused unchanged for preview — ambiguous/unresolved rows render in CsvPreviewClient banner state OUTSIDE the builder; once all rows resolve, the full builder appears with the merged items"
  - "StrictMode useRef one-shot guard for sessionStorage read-and-clear — without it, Next 16 dev double-invoke clears the key before the effect commits and the second pass renders an empty preview"
  - "Ambiguity test uses Playwright `page.route()` to mock /api/instruments/csv-resolve — DB has UNIQUE(ticker), so seeding two venue-distinct rows is impossible without schema churn; mocking keeps the spec hermetic and DB-clean"

requirements-completed: [PORT-08]

duration: ~95min
completed: 2026-05-04
---

# Phase 4 Plan 6: CSV Import Summary

**CSV import dialog → preview screen with sessionStorage handoff, batch /api/instruments/csv-resolve classifying rows as matched/ambiguous/unresolved, and PortfolioBuilder reused unchanged behind a "needs review" banner — closes PORT-08 and Phase 4.**

## Performance

- **Duration:** ~95 min (across two sessions: implementation + manual UX verification)
- **Started:** 2026-05-04 (continuation of Phase 4 work)
- **Completed:** 2026-05-04
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint)
- **Files created/modified:** 10 (4 source + 1 page update + 1 menu update + 1 spec + 4 fixtures)
- **Playwright suite:** 5/5 green in 13.8s (chromium)

## Accomplishments

- **PORT-08 end-to-end:** Import CSV menu item is live; well-formed CSVs route to a preview that mirrors the manual create flow; ambiguous rows force a venue pick; unresolved rows get an inline search/replace combobox; malformed CSVs surface row-level errors without crashing.
- **Hermetic ambiguity coverage:** Playwright test for multi-venue ambiguity uses `page.route()` to fulfill /api/instruments/csv-resolve with two synthetic alternatives — works against the production schema without touching `instruments.UNIQUE(ticker)`.
- **No PortfolioBuilder churn:** The builder's API surface stayed identical — Plan 06 only feeds it `mode="preview"` + `initialData` after all rows resolve. Banner state lives in CsvPreviewClient.
- **StrictMode robustness:** Caught and fixed a hydration-time double-invoke issue where the sessionStorage key was being cleared before the React 19 / Next 16 second pass committed. Fixed with a `useRef` one-shot guard.
- **Phase 4 done:** PORT-01..08 + META-01 all green. Last plan in the phase.

## Task Commits

Each task committed atomically before this closeout:

1. **Task 1: /api/instruments/csv-resolve batch endpoint** — `97af083` (feat)
2. **Task 2: CsvImportDialog + CsvPreviewClient + NewPortfolioMenu wire-up + new/page.tsx branch** — `0ac6730` (feat)
3. **Task 3: Convert portfolio-csv-import.spec.ts from stubs to real Playwright + fixtures + StrictMode hydration fix** — `cce5c0c` (test)
4. **Task 4: Manual UX verification checkpoint** — Approved by user (no commit; verification gate)

**Plan metadata commit:** appended in this closeout (`docs(04-06): complete csv-import plan`).

## Files Created/Modified

**Created:**
- `src/app/api/instruments/csv-resolve/route.ts` — Auth-gated batch resolver. Zod-validates `{ rows: { ticker, exchange?, weight }[] }` (max 100). Per row: queries instruments by ticker (+ exchange if specified), classifies as `matched` (1 hit), `ambiguous` (>1 hit, returns all alternatives), or `unresolved` (0 hits, no exchange fallback when an exchange was explicitly requested).
- `src/app/dashboard/portfolios/_client/CsvImportDialog.tsx` — File picker dialog. On file select: parses via parsePortfolioCsv, surfaces parse errors, enables Continue when ≥1 valid row. On Continue: POSTs to /api/instruments/csv-resolve, stashes `{ resolved, parseErrors }` in sessionStorage under `portfolioforge:csv-import:<uuid>`, navigates to `/dashboard/portfolios/new?from=csv&key=<uuid>`.
- `src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx` — Reads + clears the sessionStorage key on mount (StrictMode-safe via useRef one-shot guard). Maintains local state for ambiguous/unresolved rows. Banner: "{N} rows need attention" with per-row Select (ambiguous) or InstrumentCombobox (unresolved). Once all rows are matched, hands off to `<PortfolioBuilder mode="preview" initialData={...} instrumentsMeta={...} submitLabel="Save imported portfolio">`. Save handler posts via savePortfolio Server Action; success → toast + push to /dashboard/portfolios.
- `tests/fixtures/portfolio-imports/well-formed.csv` — VT 60% / AGG 40%, no exchange.
- `tests/fixtures/portfolio-imports/with-exchange.csv` — VT 50% / AGG 50%, exchange=US explicit.
- `tests/fixtures/portfolio-imports/ambiguous-no-exchange.csv` — TESTAMB 100% (paired with `page.route()` mock).
- `tests/fixtures/portfolio-imports/malformed.csv` — non-numeric weight + missing ticker rows.

**Modified:**
- `src/app/dashboard/portfolios/_client/NewPortfolioMenu.tsx` — "Import CSV" menu item flipped from disabled→active, opens `<CsvImportDialog>` via local useState (same pattern as TemplatePickerDialog).
- `src/app/dashboard/portfolios/new/page.tsx` — searchParams now includes `from?: string; key?: string`; added third branch: `from === 'csv' && key` → render `<CsvPreviewClient csvKey={key} />` inside the same max-w-3xl container. Existing `seed` and blank-create branches unchanged.
- `tests/integration/portfolio-csv-import.spec.ts` — All 5 specs converted from `test.skip` stubs to real Playwright tests with cleanup helpers. Specs: well-formed save, with-exchange (no ambiguity prompt), ambiguous (page.route-mocked), malformed (row errors visible), unresolved (search-replace).

## Decisions Made

1. **sessionStorage handoff** — Dialog→preview state transfer uses a UUID-keyed sessionStorage payload. Rationale: resolved rows + multi-venue alternatives blow past URL-param size limits; cookie/server-state would require an extra round-trip; the back-button from /new to /portfolios stays clean (no re-upload required). Read-and-clear on mount, no leakage across imports.

2. **No auto-pick on ambiguity** — CONTEXT-locked from Plan 06's design phase and reinforced by RESEARCH Pitfall 4. The preview banner forces a deliberate venue pick (e.g., VWCE on .SW vs .DE vs .MI). Save button stays disabled until every row is matched.

3. **PortfolioBuilder unchanged** — Considered extending the builder with an "items needing attention" UI inside the table; rejected to keep the builder's API stable and avoid coupling preview-mode concerns to the create/edit surface. The CsvPreviewClient owns the banner; once empty, the builder takes over with the merged items.

4. **StrictMode useRef one-shot guard** — During Task 3 the integration spec showed a flaky empty-preview render. Root cause: Next 16 + React 19 StrictMode double-invokes effects in dev, and the first invocation cleared sessionStorage before the committed render could read it. Fix: wrap the read+clear in a `useRef(false)` guard — first invocation reads & sets the ref; second sees the guard and bails. Production behavior unchanged (single invoke).

5. **Ambiguity test uses page.route()** — The `instruments` table has `UNIQUE(ticker)` (migration 00001). Seeding two rows with the same ticker on different exchanges to drive a real ambiguous response would require a schema change just for this test. Instead, the spec intercepts the resolve POST and fulfills with two synthetic alternatives (TESTAMB on US/USD and XETRA/EUR). User picks "US"; banner clears; the test asserts the picked-alternative flow without persisting the synthetic id (which would fail the FK on save). Real PORT-08 coverage is preserved by the four other tests against the live DB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] StrictMode double-invoke clearing sessionStorage before commit**
- **Found during:** Task 3 (Playwright spec failures — preview rendered empty after navigation)
- **Issue:** CsvPreviewClient's mount effect read+cleared the sessionStorage key. Next 16 + React 19 StrictMode dev mode double-invokes effects; the first invocation cleared the key, the second saw nothing, and the committed render had no rows.
- **Fix:** Added `const ranRef = useRef(false)` inside the effect; bail when true, set to true on first read. Guarantees one-shot behavior in StrictMode without changing production semantics.
- **Files modified:** src/app/dashboard/portfolios/_client/CsvPreviewClient.tsx
- **Verification:** Playwright suite went from intermittent empty-preview failures to 5/5 green in 13.8s. Re-ran adjacent portfolio-create + portfolio-list specs to confirm no cross-test regressions.
- **Committed in:** `cce5c0c` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** No scope creep; the StrictMode guard is a small defensive measure required for correctness in dev. All planned tasks delivered as specified.

## Authentication Gates

None encountered during this plan. /api/instruments/csv-resolve uses the same `await createClient()` cookie auth as every other API route; tests log in via the existing `loginAsTestUser` helper.

## Issues Encountered

None beyond the StrictMode hydration issue documented above (which was diagnosed and fixed inline during Task 3).

## User Setup Required

None — no new environment variables, third-party services, or dashboard configuration introduced. The endpoint reuses existing Supabase auth + RLS.

## Manual Verification

User exercised the full UX matrix on the dev server:
1. Menu → Import CSV opens dialog with format hint ✓
2. well-formed.csv → preview shows VT 60% / AGG 40%, Σ=100, CHF 10'000 default → Save → toast + new portfolio in list ✓
3. with-exchange.csv → US listings resolve directly, no ambiguity prompt ✓
4. Hand-crafted unresolved CSV (ZZNOT) → preview banner "1 row needs attention" → inline combobox → pick → banner clears → Save works ✓
5. Hand-crafted malformed CSV (non-numeric weight) → dialog surfaces parse errors, Save blocked ✓
6. Mobile width — dialog and preview screen usable; pixel polish deferred per MEMORY.md ✓

User response: **approved**.

## Next Phase Readiness

**Phase 4 complete.** All requirements (PORT-01 through PORT-08 + META-01) are checked off. The portfolio builder surface is feature-complete and Playwright-covered:
- Create / edit / delete portfolios
- Search instruments by ticker / name / ISIN
- Weight validation to 100%
- Investment amount per portfolio
- Weighted TER + dividend yield + estimated annual income
- Templates ("Classic 60/40", "All-World", etc.)
- CSV import (this plan)

**Ready for:** `/gsd:verify-work` on the whole phase, then `/gsd:plan-phase 5` (Backtesting Engine — depends on the saved-portfolio shape this phase delivered).

**Carry-forward note for Phase 5:** Portfolios persist as `{ items: { instrument_id, weight }[], investment_amount }` via the `save_portfolio` RPC (migration 00006). Backtest will read these via the existing queries module from Plan 03.

## Self-Check: PASSED

All key files verified on disk; all three task commits (97af083, 0ac6730, cce5c0c) present in `git log --all`.

---
*Phase: 04-portfolio-builder*
*Plan: 06-csv-import*
*Completed: 2026-05-04*
