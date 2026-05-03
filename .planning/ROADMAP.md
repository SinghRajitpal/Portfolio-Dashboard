# Roadmap: PortfolioForge

## Overview

PortfolioForge is built in seven phases that follow a strict dependency order: data integrity before computation, single-portfolio before comparison, engine before UI. Phase 1 lays the schema and auth foundation everything else sits on. Phase 2 establishes the application shell — the sidebar navigation, dashboard layout, design system, and visual identity — which all feature phases build their UI within. Phase 3 validates the market data pipeline — EODHD for prices and dividends, Frankfurter for FX rates, OpenFIGI for ISIN resolution — before any calculation code is written on top of it. Phase 4 delivers the portfolio builder so users can define portfolios that the backtest engine consumes. Phase 5 is the core value proposition: a look-ahead-bias-free backtest engine running in a browser Web Worker with CHF conversion, DRIP, rebalancing, and all key metrics. Phase 6 extends the engine with forward projections and Monte Carlo simulation. Phase 7 completes the v1 feature set with portfolio comparison and correlation analysis.

## Phases

- [x] **Phase 1: Foundation** - Supabase schema, auth flow, and project scaffolding
- [ ] **Phase 2: App Shell & Design System** - Application layout, navigation, dashboard skeleton, component library, and visual identity
- [x] **Phase 3: Market Data Pipeline** - EODHD integration, FX rates, ISIN resolution, and cache layer (completed 2026-05-03)
- [ ] **Phase 4: Portfolio Builder** - Portfolio CRUD, instrument search, weight validation, templates, and metadata display
- [ ] **Phase 5: Backtesting Engine** - Core simulation loop, CHF conversion, DRIP, rebalancing, metrics, and charts
- [ ] **Phase 6: Projections** - Scenario projections, Monte Carlo simulation, contribution modeling, and inflation adjustment
- [ ] **Phase 7: Portfolio Comparison** - Side-by-side overlay, risk-return comparison, and correlation matrix

## Phase Details

### Phase 1: Foundation
**Goal**: Users can securely sign in and out, and the project is deployed to Vercel with all database infrastructure in place
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User can sign up with email and password and receive a confirmation
  2. User can sign in and remain signed in across browser refresh and tab close
  3. User can sign out from any page in the application
  4. Supabase RLS policies are active — one user cannot access another user's portfolio rows
  5. The application is deployed and accessible at a Vercel URL
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Scaffold Next.js 16 + Supabase integration + full database schema with RLS
- [x] 01-02-PLAN.md — Auth UI (landing page, tabbed sign-in/sign-up, middleware, dashboard placeholder)
- [x] 01-03-PLAN.md — Playwright e2e tests + Vercel deployment + production verification

### Phase 2: App Shell & Design System
**Goal**: The signed-in application has a complete visual identity and navigable shell — top nav bar, dashboard layout, responsive grid, and component library — into which all feature phases drop their UI
**Depends on**: Phase 1
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Signed-in user sees a persistent top nav bar with navigation links to all major sections (Dashboard, Portfolios, Backtest, Projections, Compare) and an account menu
  2. The application has a consistent visual identity: Swiss minimalist color palette (Swiss red accent #E3000F), typography, and spacing applied uniformly across all pages via a configured theme
  3. The dashboard page has a clearly structured layout with placeholder regions for portfolio summary cards, a primary chart area, and a metrics strip — even before real data is wired
  4. The layout is responsive: nav collapses to a hamburger menu on mobile and the main content area reflows correctly at tablet and phone widths
  5. shadcn/ui component library is configured with the project theme, and base components (Button, Card, Dialog, Table, Input, Select) are imported and render correctly
**Plans**: 3 plans
Plans:
- [ ] 02-01-PLAN.md — Install next-themes + shadcn components + Swiss design tokens + ThemeProvider wiring
- [ ] 02-02-PLAN.md — Top nav component + account menu + dashboard layout shell (UI-01, UI-04)
- [ ] 02-03-PLAN.md — Dashboard skeleton page + coming-soon placeholder pages (UI-03)

### Phase 3: Market Data Pipeline
**Goal**: The system can fetch, validate, and cache historical prices, dividends, and FX rates from all required sources, ready for the backtest engine to consume
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. A request for a ticker's historical price series returns cached data from Supabase on subsequent calls (no repeat EODHD call)
  2. Historical CHF/USD, CHF/EUR, and CHF/GBP FX rates are available for any date back to 1999 from the Frankfurter cache
  3. An ISIN typed into instrument search resolves to the correct ticker via OpenFIGI and returns price data
  4. Instrument metadata (name, type, currency, expense ratio, dividend yield) is stored and retrievable for a given ticker
  5. A Swiss-listed UCITS ETF (e.g., CHDVD.SW) and a US ETF (e.g., SPY) both return complete price and dividend history
**Plans**: 10 plans (6 original + 4 gap closure for DATA-01)
Plans:
- [x] 03-01-test-infra-and-proxy-fix-PLAN.md — Wave 0 test infra (Vitest + fixtures + helpers) + src/proxy.ts cron-bypass fix
- [x] 03-02-errors-interface-migration-PLAN.md — DataError union, IMarketDataProvider interface, isin_lookups migration
- [x] 03-03-frankfurter-fx-PLAN.md — Frankfurter FX client + idempotent seed back to 1999 (DATA-02)
- [x] 03-04-eodhd-provider-and-cache-PLAN.md — EODHDProvider + cache-first getPricesForTicker (DATA-01, DATA-03, DATA-04) [SUPERSEDED for DATA-01 by Plans 07-10]
- [x] 03-05-search-route-and-openfigi-PLAN.md — POST /api/instruments/search + OpenFIGI ISIN cache (DATA-05)
- [x] 03-06-cron-seed-and-smoke-PLAN.md — Vercel Cron daily refresh + seed script + phase smoke test [smoke run deferred to Plan 10]
- [ ] 03-07-yahoo-provider-PLAN.md — Gap closure: YahooProvider implementing IMarketDataProvider + symbol mapper (.LSE→.L) [DATA-01]
- [ ] 03-08-stooq-importer-PLAN.md — Gap closure: Stooq CSV bulk historical importer + STOOQ_API_KEY user setup [DATA-01]
- [ ] 03-09-provider-swap-PLAN.md — Gap closure: swap default provider EODHD→Yahoo at 3 sites; IQQA.SW→SSAC.SW; cron supports LSE [DATA-01, DATA-03]
- [ ] 03-10-reseed-and-verify-PLAN.md — Gap closure: live re-seed + smoke test against prod DB + Vercel cron production verification [DATA-01, DATA-05]

### Phase 4: Portfolio Builder
**Goal**: Users can create, configure, and save named portfolios with validated instrument weights, and view their portfolio's weighted expense ratio and dividend income
**Depends on**: Phase 2, Phase 3
**Requirements**: PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, PORT-08, META-01
**Success Criteria** (what must be TRUE):
  1. User can create a named portfolio, add instruments by searching ticker or name, set percentage weights that must sum to 100%, and save it
  2. User can edit an existing portfolio (add/remove instruments, change weights) and delete a portfolio
  3. User can see the weighted total expense ratio (TER) and estimated annual dividend income for their portfolio
  4. User can start from a built-in template (e.g., "Classic 60/40", "All-World") that pre-fills instruments and weights
  5. User can import a portfolio allocation from a CSV file
**Plans**: TBD

### Phase 5: Backtesting Engine
**Goal**: Users can run a historical backtest on any saved portfolio and see a full equity curve, annual return bars, and core performance metrics — all in CHF
**Depends on**: Phase 4
**Requirements**: BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, BACK-08
**Success Criteria** (what must be TRUE):
  1. User can select a portfolio and a date range and run a backtest that shows a CHF equity curve from start to end of period
  2. All prices in the backtest are converted to CHF using point-in-time historical FX rates (not a spot rate or average)
  3. User can toggle dividend reinvestment (DRIP) on or off and see a different equity curve result
  4. User can select a rebalancing frequency (annual, semi-annual, quarterly) and the backtest applies it
  5. Backtest displays total return, CAGR, max drawdown, Sharpe ratio, and annualized volatility
  6. User can select a benchmark (e.g., MSCI World) and see its equity curve overlaid on the portfolio curve
**Plans**: TBD

### Phase 6: Projections
**Goal**: Users can project any portfolio forward under three scenarios and run a Monte Carlo simulation that shows probability-weighted outcome bands — with optional monthly contributions and inflation adjustment
**Depends on**: Phase 5
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Success Criteria** (what must be TRUE):
  1. User can view a projection chart showing three future equity curves labeled conservative, expected, and optimistic
  2. User can enter a monthly contribution amount and see it reflected in all three projection curves
  3. User can run a Monte Carlo simulation and see P10/P50/P90 outcome bands as a fan chart (not a single line)
  4. User can toggle inflation adjustment and see all projection values shift to show real purchasing power in CHF
**Plans**: TBD

### Phase 7: Portfolio Comparison
**Goal**: Users can compare two or more saved portfolios side-by-side on a single chart and across key risk-return metrics and a correlation matrix
**Depends on**: Phase 5
**Requirements**: COMP-01, COMP-02, COMP-03
**Success Criteria** (what must be TRUE):
  1. User can select two or more portfolios and see their backtest equity curves overlaid on a single chart over the same time period
  2. User can see a comparison table showing Sharpe ratio, max drawdown, and estimated dividend income side-by-side for each portfolio
  3. User can view a correlation matrix showing how each portfolio's returns correlate with each other
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-04-04 |
| 2. App Shell & Design System | 1/3 | In Progress|  |
| 3. Market Data Pipeline | 10/10 | Complete   | 2026-05-03 |
| 4. Portfolio Builder | 0/TBD | Not started | - |
| 5. Backtesting Engine | 0/TBD | Not started | - |
| 6. Projections | 0/TBD | Not started | - |
| 7. Portfolio Comparison | 0/TBD | Not started | - |
