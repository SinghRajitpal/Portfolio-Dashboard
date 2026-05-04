import { describe, it } from 'vitest'

describe('PortfolioSchema (PORT-03)', () => {
  it.todo('rejects portfolio with weights summing < 99.99')
  it.todo('rejects portfolio with weights summing > 100.01')
  it.todo('accepts portfolio with weights summing exactly 100')
  it.todo('accepts portfolio with weights summing 99.99–100.01 (tolerance)')
  it.todo('rejects empty items array (PORT-03 + PORT-01: at least one instrument)')
  it.todo('rejects negative weights')
  it.todo('rejects weight > 100')
  it.todo('rejects empty name')
  it.todo('rejects investment_amount <= 0')
})
