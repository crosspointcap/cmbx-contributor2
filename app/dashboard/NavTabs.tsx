import React from 'react'

interface NavTabsProps {
  active: 'prices' | 'history' | 'admin'
  isTrader: boolean
}

export function NavTabs({ active, isTrader }: NavTabsProps) {
  const tabs: { id: string; label: string; href: string }[] = [
    { id: 'prices',  label: 'PRICES',  href: '/dashboard/market' },
    { id: 'history', label: 'HISTORY', href: '/dashboard/history' },
    ...(isTrader ? [{ id: 'admin', label: 'ADMIN', href: '/dashboard/backend' }] : []),
  ]

  return (
    <div style={{
      display: 'flex',
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
              color: isActive ? '#f0c040' : '#3a3a3a',
              textDecoration: 'none',
              borderBottom: isActive ? '2px solid #f0c040' : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'color 0.1s',
            }}
          >
            {tab.label}
          </a>
        )
      })}
    </div>
  )
}
