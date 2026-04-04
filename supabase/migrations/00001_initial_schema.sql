-- PortfolioForge Initial Schema
-- Phase 1: Full database schema with RLS policies
-- Applied via: npx supabase db reset

-- ============================================================
-- TABLES
-- ============================================================

-- profiles: 1:1 with auth.users, auto-created via trigger
CREATE TABLE public.profiles (
  id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  default_currency TEXT        NOT NULL DEFAULT 'CHF',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- portfolios: user-owned
CREATE TABLE public.portfolios (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  description          TEXT,
  investment_amount    NUMERIC(15,2),
  rebalance_frequency  TEXT        CHECK (rebalance_frequency IN ('annual', 'semi-annual', 'quarterly', 'none')),
  is_template          BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- instruments: shared reference data (read-only for users)
CREATE TABLE public.instruments (
  id             UUID        NOT NULL DEFAULT gen_random_uuid(),
  ticker         TEXT        NOT NULL UNIQUE,
  name           TEXT        NOT NULL,
  isin           TEXT,
  type           TEXT        CHECK (type IN ('etf', 'stock', 'commodity', 'future', 'bond', 'fund')),
  currency       TEXT        NOT NULL DEFAULT 'USD',
  exchange       TEXT,
  expense_ratio  NUMERIC(5,4),  -- e.g., 0.0007 for 0.07%
  dividend_yield NUMERIC(5,4),
  data_source    TEXT        NOT NULL DEFAULT 'eodhd',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- portfolio_instruments: junction table, user-owned via portfolio
CREATE TABLE public.portfolio_instruments (
  id             UUID        NOT NULL DEFAULT gen_random_uuid(),
  portfolio_id   UUID        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  instrument_id  UUID        NOT NULL REFERENCES public.instruments(id),
  weight         NUMERIC(5,2) NOT NULL CHECK (weight > 0 AND weight <= 100),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (portfolio_id, instrument_id)
);

-- prices: shared reference data (read-only for users)
CREATE TABLE public.prices (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  instrument_id   UUID        NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  date            DATE        NOT NULL,
  open            NUMERIC(15,4),
  high            NUMERIC(15,4),
  low             NUMERIC(15,4),
  close           NUMERIC(15,4) NOT NULL,
  adjusted_close  NUMERIC(15,4) NOT NULL,
  volume          BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (instrument_id, date)
);

-- dividends: shared reference data (read-only for users)
CREATE TABLE public.dividends (
  id             UUID        NOT NULL DEFAULT gen_random_uuid(),
  instrument_id  UUID        NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  ex_date        DATE        NOT NULL,
  amount         NUMERIC(15,6) NOT NULL,  -- dividend per share in instrument currency
  currency       TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (instrument_id, ex_date)
);

-- fx_rates: shared reference data (read-only for users)
CREATE TABLE public.fx_rates (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  base_currency   TEXT        NOT NULL,
  quote_currency  TEXT        NOT NULL,
  date            DATE        NOT NULL,
  rate            NUMERIC(15,6) NOT NULL,
  source          TEXT        NOT NULL DEFAULT 'frankfurter',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (base_currency, quote_currency, date)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_prices_instrument_date      ON public.prices (instrument_id, date);
CREATE INDEX idx_fx_rates_currencies_date    ON public.fx_rates (base_currency, quote_currency, date);
CREATE INDEX idx_instruments_isin            ON public.instruments (isin) WHERE isin IS NOT NULL;
CREATE INDEX idx_dividends_instrument_exdate ON public.dividends (instrument_id, ex_date);

-- ============================================================
-- TRIGGER FUNCTIONS
-- ============================================================

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Auto-create profile row on auth.users INSERT
-- SECURITY DEFINER so the trigger runs with owner privileges
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at triggers
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_instruments_updated_at
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prices               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividends            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates             ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- profiles: own row SELECT and UPDATE only
-- INSERT is handled by the trigger; no user INSERT policy
-- -------------------------------------------------------
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- -------------------------------------------------------
-- portfolios: full CRUD for own rows
-- -------------------------------------------------------
CREATE POLICY "Users can view own portfolios"
  ON public.portfolios FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own portfolios"
  ON public.portfolios FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own portfolios"
  ON public.portfolios FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own portfolios"
  ON public.portfolios FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- -------------------------------------------------------
-- portfolio_instruments: owned via portfolio
-- -------------------------------------------------------
CREATE POLICY "Users can view own portfolio instruments"
  ON public.portfolio_instruments FOR SELECT TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can insert own portfolio instruments"
  ON public.portfolio_instruments FOR INSERT TO authenticated
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update own portfolio instruments"
  ON public.portfolio_instruments FOR UPDATE TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete own portfolio instruments"
  ON public.portfolio_instruments FOR DELETE TO authenticated
  USING (
    portfolio_id IN (
      SELECT id FROM public.portfolios
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- -------------------------------------------------------
-- instruments: read-only for authenticated users
-- -------------------------------------------------------
CREATE POLICY "Authenticated users can read instruments"
  ON public.instruments FOR SELECT TO authenticated
  USING (true);

-- -------------------------------------------------------
-- prices: read-only for authenticated users
-- -------------------------------------------------------
CREATE POLICY "Authenticated users can read prices"
  ON public.prices FOR SELECT TO authenticated
  USING (true);

-- -------------------------------------------------------
-- dividends: read-only for authenticated users
-- -------------------------------------------------------
CREATE POLICY "Authenticated users can read dividends"
  ON public.dividends FOR SELECT TO authenticated
  USING (true);

-- -------------------------------------------------------
-- fx_rates: read-only for authenticated users
-- -------------------------------------------------------
CREATE POLICY "Authenticated users can read fx_rates"
  ON public.fx_rates FOR SELECT TO authenticated
  USING (true);
