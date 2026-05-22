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

// ── VIEW AS — which identity the current browser is viewing as ──────────────
// 'MARKET' = Crosspoint admin view (sees all dealer names, full blotter, ADMIN tab)
// dealer code = dealer view (sees own prices highlighted, counterparty names redacted)

export const VIEW_AS_OPTIONS = ['MARKET', 'MS', 'BOA', 'CITI', 'JPM', 'GS', 'UBS', 'BNP', 'DB', 'BARC'] as const
export type ViewAs = typeof VIEW_AS_OPTIONS[number]
const VIEW_AS_KEY = 'cmbx_view_as'

/** Load VIEW AS selection. Returns 'MARKET' (admin) if nothing saved. */
export function loadViewAs(): ViewAs {
  try {
    const raw = localStorage.getItem(VIEW_AS_KEY) as ViewAs | null
    if (raw && (VIEW_AS_OPTIONS as readonly string[]).includes(raw)) return raw
  } catch {}
  return 'MARKET'
}

/** Persist VIEW AS selection. */
export function saveViewAs(v: ViewAs): void {
  try { localStorage.setItem(VIEW_AS_KEY, v) } catch {}
}
