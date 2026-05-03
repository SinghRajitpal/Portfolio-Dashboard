/**
 * POST /api/instruments/search
 *
 * Body: { query: string, limit?: number }
 * Returns: SearchResult[] | DataError (as JSON)
 *
 * Auto-detects input shape:
 * - 12-char ISIN regex match → OpenFIGI lookup (cache-first via isin_lookups table)
 * - Otherwise → YahooProvider text search (keyless)
 *
 * Auth: enforced by proxy.ts (this is NOT in the api/cron exclusion).
 * Phase 3: This route requires authentication via proxy.ts. Plan 01 confirmed proxy
 * DOES match this path (only api/cron is excluded).
 *
 * Error contract: 429 rate_limit, 404 not_found, 400 invalid_input, 503 transient.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isISIN, resolveISIN } from '@/lib/data/openfigi'
import { readCachedISIN, upsertISINMappings } from '@/lib/data/cache-isin'
import { YahooProvider } from '@/lib/data/YahooProvider'
import { isDataError, type DataError } from '@/lib/data/errors'
import type { SearchResult } from '@/lib/data/types'
import type { IMarketDataProvider } from '@/lib/data/IMarketDataProvider'

const RequestSchema = z.object({
  query: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(50).optional(),
})

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

  const { query, limit = 10 } = parsed.data
  const supabase = await createClient()

  // Branch 1: ISIN — auto-detected by regex
  if (isISIN(query)) {
    // Cache-first: check isin_lookups before hitting OpenFIGI
    const cached = await readCachedISIN(supabase, query)
    if (isDataError(cached)) return jsonError(cached)
    if (cached.length > 0) {
      return NextResponse.json(
        cached.map(
          c =>
            ({
              ticker: c.ticker,
              exchange: c.exchange,
              // name not stored in cache; Phase 4 can enrich via YahooProvider if needed
              name: '',
              type: c.security_type ?? '',
              currency: c.currency ?? '',
              isin: c.isin,
            }) satisfies SearchResult,
        ),
      )
    }

    // Cache miss → resolve via OpenFIGI
    const records = await resolveISIN(query)
    if (isDataError(records)) return jsonError(records)

    // Persist mappings for future lookups (ISIN mappings are permanent in v1)
    const upserted = await upsertISINMappings(supabase, query, records)
    if (isDataError(upserted)) return jsonError(upserted)

    // Return all venue listings — Phase 4 disambiguates
    return NextResponse.json(
      records.map(
        r =>
          ({
            ticker: r.ticker,
            exchange: r.exchCode,
            name: r.name,
            type: r.securityType ?? '',
            currency: r.currency ?? '',
            isin: query,
          }) satisfies SearchResult,
      ),
    )
  }

  // Branch 2: Text search via YahooProvider (keyless — no API key required)
  const provider: IMarketDataProvider = new YahooProvider()
  const results = await provider.search(query, { limit })
  if (isDataError(results)) return jsonError(results)
  return NextResponse.json(results)
}

function jsonError(err: DataError) {
  const status =
    err.kind === 'rate_limit'
      ? 429
      : err.kind === 'not_found'
        ? 404
        : err.kind === 'invalid_input'
          ? 400
          : 503 // transient
  return NextResponse.json(err, { status })
}
