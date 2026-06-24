/**
 * Deterministic SHA-256 of a canonical-JSON encoding of backtest inputs (D-08).
 *
 * Used by the worker to dedupe runs: two BacktestInput payloads that
 * are semantically identical — even with keys in different order — hash
 * to the same value so `backtest_runs.inputs_hash` (UNIQUE) absorbs the
 * upsert and reuses the prior result.
 *
 * Implementation per RESEARCH Pattern 5 (lines 553-573):
 *   - canonicalize() is a 12-line recursive sorted-keys stringifier
 *     (RESEARCH "Don't Hand-Roll": no fast-json-stable-stringify).
 *   - hashInputs() uses crypto.subtle.digest('SHA-256', ...) which is
 *     available in Web Workers, browsers, AND Node 20+ (no polyfill).
 *
 * IMPORTANT: arrays preserve order. Caller is responsible for any
 * upstream sort (e.g., sorting instruments by id before hashing if
 * the order is semantically irrelevant). This module just produces
 * a reproducible byte sequence from whatever it is handed.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-08)
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md Pattern 5
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §inputs-hash.ts
 */

/**
 * Recursively stringify a value with object keys sorted lexicographically.
 * Arrays preserve insertion order. Primitives use the standard JSON.stringify.
 *
 * @example
 *   canonicalize({ b: 1, a: 2 })          // '{"a":2,"b":1}'
 *   canonicalize({ a: { c: 1, b: 2 } })   // '{"a":{"b":2,"c":1}}'
 *   canonicalize([3, 1, 2])               // '[3,1,2]'
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  const keys = Object.keys(value as object).sort()
  return (
    '{' +
    keys
      .map(
        k =>
          JSON.stringify(k) +
          ':' +
          canonicalize((value as Record<string, unknown>)[k]),
      )
      .join(',') +
    '}'
  )
}

/**
 * SHA-256 of the canonical-JSON byte stream of `input`. Returns a 64-char
 * lowercase hex string.
 *
 * Works in Web Workers (via `self.crypto.subtle`), browsers, and Node 20+
 * (via `globalThis.crypto.subtle`). No external dep.
 */
export async function hashInputs(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(input))
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
