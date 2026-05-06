'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError('')

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError || !data.user) {
      setError(signInError?.message ?? 'Login failed')
      setLoading(false)
      return
    }

    // Fetch profile to determine role-based redirect
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile) {
      setError(`Profile not found: ${profileError?.message ?? 'no profile row'}. Contact admin.`)
      setLoading(false)
      return
    }

    if (profile.role === 'trader') {
      window.location.href = '/dashboard/backend'
    } else {
      window.location.href = '/dashboard/market'
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#1a1a1a',
    border: '1px solid #333333',
    color: '#ffffff',
    padding: '10px',
    width: '100%',
    fontFamily: 'Courier New, monospace',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#888888',
    fontSize: '11px',
    letterSpacing: '1px',
    fontFamily: 'Courier New, monospace',
    marginBottom: '6px',
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
      <div style={{
        background: '#111111',
        border: '1px solid #333333',
        padding: '40px',
        width: '400px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            color: '#f0c040',
            fontSize: '22px',
            fontFamily: 'Courier New, monospace',
            letterSpacing: '4px',
            fontWeight: 700,
            marginBottom: '8px',
          }}>
            CMBX CONTRIBUTOR
          </div>
          <div style={{
            color: '#555555',
            fontSize: '12px',
            letterSpacing: '2px',
            fontFamily: 'Courier New, monospace',
          }}>
            — CROSSPOINT CAPITAL
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>EMAIL</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{
            color: '#ff6666',
            fontSize: '12px',
            marginBottom: '16px',
            fontFamily: 'Courier New, monospace',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            background: '#f0c040',
            color: '#000000',
            border: 'none',
            padding: '12px',
            width: '100%',
            fontFamily: 'Courier New, monospace',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '2px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'SIGNING IN...' : 'SIGN IN'}
        </button>

        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          color: '#333333',
          fontSize: '11px',
          fontFamily: 'Courier New, monospace',
        }}>
          INTERNAL USE ONLY
        </div>
      </div>
    </div>
  )
}
