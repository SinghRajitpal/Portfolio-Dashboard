/**
 * Playwright global-setup hook for the Phase 5 backtest integration specs.
 *
 * Responsibilities:
 *   1. Assert required env vars are present (fail fast with a useful message)
 *   2. Ensure snb_rates is seeded — the backtest worker needs SNB CHF policy
 *      rate history to compute Sharpe (CONTEXT D-19). If the table is empty
 *      we shell out to `npm run seed:snb` (idempotent — onConflict='date_month').
 *   3. Ensure fx_rates is seeded — the simulator's CHF allocation step needs
 *      CHF→USD/EUR/GBP rates over the test window. Phase 3 has a `seed:fx`
 *      script (calls Frankfurter; ECB-sourced). The live worktree DB was
 *      observed empty during Plan 07 setup, so we top up here. Idempotent —
 *      `seed-fx.ts` reads the latest cached date and fetches forward only.
 *
 * Required env (loaded by playwright.config.ts via dotenv from .env.local):
 *   - NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY   — service-role key (Node-side ONLY, never
 *                                   leaked to the browser; used by the stale-
 *                                   on-view spec for a direct prices UPSERT)
 *   - CRON_SECRET                  — bearer token for /api/cron/refresh-snb
 *                                    (kept in env so the SNB seed precondition
 *                                    can also be satisfied via the cron route
 *                                    if a future test wants to; today we only
 *                                    invoke the offline `npm run seed:snb`)
 *
 * Decision (Plan 07 Task 0 RESOLVED):
 *   The stale-on-view spec uses DIRECT DB MUTATION via the service-role
 *   client to bump `prices.created_at` (the column that drives
 *   `currentPricesVersion` in src/app/api/backtest/runs/[id]/route.ts).
 *   It does NOT invoke /api/cron/refresh-prices because:
 *     a) more reliable — no Vercel cron dependency in local CI;
 *     b) deterministic — the mutation is atomic;
 *     c) no auth dance — service-role key stays Node-side.
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-07-PLAN.md Task 0
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-19)
 *   - src/app/api/backtest/runs/[id]/route.ts (uses prices.created_at)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import * as path from 'node:path'

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
] as const

export default async function globalSetup(): Promise<void> {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `[backtest-prereqs] Missing required env vars: ${missing.join(', ')}. ` +
        `These must be set in .env.local at the worktree root (the file is ` +
        `loaded by playwright.config.ts via dotenv before this hook runs).`,
    )
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Idempotent SNB-seed precondition. Skip if already populated.
  const { count, error } = await sb
    .from('snb_rates')
    .select('*', { count: 'exact', head: true })
  if (error) {
    throw new Error(`[backtest-prereqs] snb_rates head query failed: ${error.message}`)
  }

  if ((count ?? 0) === 0) {
    // Shell out to the existing seed script — keeps the precondition co-
    // located with the dev-tool surface (Plan 03 invented `npm run seed:snb`).
    const cwd = path.resolve(__dirname, '..', '..', '..')
    try {
      execSync('npm run seed:snb', { cwd, stdio: 'inherit' })
    } catch (e) {
      throw new Error(
        `[backtest-prereqs] npm run seed:snb failed: ${(e as Error).message}`,
      )
    }
  }

  // FX seed precondition. The Phase 3 `npm run seed:fx` script is incompatible
  // with the current Frankfurter v2 API NDJSON shape (its zod schema expects
  // `{date, base, rates: Record<string, number>}` whereas the API emits
  // `{date, base, quote, rate}` per row — a parser drift caught here). We
  // fix the FX gap narrowly in-place rather than patch Phase 3 from a
  // Phase 5 plan: fetch CHF→USD/EUR/GBP from 2010-01-01 → today, upsert
  // directly via the service-role client. Idempotent on
  // UNIQUE(base_currency, quote_currency, date).
  const { count: fxCount, error: fxErr } = await sb
    .from('fx_rates')
    .select('*', { count: 'exact', head: true })
  if (fxErr) {
    throw new Error(`[backtest-prereqs] fx_rates head query failed: ${fxErr.message}`)
  }
  if ((fxCount ?? 0) === 0) {
    await seedFxRates(sb)
  }
}

type FxRateRow = {
  date: string
  base: string
  quote: string
  rate: number
}

async function seedFxRates(sb: SupabaseClient): Promise<void> {
  const from = '2010-01-01'
  const to = new Date().toISOString().slice(0, 10)
  const url = new URL('https://api.frankfurter.dev/v2/rates')
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  url.searchParams.set('base', 'CHF')
  url.searchParams.set('quotes', 'USD,EUR,GBP')
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/x-ndjson' },
  })
  if (!res.ok) {
    throw new Error(`[backtest-prereqs] Frankfurter ${res.status}: ${await res.text()}`)
  }
  const text = await res.text()
  const rows: FxRateRow[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const r = JSON.parse(trimmed) as FxRateRow
      if (
        typeof r.date === 'string' &&
        typeof r.base === 'string' &&
        typeof r.quote === 'string' &&
        typeof r.rate === 'number' &&
        Number.isFinite(r.rate)
      ) {
        rows.push(r)
      }
    } catch {
      // skip malformed line
    }
  }
  if (rows.length === 0) {
    throw new Error('[backtest-prereqs] Frankfurter returned 0 parseable rows')
  }

  // Upsert in batches of 1000 to stay under PostgREST limits.
  const batchSize = 1000
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize).map((r) => ({
      base_currency: r.base,
      quote_currency: r.quote,
      date: r.date,
      rate: r.rate,
    }))
    const { error } = await sb
      .from('fx_rates')
      .upsert(slice, {
        onConflict: 'base_currency,quote_currency,date',
        ignoreDuplicates: false,
      })
    if (error) {
      throw new Error(
        `[backtest-prereqs] fx_rates upsert failed at batch ${i}: ${error.message}`,
      )
    }
  }
}
