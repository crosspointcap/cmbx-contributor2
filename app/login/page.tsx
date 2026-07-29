'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { saveViewAs, hasValidSession, loadViewAs, VIEW_AS_OPTIONS, ViewAs } from '../../lib/theme'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Explicit email → ViewAs mapping for all known accounts
const EMAIL_ROLE_MAP: Record<string, ViewAs> = {
  'ms@cpc-market.com':               'MS',
  'boa@cpc-market.com':              'BOA',
  'citi@cpc-market.com':             'CITI',
  'jpmorgan@cpc-market.com':         'JPM',
  'gs@cpc-market.com':               'GS',
  'ubs@cpc-market.com':              'UBS',
  'bnp@cpc-market.com':              'BNP',
  'db@cpc-market.com':               'DB',
  'barc@cpc-market.com':             'BARC',
  'admin@crosspoint-capital.com':    'MARKET',
}

/** Derive ViewAs from the known email map, then user_metadata, then email prefix. */
function resolveViewAs(user: { email?: string; user_metadata?: Record<string, unknown> }): ViewAs | null {
  // 1. Explicit email table (most reliable)
  if (user.email) {
    const mapped = EMAIL_ROLE_MAP[user.email.toLowerCase().trim()]
    if (mapped) return mapped
  }

  // 2. user_metadata fields: role, dealer, viewAs, firm
  const meta = user.user_metadata ?? {}
  for (const field of ['role', 'dealer', 'viewAs', 'firm']) {
    const val = (meta[field] as string | undefined)?.toUpperCase()
    if (val && (VIEW_AS_OPTIONS as readonly string[]).includes(val)) return val as ViewAs
    if (val === 'ADMIN') return 'MARKET'
  }

  // 3. Email prefix fallback (e.g. ms@example.com → MS)
  if (user.email) {
    const prefix = user.email.split('@')[0].toUpperCase()
    if ((VIEW_AS_OPTIONS as readonly string[]).includes(prefix)) return prefix as ViewAs
    if (prefix === 'ADMIN') return 'MARKET'
  }

  return null
}

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [accepted, setAccepted] = useState(false)

  // If already have a valid session today, skip login
  useEffect(() => {
    if (hasValidSession()) {
      const va = loadViewAs()
      window.location.replace(va === 'MARKET' ? '/dashboard/backend' : '/dashboard/market')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError || !data.user) {
        setError(authError?.message ?? 'Sign-in failed. Check your credentials.')
        setLoading(false)
        return
      }

      const viewAs = resolveViewAs({
        email: data.user.email,
        user_metadata: data.user.user_metadata as Record<string, unknown>,
      })

      if (!viewAs) {
        setError('Your account is not mapped to a firm. Contact Crosspoint admin.')
        setLoading(false)
        return
      }

      saveViewAs(viewAs)
      window.location.replace(viewAs === 'MARKET' ? '/dashboard/backend' : '/dashboard/market')
    } catch {
      setError('Unexpected error. Please try again.')
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: '#111111',
    color: '#cccccc',
    border: '1px solid #2a2a2a',
    fontFamily: 'Courier New, monospace',
    fontSize: '14px',
    letterSpacing: '1px',
    outline: 'none',
    borderRadius: '2px',
    boxSizing: 'border-box',
  }

  const canSubmit = !loading && email.trim().length > 0 && password.length > 0 && accepted

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Courier New, monospace',
    }}>
      <div style={{ width: '360px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#f0c040', letterSpacing: '3px', marginBottom: '6px' }}>
            CROSSPOINT CAPITAL
          </div>
          <div style={{ fontSize: '11px', color: '#444', letterSpacing: '3px' }}>
            CMBX CONTRIBUTOR
          </div>
        </div>

        {/* Sign-in form */}
        <form onSubmit={handleSubmit} autoComplete="off">

          {/* Email / Username */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#555', letterSpacing: '2px', marginBottom: '6px' }}>
              USERNAME
            </label>
            <input
              type="text"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="username or email"
              autoFocus
              autoComplete="username"
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = '#f0c040' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#2a2a2a' }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#555', letterSpacing: '2px', marginBottom: '6px' }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="——————"
              autoComplete="current-password"
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = '#f0c040' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#2a2a2a' }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginBottom: '14px', fontSize: '11px', color: '#ff6666', letterSpacing: '1px' }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '12px',
              background: canSubmit ? '#1a1200' : '#111',
              color: canSubmit ? '#f0c040' : '#444',
              border: `1px solid ${canSubmit ? '#f0c040' : '#222'}`,
              fontFamily: 'Courier New, monospace',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '3px',
              cursor: canSubmit ? 'pointer' : 'default',
              borderRadius: '2px',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = '#2a2000' }}
            onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = '#1a1200' }}
          >
            {loading ? 'SIGNING IN…' : 'SIGN IN'}
          </button>
        </form>

      </div>

      {/* Legal Disclaimer */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '28vh',
        overflowY: 'auto',
        background: '#050505',
        borderTop: '1px solid #1a1a1a',
        padding: '12px 24px 16px',
        fontFamily: 'Courier New, monospace',
      }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              style={{ accentColor: '#f0c040', width: '13px', height: '13px', cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ fontSize: '9px', color: '#888', letterSpacing: '1px' }}>
              I have read and agree to the terms below
            </span>
          </label>
          <div style={{ fontSize: '8px', color: '#888', letterSpacing: '2px', marginBottom: '8px', fontWeight: 700 }}>
            LEGAL DISCLAIMER &amp; TERMS OF ACCESS
          </div>
          {[
            ['Regulatory status.', 'Crosspoint Capital operates this screen solely as a FINRA-registered Broker Dealer. This screen is a voice and hybrid communication facility only. Crosspoint does not operate a swap execution facility ("SEF"), alternative trading system ("ATS"), exchange, or any multilateral execution platform, and does not satisfy the conditions requiring SEF registration under Section 5h of the Commodity Exchange Act or CFTC regulations thereunder [17 CFR Part 37; CFTC Staff Letter 14-147]. All transactions are bilaterally negotiated off-screen on a name give-up basis.'],
            ['Indicative only — subject to call.', 'All bids, offers, and pricing information ("Quotes") displayed are indicative and non-binding. Quotes are communicated by dealer participants and posted manually by Crosspoint personnel. Quotes may be withdrawn, modified, or cancelled at any time without notice. No transaction is formed by viewing any Quote.'],
            ['Latency, accuracy & timing disputes.', 'Quotes displayed on this screen are subject to inherent transmission latency arising from the voice and hybrid nature of Crosspoint\'s brokerage operations. A material delay may exist between the time a dealer communicates a bid, offer, or withdrawal and the time such communication is reflected on screen. Accordingly, any Quote displayed may be stale, superseded, withdrawn, or no longer available at the time of viewing. In the event of any dispute concerning the timing of a communication, withdrawal, or transaction, Crosspoint\'s internal records — including system-generated timestamps, communication logs, and voice recordings where applicable — shall serve as the authoritative reference for establishing the sequence and timing of events. All participants acknowledge and accept the inherent operational latency of a voice and hybrid communication facility as a condition of access.'],
            ['Name give-up only.', 'Crosspoint is not a principal, counterparty, market maker, dealer, clearing member, or central counterparty to any transaction. Crosspoint does not take positions, guarantee any Quote, or guarantee the credit, performance, or settlement of any dealer participant. Bilateral settlement is solely the responsibility of the transacting counterparties.'],
            ['Eligibility.', 'Access is restricted to eligible contract participants as defined under the Commodity Exchange Act and to permissioned institutional counterparties. Use of this screen by any other person is unauthorized.'],
            ['No solicitation. No advice. No best execution.', 'Nothing on this screen constitutes an offer, solicitation, advice, recommendation, or research of any kind. Crosspoint owes no duty of best execution, best price, or suitability to any user [FINRA Rule 5310 — inapplicable]. Users are presumed to be sophisticated institutions capable of independent assessment.'],
            ['Limitation of liability.', 'To the maximum extent permitted by law, Crosspoint Capital, its affiliates, officers, and employees shall have no liability whatsoever for any direct, indirect, incidental, special, consequential, or punitive damages arising from use of or reliance on this screen or any Quote displayed hereon, except in cases of gross negligence or willful misconduct as finally determined by the applicable dispute resolution body.'],
            ['Dispute resolution.', 'FINRA members: Any dispute arising out of or relating to this screen or any transaction facilitated herein between Crosspoint and any FINRA member firm or associated person is subject to mandatory arbitration before FINRA under the Code of Arbitration Procedure for Industry Disputes [Rule 13200].'],
            ['Books & records.', 'Crosspoint maintains screen activity and acceptance logs in accordance with applicable FINRA and CFTC recordkeeping obligations.'],
          ].map(([heading, body]) => (
            <div key={heading} style={{ marginBottom: '5px', fontSize: '8px', lineHeight: '1.5', color: '#333' }}>
              <span style={{ color: '#555', fontWeight: 700 }}>{heading} </span>
              {body}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
