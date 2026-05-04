/**
 * Swiss CHF currency formatter using Intl.NumberFormat('de-CH').
 *
 * Note: the thousand separator output by Intl is U+2019 (right single quotation
 * mark), not an ASCII apostrophe. Tests should accept either to remain robust
 * across Node ICU versions.
 */
const formatter = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: 'CHF',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function fmtCHF(amount: number): string {
  return formatter.format(amount)
}
