# CMBX Contributor — Claude Code Context

## What this project is
A real-time CMBX price contribution platform for Crosspoint Capital. Traders enter
bid/ask spreads on the backend, which are stored in Supabase and displayed live on
the market page. A Python agent publishes prices to Bloomberg GPGX.

## Tech stack
- **Frontend**: Next.js 14 App Router, TypeScript, all inline styles (no Tailwind in components)
- **Database**: Supabase (PostgreSQL + Realtime subscriptions)
- **Bloomberg agent**: Python, in `../bloomberg_agent/`
- **Font**: Courier New throughout
- **Color scheme**: Dark terminal aesthetic, #0a0a0a background, #f0c040 amber accents

## Project structure
```
cmbx-contributor/          ← Next.js app (you are here)
  app/
    dashboard/
      backend/page.tsx     ← Trader view: enter prices, HIT/LIFT trades
      market/page.tsx      ← Read-only market view with VIEW AS dropdown
      layout.tsx           ← Minimal wrapper, no auth
    page.tsx               ← Redirects to /dashboard/backend
    login/page.tsx         ← Unused (auth removed)
  lib/
    supabase/client.ts     ← createBrowserClient from @supabase/ssr
    types.ts               ← TypeScript interfaces
  middleware.ts            ← Disabled (empty matcher, no auth)

../bloomberg_agent/        ← Python Bloomberg GPGX publisher
  agent.py                 ← Main entry point
  blp_publisher.py         ← Bloomberg ProviderSession publisher
  gpgx_formatter.py        ← Formats prices into GPGX page rows
  supabase_listener.py     ← Watches Supabase for price changes
  agent_config.env         ← Your credentials (not in git)
  agent_config.env.example ← Template
```

## Supabase
- **Project URL**: https://mjquoskgvvtqgeluxaxm.supabase.co
- **Tables**: series_config, tranche_config, prices, trades, dealers, agent_heartbeat
- **RLS**: All tables open (public read/write — no auth in app)
- **Realtime**: Enabled on prices, trades, agent_heartbeat
- **Series seeded**: CMBX.6 through CMBX.20 (newest first)
- **Tranches seeded**: AAA, AS, AA, A, BBB-, BB

## Key design decisions
- **No authentication** — removed entirely, middleware is disabled
- **All inline styles** — no Tailwind classes in dashboard pages, everything is inline
- **createClient from @supabase/supabase-js** used directly in dashboard pages (NOT @supabase/ssr)
- **Realtime fix**: Channel created SYNCHRONOUSLY before async data load to prevent
  React Strict Mode "cannot add postgres_changes callbacks after subscribe()" error
- **Font**: Courier New, 13-14px throughout
- **Tranche names display as**: CMBX.15.AAA (series + tranche combined)

## Backend page (app/dashboard/backend/page.tsx)
- Dealer buttons: MS, BOA, CITI, JPM, GS, UBS, BNP, DB, BARC (each with unique color)
- Click a dealer to select as counterparty
- Click any BID/ASK/B.SZ/A.SZ cell to edit inline (Enter saves, Escape cancels)
- Click a row to select it (gold highlight)
- HIT button = sell at bid to selected dealer, flashes row red 3x
- LIFT button = buy at ask from selected dealer, flashes row green 3x
- All series stacked vertically (no tabs) with amber CMBX.X section headers
- Trade log bar at bottom shows last trade
- BBG status dot in top bar (green = Bloomberg agent connected)

## Market page (app/dashboard/market/page.tsx)
- Read-only — no editing, no dealer buttons, no HIT/LIFT
- Only shows rows where bid OR ask OR last_trade_px is NOT NULL
- VIEW AS dropdown (MARKET, MS, BOA, JPM, GS, CITI, UBS, BNP) stored in localStorage
- When VIEW AS = specific dealer: their prices show in #4488ff instead of green/red
- Real-time updates via Supabase subscription

## Dealer tag colors (used in grid next to bid/ask prices)
MS=#ff8888 on #3a0a0a, BOA=#88ff88 on #0a2a0a, JPM=#5aafff on #0c2a4a,
GS=#ffcc44 on #2a2a0a, CITI=#cc88ff on #2a0a2a, UBS=#ff88cc on #2a0a1a,
BNP=#8888ff on #0a0a3a, DB=#88ccff on #0a1a2a, BARC=#ffaa66 on #2a1a0a

## Bloomberg agent (../bloomberg_agent/)
- Currently runs in BBG_MODE=stub (logs to bbg_publish_log.txt)
- To go live: set BBG_MODE=live, fill in BBG_GPGX_ID, BBG_CONTRIBUTOR_ID
- Requires Bloomberg Terminal on Windows + blpapi installed:
  pip install blpapi --index-url https://bcms.bloomberg.com/pip/simple
- Topic format: //blp-test/c-gpgx/<GPGX_ID>/<monitor>/<page>
- Uses PageData / rowUpdate / spanUpdate schema (correct BLPAPI format)
- Mac is NOT supported for live Bloomberg publishing (Windows/Linux only)

## Environment variables needed (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://mjquoskgvvtqgeluxaxm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

## Running the app
```
npm run dev       ← starts at http://localhost:3000
```
Redirects to /dashboard/backend automatically.

## GitHub repo
https://github.com/crosspointcap/cmbx-contributor
