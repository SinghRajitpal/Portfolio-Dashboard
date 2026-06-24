-- 00010_snb_rates.sql
-- Phase 5 — Plan 01 (Backtesting Engine, Wave 0 foundation)
--
-- Creates the snb_rates table — shared reference data for the SNB
-- CHF policy rate used as the risk-free rate in Sharpe computation
-- (CONTEXT D-19). Storage granularity is monthly because SNB changes
-- the policy rate <= 4x per year; daily granularity is unnecessary.
--
-- Source field discriminates the historical regime stitch:
--   * 'LZ'         — current "Leitzins" series (post-2019-06)
--   * 'libor_mid'  — historical 3-month CHF Libor midpoint (pre-2019-06)
--
-- Reads are public-by-authenticated (same pattern as fx_rates in
-- 00001). Writes happen only via the quarterly refresh-snb cron route
-- using the service role, which bypasses RLS — so no INSERT policy
-- is required.

CREATE TABLE public.snb_rates (
  id          UUID          NOT NULL DEFAULT gen_random_uuid(),
  date_month  TEXT          NOT NULL,                    -- format 'YYYY-MM'
  rate        NUMERIC(8,6)  NOT NULL,                    -- annualized, e.g. 0.0125 for 1.25%
  source      TEXT          NOT NULL CHECK (source IN ('LZ', 'libor_mid')),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (date_month)
);

CREATE INDEX idx_snb_rates_date_month
  ON public.snb_rates (date_month);

ALTER TABLE public.snb_rates ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all rows (shared reference data; no PII).
CREATE POLICY "Authenticated users can read snb_rates"
  ON public.snb_rates FOR SELECT TO authenticated
  USING (true);
