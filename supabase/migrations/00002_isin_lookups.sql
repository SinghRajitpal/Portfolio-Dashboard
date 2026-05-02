-- isin_lookups: cache for OpenFIGI ISIN -> ticker resolutions
-- Phase 3: One ISIN can map to multiple exchange listings (UCITS ETFs are multi-venue).
-- Composite PK preserves all venues; idx_isin_lookups_isin enables fast lookup by ISIN alone.

CREATE TABLE public.isin_lookups (
  isin          TEXT        NOT NULL,
  ticker        TEXT        NOT NULL,
  exchange      TEXT        NOT NULL,
  figi          TEXT,
  security_type TEXT,
  currency      TEXT,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (isin, ticker, exchange)
);

CREATE INDEX idx_isin_lookups_isin ON public.isin_lookups (isin);

ALTER TABLE public.isin_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read isin_lookups"
  ON public.isin_lookups FOR SELECT TO authenticated
  USING (true);
