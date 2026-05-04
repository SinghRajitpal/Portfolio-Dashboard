---
phase: 04-portfolio-builder
plan: 02
type: execute
wave: 2
depends_on: ["04-01"]
files_modified:
  - src/app/dashboard/portfolios/_schema.ts
  - src/lib/portfolio/compute-metrics.ts
  - src/lib/portfolio/normalize-weights.ts
  - src/lib/portfolio/chf-format.ts
  - src/lib/portfolio/parse-csv.ts
  - src/app/dashboard/portfolios/_schema.test.ts
  - src/lib/portfolio/compute-metrics.test.ts
  - src/lib/portfolio/normalize-weights.test.ts
  - src/lib/portfolio/chf-format.test.ts
  - src/lib/portfolio/parse-csv.test.ts
autonomous: true
requirements: [PORT-03, PORT-04, PORT-05, PORT-06, PORT-08]

must_haves:
  truths:
    - "PortfolioSchema rejects weights summing outside 100 ± 0.01"
    - "PortfolioSchema accepts and infers a typed PortfolioInput object"
    - "computeMetrics returns weighted TER, weighted yield, annual income, and missing-id lists"
    - "computeMetrics treats null expense_ratio/dividend_yield as 0 and surfaces missing IDs separately"
    - "normalizeTo100 produces an array whose sum is exactly 100.00 after 2dp rounding"
    - "fmtCHF uses Swiss apostrophe formatting via Intl.NumberFormat('de-CH')"
    - "parsePortfolioCsv parses ticker/weight rows with optional exchange and surfaces typed errors"
    - "All Wave 0 unit stubs are converted from it.todo to passing assertions"
  artifacts:
    - path: "src/app/dashboard/portfolios/_schema.ts"
      provides: "Shared Zod schema (client + server) for PortfolioInput and PortfolioItemInput"
      exports: ["PortfolioSchema", "PortfolioItemSchema", "PortfolioInput", "PortfolioItemInput"]
    - path: "src/lib/portfolio/compute-metrics.ts"
      provides: "Pure function: weighted TER + yield + annual income with null handling"
      exports: ["computeMetrics", "Metrics", "Item", "InstrumentMeta"]
    - path: "src/lib/portfolio/normalize-weights.ts"
      provides: "Pure function: rescale array of weights to sum exactly 100.00"
      exports: ["normalizeTo100"]
    - path: "src/lib/portfolio/chf-format.ts"
      provides: "Wrapper around Intl.NumberFormat('de-CH', {style:'currency', currency:'CHF'})"
      exports: ["fmtCHF"]
    - path: "src/lib/portfolio/parse-csv.ts"
      provides: "Wrapper around papaparse with Zod validation per row, returns {rows, errors}"
      exports: ["parsePortfolioCsv", "CsvRow", "CsvRowSchema"]
  key_links:
    - from: "src/app/dashboard/portfolios/_schema.ts"
      to: "PortfolioInput type"
      via: "z.infer<typeof PortfolioSchema>"
      pattern: "z\\.infer<typeof PortfolioSchema>"
    - from: "src/lib/portfolio/compute-metrics.ts"
      to: "expense_ratio NUMERIC(5,4) semantics"
      via: "weight (0-100) × expense_ratio (fraction) without double-multiplying"
      pattern: "it.weight / 100"
    - from: "src/lib/portfolio/parse-csv.ts"
      to: "papaparse + Zod"
      via: "Papa.parse(..., {header, skipEmptyLines, transformHeader}) + CsvRowSchema.safeParse"
      pattern: "Papa\\.parse"
---

<objective>
Implement the pure-function library and shared Zod schema that all Phase 4 UI and Server Actions consume. Zero Next.js, zero Supabase — just deterministic functions with vitest unit coverage.

Purpose: Single source of truth for validation (client RHF resolver + server action share `PortfolioSchema`). Pure functions are the algorithmic heart of Phase 4 and must be unit-tested before UI is built on top of them.
Output: 5 source files + 5 corresponding test files (converted from Wave 0 todos to passing assertions).
</objective>

<execution_context>
@/Users/singhs/.claude/get-shit-done/workflows/execute-plan.md
@/Users/singhs/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-portfolio-builder/04-CONTEXT.md
@.planning/phases/04-portfolio-builder/04-RESEARCH.md
@.planning/phases/04-portfolio-builder/04-01-wave0-scaffolds-PLAN.md
@CLAUDE.md
@AGENTS.md

<interfaces>
<!-- Existing types this plan composes against. -->

From src/lib/data/types.ts (Phase 3, do not modify):
```typescript
export type SearchResult = {
  ticker: string; exchange: string; name: string
  type: 'etf' | 'stock' | ...
  currency: string; isin: string | null
}
```

From supabase schema (00001):
- `portfolio_instruments.weight NUMERIC(5,2) CHECK (weight > 0 AND weight <= 100)` — store as percent decimal (e.g., `60.00`)
- `instruments.expense_ratio NUMERIC(5,4)` — store as fraction (e.g., `0.0007` for 0.07%)
- `instruments.dividend_yield NUMERIC(5,4)` — store as fraction (e.g., `0.0192` for 1.92%)
- `portfolios.investment_amount NUMERIC(15,2)` — CHF, decimal
</interfaces>

<contracts_to_export>
<!-- This plan creates these contracts; downstream plans (03, 04, 05, 06) consume them. -->

```typescript
// src/app/dashboard/portfolios/_schema.ts
export const PortfolioItemSchema: z.ZodObject<{...}>
export const PortfolioSchema: z.ZodType<PortfolioInput>
export type PortfolioItemInput = { instrument_id: string; ticker: string; name: string; weight: number }
export type PortfolioInput = {
  id?: string                         // present when editing
  name: string
  description?: string
  investment_amount: number
  items: PortfolioItemInput[]
}

// src/lib/portfolio/compute-metrics.ts
export type Item = { instrument_id: string; weight: number }
export type InstrumentMeta = { expense_ratio: number | null; dividend_yield: number | null }
export type Metrics = {
  ter: number; yield: number; annualIncome: number
  terMissingCount: number; yieldMissingCount: number
  terMissingIds: string[]; yieldMissingIds: string[]
}
export function computeMetrics(items: Item[], investmentAmount: number, meta: Map<string, InstrumentMeta>): Metrics

// src/lib/portfolio/normalize-weights.ts
export function normalizeTo100(weights: number[]): number[]

// src/lib/portfolio/chf-format.ts
export function fmtCHF(amount: number): string

// src/lib/portfolio/parse-csv.ts
export const CsvRowSchema: z.ZodSchema
export type CsvRow = { ticker: string; weight: number; exchange?: string }
export function parsePortfolioCsv(file: File): Promise<{ rows: CsvRow[]; errors: string[] }>
```
</contracts_to_export>

<critical_constraints>
- All 5 source files are framework-agnostic (no React, no Next.js, no Supabase). They run in vitest's node env.
- `PortfolioSchema.items` MUST use `superRefine` for the sum=100±0.01 check so downstream Zod errors include a per-issue path.
- `computeMetrics` MUST NOT round results — caller decides display rounding. (Rounding inside compute makes tests brittle and conceals drift.)
- `normalizeTo100` MUST round each element to 2dp AND apply drift correction so the final array sums to exactly 100.00 (matches NUMERIC(5,2)).
- `fmtCHF` MUST use `Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', minimumFractionDigits: 0, maximumFractionDigits: 2 })` per RESEARCH "Don't Hand-Roll" — no custom string manipulation.
- `parsePortfolioCsv` parses client-side (browser File API). Header transform = `h => h.toLowerCase().trim()`.
- Per CONTEXT "Weight input & validation": "Save button disabled when total ≠ 100% (within ±0.01% floating-point tolerance)". Tolerance is 0.01.
- Per CONTEXT "Missing-data handling": treat null as 0 in compute, return separate counts/IDs so UI can render the footnote.
- Tests MUST replace the `it.todo` stubs from Wave 0 with real assertions; ensure all stubs are converted (none remain as `todo`).
</critical_constraints>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement shared Zod schema + unit tests (PORT-03, PORT-04)</name>
  <files>src/app/dashboard/portfolios/_schema.ts, src/app/dashboard/portfolios/_schema.test.ts</files>
  <behavior>
    - PortfolioSchema rejects: empty name, name > 120 chars, items length 0, weight < 0, weight > 100, investment_amount <= 0, sum != 100 ± 0.01
    - PortfolioSchema accepts: name "My Portfolio", investment_amount 10000, items [{instrument_id: <uuid>, ticker: "VT", name: "Vanguard...", weight: 60}, {..., weight: 40}]
    - Tolerance edge: items summing to 99.99 → accepts; items summing to 99.989 → rejects; items summing to 100.01 → accepts; items summing to 100.011 → rejects
    - Optional `id` (uuid) and `description` (max 500) fields
    - `safeParse(invalid).error.issues[0].path` includes `'items'` for sum-violation errors
  </behavior>
  <action>
    Create `src/app/dashboard/portfolios/_schema.ts` per RESEARCH Pattern 1, exactly:

    ```ts
    import { z } from 'zod'

    export const PortfolioItemSchema = z.object({
      instrument_id: z.string().uuid(),
      ticker: z.string().min(1),
      name: z.string(),
      weight: z.number().min(0).max(100),
    })

    export type PortfolioItemInput = z.infer<typeof PortfolioItemSchema>

    export const PortfolioSchema = z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1, 'Name required').max(120),
      description: z.string().trim().max(500).optional(),
      investment_amount: z.number().positive().max(99_999_999),
      items: z.array(PortfolioItemSchema).min(1, 'Add at least one instrument'),
    }).superRefine((data, ctx) => {
      const sum = data.items.reduce((acc, it) => acc + it.weight, 0)
      if (Math.abs(sum - 100) > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items'],
          message: `Weights must sum to 100% (current: ${sum.toFixed(2)}%)`,
        })
      }
    })

    export type PortfolioInput = z.infer<typeof PortfolioSchema>
    ```

    Replace the Wave 0 stub `_schema.test.ts` with real assertions covering every behavior bullet above. Each test imports `PortfolioSchema` from `./_schema`. Use a stable fake UUID like `'11111111-1111-1111-1111-111111111111'` for `instrument_id` values.

    Cover the tolerance edge cases explicitly:
    ```ts
    it('accepts sum exactly 100', () => { ... PortfolioSchema.safeParse({...items: [{weight:60},{weight:40}]}).success === true })
    it('accepts sum 99.99 (within tolerance)', () => { ... })
    it('rejects sum 99.98 (outside tolerance)', () => { ... })
    it('accepts sum 100.01 (within tolerance)', () => { ... })
    it('rejects sum 100.02 (outside tolerance)', () => { ... })
    ```

    Run vitest after writing each test — RED→GREEN cycle. Use `npm run test:unit -- src/app/dashboard/portfolios/_schema.test.ts` for fast iteration.
  </action>
  <verify>
    <automated>npm run test:unit -- src/app/dashboard/portfolios/_schema.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>Schema exports PortfolioSchema/PortfolioItemSchema/PortfolioInput/PortfolioItemInput. All 9+ test cases pass; no `todo` remaining.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement pure compute libraries + tests (PORT-03, PORT-04, PORT-05, PORT-06)</name>
  <files>src/lib/portfolio/compute-metrics.ts, src/lib/portfolio/normalize-weights.ts, src/lib/portfolio/chf-format.ts, src/lib/portfolio/compute-metrics.test.ts, src/lib/portfolio/normalize-weights.test.ts, src/lib/portfolio/chf-format.test.ts</files>
  <behavior>
    computeMetrics:
    - items=[{id:'a', weight:60}, {id:'b', weight:40}], meta={a:{er:0.0007, dy:0.0186}, b:{er:0.0003, dy:0.0398}}, amount=10000 → ter ≈ 0.00054, yield ≈ 0.02708, annualIncome ≈ 270.84
    - meta missing for an id → skipped (not counted in either missing list — id is unknown to caller)
    - meta entry with null expense_ratio → id pushed to terMissingIds; null contribution = 0
    - meta entry with null dividend_yield → id pushed to yieldMissingIds; null contribution = 0
    - empty items → ter=0, yield=0, annualIncome=0, missing lists empty
    - weight units: weight/100 used inside (so weight=60 contributes 0.60 × er to ter)

    normalizeTo100:
    - [50, 50, 50] → [33.33, 33.33, 33.34] (sum exactly 100)
    - [10, 20, 30, 40] → [10, 20, 30, 40] (already sums to 100)
    - [0, 0, 0] → [0, 0, 0] (no division by zero)
    - [33.33, 33.33, 33.33] (sum 99.99) → [33.33, 33.33, 33.34] (drift corrected)
    - [50, 50] → [50, 50]
    - returned array sum is exactly 100.00 (after rounding) for any non-zero input

    fmtCHF (Swiss apostrophe — note: Intl uses U+2019 RIGHT SINGLE QUOTATION MARK, not ASCII apostrophe; use `.includes('10') && .includes('000')` style assertions OR explicitly compare to U+2019 form):
    - fmtCHF(10000) → contains "10" and "000" with separator (assert `/CHF\s10[’']000/u`)
    - fmtCHF(10000.5) → ends with ".50"
    - fmtCHF(1234567.89) → contains two separators
    - fmtCHF(0) → contains "0"
    - fmtCHF(-100) → starts with "-" or contains negative indicator
  </behavior>
  <action>
    Implement RESEARCH Examples 2 + 3 verbatim, then test.

    `src/lib/portfolio/compute-metrics.ts`:
    ```ts
    export type Item = { instrument_id: string; weight: number }
    export type InstrumentMeta = { expense_ratio: number | null; dividend_yield: number | null }
    export type Metrics = {
      ter: number
      yield: number
      annualIncome: number
      terMissingCount: number
      yieldMissingCount: number
      terMissingIds: string[]
      yieldMissingIds: string[]
    }

    export function computeMetrics(
      items: Item[],
      investmentAmount: number,
      meta: Map<string, InstrumentMeta>,
    ): Metrics {
      let ter = 0, dy = 0
      const terMissingIds: string[] = []
      const yieldMissingIds: string[] = []
      for (const it of items) {
        const m = meta.get(it.instrument_id)
        if (!m) continue
        if (m.expense_ratio == null) terMissingIds.push(it.instrument_id)
        else ter += (it.weight / 100) * m.expense_ratio
        if (m.dividend_yield == null) yieldMissingIds.push(it.instrument_id)
        else dy += (it.weight / 100) * m.dividend_yield
      }
      return {
        ter,
        yield: dy,
        annualIncome: investmentAmount * dy,
        terMissingCount: terMissingIds.length,
        yieldMissingCount: yieldMissingIds.length,
        terMissingIds,
        yieldMissingIds,
      }
    }
    ```

    `src/lib/portfolio/normalize-weights.ts`:
    ```ts
    export function normalizeTo100(weights: number[]): number[] {
      const sum = weights.reduce((a, b) => a + b, 0)
      if (sum === 0) return weights.map(() => 0)
      const scaled = weights.map(w => Math.round((w / sum) * 100 * 100) / 100)
      const drift = 100 - scaled.reduce((a, b) => a + b, 0)
      if (scaled.length > 0) {
        scaled[scaled.length - 1] = Math.round((scaled[scaled.length - 1] + drift) * 100) / 100
      }
      return scaled
    }
    ```

    `src/lib/portfolio/chf-format.ts`:
    ```ts
    const formatter = new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })

    export function fmtCHF(amount: number): string {
      return formatter.format(amount)
    }
    ```

    Now replace the Wave 0 todo stubs in the 3 corresponding test files with real assertions. Use vitest's `expect(...).toBeCloseTo(value, digits)` for floating-point comparisons. For `fmtCHF`, use `expect(s).toMatch(/CHF\s10[’']000/u)` — avoid hardcoding which separator character `Intl` produces (it varies by Node ICU version; both U+2019 and `'` are valid for de-CH).

    `compute-metrics.test.ts` MUST include the case where `weight=60` and `expense_ratio=0.0007`:
    ```ts
    expect(metrics.ter).toBeCloseTo(0.60 * 0.0007, 6)  // 0.00042 contribution
    ```
    This guards against the "double multiplication" pitfall (RESEARCH "Code Examples" note).

    Run all three test files after each edit. RED→GREEN cycle.
  </action>
  <verify>
    <automated>npm run test:unit -- src/lib/portfolio/compute-metrics.test.ts src/lib/portfolio/normalize-weights.test.ts src/lib/portfolio/chf-format.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>All three modules exported; ≥5 passing tests per file; no `todo` remaining; `npm run test:unit` reports green for these three files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implement papaparse-backed CSV parser + tests (PORT-08)</name>
  <files>src/lib/portfolio/parse-csv.ts, src/lib/portfolio/parse-csv.test.ts</files>
  <behavior>
    - parsePortfolioCsv(File) returns Promise<{rows: CsvRow[], errors: string[]}>
    - Header row required (case-insensitive): `ticker`, `weight`, optional `exchange`
    - Well-formed input: `ticker,weight\nVT,60\nAGG,40` → rows=[{ticker:'VT', weight:60}, {ticker:'AGG', weight:40}], errors=[]
    - Optional exchange: `ticker,weight,exchange\nVWCE,100,SW` → rows=[{ticker:'VWCE', weight:100, exchange:'SW'}]
    - Missing weight column header → errors[] non-empty (one error per row)
    - Non-numeric weight → row goes to errors[], not rows[]
    - Empty rows skipped (papaparse `skipEmptyLines: true`)
    - Quoted fields handled by papaparse (e.g., `"VT","60"`)
    - Function does NOT throw — always resolves with the result object
  </behavior>
  <action>
    Implement `src/lib/portfolio/parse-csv.ts` per RESEARCH Example 4:

    ```ts
    import Papa from 'papaparse'
    import { z } from 'zod'

    export const CsvRowSchema = z.object({
      ticker: z.string().trim().min(1),
      weight: z.string().regex(/^\d+(\.\d+)?$/).transform(Number),
      exchange: z.string().trim().min(1).optional(),
    })

    export type CsvRow = {
      ticker: string
      weight: number
      exchange?: string
    }

    export async function parsePortfolioCsv(file: File): Promise<{ rows: CsvRow[]; errors: string[] }> {
      return new Promise(resolve => {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          transformHeader: h => h.toLowerCase().trim(),
          complete: ({ data, errors }) => {
            const rows: CsvRow[] = []
            const errs: string[] = errors.map(e => `Row ${e.row}: ${e.message}`)
            for (const [i, raw] of data.entries()) {
              const parsed = CsvRowSchema.safeParse(raw)
              if (parsed.success) {
                rows.push({
                  ticker: parsed.data.ticker,
                  weight: parsed.data.weight,
                  ...(parsed.data.exchange ? { exchange: parsed.data.exchange } : {}),
                })
              } else {
                errs.push(`Row ${i + 2}: ${parsed.error.issues[0].message}`)
              }
            }
            resolve({ rows, errors: errs })
          },
        })
      })
    }
    ```

    Convert the Wave 0 `parse-csv.test.ts` todos to real tests. Vitest runs in node env without DOM File. Use the npm `formdata-node` polyfill if needed, OR construct a `Blob`+`File` shim:

    ```ts
    function makeFile(content: string, name = 'test.csv'): File {
      // Node 20 has global File (since v20.x); fallback wraps Blob.
      try {
        return new File([content], name, { type: 'text/csv' })
      } catch {
        const blob = new Blob([content], { type: 'text/csv' })
        return Object.assign(blob, { name, lastModified: Date.now() }) as unknown as File
      }
    }
    ```

    Cover all behaviors listed above. The Papa.parse callback is async; tests must `await parsePortfolioCsv(file)`.

    Run tests iteratively. RED → GREEN.
  </action>
  <verify>
    <automated>npm run test:unit -- src/lib/portfolio/parse-csv.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>parse-csv.ts exports parsePortfolioCsv, CsvRow, CsvRowSchema; ≥6 passing test cases; no `todo` remaining; full `npm run test:unit` for Phase 4 lib/ stays green.</done>
</task>

</tasks>

<verification>
- All 5 source modules exist with documented exports
- `npm run test:unit` exits 0 with no `todo` markers in Phase 4 files
- Phase 4 unit suite runtime < 5s
- No new dependencies added (papaparse, zod already from Plan 01)
</verification>

<success_criteria>
1. `src/app/dashboard/portfolios/_schema.ts` exports `PortfolioSchema`, `PortfolioItemSchema`, `PortfolioInput`, `PortfolioItemInput`
2. `src/lib/portfolio/compute-metrics.ts` exports `computeMetrics`, `Metrics`, `Item`, `InstrumentMeta`
3. `src/lib/portfolio/normalize-weights.ts` exports `normalizeTo100`
4. `src/lib/portfolio/chf-format.ts` exports `fmtCHF`
5. `src/lib/portfolio/parse-csv.ts` exports `parsePortfolioCsv`, `CsvRow`, `CsvRowSchema`
6. `npm run test:unit` for these 5 files: all green, all stubs converted
</success_criteria>

<output>
After completion, create `.planning/phases/04-portfolio-builder/04-02-SUMMARY.md` with:
- Final test counts per file
- Any RED→GREEN cycles that revealed pitfalls (e.g., `Intl` separator character variance, NUMERIC(5,4) vs NUMERIC(5,2) confusion)
- Confirmation that downstream plans (03, 04) can import from these modules
</output>
