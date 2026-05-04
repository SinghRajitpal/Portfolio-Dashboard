/**
 * POST /api/instruments/csv-resolve
 *
 * Batch-resolve a parsed CSV: for each {ticker, weight, exchange?} row, look up
 * the instruments table and classify the row as:
 *   - 'matched'    → exactly one matching instrument
 *   - 'ambiguous'  → >1 matching instrument (only possible when exchange omitted)
 *   - 'unresolved' → 0 matching instruments
 *
 * Body: { rows: { ticker: string; exchange?: string; weight: number }[] }
 * Success (200): { resolved: Resolution[]; parseErrors?: string[] }
 * Error (400/503): DataError discriminated union (same shape as resolve route).
 *
 * Auth: enforced by proxy.ts (this path is outside the /api/cron exclusion).
 *
 * Notes:
 *   - When `exchange` is supplied we DO NOT fall back to a no-exchange query —
 *     the user explicitly asked for that listing; an empty result is unresolved.
 *   - The `instruments` table currently has UNIQUE(ticker), so in production
 *     `ambiguous` is unlikely to occur until the schema relaxes that constraint.
 *     The code path is still here so the preview UI handles future cross-venue
 *     entries without a refactor; tests exercise the path via Playwright route
 *     interception.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { DataError } from '@/lib/data/errors'

const RowSchema = z.object({
  ticker: z.string().trim().min(1).max(40),
  exchange: z.string().trim().max(20).optional(),
  weight: z.number().min(0).max(100),
})

const RequestSchema = z.object({
  rows: z.array(RowSchema).min(1).max(100),
})

export type CsvResolveAlternative = {
  id: string
  ticker: string
  name: string
  exchange: string | null
  currency: string
  expense_ratio: number | null
  dividend_yield: number | null
  isin: string | null
  type: string
}

export type CsvResolution =
  | {
      ticker: string
      weight: number
      status: 'matched'
      instrument: CsvResolveAlternative
    }
  | {
      ticker: string
      weight: number
      status: 'ambiguous'
      alternatives: CsvResolveAlternative[]
    }
  | {
      ticker: string
      weight: number
      status: 'unresolved'
    }

export type CsvResolveResponse = {
  resolved: CsvResolution[]
  parseErrors?: string[]
}

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

type RawInstrumentRow = {
  id: string
  ticker: string
  name: string
  exchange: string | null
  currency: string
  expense_ratio: number | string | null
  dividend_yield: number | string | null
  isin: string | null
  type: string
}

function toAlternative(r: RawInstrumentRow): CsvResolveAlternative {
  return {
    id: r.id,
    ticker: r.ticker,
    name: r.name,
    exchange: r.exchange,
    currency: r.currency,
    expense_ratio: toNumOrNull(r.expense_ratio),
    dividend_yield: toNumOrNull(r.dividend_yield),
    isin: r.isin,
    type: r.type,
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { kind: 'invalid_input', message: 'Body must be valid JSON' } satisfies DataError,
      { status: 400 },
    )
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        kind: 'invalid_input',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      } satisfies DataError,
      { status: 400 },
    )
  }

  // Cast to untyped SupabaseClient so the chained .select(string) doesn't
  // narrow to `never`. Same pattern as /api/instruments/resolve.
  const sb = (await createClient()) as unknown as SupabaseClient

  // Auth check — createClient() returns a cookie-bound client; if no user, we
  // still want a 401 for direct API callers (proxy.ts already redirects HTML).
  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr || !userData?.user) {
    return NextResponse.json(
      { kind: 'invalid_input', message: 'Not authenticated' } satisfies DataError,
      { status: 401 },
    )
  }

  const { rows } = parsed.data
  const resolved: CsvResolution[] = []

  for (const row of rows) {
    let q = sb
      .from('instruments')
      .select(
        'id, ticker, name, exchange, currency, expense_ratio, dividend_yield, isin, type',
      )
      .eq('ticker', row.ticker)
    if (row.exchange) q = q.eq('exchange', row.exchange)

    const { data, error } = await q

    if (error) {
      return NextResponse.json(
        {
          kind: 'transient',
          message: error.message,
          attempt: 1,
        } satisfies DataError,
        { status: 503 },
      )
    }

    const matches = ((data ?? []) as unknown as RawInstrumentRow[]).map(
      toAlternative,
    )

    if (matches.length === 0) {
      resolved.push({
        ticker: row.ticker,
        weight: row.weight,
        status: 'unresolved',
      })
    } else if (matches.length === 1) {
      resolved.push({
        ticker: row.ticker,
        weight: row.weight,
        status: 'matched',
        instrument: matches[0],
      })
    } else {
      resolved.push({
        ticker: row.ticker,
        weight: row.weight,
        status: 'ambiguous',
        alternatives: matches,
      })
    }
  }

  const response: CsvResolveResponse = { resolved }
  return NextResponse.json(response)
}
