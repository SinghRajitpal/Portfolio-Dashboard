'use client'

/**
 * BacktestSetupBar — the sticky top bar exposing every backtest parameter.
 *
 * Layout per CONTEXT D-01 (single page; setup bar at top):
 *   portfolio Select | start date | end date | DRIP | rebalance Tabs |
 *   benchmark Select | Run button
 *
 * D-02 (auto-rerun on cheap params): cheap-param changes (drip, rebalance,
 * benchmark) flow through onChange and the parent BacktestClient kicks a
 * worker-only rerun without a network round-trip. The Run button is
 * primarily for heavy-param edits that DIDN'T change the params object
 * (e.g., re-fetch fresh data without changing the date range).
 *
 * D-03 (date defaults + earliest-allowed-start helper): the parent computes
 * `earliestAllowedStart` from the selected portfolio's per-instrument
 * `first_date` values (sourced from listPortfoliosForBacktest) and passes
 * it here. We render a helper text under the start input showing the
 * constraining instrument and date.
 *
 * D-22 (benchmark whitelist): the parent passes exactly the 4 curated
 * benchmark options. We prepend a "None" entry whose value is the empty
 * string (mapped to null at the boundary).
 *
 * Controlled component — no internal state. Parent owns BacktestParams.
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-01, D-02, D-03, D-22, D-23)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §BacktestSetupBar
 */
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { BacktestParams, RebalanceFrequency } from '@/lib/backtest/types'

import type { BacktestPortfolioRow, BenchmarkOption } from '@/app/dashboard/backtest/_queries'

const REBALANCE_OPTIONS: RebalanceFrequency[] = [
  'none',
  'annual',
  'semi-annual',
  'quarterly',
]

const REBALANCE_LABEL: Record<RebalanceFrequency, string> = {
  none: 'None',
  annual: 'Annual',
  'semi-annual': 'Semi-annual',
  quarterly: 'Quarterly',
}

export type BacktestSetupBarProps = {
  value: BacktestParams
  onChange: (next: BacktestParams) => void
  onRun: () => void
  portfolios: BacktestPortfolioRow[]
  benchmarks: BenchmarkOption[]
  isLoading: boolean
  /** ISO YYYY-MM-DD; the earliest date the user can pick as start, derived
   *  from the constraining instrument's first_date. */
  earliestAllowedStart: string | null
  /** Ticker of the instrument that constrains earliestAllowedStart (for helper text). */
  earliestConstrainingTicker: string | null
  className?: string
}

export function BacktestSetupBar({
  value,
  onChange,
  onRun,
  portfolios,
  benchmarks,
  isLoading,
  earliestAllowedStart,
  earliestConstrainingTicker,
  className,
}: BacktestSetupBarProps) {
  const handlePortfolio = (next: string) => {
    onChange({ ...value, portfolio_id: next })
  }
  const handleStart = (next: string) => {
    onChange({ ...value, start: next })
  }
  const handleEnd = (next: string) => {
    onChange({ ...value, end: next })
  }
  const handleDrip = (next: boolean) => {
    onChange({ ...value, drip: next })
  }
  const handleRebalance = (next: string) => {
    onChange({ ...value, rebalance: next as RebalanceFrequency })
  }
  const handleBenchmark = (next: string) => {
    // 'None' option is the empty string; map to null at the boundary.
    onChange({ ...value, benchmark_ticker: next === '' ? null : next })
  }

  return (
    <div
      className={cn(
        'sticky top-16 z-10 border-y border-border/60 bg-background/95 px-4 py-3 backdrop-blur',
        className,
      )}
    >
      <div className="flex flex-wrap items-end gap-4">
        {/* Portfolio */}
        <div className="flex min-w-[200px] flex-col gap-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Portfolio
          </Label>
          <Select
            value={value.portfolio_id}
            onValueChange={(v) => handlePortfolio(String(v))}
          >
            <SelectTrigger aria-label="Portfolio" className="min-w-[180px]">
              <SelectValue placeholder="Select a portfolio" />
            </SelectTrigger>
            <SelectContent>
              {portfolios.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Start date */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Start
          </Label>
          <Input
            type="date"
            aria-label="Start date"
            value={value.start}
            min={earliestAllowedStart ?? undefined}
            max={value.end}
            onChange={(e) => handleStart(e.target.value)}
            className="w-[150px]"
          />
          {earliestAllowedStart ? (
            <span className="text-[10px] text-muted-foreground">
              Earliest available: {earliestAllowedStart}
              {earliestConstrainingTicker
                ? ` — constrained by ${earliestConstrainingTicker}`
                : ''}
            </span>
          ) : null}
        </div>

        {/* End date */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            End
          </Label>
          <Input
            type="date"
            aria-label="End date"
            value={value.end}
            min={value.start}
            onChange={(e) => handleEnd(e.target.value)}
            className="w-[150px]"
          />
        </div>

        {/* DRIP toggle */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            DRIP
          </Label>
          <label className="inline-flex h-8 items-center gap-2 rounded-lg border border-input px-2.5 text-sm">
            <input
              type="checkbox"
              checked={value.drip}
              onChange={(e) => handleDrip(e.target.checked)}
              aria-label="Reinvest dividends (DRIP)"
              className="h-4 w-4"
            />
            <span>{value.drip ? 'On' : 'Off'}</span>
          </label>
        </div>

        {/* Rebalance */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Rebalance
          </Label>
          <Tabs
            value={value.rebalance}
            onValueChange={(v) => handleRebalance(String(v))}
          >
            <TabsList>
              {REBALANCE_OPTIONS.map((opt) => (
                <TabsTrigger key={opt} value={opt} aria-label={`Rebalance ${opt}`}>
                  {REBALANCE_LABEL[opt]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Benchmark */}
        <div className="flex min-w-[180px] flex-col gap-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Benchmark
          </Label>
          <Select
            value={value.benchmark_ticker ?? ''}
            onValueChange={(v) => handleBenchmark(String(v))}
          >
            <SelectTrigger aria-label="Benchmark" className="min-w-[160px]">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {benchmarks.map((b) => (
                <SelectItem key={b.ticker} value={b.ticker}>
                  {b.name} ({b.ticker})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Run button */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground opacity-0">
            Run
          </Label>
          <Button
            onClick={onRun}
            disabled={isLoading || !value.portfolio_id}
            className="bg-[#E3000F] text-white hover:bg-[#E3000F]/90"
            aria-label="Run backtest"
          >
            {isLoading ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>
    </div>
  )
}
