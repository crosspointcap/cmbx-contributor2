/**
 * GET /api/cdx
 * Triggers fetch_cdx_intraday.py to pull CDX HY and IG spreads from Bloomberg,
 * then returns the result. Falls back to today's Supabase market_context row if
 * the script is unavailable (no Bloomberg Terminal, blpapi not installed, etc).
 *
 * Called by the admin page on load and every 5 minutes.
 * PYTHON_CMD env var overrides the Python executable (default: "python").
 */
import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const execAsync = promisify(exec)

const AGENT_DIR = path.join(process.cwd(), '..', 'bloomberg_agent')
const SCRIPT    = path.join(AGENT_DIR, 'fetch_cdx_intraday.py')
const PYTHON    = process.env.PYTHON_CMD ?? 'python'

export async function GET() {
  // ── Try to run the Bloomberg fetch script ──────────────────────────────────
  try {
    const { stdout } = await execAsync(
      `"${PYTHON}" "${SCRIPT}"`,
      { cwd: AGENT_DIR, timeout: 20_000 }
    )
    // Script prints JSON as the last non-empty line
    const lastLine = stdout.trim().split('\n').filter(Boolean).pop() ?? ''
    const data = JSON.parse(lastLine)
    return NextResponse.json({
      cdx_hy: data.cdx_hy ?? null,
      cdx_ig: data.cdx_ig ?? null,
    })
  } catch (err) {
    console.error('[api/cdx] Bloomberg script failed — falling back to Supabase:', err)
  }

  // ── Fallback: read today's row from Supabase ───────────────────────────────
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
