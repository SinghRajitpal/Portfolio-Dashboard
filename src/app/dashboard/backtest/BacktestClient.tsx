'use client'

/**
 * BacktestClient — top-level client orchestrator for /dashboard/backtest.
 *
 * Filled in by Plan 05-06 Task 2. This Task 1 stub exports the symbol so
 * the page.tsx import resolves under `npx tsc --noEmit`.
 */
import type { BacktestPortfolioRow, BenchmarkOption } from './_queries'

export type BacktestClientProps = {
  portfolios: BacktestPortfolioRow[]
  benchmarks: BenchmarkOption[]
}

export function BacktestClient({
  portfolios,
  benchmarks,
}: BacktestClientProps) {
  return (
    <div data-portfolios={portfolios.length} data-benchmarks={benchmarks.length}>
      Backtest client (filled in Task 2)
    </div>
  )
}
