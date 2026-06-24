'use client'

/**
 * RunSummaryFooter — borderless final block of the results panel.
 *
 * Renders three sections:
 *   1. Run parameters (start, end, DRIP, rebalance, benchmark, investment).
 *   2. Warnings list — one line per warning, formatted per kind.
 *      (forward_fill, truncated_start, drip_on_filled, snb_stitch,
 *      fx_lookback, rebalance — all from `BacktestWarning`.)
 *   3. D-17 disclosure: 'Idealized backtest: no fees, no taxes…'
 *
 * No card chrome (Phase 2 Swiss-minimalist convention).
 *
 * T-5-06-XSS: warning strings are built by the engine from typed shapes,
 * not user input. All values are rendered as React text nodes (no
 * dangerouslySetInnerHTML).
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-14, D-17)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §RunSummaryFooter
 */
import * as React from 'react'

import { cn } from '@/lib/utils'
import { fmtCHF } from '@/lib/portfolio/chf-format'
import type { BacktestParams, BacktestWarning } from '@/lib/backtest/types'

import type { BacktestPortfolioRow } from '@/app/dashboard/backtest/_queries'

export type RunSummaryFooterProps = {
  params: BacktestParams
  warnings: BacktestWarning[]
  /** Portfolio investment amount (CHF), used in the parameters table. */
  investmentAmount: number
  /** Resolved portfolio name; falls back to id if unknown. */
  portfolio: BacktestPortfolioRow | null
  className?: string
}

function formatWarning(w: BacktestWarning): string {
  // The engine builds the `message` field as the canonical human-readable
  // form. We surface it verbatim with the `kind` prefix so the user can
  // scan for the warning category at a glance.
  return `${w.kind}: ${w.message}`
}

export function RunSummaryFooter({
  params,
  warnings,
  investmentAmount,
  portfolio,
  className,
}: RunSummaryFooterProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Run summary
      </h2>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
        <SummaryItem label="Portfolio" value={portfolio?.name ?? params.portfolio_id} />
        <SummaryItem label="Investment" value={fmtCHF(investmentAmount)} />
        <SummaryItem label="Start" value={params.start} mono />
        <SummaryItem label="End" value={params.end} mono />
        <SummaryItem label="DRIP" value={params.drip ? 'On' : 'Off'} />
        <SummaryItem label="Rebalance" value={params.rebalance} />
        <SummaryItem
          label="Benchmark"
          value={params.benchmark_ticker ?? '—'}
          mono={params.benchmark_ticker !== null}
        />
      </dl>

      {warnings.length > 0 ? (
        <div className="space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Warnings ({warnings.length})
          </div>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {warnings.map((w, idx) => (
              <li key={idx} className="tabular-nums">
                {formatWarning(w)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs italic text-muted-foreground">
        Idealized backtest: no fees, no taxes, no bid/ask spread (v1).
      </p>
    </div>
  )
}

function SummaryItem({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'truncate',
          mono ? 'font-mono text-sm tabular-nums' : 'text-sm',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
