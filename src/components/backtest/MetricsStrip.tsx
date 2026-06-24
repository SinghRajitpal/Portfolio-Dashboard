'use client'

/**
 * MetricsStrip — sticky 5-stat strip below the equity curve.
 *
 * Direct mirror of `WeightedMetricsStrip` (Phase 4) with the layout flipped
 * to `grid-cols-5` and the 5 backtest stats per CONTEXT D-04:
 *   Total Return | CAGR | Max Drawdown | Sharpe | Volatility
 *
 * D-21: MDD value is wrapped in a Tooltip whose content surfaces the peak
 * date and trough date for the drawdown window.
 *
 * Percentage formatting via Intl.NumberFormat('de-CH') (matches
 * PortfoliosListClient.tsx). Sharpe is rendered as a raw 2-decimal number
 * (no percent suffix).
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-04, D-21)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §MetricsStrip
 *   - src/components/portfolio/WeightedMetricsStrip.tsx (analog)
 */
import * as React from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { BacktestMetrics } from '@/lib/backtest/types'

const pctFmt = new Intl.NumberFormat('de-CH', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatPct(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return pctFmt.format(v)
}

function formatSharpe(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return v.toFixed(2)
}

export type MetricsStripProps = {
  metrics: BacktestMetrics
  className?: string
}

export function MetricsStrip({ metrics, className }: MetricsStripProps) {
  return (
    <TooltipProvider>
      <div
        data-testid="metrics-strip"
        className={cn(
          'grid grid-cols-5 gap-8 border-y border-border/60 bg-background/95 px-1 py-3 backdrop-blur',
          className,
        )}
      >
        <Stat
          label="Total Return"
          value={formatPct(metrics.totalReturn)}
          tooltip="(end_value − start_value) / start_value"
        />
        <Stat
          label="CAGR"
          value={formatPct(metrics.cagr)}
          tooltip="(end/start)^(365.25 / days) − 1"
        />
        <Stat
          label="Max Drawdown"
          value={formatPct(metrics.maxDrawdown)}
          tooltip={
            <span>
              Peak: <span className="tabular-nums">{metrics.mddPeakDate}</span>
              {' · '}
              Trough: <span className="tabular-nums">{metrics.mddTroughDate}</span>
            </span>
          }
        />
        <Stat
          label="Sharpe"
          value={formatSharpe(metrics.sharpe)}
          tooltip="mean(daily_excess) / stdev(daily_excess) × √252; risk-free = SNB CHF policy rate"
        />
        <Stat
          label="Volatility"
          value={formatPct(metrics.vol)}
          tooltip="stdev(daily_returns) × √252"
        />
      </div>
    </TooltipProvider>
  )
}

type StatProps = {
  label: string
  value: string
  tooltip: React.ReactNode
}

function Stat({ label, value, tooltip }: StatProps) {
  return (
    <div data-testid="metrics-strip-stat" className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="cursor-help font-mono text-2xl tabular-nums">
              {value}
            </span>
          }
        />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  )
}
