/**
 * GET /api/cron/refresh-snb
 *
 * Quarterly refresh of the snb_rates table. Scheduled via vercel.json
 * (cron expression: first day of every third month at 22:00 UTC). SNB
 * changes the policy rate at most a few times per year (CONTEXT D-19),
 * so monthly granularity + quarterly cadence is sufficient.
 *
 * Auth: CRON_SECRET via Authorization: Bearer header. Vercel Cron sends this
 * automatically when CRON_SECRET is set in the Vercel project env. The handler
 * mirrors the lines 30-35 pattern from /api/cron/refresh-prices/route.ts.
 *
 * Proxy: paths under `api/cron/` are excluded from the proxy.ts
 * negative-lookahead matcher (Phase 3 Plan 06 — inherited). Cron requests
 * arrive directly at this route without the Supabase SSR proxy wrapping them.
 *
 * Auth model: service-role Supabase client. Cron has no user session, and the
 * snb_rates RLS policy only grants SELECT to authenticated users; writes
 * therefore must come from the service role (which bypasses RLS).
 *
 * Implementation: calls `fetchSnbPolicyRate()` (which stitches the pre-2019-06
 * libor midpoint with the post-2019-06 LZ series) then upserts via
 * `upsertSnbRates()`. The upsert is idempotent on `date_month`, so the cron
 * is safe to re-trigger; existing rows are overwritten with the latest values
 * (SNB occasionally revises historical figures).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { fetchSnbPolicyRate } from '@/lib/data/snb'
import { upsertSnbRates } from '@/lib/data/cache-snb'
import { isDataError } from '@/lib/data/errors'

export async function GET(request: NextRequest) {
  // 1. Auth — CRON_SECRET must be present and match the Bearer token
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Service-role Supabase client (cron has no user session)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json(
      { kind: 'transient', message: 'Server config missing', attempt: 0 },
      { status: 503 },
    )
  }
  const supabase = createServiceClient(url, key, { auth: { persistSession: false } })

  // 3. Fetch + stitch the SNB series
  const points = await fetchSnbPolicyRate()
  if (isDataError(points)) {
    return NextResponse.json(points, {
      status: points.kind === 'rate_limit' ? 429 : points.kind === 'not_found' ? 404 : 503,
    })
  }

  // 4. Upsert into snb_rates
  const upsertResult = await upsertSnbRates(supabase, points)
  if (isDataError(upsertResult)) {
    return NextResponse.json(upsertResult, { status: 503 })
  }

  // 5. Source-count summary for the cron log
  const source_counts = points.reduce(
    (acc, p) => {
      acc[p.source] = (acc[p.source] ?? 0) + 1
      return acc
    },
    { LZ: 0, libor_mid: 0 } as { LZ: number; libor_mid: number },
  )

  return NextResponse.json({
    ok: true,
    upserted: upsertResult.upserted,
    source_counts,
  })
}
