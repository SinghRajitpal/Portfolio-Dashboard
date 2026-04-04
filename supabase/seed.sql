-- PortfolioForge Seed Data
-- Dev fixtures: 5 well-known instruments for local development and testing
-- Applied via: npx supabase db reset

INSERT INTO public.instruments (ticker, name, isin, type, currency, exchange, expense_ratio, dividend_yield, data_source)
VALUES
  (
    'VT',
    'Vanguard Total World Stock ETF',
    'US9220427424',
    'etf',
    'USD',
    'NYSE Arca',
    0.0007,  -- 0.07% TER
    0.0180,  -- ~1.80% dividend yield
    'eodhd'
  ),
  (
    'SPY',
    'SPDR S&P 500 ETF Trust',
    'US78462F1030',
    'etf',
    'USD',
    'NYSE Arca',
    0.0945,  -- 0.0945% TER (note: higher than Vanguard due to trust structure)
    0.0125,  -- ~1.25% dividend yield
    'eodhd'
  ),
  (
    'VWRL.L',
    'Vanguard FTSE All-World UCITS ETF',
    'IE00B3RBWM25',
    'etf',
    'GBP',
    'London Stock Exchange',
    0.0022,  -- 0.22% TER
    0.0160,  -- ~1.60% dividend yield
    'eodhd'
  ),
  (
    'CHDVD.SW',
    'iShares Swiss Dividend ETF (CH)',
    'CH0110869143',
    'etf',
    'CHF',
    'SIX Swiss Exchange',
    0.0015,  -- 0.15% TER
    0.0350,  -- ~3.50% dividend yield (Swiss dividend stocks tend to pay more)
    'eodhd'
  ),
  (
    'AGG',
    'iShares Core U.S. Aggregate Bond ETF',
    'US4642872349',
    'etf',
    'USD',
    'NYSE Arca',
    0.0003,  -- 0.03% TER
    0.0330,  -- ~3.30% yield (bond ETF)
    'eodhd'
  )
ON CONFLICT (ticker) DO NOTHING;
