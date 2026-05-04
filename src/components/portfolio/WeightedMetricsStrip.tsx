'use client'

/**
 * WeightedMetricsStrip
 *
 * Sticky three-stat strip for the PortfolioBuilder: Weighted TER, Weighted
 * dividend yield, and estimated annual income. Subscribes to the form's
 * `items` and `investment_amount` via `useWatch` (independent re-render path
 * — does NOT cascade re-renders into individual InstrumentRows).
 *
 * Footnotes appear when an item is missing the corresponding meta field;
 * hovering / clicking the footnote calls `onHighlightIds` so the parent can
 * highlight the affected rows.
 */

import * as React from 'react'
import { useWatch, type Control } from 'react-hook-form'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { computeMetrics, type InstrumentMeta } from '@/lib/portfolio/compute-metrics'
import { fmtCHF } from '@/lib/portfolio/chf-format'
import type { PortfolioInput } from '@/app/dashboard/portfolios/_schema'

export type WeightedMetricsStripProps = {
  control: Control<PortfolioInput>
  instrumentsMeta: Record<
    string,
    { expense_ratio: number | null; dividend_yield: number | null }
  >
  onHighlightIds?: (ids: string[]) => void
  className?: string
}

export function WeightedMetricsStrip({
  control,
  instrumentsMeta,
  onHighlightIds,
  className,
}: WeightedMetricsStripProps) {
  const items = useWatch({ control, name: 'items' }) ?? []
  const amount = useWatch({ control, name: 'investment_amount' }) ?? 0

  const metaMap = React.useMemo(() => {
    const m = new Map<string, InstrumentMeta>()
    for (const [id, v] of Object.entries(instrumentsMeta)) m.set(id, v)
    return m
  }, [instrumentsMeta])

  const m = React.useMemo(
    () =>
      computeMetrics(
        items.map((it: { instrument_id: string; weight: number }) => ({
          instrument_id: it.instrument_id,
          weight: Number.isFinite(it.weight) ? Number(it.weight) : 0,
        })),
        Number.isFinite(amount) ? Number(amount) : 0,
        metaMap,
      ),
    [items, amount, metaMap],
  )

  return (
    <TooltipProvider>
      <div
        className={cn(
          'sticky top-16 z-10 grid grid-cols-3 gap-8 border-y border-border/60 bg-background/95 px-1 py-3 backdrop-blur',
          className,
        )}
      >
        <Stat
          label="Weighted TER"
          value={`${(m.ter * 100).toFixed(2)}%`}
          tooltip="Weighted by holding percentage. Σ (weight_i × expense_ratio_i)"
          missingCount={m.terMissingCount}
          missingNoun="expense-ratio"
          onHighlight={() => onHighlightIds?.(m.terMissingIds)}
          onClearHighlight={() => onHighlightIds?.([])}
        />
        <Stat
          label="Weighted Yield"
          value={`${(m.yield * 100).toFixed(2)}%`}
          tooltip="Weighted by holding percentage. Σ (weight_i × dividend_yield_i)"
          missingCount={m.yieldMissingCount}
          missingNoun="dividend-yield"
          onHighlight={() => onHighlightIds?.(m.yieldMissingIds)}
          onClearHighlight={() => onHighlightIds?.([])}
        />
        <Stat
          label="Est. Annual Income"
          value={fmtCHF(m.annualIncome)}
          tooltip={
            'Estimated annual dividend income. Investment amount × Weighted Yield. ' +
            "Past yields don't predict future dividends."
          }
          missingCount={m.yieldMissingCount}
          missingNoun="dividend-yield"
          onHighlight={() => onHighlightIds?.(m.yieldMissingIds)}
          onClearHighlight={() => onHighlightIds?.([])}
        />
      </div>
    </TooltipProvider>
  )
}

type StatProps = {
  label: string
  value: string
  tooltip: string
  missingCount: number
  missingNoun: string
  onHighlight: () => void
  onClearHighlight: () => void
}

function Stat({
  label,
  value,
  tooltip,
  missingCount,
  missingNoun,
  onHighlight,
  onClearHighlight,
}: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="cursor-help text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              {label}
            </span>
          }
        />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
      <span className="font-mono text-2xl tabular-nums">{value}</span>
      {missingCount > 0 ? (
        <button
          type="button"
          className="self-start text-left text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          onMouseEnter={onHighlight}
          onMouseLeave={onClearHighlight}
          onFocus={onHighlight}
          onBlur={onClearHighlight}
          onClick={onHighlight}
        >
          Excludes {missingCount} instrument{missingCount === 1 ? '' : 's'} with no {missingNoun} data
        </button>
      ) : null}
    </div>
  )
}
