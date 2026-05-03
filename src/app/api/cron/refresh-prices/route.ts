/**
 * GET /api/cron/refresh-prices?exchange=US|SW|LSE
 *
 * Auth: CRON_SECRET via Authorization: Bearer header. Vercel Cron sends this
 * automatically when CRON_SECRET is set in the Vercel project env.
 *
 * Bypassed by proxy.ts matcher (api/cron is excluded in the negative lookahead
 * per Plan 01 — see src/proxy.ts config.matcher). Cron requests arrive directly
 * at this route handler without the Supabase SSR proxy wrapping them.
 *
 * Strategy: per-ticker YahooProvider.getEod() loop.
 * Yahoo has no bulk endpoint — iterate tracked instruments on the exchange and
 * call getEod(ticker, { from: today, to: today }) for each one.
 * With ~14 tickers × 250ms throttle = ~3.5s total — well within Vercel timeout.
 *
 * Service-role client used because cron runs server-side with no user session.
 *
 * Exchanges supported: US, SW, LSE (added so VWRL.LSE and IWDA.LSE refresh nightly).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { YahooProvider } from '@/lib/data/YahooProvider'
import { upsertPrices } from '@/lib/data/cache-prices'
import { isDataError } from '@/lib/data/errors'

// LSE added so VWRL.LSE and IWDA.LSE refresh nightly (Yahoo supports .L suffix via symbol-map)
const ALLOWED_EXCHANGES = new Set(['US', 'SW', 'LSE'])

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
      skipped: [],
      note: 'No tracked instruments yet',
    })
  }

  // 5. Per-ticker YahooProvider.getEod loop
  // Yahoo is keyless — no API key required (STATE.md decision: YahooProvider for daily incremental)
  const provider = new YahooProvider()
  const today = new Date().toISOString().split('T')[0]

  let upsertedTotal = 0
  const skipped: string[] = []

  for (const t of tracked) {
    // Pass from=today, to=today — Yahoo returns the latest trading day even if
    // today is a weekend or holiday. The symbol mapper (toYahooSymbol) translates
    // VWRL.LSE → VWRL.L and IWDA.LSE → IWDA.L automatically inside YahooProvider.
    const rows = await provider.getEod(t.ticker as string, { from: today, to: today })
    if (isDataError(rows)) {
      skipped.push(`${t.ticker}: ${rows.kind} ${rows.message}`)
      continue
    }
    if (rows.length === 0) continue // no trading on this day

    const result = await upsertPrices(supabase, t.id as string, rows)
    if (isDataError(result)) {
      skipped.push(`${t.ticker}: upsert ${result.message}`)
    } else {
      upsertedTotal += result.upserted
    }

    // Throttle to avoid Yahoo Finance anonymous rate-limiting.
    // 250ms × 14 tickers = ~3.5s total — well within Vercel's 10s function timeout.
    await new Promise(r => setTimeout(r, 250))
  }

  return NextResponse.json({
    ok: true,
    exchange,
    date: today,
    tracked: tracked.length,
    attempted: tracked.length,
    upserted: upsertedTotal,
    skipped,
  })
}
