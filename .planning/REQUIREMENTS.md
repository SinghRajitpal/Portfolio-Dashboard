# Requirements: PortfolioForge

**Defined:** 2026-04-04
**Core Value:** Before you invest real money, you can see — with real historical data, in your own currency — exactly what would have happened and what might happen next.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: User can sign up with email and password
- [x] **AUTH-02**: User can sign in and session persists across browser refresh
- [x] **AUTH-03**: User can sign out from any page
- [x] **AUTH-04**: User data is isolated via row-level security (RLS)

### App Shell & Design System

- [x] **UI-01**: Application has a persistent top navigation bar with links to all major sections and an account menu
- [x] **UI-02**: Application has a configured visual theme (color palette, typography, spacing) applied uniformly via shadcn/ui
- [x] **UI-03**: Dashboard page has a structured layout with regions for portfolio summary, primary chart area, and metrics strip
- [x] **UI-04**: Layout is responsive — top nav collapses to a hamburger menu on mobile and content reflows at tablet and phone widths
- [x] **UI-05**: Base shadcn/ui components (Button, Card, Dialog, Table, Input, Select) are configured and render correctly

### Portfolio Builder

- [ ] **PORT-01**: User can create, edit, and delete named portfolios
- [ ] **PORT-02**: User can search and add instruments by ticker or name
- [x] **PORT-03**: User can set percentage weights that validate to 100%
- [x] **PORT-04**: User can set total investment amount per portfolio
- [x] **PORT-05**: User can see weighted expense ratio for their portfolio
- [x] **PORT-06**: User can see weighted dividend yield and estimated annual income
- [ ] **PORT-07**: User can create a portfolio from a template (e.g., "Classic 60/40", "All-World")
- [x] **PORT-08**: User can import portfolio allocations from CSV

### Market Data & Instruments

- [x] **DATA-01**: System fetches and caches historical daily prices from EODHD
- [x] **DATA-02**: System fetches and caches historical FX rates (USD/CHF, EUR/CHF, GBP/CHF)
- [x] **DATA-03**: System supports US-listed ETFs, Swiss/European ETFs, individual stocks, commodities, and futures
- [x] **DATA-04**: System stores instrument metadata (name, type, expense ratio, dividend yield, currency)
- [x] **DATA-05**: User can search instruments by ISIN via OpenFIGI resolution

### Backtesting

- [ ] **BACK-01**: User can select a portfolio and historical time period to run a backtest
- [ ] **BACK-02**: Backtest converts all prices to CHF using point-in-time historical FX rates
- [ ] **BACK-03**: Backtest supports dividend reinvestment (DRIP) toggle
- [ ] **BACK-04**: Backtest supports periodic rebalancing (annual, semi-annual, quarterly)
- [ ] **BACK-05**: Backtest displays equity curve chart over the selected period
- [ ] **BACK-06**: Backtest calculates total return, CAGR, max drawdown, Sharpe ratio, and volatility
- [ ] **BACK-07**: User can compare backtest against a benchmark (e.g., MSCI World)
- [ ] **BACK-08**: Backtest displays annual return bars

### Projections

- [ ] **PROJ-01**: User can project portfolio forward under 3 scenarios (conservative/expected/optimistic)
- [ ] **PROJ-02**: User can model monthly contributions in projections
- [ ] **PROJ-03**: User can run Monte Carlo simulation showing probability-weighted outcomes
- [ ] **PROJ-04**: User can toggle inflation adjustment to see real purchasing power

### Portfolio Comparison

- [ ] **COMP-01**: User can overlay multiple portfolios on a single performance chart
- [ ] **COMP-02**: User can compare risk-return profiles (Sharpe, drawdown, dividend income)
- [ ] **COMP-03**: User can view correlation matrix between portfolios

### ETF Metadata

- [ ] **META-01**: User can view basic ETF metadata (name, expense ratio, dividend yield, currency)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Authentication

- **AUTH-05**: User can sign in with Google or GitHub OAuth

### ETF Drill-Down

- **DRILL-01**: User can view ETF underlying holdings list
- **DRILL-02**: User can view ETF sector breakdown
- **DRILL-03**: User can view ETF geographic exposure

### Advanced Analytics

- **ADV-01**: Backtest calculates Sortino ratio
- **ADV-02**: Backtest displays rolling returns over configurable window
- **ADV-03**: Backtest models transaction costs
- **ADV-04**: Backtest models Swiss dividend withholding tax drag

## Out of Scope

| Feature | Reason |
|---------|--------|
| Robo-advisory / recommendations | Tool, not advisor — no "you should do X" |
| Real-time trading / order execution | Analysis tool, not brokerage |
| Broker account sync | Adds complexity, dependency on third-party APIs |
| Mobile native app | Web-first, responsive design covers mobile access |
| Multi-user collaboration | Personal tool, single-user focus for v1 |
| Day-trading features | Long-term investing focus, not speculation |
| AI-generated narrative / insights | Undermines "tool, not advisor" positioning |
| Real-time streaming prices | Historical analysis tool; daily close prices sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| UI-01 | Phase 2 | Complete |
| UI-02 | Phase 2 | Complete |
| UI-03 | Phase 2 | Complete |
| UI-04 | Phase 2 | Complete |
| UI-05 | Phase 2 | Complete |
| DATA-01 | Phase 3 | Complete |
| DATA-02 | Phase 3 | Complete |
| DATA-03 | Phase 3 | Complete |
| DATA-04 | Phase 3 | Complete |
| DATA-05 | Phase 3 | Complete |
| PORT-01 | Phase 4 | Pending |
| PORT-02 | Phase 4 | Pending |
| PORT-03 | Phase 4 | Complete |
| PORT-04 | Phase 4 | Complete |
| PORT-05 | Phase 4 | Complete |
| PORT-06 | Phase 4 | Complete |
| PORT-07 | Phase 4 | Pending |
| PORT-08 | Phase 4 | Complete |
| META-01 | Phase 4 | Pending |
| BACK-01 | Phase 5 | Pending |
| BACK-02 | Phase 5 | Pending |
| BACK-03 | Phase 5 | Pending |
| BACK-04 | Phase 5 | Pending |
| BACK-05 | Phase 5 | Pending |
| BACK-06 | Phase 5 | Pending |
| BACK-07 | Phase 5 | Pending |
| BACK-08 | Phase 5 | Pending |
| PROJ-01 | Phase 6 | Pending |
| PROJ-02 | Phase 6 | Pending |
| PROJ-03 | Phase 6 | Pending |
| PROJ-04 | Phase 6 | Pending |
| COMP-01 | Phase 7 | Pending |
| COMP-02 | Phase 7 | Pending |
| COMP-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 — Phase 2 (App Shell & Design System) inserted; UI-01 through UI-05 added; former phases 2-6 renumbered to 3-7*
*Updated: 2026-04-04 — UI-01 corrected from "persistent sidebar" to "persistent top navigation bar" (locked CONTEXT.md decision); UI-04 updated to match top nav collapse behaviour*
