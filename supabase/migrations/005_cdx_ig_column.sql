-- supabase/migrations/005_cdx_ig_column.sql
-- Add CDX IG spread column to market_context
-- Run in Supabase → SQL Editor

ALTER TABLE market_context ADD COLUMN IF NOT EXISTS cdx_ig_spread numeric;
