'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const VIEW_AS_OPTIONS = ['MARKET', 'MS', 'BOA', 'JPM', 'GS', 'CITI', 'UBS', 'BNP']

interface Price {
  series_number: string
  tranche_name: string
  bid: number | null
  ask: number | null
  bid_size: number | null
  ask_size: number | null
  bid_dealer: string | null
  ask_dealer: string | null
  last_trade_px: number | null
  last_trade_time: string | null
  mode: string
}

interface SeriesConfig {
  series_number: string
  label: string
  sort_order: number | null
}

interface TrancheConfig {
  tranche_name: string
  sort_order: number
}

function fmtTime(ts: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ts))
}

export default function MarketPage() {
  const [viewAs, setViewAs] = useState<string>('MARKET')
  const [series, setSeries] = useState<SeriesConfig[]>([])
  const [tranches, setTranches] = useState<TrancheConfig[]>([])
  const [prices, setPrices] = useState<Record<string, Price>>({})
  const [flashRows, setFlashRows] = useState<Record<string, 'red' | 'green'>>({})

  useEffect(() => {
    const saved = localStorage.getItem('cmbx_view_as')
    if (saved) setViewAs(saved)
  }, [])

  function handleViewAs(val: string) {
    setViewAs(val)
    localStorage.setItem('cmbx_view_as', val)
  }

  useEffect(() => {
    let cancelled = false

    const ch = supabase
      .channel(`market-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, (payload) => {
        const p = payload.new as Price
        setPrices(prev => ({ ...prev, [`${p.series_number}:${p.tranche_name}`]: p }))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const t = payload.new as any
        const key = `${t.series_number}:${t.tranche_name}`
        flashRowEffect(key, t.side === 'hit' ? 'red' : 'green')
      })
      .subscribe()

    async function loadData() {
      const [{ data: sd }, { data: td }, { data: pd }] = await Promise.all([
        supabase.from('series_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('tranche_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('prices').select('*'),
      ])
      if (cancelled) return
      if (sd) setSeries(sd)
      if (td) setTranches(td)
      if (pd) {
        const map: Record<string, Price> = {}
        for (const p of pd) map[`${p.series_number}:${p.tranche_name}`] = p
        setPrices(map)
      }
    }

    loadData()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [])

  function flashRowEffect(key: string, color: 'red' | 'green') {
    let count = 0
    const id = setInterval(() => {
      setFlashRows(prev => {
        if (key in prev) {
          const next = { ...prev }
          delete next[key]
          return next
        }
        return { ...prev, [key]: color }
      })
      count++
      if (count >= 6) clearInterval(id)
    }, 250)
  }

  const myCode = viewAs === 'MARKET' ? null : viewAs

  return (
    <div style={{ background: '#0a0a0a', color: '#ccc', fontFamily: 'Courier New, monospace', fontSize: '14px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <span style={{ color: '#f0c040', fontSize: '14px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX MARKET — CROSSPOINT CAPITAL
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#444', fontSize: '13px' }}>VIEW AS:</span>
          <select
            value={viewAs}
            onChange={e => handleViewAs(e.target.value)}
            style={{
              background: '#111',
              border: '1px solid #333',
              color: viewAs === 'MARKET' ? '#555' : '#f0c040',
              fontFamily: 'Courier New, monospace',
              fontSize: '13px',
              padding: '3px 8px',
              outline: 'none',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            {VIEW_AS_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      <NavTabs active="prices" isTrader={false} />

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ color: '#ffffff', fontSize: '13px', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
              <th style={{ textAlign: 'left', padding: '5px 6px 5px 10px', borderBottom: '1px solid #1e1e1e', width: '130px', fontWeight: 700 }}>TRANCHE</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 700 }}>BID</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 700 }}>ASK</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '60px', fontWeight: 700 }}>B.SZ</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '60px', fontWeight: 700 }}>A.SZ</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 700 }}>LAST PX</th>
              <th style={{ textAlign: 'right', padding: '5px 12px 5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '80px', fontWeight: 700 }}>TIME</th>
            </tr>
          </thead>
          <tbody>
            {series.map(s => {
              const visibleTranches = tranches.filter(t => {
                const p = prices[`${s.series_number}:${t.tranche_name}`]
                return p?.bid != null || p?.ask != null || p?.last_trade_px != null
              })
              if (visibleTranches.length === 0) return null
              return (
                <Fragment key={s.series_number}>
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '7px 12px 4px',
                        color: '#f0c040',
                        background: '#0e0e0e',
                        fontSize: '13px',
                        fontWeight: 600,
                        letterSpacing: '1px',
                        borderBottom: '1px solid #1e1e1e',
                        borderTop: '1px solid #1a1a1a',
                      }}
                    >
                      CMBX.{s.series_number}
                    </td>
                  </tr>
                  {visibleTranches.map(t => {
                    const rowKey = `${s.series_number}:${t.tranche_name}`
                    const price = prices[rowKey]
                    const flash = flashRows[rowKey]

                    let rowBg = 'transparent'
                    if (flash === 'red') rowBg = '#3a0000'
                    if (flash === 'green') rowBg = '#003a00'

                    const bidColor = price?.bid != null
                      ? (myCode && price.bid_dealer === myCode ? '#4488ff' : '#ffffff')
                      : '#2a2a2a'
                    const askColor = price?.ask != null
                      ? (myCode && price.ask_dealer === myCode ? '#4488ff' : '#ffffff')
                      : '#2a2a2a'

                    return (
                      <tr
                        key={rowKey}
                        style={{ background: rowBg, borderBottom: '1px solid #1e1e1e' }}
                      >
                        <td style={{ padding: '5px 6px 5px 10px', color: '#ffffff', whiteSpace: 'nowrap', width: '130px' }}>
                          CMBX.{s.series_number}.{t.tranche_name}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 10px', color: bidColor }}>
                          {price?.bid != null ? String(price.bid) : <span style={{ color: '#2a2a2a' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 10px', color: askColor }}>
                          {price?.ask != null ? String(price.ask) : <span style={{ color: '#2a2a2a' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 8px', color: price?.bid_size != null ? '#aaaaaa' : '#2a2a2a' }}>
                          {price?.bid_size != null ? String(price.bid_size) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 8px', color: price?.ask_size != null ? '#aaaaaa' : '#2a2a2a' }}>
                          {price?.ask_size != null ? String(price.ask_size) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 10px', color: price?.last_trade_px != null ? '#888' : '#2a2a2a' }}>
                          {price?.last_trade_px != null ? String(price.last_trade_px) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '5px 12px 5px 8px', color: '#444' }}>
                          {price?.last_trade_time ? fmtTime(price.last_trade_time) : <span style={{ color: '#2a2a2a' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '5px 12px', flexShrink: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '16px', background: '#080808' }}>
        <span style={{ color: '#333' }}>
          <span style={{ color: '#66ff88' }}>■</span> BID
        </span>
        <span style={{ color: '#333' }}>
          <span style={{ color: '#ff6666' }}>■</span> ASK
        </span>
        <span style={{ color: '#333' }}>
          <span style={{ color: '#4488ff' }}>■</span> YOUR PRICE
        </span>
        <span style={{ color: '#333' }}>
          <span style={{ color: '#66ff88' }}>●</span> LIVE
        </span>
      </div>
    </div>
  )
}
