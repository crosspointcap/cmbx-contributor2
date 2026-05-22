// Theme types + localStorage persistence (no auth required)

export interface Theme {
  bg:     string   // main background      default #0a0a0a
  fg:     string   // main text            default #cccccc
  accent: string   // amber accent         default #f0c040
  bid:    string   // bid / buy colour     default #66ff88
  ask:    string   // ask / sell colour    default #ff6666
}

export const DEFAULT_THEME: Theme = {
  bg:     '#0a0a0a',
  fg:     '#cccccc',
  accent: '#f0c040',
  bid:    '#66ff88',
  ask:    '#ff6666',
}

const THEME_KEY = 'cmbx_theme'

/** Load theme from localStorage. Returns DEFAULT_THEME if nothing saved. */
export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_THEME
}

/** Persist theme to localStorage. */
export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme))
  } catch {}
}

// ── SESSION — daily identity selection, expires at midnight ET ───────────────
// 'MARKET' = Crosspoint admin (full blotter, ADMIN tab, price entry)
// dealer code = dealer view (own prices highlighted, counterparty names hidden)
//
// Session is stamped with today's date in ET. A session from a prior day is
// treated as expired — the user is redirected to /login to re-identify.

export const VIEW_AS_OPTIONS = ['MARKET', 'MS', 'BOA', 'CITI', 'JPM', 'GS', 'UBS', 'BNP', 'DB', 'BARC'] as const
export type ViewAs = typeof VIEW_AS_OPTIONS[number]

interface Session { viewAs: ViewAs; date: string }
const SESSION_KEY = 'cmbx_session'

/** Today's date string (YYYY-MM-DD) in US Eastern time. */
function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s: Session = JSON.parse(raw)
    if (s.date !== todayET()) return null
    if (!(VIEW_AS_OPTIONS as readonly string[]).includes(s.viewAs)) return null
    return s
  } catch { return null }
}

/** True if the browser has a valid session for today. */
export function hasValidSession(): boolean {
  return readSession() !== null
}

/** Load VIEW AS from today's session. Returns 'MARKET' as a safe fallback. */
export function loadViewAs(): ViewAs {
  return readSession()?.viewAs ?? 'MARKET'
}

/** Save VIEW AS and stamp with today's ET date. */
export function saveViewAs(v: ViewAs): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ viewAs: v, date: todayET() })) } catch {}
}

/** Clear session (called on EOD logout). */
export function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}
