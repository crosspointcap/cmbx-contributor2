import React from 'react'

interface NavTabsProps {
  active:       'market' | 'history' | 'admin'
  isTrader:     boolean
  accent?:      string
  bg?:          string
  fg?:          string
  onSettings?:  () => void
}

export function NavTabs({ active, isTrader, accent = '#f0c040', bg = '#060606', fg = '#ffffff', onSettings }: NavTabsProps) {
  const tabs: { id: string; label: string; href: string }[] = [
    { id: 'market',  label: 'MARKET',  href: '/dashboard/market'  },
    { id: 'history', label: 'HISTORY', href: '/dashboard/history' },
    ...(isTrader ? [{ id: 'admin', label: 'ADMIN', href: '/dashboard/backend' }] : []),
  ]

  const inactiveFg = `${fg}44`

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      background: bg,
      borderBottom: `1px solid ${fg}22`,
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
              color: isActive ? accent : inactiveFg,
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
            border: `1px solid ${accent}66`,
            color: accent,
            fontSize: '24px',
            cursor: 'pointer',
            padding: '2px 12px',
            fontFamily: 'Courier New, monospace',
            lineHeight: 1,
            borderRadius: '2px',
            opacity: 0.75,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = accent }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.borderColor = `${accent}66` }}
        >
          ⚙
        </button>
      )}
    </div>
  )
}
