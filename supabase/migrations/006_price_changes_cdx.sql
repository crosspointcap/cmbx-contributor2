-- supabase/migrations/006_price_changes_cdx.sql
-- Store CDX HY and CDX IG snapshot directly on each price_changes row
-- so history page shows the index level at the exact moment each price was entered.
-- Run in Supabase → SQL Editor

ALTER TABLE price_changes ADD COLUMN IF NOT EXISTS cdx_hy numeric;
ALTER TABLE price_changes ADD COLUMN IF NOT EXISTS cdx_ig numeric;
