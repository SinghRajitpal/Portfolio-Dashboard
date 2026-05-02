---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Phase 3 context gathered
last_updated: "2026-05-02T20:28:22.425Z"
last_activity: "2026-04-04 — Completed 02-03: dashboard skeleton page and coming-soon placeholders"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 29
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04)

**Core value:** Before you invest real money, you can see — with real historical data, in your own currency — exactly what would have happened and what might happen next.
**Current focus:** Phase 3 — Market Data Pipeline

## Current Position

Phase: 2 of 7 complete (App Shell & Design System)
Plan: 3 of 3 in Phase 2 (Phase 2 complete)
Status: Phase 2 complete — ready for Phase 3 (Market Data Pipeline)
Last activity: 2026-04-04 — Completed 02-03: dashboard skeleton page and coming-soon placeholders

Progress: [███░░░░░░░] 29%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-foundation P01 | 5 | 2 tasks | 13 files |
| Phase 01-foundation P01 | 2min | 3 tasks | 13 files |
| Phase 01-foundation P01 | 15min | 3 tasks | 14 files |
| Phase 01-foundation P02 | 3min | 2 tasks | 11 files |
| Phase 02-app-shell-design-system P01 | 14min | 3 tasks | 10 files |
| Phase 02-app-shell-design-system P02 | 5min | 2 tasks | 3 files |
| Phase 02-app-shell-design-system P03 | 3min | 2 tasks | 8 files |

## Accumulated Context

### Decisions

- Data source: EODHD free tier (20 req/day) as primary for v1 — same architecture as paid plan, throttled. Aggressive Supabase caching makes this viable at personal scale. Upgrade to $19.99/mo paid only if rate budget becomes a real bottleneck.
- yahoo-finance2 dropped from the pipeline — single source of truth per ticker. EODHD-only, no fallback chain.
- FX rates: Frankfurter API (free, ECB-sourced, no key required)
- ISIN resolution: OpenFIGI (free, Bloomberg-backed)
- Computation: All backtest and Monte Carlo runs in browser Web Workers via comlink — never in Vercel serverless functions
- Stack: Next.js 16 + TypeScript + Supabase (Postgres + Auth) + Vercel
- Supabase connection: Always Supavisor pooler port 6543, never direct port 5432
- Charting: Recharts for dashboards, lightweight-charts for financial time-series
- UI component library: shadcn/ui configured in Phase 2 with project theme before any feature UI is built
- [Phase 01-foundation]: Supabase server.ts createClient is async — required by Next.js 15+ cookies() Promise API
- [Phase 01-foundation]: RLS uses (SELECT auth.uid()) subselect — caches per statement for performance vs raw auth.uid()
- [Phase 01-foundation]: Migration named 00001_initial_schema.sql (not timestamped) — deterministic ordering for Phase 1 bootstrap
- [Phase 01-foundation]: Task 3 automated parts (env files) were completed in Task 1; user handles Supabase cloud dashboard steps manually
- [Phase 01-foundation]: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY used (not ANON_KEY) — matches existing code in client.ts/server.ts
- [Phase 01-foundation]: .env.example tracked in git via !.env.example exception in .gitignore — enables developer onboarding
- [Phase 01-foundation]: Next.js 16 renames middleware.ts to proxy.ts — must use src/proxy.ts and export proxy() function, not middleware()
- [Phase 01-foundation]: base-ui Button does not support asChild prop — use buttonVariants() with <Link> for link-styled buttons
- [Phase 01-foundation P03]: Production URL is https://portfolioforge-green.vercel.app — all future phases deploy here
- [Phase 01-foundation P03]: buttonVariants() cannot be used in Next.js server components — inline styles instead
- [Phase 01-foundation P03]: Playwright uses chromium only (no firefox/webkit) for speed in local/CI runs
- [Phase 02-app-shell-design-system]: next-themes installed with --legacy-peer-deps for React 19.2.x compatibility
- [Phase 02-app-shell-design-system]: ThemeProvider uses attribute='class' to match existing @custom-variant dark declaration
- [Phase 02-app-shell-design-system]: sidebar-* CSS variables removed from globals.css as dead scaffold code
- [Phase 02-app-shell-design-system]: buttonVariants() applied directly to DropdownMenuTrigger — wrapping Button inside trigger creates nested buttons (invalid HTML); MenuPrimitive.Trigger renders its own button element
- [Phase 02-app-shell-design-system]: AccountMenu aria-label set to 'Your account' to avoid regex conflict with hamburger 'Open menu' in UI-04 Playwright test
- [Phase 02-app-shell-design-system]: Dashboard page simplified to pure Server Component by removing Supabase getUser() — auth enforced by middleware, skeleton layout has no user-specific data
- [Phase 02-app-shell-design-system]: SummaryCards use plain divs (not Card component) to enforce borderless whitespace-separated design matching Swiss minimalist aesthetic

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3: Validate UCITS ETF dividend schedule coverage in EODHD — irregular ex-dates for European ETFs may affect DRIP modeling accuracy
- Phase 6: Monte Carlo distribution choice (Gaussian vs. historical bootstrap vs. fat-tail) must be decided before Phase 6 planning
- Phase 6: Swiss CPI data source for inflation adjustment not yet confirmed — BFS API ergonomics unclear

## Session Continuity

Last session: 2026-05-02T20:28:22.418Z
Stopped at: Phase 3 context gathered
Resume file: .planning/phases/03-market-data-pipeline/03-CONTEXT.md
