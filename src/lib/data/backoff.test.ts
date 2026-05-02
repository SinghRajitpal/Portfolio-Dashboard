import { describe, it, expect, vi } from 'vitest'
import { withRetry } from './backoff'
import type { DataError } from './errors'

describe('withRetry', () => {
  it('Test 1: returns value immediately on first-attempt success', async () => {
    const result = await withRetry(() => Promise.resolve(42))
    expect(result).toBe(42)
  })

  it('Test 2: succeeds after 2 failures then success', async () => {
    let calls = 0
    const fn = async (): Promise<number | DataError> => {
      calls++
      if (calls < 3) throw new Error('transient failure')
      return 99
    }
    const result = await withRetry(fn, { maxAttempts: 4, baseDelayMs: 1 })
    expect(result).toBe(99)
    expect(calls).toBe(3)
  })

  it('Test 3: returns transient DataError after all 4 attempts fail', async () => {
    let calls = 0
    const fn = async (): Promise<number | DataError> => {
      calls++
      throw new Error(`attempt ${calls} failed`)
    }
    const result = await withRetry(fn, { maxAttempts: 4, baseDelayMs: 1 })
    expect(calls).toBe(4)
    expect(result).toMatchObject({ kind: 'transient', attempt: 3 })
  })

  it('Test 4: elapsed time for 3 retries with [1ms, 2ms, 4ms] delays is between 7ms and 50ms', async () => {
    const fn = async (): Promise<number | DataError> => {
      throw new Error('always fails')
    }
    const start = Date.now()
    await withRetry(fn, { maxAttempts: 4, baseDelayMs: 1 })
    const elapsed = Date.now() - start
    // 3 retries with delays 1ms, 2ms, 4ms => at least 7ms total
    expect(elapsed).toBeGreaterThanOrEqual(7)
    expect(elapsed).toBeLessThan(50)
  })

  it('Test 5: does NOT retry on rate_limit DataError — returns immediately', async () => {
    let calls = 0
    const fn = async (): Promise<number | DataError> => {
      calls++
      return { kind: 'rate_limit', message: 'rate limited' }
    }
    const result = await withRetry(fn, { maxAttempts: 4, baseDelayMs: 1 })
    expect(calls).toBe(1)
    expect(result).toMatchObject({ kind: 'rate_limit' })
  })

  it('Test 6: does NOT retry on not_found DataError — returns immediately', async () => {
    let calls = 0
    const fn = async (): Promise<number | DataError> => {
      calls++
      return { kind: 'not_found', message: 'not found' }
    }
    const result = await withRetry(fn, { maxAttempts: 4, baseDelayMs: 1 })
    expect(calls).toBe(1)
    expect(result).toMatchObject({ kind: 'not_found' })
  })

  it('Test 7: DOES retry on transient DataError up to maxAttempts times', async () => {
    let calls = 0
    const fn = async (): Promise<number | DataError> => {
      calls++
      return { kind: 'transient', message: 'server error', attempt: calls - 1 }
    }
    const result = await withRetry(fn, { maxAttempts: 4, baseDelayMs: 1 })
    expect(calls).toBe(4)
    expect(result).toMatchObject({ kind: 'transient', attempt: 3 })
  })
})
