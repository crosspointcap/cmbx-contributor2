// Shared formatting utilities used across dashboard pages

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

// 32nds parser: "80-01" → 80.03125,  "80-16" → 80.5,  "80-31" → 80.96875
export function parse32nds(val: string): number | null {
  const m = val.trim().match(/^(\d+)-(\d{1,2})$/)
  if (!m) return null
  const whole = parseInt(m[1], 10)
  const ticks = parseInt(m[2], 10)
  if (ticks > 31) return null
  return whole + ticks / 32
}
