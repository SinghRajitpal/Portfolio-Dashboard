import type { DataError } from './errors'
import { isDataError } from './errors'

export type RetryOpts = {
  /**
   * Total number of attempts (1 initial + N retries).
   * Default: 4 (1 initial + 3 retries) — delays: 1s, 2s, 4s between retries.
   */
  maxAttempts?: number
  /** Base delay in ms. Default: 1000. Delays: baseDelayMs * 2^(attempt index). */
  baseDelayMs?: number
}

/**
 * Retries a function up to maxAttempts times for transient failures.
 * Delays: baseDelayMs * 2^attempt (so 1s, 2s, 4s with default 1000ms base).
 *
 * Per CONTEXT.md:
 *  - Does NOT retry: rate_limit, not_found, invalid_input — surfaces immediately.
 *  - DOES retry: transient DataErrors AND thrown exceptions (network failures).
 *
 * Default: maxAttempts=4 means 1 initial call + 3 retries with delays [1s, 2s, 4s].
 */
export async function withRetry<T>(
  fn: () => Promise<T | DataError>,
  opts: RetryOpts = {},
): Promise<T | DataError> {
  const max = opts.maxAttempts ?? 4
  const base = opts.baseDelayMs ?? 1000
  let lastError: DataError = { kind: 'transient', message: 'unknown', attempt: 0 }

  for (let attempt = 0; attempt < max; attempt++) {
    try {
      const result = await fn()
      if (isDataError(result)) {
        if (result.kind === 'transient') {
          // Record last transient, stamping the current attempt index
          lastError = { ...result, attempt }
          if (attempt < max - 1) {
            await delay(base * Math.pow(2, attempt))
            continue
          }
          return lastError
        }
        // rate_limit, not_found, invalid_input — surface immediately, no retry
        return result
      }
      return result
    } catch (err) {
      lastError = {
        kind: 'transient',
        message: (err instanceof Error ? err.message : String(err)),
        attempt,
      }
      if (attempt < max - 1) {
        await delay(base * Math.pow(2, attempt))
        continue
      }
      return lastError
    }
  }

  return lastError
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
