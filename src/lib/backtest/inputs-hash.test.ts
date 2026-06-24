/**
 * Tests for src/lib/backtest/inputs-hash.ts (Plan 05-02).
 * Validates the SHA-256 canonical-JSON dedup hash used by D-08.
 * See: 05-RESEARCH.md Pattern 5; 05-PATTERNS.md §inputs-hash.ts.
 */
import { describe, it, expect } from 'vitest'
import { canonicalize, hashInputs } from './inputs-hash'

describe('inputs-hash (D-08)', () => {
  it('canonicalize: key reorder produces identical canonical string', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }))
  })

  it('hashInputs: key reorder produces identical hash', async () => {
    const h1 = await hashInputs({ a: 1, b: 2 })
    const h2 = await hashInputs({ b: 2, a: 1 })
    expect(h1).toBe(h2)
    // SHA-256 returns a 64-char lowercase hex string.
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashInputs: value change produces different hash', async () => {
    const h1 = await hashInputs({ a: 1 })
    const h2 = await hashInputs({ a: 2 })
    expect(h1).not.toBe(h2)
  })

  it('canonicalize: nested objects sort their keys recursively', () => {
    expect(canonicalize({ a: { c: 1, b: 2 } })).toBe('{"a":{"b":2,"c":1}}')
  })

  it('canonicalize: arrays preserve order (elements are NOT sorted)', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]')
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]))
  })
})
