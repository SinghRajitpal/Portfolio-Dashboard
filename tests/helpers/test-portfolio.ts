// Real (no longer stub) test helpers for Phase 4 portfolio integration specs.
// Service-role Supabase client + admin auth API + direct table writes — bypasses
// RLS for setup/teardown only. App code MUST never import this module.
//
// Promotion from Wave 0: createTestPortfolio + loginTestUser previously threw;
// they now have working implementations backed by SUPABASE_SERVICE_ROLE_KEY.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

function envOrThrow(k: string): string {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env ${k}`)
  return v
}

export function getServiceClient() {
  return createSupabaseClient(
    envOrThrow('NEXT_PUBLIC_SUPABASE_URL'),
    envOrThrow('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}

export type TestUser = {
  userId: string
  email: string
  password: string
}

// Creates an auth.users row with email_confirmed = true so subsequent sign-in
// flows skip the verification email. The handle_new_user trigger (00001) creates
// the profiles row automatically.
export async function createTestUser(): Promise<TestUser> {
  const sb = getServiceClient()
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = 'test-password-12345'
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  return { userId: data.user.id, email, password }
}

// Cascades to profiles + portfolios via FK ON DELETE CASCADE.
export async function cleanupTestUser(userId: string): Promise<void> {
  const sb = getServiceClient()
  await sb.auth.admin.deleteUser(userId)
}

export type SeedPortfolioInput = {
  userId: string
  name: string
  investmentAmount?: number
  // Aligned with Plan 03's final contract: callers seed by instrument_id (UUID),
  // not ticker. Keeps the helper deterministic regardless of seeded ticker drift.
  items?: { instrument_id: string; weight: number }[]
}

// Direct INSERT via service client — bypasses RLS so setup is fast and predictable.
// Tests that exercise RLS paths (savePortfolio Server Action, /dashboard pages) use
// the user-scoped client + an authenticated session; this helper is for fixture seed only.
export async function createTestPortfolio({
  userId,
  name,
  investmentAmount = 10000,
  items = [],
}: SeedPortfolioInput): Promise<{ id: string }> {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('portfolios')
    .insert({
      user_id: userId,
      name,
      investment_amount: investmentAmount,
      is_template: false,
    })
    .select('id')
    .single()
  if (error || !data) throw error ?? new Error('insert portfolio failed')
  const portfolioId = (data as { id: string }).id
  if (items.length > 0) {
    const { error: e2 } = await sb
      .from('portfolio_instruments')
      .insert(
        items.map((it) => ({
          portfolio_id: portfolioId,
          instrument_id: it.instrument_id,
          weight: it.weight,
        })),
      )
    if (e2) throw e2
  }
  return { id: portfolioId }
}

export async function cleanupTestPortfolio(portfolioId: string): Promise<void> {
  const sb = getServiceClient()
  await sb.from('portfolios').delete().eq('id', portfolioId)
}

// Playwright helper for E2E specs in later plans (05+). Optionally accepts existing
// credentials; otherwise creates a fresh test user and signs in via the UI.
// The exact form selectors should track Phase 1 auth UI; later plans may refine.
export async function loginTestUser(
  page: Page,
  opts?: { email?: string; password?: string },
): Promise<TestUser> {
  const user: TestUser =
    opts?.email && opts.password
      ? { userId: '', email: opts.email, password: opts.password }
      : await createTestUser()

  await page.goto('/auth?tab=signin')
  await page.fill('#signin-email', user.email)
  await page.fill('#signin-password', user.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 15_000 })
  return user
}

// Look up real seeded instrument ids by ticker — avoids hard-coding UUIDs in
// tests. Uses the service client (bypasses RLS) and returns null if the
// ticker is not seeded.
export async function getInstrumentIdByTicker(
  ticker: string,
): Promise<string | null> {
  const sb = getServiceClient()
  const { data } = await sb
    .from('instruments')
    .select('id')
    .eq('ticker', ticker)
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}
