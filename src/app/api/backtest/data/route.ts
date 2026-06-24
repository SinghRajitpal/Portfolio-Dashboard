/**
 * POST /api/backtest/data — batch fetch for the backtest worker (CONTEXT D-07).
 *
 * One round-trip; the browser-side Web Worker is sandboxed (no DB access)
 * and consumes the JSON payload directly. RLS on portfolios +
 * portfolio_instruments is the IDOR backstop — we use the SSR cookies-bound
 * client (NOT service-role), so any portfolio the calling user does not own
 * silently disappears via .maybeSingle() → 404.
 *
 * Threats mitigated:
 *   * T-5-04-IDOR — RLS on portfolios + portfolio_instruments; .maybeSingle()
 *     returns null for someone else's row → we map to 404 with the same shape
 *     as "truly does not exist" so existence is not disclosed.
 *   * T-5-04-DOS  — BacktestDataRequestSchema refines (end-start) <= 25 years
 *     before the route ever touches Postgres.
 *   * T-5-04-SSRF — benchmark_ticker is z.enum(BENCHMARK_TICKER_WHITELIST);
 *     no arbitrary ticker can reach the DB.
 *
 * Response shape (consumed by Plan 05-05 worker + Plan 05-06 UI):
 *   { items, benchmark, prices, dividends, fxRates, snbRates,
 *     pricesVersion, investmentAmount }
 *
 * pricesVersion is the snapshot-time MAX(created_at) over prices + dividends
 * + fx_rates rows in the requested window — the `prices`/`fx_rates`/`dividends`
 * tables have only `created_at` (no `updated_at`), so we use that as the
 * cache-version stamp per Plan 05-04's "fall back to created_at" guidance.
 *
 * Cite:
 *   * .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-07, D-19, D-22)
 *   * .planning/phases/05-backtesting-engine/05-RESEARCH.md (§Code Examples lines 676-729)
 *   * .planning/phases/05-backtesting-engine/05-PATTERNS.md §api/backtest/data/route.ts
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSnbRatesRange } from '@/lib/data/cache-snb'
import { isDataError, type DataError } from '@/lib/data/errors'
import { BacktestDataRequestSchema } from '@/lib/backtest/api-schemas'
import type {
  InstrumentInput,
  PriceRow,
  DividendRow,
  FxRateRow,
  SnbRateRow,
} from '@/lib/backtest/types'

// Defensive NUMERIC → number coercion (matches _queries.ts toNum + cache-snb toNum).
function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}

export async function POST(request: NextRequest) {
  // 1. Parse JSON
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { kind: 'invalid_input', message: 'Body must be valid JSON' } satisfies DataError,
      { status: 400 },
    )
  }

  // 2. Zod validation
  const parsed = BacktestDataRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        kind: 'invalid_input',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      } satisfies DataError,
      { status: 400 },
    )
  }
  const { portfolio_id, benchmark_ticker, start, end } = parsed.data

  // 3. Auth
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

  // 4. Load portfolio (RLS auto-scopes; null = caller does not own)
  const { data: portfolio, error: portfolioErr } = await supabase
    .from('portfolios')
    .select('id, investment_amount')
    .eq('id', portfolio_id)
    .maybeSingle()
  if (portfolioErr) {
    return NextResponse.json(
      { kind: 'transient', message: portfolioErr.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  if (!portfolio) {
    return NextResponse.json(
      { kind: 'not_found', message: 'Portfolio not found' } satisfies DataError,
      { status: 404 },
    )
  }

  const investmentAmount = toNum((portfolio as { investment_amount: number | string | null }).investment_amount) || 0

  // 5. Load instruments + weights
  type PortfolioInstrumentRow = {
    weight: number | string
    instruments: {
      id: string
      ticker: string
      currency: string
      first_date: string | null
    } | null
  }
  const { data: piData, error: piErr } = await supabase
    .from('portfolio_instruments')
    .select('weight, instruments(id, ticker, currency, first_date)')
    .eq('portfolio_id', portfolio_id)
  if (piErr) {
    return NextResponse.json(
      { kind: 'transient', message: piErr.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  const piRows = ((piData ?? []) as unknown as PortfolioInstrumentRow[]).filter(
    (r) => r.instruments !== null,
  )
  const items: InstrumentInput[] = piRows.map((r) => ({
    id: r.instruments!.id,
    ticker: r.instruments!.ticker,
    currency: r.instruments!.currency,
    weight: toNum(r.weight),
    first_date: r.instruments!.first_date,
  }))

  // 6. Load benchmark if requested + not already in portfolio
  let benchmark: InstrumentInput | null = null
  if (benchmark_ticker) {
    const alreadyInPortfolio = items.find((it) => it.ticker === benchmark_ticker)
    if (alreadyInPortfolio) {
      benchmark = { ...alreadyInPortfolio, weight: 0 }
    } else {
      const { data: bRow, error: bErr } = await supabase
        .from('instruments')
        .select('id, ticker, currency, first_date')
        .eq('ticker', benchmark_ticker)
        .maybeSingle()
      if (bErr) {
        return NextResponse.json(
          { kind: 'transient', message: bErr.message, attempt: 0 } satisfies DataError,
          { status: 503 },
        )
      }
      if (!bRow) {
        return NextResponse.json(
          {
            kind: 'not_found',
            message: `Benchmark not seeded: ${benchmark_ticker}`,
          } satisfies DataError,
          { status: 404 },
        )
      }
      type BenchRow = {
        id: string
        ticker: string
        currency: string
        first_date: string | null
      }
      const b = bRow as unknown as BenchRow
      benchmark = {
        id: b.id,
        ticker: b.ticker,
        currency: b.currency,
        weight: 0,
        first_date: b.first_date,
      }
    }
  }

  // 7. Build allInstrumentIds (portfolio ∪ benchmark)
  const allIds = new Set<string>(items.map((it) => it.id))
  if (benchmark) allIds.add(benchmark.id)
  const instrumentIds = [...allIds]

  // 8. Parallel reads — single-trip per CONTEXT D-07
  //    prices / dividends / fx_rates have no `updated_at`; we select
  //    `created_at` as the per-row version stamp (see file-level note).
  type PriceDbRow = {
    instrument_id: string
    date: string
    adjusted_close: number | string
    close: number | string
    created_at: string
  }
  type DivDbRow = {
    instrument_id: string
    ex_date: string
    amount: number | string
    currency: string
    created_at: string
  }
  type FxDbRow = {
    quote_currency: string
    date: string
    rate: number | string
    created_at: string
  }

  const startMonth = start.slice(0, 7)
  const endMonth = end.slice(0, 7)

  const [pricesRes, divsRes, fxRes, snbRes] = await Promise.all([
    instrumentIds.length === 0
      ? Promise.resolve({ data: [] as PriceDbRow[], error: null })
      : supabase
          .from('prices')
          .select('instrument_id, date, adjusted_close, close, created_at')
          .in('instrument_id', instrumentIds)
          .gte('date', start)
          .lte('date', end)
          .order('date', { ascending: true }),
    instrumentIds.length === 0
      ? Promise.resolve({ data: [] as DivDbRow[], error: null })
      : supabase
          .from('dividends')
          .select('instrument_id, ex_date, amount, currency, created_at')
          .in('instrument_id', instrumentIds)
          .gte('ex_date', start)
          .lte('ex_date', end)
          .order('ex_date', { ascending: true }),
    supabase
      .from('fx_rates')
      .select('quote_currency, date, rate, created_at')
      .eq('base_currency', 'CHF')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true }),
    getSnbRatesRange(supabase, { from: startMonth, to: endMonth }),
  ])

  if (pricesRes.error) {
    return NextResponse.json(
      { kind: 'transient', message: pricesRes.error.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  if (divsRes.error) {
    return NextResponse.json(
      { kind: 'transient', message: divsRes.error.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  if (fxRes.error) {
    return NextResponse.json(
      { kind: 'transient', message: fxRes.error.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  if (isDataError(snbRes)) {
    return NextResponse.json(snbRes, { status: 503 })
  }

  const priceRowsDb = (pricesRes.data ?? []) as unknown as PriceDbRow[]
  const divRowsDb = (divsRes.data ?? []) as unknown as DivDbRow[]
  const fxRowsDb = (fxRes.data ?? []) as unknown as FxDbRow[]
  const snbRows: SnbRateRow[] = snbRes

  // 9. Compute pricesVersion = MAX(created_at) across all source rows.
  //    RESEARCH Pitfall 9 documents that the race between MAX-read and
  //    subsequent writes is acceptable — the stale-on-view UX badge
  //    (Plan 05-06) recomputes whenever the user opens an older run.
  let maxStamp = 0
  for (const r of priceRowsDb) {
    const t = Date.parse(r.created_at)
    if (Number.isFinite(t) && t > maxStamp) maxStamp = t
  }
  for (const r of divRowsDb) {
    const t = Date.parse(r.created_at)
    if (Number.isFinite(t) && t > maxStamp) maxStamp = t
  }
  for (const r of fxRowsDb) {
    const t = Date.parse(r.created_at)
    if (Number.isFinite(t) && t > maxStamp) maxStamp = t
  }
  const pricesVersion = maxStamp

  // 10. Coerce NUMERIC → number at route boundary
  const prices: PriceRow[] = priceRowsDb.map((r) => ({
    instrument_id: r.instrument_id,
    date: r.date,
    adjusted_close: toNum(r.adjusted_close),
    close: toNum(r.close),
  }))
  const dividends: DividendRow[] = divRowsDb.map((r) => ({
    instrument_id: r.instrument_id,
    ex_date: r.ex_date,
    amount: toNum(r.amount),
    currency: r.currency,
  }))
  const fxRates: FxRateRow[] = fxRowsDb.map((r) => ({
    quote_currency: r.quote_currency,
    date: r.date,
    rate: toNum(r.rate),
  }))

  // 11. Return single batch payload
  return NextResponse.json({
    items,
    benchmark,
    prices,
    dividends,
    fxRates,
    snbRates: snbRows,
    pricesVersion,
    investmentAmount,
  })
}

// Error → HTTP status mapper kept around for completeness (matches search/route.ts pattern).
// Module-private (NOT exported — route handler files may only export HTTP method names).
// Currently unused: each error path above writes a tailored response.
// Kept defined so downstream changes can swap to the helper when needed.
function _jsonError(err: DataError) {
  const status =
    err.kind === 'rate_limit'
      ? 429
      : err.kind === 'not_found'
        ? 404
        : err.kind === 'invalid_input'
          ? 400
          : 503
  return NextResponse.json(err, { status })
}
void _jsonError
