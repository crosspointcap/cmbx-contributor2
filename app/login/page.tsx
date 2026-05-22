'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { saveViewAs, hasValidSession, loadViewAs, VIEW_AS_OPTIONS, ViewAs } from '../../lib/theme'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** Derive ViewAs from Supabase user metadata. Falls back to email prefix. */
function resolveViewAs(user: { email?: string; user_metadata?: Record<string, unknown> }): ViewAs | null {
  const meta = user.user_metadata ?? {}

  // Check common metadata fields: role, dealer, viewAs, firm
  for (const field of ['role', 'dealer', 'viewAs', 'firm']) {
    const val = (meta[field] as string | undefined)?.toUpperCase()
    if (val && (VIEW_AS_OPTIONS as readonly string[]).includes(val)) return val as ViewAs
    // ADMIN is an alias for MARKET
    if (val === 'ADMIN') return 'MARKET'
  }

  // Fall back to email prefix (e.g. ms@crosspoint.com → MS)
  if (user.email) {
    const prefix = user.email.split('@')[0].toUpperCase()
    if ((VIEW_AS_OPTIONS as readonly string[]).includes(prefix)) return prefix as ViewAs
    if (prefix === 'ADMIN' || prefix === 'MARKET') return 'MARKET'
  }

  return null
}

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

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
      window.location.href = viewAs === 'MARKET' ? '/dashboard/backend' : '/dashboard/market'
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

  const canSubmit = !loading && email.trim().length > 0 && password.length > 0

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

        <div style={{ textAlign: 'center', marginTop: '32px', fontSize: '10px', color: '#2a2a2a', letterSpacing: '1px' }}>
          INTERNAL USE ONLY · SESSION EXPIRES AT MIDNIGHT ET
        </div>

      </div>
    </div>
  )
}
