# CMBX Contributor — Bloomberg Agent

## Overview

The Bloomberg Agent is a Python background process that runs on a Windows machine co-located with a Bloomberg Terminal. It:

1. Subscribes to the CMBX Contributor Supabase database via realtime WebSocket
2. Receives price and trade change events as traders update the web portal
3. Formats CMBX price data into 60-character GPGX page rows
4. Publishes formatted page rows to Bloomberg via the GPGX contribution API (`ProviderSession`)
5. Marks executed trades as `published_to_bbg=true` in the database
6. Runs a system tray icon showing live connection status

The agent supports a **stub mode** (`BBG_MODE=stub`) that logs all Bloomberg publish actions to a local text file without requiring a Bloomberg Terminal — useful for testing the web portal end-to-end before going live.

---

## Prerequisites

1. **Windows 10 or 11** — Bloomberg Terminal is Windows-only
2. **Python 3.11** — download from https://python.org (check "Add to PATH" during install)
3. **Bloomberg Terminal running and logged in** on the same machine (live mode only)
4. **CMBX Contributor Supabase credentials** — obtain from your admin (project URL + service role key)

---

## Installation

### Step 1: Get the Bloomberg blpapi wheel

> Skip this step if you are starting in stub mode.

1. Open Bloomberg Terminal
2. Press `F1 F1` to open the help desk, or type `WAPI <GO>` in the terminal
3. Navigate to the API download section and download the **Python 3.11 wheel** for Windows 64-bit
4. The filename will look like: `blpapi-3.20.0-cp311-cp311-win_amd64.whl`
5. Save it to the `bloomberg_agent/` folder

### Step 2: Configure the agent

Copy the example config file and fill it in:

```
copy agent_config.env.example agent_config.env
```

Open `agent_config.env` in Notepad and set the following values:

| Key | What to set |
|-----|-------------|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://abcxyz.supabase.co`) |
| `SUPABASE_KEY` | Your Supabase **service role** key (has write access) |
| `BBG_GPGX_ID` | Your Bloomberg GPGX page ID (assigned by Bloomberg, e.g. `431`) |
| `BBG_GPGX_SERVICE` | Your GPGX service path (default: `//blp-test/c-gpgx`) |
| `BBG_CONTRIBUTOR_ID` | Your Bloomberg contributor ID (default: `8563`) |
| `BBG_MODE` | Start with `stub`; change to `live` once the wheel is installed |
| `PORTAL_URL` | Your deployed Vercel URL (for the "Open Web Portal" tray menu item) |

### Step 3: Run the installer

Double-click `installer.bat`.

If startup registration fails (the step that adds the agent to Windows startup), right-click `installer.bat` and choose **Run as Administrator**.

The installer will:
- Create a Python virtual environment (`venv/`)
- Install all dependencies from `requirements.txt`
- Create `start_agent.bat` (your launch shortcut)
- Add `start_agent.bat` to Windows startup via the registry

### Step 4: Install the blpapi wheel

> Skip if using stub mode.

After the installer runs, install the Bloomberg wheel into the virtual environment:

```bat
call venv\Scripts\activate
pip install blpapi-3.x.x-cp311-cp311-win_amd64.whl
```

Replace the filename with the actual wheel filename you downloaded in Step 1.

### Step 5: Switch to live mode

> Skip if staying in stub mode.

Edit `agent_config.env` and change:

```
BBG_MODE=live
```

### Step 6: Launch the agent

Double-click `start_agent.bat`, or restart your machine and it will start automatically via Windows startup.

---

## Verifying it works

### Stub mode (before Bloomberg wheel)

- The tray icon appears in the system tray (bottom-right of taskbar) — it will be **red** in stub mode
- Make a price change in the CMBX Contributor web portal
- Open `bbg_publish_log.txt` (via tray menu → View Publish Log, or open it directly)
- You should see a formatted GPGX page section appear with the updated prices
- The web portal's BBG status indicator will show disconnected (expected in stub mode)

### Live mode (after Bloomberg wheel)

- Tray icon turns **green** when Bloomberg is connected
- Web portal BBG status dot turns green
- Price changes from the web portal are published to the configured Bloomberg GPGX page within seconds
- Executed trades appear in the trade blotter with `published_to_bbg = true`

---

## Tray Icon Colors

| Color | Meaning |
|-------|---------|
| Green | Bloomberg connected and publishing |
| Red | Bloomberg disconnected or stub mode |
| Amber | Connecting / transitional state |

---

## Tray Menu Options

| Menu Item | Action |
|-----------|--------|
| **Open Web Portal** | Opens the CMBX Contributor web app in your default browser |
| **View Publish Log** | Opens `bbg_publish_log.txt` in Notepad |
| **Restart Bloomberg Connection** | Reconnects to Bloomberg without restarting the agent |
| **Exit** | Gracefully shuts down the agent and removes the tray icon |

The top two menu items (Bloomberg status, Supabase status) are read-only status indicators that refresh every 5 seconds.

---

## Troubleshooting

### Bloomberg not connecting

1. Make sure Bloomberg Terminal is open and you are fully logged in
2. Confirm `BBG_HOST=localhost` and `BBG_PORT=8194` in `agent_config.env`
3. Check `agent.log` in the `bloomberg_agent/` folder for detailed error messages
4. Try running `start_agent.bat` as Administrator
5. If you see `blpapi not installed`, make sure you ran the pip install step for the wheel

### Supabase not connecting

1. Double-check `SUPABASE_URL` and `SUPABASE_KEY` in `agent_config.env`
2. Verify the key is the **service role** key, not the anon key
3. Check your internet connection
4. Search `agent.log` for lines containing `Supabase listener error`

### Agent not appearing in tray

1. Check `agent.log` for any Python errors at startup
2. Run `python --version` in a command prompt to confirm Python 3.11 is available
3. Check that `venv\Scripts\python.exe` exists (venv was created successfully)
4. Try running `start_agent.bat` directly and look for errors in the console window

### Price changes not publishing

1. Confirm the web portal and the agent are configured to use the **same** Supabase project URL
2. In stub mode, check `bbg_publish_log.txt` — if entries appear there, the listener is working
3. In live mode, check `agent.log` for lines containing `Bloomberg publish error`
4. Make sure the `prices` table has a realtime publication enabled in Supabase (Dashboard → Database → Replication → `prices`)

### Agent crashes on startup

1. Look at the last lines in `agent.log`
2. Common cause: `agent_config.env` is missing or has an empty `SUPABASE_URL` / `SUPABASE_KEY`
3. Delete `venv/` and re-run `installer.bat` to rebuild the environment from scratch

---

## Files Reference

| File | Purpose |
|------|---------|
| `agent_config.env` | Your local configuration — **never commit to git** |
| `agent_config.env.example` | Template for the config file |
| `agent.py` | Main entry point — starts all threads and tray |
| `blp_publisher.py` | Bloomberg GPGX ProviderSession + stub logging |
| `supabase_listener.py` | Supabase realtime subscription with auto-reconnect |
| `gpgx_formatter.py` | Formats price dicts into 60-char GPGX page rows |
| `tray_app.py` | System tray icon and menu (pystray + Pillow) |
| `requirements.txt` | Python dependencies |
| `installer.bat` | One-click setup script |
| `start_agent.bat` | Generated by installer — launches the agent |
| `agent.log` | Runtime log file (created on first run) |
| `bbg_publish_log.txt` | Stub mode publish log (created on first run) |

---

## Security Notes

- `agent_config.env` contains your Supabase service role key — treat it like a password
- Add `agent_config.env` to `.gitignore` before committing anything to source control
- The service role key bypasses row-level security; do not share it or expose it in logs
