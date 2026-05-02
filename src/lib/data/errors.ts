export type DataError =
  | { kind: 'rate_limit'; message: string; retryAfter?: Date }
  | { kind: 'not_found'; message: string }
  | { kind: 'transient'; message: string; attempt: number }
  | { kind: 'invalid_input'; message: string }

const ERROR_KINDS = ['rate_limit', 'not_found', 'transient', 'invalid_input'] as const

export function isDataError(v: unknown): v is DataError {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'kind' in v &&
    typeof (v as { kind: unknown }).kind === 'string' &&
    (ERROR_KINDS as readonly string[]).includes((v as { kind: string }).kind)
  )
}
