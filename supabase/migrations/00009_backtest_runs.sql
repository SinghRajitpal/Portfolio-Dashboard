-- 00009_backtest_runs.sql
-- Phase 5 — Plan 01 (Backtesting Engine, Wave 0 foundation)
--
-- Creates the immutable backtest_runs table. Each row is a frozen
-- snapshot of a backtest's inputs + outputs, keyed deterministically
-- by (portfolio_id, inputs_hash) so identical-input reruns dedupe.
--
-- Design notes (CONTEXT D-08, D-09, D-10):
--   * Rows are IMMUTABLE: there is no UPDATE policy. A recompute writes
--     a new row (different prices_version) — the old row is kept until
--     the user deletes it. This is why there is no updated_at column
--     and no handle_updated_at trigger.
--   * prices_version stamps the run for the "stale-on-view" UX badge.
--   * inputs_hash is a SHA-256 of the canonical-JSON serialization of
--     the input parameters; computed inside the worker for determinism.
--   * RLS mirrors the portfolios pattern from 00001: SELECT/INSERT/DELETE
--     gated on (SELECT auth.uid()) = user_id. No UPDATE policy.
--
-- See also:
--   * .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-10)
--   * .planning/phases/05-backtesting-engine/05-PATTERNS.md (§00009_backtest_runs.sql)

CREATE TABLE public.backtest_runs (
  id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  portfolio_id        UUID         NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  inputs_hash         TEXT         NOT NULL,
  params_json         JSONB        NOT NULL,
  equity_curve_json   JSONB        NOT NULL,
  annual_bars_json    JSONB        NOT NULL,
  metrics_json        JSONB        NOT NULL,
  warnings_json       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  prices_version      BIGINT       NOT NULL,
  computed_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (portfolio_id, inputs_hash)
);

CREATE INDEX idx_backtest_runs_user_portfolio
  ON public.backtest_runs (user_id, portfolio_id, computed_at DESC);

ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;

-- SELECT: users see only their own runs
CREATE POLICY "Users can view own backtest runs"
  ON public.backtest_runs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- INSERT: users can only write rows for themselves
CREATE POLICY "Users can insert own backtest runs"
  ON public.backtest_runs FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- DELETE: users can prune their own runs
CREATE POLICY "Users can delete own backtest runs"
  ON public.backtest_runs FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- NOTE: there is intentionally NO UPDATE policy. Backtest runs are
-- immutable; recompute writes a new row per the D-08 dedup contract.
