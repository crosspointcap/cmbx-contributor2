-- ============================================================
-- CMBX CONTRIBUTOR — FULL RESET + RESEED
-- Paste entire contents into Supabase SQL Editor and run.
-- Safe to run multiple times (uses IF NOT EXISTS + ON CONFLICT).
-- ============================================================

-- 1. Create tables if they don't exist yet
-- --------------------------------------------------------

create extension if not exists "uuid-ossp";

create table if not exists series_config (
  id serial primary key,
  series_number text not null unique,
  label text not null,
  active boolean default true,
  gpgx_page_id text,
  gpgx_monitor text default '1',
  gpgx_page_number text default '1',
  sort_order int,
  created_at timestamptz default now()
);

create table if not exists tranche_config (
  id serial primary key,
  tranche_name text not null unique,
  sort_order int not null,
  active boolean default true
);

create table if not exists prices (
  id serial primary key,
  series_number text not null,
  tranche_name text not null,
  bid numeric,
  ask numeric,
  bid_size numeric,
  ask_size numeric,
  bid_dealer text,
  ask_dealer text,
  mode text default 'spread',
  last_trade_px numeric,
  last_trade_time timestamptz,
  updated_at timestamptz default now(),
  unique(series_number, tranche_name)
);

create table if not exists trades (
  id serial primary key,
  series_number text not null,
  tranche_name text not null,
  side text not null,
  price numeric,
  size numeric,
  dealer text not null,
  trader_id uuid,
  published_to_bbg boolean default false,
  bbg_publish_time timestamptz,
  created_at timestamptz default now()
);

create table if not exists dealers (
  id serial primary key,
  dealer_code text not null unique,
  full_name text,
  active boolean default true
);

create table if not exists agent_heartbeat (
  id serial primary key,
  bbg_connected boolean default false,
  last_seen timestamptz default now()
);

-- 2. Seed series CMBX.6 through CMBX.20 (newest first)
-- --------------------------------------------------------

insert into series_config (series_number, label, active, sort_order) values
  ('20', 'CMBX.20', true,  1),
  ('19', 'CMBX.19', true,  2),
  ('18', 'CMBX.18', true,  3),
  ('17', 'CMBX.17', true,  4),
  ('16', 'CMBX.16', true,  5),
  ('15', 'CMBX.15', true,  6),
  ('14', 'CMBX.14', true,  7),
  ('13', 'CMBX.13', true,  8),
  ('12', 'CMBX.12', true,  9),
  ('11', 'CMBX.11', true, 10),
  ('10', 'CMBX.10', true, 11),
  ('9',  'CMBX.9',  true, 12),
  ('8',  'CMBX.8',  true, 13),
  ('7',  'CMBX.7',  true, 14),
  ('6',  'CMBX.6',  true, 15)
on conflict (series_number) do update
  set label = excluded.label,
      active = excluded.active,
      sort_order = excluded.sort_order;

-- 3. Seed tranches (AAA → BB, standard CMBX 6 tranches)
-- --------------------------------------------------------

insert into tranche_config (tranche_name, sort_order) values
  ('AAA',  1),
  ('AS',   2),
  ('AA',   3),
  ('A',    4),
  ('BBB-', 5),
  ('BB',   6)
on conflict (tranche_name) do update
  set sort_order = excluded.sort_order;

-- 4. Seed dealers
-- --------------------------------------------------------

insert into dealers (dealer_code, full_name) values
  ('MS',   'Morgan Stanley'),
  ('BOA',  'Bank of America'),
  ('CITI', 'Citigroup'),
  ('JPM',  'JPMorgan Chase'),
  ('GS',   'Goldman Sachs'),
  ('UBS',  'UBS'),
  ('BNP',  'BNP Paribas'),
  ('DB',   'Deutsche Bank'),
  ('BARC', 'Barclays')
on conflict (dealer_code) do update
  set full_name = excluded.full_name;

-- 5. Seed agent heartbeat row
-- --------------------------------------------------------

insert into agent_heartbeat (id, bbg_connected, last_seen)
  values (1, false, now())
on conflict (id) do nothing;

-- 6. Fix RLS — allow anon (no-login app) full access
-- --------------------------------------------------------

alter table series_config  enable row level security;
alter table tranche_config enable row level security;
alter table prices         enable row level security;
alter table trades         enable row level security;
alter table dealers        enable row level security;
alter table agent_heartbeat enable row level security;

-- Drop old auth-required policies
drop policy if exists "Authenticated read series"    on series_config;
drop policy if exists "Traders manage series"        on series_config;
drop policy if exists "Authenticated read tranches"  on tranche_config;
drop policy if exists "Traders manage tranches"      on tranche_config;
drop policy if exists "Authenticated read dealers"   on dealers;
drop policy if exists "Traders manage dealers"       on dealers;
drop policy if exists "Authenticated read prices"    on prices;
drop policy if exists "Traders write prices"         on prices;
drop policy if exists "Traders manage trades"        on trades;
drop policy if exists "Dealers read trades"          on trades;
drop policy if exists "Authenticated read heartbeat" on agent_heartbeat;
drop policy if exists "Service role writes heartbeat" on agent_heartbeat;

-- Open policies — app has no login, allow everything
create policy "Public read series"    on series_config   for select using (true);
create policy "Public read tranches"  on tranche_config  for select using (true);
create policy "Public read dealers"   on dealers         for select using (true);
create policy "Public read prices"    on prices          for select using (true);
create policy "Public write prices"   on prices          for all    using (true);
create policy "Public read trades"    on trades          for select using (true);
create policy "Public write trades"   on trades          for all    using (true);
create policy "Public read heartbeat" on agent_heartbeat for select using (true);
create policy "Public write heartbeat" on agent_heartbeat for all   using (true);

-- 7. Enable realtime
-- --------------------------------------------------------

alter publication supabase_realtime add table prices;
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table agent_heartbeat;
