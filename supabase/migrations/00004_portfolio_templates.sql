-- 00004_portfolio_templates.sql
-- Phase 4 — Portfolio Builder, Wave 0
-- Adds template support to public.portfolios:
--   1. Make user_id nullable so templates exist without an owner.
--   2. CHECK constraint: templates require user_id IS NULL; user portfolios require user_id IS NOT NULL.
--   3. RLS policy: any authenticated user may SELECT rows where is_template = true.
--      Existing user CRUD policies (auth.uid() = user_id) evaluate to NULL → false on
--      template rows, so they remain inaccessible for INSERT/UPDATE/DELETE under user roles.
--   4. Seed three v1 templates (Classic 60/40, All-World, All-Weather).
--   5. Seed corresponding portfolio_instruments rows via subselect on instruments.ticker.
--
-- DEVIATION FROM PLAN: actual v1 tickers in instruments table carry exchange suffixes
-- (.US, .SW, .LSE) and the seeded set is {AGG.US, BND.US, EEM.US, GLD.US, QQQ.US, SPY.US,
-- VTI.US, IWDA.LSE, VWRL.LSE, 500E.SW, CHDVD.SW, CSSPX.SW, NOVN.SW, SSAC.SW}.
-- Plan referenced VT/TLT/IEI/DJP which are not seeded. Templates retain their conceptual
-- intent but use available analogues:
--   • Classic 60/40 → 60% VTI.US (US total stock) + 40% AGG.US (US aggregate bond)
--   • All-World    → 100% IWDA.LSE (iShares Core MSCI World, single-fund global)
--   • All-Weather  → 30% VTI.US, 40% BND.US (long-bond proxy), 15% AGG.US (intermediate),
--                    7.5% GLD.US, 7.5% EEM.US (commodity proxy via emerging markets — DJP not seeded)

-- 1. Allow NULL user_id on templates
ALTER TABLE public.portfolios
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Mutual exclusivity between template-ness and ownership
ALTER TABLE public.portfolios
  ADD CONSTRAINT portfolios_template_user_check
  CHECK (
    (is_template = true  AND user_id IS NULL)
    OR (is_template = false AND user_id IS NOT NULL)
  );

-- 3. Authenticated read of templates
CREATE POLICY "Authenticated users can read templates"
  ON public.portfolios
  FOR SELECT
  TO authenticated
  USING (is_template = true);

-- 4. Seed templates (stable UUIDs so downstream code can reference them)
INSERT INTO public.portfolios (id, user_id, name, description, investment_amount, is_template)
VALUES
  ('00000000-0000-0000-0000-000000000060', NULL,
   'Classic 60/40',
   '60% US total stock market, 40% US aggregate bonds — the textbook balanced allocation.',
   10000, true),
  ('00000000-0000-0000-0000-000000000040', NULL,
   'All-World',
   '100% global developed equities (iShares Core MSCI World, UCITS) — single-fund diversification.',
   10000, true),
  ('00000000-0000-0000-0000-000000000041', NULL,
   'All-Weather (Ray Dalio)',
   '30% US stocks, 40% long-term bonds, 15% intermediate bonds, 7.5% gold, 7.5% emerging markets.',
   10000, true);

-- 5. Seed portfolio_instruments via subselect on tickers.
--    INSERT ... SELECT inserts zero rows for any ticker missing from instruments,
--    so the migration remains idempotent against partially-seeded environments.

-- Classic 60/40
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000060'::uuid, id, 60.00
  FROM public.instruments WHERE ticker = 'VTI.US';
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000060'::uuid, id, 40.00
  FROM public.instruments WHERE ticker = 'AGG.US';

-- All-World
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000040'::uuid, id, 100.00
  FROM public.instruments WHERE ticker = 'IWDA.LSE';

-- All-Weather (Ray Dalio)
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000041'::uuid, id, 30.00
  FROM public.instruments WHERE ticker = 'VTI.US';
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000041'::uuid, id, 40.00
  FROM public.instruments WHERE ticker = 'BND.US';
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000041'::uuid, id, 15.00
  FROM public.instruments WHERE ticker = 'AGG.US';
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000041'::uuid, id, 7.50
  FROM public.instruments WHERE ticker = 'GLD.US';
INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
SELECT '00000000-0000-0000-0000-000000000041'::uuid, id, 7.50
  FROM public.instruments WHERE ticker = 'EEM.US';
