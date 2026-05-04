'use client'

/**
 * DeletePortfolioButton
 *
 * Trash icon button wrapped in an AlertDialog confirmation. Calls the
 * deletePortfolio Server Action via FormData. Uses useTransition so the
 * destructive action shows a pending state without blocking the rest of
 * the UI. On success: sonner toast + router.refresh() so the list re-renders
 * without the deleted row.
 *
 * stopPropagation: the button is rendered inside a row-wide Link in
 * PortfoliosListClient. Both the trigger click and the dialog action click
 * stop propagation so the row's navigation never fires.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deletePortfolio } from '../_actions'

export type DeletePortfolioButtonProps = {
  id: string
  name: string
}

export function DeletePortfolioButton({
  id,
  name,
}: DeletePortfolioButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()

  const handleDelete = React.useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation()
      const fd = new FormData()
      fd.append('id', id)
      startTransition(async () => {
        const r = await deletePortfolio(fd)
        if (r.ok) {
          toast.success('Portfolio deleted')
          setOpen(false)
          router.refresh()
        } else {
          toast.error(r.error)
        }
      })
    },
    [id, router],
  )

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. All instruments and weights will be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={(e) => e.stopPropagation()}
            disabled={isPending}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => handleDelete(e)}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
