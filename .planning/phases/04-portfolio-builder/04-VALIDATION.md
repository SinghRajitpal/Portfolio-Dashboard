---
phase: 4
slug: portfolio-builder
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (unit) + Playwright 1.59 (integration/e2e) |
| **Config file** | `vitest.config.mts`, `playwright.config.ts` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10s unit / ~120s full |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds (unit)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-00-01 | 00 (Wave 0) | 0 | infra | infra | `npm run test:unit` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-01 create | integration | `npx playwright test tests/integration/portfolio-create.spec.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-01 edit | integration | `npx playwright test tests/integration/portfolio-edit.spec.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-01 delete | integration | `npx playwright test tests/integration/portfolio-delete.spec.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-02 search | integration | `npx playwright test tests/integration/instrument-search.spec.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-02 DataError | unit | `npm run test:unit -- src/components/portfolio/InstrumentCombobox.test.tsx` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-03 schema | unit | `npm run test:unit -- src/app/dashboard/portfolios/_schema.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-03 normalize | unit | `npm run test:unit -- src/lib/portfolio/normalize-weights.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-04 amount + CHF | unit/integration | `npm run test:unit -- src/lib/portfolio/chf-format.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-05 TER | unit | `npm run test:unit -- src/lib/portfolio/compute-metrics.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-06 yield | unit | `npm run test:unit -- src/lib/portfolio/compute-metrics.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-07 template | integration | `npx playwright test tests/integration/portfolio-template.spec.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-08 csv parse | unit | `npm run test:unit -- src/lib/portfolio/parse-csv.test.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | PORT-08 csv import | integration | `npx playwright test tests/integration/portfolio-csv-import.spec.ts` | ❌ W0 | ⬜ pending |
| 04-XX-XX | TBD | 1+ | META-01 metadata | integration | covered in `portfolio-create.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are TBD until planner assigns plans. Wave 0 plan must create the test files listed below before downstream waves can sample feedback.*

---

## Wave 0 Requirements

- [ ] `tests/integration/portfolio-create.spec.ts` — stubs for PORT-01, PORT-04, META-01
- [ ] `tests/integration/portfolio-edit.spec.ts` — stub for PORT-01
- [ ] `tests/integration/portfolio-delete.spec.ts` — stub for PORT-01
- [ ] `tests/integration/portfolio-list.spec.ts` — stub for PORT-01 (list view, template exclusion)
- [ ] `tests/integration/instrument-search.spec.ts` — stub for PORT-02
- [ ] `tests/integration/portfolio-template.spec.ts` — stub for PORT-07
- [ ] `tests/integration/portfolio-csv-import.spec.ts` — stub for PORT-08
- [ ] `src/app/dashboard/portfolios/_schema.test.ts` — stub for PORT-03 (Zod)
- [ ] `src/lib/portfolio/normalize-weights.test.ts` — stub for PORT-03
- [ ] `src/lib/portfolio/compute-metrics.test.ts` — stubs for PORT-05, PORT-06
- [ ] `src/lib/portfolio/chf-format.test.ts` — stub for PORT-04
- [ ] `src/lib/portfolio/parse-csv.test.ts` — stub for PORT-08
- [ ] `src/components/portfolio/InstrumentCombobox.test.tsx` — stub for PORT-02 (requires `@testing-library/react` + `jsdom` install OR substitute Playwright coverage)
- [ ] `tests/helpers/test-portfolio.ts` — shared helper (service-role create + cleanup)
- [ ] `supabase/migrations/00004_portfolio_templates.sql` — must apply before template tests
- [ ] `supabase/migrations/00005_seed_etf_metadata.sql` — backfill v1 tickers with `expense_ratio` + `dividend_yield` so PORT-05/06 can show non-null metrics

*Wave 0 must complete before any feature plan begins so that subsequent task commits have a real test target to sample.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CHF formatting visual rendering in browser | PORT-04 | Intl output verified in unit test, but font/layout glyph correctness can drift across OS | Open `/dashboard/portfolios/new`, enter `10000`, confirm display reads `CHF 10'000` (with apostrophe glyph) |
| Sonner toast appearance + auto-dismiss | PORT-01 | Toast UX is visual; assertions on DOM presence are brittle | After successful save, verify a green toast appears top-right and dismisses within ~4s |
| Template list curation copy | PORT-07 | Template content is editorial, not behavioral | Confirm template names/descriptions match the agreed-on list in CONTEXT.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
