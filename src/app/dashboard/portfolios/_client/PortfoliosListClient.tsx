'use client'

/**
 * PortfoliosListClient
 *
 * Renders the user's portfolios as borderless rows. Empty state shows a
 * centered message + inline "Create your first portfolio" link (the page-level
 * NewPortfolioMenu in the header keeps the primary CTA consistent across
 * empty and populated states).
 *
 * Each row is a Next Link that navigates to the edit page. The trailing
 * DeletePortfolioButton stops click propagation so it doesn't trigger the
 * row navigation.
 */

import * as React from 'react'
import Link from 'next/link'

import type { PortfolioListRow } from '../_queries'
// NOTE: `import type` is erased at compile time per RESEARCH "Pitfall 9" —
// the 'server-only' guard inside _queries.ts cannot leak into the client bundle.
import { DeletePortfolioButton } from './DeletePortfolioButton'

const pctFmt = new Intl.NumberFormat('de-CH', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatPct(v: number | null): string {
  if (v === null) return '—'
  return pctFmt.format(v)
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const now = Date.now()
  const diffMs = then - now
  const diffSec = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const abs = Math.abs(diffSec)
  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 86400 * 365)
    return rtf.format(Math.round(diffSec / (86400 * 30)), 'month')
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year')
}

export type PortfoliosListClientProps = {
  portfolios: PortfolioListRow[]
}

export function PortfoliosListClient({
  portfolios,
}: PortfoliosListClientProps) {
  if (portfolios.length === 0) {
    return (
      <div
        data-testid="portfolios-empty-state"
        className="mx-auto max-w-md py-16 text-center"
      >
        <p className="text-sm text-muted-foreground">
          No portfolios yet — start with a template, blank, or CSV import.
        </p>
        <Link
          href="/dashboard/portfolios/new"
          className="mt-4 inline-block text-sm font-medium underline underline-offset-4 hover:text-foreground"
        >
          Create your first portfolio
        </Link>
      </div>
    )
  }

  return (
    <ul
      data-testid="portfolios-list"
      className="divide-y divide-border/50"
    >
      {portfolios.map((p) => (
        // Overlay-link pattern: the entire row is clickable via an absolutely
        // positioned Link that covers the row's bounding box. Interactive
        // controls (DeletePortfolioButton) sit above the overlay via z-index
        // so their clicks never reach the Link. This avoids the bubbling
        // pitfall where Next.js's Link intercepts mousedown on nested
        // controls regardless of stopPropagation.
        <li
          key={p.id}
          className="group relative grid grid-cols-[2fr_80px_120px_120px_140px_auto] items-center gap-4 px-2 py-4 text-sm transition-colors hover:bg-muted/40"
        >
          <Link
            href={`/dashboard/portfolios/${p.id}/edit`}
            aria-label={p.name}
            className="absolute inset-0 z-0 rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          />

          <span className="pointer-events-none relative z-10 truncate font-medium text-foreground">
            {p.name}
          </span>
          <span className="pointer-events-none relative z-10 text-muted-foreground tabular-nums">
            {p.instrument_count}{' '}
            <span className="text-xs">
              {p.instrument_count === 1 ? 'instr.' : 'instr.'}
            </span>
          </span>
          <span
            className="pointer-events-none relative z-10 text-muted-foreground tabular-nums"
            title="Weighted TER"
          >
            {formatPct(p.weighted_ter)}
          </span>
          <span
            className="pointer-events-none relative z-10 text-muted-foreground tabular-nums"
            title="Weighted yield"
          >
            {formatPct(p.weighted_yield)}
          </span>
          <span className="pointer-events-none relative z-10 text-xs text-muted-foreground">
            {formatRelative(p.updated_at)}
          </span>
          {/* Interactive control sits ABOVE the Link overlay so its click
              never bubbles to the Link. No stopPropagation needed. */}
          <span className="relative z-10 justify-self-end">
            <DeletePortfolioButton id={p.id} name={p.name} />
          </span>
        </li>
      ))}
    </ul>
  )
}
