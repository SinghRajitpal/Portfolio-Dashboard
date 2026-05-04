import { describe, it } from 'vitest'

describe('normalizeTo100 (PORT-03)', () => {
  it.todo('proportionally rescales [50, 50, 50] to [33.33, 33.33, 33.34]')
  it.todo('handles all zeros without division-by-zero')
  it.todo('rounds to 2 decimal places (NUMERIC(5,2) safety)')
  it.todo('drift correction: result sum is exactly 100.00')
  it.todo('preserves zero entries as zero')
})
