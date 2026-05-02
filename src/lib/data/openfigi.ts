/**
 * OpenFIGI ISIN resolver — hand-rolled REST client (no SDK).
 *
 * Per RESEARCH.md Pattern 5 + Don't Hand-Roll table: pure REST, no SDK.
 * OpenFIGI free tier works without an API key. Set OPENFIGI_API_KEY for higher rate limits.
 *
 * OPENFIGI_BASE_URL env var allows redirecting to a local mock server in integration tests.
 */
import { z } from 'zod'
import type { DataError } from './errors'
import { withRetry, type RetryOpts } from './backoff'

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

export function isISIN(s: string): boolean {
  return ISIN_REGEX.test(s)
}

const OpenFIGIRecordSchema = z.object({
  figi: z.string().nullable().optional(),
  name: z.string(),
  ticker: z.string(),
  exchCode: z.string(),
  securityType: z.string().optional(),
  currency: z.string().optional(),
})

const OpenFIGIResponseSchema = z.array(
  z.union([
    z.object({ data: z.array(OpenFIGIRecordSchema) }),
    z.object({ warning: z.string() }),
    z.object({ error: z.string() }),
  ]),
)

export type OpenFIGIRecord = z.infer<typeof OpenFIGIRecordSchema>

export async function resolveISIN(
  isin: string,
  opts: RetryOpts = {},
): Promise<OpenFIGIRecord[] | DataError> {
  if (!isISIN(isin)) {
    return { kind: 'invalid_input', message: `Not a valid ISIN: ${isin}` }
  }

  const baseUrl =
    process.env.OPENFIGI_BASE_URL ?? 'https://api.openfigi.com'

  return withRetry(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (process.env.OPENFIGI_API_KEY) {
        headers['X-OPENFIGI-APIKEY'] = process.env.OPENFIGI_API_KEY
      }
      const res = await fetch(`${baseUrl}/v3/mapping`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
      })

      if (res.status === 429) {
        const ra = res.headers.get('retry-after')
        return {
          kind: 'rate_limit' as const,
          message: 'OpenFIGI 429 — rate limit exceeded',
          retryAfter: ra ? new Date(Date.now() + parseInt(ra) * 1000) : undefined,
        }
      }
      if (res.status >= 500) {
        return { kind: 'transient' as const, message: `OpenFIGI ${res.status}`, attempt: 0 }
      }
      if (res.status >= 400) {
        return {
          kind: 'invalid_input' as const,
          message: `OpenFIGI ${res.status}: ${await res.text()}`,
        }
      }

      const json = await res.json()
      const parsed = OpenFIGIResponseSchema.parse(json)
      const first = parsed[0]
      if ('warning' in first) return { kind: 'not_found' as const, message: first.warning }
      if ('error' in first) return { kind: 'invalid_input' as const, message: first.error }
      return first.data
    } catch (err) {
      return { kind: 'transient' as const, message: (err as Error).message, attempt: 0 }
    }
  }, opts)
}
