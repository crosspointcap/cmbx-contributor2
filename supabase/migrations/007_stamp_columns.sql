-- supabase/migrations/007_stamp_columns.sql
-- Fix column name mismatch and add all missing market-context stamp columns.
--
-- Background: migration 006 added cdx_hy / cdx_ig to price_changes, but the
-- frontend writes cdx_hy_at_time / cdx_ig_at_time (matching spx_at_time style).
-- Neither trades nor price_changes had spx_at_time defined in any migration.
-- This migration makes the schema consistent with what the frontend expects.
-- Safe to run multiple times (all statements use IF NOT EXISTS / DO blocks).
-- Run in Supabase → SQL Editor

-- ── price_changes: add _at_time stamp columns ─────────────────────────────────
ALTER TABLE price_changes ADD COLUMN IF NOT EXISTS spx_at_time    numeric;
ALTER TABLE price_changes ADD COLUMN IF NOT EXISTS cdx_hy_at_time numeric;
ALTER TABLE price_changes ADD COLUMN IF NOT EXISTS cdx_ig_at_time numeric;

-- Migrate any data that landed in the old mis-named columns (006 migration)
UPDATE price_changes
SET
  cdx_hy_at_time = cdx_hy,
  cdx_ig_at_time = cdx_ig
WHERE
  cdx_hy_at_time IS NULL
  AND cdx_ig_at_time IS NULL
  AND (cdx_hy IS NOT NULL OR cdx_ig IS NOT NULL);

-- ── trades: add all three stamp columns ──────────────────────────────────────
ALTER TABLE trades ADD COLUMN IF NOT EXISTS spx_at_time    numeric;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS cdx_hy_at_time numeric;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS cdx_ig_at_time numeric;

-- ── cdx_intraday: create if not already present ───────────────────────────────
-- 15-second intraday feed; each row is one price snapshot.
-- The Bloomberg agent (or manual entry) INSERTs rows; the backend page
-- subscribes to INSERT events to keep latestCdxRef fresh in real time.
CREATE TABLE IF NOT EXISTS cdx_intraday (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  cdx_hy     numeric,        -- CDX HY price (not spread)
  cdx_ig     numeric         -- CDX IG spread (bps)
);

ALTER TABLE cdx_intraday DISABLE ROW LEVEL SECURITY;

-- Enable realtime on cdx_intraday so INSERT events reach subscribers
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cdx_intraday;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
