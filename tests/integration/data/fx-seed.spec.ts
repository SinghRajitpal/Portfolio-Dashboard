import { test, expect } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import { installFetchMock, uninstallFetchMock } from '../../helpers/mock-fetch'
import { createTestSupabaseClient, truncateMarketData } from '../../helpers/supabase-test'
import { runSeed } from '../../../src/scripts/seed-fx'

// Load .env.local so Supabase credentials are available in the test Node.js process.
// Playwright does not load .env.local automatically (that's Next.js behaviour).
loadDotenv({ path: resolve(process.cwd(), '.env.local') })

/**
 * Integration tests for the FX seed pipeline.
 *
 * These tests use mock-fetch to intercept Frankfurter API calls and serve the
 * fixture NDJSON file. A real Supabase connection (local or cloud) is required
 * for DB assertions.
 *
 * Run: npx playwright test tests/integration/data/fx-seed.spec.ts --project=chromium
 *
 * NOTE: Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as fallback) in .env.local.
 *
 * IMPORTANT: Never call real Frankfurter API in these tests — all HTTP is mocked.
 */

test.describe('FX seed pipeline', () => {
  let client: ReturnType<typeof createTestSupabaseClient>

  test.beforeAll(() => {
    client = createTestSupabaseClient()
  })

  test.beforeEach(async () => {
    // Install mock with passThrough: true so Supabase REST calls still reach the real network.
    // Only requests matching the Frankfurter regex are served from fixtures.
    installFetchMock(
      [
        {
          match: /api\.frankfurter\.dev\/v2\/rates/,
          fixture: 'frankfurter/chf-rates-sample.ndjson',
          contentType: 'application/x-ndjson',
        },
      ],
      { passThrough: true },
    )
    await truncateMarketData(client)
  })

  test.afterEach(() => {
    uninstallFetchMock()
  })

  test('cold seed: populates fx_rates with CHF base rows', async () => {
    await runSeed(client)

    const { data, error } = await client
      .from('fx_rates')
      .select('*')
      .eq('base_currency', 'CHF')
      .eq('quote_currency', 'USD')
    
    expect(error).toBeNull()
    // Fixture has 5 NDJSON lines × 3 currencies = 15 total rows, 5 for USD
    expect(data).not.toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(5)
    // Verify source field
    expect(data!.every(r => r.source === 'frankfurter')).toBe(true)
  })

  test('idempotent: second run inserts zero new rows', async () => {
    // First run
    await runSeed(client)

    const { data: first } = await client
      .from('fx_rates')
      .select('id')
      .eq('base_currency', 'CHF')
    
    const firstCount = first?.length ?? 0
    expect(firstCount).toBeGreaterThan(0)

    // Mock is still installed from beforeEach — no need to reinstall.
    // Second run — should fetch 0 new rows (all dates already cached)
    await runSeed(client)

    const { data: second } = await client
      .from('fx_rates')
      .select('id')
      .eq('base_currency', 'CHF')
    
    const secondCount = second?.length ?? 0
    // Row count must not increase (upsert + date-range logic are both defensive)
    expect(secondCount).toBe(firstCount)
  })

  test('sanity range: CHF/USD rate for 2020-03-15 is plausible', async () => {
    await runSeed(client)

    const { data, error } = await client
      .from('fx_rates')
      .select('rate')
      .eq('base_currency', 'CHF')
      .eq('quote_currency', 'USD')
      .eq('date', '2020-03-15')
      .maybeSingle()
    
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    
    const rate = Number(data!.rate)
    // Fixture has USD:1.0523 for 2020-03-15 — plausible CHF/USD range
    expect(rate).toBeGreaterThan(0.5)
    expect(rate).toBeLessThan(2.0)
  })
})
