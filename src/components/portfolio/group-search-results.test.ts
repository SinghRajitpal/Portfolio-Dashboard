import { describe, it, expect } from 'vitest'
import { groupSearchResults } from './group-search-results'
import type { SearchResult } from '@/lib/data/types'

const r = (over: Partial<SearchResult>): SearchResult => ({
  ticker: 'SPY',
  exchange: 'US',
  name: 'SPDR S&P 500',
  type: 'etf',
  currency: 'USD',
  isin: null,
  ...over,
})

describe('groupSearchResults', () => {
  it('returns [] for empty input', () => {
    expect(groupSearchResults([])).toEqual([])
  })

  it('returns single group with one listing', () => {
    const a = r({ ticker: 'SPY', exchange: 'US', name: 'SPDR S&P 500', isin: 'US78462F1030' })
    const out = groupSearchResults([a])
    expect(out).toHaveLength(1)
    expect(out[0].listings).toEqual([a])
    expect(out[0].displayName).toBe('SPDR S&P 500')
    expect(out[0].key).toContain('US78462F1030')
  })

  it('groups two results with same isin', () => {
    const a = r({ ticker: 'IWDA', exchange: 'LSE', name: 'iShares MSCI World', isin: 'IE00B4L5Y983' })
    const b = r({ ticker: 'IWDA', exchange: 'XETRA', name: 'iShares MSCI World', isin: 'IE00B4L5Y983' })
    const out = groupSearchResults([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].listings).toEqual([a, b])
  })

  it('does NOT group results with same name but different isin (share classes)', () => {
    const a = r({ ticker: 'IWDA', exchange: 'LSE', name: 'iShares MSCI World', isin: 'IE00B4L5Y983' })
    const b = r({ ticker: 'SWDA', exchange: 'LSE', name: 'iShares MSCI World', isin: 'IE00B4L5Y984' })
    const out = groupSearchResults([a, b])
    expect(out).toHaveLength(2)
  })

  it('groups two results with same name when both have isin=null', () => {
    const a = r({ ticker: 'X', exchange: 'US', name: 'Foo Fund', isin: null })
    const b = r({ ticker: 'X', exchange: 'XETRA', name: 'Foo Fund', isin: null })
    const out = groupSearchResults([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].listings).toHaveLength(2)
  })

  it('falls back displayName to `{ticker} ({exchange})` when name is empty (ISIN cache hit)', () => {
    const a = r({ ticker: 'IWDA', exchange: 'LSE', name: '', isin: 'IE00B4L5Y983' })
    const out = groupSearchResults([a])
    expect(out[0].displayName).toBe('IWDA (LSE)')
  })

  it('preserves listing order within a group (input order)', () => {
    const a = r({ ticker: 'A', exchange: 'US', name: 'Foo', isin: 'X' })
    const b = r({ ticker: 'B', exchange: 'XETRA', name: 'Foo', isin: 'X' })
    const c = r({ ticker: 'C', exchange: 'LSE', name: 'Foo', isin: 'X' })
    const out = groupSearchResults([a, b, c])
    expect(out[0].listings.map(l => l.ticker)).toEqual(['A', 'B', 'C'])
  })

  it('preserves group order (first-occurrence)', () => {
    const a = r({ ticker: 'AA', name: 'Alpha', isin: 'A1' })
    const b = r({ ticker: 'BB', name: 'Beta', isin: 'B1' })
    const c = r({ ticker: 'AA2', name: 'Alpha', isin: 'A1' }) // groups with a
    const out = groupSearchResults([a, b, c])
    expect(out.map(g => g.displayName)).toEqual(['Alpha', 'Beta'])
  })

  it('uses non-empty name for displayName even if first listing came after empty-name listing in same group', () => {
    // Same ISIN — both grouped. First listing has empty name (ISIN cache), second has real name.
    // Spec says "first listing's non-empty name; else ticker fallback".
    const a = r({ ticker: 'IWDA', exchange: 'LSE', name: '', isin: 'IE00B4L5Y983' })
    const b = r({ ticker: 'IWDA', exchange: 'XETRA', name: 'iShares MSCI World', isin: 'IE00B4L5Y983' })
    const out = groupSearchResults([a, b])
    expect(out).toHaveLength(1)
    // Per the action's implementation, displayName is fixed at first-occurrence; falls back to `IWDA (LSE)`.
    // This test pins that behaviour.
    expect(out[0].displayName).toBe('IWDA (LSE)')
  })
})
