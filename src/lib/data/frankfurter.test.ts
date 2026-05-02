import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installFetchMock, uninstallFetchMock } from '../../../tests/helpers/mock-fetch'
import { parseNdjson, fetchFrankfurterRates } from './frankfurter'
import type { FrankfurterRow } from './frankfurter'

describe('parseNdjson', () => {
  it('returns array of FrankfurterRow objects', () => {
    const input = [
      '{"date":"1999-01-04","base":"CHF","rates":{"USD":0.6912,"EUR":0.6234,"GBP":0.4321}}',
      '{"date":"2020-03-15","base":"CHF","rates":{"USD":1.0523,"EUR":0.9612,"GBP":0.8234}}',
    ].join('\n')

    const rows = parseNdjson(input)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject<FrankfurterRow>({
      date: '1999-01-04',
      base: 'CHF',
      rates: { USD: 0.6912, EUR: 0.6234, GBP: 0.4321 },
    })
    expect(rows[1].date).toBe('2020-03-15')
  })

  it('skips empty lines and trailing newlines', () => {
    const input =
      '{"date":"2024-01-02","base":"CHF","rates":{"USD":1.18,"EUR":1.09,"GBP":0.93}}\n\n\n'

    const rows = parseNdjson(input)
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2024-01-02')
  })

  it('rejects rows with NaN or missing rates (Zod validation)', () => {
    const input = [
      '{"date":"2024-01-02","base":"CHF","rates":{"USD":1.18,"EUR":1.09,"GBP":0.93}}',
      '{"date":"2024-01-03","base":"CHF","rates":{"USD":null,"EUR":1.09,"GBP":0.93}}',
      '{"date":"2024-01-04","base":"CHF","rates":{"USD":"not-a-number","EUR":1.09,"GBP":0.93}}',
      '{"date":"2024-01-05","base":"CHF","rates":{}}', // missing rates but valid schema
      'invalid json line',
    ].join('\n')

    const rows = parseNdjson(input)
    // null and "not-a-number" fail z.number().finite(), invalid JSON fails JSON.parse
    // Only the first valid row and the empty rates row pass (empty rates is valid per schema)
    expect(rows.some(r => r.date === '2024-01-02')).toBe(true)
    expect(rows.every(r => {
      return Object.values(r.rates).every(v => typeof v === 'number' && isFinite(v))
    })).toBe(true)
  })
})

describe('fetchFrankfurterRates', () => {
  beforeEach(() => {
    installFetchMock([
      {
        match: /api\.frankfurter\.dev\/v2\/rates/,
        fixture: 'frankfurter/chf-rates-sample.ndjson',
        contentType: 'application/x-ndjson',
      },
    ])
  })

  afterEach(() => {
    uninstallFetchMock()
  })

  it('calls the right URL and parses NDJSON response', async () => {
    const result = await fetchFrankfurterRates({
      from: '2020-01-02',
      to: '2020-01-10',
      base: 'CHF',
      quotes: ['USD', 'EUR', 'GBP'],
    })

    expect(Array.isArray(result)).toBe(true)
    const rows = result as FrankfurterRow[]
    expect(rows.length).toBeGreaterThan(0)
    // Every row should have the expected shape
    for (const row of rows) {
      expect(row).toHaveProperty('date')
      expect(row).toHaveProperty('base', 'CHF')
      expect(row).toHaveProperty('rates')
    }
  })

  it('returns transient error on 5xx response', async () => {
    uninstallFetchMock()
    installFetchMock([
      {
        match: /api\.frankfurter\.dev\/v2\/rates/,
        fixture: 'frankfurter/chf-rates-sample.ndjson',
        status: 503,
        contentType: 'text/plain',
      },
    ])

    const result = await fetchFrankfurterRates({
      from: '2020-01-02',
      to: '2020-01-10',
      base: 'CHF',
      quotes: ['USD'],
    })

    expect(result).toMatchObject({ kind: 'transient' })
    if (!Array.isArray(result)) {
      expect(result.kind).toBe('transient')
      expect((result as { attempt: number }).attempt).toBeTypeOf('number')
    }
  })

  it('returns invalid_input error on 4xx response (not 429)', async () => {
    uninstallFetchMock()
    installFetchMock([
      {
        match: /api\.frankfurter\.dev\/v2\/rates/,
        fixture: 'frankfurter/chf-rates-sample.ndjson',
        status: 400,
        contentType: 'text/plain',
      },
    ])

    const result = await fetchFrankfurterRates({
      from: 'bad-date',
      to: 'also-bad',
      base: 'CHF',
      quotes: ['USD'],
    })

    expect(result).toMatchObject({ kind: 'invalid_input' })
  })
})
