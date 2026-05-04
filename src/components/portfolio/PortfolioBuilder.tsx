'use client'

/**
 * PortfolioBuilder
 *
 * Reusable client-side editor for portfolios. Drives create / edit / template
 * preview / CSV preview flows by accepting `mode` + `initialData`. Owns RHF
 * form state, validates with `PortfolioSchema` (Plan 02), and delegates
 * persistence to the parent through `onSubmit(PortfolioInput)`.
 *
 * Critical:
 *   - Does NOT call any server action or DB query directly.
 *   - Maintains a local `mergedMeta` state initialised from the
 *     `instrumentsMeta` prop and extended each time the combobox resolves a
 *     new instrument. Plan 05 wires `instrumentsMeta` to seeded server-side
 *     metadata; Plan 04 ensures newly-added instruments contribute to the
 *     live metrics strip without a post-hoc patch.
 */

import * as React from 'react'
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
  type SubmitHandler,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import {
  PortfolioSchema,
  type PortfolioInput,
} from '@/app/dashboard/portfolios/_schema'
import { fmtCHF } from '@/lib/portfolio/chf-format'
import { normalizeTo100 } from '@/lib/portfolio/normalize-weights'

import { InstrumentCombobox, type SelectedInstrument } from './InstrumentCombobox'
import { InstrumentRow } from './InstrumentRow'
import { TotalBadge } from './TotalBadge'
import { WeightedMetricsStrip } from './WeightedMetricsStrip'

export type PortfolioBuilderMode = 'create' | 'edit' | 'preview'

export type InstrumentMetaMap = Record<
  string,
  { expense_ratio: number | null; dividend_yield: number | null }
>

export type PortfolioBuilderProps = {
  mode: PortfolioBuilderMode
  /** Edit pre-fill OR template/CSV seed. */
  initialData?: PortfolioInput
  /** Server-supplied metadata for already-known instruments. */
  instrumentsMeta: InstrumentMetaMap
  onSubmit: (data: PortfolioInput) => Promise<void>
  onCancel?: () => void
  /** Defaults: 'Save' (create) / 'Save changes' (edit) / 'Save imported portfolio' (preview). */
  submitLabel?: string
  /** Parent-controlled pending state (e.g. Server Action transition). */
  saving?: boolean
  /** Parent-controlled error to display above the form. */
  errorMessage?: string | null
  /** Optional custom blank defaults (mostly used in tests). */
  defaultInvestmentAmount?: number
}

const DEFAULT_INVESTMENT_AMOUNT = 10_000

export function PortfolioBuilder({
  mode,
  initialData,
  instrumentsMeta,
  onSubmit,
  onCancel,
  submitLabel,
  saving = false,
  errorMessage = null,
  defaultInvestmentAmount = DEFAULT_INVESTMENT_AMOUNT,
}: PortfolioBuilderProps) {
  const router = useRouter()

  // Local merged-meta map: starts from props, extends as the combobox resolves
  // new instruments. Drives the WeightedMetricsStrip so newly-added rows
  // immediately contribute to the live metrics.
  const [mergedMeta, setMergedMeta] = React.useState<InstrumentMetaMap>(
    () => ({ ...instrumentsMeta }),
  )
  React.useEffect(() => {
    setMergedMeta(prev => ({ ...prev, ...instrumentsMeta }))
  }, [instrumentsMeta])

  const [highlightedIds, setHighlightedIds] = React.useState<string[]>([])

  const methods = useForm<PortfolioInput>({
    resolver: zodResolver(PortfolioSchema),
    defaultValues:
      initialData ??
      ({
        name: '',
        description: '',
        investment_amount: defaultInvestmentAmount,
        items: [],
      } as PortfolioInput),
    // 'all' so isValid is computed both on mount and on every change —
    // critical for the template-seed flow where the form is pre-filled
    // with valid data and the user clicks Save without making a change.
    mode: 'all',
  })

  const {
    control,
    handleSubmit,
    register,
    formState,
    getValues,
    setValue,
    reset,
  } = methods

  // Re-seed when initialData changes (e.g., template selected upstream).
  React.useEffect(() => {
    if (initialData) {
      reset(initialData)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData])

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const handleComboboxSelect = React.useCallback(
    (sel: SelectedInstrument) => {
      // Extend mergedMeta first so the metrics strip picks up the new id
      // immediately on the next render.
      setMergedMeta(prev => ({
        ...prev,
        [sel.instrument_id]: {
          expense_ratio: sel.expense_ratio,
          dividend_yield: sel.dividend_yield,
        },
      }))
      append({
        instrument_id: sel.instrument_id,
        ticker: sel.ticker,
        name: sel.name,
        weight: 0,
      })
    },
    [append],
  )

  const handleNormalize = React.useCallback(() => {
    const current = getValues('items') ?? []
    if (current.length === 0) return
    const normalized = normalizeTo100(current.map(it => Number(it.weight) || 0))
    normalized.forEach((w, idx) => {
      setValue(`items.${idx}.weight`, w, {
        shouldDirty: true,
        shouldValidate: true,
      })
    })
  }, [getValues, setValue])

  const handleCancel = React.useCallback(() => {
    if (onCancel) {
      onCancel()
      return
    }
    if (mode === 'preview') return
    router.push('/dashboard/portfolios')
  }, [onCancel, mode, router])

  const submitHandler: SubmitHandler<PortfolioInput> = async data => {
    await onSubmit(data)
  }

  // Subscribe to live form state via useWatch so derived values
  // (sum-of-weights, helper text, etc.) re-render on every change.
  // useMemo([methods]) is broken — the `methods` ref is stable, so derived
  // values never updated when weights changed.
  const investmentAmount = useWatch({
    control,
    name: 'investment_amount',
  }) as number | undefined

  const watchedItems = (useWatch({ control, name: 'items' }) ?? []) as Array<{
    ticker?: string
    weight?: number
  }>

  const computedSubmitLabel =
    submitLabel ??
    (mode === 'edit'
      ? 'Save changes'
      : mode === 'preview'
        ? 'Save imported portfolio'
        : 'Save')

  const sumValid = React.useMemo(() => {
    const sum = watchedItems.reduce(
      (a, it) =>
        a + (Number.isFinite(it.weight) ? Number(it.weight) : 0),
      0,
    )
    return Math.abs(sum - 100) <= 0.01
  }, [watchedItems])

  const saveDisabled =
    saving ||
    !formState.isValid ||
    fields.length === 0 ||
    !sumValid

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(submitHandler)}
        className="mx-auto max-w-3xl space-y-6 px-4 py-8"
        noValidate
      >
        {errorMessage ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        ) : null}

        <header className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="portfolio-name">Name</Label>
            <Input
              id="portfolio-name"
              type="text"
              placeholder="My portfolio"
              autoComplete="off"
              aria-invalid={!!formState.errors.name || undefined}
              {...register('name')}
            />
            {formState.errors.name?.message ? (
              <p className="text-xs text-destructive">
                {String(formState.errors.name.message)}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="portfolio-description">Description (optional)</Label>
            <Textarea
              id="portfolio-description"
              rows={2}
              placeholder="Notes for yourself"
              {...register('description')}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="portfolio-investment">Investment amount (CHF)</Label>
            <Controller
              control={control}
              name="investment_amount"
              render={({ field }) => (
                <Input
                  id="portfolio-investment"
                  type="number"
                  step="100"
                  min={0}
                  inputMode="decimal"
                  value={Number.isFinite(field.value) ? field.value : ''}
                  onChange={e =>
                    field.onChange(
                      e.target.value === '' ? 0 : Number(e.target.value),
                    )
                  }
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  aria-invalid={
                    !!formState.errors.investment_amount || undefined
                  }
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              {fmtCHF(Number(investmentAmount) || 0)}
            </p>
            {formState.errors.investment_amount?.message ? (
              <p className="text-xs text-destructive">
                {String(formState.errors.investment_amount.message)}
              </p>
            ) : null}
          </div>
        </header>

        <WeightedMetricsStrip
          control={control}
          instrumentsMeta={mergedMeta}
          onHighlightIds={setHighlightedIds}
        />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Instruments
            </h2>
            <div className="flex items-center gap-3">
              <TotalBadge control={control} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNormalize}
                disabled={fields.length === 0}
              >
                Normalize to 100%
              </Button>
            </div>
          </div>

          {fields.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              No instruments yet. Use the search below to add one.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {fields.map((f, index) => {
                const item = f as unknown as PortfolioInput['items'][number] & {
                  id: string
                }
                return (
                  <InstrumentRow
                    key={f.id}
                    index={index}
                    ticker={item.ticker}
                    name={item.name}
                    weightFieldName={`items.${index}.weight`}
                    onRemove={() => remove(index)}
                    highlighted={highlightedIds.includes(item.instrument_id)}
                  />
                )
              })}
            </div>
          )}

          {typeof formState.errors.items?.message === 'string' ? (
            <p className="text-xs text-destructive">
              {formState.errors.items.message}
            </p>
          ) : null}

          <div className="pt-2">
            <InstrumentCombobox
              excludeTickers={fields.map(
                f =>
                  `${(f as unknown as { ticker?: string }).ticker ?? ''}`,
              )}
              onSelect={handleComboboxSelect}
            />
          </div>
        </section>

        <footer className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saveDisabled} aria-busy={saving}>
            {saving ? 'Saving…' : computedSubmitLabel}
          </Button>
        </footer>
      </form>
    </FormProvider>
  )
}
