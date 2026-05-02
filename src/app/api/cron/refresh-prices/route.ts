/**
 * GET /api/cron/refresh-prices?exchange=US|SW
 *
 * Auth: CRON_SECRET via Authorization: Bearer header. Vercel Cron sends this
 * automatically when CRON_SECRET is set in the Vercel project env.
 *
 * Bypassed by proxy.ts matcher (api/cron is excluded in the negative lookahead
 * per Plan 01 — see src/proxy.ts config.matcher). Cron requests arrive directly
 * at this route handler without the Supabase SSR proxy wrapping them.
 *
 * Strategy: bulkEod(exchange, today) returns all tickers on the exchange.
 * Filter to tracked tickers (instruments table where exchange = X).
 * Upsert matching rows. One bulk call covers many tickers — fits the 20/day budget.
 *
 * Service-role client used because cron runs server-side with no user session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { EODHDProvider } from '@/lib/data/EODHDProvider'
import { upsertPrices } from '@/lib/data/cache-prices'
import { isDataError } from '@/lib/data/errors'

const ALLOWED_EXCHANGES = new Set(['US', 'SW'])

export async function GET(request: NextRequest) {
  // 1. Auth — CRON_SECRET must be present and match the Bearer token
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Validate exchange param
  // Use URL constructor for compatibility: NextRequest.nextUrl works in Next.js
  // runtime; standard URL constructor works in both runtime and vitest unit tests.
  const exchange = new URL(request.url).searchParams.get('exchange')
  if (!exchange || !ALLOWED_EXCHANGES.has(exchange)) {
    return NextResponse.json(
      {
        kind: 'invalid_input',
        message: `exchange must be one of ${[...ALLOWED_EXCHANGES].join(', ')}`,
      },
      { status: 400 },
    )
  }

  // 3. Service-role Supabase client (cron has no user session)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json(
      { kind: 'transient', message: 'Server config missing', attempt: 0 },
      { status: 503 },
    )
  }
  const supabase = createServiceClient(url, key, { auth: { persistSession: false } })

  // 4. Fetch tracked tickers for this exchange
  const { data: tracked, error: trackedErr } = await supabase
    .from('instruments')
    .select('id, ticker')
    .eq('exchange', exchange)
  if (trackedErr) {
    return NextResponse.json(
      { kind: 'transient', message: trackedErr.message, attempt: 0 },
      { status: 503 },
    )
  }
  if (!tracked || tracked.length === 0) {
    return NextResponse.json({
      ok: true,
      exchange,
      tracked: 0,
      upserted: 0,
      note: 'No tracked instruments yet',
    })
  }

  // 5. Bulk EOD for today
  const apiKey = process.env.EODHD_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { kind: 'transient', message: 'Missing EODHD_API_KEY', attempt: 0 },
      { status: 503 },
    )
  }
  const provider = new EODHDProvider(apiKey)
  const today = new Date().toISOString().split('T')[0]
  const bulkRows = await provider.bulkEod(exchange as 'US' | 'SW', today)
  if (isDataError(bulkRows)) {
    return NextResponse.json(bulkRows, { status: bulkRows.kind === 'rate_limit' ? 429 : 503 })
  }

  // 6. Filter to tracked tickers and upsert per instrument
  // EODHD bulk row uses `code` field (no exchange suffix). Tracked.ticker is "SPY.US" — strip suffix.
  const trackedMap = new Map<string, string>() // code -> instrument_id
  for (const t of tracked) {
    const code = (t.ticker as string).split('.')[0]
    trackedMap.set(code, t.id as string)
  }

  let upsertedTotal = 0
  const skipped: string[] = []
  for (const row of bulkRows) {
    const instrumentId = trackedMap.get(row.code)
    if (!instrumentId) continue
    const result = await upsertPrices(supabase, instrumentId, [
      {
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        adjusted_close: row.adjusted_close,
        volume: row.volume,
      },
    ])
    if (isDataError(result)) skipped.push(`${row.code}: ${result.message}`)
    else upsertedTotal += result.upserted
  }

  return NextResponse.json({
    ok: true,
    exchange,
    date: today,
    tracked: tracked.length,
    returnedByEODHD: bulkRows.length,
    upserted: upsertedTotal,
    skipped,
  })
}
