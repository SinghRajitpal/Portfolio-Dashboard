-- 00006_save_portfolio_rpc.sql
-- Phase 4 — Portfolio Builder, Plan 03 (server actions + RPC)
--
-- Atomic upsert RPC for portfolios + their items.
-- One round-trip writes the portfolios row (insert or update by id) and rewrites the
-- portfolio_instruments rows (DELETE + bulk INSERT) in a single implicit transaction,
-- so a partially-saved portfolio is never visible to readers.
--
-- Design notes:
--   - SECURITY INVOKER (the default for plpgsql functions). RLS still applies to every
--     INSERT/UPDATE/DELETE inside the body, so a user impersonating another user's
--     user_id will be rejected by the portfolios.user_id WITH CHECK policy.
--   - p_id is nullable. NULL → fresh portfolio (gen_random_uuid()). Non-null → upsert by id.
--   - p_items is a JSONB array of {instrument_id: uuid, weight: numeric}. Empty array
--     means the portfolio has no items (rare but valid for an in-progress draft).
--   - The 00004 CHECK constraint requires (is_template = false AND user_id IS NOT NULL)
--     for non-template rows; this RPC always inserts is_template = false and the caller
--     MUST pass the authenticated user's UUID for p_user_id (Server Action enforces this).

CREATE OR REPLACE FUNCTION public.save_portfolio(
  p_id                UUID,
  p_user_id           UUID,
  p_name              TEXT,
  p_description       TEXT,
  p_investment_amount NUMERIC,
  p_items             JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_portfolio_id UUID;
BEGIN
  -- 1. Upsert portfolios row by id. COALESCE generates a fresh UUID when p_id is null.
  INSERT INTO public.portfolios (
    id, user_id, name, description, investment_amount, is_template
  )
  VALUES (
    COALESCE(p_id, gen_random_uuid()),
    p_user_id,
    p_name,
    p_description,
    p_investment_amount,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET name              = EXCLUDED.name,
        description       = EXCLUDED.description,
        investment_amount = EXCLUDED.investment_amount,
        updated_at        = now()
  RETURNING id INTO v_portfolio_id;

  -- 2. Replace items: DELETE existing + bulk INSERT from JSONB array.
  --    DELETE is RLS-scoped (only items on portfolios the user owns are deletable).
  DELETE FROM public.portfolio_instruments
   WHERE portfolio_id = v_portfolio_id;

  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.portfolio_instruments (portfolio_id, instrument_id, weight)
    SELECT
      v_portfolio_id,
      (item->>'instrument_id')::uuid,
      (item->>'weight')::numeric
    FROM jsonb_array_elements(p_items) AS item;
  END IF;

  RETURN v_portfolio_id;
END;
$$;

-- Lock down execute privilege: only authenticated users may call save_portfolio.
REVOKE ALL ON FUNCTION public.save_portfolio(UUID, UUID, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_portfolio(UUID, UUID, TEXT, TEXT, NUMERIC, JSONB) TO authenticated;
