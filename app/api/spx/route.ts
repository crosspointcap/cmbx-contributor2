/**
 * GET /api/spx
 * Fetches the latest SPX level from Yahoo Finance server-side.
 * Called by the admin page on load and every 5 minutes to keep
 * latestSpxRef current for trade/price-change stamping.
 * No API key or Bloomberg Terminal required.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5d',
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cmbx/1.0)' },
        // Cache for 60s at the Next.js/CDN layer so rapid refreshes don't hammer Yahoo
        next: { revalidate: 60 },
      }
    )
    if (!res.ok) throw new Error(`Yahoo returned HTTP ${res.status}`)

    const data = await res.json()
    const closes: (number | null)[] =
      data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
    const last = closes.filter((v): v is number => v != null).at(-1) ?? null

    return NextResponse.json({ spx: last })
  } catch (err) {
    console.error('[api/spx]', err)
    return NextResponse.json({ spx: null })
  }
}
