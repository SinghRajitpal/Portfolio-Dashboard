'use client'

/**
 * CsvImportDialog
 *
 * File-picker dialog for the "Import CSV" entrypoint. Parses the upload
 * client-side via parsePortfolioCsv (Plan 02), batch-resolves the rows via
 * /api/instruments/csv-resolve, and hands the resolved payload to the preview
 * screen via sessionStorage (URL params are too small for multi-listing
 * alternatives).
 *
 * The dialog never persists a portfolio itself — Save lives on the preview
 * screen, which reuses PortfolioBuilder in 'preview' mode.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parsePortfolioCsv, type CsvRow } from '@/lib/portfolio/parse-csv'
import { isDataError } from '@/lib/data/errors'
import type { CsvResolveResponse } from '@/app/api/instruments/csv-resolve/route'

export type CsvImportDialogProps = {
  open: boolean
  onOpenChange: (b: boolean) => void
}

export const CSV_IMPORT_STORAGE_PREFIX = 'portfolioforge:csv-import:'

export function CsvImportDialog({ open, onOpenChange }: CsvImportDialogProps) {
  const router = useRouter()
  const [rows, setRows] = React.useState<CsvRow[]>([])
  const [errors, setErrors] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // Reset local state whenever the dialog re-opens. Keeps stale rows from a
  // previously-cancelled session out of the UI.
  React.useEffect(() => {
    if (!open) {
      setRows([])
      setErrors([])
      setSubmitting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [open])

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        setRows([])
        setErrors([])
        return
      }
      const result = await parsePortfolioCsv(file)
      setRows(result.rows)
      setErrors(result.errors)
    },
    [],
  )

  const handleContinue = React.useCallback(async () => {
    if (rows.length === 0) return
    setSubmitting(true)
    try {
      const response = await fetch('/api/instruments/csv-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const json = (await response.json()) as unknown

      if (!response.ok || isDataError(json)) {
        const message = isDataError(json)
          ? json.message
          : 'Could not resolve CSV; try again'
        toast.error(message)
        return
      }

      const payload = json as CsvResolveResponse
      const key =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

      const stored = {
        resolved: payload.resolved,
        parseErrors: errors.length > 0 ? errors : undefined,
      }
      try {
        sessionStorage.setItem(
          `${CSV_IMPORT_STORAGE_PREFIX}${key}`,
          JSON.stringify(stored),
        )
      } catch {
        toast.error('Could not stage CSV preview (sessionStorage unavailable)')
        return
      }

      onOpenChange(false)
      router.push(`/dashboard/portfolios/new?from=csv&key=${key}`)
    } catch {
      toast.error('Could not resolve CSV; try again')
    } finally {
      setSubmitting(false)
    }
  }, [rows, errors, onOpenChange, router])

  const continueDisabled = rows.length === 0 || submitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import portfolio from CSV</DialogTitle>
          <DialogDescription>
            CSV requires a header row with <code>ticker</code> and{' '}
            <code>weight</code> columns. Optional <code>exchange</code> column
            for explicit listing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            aria-label="CSV file"
          />

          {rows.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Parsed {rows.length} row{rows.length === 1 ? '' : 's'}.
            </p>
          ) : null}

          {errors.length > 0 ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
            >
              <p className="mb-1 font-medium">
                Parse errors ({errors.length}):
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                {errors.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {errors.length > 8 ? (
                  <li>…and {errors.length - 8} more</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleContinue()}
            disabled={continueDisabled}
            aria-busy={submitting}
          >
            {submitting ? 'Resolving…' : 'Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
