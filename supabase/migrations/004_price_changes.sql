-- supabase/migrations/004_price_changes.sql
-- Audit log of every bid/ask entered on the backend page
-- Run in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS price_changes (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  series_number text        NOT NULL,
  tranche_name  text        NOT NULL,
  dealer        text,
  side          text        NOT NULL,   -- 'bid' or 'ask'
  price         numeric,
  size          numeric,
  mode          text        DEFAULT 'spread'
);

ALTER TABLE price_changes DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_changes REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_price_changes_created
  ON price_changes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_changes_series_tranche
  ON price_changes (series_number, tranche_name, created_at DESC);

-- Also fix trades table RLS so CLEAR ALL actually deletes from Supabase
ALTER TABLE trades DISABLE ROW LEVEL SECURITY;
ALTER TABLE trades REPLICA IDENTITY FULL;
