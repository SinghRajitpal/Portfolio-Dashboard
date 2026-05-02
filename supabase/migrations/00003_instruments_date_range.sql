-- Phase 3: Track per-instrument date coverage to support the "ready for Phase 4" smoke test
-- (first_date and last_date present, row count > 0, all adjusted_close non-null).
-- See CONTEXT.md "Data integrity & validation" and RESEARCH.md Pitfall 6 (Swiss UCITS ETFs may
-- have inception dates after 2009; downstream code needs to know actual coverage).

ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS first_date DATE,
  ADD COLUMN IF NOT EXISTS last_date  DATE;
