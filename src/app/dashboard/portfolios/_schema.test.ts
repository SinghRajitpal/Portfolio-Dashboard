import { describe, it, expect } from 'vitest'
import { PortfolioSchema, PortfolioItemSchema } from './_schema'

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'

function makeItem(weight: number, instrument_id = UUID_A, ticker = 'VT', name = 'Vanguard') {
  return { instrument_id, ticker, name, weight }
}

function makePortfolio(items: Array<ReturnType<typeof makeItem>>, overrides: Record<string, unknown> = {}) {
  return {
    name: 'My Portfolio',
    investment_amount: 10000,
    items,
    ...overrides,
  }
}

describe('PortfolioSchema (PORT-03)', () => {
  it('accepts portfolio with weights summing exactly 100', () => {
    const p = makePortfolio([makeItem(60), makeItem(40, UUID_B, 'AGG', 'iShares')])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(true)
  })

  it('accepts portfolio with weights summing 99.99 (within tolerance)', () => {
    const p = makePortfolio([makeItem(59.99), makeItem(40, UUID_B, 'AGG', 'iShares')])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(true)
  })

  it('rejects portfolio with weights summing 99.98 (outside tolerance)', () => {
    const p = makePortfolio([makeItem(59.98), makeItem(40, UUID_B, 'AGG', 'iShares')])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('items')
    }
  })

  it('accepts portfolio with weights summing 100.01 (within tolerance)', () => {
    const p = makePortfolio([makeItem(60.01), makeItem(40, UUID_B, 'AGG', 'iShares')])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(true)
  })

  it('rejects portfolio with weights summing 100.02 (outside tolerance)', () => {
    const p = makePortfolio([makeItem(60.02), makeItem(40, UUID_B, 'AGG', 'iShares')])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('items')
    }
  })

  it('rejects empty items array (PORT-03 + PORT-01)', () => {
    const p = makePortfolio([])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
  })

  it('rejects negative weights', () => {
    const p = makePortfolio([makeItem(-10), makeItem(110, UUID_B, 'AGG', 'iShares')])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
  })

  it('rejects weight > 100', () => {
    const p = makePortfolio([makeItem(100.5)])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const p = makePortfolio([makeItem(60), makeItem(40, UUID_B, 'AGG', 'iShares')], { name: '' })
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
  })

  it('rejects name > 120 chars', () => {
    const p = makePortfolio(
      [makeItem(60), makeItem(40, UUID_B, 'AGG', 'iShares')],
      { name: 'a'.repeat(121) },
    )
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
  })

  it('rejects investment_amount <= 0', () => {
    const p = makePortfolio([makeItem(60), makeItem(40, UUID_B, 'AGG', 'iShares')], {
      investment_amount: 0,
    })
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
  })

  it('accepts optional id (uuid) and description (max 500)', () => {
    const p = makePortfolio([makeItem(60), makeItem(40, UUID_B, 'AGG', 'iShares')], {
      id: UUID_A,
      description: 'A test portfolio',
    })
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(true)
  })

  it('rejects description > 500 chars', () => {
    const p = makePortfolio([makeItem(60), makeItem(40, UUID_B, 'AGG', 'iShares')], {
      description: 'x'.repeat(501),
    })
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(false)
  })

  it('exposes typed PortfolioItemSchema for individual rows', () => {
    const item = makeItem(50)
    const result = PortfolioItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('infers PortfolioInput type with items array', () => {
    const p = makePortfolio([makeItem(60), makeItem(40, UUID_B, 'AGG', 'iShares')])
    const result = PortfolioSchema.safeParse(p)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Array.isArray(result.data.items)).toBe(true)
      expect(result.data.items[0].weight).toBe(60)
    }
  })
})
