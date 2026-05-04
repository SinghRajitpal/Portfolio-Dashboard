# Phase 4: Portfolio Builder - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

User-facing UI to create, edit, save, and delete named portfolios. Users add instruments via the Phase 3 search API, set percentage weights that validate to exactly 100%, set an investment amount in CHF, and see live weighted expense ratio, weighted dividend yield, and estimated annual dividend income. Users can start a new portfolio blank, from a built-in template, or from a CSV import. Portfolio data persists to the existing `portfolios` and `portfolio_instruments` tables (schema already exists from Phase 1, RLS already in place). Backtests, projections, and comparison are out of scope — those are Phases 5–7.

</domain>

<decisions>
## Implementation Decisions

### Portfolios list page (`/dashboard/portfolios`)
- Borderless rows, whitespace-separated — no shadows, no outlines (matches Phase 2 Swiss-minimalist card pattern)
- Each row shows: portfolio name, instrument count, weighted TER, weighted dividend yield, last-updated timestamp
- Clicking a row opens the full-page builder in edit mode at `/dashboard/portfolios/[id]/edit`
- Single primary CTA top-right: Swiss-red "New portfolio" button with a dropdown menu offering: **Blank**, **From template**, **Import CSV**
- Empty state: centered message + the same single "New portfolio" CTA (no triple-CTA layout)

### Builder layout
- Full-page builder at `/dashboard/portfolios/new` (create) and `/dashboard/portfolios/[id]/edit` (edit) — same component, route differs
- Single scrollable page composition (top → bottom):
  1. Portfolio name input + investment amount input
  2. Sticky weighted-metrics strip (TER / yield / est. annual income)
  3. Instrument list (rows: ticker, name, weight input, remove button) with running total badge
  4. Inline combobox below the list for adding instruments
- Same layout for create and edit; edit mode pre-fills fields from the existing row
- Save button bottom-right, primary Swiss-red. Cancel/Back returns to the list page

### Instrument search & adding
- Inline combobox below the instrument list — type-as-you-search (ticker, name, or ISIN auto-detected)
- Backed by `POST /api/instruments/search` (Phase 3). No new search endpoint
- Component: shadcn Popover + Command (Combobox) — these are not yet installed; planner adds them
- Render the typed Phase 3 errors per `kind`: `not_found` → "No matches" inline; `rate_limit` → toast/banner with retry-after; `transient` → "Search temporarily unavailable, try again"; `invalid_input` → inline "Invalid input"

### Multi-venue disambiguation
- Phase 3 returns all matches across exchanges; Phase 4 must let the user pick the venue explicitly
- Pattern: one row per **logical instrument** in the dropdown (grouped/expandable). Expanding reveals the per-venue listings (exchange + currency + ticker suffix, e.g., `.SW`, `.DE`, `.L`)
- User clicks a specific listing to add it. No auto-pick. Honors Phase 3's "don't pick on the user's behalf" decision
- Implementation note for planner: Phase 3 already returns all matches with exchange/currency/listing-date metadata — no upstream changes needed

### Weight input & validation
- Numeric inputs per instrument row, range 0–100, step 0.5 (or 1 — Claude's discretion)
- Persistent total badge (e.g., "Σ 87.5%") next to the running list — neutral when 100%, warning color when ≠100%, Swiss-red error state with tooltip when invalid
- "Normalize to 100%" button rescales all weights proportionally (rounded to 2 decimals to fit `NUMERIC(5,2)` schema constraint)
- Save button disabled when total ≠ 100% (within ±0.01% floating-point tolerance). No silent auto-normalize on save
- Removing a row leaves the gap — no auto-redistribute. User runs "Normalize to 100%" or adjusts manually
- Honors PORT-03 ("validates to 100%") literally — explicit, predictable, fits "precision instrument" positioning

### Investment amount (PORT-04)
- **Required** field; builder pre-fills `CHF 10'000` as the default placeholder when creating a blank portfolio
- Templates and CSV imports also default to `CHF 10'000` if no amount is supplied
- Always CHF (project is CHF-native per PROJECT.md). No currency selector
- Display formatting: Swiss apostrophe thousands separator preferred (`CHF 10'000`); fall back to comma (`CHF 10,000`) if Intl/locale handling adds disproportionate complexity — Claude's discretion
- Stored in the existing `portfolios.investment_amount NUMERIC(15,2)` column

### Live weighted metrics (PORT-05, PORT-06)
- Sticky 3-stat strip near the top of the builder, updates live as weights / instruments / amount change
- Stats: **Weighted TER** (e.g., `0.18%`), **Weighted Yield** (e.g., `1.92%`), **Est. Annual Income** (e.g., `CHF 192`)
- Formulas:
  - Weighted TER = Σ (weight_i × expense_ratio_i) / 100
  - Weighted Yield = Σ (weight_i × dividend_yield_i) / 100
  - Est. Annual Income = investment_amount × Weighted Yield / 100
- Tooltip on each stat explains the formula in plain language
- Mirrors Phase 2 dashboard "metrics strip" visual pattern (small label on top, large number below)

### Missing-data handling for metrics
- Compute weighted metrics treating `null` `expense_ratio` or `dividend_yield` as `0%`
- When any instrument in the portfolio has missing data for a metric, show a small footnote under that metric: e.g., "Excludes 1 instrument with no expense-ratio data"
- Clicking/hovering the footnote highlights the affected rows in the instrument list
- Truthful, visible, doesn't block save

### Templates (PORT-07)
- Templates surfaced via the **"From template"** picker in the "New portfolio" dropdown — a Dialog listing each template with name, short description, and a composition preview
- Clicking a template opens the full-page builder pre-filled with name `"[Template name] (copy)"`, the template's instruments and weights, and the default `CHF 10'000` amount — **nothing is saved yet**. User edits/renames, then Saves
- After save, the new portfolio is fully owned by the user with no link back to the source template
- Templates stored as DB rows with `is_template = true`, owned by a system/seed user (or `user_id IS NULL` if simpler — Claude's discretion in planning, must respect existing RLS contract)
- `is_template = true` rows are excluded from the user's normal portfolio list query
- Initial template set (3 templates): **Classic 60/40**, **All-World**, **All-Weather (Ray Dalio)**
  - Tickers used should overlap with Phase 3's pre-seed list (~10–15 unique tickers covered)
  - Template-to-ticker mapping is Claude's discretion in planning (e.g., 60/40 = 60% VT + 40% AGG; All-World = 100% VT or VWCE.SW for CHF; All-Weather = 30 VTI / 40 TLT / 15 IEI / 7.5 GLD / 7.5 DJP)

### CSV import (PORT-08)
- Format: required columns `ticker`, `weight`. Optional `exchange` for explicit multi-venue disambiguation. Header row required (case-insensitive)
- Flow: upload (file picker) → parse → **preview & edit screen** → save
- Preview screen lists: matched instruments (resolved via Phase 3 search), unresolved tickers (with inline "Search/replace" affordance), all weights editable, sum-total badge
- Save validation identical to manual save: all instruments resolved + sum = 100%
- Investment amount defaults to `CHF 10'000` (user can change on the preview screen before saving)
- The preview screen is essentially the same builder UI in a "needs review" state — minimizes net-new components

### Persistence
- Use existing tables: `portfolios` (id, user_id, name, description, investment_amount, rebalance_frequency, is_template, timestamps) and `portfolio_instruments` (id, portfolio_id, instrument_id, weight, timestamps)
- `rebalance_frequency` is **not surfaced in the Phase 4 UI** — that's a Phase 5 (Backtest) concern; Phase 4 leaves the column at its DB default
- `description` field exists in schema but is **not** required — Claude's discretion whether to expose it as an optional textarea in v1 or defer
- Save = upsert pattern: insert or update `portfolios` row, then diff `portfolio_instruments` rows (insert new, update changed weights, delete removed). Wrap in a single transaction
- Delete portfolio = standard cascading delete (FK already configured in schema). Show a confirm dialog before delete

### Claude's Discretion
- Exact step value for weight inputs (0.5 vs 1)
- Whether to install/use the shadcn `Form` component on top of `react-hook-form` + `zod`, or hand-roll form state — pick whichever stays smallest
- Combobox keyboard interaction details (arrow keys, enter, escape) beyond shadcn defaults
- Sticky-strip exact positioning (top of viewport vs bottom) and whether it stays sticky on mobile
- Whether to expose the `description` field as an optional textarea in v1 or defer it
- Toast/notification library choice (`sonner` is the shadcn default — fine to install)
- Mobile breakpoint behavior for the builder (single column stack is the obvious answer)
- Save indicator pattern (toast on success vs inline checkmark vs route change to detail view)
- Template storage detail (`user_id IS NULL` vs dedicated system user) so long as RLS still allows authenticated users to **read** templates and forbids modifying them
- Where to put the "Estimate based on..." disclaimer for dividend income (tooltip vs footnote)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/{button,card,dialog,input,label,select,table,tabs,dropdown-menu,skeleton}.tsx` — shadcn primitives ready
- `src/app/dashboard/portfolios/page.tsx` — placeholder ("Coming soon") to be replaced
- `src/app/dashboard/layout.tsx` — top nav already routes "Portfolios" link to `/dashboard/portfolios` (Phase 2)
- `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` — server- and browser-side Supabase clients
- `src/lib/utils.ts` — `cn()` className helper
- `src/app/api/instruments/search/route.ts` — Phase 3 search endpoint (typed input/output, error contract)
- `src/lib/data/errors.ts` — typed Phase 3 error union; reused by Phase 4 for error rendering

### Established Patterns
- Swiss-minimalist visual system locked in Phase 2: borderless cards, whitespace separation, Swiss red (#E3000F) accent for CTAs/active states, Geist font, `@custom-variant dark` for dark mode
- shadcn/ui base-nova style with CSS variable theming in `src/app/globals.css`
- Next.js 16 App Router with `proxy.ts` for auth session enforcement (no `middleware.ts`)
- Server Components by default; client components marked with `'use client'` for interactive UI
- Supabase Supavisor pooler port 6543 for all connections
- Migrations in `supabase/migrations/`, version-controlled, leading-number naming (`00001_…`, `00002_…`)
- Playwright integration tests in `tests/`

### Integration Points
- Replace `src/app/dashboard/portfolios/page.tsx` (the list page)
- Add `src/app/dashboard/portfolios/new/page.tsx` (blank create flow)
- Add `src/app/dashboard/portfolios/[id]/edit/page.tsx` (edit flow)
- Add Server Actions or API routes under `src/app/dashboard/portfolios/_actions.ts` (or `src/app/api/portfolios/...`) for create / update / delete — planner picks the pattern that's most natural for Next.js 16 App Router
- New shared builder component (e.g., `src/components/portfolio/PortfolioBuilder.tsx`) consumed by `new`, `[id]/edit`, and the CSV preview screen
- New components: `InstrumentCombobox`, `WeightInput`, `WeightedMetricsStrip`, `TemplatePickerDialog`, `CsvImportDialog`
- New shadcn components to install: `Popover`, `Command` (for Combobox), `Sheet` (likely unused given full-page choice — only install if needed), `Sonner` (toasts)
- Possibly add `react-hook-form` + `zod` if the planner picks that stack for form validation
- Templates: new SQL seed migration (e.g., `supabase/migrations/00003_portfolio_templates.sql`) to insert template rows + their `portfolio_instruments` rows. Pre-seed tickers may need to be present in `instruments` first — coordinate with Phase 3 seed list
- CSV parsing: planner picks a small dependency (e.g., `papaparse`) or hand-rolls a tiny parser

</code_context>

<specifics>
## Specific Ideas

- "Workbench" / "precision instrument" feel — keyboard-fast, dense, exact. No animations beyond Phase 2's opacity-pulse skeletons
- Honor Phase 3's "don't pick on the user's behalf" stance: every multi-venue match is shown explicitly; the user owns the venue choice
- Save button stays disabled until weights sum to exactly 100% — no silent normalization, no draft state. The "Normalize to 100%" button is the explicit, user-driven shortcut
- Weighted metrics live and visible while editing — the user should see their portfolio change shape in real time
- CHF formatting prefers Swiss apostrophe (`10'000`) — falls back to comma if locale handling adds significant complexity
- Templates create unsaved copies in the builder. The user is always in full control of what gets persisted
- v1 ships 3 templates (60/40, All-World, All-Weather) — small enough to maintain by hand, diverse enough to demo the feature

</specifics>

<deferred>
## Deferred Ideas

- Sortable/filterable portfolios list (sort by name / TER / last-updated) — list will be small in v1; revisit when users have many portfolios
- Portfolio duplication / "Save as copy" — useful but not required for v1
- Drag-to-reorder instrument rows — visual reordering doesn't change semantics; defer
- Per-row inline notes/tags on instruments — Phase 4 has no need; future phase if at all
- Public/shareable portfolio links — out of v1 scope (single-user tool)
- "Recently viewed instruments" or autocomplete history in the search combobox — wait until search usage proves the need
- Instrument-level drill-down (sector, geography, holdings) — explicitly deferred to v2 (DRILL-01/02/03 in REQUIREMENTS.md)
- Rebalancing UI / settings — Phase 5 (Backtest) territory
- CSV export of a portfolio — useful inverse of import, but not required by PORT-08; revisit
- Multi-currency portfolios where the user picks a base currency — conflicts with PROJECT.md "CHF-native throughout"; out of scope

</deferred>

---

*Phase: 04-portfolio-builder*
*Context gathered: 2026-05-04*
