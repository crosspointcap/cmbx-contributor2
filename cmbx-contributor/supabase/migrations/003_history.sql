-- 003_history.sql
-- Adds market_context and daily_snapshots tables
-- Adds passive_dealer and trade_size columns to trades

create table if not exists market_context (
  date           date primary key,
  spx_close      numeric,
  spx_high       numeric,
  spx_low        numeric,
  vix_close      numeric,
  hyg_close      numeric,
  cdx_hy_spread  numeric
);

alter table market_context disable row level security;

create table if not exists daily_snapshots (
  date           date    not null,
  series_number  integer not null,
  tranche_name   text    not null,
  best_bid       numeric,
  best_ask       numeric,
  trade_count    integer default 0,
  avg_trade_px   numeric,
  primary key (date, series_number, tranche_name)
);

alter table daily_snapshots disable row level security;

alter table trades add column if not exists passive_dealer text;
alter table trades add column if not exists trade_size     numeric;

create index if not exists market_context_date_idx   on market_context   (date);
create index if not exists daily_snapshots_date_idx  on daily_snapshots  (date);
create index if not exists trades_created_at_idx     on trades           (created_at);

alter publication supabase_realtime add table market_context;
alter publication supabase_realtime add table daily_snapshots;
