// Shared formatting utilities used across dashboard pages

// Ghost prices: last known non-null bid/ask per row, shown in grey when live price is cleared
export type GhostMap = Record<string, { bid?: number; ask?: number; mode?: string | null }>

/** Build a GhostMap from an initial array of price rows. */
export function buildGhostMap(
  prices: Array<{ series_number: string; tranche_name: string; bid: number | null; ask: number | null; mode?: string | null }>
): GhostMap {
  const ghosts: GhostMap = {}
  for (const p of prices) {
    if (p.bid == null && p.ask == null) continue
    const k = `${p.series_number}:${p.tranche_name}`
    ghosts[k] = {
      ...(p.bid != null ? { bid: p.bid, mode: p.mode } : {}),
      ...(p.ask != null ? { ask: p.ask, mode: p.mode } : {}),
    }
  }
  return ghosts
}

/** Merge a realtime price update into an existing GhostMap. Returns prev unchanged if nothing to ghost. */
export function mergeGhost(
  prev: GhostMap,
  key: string,
  p: { bid: number | null; ask: number | null; mode?: string | null }
): GhostMap {
  if (p.bid == null && p.ask == null) return prev
  return {
    ...prev,
    [key]: {
      ...prev[key],
      ...(p.bid != null ? { bid: p.bid, mode: p.mode } : {}),
      ...(p.ask != null ? { ask: p.ask, mode: p.mode } : {}),
    },
  }
}

export function fmt32nds(n: number): string {
  const whole = Math.floor(n)
  const ticks = Math.round((n - whole) * 32)
  return `${whole}-${ticks.toString().padStart(2, '0')}`
}

export function formatPx(price: number | null | undefined, mode: string | null | undefined): string {
  if (price == null) return '—'
  if (mode === 'ticks') return fmt32nds(price)
  if (mode === 'price') return `$${price}`
  return String(price)
}

export function fmtTime(ts: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ts))
}

export function fmtDate(ts: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric',
  }).format(new Date(ts))
}

// Compact date: "5/13" — for tight table columns
export function fmtShortDate(ts: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric', day: 'numeric',
  }).format(new Date(ts))
}

// 32nds parser: "80-01" → 80.03125,  "80-16" → 80.5,  "80-31" → 80.96875
export function parse32nds(val: string): number | null {
  const m = val.trim().match(/^(\d+)-(\d{1,2})$/)
  if (!m) return null
  const whole = parseInt(m[1], 10)
  const ticks = parseInt(m[2], 10)
  if (ticks > 31) return null
  return whole + ticks / 32
}
