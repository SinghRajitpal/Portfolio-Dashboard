import { describe, it, expect } from 'vitest'
import { fmtCHF } from './chf-format'

describe('fmtCHF (PORT-04)', () => {
  it("fmtCHF(10000) contains 'CHF', '10', and '000' with Swiss separator (’ or ')", () => {
    const s = fmtCHF(10000)
    expect(s).toMatch(/CHF\s*10[’']000/u)
  })

  it("fmtCHF(10000.5) renders fractional part (.5 with min=0/max=2)", () => {
    // Intl with minimumFractionDigits:0/maximumFractionDigits:2 emits .5 (not .50)
    // for a single-decimal value. The exact 2dp ".50" form requires min=2,
    // which the spec deliberately avoids so integer CHF amounts render clean.
    const s = fmtCHF(10000.5)
    expect(s).toMatch(/10[’']000\.5\b/u)
  })

  it("fmtCHF(10000.55) preserves both decimals", () => {
    const s = fmtCHF(10000.55)
    expect(s).toMatch(/10[’']000\.55$/u)
  })

  it("fmtCHF(1234567.89) contains two Swiss separators", () => {
    const s = fmtCHF(1234567.89)
    // Two thousand-separators between the digits
    const sepCount = (s.match(/[’']/gu) ?? []).length
    expect(sepCount).toBe(2)
    expect(s).toMatch(/1[’']234[’']567/u)
  })

  it('fmtCHF(0) contains "0" and "CHF"', () => {
    const s = fmtCHF(0)
    expect(s).toContain('CHF')
    expect(s).toContain('0')
  })

  it('fmtCHF(-100) contains a negative indicator', () => {
    const s = fmtCHF(-100)
    // Intl may use '-', '−' (U+2212), or wrap in parens; assert one of these signals
    expect(/[\-−]/.test(s) || /\(.+\)/.test(s)).toBe(true)
    expect(s).toContain('100')
  })
})
