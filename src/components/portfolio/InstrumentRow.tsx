'use client'

/**
 * InstrumentRow
 *
 * Single row inside the PortfolioBuilder's instrument list. Renders ticker,
 * name, weight input, and a remove button. Reads the parent form via
 * `useFormContext` so it can register the weight field directly.
 *
 * Layout: 4-column grid — ticker | name | weight | remove.
 *
 * Highlight state: when `highlighted` is true (e.g., user is hovering a
 * "missing-data" footnote on the metrics strip), the row receives a soft
 * background to draw the user's eye.
 */

import * as React from 'react'
import { XIcon } from 'lucide-react'
import { useFormContext } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type InstrumentRowProps = {
  index: number
  ticker: string
  name: string
  /** RHF field path for this row's weight, e.g. `items.0.weight`. */
  weightFieldName: string
  onRemove: () => void
  highlighted?: boolean
}

export function InstrumentRow({
  ticker,
  name,
  weightFieldName,
  onRemove,
  highlighted,
}: InstrumentRowProps) {
  const { register, formState } = useFormContext()
  // RHF nested field error access: walk `errors.items[index].weight`
  // We don't always have `index` typed, so fall back to a generic lookup
  // by traversing the path on `formState.errors`.
  const error = getNestedError(formState.errors, weightFieldName)

  return (
    <div
      data-highlighted={highlighted ? 'true' : undefined}
      className={cn(
        'grid grid-cols-[80px_1fr_120px_auto] items-center gap-3 border-b border-border/50 py-2 transition-colors',
        highlighted && 'bg-muted/40 ring-1 ring-ring/20',
      )}
    >
      <span className="font-mono text-sm font-semibold tabular-nums">
        {ticker}
      </span>
      <span className="truncate text-sm text-muted-foreground">{name}</span>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step="0.5"
          min={0}
          max={100}
          inputMode="decimal"
          aria-invalid={!!error || undefined}
          aria-label={`Weight for ${ticker}`}
          className="text-right tabular-nums"
          {...register(weightFieldName, { valueAsNumber: true })}
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${ticker}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </div>
  )
}

// -- helpers ----------------------------------------------------------------

function getNestedError(
  errors: Record<string, unknown>,
  path: string,
): { message?: string } | undefined {
  const parts = path.split('.')
  let cur: unknown = errors
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur as { message?: string } | undefined
}
