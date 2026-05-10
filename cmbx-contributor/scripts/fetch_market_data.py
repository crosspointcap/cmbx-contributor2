"""
scripts/fetch_market_data.py
────────────────────────────
Fetches SPX, VIX, and HYG prices from Yahoo Finance and upserts into
the market_context table in Supabase. Preserves any existing CDX HY spread
set by the local Bloomberg agent.

Runs via GitHub Actions every hour Mon-Fri 8am-6pm ET.
"""
import os
import sys
import datetime
import requests
from supabase import create_client

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('[ERROR] SUPABASE_URL and SUPABASE_KEY must be set')
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

SYMBOLS = {
    'spx': '^GSPC',
    'vix': '^VIX',
    'hyg': 'HYG',
}

def fetch_yahoo(symbol: str) -> float | None:
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
    params = {'interval': '1d', 'range': '1d'}
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        r.raise_for_status()
        return r.json()['chart']['result'][0]['meta']['regularMarketPrice']
    except Exception as e:
        print(f'[WARN] Failed to fetch {symbol}: {e}')
        return None


def main():
    today = datetime.date.today().isoformat()
    print(f'[INFO] fetch_market_data.py starting for {today}')

    spx = fetch_yahoo(SYMBOLS['spx'])
    vix = fetch_yahoo(SYMBOLS['vix'])
    hyg = fetch_yahoo(SYMBOLS['hyg'])

    print(f'[INFO] SPX={spx}  VIX={vix}  HYG={hyg}')

    # Preserve existing CDX HY spread set by local Bloomberg agent
    existing = sb.table('market_context').select('cdx_hy_spread').eq('date', today).execute()
    cdx = existing.data[0].get('cdx_hy_spread') if existing.data else None

    row = {
        'date':          today,
        'spx_close':     spx,
        'vix_close':     vix,
        'hyg_close':     hyg,
        'cdx_hy_spread': cdx,
    }

    sb.table('market_context').upsert(row, on_conflict='date').execute()
    print(f'[INFO] Upserted market_context for {today}')


if __name__ == '__main__':
    main()
