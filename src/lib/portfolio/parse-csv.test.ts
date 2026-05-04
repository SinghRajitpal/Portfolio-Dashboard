import { describe, it, expect } from 'vitest'
import { parsePortfolioCsv } from './parse-csv'

function makeFile(content: string, name = 'test.csv'): File {
  // Node 20 has global File; if not, wrap a Blob with name/lastModified.
  try {
    return new File([content], name, { type: 'text/csv' })
  } catch {
    const blob = new Blob([content], { type: 'text/csv' })
    return Object.assign(blob, { name, lastModified: Date.now() }) as unknown as File
  }
}

describe('parsePortfolioCsv (PORT-08)', () => {
  it('parses well-formed CSV with ticker,weight headers', async () => {
    const file = makeFile('ticker,weight\nVT,60\nAGG,40\n')
    const { rows, errors } = await parsePortfolioCsv(file)
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { ticker: 'VT', weight: 60 },
      { ticker: 'AGG', weight: 40 },
    ])
  })

  it('handles optional exchange column', async () => {
    const file = makeFile('ticker,weight,exchange\nVWCE,100,SW\n')
    const { rows, errors } = await parsePortfolioCsv(file)
    expect(errors).toEqual([])
    expect(rows).toEqual([{ ticker: 'VWCE', weight: 100, exchange: 'SW' }])
  })

  it('case-insensitive headers (TICKER, Weight)', async () => {
    const file = makeFile('TICKER,Weight\nVT,60\nAGG,40\n')
    const { rows, errors } = await parsePortfolioCsv(file)
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { ticker: 'VT', weight: 60 },
      { ticker: 'AGG', weight: 40 },
    ])
  })

  it('rejects non-numeric weight (row goes to errors[], not rows[])', async () => {
    const file = makeFile('ticker,weight\nVT,sixty\nAGG,40\n')
    const { rows, errors } = await parsePortfolioCsv(file)
    expect(rows).toEqual([{ ticker: 'AGG', weight: 40 }])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/Row 2/i)
  })

  it('rejects rows missing ticker', async () => {
    const file = makeFile('ticker,weight\n,60\nAGG,40\n')
    const { rows, errors } = await parsePortfolioCsv(file)
    expect(rows).toEqual([{ ticker: 'AGG', weight: 40 }])
    expect(errors.length).toBeGreaterThan(0)
  })

  it('handles CRLF line endings and quoted fields', async () => {
    const file = makeFile('ticker,weight\r\n"VT","60"\r\n"AGG","40"\r\n')
    const { rows, errors } = await parsePortfolioCsv(file)
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { ticker: 'VT', weight: 60 },
      { ticker: 'AGG', weight: 40 },
    ])
  })

  it('skips empty lines (papaparse skipEmptyLines)', async () => {
    const file = makeFile('ticker,weight\nVT,60\n\nAGG,40\n')
    const { rows, errors } = await parsePortfolioCsv(file)
    expect(rows).toEqual([
      { ticker: 'VT', weight: 60 },
      { ticker: 'AGG', weight: 40 },
    ])
    expect(errors).toEqual([])
  })

  it('does not throw — always resolves with the result object', async () => {
    const file = makeFile('total garbage that is not csv at all')
    const result = await parsePortfolioCsv(file)
    expect(result).toBeDefined()
    expect(Array.isArray(result.rows)).toBe(true)
    expect(Array.isArray(result.errors)).toBe(true)
  })
})
