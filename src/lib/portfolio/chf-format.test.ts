import { describe, it } from 'vitest'

describe('fmtCHF (PORT-04)', () => {
  it.todo("fmtCHF(10000) returns 'CHF 10’000' or 'CHF 10\\'000' (Swiss apostrophe)")
  it.todo("fmtCHF(10000.5) returns 'CHF 10\\'000.50'")
  it.todo("fmtCHF(1234567.89) returns 'CHF 1\\'234\\'567.89'")
  it.todo('fmtCHF(0) returns CHF 0')
  it.todo('handles negative amounts')
})
