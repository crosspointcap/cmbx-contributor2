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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    window.location.href = '/dashboard/backend'
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '"IBM Plex Mono", monospace',
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
            fontSize: '24px',
            fontFamily: '"IBM Plex Mono", monospace',
            letterSpacing: '4px',
            fontWeight: 600,
            marginBottom: '8px',
          }}>
            CMBX CONTRIBUTOR
          </div>
          <div style={{
            color: '#555555',
            fontSize: '12px',
            letterSpacing: '2px',
          }}>
            — CROSSPOINT CAPITAL
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: '#888888',
            fontSize: '11px',
            letterSpacing: '1px',
            fontFamily: '"IBM Plex Mono", monospace',
            marginBottom: '6px',
          }}>
            EMAIL
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{
              background: '#1a1a1a',
              border: '1px solid #333333',
              color: '#ffffff',
              padding: '10px',
              width: '100%',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            color: '#888888',
            fontSize: '11px',
            letterSpacing: '1px',
            fontFamily: '"IBM Plex Mono", monospace',
            marginBottom: '6px',
          }}>
            PASSWORD
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{
              background: '#1a1a1a',
              border: '1px solid #333333',
              color: '#ffffff',
              padding: '10px',
              width: '100%',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{
            color: '#ff6666',
            fontSize: '12px',
            marginBottom: '16px',
            fontFamily: '"IBM Plex Mono", monospace',
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
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '13px',
            fontWeight: 500,
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
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          INTERNAL USE ONLY
        </div>
      </div>
    </div>
  )
}
