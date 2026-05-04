-- 00007_instruments_resolve_policy.sql
-- Phase 4 — Portfolio Builder, Wave 0
-- Allow authenticated users to insert NEW instruments via /api/instruments/resolve (Plan 04).
-- The data_source = 'resolved' constraint scopes user-driven inserts to the resolve flow,
-- preventing users from masquerading data sourced from Yahoo / Stooq pipelines (those rows
-- are written via service role with data_source = 'yahoo' / 'stooq' / 'manual').

CREATE POLICY "Authenticated users can resolve new instruments"
  ON public.instruments
  FOR INSERT TO authenticated
  WITH CHECK (data_source = 'resolved');
