'use client'

/**
 * TotalBadge
 *
 * Live Σ% badge for the running weight total. Uses RHF `useWatch` so it
 * re-renders independently of the form fields themselves (no row-render
 * storm).
 *
 * State colors:
 *   |sum - 100| ≤ 0.01  → neutral foreground
 *   |sum - 100| ≤ 5     → amber warning
 *   else                → Swiss-red error
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
import type { PortfolioInput } from '@/app/dashboard/portfolios/_schema'

export type TotalBadgeProps = {
  control: Control<PortfolioInput>
}

export function TotalBadge({ control }: TotalBadgeProps) {
  const items = useWatch({ control, name: 'items' }) ?? []
  const sum = items.reduce(
    (acc: number, it: { weight?: number }) =>
      acc + (Number.isFinite(it.weight) ? Number(it.weight) : 0),
    0,
  )

  const delta = Math.abs(sum - 100)
  const state: 'neutral' | 'warning' | 'error' =
    delta <= 0.01 ? 'neutral' : delta <= 5 ? 'warning' : 'error'

  const colorClass =
    state === 'neutral'
      ? 'text-foreground'
      : state === 'warning'
        ? 'text-amber-600'
        : 'text-[#E3000F]'

  const tooltipText =
    state === 'neutral'
      ? 'Total is exactly 100%.'
      : `Total must be 100%; current: ${sum.toFixed(2)}%`

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              data-state={state}
              className={cn(
                'inline-flex items-baseline gap-1 font-mono text-sm tabular-nums',
                colorClass,
              )}
            >
              <span aria-hidden>Σ</span>
              <span>{sum.toFixed(2)}%</span>
            </span>
          }
        />
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
