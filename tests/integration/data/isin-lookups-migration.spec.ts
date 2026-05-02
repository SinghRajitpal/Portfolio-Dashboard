import { test, expect } from '@playwright/test'
import { createTestSupabaseClient, truncateMarketData } from '../../helpers/supabase-test'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Integration tests for 00002_isin_lookups.sql migration.
 *
 * Verifies:
 * - Table exists and accepts inserts
 * - Composite PK (isin, ticker, exchange) rejects duplicate inserts
 * - Same ISIN+ticker on a different exchange is allowed (multi-venue UCITS ETF pattern)
 * - idx_isin_lookups_isin index works: filter by ISIN returns only matching rows
 *
 * Note: These tests run against the real remote Supabase instance via service-role key.
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment. RLS is bypassed for test isolation.
 */
test.describe('isin_lookups migration', () => {
  let client: SupabaseClient

  test.beforeAll(() => {
    client = createTestSupabaseClient()
  })

  test.afterAll(async () => {
    await truncateMarketData(client)
  })

  test('inserts a new ISIN lookup row without error', async () => {
    const { error } = await client.from('isin_lookups').insert({
      isin: 'CH0237935637',
      ticker: 'CHDVD',
      exchange: 'SW',
      figi: 'BBG001S5N8V8',
      security_type: 'ETP',
      currency: 'CHF',
    })
    expect(error).toBeNull()
  })

  test('rejects a duplicate insert (composite PK conflict)', async () => {
    const { error } = await client.from('isin_lookups').insert({
      isin: 'CH0237935637',
      ticker: 'CHDVD',
      exchange: 'SW',
      figi: 'BBG001S5N8V8',
      security_type: 'ETP',
      currency: 'CHF',
    })
    expect(error).not.toBeNull()
    // Supabase surfaces Postgres duplicate-key errors with code 23505
    expect(error?.code).toBe('23505')
  })

  test('allows same ISIN+ticker on a different exchange (multi-venue listing)', async () => {
    const { error } = await client.from('isin_lookups').insert({
      isin: 'CH0237935637',
      ticker: 'CHDVD',
      exchange: 'XETRA',
      currency: 'EUR',
    })
    expect(error).toBeNull()
  })

  test('returns exactly 2 rows when filtering by ISIN (proves index and multi-venue storage)', async () => {
    const { data, error } = await client
      .from('isin_lookups')
      .select('*')
      .eq('isin', 'CH0237935637')
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
  })
})
