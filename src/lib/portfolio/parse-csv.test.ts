import { describe, it } from 'vitest'

describe('parsePortfolioCsv (PORT-08)', () => {
  it.todo('parses well-formed CSV with ticker,weight headers')
  it.todo('handles optional exchange column')
  it.todo('case-insensitive headers')
  it.todo('rejects rows missing ticker or weight')
  it.todo('rejects non-numeric weight')
  it.todo('handles BOM, CRLF, quoted fields')
  it.todo('returns errors[] for malformed rows without throwing')
})
