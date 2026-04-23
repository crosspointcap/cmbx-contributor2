-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Series configuration
create table series_config (
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

-- Tranche configuration
create table tranche_config (
  id serial primary key,
  tranche_name text not null unique,
  sort_order int not null,
  active boolean default true
);

-- Prices
create table prices (
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

-- Trades
create table trades (
  id serial primary key,
  series_number text not null,
  tranche_name text not null,
  side text not null,
  price numeric,
  size numeric,
  dealer text not null,
  trader_id uuid references auth.users(id),
  published_to_bbg boolean default false,
  bbg_publish_time timestamptz,
  created_at timestamptz default now()
);

-- Dealers
create table dealers (
  id serial primary key,
  dealer_code text not null unique,
  full_name text,
  active boolean default true
);

-- Profiles
create table profiles (
  id uuid references auth.users(id) primary key,
  role text not null default 'dealer',
  dealer_code text references dealers(dealer_code),
  full_name text
);

-- Agent heartbeat
create table agent_heartbeat (
  id serial primary key,
  bbg_connected boolean default false,
  last_seen timestamptz default now()
);

-- Seed series 6-15
insert into series_config (series_number, label, active, sort_order) values
('6', 'CMBX.6', true, 1),
('7', 'CMBX.7', true, 2),
('8', 'CMBX.8', true, 3),
('9', 'CMBX.9', true, 4),
('10', 'CMBX.10', true, 5),
('11', 'CMBX.11', true, 6),
('12', 'CMBX.12', true, 7),
('13', 'CMBX.13', true, 8),
('14', 'CMBX.14', true, 9),
('15', 'CMBX.15', true, 10);

-- Seed tranches
insert into tranche_config (tranche_name, sort_order) values
('AAA', 1),
('AS', 2),
('AA', 3),
('A', 4),
('BBB', 5),
('BBB-', 6),
('BB', 7),
('B', 8);

-- Seed dealers
insert into dealers (dealer_code, full_name) values
('JPM', 'JPMorgan Chase'),
('MS', 'Morgan Stanley'),
('BOA', 'Bank of America'),
('GS', 'Goldman Sachs'),
('CITI', 'Citigroup'),
('DB', 'Deutsche Bank'),
('BARC', 'Barclays'),
('WFS', 'Wells Fargo Securities'),
('UBS', 'UBS');

-- RLS: Enable on all tables
alter table series_config enable row level security;
alter table tranche_config enable row level security;
alter table prices enable row level security;
alter table trades enable row level security;
alter table dealers enable row level security;
alter table profiles enable row level security;
alter table agent_heartbeat enable row level security;

-- Profiles: users can read their own profile
create policy "Users can read own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Traders can read all profiles (needed for admin)
create policy "Traders read all profiles" on profiles
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'trader')
  );

-- series_config: all authenticated can read
create policy "Authenticated read series" on series_config
  for select using (auth.role() = 'authenticated');

create policy "Traders manage series" on series_config
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'trader')
  );

-- tranche_config: same pattern
create policy "Authenticated read tranches" on tranche_config
  for select using (auth.role() = 'authenticated');

create policy "Traders manage tranches" on tranche_config
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'trader')
  );

-- dealers: all authenticated can read
create policy "Authenticated read dealers" on dealers
  for select using (auth.role() = 'authenticated');

create policy "Traders manage dealers" on dealers
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'trader')
  );

-- prices: all authenticated can read, only traders can write
create policy "Authenticated read prices" on prices
  for select using (auth.role() = 'authenticated');

create policy "Traders write prices" on prices
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'trader')
  );

-- trades: traders can read/write all, dealers can read for flash detection
create policy "Traders manage trades" on trades
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'trader')
  );

create policy "Dealers read trades" on trades
  for select using (auth.role() = 'authenticated');

-- agent_heartbeat: all authenticated can read
create policy "Authenticated read heartbeat" on agent_heartbeat
  for select using (auth.role() = 'authenticated');

-- Enable realtime on prices and trades
alter publication supabase_realtime add table prices;
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table agent_heartbeat;
