'use client'

/**
 * TemplatePickerDialog
 *
 * Dialog listing seeded templates. On selection, navigates to
 * /dashboard/portfolios/new?seed=<templateId> — the new-page Server
 * Component reads the seed query param and pre-fills the builder.
 *
 * The dialog is controlled by the parent (NewPortfolioMenu). We close the
 * dialog before navigating so the new page transition isn't visually
 * blocked by the overlay.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TemplateRow } from '../_queries'

export type TemplatePickerDialogProps = {
  open: boolean
  onOpenChange: (b: boolean) => void
  templates: TemplateRow[]
}

function compositionPreview(template: TemplateRow): string {
  return template.items
    .map((it) => `${Math.round(it.weight)}% ${it.ticker}`)
    .join(' · ')
}

export function TemplatePickerDialog({
  open,
  onOpenChange,
  templates,
}: TemplatePickerDialogProps) {
  const router = useRouter()

  const handleSelect = React.useCallback(
    (templateId: string) => {
      onOpenChange(false)
      router.push(`/dashboard/portfolios/new?seed=${templateId}`)
    },
    [onOpenChange, router],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a template</DialogTitle>
          <DialogDescription>
            Start from a popular allocation. You can edit anything before
            saving.
          </DialogDescription>
        </DialogHeader>
        {templates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No templates available.
          </p>
        ) : (
          <ul
            data-testid="template-list"
            className="divide-y divide-border/50"
          >
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(t.id)}
                  className="flex w-full flex-col items-start gap-1 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <span className="text-sm font-medium text-foreground">
                    {t.name}
                  </span>
                  {t.description ? (
                    <span className="text-xs text-muted-foreground">
                      {t.description}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {compositionPreview(t)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
