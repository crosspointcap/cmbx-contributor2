'use client'
import Link from 'next/link'

interface NavTabsProps {
  active: 'prices' | 'history' | 'admin'
  isTrader: boolean
}

export function NavTabs({ active, isTrader }: NavTabsProps) {
  const tabs: { key: string; label: string; href: string }[] = [
    { key: 'prices',  label: 'PRICES',  href: '/dashboard/market' },
    { key: 'history', label: 'HISTORY', href: '/dashboard/history' },
    ...(isTrader ? [{ key: 'admin', label: 'ADMIN', href: '/dashboard/backend' }] : []),
  ]

  return (
    <div style={{
      display: 'flex',
      gap: '0',
      padding: '0 12px',
      borderBottom: '1px solid #1e1e1e',
      background: '#0a0a0a',
      flexShrink: 0,
    }}>
      {tabs.map(tab => (
        <Link
          key={tab.key}
          href={tab.href}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            fontFamily: 'Courier New, monospace',
            textDecoration: 'none',
            color: active === tab.key ? '#f0c040' : '#555',
            borderBottom: active === tab.key ? '2px solid #f0c040' : '2px solid transparent',
            letterSpacing: '0.08em',
            fontWeight: active === tab.key ? 700 : 400,
            display: 'inline-block',
          }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
