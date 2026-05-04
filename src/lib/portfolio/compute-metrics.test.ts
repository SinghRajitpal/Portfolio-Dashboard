import { describe, it } from 'vitest'

describe('computeMetrics (PORT-05, PORT-06)', () => {
  it.todo('weighted TER = sum(weight_i × expense_ratio_i) / 100')
  it.todo('weighted dividend yield = sum(weight_i × dividend_yield_i) / 100')
  it.todo('annualIncome = investment_amount × yield')
  it.todo('null expense_ratio treated as 0 and tracked in terMissingIds')
  it.todo('null dividend_yield treated as 0 and tracked in yieldMissingIds')
  it.todo('returns zero metrics for empty items')
  it.todo('does not double-multiply: expense_ratio is a fraction, weight is percent')
})
