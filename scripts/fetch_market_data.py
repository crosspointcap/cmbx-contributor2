"""
fetch_market_data.py
────────────────────
Fetches SPX, VIX, and HYG from Yahoo Finance (no API key needed) and
upserts into Supabase market_context table.

CDX HY spread is NOT fetched here — that requires Bloomberg Terminal.
Run bloomberg_agent/market_data_puller.py locally to fill in CDX HY.

Run by GitHub Actions every hour Mon–Fri 8am–6pm ET.
Also runnable locally: python scripts/fetch_market_data.py
"""

import os
import sys
import datetime
import requests

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = (
    os.environ.get('SUPABASE_KEY', '')
    or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
)

if not SUPABASE_URL or not SUPABASE_KEY:
    print('[ERROR] SUPABASE_URL and SUPABASE_KEY must be set as environment variables')
    sys.exit(1)

from supabase import create_client
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

TICKERS = {
    'spx': '^GSPC',
    'vix': '^VIX',
    'hyg': 'HYG',
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; market-data-puller/1.0)',
}


def fetch_yahoo(ticker: str) -> dict:
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=5d'
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        data = r.json()
        result = data['chart']['result'][0]
        closes = result['indicators']['quote'][0].get('close', [])
        highs  = result['indicators']['quote'][0].get('high',  [])
        lows   = result['indicators']['quote'][0].get('low',   [])

        def last_val(lst):
            vals = [v for v in lst if v is not None]
            return round(vals[-1], 4) if vals else None

        return {'last': last_val(closes), 'high': last_val(highs), 'low': last_val(lows)}
    except Exception as e:
        print(f'[WARN] Failed to fetch {ticker}: {e}')
        return {'last': None, 'high': None, 'low': None}


def main():
    today = datetime.date.today().isoformat()
    print(f'[INFO] fetch_market_data starting — {today}')

    spx = fetch_yahoo(TICKERS['spx'])
    vix = fetch_yahoo(TICKERS['vix'])
    hyg = fetch_yahoo(TICKERS['hyg'])

    print(f'[INFO] SPX={spx["last"]}  VIX={vix["last"]}  HYG={hyg["last"]}')

    # Preserve existing CDX HY — don't overwrite it with null
    existing = sb.table('market_context').select('cdx_hy_spread').eq('date', today).execute()
    existing_cdx = None
    if existing.data:
        existing_cdx = existing.data[0].get('cdx_hy_spread')

    row = {
        'date':          today,
        'spx_close':     spx['last'],
        'spx_high':      spx['high'],
        'spx_low':       spx['low'],
        'vix_close':     vix['last'],
        'hyg_close':     hyg['last'],
        'cdx_hy_spread': existing_cdx,
    }

    sb.table('market_context').upsert(row, on_conflict='date').execute()
    print(f'[INFO] Upserted market_context for {today}')
    print('[INFO] Done.')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        import traceback
        print(f'[ERROR] Unhandled exception: {e}')
        traceback.print_exc()
        sys.exit(1)
