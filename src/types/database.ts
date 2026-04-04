// Hand-written TypeScript types for the PortfolioForge database schema.
// Generated types can be added later once the project is linked to a remote Supabase project.

export interface Profile {
  id: string; // UUID, FK to auth.users
  display_name: string | null;
  default_currency: string; // default: 'CHF'
  created_at: string; // TIMESTAMPTZ as ISO string
  updated_at: string;
}

export interface Portfolio {
  id: string; // UUID
  user_id: string; // UUID, FK to profiles
  name: string;
  description: string | null;
  investment_amount: number | null;
  rebalance_frequency: 'annual' | 'semi-annual' | 'quarterly' | 'none' | null;
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

export interface Instrument {
  id: string; // UUID
  ticker: string;
  name: string;
  isin: string | null;
  type: 'etf' | 'stock' | 'commodity' | 'future' | 'bond' | 'fund' | null;
  currency: string; // default: 'USD'
  exchange: string | null;
  expense_ratio: number | null; // e.g., 0.0007 for 0.07%
  dividend_yield: number | null;
  data_source: string; // default: 'eodhd'
  created_at: string;
  updated_at: string;
}

export interface PortfolioInstrument {
  id: string; // UUID
  portfolio_id: string; // UUID, FK to portfolios
  instrument_id: string; // UUID, FK to instruments
  weight: number; // percentage, > 0 and <= 100
  created_at: string;
}

export interface Price {
  id: string; // UUID
  instrument_id: string; // UUID, FK to instruments
  date: string; // DATE as ISO string
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjusted_close: number;
  volume: number | null;
  created_at: string;
}

export interface Dividend {
  id: string; // UUID
  instrument_id: string; // UUID, FK to instruments
  ex_date: string; // DATE as ISO string
  amount: number; // dividend per share in instrument currency
  currency: string;
  created_at: string;
}

export interface FxRate {
  id: string; // UUID
  base_currency: string;
  quote_currency: string;
  date: string; // DATE as ISO string
  rate: number;
  source: string; // default: 'frankfurter'
  created_at: string;
}

// Database type for Supabase client generic typing
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, 'id'>>;
      };
      portfolios: {
        Row: Portfolio;
        Insert: Omit<Portfolio, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Portfolio, 'id' | 'user_id'>>;
      };
      instruments: {
        Row: Instrument;
        Insert: Omit<Instrument, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Instrument, 'id'>>;
      };
      portfolio_instruments: {
        Row: PortfolioInstrument;
        Insert: Omit<PortfolioInstrument, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Pick<PortfolioInstrument, 'weight'>>;
      };
      prices: {
        Row: Price;
        Insert: Omit<Price, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Price, 'id' | 'instrument_id' | 'date'>>;
      };
      dividends: {
        Row: Dividend;
        Insert: Omit<Dividend, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Dividend, 'id' | 'instrument_id' | 'ex_date'>>;
      };
      fx_rates: {
        Row: FxRate;
        Insert: Omit<FxRate, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<FxRate, 'id' | 'base_currency' | 'quote_currency' | 'date'>>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
