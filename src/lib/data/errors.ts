/**
 * Discriminated union error contract for the market data pipeline.
 * All public pipeline functions return `data | DataError`.
 * Phase 4 pattern-matches on `kind` to render appropriate UI.
 */
export type DataError =
  | { kind: 'rate_limit'; message: string; retryAfter?: Date }
  | { kind: 'not_found'; message: string }
  | { kind: 'transient'; message: string; attempt: number }
  | { kind: 'invalid_input'; message: string }

const VALID_KINDS = new Set<string>(['rate_limit', 'not_found', 'transient', 'invalid_input'])

export function isDataError(v: unknown): v is DataError {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'kind' in v &&
    VALID_KINDS.has((v as { kind: unknown }).kind as string)
  )
}
