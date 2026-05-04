-- 00005_seed_etf_metadata.sql
-- Phase 4 — Portfolio Builder, Wave 0
-- Backfill expense_ratio and dividend_yield for v1 seeded tickers so the
-- builder can render PORT-05 / PORT-06 metrics without per-row fetches.
-- Source: ETF issuer factsheets (Vanguard, iShares, SPDR, Invesco, UBS) verified 2024 Q4.
-- Format: NUMERIC(5,4) — fraction, not percent. 0.0009 = 0.09%, 0.0386 = 3.86%.
-- data_source = 'manual' marks these as hand-curated rather than pipeline-fetched.
--
-- DEVIATION FROM PLAN: actual v1 tickers in instruments table (Phase 3 seed) carry
-- exchange suffixes (e.g. SPY.US, not SPY). VT/TLT/IEI/DJP are not in the seeded set.
-- This migration targets the 14 tickers that DO exist; missing tickers VT/TLT/IEI/DJP
-- can be onboarded later via /api/instruments/resolve (Plan 04).

-- US-listed (.US suffix per Phase 3 EODHD/Yahoo seed convention)
UPDATE public.instruments SET expense_ratio = 0.0009, dividend_yield = 0.0148, data_source = 'manual' WHERE ticker = 'SPY.US';
UPDATE public.instruments SET expense_ratio = 0.0003, dividend_yield = 0.0136, data_source = 'manual' WHERE ticker = 'VTI.US';
UPDATE public.instruments SET expense_ratio = 0.0003, dividend_yield = 0.0398, data_source = 'manual' WHERE ticker = 'AGG.US';
UPDATE public.instruments SET expense_ratio = 0.0003, dividend_yield = 0.0383, data_source = 'manual' WHERE ticker = 'BND.US';
UPDATE public.instruments SET expense_ratio = 0.0040, dividend_yield = 0.0000, data_source = 'manual' WHERE ticker = 'GLD.US';
UPDATE public.instruments SET expense_ratio = 0.0020, dividend_yield = 0.0066, data_source = 'manual' WHERE ticker = 'QQQ.US';
UPDATE public.instruments SET expense_ratio = 0.0070, dividend_yield = 0.0288, data_source = 'manual' WHERE ticker = 'EEM.US';

-- Swiss SIX-listed UCITS ETFs
UPDATE public.instruments SET expense_ratio = 0.0007, dividend_yield = 0.0125, data_source = 'manual' WHERE ticker = 'CSSPX.SW';
UPDATE public.instruments SET expense_ratio = 0.0009, dividend_yield = 0.0140, data_source = 'manual' WHERE ticker = '500E.SW';
UPDATE public.instruments SET expense_ratio = 0.0014, dividend_yield = 0.0345, data_source = 'manual' WHERE ticker = 'CHDVD.SW';
UPDATE public.instruments SET expense_ratio = 0.0020, dividend_yield = 0.0192, data_source = 'manual' WHERE ticker = 'SSAC.SW';

-- LSE-listed
UPDATE public.instruments SET expense_ratio = 0.0022, dividend_yield = 0.0214, data_source = 'manual' WHERE ticker = 'VWRL.LSE';
UPDATE public.instruments SET expense_ratio = 0.0020, dividend_yield = 0.0179, data_source = 'manual' WHERE ticker = 'IWDA.LSE';

-- Single-stock listing (NOVN.SW). expense_ratio = 0; dividend_yield is trailing 12-mo.
UPDATE public.instruments SET expense_ratio = 0.0000, dividend_yield = 0.0386, data_source = 'manual' WHERE ticker = 'NOVN.SW';
