import React from 'react'

interface NavTabsProps {
  active:       'market' | 'history' | 'admin'
  isTrader:     boolean
  accent?:      string
  onSettings?:  () => void
}

export function NavTabs({ active, isTrader, accent = '#f0c040', onSettings }: NavTabsProps) {
  const tabs: { id: string; label: string; href: string }[] = [
    { id: 'market',  label: 'MARKET',  href: '/dashboard/market'  },
    { id: 'history', label: 'HISTORY', href: '/dashboard/history' },
    ...(isTrader ? [{ id: 'admin', label: 'ADMIN', href: '/dashboard/backend' }] : []),
  ]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      background: '#060606',
      borderBottom: '1px solid #1e1e1e',
      flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.id
        return (
          <a
            key={tab.id}
            href={tab.href}
            style={{
              display: 'inline-block',
              padding: '6px 20px',
              fontSize: '12px',
              letterSpacing: '2px',
              fontFamily: 'Courier New, monospace',
              fontWeight: isActive ? 700 : 400,
              color: isActive ? accent : '#3a3a3a',
              textDecoration: 'none',
              borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'color 0.1s',
            }}
          >
            {tab.label}
          </a>
        )
      })}

      {/* Settings gear — right-aligned */}
      {onSettings && (
        <button
          onClick={onSettings}
          title="Display settings"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: '#3a3a3a',
            fontSize: '15px',
            cursor: 'pointer',
            padding: '4px 8px',
            fontFamily: 'Courier New, monospace',
            lineHeight: 1,
          }}
        >
          ⚙
        </button>
      )}
    </div>
  )
}
