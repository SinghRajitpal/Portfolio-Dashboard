/**
 * POST /api/instruments/resolve
 *
 * Body: { ticker, exchange?, name?, currency?, type?, isin? }
 * Success (200): { id: string, meta: { expense_ratio: number | null, dividend_yield: number | null } }
 * Error (400/503): DataError discriminated union
 *
 * Behaviour:
 *   1. SELECT existing row matching (ticker, [exchange]). If found → return id + meta.
 *   2. Otherwise upsert a stub row with data_source='resolved' (RLS gates this in
 *      migration 00007). Return id + meta (always null for fresh stubs).
 *
 * `meta` is included from day one so the client combobox can extend its
 * `instrumentsMeta` map without a separate `/api/instruments/meta` round-trip
 * (closes Plan 04↔05 contract drift — see Plan 04-04 critical_constraints).
 *
 * Auth: enforced by proxy.ts (this path is outside the /api/cron exclusion).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { DataError } from '@/lib/data/errors'

const InstrumentTypeEnum = z.enum(['etf', 'stock', 'commodity', 'future', 'bond', 'fund'])

const RequestSchema = z.object({
  ticker: z.string().trim().min(1).max(40),
  exchange: z.string().trim().max(20).optional(),
  name: z.string().trim().max(500).optional(),
  currency: z.string().trim().max(10).optional(),
  type: InstrumentTypeEnum.optional(),
  isin: z.string().trim().length(12).optional().nullable(),
})

type ResolveOk = {
  id: string
  meta: { expense_ratio: number | null; dividend_yield: number | null }
}

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
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
        message: parsed.error.issues.map(i => i.message).join('; '),
      } satisfies DataError,
      { status: 400 },
    )
  }

  const { ticker, exchange, name, currency, type, isin } = parsed.data
  // Cast to untyped SupabaseClient because the generated Database type narrows
  // table Insert/Update generics in a way that confuses upsert here (see
  // src/lib/data/cache-prices.ts for the same pattern). Runtime behaviour is
  // identical; we just sidestep an overly strict generic.
  const sb = (await createClient()) as unknown as SupabaseClient

  // 1) Existing row — return its id + persisted meta.
  let q = sb
    .from('instruments')
    .select('id, expense_ratio, dividend_yield')
    .eq('ticker', ticker)
  if (exchange) q = q.eq('exchange', exchange)
  const { data: existing, error: selectErr } = await q.limit(1).maybeSingle()

  if (selectErr) {
    return NextResponse.json(
      { kind: 'transient', message: selectErr.message, attempt: 1 } satisfies DataError,
      { status: 503 },
    )
  }

  if (existing?.id) {
    const ok: ResolveOk = {
      id: existing.id,
      meta: {
        expense_ratio: toNumOrNull(existing.expense_ratio),
        dividend_yield: toNumOrNull(existing.dividend_yield),
      },
    }
    return NextResponse.json(ok)
  }

  // 2) Upsert a stub. RLS policy (migration 00007) requires data_source='resolved'.
  // ON CONFLICT (ticker) ensures concurrent resolves serialise on the unique
  // constraint and converge on a single row.
  const { data: inserted, error: insertErr } = await sb
    .from('instruments')
    .upsert(
      {
        ticker,
        name: name ?? ticker,
        exchange: exchange ?? null,
        currency: currency ?? 'USD',
        type: type ?? 'etf',
        isin: isin ?? null,
        data_source: 'resolved',
      },
      { onConflict: 'ticker' },
    )
    .select('id, expense_ratio, dividend_yield')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json(
      {
        kind: 'transient',
        message: insertErr?.message ?? 'resolve failed',
        attempt: 1,
      } satisfies DataError,
      { status: 503 },
    )
  }

  const ok: ResolveOk = {
    id: inserted.id,
    meta: {
      expense_ratio: toNumOrNull(inserted.expense_ratio),
      dividend_yield: toNumOrNull(inserted.dividend_yield),
    },
  }
  return NextResponse.json(ok)
}
