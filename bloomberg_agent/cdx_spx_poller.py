"""
cdx_spx_poller.py
-----------------
Polls Bloomberg Terminal every 60 seconds for CDX HY, CDX IG, SPX, Nasdaq
Composite, Dow Jones Industrial Average, and the U.S. Treasury curve
(2Y/5Y/10Y/30Y). Federal funds rate is deliberately not tracked.

Writes to TWO separate Supabase projects:
  - cmbx-contributor2's own project (mjquoskgvvtqgeluxaxm): cdx_intraday
    (every tick) and market_context (daily upsert) -- CDX/SPX only, unchanged.
  - cpc-cmbs's project (hwhnvzcsfiyjqcjlrmlz): market_snapshots -- a
    permanent, deduped historical row per tracked instrument (CDX IG/HY, the
    equity indices, and the Treasury curve), written only at 9:30am ET
    (MARKET_OPEN) and 4:00pm ET (MARKET_CLOSE) on weekdays, never
    overwritten, never backfilled with a zero on failure. Lives in cpc-cmbs's
    own database (not this project's) so its Yields tab reads its own data
    directly, with no cross-project bridge.

Requires:
  - Bloomberg Terminal open and logged in on this machine
  - blpapi installed: pip install blpapi
  - supabase installed: pip install supabase

Run: python bloomberg_agent/cdx_spx_poller.py
"""

import time
import datetime
from zoneinfo import ZoneInfo
import blpapi
from supabase import create_client

SUPABASE_URL = "https://mjquoskgvvtqgeluxaxm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcXVvc2tndnZ0cWdlbHV4YXhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcwNjE1OCwiZXhwIjoyMDkyMjgyMTU4fQ.iN6AQKEWQ-4m-LiR-9CLYU9d8wCCpZT4ttl0R3Bg4eM"

# cpc-cmbs's own Supabase project -- only Treasury snapshots go here, so its
# Yields / Market Data tab can read this table directly with no cross-project
# bridge to cmbx-contributor2's database above.
CPC_CMBS_SUPABASE_URL = "https://hwhnvzcsfiyjqcjlrmlz.supabase.co"
CPC_CMBS_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3aG52emNzZml5anFjamxybWx6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQxNjQ1MSwiZXhwIjoyMTAwOTkyNDUxfQ.5Wo0gmFfqMFMwSddEfH1ogq8Td-wtTDeYB9QHMLUMis"

POLL_INTERVAL = 60  # seconds
ET = ZoneInfo("America/New_York")

TICKERS = {
    "cdx_hy": ("CDX HY CDSI GEN 5Y PRC Curncy", "PX_MID"),
    "cdx_ig": ("CDX IG CDSI GEN 5Y Curncy",      "PX_MID"),
    "spx":    ("SPX Index",                       "PX_LAST"),
    "ndx":    ("CCMP Index",                       "PX_LAST"),  # Nasdaq Composite
    "dji":    ("INDU Index",                       "PX_LAST"),  # Dow Jones Industrial Average
    "ust2y":  ("USGG2YR Index",  "PX_LAST"),
    "ust5y":  ("USGG5YR Index",  "PX_LAST"),
    "ust10y": ("USGG10YR Index", "PX_LAST"),
    "ust30y": ("USGG30YR Index", "PX_LAST"),
}

# Metadata for the twice-daily market_snapshots table (cpc-cmbs's Yields tab)
# -- covers every instrument tracked there, the existing CDX/SPX trio, the
# Treasuries, and now Nasdaq/Dow, so all of them get the same consistent
# open/close snapshot treatment. Ticker strings come from TICKERS above, not
# duplicated here. Federal funds rate is deliberately not tracked.
SNAPSHOT_META = {
    "cdx_ig": {"display_name": "CDX IG",           "instrument_type": "credit_index",   "maturity": None},
    "cdx_hy": {"display_name": "CDX HY",           "instrument_type": "credit_index",   "maturity": None},
    "spx":    {"display_name": "S&P 500",          "instrument_type": "equity_index",   "maturity": None},
    "ndx":    {"display_name": "Nasdaq Composite", "instrument_type": "equity_index",   "maturity": None},
    "dji":    {"display_name": "Dow Jones Industrial Average", "instrument_type": "equity_index", "maturity": None},
    "ust2y":  {"display_name": "2-Year Treasury",  "instrument_type": "treasury_yield", "maturity": "2Y"},
    "ust5y":  {"display_name": "5-Year Treasury",  "instrument_type": "treasury_yield", "maturity": "5Y"},
    "ust10y": {"display_name": "10-Year Treasury", "instrument_type": "treasury_yield", "maturity": "10Y"},
    "ust30y": {"display_name": "30-Year Treasury", "instrument_type": "treasury_yield", "maturity": "30Y"},
}


def fetch_bloomberg(session, tickers: dict) -> dict:
    """Send a ReferenceDataRequest and return {field_key: value}."""
    refdata = session.getService("//blp/refdata")
    request = refdata.createRequest("ReferenceDataRequest")

    key_order = []
    for key, (ticker, field) in tickers.items():
        request.getElement("securities").appendValue(ticker)
        request.getElement("fields").appendValue(field)
        key_order.append((key, ticker, field))

    session.sendRequest(request)

    values = {}
    while True:
        event = session.nextEvent(5000)
        for msg in event:
            if msg.messageType() == blpapi.Name("ReferenceDataResponse"):
                if not msg.hasElement("securityData"):
                    if msg.hasElement("responseError"):
                        print(f"  Bloomberg responseError: {msg.getElement('responseError')}")
                    continue
                sec_data = msg.getElement("securityData")
                for i in range(sec_data.numValues()):
                    sec = sec_data.getValue(i)
                    ticker_name = sec.getElementAsString("security")
                    field_data = sec.getElement("fieldData")
                    print(f"  Bloomberg returned security: '{ticker_name}'")
                    if sec.hasElement("securityError"):
                        print(f"    SECURITY ERROR: {sec.getElement('securityError')}")
                        continue
                    for key, t, f in key_order:
                        if ticker_name.strip() == t.strip() or ticker_name.strip().startswith(t.strip()):
                            try:
                                values[key] = field_data.getElementAsFloat(f)
                            except Exception as ex:
                                print(f"    Could not get {f} for {ticker_name}: {ex}")
                                try:
                                    print(f"    fieldData contents: {field_data}")
                                except Exception:
                                    pass
                                values[key] = None
        if event.eventType() == blpapi.Event.RESPONSE:
            break

    return values


def snapshot_window(now_et: datetime.datetime):
    """Return 'MARKET_OPEN', 'MARKET_CLOSE', or None -- a 1-minute window
    around 9:30am/4:00pm ET on weekdays, wide enough to survive the 60s
    poll cadence without needing exact-second alignment."""
    if now_et.weekday() >= 5:  # Saturday/Sunday
        return None
    t = now_et.time()
    if datetime.time(9, 30) <= t < datetime.time(9, 31):
        return "MARKET_OPEN"
    if datetime.time(16, 0) <= t < datetime.time(16, 1):
        return "MARKET_CLOSE"
    return None


def maybe_take_snapshot(sb_cpc, data: dict):
    """Write one permanent market_snapshots row per tracked instrument (CDX
    IG/HY, SPX, and the Treasury curve) into cpc-cmbs's Supabase project,
    once per (ticker, date, snapshot_type) -- checked explicitly so a second
    tick inside the same 1-minute window never creates a duplicate. A
    missing Bloomberg value is stored as status='FAILED' with value=NULL,
    never a zero. This is additive -- cdx_intraday/market_context in
    cmbx-contributor2's own project keep working exactly as before."""
    now_et = datetime.datetime.now(ET)
    snap_type = snapshot_window(now_et)
    if not snap_type:
        return

    observation_date = now_et.date().isoformat()

    for key, meta in SNAPSHOT_META.items():
        ticker = TICKERS[key][0]
        existing = (
            sb_cpc.table("market_snapshots")
            .select("id")
            .eq("ticker", ticker)
            .eq("observation_date", observation_date)
            .eq("snapshot_type", snap_type)
            .execute()
        )
        if existing.data:
            continue

        value = data.get(key)
        status = "OK" if value is not None else "FAILED"

        sb_cpc.table("market_snapshots").insert({
            "ticker": ticker,
            "display_name": meta["display_name"],
            "instrument_type": meta["instrument_type"],
            "maturity": meta["maturity"],
            "value": value,
            "observation_date": observation_date,
            "observation_time": now_et.isoformat(),
            "snapshot_type": snap_type,
            "source": "Bloomberg",
            "status": status,
        }).execute()
        print(f"  [{snap_type}] {meta['display_name']}: {value if value is not None else 'FAILED'}")


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    sb_cpc = create_client(CPC_CMBS_SUPABASE_URL, CPC_CMBS_SUPABASE_KEY)

    options = blpapi.SessionOptions()
    options.setServerHost("localhost")
    options.setServerPort(8194)

    session = blpapi.Session(options)
    if not session.start():
        print("ERROR: Could not connect to Bloomberg Terminal. Make sure Terminal is open.")
        return
    if not session.openService("//blp/refdata"):
        print("ERROR: Could not open Bloomberg refdata service.")
        session.stop()
        return

    print("Bloomberg connected. Polling every 60 seconds...")

    while True:
        try:
            data = fetch_bloomberg(session, TICKERS)
            now = datetime.datetime.now(datetime.UTC).isoformat()
            today = datetime.date.today().isoformat()

            cdx_hy = data.get("cdx_hy")
            cdx_ig = data.get("cdx_ig")
            spx    = data.get("spx")

            log_line = "  ".join(
                f"{meta['display_name']}={data.get(key)}" for key, meta in SNAPSHOT_META.items()
            )
            print(f"[{now}] {log_line}")

            # Write intraday tick (only if at least one value came back)
            if any(v is not None for v in [cdx_hy, cdx_ig, spx]):
                sb.table("cdx_intraday").insert({
                    "cdx_hy": cdx_hy,
                    "cdx_ig": cdx_ig,
                    "spx":    spx,
                }).execute()

            # Upsert daily market_context — only overwrite fields that have values
            ctx = {"date": today}
            if spx    is not None: ctx["spx_close"]     = spx
            if cdx_hy is not None: ctx["cdx_hy_spread"] = cdx_hy
            if cdx_ig is not None: ctx["cdx_ig_spread"] = cdx_ig
            if len(ctx) > 1:
                sb.table("market_context").upsert(ctx, on_conflict="date").execute()

            maybe_take_snapshot(sb_cpc, data)

        except Exception as e:
            print(f"ERROR: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
