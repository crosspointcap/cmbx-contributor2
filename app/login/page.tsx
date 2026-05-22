'use client'

import { useEffect } from 'react'
import { saveViewAs, hasValidSession, loadViewAs, VIEW_AS_OPTIONS, ViewAs } from '../../lib/theme'

const DEALERS: ViewAs[] = ['MS', 'BOA', 'CITI', 'JPM', 'GS', 'UBS', 'BNP', 'DB', 'BARC']

const DEALER_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  MS:   { bg: '#3a0a0a', border: '#cc3333', color: '#ff9999' },
  BOA:  { bg: '#0a2a0a', border: '#228822', color: '#88ee88' },
  CITI: { bg: '#1a0a2a', border: '#882299', color: '#cc88ff' },
  JPM:  { bg: '#0a1a3a', border: '#1155bb', color: '#5599ff' },
  GS:   { bg: '#1a1a00', border: '#887700', color: '#ffcc44' },
  UBS:  { bg: '#2a0a1a', border: '#992255', color: '#ff88cc' },
  BNP:  { bg: '#0a0a2a', border: '#333399', color: '#8888ff' },
  DB:   { bg: '#0a1a22', border: '#116688', color: '#44bbdd' },
  BARC: { bg: '#1a0f00', border: '#884400', color: '#ffaa66' },
}

function select(viewAs: ViewAs) {
  saveViewAs(viewAs)
  window.location.href = viewAs === 'MARKET' ? '/dashboard/backend' : '/dashboard/market'
}

export default function LoginPage() {
  // If already have a valid session today, skip the selector
  useEffect(() => {
    if (hasValidSession()) {
      const va = loadViewAs()
      window.location.replace(va === 'MARKET' ? '/dashboard/backend' : '/dashboard/market')
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Courier New, monospace',
    }}>
      <div style={{ width: '480px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#f0c040', letterSpacing: '3px', marginBottom: '6px' }}>
            CROSSPOINT CAPITAL
          </div>
          <div style={{ fontSize: '11px', color: '#444', letterSpacing: '3px' }}>
            CMBX CONTRIBUTOR
          </div>
        </div>

        {/* Prompt */}
        <div style={{ fontSize: '11px', color: '#555', letterSpacing: '2px', marginBottom: '16px', textAlign: 'center' }}>
          SELECT YOUR FIRM TO CONTINUE
        </div>

        {/* Admin button */}
        <button
          onClick={() => select('MARKET')}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '24px',
            background: '#1a1200',
            color: '#f0c040',
            border: '1px solid #f0c040',
            fontFamily: 'Courier New, monospace',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '2px',
            cursor: 'pointer',
            borderRadius: '2px',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2a2000' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1a1200' }}
        >
          CROSSPOINT CAPITAL — ADMIN
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
          <span style={{ fontSize: '10px', color: '#333', letterSpacing: '2px' }}>DEALER</span>
          <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
        </div>

        {/* Dealer grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {DEALERS.map(code => {
            const c = DEALER_COLORS[code]
            return (
              <button
                key={code}
                onClick={() => select(code)}
                style={{
                  padding: '14px 10px',
                  background: c.bg,
                  color: c.color,
                  border: `1px solid ${c.border}`,
                  fontFamily: 'Courier New, monospace',
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  transition: 'filter 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)' }}
                onMouseLeave={e => { e.currentTarget.style.filter = '' }}
              >
                {code}
              </button>
            )
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: '32px', fontSize: '10px', color: '#2a2a2a', letterSpacing: '1px' }}>
          INTERNAL USE ONLY · SESSION EXPIRES 6PM ET
        </div>

      </div>
    </div>
  )
}
