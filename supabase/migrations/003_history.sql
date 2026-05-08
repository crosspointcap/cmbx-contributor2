-- supabase/migrations/003_history.sql
-- History page: market_context + daily_snapshots tables
-- Run in Supabase → SQL Editor

-- ── trades table: add missing columns if not already present ──────────────────
ALTER TABLE trades ADD COLUMN IF NOT EXISTS passive_dealer text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS trade_size     numeric;

-- ── market_context ─────────────────────────────────────────────────────────────
-- One row per calendar date. Populated by the Bloomberg agent at 4pm ET.
-- cdx_hy_spread is in basis points.
CREATE TABLE IF NOT EXISTS market_context (
  date          date        PRIMARY KEY,
  spx_close     numeric,
  spx_high      numeric,
  spx_low       numeric,
  vix_close     numeric,
  hyg_close     numeric,
  cdx_hy_spread numeric,
  updated_at    timestamptz DEFAULT now()
);

-- ── daily_snapshots ────────────────────────────────────────────────────────────
-- One row per (date, series, tranche). Populated by the Bloomberg agent.
-- best_bid/ask = best levels seen that day; trade stats from trades table.
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date          date        NOT NULL,
  series_number text        NOT NULL,
  tranche_name  text        NOT NULL,
  best_bid      numeric,
  best_ask      numeric,
  trade_count   integer     DEFAULT 0,
  avg_trade_px  numeric,
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (date, series_number, tranche_name)
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date
  ON daily_snapshots (date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_series_tranche
  ON daily_snapshots (series_number, tranche_name);

CREATE INDEX IF NOT EXISTS idx_market_context_date
  ON market_context (date DESC);

CREATE INDEX IF NOT EXISTS idx_trades_series_tranche_created
  ON trades (series_number, tranche_name, created_at DESC);

-- ── RLS: disabled, matching existing migration 002 pattern ────────────────────
ALTER TABLE market_context  DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots DISABLE ROW LEVEL SECURITY;

-- ── Realtime ──────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE market_context;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_snapshots;
