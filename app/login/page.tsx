'use client'

import { useState, useEffect } from 'react'
import { saveViewAs, hasValidSession, loadViewAs, VIEW_AS_OPTIONS, ViewAs } from '../../lib/theme'

// Accept 'ADMIN' as alias for MARKET, plus all standard dealer codes
const VALID_CODES = ['ADMIN', ...VIEW_AS_OPTIONS] as const

function resolveCode(raw: string): ViewAs | null {
  const upper = raw.trim().toUpperCase()
  if (upper === 'ADMIN') return 'MARKET'
  if ((VIEW_AS_OPTIONS as readonly string[]).includes(upper)) return upper as ViewAs
  return null
}

function checkPassword(input: string): boolean {
  const expected = process.env.NEXT_PUBLIC_CMBX_PASSWORD ?? 'cmbx2026'
  return input === expected
}

export default function LoginPage() {
  const [firmCode, setFirmCode]   = useState('')
  const [password, setPassword]   = useState('')
  const [error,    setError]      = useState('')
  const [loading,  setLoading]    = useState(false)

  // If already have a valid session today, skip the selector
  useEffect(() => {
    if (hasValidSession()) {
      const va = loadViewAs()
      window.location.replace(va === 'MARKET' ? '/dashboard/backend' : '/dashboard/market')
    }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const code = resolveCode(firmCode)
    if (!code) {
      setError('Unknown firm code. Use ADMIN or a dealer code (MS, BOA, JPM…)')
      setLoading(false)
      return
    }
    if (!checkPassword(password)) {
      setError('Incorrect password.')
      setLoading(false)
      return
    }

    saveViewAs(code)
    window.location.href = code === 'MARKET' ? '/dashboard/backend' : '/dashboard/market'
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

          {/* Firm Code */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#555', letterSpacing: '2px', marginBottom: '6px' }}>
              FIRM CODE
            </label>
            <input
              type="text"
              value={firmCode}
              onChange={e => { setFirmCode(e.target.value); setError('') }}
              placeholder="e.g. ADMIN · MS · BOA · JPM"
              autoFocus
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
            disabled={loading || !firmCode || !password}
            style={{
              width: '100%',
              padding: '12px',
              background: loading || !firmCode || !password ? '#111' : '#1a1200',
              color: loading || !firmCode || !password ? '#444' : '#f0c040',
              border: `1px solid ${loading || !firmCode || !password ? '#222' : '#f0c040'}`,
              fontFamily: 'Courier New, monospace',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '3px',
              cursor: loading || !firmCode || !password ? 'default' : 'pointer',
              borderRadius: '2px',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (!loading && firmCode && password) e.currentTarget.style.background = '#2a2000' }}
            onMouseLeave={e => { if (!loading && firmCode && password) e.currentTarget.style.background = '#1a1200' }}
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
