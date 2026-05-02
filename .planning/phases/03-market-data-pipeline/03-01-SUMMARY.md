---
phase: 03-market-data-pipeline
plan: "01"
subsystem: test-infrastructure
tags: [vitest, playwright, fixtures, proxy, testing]
dependency_graph:
  requires: []
  provides:
    - vitest-runner
    - api-cron-proxy-bypass
    - test-fixtures-eodhd
    - test-fixtures-frankfurter
    - test-fixtures-openfigi
    - mock-fetch-helper
    - supabase-test-helper
  affects:
    - all-phase-3-plans
tech_stack:
  added:
    - vitest@^2.1.9
    - vite-tsconfig-paths@^6.1.1
    - "@vitejs/plugin-react@^6.0.1"
    - "@rolldown/binding-darwin-arm64@^1.0.0-rc.18"
  patterns:
    - node-environment vitest (no jsdom/happy-dom — server-only phase)
    - ESM vitest.config.mts (required — vite-tsconfig-paths v6 is ESM-only)
    - mock-fetch pattern (fixture-by-URL-regex, zero real API calls)
key_files:
  created:
    - vitest.config.mts
    - src/app/api/cron/probe/route.ts
    - tests/integration/data/proxy-cron-bypass.spec.ts
    - tests/integration/data/.gitkeep
    - tests/helpers/mock-fetch.ts
    - tests/helpers/supabase-test.ts
    - tests/fixtures/eodhd/spy-eod.json
    - tests/fixtures/eodhd/spy-dividends.json
    - tests/fixtures/eodhd/chdvd-eod.json
    - tests/fixtures/eodhd/chdvd-dividends.json
    - tests/fixtures/eodhd/bulk-us-sample.json
    - tests/fixtures/eodhd/search-apple.json
    - tests/fixtures/frankfurter/chf-rates-sample.ndjson
    - tests/fixtures/openfigi/chdvd-isin.json
    - tests/unit/mock-fetch.test.ts
  modified:
    - package.json (add test:unit, test:integration, test scripts; vitest/vite devDeps)
    - src/proxy.ts (add api/cron to negative lookahead matcher)
decisions:
  - "vitest.config.mts (ESM extension) required because vite-tsconfig-paths v6 is ESM-only — vitest v2 loads CJS by default for .ts config files"
  - "Probe route named 'probe' not '_probe' — Next.js 16 treats underscore-prefixed folder segments as private (excluded from routing system)"
  - "vitest pinned to ^2 not ^4 — vitest 4.x requires rolldown which requires node >=20.19.0, but this machine runs 20.16.0"
  - "@rolldown/binding-darwin-arm64 explicit devDep required — npm optional deps bug causes native binding to not install on darwin-arm64"
  - "proxy redirect status is 307 not 302 in Next.js 16 — test assertion relaxed to [302, 307]"
  - "passWithNoTests: true added to vitest config — vitest exits code 1 when no test files found without this flag"
metrics:
  duration: "~7 minutes"
  completed_date: "2026-05-02"
  tasks_completed: 3
  files_created: 15
  files_modified: 2
---

# Phase 03 Plan 01: Test Infrastructure and Proxy Fix Summary

Vitest test runner installed, proxy matcher patched to bypass /api/cron/*, and full test fixture/helper library created for Phase 3 automated verification.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install Vitest + add npm scripts | dde6f9c | vitest.config.mts, package.json |
| 2 | Fix proxy matcher + Playwright test | 1811916 | src/proxy.ts, tests/integration/data/proxy-cron-bypass.spec.ts, src/app/api/cron/probe/route.ts |
| 3 | Fixtures, mock-fetch, Supabase helper | dd2e55a | 9 fixture files, tests/helpers/mock-fetch.ts, tests/helpers/supabase-test.ts, tests/unit/mock-fetch.test.ts |

## Vitest Install Command

```bash
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths --legacy-peer-deps
```

The `--legacy-peer-deps` flag was required for React 19.2.x peer-dep compatibility (established Phase 2 pattern).

Additional fix required: explicit install of `@rolldown/binding-darwin-arm64` as a devDependency due to npm optional-deps bug on darwin-arm64 machines.

Vitest 4.x was not viable — it requires rolldown which requires node >=20.19.0, but this machine runs 20.16.0. Downgraded to vitest@^2.1.9.

The config file uses `.mts` extension (`vitest.config.mts`) because `vite-tsconfig-paths` v6 is ESM-only and vitest v2 cannot load it via CJS require when using a `.ts` extension.

## Final src/proxy.ts Matcher

```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

`api/cron` is inserted in alphabetical order after `favicon.ico`. Any path under `/api/cron/*` skips the proxy entirely.

## Fixture Directory Tree

```
tests/fixtures/
├── eodhd/
│   ├── spy-eod.json           (10 daily rows, 2024-01-02..2024-01-15, close ~470-480)
│   ├── spy-dividends.json     (4 quarterly dividends 2023 Q1-Q4)
│   ├── chdvd-eod.json         (10 daily rows, 2024-01-02..2024-01-15, CHF ~85-90)
│   ├── chdvd-dividends.json   (1 annual CHF dividend, 2023)
│   ├── bulk-us-sample.json    (3 rows: SPY/AGG/VTI for 2026-05-01)
│   └── search-apple.json      (2 search results: AAPL.US, AAPL.LSE)
├── frankfurter/
│   └── chf-rates-sample.ndjson  (5 lines spanning 1999-2026)
└── openfigi/
    └── chdvd-isin.json          (CHDVD FIGI response)
```

## SUPABASE_SERVICE_ROLE_KEY in .env.local

Not added by this plan. `tests/helpers/supabase-test.ts` references `SUPABASE_SERVICE_ROLE_KEY` as optional — falls back to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` if not set. The service role key is required for production-level test DB cleanup (bypasses RLS). Adding it to `.env.local` is a local-only manual step for the developer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] rolldown native binding missing on darwin-arm64**
- **Found during:** Task 1 verification (`npm run test:unit`)
- **Issue:** npm optional deps bug — `@rolldown/binding-darwin-arm64` not installed automatically
- **Fix:** Explicit `npm install @rolldown/binding-darwin-arm64` and added to devDependencies
- **Files modified:** package.json, package-lock.json
- **Commit:** dde6f9c (included in Task 1 commit)

**2. [Rule 3 - Blocking] vitest v4 incompatible with node 20.16.0**
- **Found during:** Task 1 — startup error `ERR_REQUIRE_ESM` / `Cannot find native binding`
- **Issue:** vitest@^4 depends on rolldown@1.0.0-rc which requires node >=20.19.0 (running 20.16.0)
- **Fix:** Downgraded to `vitest@^2.1.9` which is compatible with node 20.16.0
- **Files modified:** package.json, package-lock.json
- **Commit:** dde6f9c

**3. [Rule 3 - Blocking] vite-tsconfig-paths v6 is ESM-only, vitest CJS config loading fails**
- **Found during:** Task 1 verification after vitest v2 install
- **Issue:** `vitest.config.ts` loaded as CJS; `vite-tsconfig-paths` v6 only exports ESM
- **Fix:** Renamed config to `vitest.config.mts` — forces ESM module loading
- **Files modified:** vitest.config.mts (renamed from vitest.config.ts)
- **Commit:** dde6f9c

**4. [Rule 1 - Bug] Next.js excludes underscore-prefixed folders from routing**
- **Found during:** Task 2 verification (probe route returned 404)
- **Issue:** `src/app/api/cron/_probe/` — Next.js 16 treats `_` prefix as private folder (excluded from routing). The plan suggested `_probe` as a naming convention but this breaks the route entirely.
- **Fix:** Renamed to `src/app/api/cron/probe/route.ts`. Updated integration test to use `/api/cron/probe`. Updated test comment to explain the rename.
- **Files modified:** src/app/api/cron/probe/route.ts, tests/integration/data/proxy-cron-bypass.spec.ts
- **Commit:** 1811916

**5. [Rule 1 - Bug] Next.js 16 proxy redirects use HTTP 307, not 302**
- **Found during:** Task 2 Playwright test failure (`Expected: 302, Received: 307`)
- **Issue:** `NextResponse.redirect()` in Next.js 16 issues 307 Temporary Redirect, not 302
- **Fix:** Updated test assertion from `toBe(302)` to `toContain([302, 307])` — accommodates both HTTP semantics
- **Files modified:** tests/integration/data/proxy-cron-bypass.spec.ts
- **Commit:** 1811916

**6. [Rule 2 - Missing] vitest exits code 1 with no test files**
- **Found during:** Task 1 first run
- **Issue:** `vitest run` exits with code 1 when no test files match — not acceptable for `npm run test:unit` used by CI before any tests are written
- **Fix:** Added `passWithNoTests: true` to vitest config
- **Files modified:** vitest.config.mts
- **Commit:** dde6f9c

## Self-Check: PASSED

All key files confirmed on disk. All 3 task commits confirmed in git history.

| Check | Result |
|-------|--------|
| vitest.config.mts | FOUND |
| src/proxy.ts | FOUND |
| src/app/api/cron/probe/route.ts | FOUND |
| tests/integration/data/proxy-cron-bypass.spec.ts | FOUND |
| tests/helpers/mock-fetch.ts | FOUND |
| tests/helpers/supabase-test.ts | FOUND |
| tests/fixtures/eodhd/spy-eod.json | FOUND |
| tests/fixtures/frankfurter/chf-rates-sample.ndjson | FOUND |
| tests/fixtures/openfigi/chdvd-isin.json | FOUND |
| tests/unit/mock-fetch.test.ts | FOUND |
| commit dde6f9c (vitest install) | FOUND |
| commit 1811916 (proxy fix) | FOUND |
| commit dd2e55a (fixtures+helpers) | FOUND |
