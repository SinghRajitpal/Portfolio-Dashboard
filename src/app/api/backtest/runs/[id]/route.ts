/**
 * GET /api/backtest/runs/[id] — single-run reload with stale-on-view flag.
 *
 * Per Next.js 16 App Router dynamic-route convention, `params` is a Promise
 * that must be awaited. Verified against `src/app/dashboard/portfolios/[id]/edit/page.tsx`
 * (existing live route in this codebase) — same `Promise<{ id: string }>` shape.
 *
 * The route derives `stale: boolean` at fetch time by recomputing the
 * MAX(created_at) over the run's date window — if the stored
 * `prices_version` is older than the current max, the cached run is shown
 * with a "data refreshed — recompute?" badge in the UI (CONTEXT D-09).
 *
 * Threats mitigated:
 *   * T-5-04-IDOR-ID — .maybeSingle() returns null for someone else's row
 *     under RLS; we map to 404 with the same shape as "not found" so
 *     existence is not disclosed.
 *
 * Pitfall acknowledged (RESEARCH §Pitfall 9): the read-MAX → compare-stored
 * sequence has a tolerable race (a refresh landing between MAX and response
 * just produces a stale=true on the next fetch).
 *
 * Cite:
 *   * .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-09)
 *   * .planning/phases/05-backtesting-engine/05-PATTERNS.md §api/backtest/runs/[id]/route.ts
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DataError } from '@/lib/data/errors'
import type { BacktestParams } from '@/lib/backtest/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { kind: 'invalid_input', message: 'Not authenticated' } satisfies DataError,
      { status: 401 },
    )
  }

  // 2. RLS-scoped single-row fetch
  const { data: row, error } = await supabase
    .from('backtest_runs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    return NextResponse.json(
      { kind: 'transient', message: error.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  if (!row) {
    return NextResponse.json(
      { kind: 'not_found', message: 'Run not found' } satisfies DataError,
      { status: 404 },
    )
  }

  type RunDbRow = {
    id: string
    user_id: string
    portfolio_id: string
    inputs_hash: string
    params_json: BacktestParams
    equity_curve_json: unknown
    annual_bars_json: unknown
    metrics_json: unknown
    warnings_json: unknown
    prices_version: number | string
    computed_at: string
  }
  const runRow = row as unknown as RunDbRow
  const params_json = runRow.params_json
  const start = params_json.start
  const end = params_json.end
  const benchmarkTicker = params_json.benchmark_ticker

  // 3. Find the instrument-ids backing the run via portfolio_instruments
  //    (RLS scopes through portfolios.user_id; the run's portfolio is the
  //    caller's so the join works). Include benchmark on demand.
  type PiRow = { instrument_id: string }
  const { data: piData, error: piErr } = await supabase
    .from('portfolio_instruments')
    .select('instrument_id')
    .eq('portfolio_id', runRow.portfolio_id)
  if (piErr) {
    return NextResponse.json(
      { kind: 'transient', message: piErr.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  const piRows = (piData ?? []) as unknown as PiRow[]
  const instrumentIds = new Set<string>(piRows.map((r) => r.instrument_id))

  if (benchmarkTicker) {
    const { data: bRow, error: bErr } = await supabase
      .from('instruments')
      .select('id')
      .eq('ticker', benchmarkTicker)
      .maybeSingle()
    if (bErr) {
      return NextResponse.json(
        { kind: 'transient', message: bErr.message, attempt: 0 } satisfies DataError,
        { status: 503 },
      )
    }
    if (bRow) {
      instrumentIds.add((bRow as unknown as { id: string }).id)
    }
  }

  const idsArr = [...instrumentIds]

  // 4. Recompute current pricesVersion = MAX(created_at) over prices +
  //    dividends + fx_rates in the run's window. Single Promise.all.
  type PriceMeta = { created_at: string }
  type DivMeta = { created_at: string }
  type FxMeta = { created_at: string }

  const [pricesRes, divsRes, fxRes] = await Promise.all([
    idsArr.length === 0
      ? Promise.resolve({ data: [] as PriceMeta[], error: null })
      : supabase
          .from('prices')
          .select('created_at')
          .in('instrument_id', idsArr)
          .gte('date', start)
          .lte('date', end),
    idsArr.length === 0
      ? Promise.resolve({ data: [] as DivMeta[], error: null })
      : supabase
          .from('dividends')
          .select('created_at')
          .in('instrument_id', idsArr)
          .gte('ex_date', start)
          .lte('ex_date', end),
    supabase
      .from('fx_rates')
      .select('created_at')
      .eq('base_currency', 'CHF')
      .gte('date', start)
      .lte('date', end),
  ])

  if (pricesRes.error || divsRes.error || fxRes.error) {
    const msg =
      pricesRes.error?.message ?? divsRes.error?.message ?? fxRes.error?.message ?? 'unknown'
    return NextResponse.json(
      { kind: 'transient', message: msg, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }

  let currentPricesVersion = 0
  for (const r of (pricesRes.data ?? []) as unknown as PriceMeta[]) {
    const t = Date.parse(r.created_at)
    if (Number.isFinite(t) && t > currentPricesVersion) currentPricesVersion = t
  }
  for (const r of (divsRes.data ?? []) as unknown as DivMeta[]) {
    const t = Date.parse(r.created_at)
    if (Number.isFinite(t) && t > currentPricesVersion) currentPricesVersion = t
  }
  for (const r of (fxRes.data ?? []) as unknown as FxMeta[]) {
    const t = Date.parse(r.created_at)
    if (Number.isFinite(t) && t > currentPricesVersion) currentPricesVersion = t
  }

  const storedVersion =
    typeof runRow.prices_version === 'string'
      ? Number(runRow.prices_version)
      : runRow.prices_version
  const stale = currentPricesVersion > (Number.isFinite(storedVersion) ? storedVersion : 0)

  // 5. Return run row + derived stale flag
  return NextResponse.json({
    ...runRow,
    prices_version: storedVersion,
    stale,
  })
}
