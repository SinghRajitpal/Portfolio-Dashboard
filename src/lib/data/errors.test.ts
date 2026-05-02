import { describe, it, expect } from 'vitest'
import { isDataError } from './errors'

describe('isDataError', () => {
  it('returns true for a rate_limit error', () => {
    expect(isDataError({ kind: 'rate_limit', message: 'boom' })).toBe(true)
  })

  it('returns true for a transient error with attempt field', () => {
    expect(isDataError({ kind: 'transient', message: 'x', attempt: 2 })).toBe(true)
  })

  it('returns false for an object with no recognised kind', () => {
    expect(isDataError({ foo: 'bar' })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isDataError(null)).toBe(false)
  })

  it('returns false for an array of price rows (not an error)', () => {
    expect(isDataError([{ date: '2024-01-01', close: 100 }])).toBe(false)
  })

  it('returns false for an object with an unrecognised kind value', () => {
    expect(isDataError({ kind: 'made_up_kind', message: 'x' })).toBe(false)
  })
})
