-- 00008_template_instruments_read_policy.sql
-- Phase 4 — Plan 05 (auto-fix Rule 1)
--
-- Gap discovered while wiring the template-seed flow: authenticated users
-- can SELECT template rows from public.portfolios (policy added in 00004),
-- but the matching policy was never added on public.portfolio_instruments.
-- That meant `listTemplates()` returned templates with empty `items` arrays
-- — RLS silently filtered out the junction rows because templates have
-- user_id IS NULL and the existing 00001 SELECT policy requires
-- `portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())`.
--
-- This migration adds a parallel SELECT policy that grants authenticated
-- users read access to portfolio_instruments rows whose parent portfolio
-- is a template. Templates remain immutable for users — INSERT/UPDATE/
-- DELETE policies still gate on user-owned portfolios.

CREATE POLICY "Authenticated users can read template instruments"
  ON public.portfolio_instruments
  FOR SELECT
  TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios WHERE is_template = true
    )
  );
