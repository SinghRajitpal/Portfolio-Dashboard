-- Phase 3 smoke test fixture
-- Pre-populates DB with representative data to assert all 5 ROADMAP success criteria.
-- Applied via supabase client in phase3-smoke.spec.ts beforeAll.

-- Note: This file is for documentation only — the actual inserts are done
-- programmatically in the test using the Supabase JS client to avoid SQL parsing
-- complexity with uuid generation and to stay consistent with the existing pattern.
-- The test inserts: 2 instruments (SPY.US, CHDVD.SW), prices and dividends for each,
-- FX rates for CHF base with USD/EUR/GBP quotes spanning 1999-01-04 to 2026-03-15,
-- and an isin_lookups row for CH0237935637 -> CHDVD.SW.
