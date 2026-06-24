'use client'

/**
 * BacktestResults — vertical composition of the result sections.
 *
 * Sections top→bottom per CONTEXT D-04:
 *   1. Equity curve chart (EquityCurveChart from Plan 05-05)
 *   2. Metrics strip (5-stat strip from this plan)
 *   3. Annual returns bars (AnnualReturnsChart from Plan 05-05)
 *   4. Run summary footer (parameters + warnings + D-17 disclosure)
 *
 * D-09 stale-on-view: when `isStale=true`, a small banner above section 1
 * surfaces "Data refreshed — recompute?" with a Recompute button that
 * triggers a fresh fetch via the parent's onRecompute callback.
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-04, D-09)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §BacktestResults
 */
import * as React from 'react'

import { AnnualReturnsChart } from '@/components/backtest/AnnualReturnsChart'
import { EquityCurveChart } from '@/components/backtest/EquityCurveChart'
import { MetricsStrip } from '@/components/backtest/MetricsStrip'
import { RunSummaryFooter } from '@/components/backtest/RunSummaryFooter'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BacktestOutput, BacktestParams } from '@/lib/backtest/types'

import type { BacktestPortfolioRow } from '@/app/dashboard/backtest/_queries'

export type BacktestResultsProps = {
  output: BacktestOutput
  params: BacktestParams
  isStale: boolean
  onRecompute: () => void
  investmentAmount: number
  portfolio: BacktestPortfolioRow | null
  className?: string
}

export function BacktestResults({
  output,
  params,
  isStale,
  onRecompute,
  investmentAmount,
  portfolio,
  className,
}: BacktestResultsProps) {
  return (
    <div className={cn('space-y-8', className)}>
      {isStale ? (
        <div
          role="status"
          className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/30"
        >
          <span className="text-amber-900 dark:text-amber-200">
            Data refreshed — recompute?
          </span>
          <Button size="sm" variant="outline" onClick={onRecompute}>
            Recompute
          </Button>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Equity curve
        </h2>
        <EquityCurveChart
          portfolio={output.equity}
          benchmark={output.benchmarkEquity}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Metrics
        </h2>
        <MetricsStrip metrics={output.metrics} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Annual returns
        </h2>
        <AnnualReturnsChart
          bars={output.annualBars}
          showBenchmark={params.benchmark_ticker !== null}
        />
      </section>

      <section>
        <RunSummaryFooter
          params={params}
          warnings={output.warnings}
          investmentAmount={investmentAmount}
          portfolio={portfolio}
        />
      </section>
    </div>
  )
}
