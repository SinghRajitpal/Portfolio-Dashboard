/**
 * /dashboard/backtest — server-component shell for the backtesting UI.
 *
 * Hands off to <BacktestClient> after fetching:
 *   - the user's non-template portfolios (with per-instrument first_date so
 *     the client can compute the earliest-allowed start date inline)
 *   - the curated benchmark dropdown options (D-22 whitelist, one variant
 *     per name picked by longest cached history)
 *
 * Single page per CONTEXT D-01 (setup bar + results below). The benchmark
 * dropdown options are constrained to the D-22 whitelist; the BacktestClient
 * surfaces these alongside a 'None' default per D-22 + D-23.
 *
 * Empty state: a user with no portfolios cannot run a backtest, so we
 * render a CTA to /dashboard/portfolios/new instead of the BacktestClient.
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-01, D-22)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §dashboard/backtest/page.tsx
 */
import Link from 'next/link'

import { BacktestClient } from './BacktestClient'
import { listPortfoliosForBacktest, loadBenchmarkInstruments } from './_queries'

export default async function BacktestPage() {
  const [portfolios, benchmarks] = await Promise.all([
    listPortfoliosForBacktest(),
    loadBenchmarkInstruments(),
  ])

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-medium tracking-tight">Backtest</h1>
      </header>

      {portfolios.length === 0 ? (
        <div
          data-testid="backtest-empty-state"
          className="mx-auto max-w-md py-16 text-center"
        >
          <p className="text-sm text-muted-foreground">
            You need at least one portfolio to run a backtest.
          </p>
          <Link
            href="/dashboard/portfolios/new"
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4 hover:text-foreground"
          >
            Create your first portfolio
          </Link>
        </div>
      ) : (
        <BacktestClient portfolios={portfolios} benchmarks={benchmarks} />
      )}
    </main>
  )
}
