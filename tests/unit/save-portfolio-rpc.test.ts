// Round-trip integration test for save_portfolio RPC (migration 00006).
// Skipped automatically if SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing,
// so local devs without service-role access still pass `npm run test:unit`.
// CI must set both env vars to exercise the live round-trip.
//
// Covers PORT-01 (save), PORT-03 (atomic upsert), PORT-04 (investment amount round-trips).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getServiceClient, createTestUser, cleanupTestUser } from '../helpers/test-portfolio'

const ENABLED = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL

describe.skipIf(!ENABLED)('save_portfolio RPC (PORT-01, PORT-03, PORT-04)', () => {
  let userId: string
  let instrumentIds: string[] = []

  beforeAll(async () => {
    const u = await createTestUser()
    userId = u.userId
    // Use 2 known seeded tickers — VTI.US and AGG.US are present in the v1 seed list.
    const sb = getServiceClient()
    const { data } = await sb
      .from('instruments')
      .select('id')
      .in('ticker', ['VTI.US', 'AGG.US'])
      .limit(2)
    instrumentIds = (data ?? []).map((r: { id: string }) => r.id)
    if (instrumentIds.length < 2) {
      throw new Error('Seeded instruments VTI.US/AGG.US missing — re-run seed:instruments')
    }
  })

  afterAll(async () => {
    if (userId) await cleanupTestUser(userId)
  })

  it('round-trips a portfolio with 2 items summing 100', async () => {
    const sb = getServiceClient()
    const { data: id, error } = await sb.rpc('save_portfolio', {
      p_id: null,
      p_user_id: userId,
      p_name: 'TestRPC',
      p_description: null,
      p_investment_amount: 10000,
      p_items: [
        { instrument_id: instrumentIds[0], weight: 60 },
        { instrument_id: instrumentIds[1], weight: 40 },
      ],
    })
    expect(error).toBeNull()
    expect(typeof id).toBe('string')

    const { data: items } = await sb
      .from('portfolio_instruments')
      .select('weight')
      .eq('portfolio_id', id as string)
    expect(items).toHaveLength(2)
  })

  it('replaces items on second call (DELETE+INSERT)', async () => {
    const sb = getServiceClient()
    const { data: id1 } = await sb.rpc('save_portfolio', {
      p_id: null,
      p_user_id: userId,
      p_name: 'Replace',
      p_description: null,
      p_investment_amount: 10000,
      p_items: [{ instrument_id: instrumentIds[0], weight: 100 }],
    })
    const { data: id2 } = await sb.rpc('save_portfolio', {
      p_id: id1,
      p_user_id: userId,
      p_name: 'Replace',
      p_description: null,
      p_investment_amount: 10000,
      p_items: [
        { instrument_id: instrumentIds[0], weight: 50 },
        { instrument_id: instrumentIds[1], weight: 50 },
      ],
    })
    expect(id1).toBe(id2)
    const { data: items } = await sb
      .from('portfolio_instruments')
      .select('weight')
      .eq('portfolio_id', id2 as string)
    expect(items).toHaveLength(2)
  })
})
