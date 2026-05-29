# Phase 5: Backtesting Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 05-backtesting-engine
**Areas discussed:** End-to-end flow, Compute location, Charting library, Backtest run UX, Simulation conventions, Metrics conventions, Benchmark catalog

---

## End-to-end flow (user-requested kickoff: "the complete end-to-end workflow or user story")

Proposed flow as plain text first (single-page setup bar + results, deterministic engine, session-only by default), then confirmed with three questions.

### Flow shape

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, this is the flow | Lock the user story as sketched. | ✓ |
| Reshape it | Something fundamental is off. | |

### Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Session-only + URL params | No DB writes; deterministic + shareable. | |
| Persisted run history | New `backtest_runs` table; user can revisit prior runs. | ✓ |
| Persist inputs only, recompute results | Save named param sets; recompute on view. | |

**User's choice:** Persisted run history.
**Notes:** Pushed the engine into the "save everything" model. Triggers new schema (D-10) + cache-invalidation policy (D-09).

### Compare scope

| Option | Description | Selected |
|--------|-------------|----------|
| Portfolio vs single benchmark only | BACK-07 literal scope. | ✓ |
| Portfolio + multiple benchmarks | N benchmarks overlaid. | |
| Pull Phase 7 multi-portfolio overlay into Phase 5 | Scope creep — pushed back. | |

**User's choice:** Single benchmark only — keeps Phase 7 scope intact.

---

## Compute location

### Where the simulation runs

| Option | Description | Selected |
|--------|-------------|----------|
| Browser Web Worker | Per PROJECT.md; server prepares data, worker simulates. | ✓ |
| Server-side | Sim on Vercel function; full roundtrip per toggle. | |
| Hybrid (server computes, persists, returns) | Combines compute + persistence on server. | |

### Run cache invalidation

| Option | Description | Selected |
|--------|-------------|----------|
| Stamp prices_version, stale-on-view recompute | Per-run version; user-driven rerun. | ✓ |
| Immutable runs | Frozen snapshots; never invalidate. | |
| Auto-recompute every run nightly | Cron walks all runs. | |

### Data API shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single batch endpoint per run | One JSON payload: instruments + prices + dividends + FX + SNB. | ✓ |
| Server Action streaming per-instrument | Sequential pulls; partial recoverability. | |
| Pre-merged daily-grid endpoint | Server does alignment; worker only does sim math. | |

### When the run row is written

| Option | Description | Selected |
|--------|-------------|----------|
| On successful first render, with results | Client POSTs full result after worker completes. | ✓ |
| Only on explicit "Save run" click | User opts in to persist. | |
| Save inputs immediately, results lazily | Two-phase write with status field. | |

---

## Charting library

First round (general libs) — user rejected the framing and asked for "something perfect for financial time series plotting." Re-scoped to finance-native options.

### Finance-native library shortlist

| Option | Description | Selected |
|--------|-------------|----------|
| TradingView Lightweight Charts | Apache 2.0, canvas-based, finance-native (line/area/histogram/candlestick). | ✓ |
| Apache ECharts | Broad enterprise lib; handles all chart types including heatmap. ~330KB. | |
| Lightweight Charts + Recharts hybrid | Lightweight for curve + Recharts for bars/matrix. | |
| Visx | Low-level D3 primitives; total visual control; most code. | |

**User's choice:** TradingView Lightweight Charts.
**Notes:** Equity curve (Line/Area), annual bars (Histogram series), benchmark overlay (additional Line). Phase 6 fan bands also fit. Phase 7 correlation matrix charting decision deferred.

---

## Backtest run UX

### Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Top setup bar, results below | Compact horizontal setup + full-width results. | ✓ |
| Left sidebar setup, results on the right | Workbench feel; loses canvas width. | |
| Stepwise: setup page → results page | Separate routes; loses tweak-and-rerun feel. | |

### Toggle behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto re-run immediately | Toggle flips → worker recomputes → chart re-renders. | ✓ |
| Dirty state + 'Re-run' button | User commits explicitly. | |
| Auto-rerun engine toggles, explicit for portfolio/date-range | Split behavior. | |

### Run history surface

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible sidebar/drawer on the backtest page | Lives where the work happens; no new route. | ✓ |
| Separate /dashboard/backtest/history page | Dedicated page; one nav hop away. | |
| Inline on portfolio detail/edit page | Tight portfolio↔run coupling; less discoverable. | |

---

## Simulation conventions

### Date grid

| Option | Description | Selected |
|--------|-------------|----------|
| Union of all instruments' trading days | Max fidelity; forward-fill missing instruments. | ✓ |
| Intersection of all instruments' trading days | Cleanest but discards days; underestimates vol. | |
| Base currency (CHF) trading calendar | Predictable but biases to CH calendar. | |

### Missing-data policy

| Option | Description | Selected |
|--------|-------------|----------|
| Forward-fill last close | Standard convention; surface fill count in footer. | ✓ |
| Interpolate linearly | Invents data — conflicts with PROJECT.md. | |
| Fail the backtest on any gap | Honest but blocks legitimate runs. | |
| Fail if gap > N days, fill otherwise | Threshold-based fallback. | |

### DRIP timing

| Option | Description | Selected |
|--------|-------------|----------|
| Reinvest on ex-date into the paying instrument at that day's close | Simple, deterministic, no settlement lag. | ✓ |
| Reinvest on payment date | More realistic; pay date not in schema. | |
| Reinvest proportionally into portfolio at next rebalance | Cleaner with rebalancing; adds cash sleeve. | |

### Rebalance mechanic

| Option | Description | Selected |
|--------|-------------|----------|
| First trading day on/after the calendar boundary, at that day's close | Deterministic; matches real-world practice. | ✓ |
| Last trading day on/before the calendar boundary | Functionally similar; off by 1-2 days. | |
| Calendar-exact with forward-fill if non-trading | Mixes synthetic prices into a critical action. | |

---

## Metrics conventions

### Risk-free rate for Sharpe

| Option | Description | Selected |
|--------|-------------|----------|
| Assume 0% | Simple; no extra data dependency. | |
| SNB CHF policy rate (point-in-time) | Most theoretically correct for CHF investor; new data sourcing required. | ✓ |
| User-configurable, default 0% | UI input; marginal v1 value. | |

**Notes:** Adds a new in-phase task — source SNB CHF policy rate history from data.snb.ch. Researcher must verify endpoint + series ID; planner specifies storage (new table vs JSONB column on `fx_rates`).

### Annualization basis

| Option | Description | Selected |
|--------|-------------|----------|
| √252 (trading days) | Standard finance convention; matches Bloomberg / Morningstar. | ✓ |
| √365 (calendar days) | Wrong for daily-sampled trading-day returns. | |
| Empirical from date grid | More honest; less comparable. | |

### Max Drawdown display

| Option | Description | Selected |
|--------|-------------|----------|
| Percentage + peak/trough dates in tooltip | Number prominent, dates on hover. | ✓ |
| Percentage only | Cleanest; loses context. | |
| Percentage + on-chart shaded region | More informative; defer to polish. | |

### CAGR year count

| Option | Description | Selected |
|--------|-------------|----------|
| Actual days / 365.25 | Industry standard; handles leap years. | ✓ |
| Actual days / 365 | Negligibly different; less standard. | |
| Trading days / 252 | Aligns with vol/Sharpe basis; less standard for CAGR. | |

---

## Benchmark catalog (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| MSCI World (URTH.US / SWDA.L) | ROADMAP example benchmark. | ✓ |
| MSCI ACWI All Country World (ACWI.US / SSAC.SW) | Developed + emerging; CHF-listed variant available. | ✓ |
| S&P 500 (SPY.US / VOO.US) | US large-cap; already pre-seeded. | ✓ |
| Swiss Market Index (CSSMI.SW) | CHF investor home-market reference. | ✓ |

**User's choice:** All four. All must be pre-seeded in `instruments` and pre-cached.

---

## Claude's Discretion

- Exact `backtest_runs` schema (column shapes, indexes, JSONB vs separate cols for series data).
- SNB rate storage form (new `snb_rates` table vs JSONB column on `fx_rates`).
- Web Worker bundle wiring (raw `new Worker` vs Comlink wrapper).
- Lightweight Charts React wrapper choice (thin custom wrapper vs OSS).
- Run history retention (start with keep-all).
- `inputs_hash` function (SHA-256 of canonical JSON).
- Sticky-header behavior of setup bar on scroll.
- Run drawer position (fixed left rail vs Sheet/modal).
- Engine error rendering (extend `DataError` union vs sibling `BacktestError` union).
- Visual polish — deferred per user's standing preference (memory: visual design later by Claude design pass).

## Deferred Ideas

- Multi-portfolio overlay (Phase 7 / COMP-01).
- Correlation matrix (Phase 7 / COMP-03).
- Side-by-side comparison table (Phase 7 / COMP-02).
- Phase 7 correlation-matrix charting library decision.
- Monte Carlo / projection scenarios (Phase 6).
- Brush-to-zoom on equity curve.
- On-chart shaded MDD region.
- Click-to-pin event markers.
- User-configurable risk-free rate input.
- Transaction costs / taxes / bid-ask spreads.
- CSV / PNG export of equity curve.
- LRU cap on saved runs per user.
- Auto-recompute all runs nightly (explicitly rejected — stale-on-view is the policy).
- Settlement-date (T+2) DRIP timing.
- Multiple benchmarks simultaneously on a single chart.
