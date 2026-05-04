'use client'

/**
 * PortfolioBuilderClient
 *
 * Thin wrapper that owns the Server Action call lifecycle for the reusable
 * PortfolioBuilder. Does NOT touch DB or RPC directly.
 *
 * Save flow:
 *   onSubmit(data) → FormData(payload=JSON) → savePortfolio(_prev, fd)
 *     → ok:true:  toast.success + router.push('/dashboard/portfolios')
 *     → ok:false: setErrorMessage + toast.error (builder renders banner)
 *
 * useTransition keeps the Save button in a pending state without blocking
 * keystrokes. The builder itself owns mergedMeta, so this wrapper passes
 * `instrumentsMeta` straight through.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { PortfolioBuilder, type InstrumentMetaMap } from '@/components/portfolio/PortfolioBuilder'
import type { PortfolioInput } from '../_schema'
import { savePortfolio } from '../_actions'

export type PortfolioBuilderClientProps = {
  mode: 'create' | 'edit'
  initialData?: PortfolioInput
  instrumentsMeta: InstrumentMetaMap
}

export function PortfolioBuilderClient({
  mode,
  initialData,
  instrumentsMeta,
}: PortfolioBuilderClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const handleSubmit = React.useCallback(
    async (data: PortfolioInput) => {
      // Clear any prior error so the banner doesn't linger across attempts.
      setErrorMessage(null)
      // Wrap the action call in startTransition so React serialises pending
      // state with the action lifecycle. We await a manual deferred so the
      // outer form's disabled/saving prop is driven from isPending.
      await new Promise<void>((resolve) => {
        startTransition(async () => {
          const fd = new FormData()
          fd.append('payload', JSON.stringify(data))
          const r = await savePortfolio(null, fd)
          if (r.ok) {
            toast.success(
              mode === 'create' ? 'Portfolio created' : 'Portfolio saved',
            )
            router.push('/dashboard/portfolios')
          } else {
            setErrorMessage(r.error)
            toast.error(r.error)
          }
          resolve()
        })
      })
    },
    [mode, router],
  )

  return (
    <PortfolioBuilder
      mode={mode}
      initialData={initialData}
      instrumentsMeta={instrumentsMeta}
      onSubmit={handleSubmit}
      saving={isPending}
      errorMessage={errorMessage}
    />
  )
}
