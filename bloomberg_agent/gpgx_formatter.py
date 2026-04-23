"""
Formats Supabase price data into GPGX page rows for Bloomberg contribution.
Each row is exactly PAGE_WIDTH characters wide (padded/truncated).
Returns list of {'rowNum': int, 'text': str} dicts for blp_publisher.
"""

from datetime import datetime
import pytz

PAGE_WIDTH = 80   # Standard Bloomberg GPGX page width
TRANCHES = ['AAA', 'AS', 'AA', 'A', 'BBB-', 'BB']


def _pad(text: str) -> str:
    return text[:PAGE_WIDTH].ljust(PAGE_WIDTH)


def _fmt_val(val) -> str:
    if val is None:
        return '    —'
    try:
        f = float(val)
        return f'{int(f):>5}' if f == int(f) else f'{f:>7.2f}'
    except (TypeError, ValueError):
        return f'{str(val):>5}'


def format_gpgx_rows(prices_list: list, series_number: str) -> list:
    """
    Returns a list of {'rowNum': int, 'text': str} for one series page.
    prices_list: all price rows for this series from Supabase.
    series_number: e.g. '15' for CMBX.15
    """
    et = pytz.timezone('America/New_York')
    now_et = datetime.now(tz=et)
    date_str = now_et.strftime('%Y-%m-%d')
    time_str = now_et.strftime('%H:%M:%S')

    price_map = {p['tranche_name']: p for p in prices_list}

    output = []
    row_num = 1

    def add(text: str):
        nonlocal row_num
        output.append({'rowNum': row_num, 'text': _pad(text)})
        row_num += 1

    # ── Header ────────────────────────────────────────────────────────
    add(f'CROSSPOINT CAPITAL  CMBX.{series_number}  {date_str}  {time_str} ET')
    add(f'CMBX.{series_number} SPREAD CONTRIBUTIONS (bps)')
    add('─' * 60)
    add(f'{"TRANCHE":<10}  {"BID":>7}  {"ASK":>7}  {"B.SZ":>6}  {"A.SZ":>6}  {"LAST":>7}  {"DEALER":>6}')
    add('─' * 60)

    # ── One row per tranche ───────────────────────────────────────────
    has_data = False
    for tranche in TRANCHES:
        p = price_map.get(tranche)
        if p is None:
            add(f'{tranche:<10}  {"—":>7}  {"—":>7}  {"—":>6}  {"—":>6}  {"—":>7}  {"":>6}')
            continue

        bid = p.get('bid')
        ask = p.get('ask')
        last = p.get('last_trade_px')
        bsz = p.get('bid_size')
        asz = p.get('ask_size')
        bid_dealer = p.get('bid_dealer') or ''

        bid_s = _fmt_val(bid)
        ask_s = _fmt_val(ask)
        bsz_s = f'{int(bsz):>6}' if bsz is not None else f'{"—":>6}'
        asz_s = f'{int(asz):>6}' if asz is not None else f'{"—":>6}'
        last_s = _fmt_val(last)

        add(f'{tranche:<10}  {bid_s:>7}  {ask_s:>7}  {bsz_s}  {asz_s}  {last_s:>7}  {bid_dealer:>6}')
        if bid is not None or ask is not None:
            has_data = True

    # ── Footer ────────────────────────────────────────────────────────
    add('─' * 60)
    status = 'LIVE' if has_data else 'NO PRICES'
    add(f'CROSSPOINT CAPITAL  |  CMBX CONTRIBUTOR  |  {status}')

    return output
