import { z } from 'zod'
import type { DataError } from './errors'

const FrankfurterRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: z.string(),
  rates: z.record(z.string(), z.number().finite()),
})

export type FrankfurterRow = z.infer<typeof FrankfurterRowSchema>

/**
 * Parse an NDJSON string (one JSON object per line) into FrankfurterRow array.
 * Empty lines and trailing newlines are silently skipped.
 * Lines that fail Zod validation (e.g. null/NaN rates) are dropped.
 */
export function parseNdjson(text: string): FrankfurterRow[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => {
      try {
        return FrankfurterRowSchema.parse(JSON.parse(l))
      } catch {
        return null
      }
    })
    .filter((r): r is FrankfurterRow => r !== null)
}

/**
 * Fetch CHF base rates from the Frankfurter API.
 * No API key required. No rate limits.
 * Uses Accept: application/x-ndjson for efficient streaming-compatible response.
 *
 * Storage convention: base=CHF, quote=USD/EUR/GBP.
 * Backtest engine reads `rate` to convert FROM quote TO CHF (multiply by 1/rate)
 * or FROM CHF TO quote (multiply by rate). Single direction stored; consumers compute reciprocals.
 */
export async function fetchFrankfurterRates(opts: {
  from: string
  to: string
  base: string
  quotes: string[]
}): Promise<FrankfurterRow[] | DataError> {
  const url = new URL('https://api.frankfurter.dev/v2/rates')
  url.searchParams.set('from', opts.from)
  url.searchParams.set('to', opts.to)
  url.searchParams.set('base', opts.base)
  url.searchParams.set('quotes', opts.quotes.join(','))

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/x-ndjson' },
    })
    if (res.status >= 500) {
      return { kind: 'transient', message: `Frankfurter ${res.status}`, attempt: 1 }
    }
    if (res.status >= 400) {
      return {
        kind: 'invalid_input',
        message: `Frankfurter ${res.status}: ${await res.text()}`,
      }
    }
    const text = await res.text()
    return parseNdjson(text)
  } catch (err) {
    return { kind: 'transient', message: (err as Error).message, attempt: 1 }
  }
}
