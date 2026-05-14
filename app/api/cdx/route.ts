/**
 * GET /api/cdx
 * Returns CDX HY and IG spreads for today from Supabase market_context.
 * Values are written there by the bloomberg_agent CdxPoller thread, which
 * polls Bloomberg every 5 minutes using blpapi ReferenceDataRequest.
 *
 * Called by the admin page on load and every 5 minutes.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
        ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const today = new Date().toISOString().split('T')[0]
    const { data } = await sb
      .from('market_context')
      .select('cdx_hy_spread, cdx_ig_spread')
      .eq('date', today)
      .single()
    return NextResponse.json({
      cdx_hy: data?.cdx_hy_spread ?? null,
      cdx_ig: data?.cdx_ig_spread ?? null,
    })
  } catch {
    return NextResponse.json({ cdx_hy: null, cdx_ig: null })
  }
}
