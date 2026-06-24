import 'server-only'

/**
 * Server-only DB reads for the /dashboard/backtest page.
 *
 * Two reads:
 *   - listPortfoliosForBacktest() — RLS-scoped non-template portfolios with
 *     instrument-counts AND per-instrument `first_date`. The per-instrument
 *     `first_date` is required client-side to compute the earliest-allowed
 *     start date (CONTEXT D-03) without a second round-trip.
 *   - loadBenchmarkInstruments() — the four D-22 curated benchmarks
 *     (MSCI World, MSCI ACWI, S&P 500, SMI). For each, pick the variant
 *     with the longest cached history (earliest `first_date`).
 *
 * NUMERIC handling: Supabase JS may return Postgres NUMERIC columns as
 * either string or number. Every numeric field is wrapped via toNum().
 *
 * The 'server-only' import throws at build/runtime if a client component
 * imports this module (matches the portfolios/_queries.ts pattern).
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-01, D-03, D-22)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §dashboard/backtest/page.tsx
 */

import { createClient } from '@/lib/supabase/server'

export type BacktestPortfolioInstrument = {
  id: string
  ticker: string
  first_date: string | null
}

export type BacktestPortfolioRow = {
  id: string
  name: string
  investment_amount: number
  instrument_count: number
  instruments: BacktestPortfolioInstrument[]
}

export type BenchmarkOption = {
  ticker: string
  name: string
  first_date: string | null
  last_date: string | null
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toNumOrZero(v: unknown): number {
  return toNum(v) ?? 0
}

type RawListRow = {
  id: string
  name: string
  investment_amount: number | string | null
  portfolio_instruments: Array<{
    instrument_id: string
    instruments: {
      id: string
      ticker: string
      first_date: string | null
    } | null
  }>
}

export async function listPortfoliosForBacktest(): Promise<BacktestPortfolioRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('portfolios')
    .select(
      'id, name, investment_amount, portfolio_instruments(instrument_id, instruments(id, ticker, first_date))',
    )
    .eq('is_template', false)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`listPortfoliosForBacktest: ${error.message}`)

  const rows = (data ?? []) as unknown as RawListRow[]
  return rows.map((p) => {
    const pis = (p.portfolio_instruments ?? []).filter(
      (pi) => pi.instruments !== null,
    )
    const instruments: BacktestPortfolioInstrument[] = pis.map((pi) => ({
      id: pi.instruments!.id,
      ticker: pi.instruments!.ticker,
      first_date: pi.instruments!.first_date,
    }))
    return {
      id: p.id,
      name: p.name,
      investment_amount: toNumOrZero(p.investment_amount),
      instrument_count: instruments.length,
      instruments,
    }
  })
}

// Benchmark name → candidate ticker pool (D-22).
// One winner per name (longest cached history = earliest first_date).
// MSCI ACWI: ACWI.US is intentionally excluded from the pool — SSAC.SW
// (CHF-listed UCITS) matches CHF-native positioning per CONTEXT D-22.
const BENCHMARK_POOL: Record<string, string[]> = {
  'MSCI World': ['URTH.US', 'SWDA.LSE'],
  'MSCI ACWI': ['SSAC.SW'],
  'S&P 500': ['SPY.US'],
  SMI: ['CSSMI.SW'],
}

type RawInstrumentRow = {
  ticker: string
  first_date: string | null
  last_date: string | null
}

export async function loadBenchmarkInstruments(): Promise<BenchmarkOption[]> {
  const supabase = await createClient()
  const allTickers = Object.values(BENCHMARK_POOL).flat()
  const { data, error } = await supabase
    .from('instruments')
    .select('ticker, first_date, last_date')
    .in('ticker', allTickers)

  if (error) throw new Error(`loadBenchmarkInstruments: ${error.message}`)

  const rows = (data ?? []) as unknown as RawInstrumentRow[]
  const byTicker = new Map<string, RawInstrumentRow>()
  for (const r of rows) byTicker.set(r.ticker, r)

  const results: BenchmarkOption[] = []
  for (const [name, candidates] of Object.entries(BENCHMARK_POOL)) {
    let winner: RawInstrumentRow | null = null
    for (const t of candidates) {
      const row = byTicker.get(t)
      if (!row) continue
      if (!winner) {
        winner = row
        continue
      }
      // Earliest first_date wins (longest cached history). Lexicographic
      // compare works for ISO YYYY-MM-DD strings.
      const wFirst = winner.first_date ?? '9999-12-31'
      const rFirst = row.first_date ?? '9999-12-31'
      if (rFirst < wFirst) winner = row
    }
    if (winner) {
      results.push({
        ticker: winner.ticker,
        name,
        first_date: winner.first_date,
        last_date: winner.last_date,
      })
    }
  }
  return results
}
