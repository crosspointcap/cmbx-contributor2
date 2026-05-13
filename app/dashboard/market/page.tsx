'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import { formatPx, fmtTime } from '../../../lib/utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Each dealer's bid/ask shows in their signature color (fingerprinting)
const DEALER_COLORS: Record<string, string> = {
  MS:   '#ff8888',
  BOA:  '#88ff88',
  CITI: '#cc88ff',
  JPM:  '#5aafff',
  GS:   '#ffcc44',
  UBS:  '#ff88cc',
  BNP:  '#8888ff',
  DB:   '#88ccff',
  BARC: '#ffaa66',
}

const DEALERS_ORDERED = ['MS', 'BOA', 'CITI', 'JPM', 'GS', 'UBS', 'BNP', 'DB', 'BARC']

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

interface TradeEntry {
  id: string
  created_at: string
  series_number: string
  tranche_name: string
  side: string
  price: number | null
  mode: string | null
  trade_size: number | string | null
  dealer: string | null
  passive_dealer: string | null
}

type ColKey = 'bid' | 'ask' | 'bsz' | 'asz' | 'lastpx' | 'time'

const ALL_COLS: { key: ColKey; label: string }[] = [
  { key: 'bid',    label: 'BID'     },
  { key: 'ask',    label: 'ASK'     },
  { key: 'bsz',   label: 'B.SZ'    },
  { key: 'asz',   label: 'A.SZ'    },
  { key: 'lastpx',label: 'LAST PX' },
  { key: 'time',  label: 'TIME'    },
]

export default function MarketPage() {
  const [series, setSeries] = useState<SeriesConfig[]>([])
  const [tranches, setTranches] = useState<TrancheConfig[]>([])
  const [prices, setPrices] = useState<Record<string, Price>>({})
  const [flashRows, setFlashRows] = useState<Record<string, 'red' | 'green'>>({})
  const [trades, setTrades] = useState<TradeEntry[]>([])
  const [myDealerCode, setMyDealerCode] = useState<string | null>(null)
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set())

  // ── Soft auth check — get dealer identity if logged in ────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('profiles').select('dealer_code').eq('id', session.user.id).single()
        .then(({ data }) => { if (data?.dealer_code) setMyDealerCode(data.dealer_code) })
    })
  }, [])

  // ── Column visibility — persist to localStorage ───────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('cmbx_market_hidden_cols')
    if (saved) {
      try { setHiddenCols(new Set(JSON.parse(saved) as ColKey[])) } catch {}
    }
  }, [])

  function toggleCol(key: ColKey) {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem('cmbx_market_hidden_cols', JSON.stringify([...next]))
      return next
    })
  }

  // ── Presence: announce this viewer to the admin WHO'S ONLINE panel ─────────
  useEffect(() => {
    const ch = supabase.channel('platform-presence')
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ dealer_code: myDealerCode ?? 'MARKET', page: 'market', online_at: new Date().toISOString() })
      }
    })
    return () => { supabase.removeChannel(ch) }
  }, [myDealerCode])

  // ── Main data channel ─────────────────────────────────────────────────────
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
        setTrades(prev => [{
          id: t.id,
          created_at: t.created_at,
          series_number: t.series_number,
          tranche_name: t.tranche_name,
          side: t.side,
          price: t.price ?? null,
          mode: t.mode ?? null,
          trade_size: t.trade_size ?? null,
          dealer: t.dealer ?? null,
          passive_dealer: t.passive_dealer ?? null,
        }, ...prev])
      })
      .subscribe()

    async function loadData() {
      const [{ data: sd }, { data: td }, { data: pd }, { data: tr }] = await Promise.all([
        supabase.from('series_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('tranche_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('prices').select('*'),
        supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(100),
      ])
      if (cancelled) return
      if (sd) setSeries(sd)
      if (td) setTranches(td)
      if (pd) {
        const map: Record<string, Price> = {}
        for (const p of pd) map[`${p.series_number}:${p.tranche_name}`] = p
        setPrices(map)
      }
      if (tr) setTrades(tr)
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

  return (
    <div style={{ background: '#0a0a0a', color: '#ccc', fontFamily: 'Courier New, monospace', fontSize: '14px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <span style={{ color: '#f0c040', fontSize: '14px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX MARKET — CROSSPOINT CAPITAL
        </span>
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
          style={{
            background: 'transparent',
            color: '#555',
            border: '1px solid #2a2a2a',
            padding: '2px 8px',
            fontSize: '13px',
            fontFamily: 'Courier New, monospace',
            cursor: 'pointer',
            borderRadius: '2px',
          }}
        >
          SIGN OUT
        </button>
      </div>

      {/* Nav tabs — dealers see MARKET + HISTORY only, no ADMIN */}
      <NavTabs active="market" isTrader={false} />

      {/* Column visibility toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, background: '#060606' }}>
        <span style={{ color: '#2a2a2a', fontSize: '11px', marginRight: '2px', letterSpacing: '1px' }}>COLS</span>
        {ALL_COLS.map(col => {
          const hidden = hiddenCols.has(col.key)
          return (
            <button
              key={col.key}
              onClick={() => toggleCol(col.key)}
              style={{
                background: hidden ? 'transparent' : '#1a1a1a',
                color: hidden ? '#2a2a2a' : '#666',
                border: `1px solid ${hidden ? '#1a1a1a' : '#333'}`,
                padding: '1px 7px',
                fontSize: '10px',
                fontFamily: 'Courier New, monospace',
                cursor: 'pointer',
                borderRadius: '2px',
                textDecoration: hidden ? 'line-through' : 'none',
              }}
            >
              {col.label}
            </button>
          )
        })}
      </div>

      {/* Main content: price grid (left) + trade history (right) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Price grid */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: '#444', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                <th style={{ textAlign: 'left', padding: '5px 6px 5px 10px', borderBottom: '1px solid #1e1e1e', width: '130px', fontWeight: 400 }}>TRANCHE</th>
                {!hiddenCols.has('bid')    && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 400 }}>BID</th>}
                {!hiddenCols.has('ask')    && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 400 }}>ASK</th>}
                {!hiddenCols.has('bsz')    && <th style={{ textAlign: 'right', padding: '5px 8px',  borderBottom: '1px solid #1e1e1e', minWidth: '60px', fontWeight: 400 }}>B.SZ</th>}
                {!hiddenCols.has('asz')    && <th style={{ textAlign: 'right', padding: '5px 8px',  borderBottom: '1px solid #1e1e1e', minWidth: '60px', fontWeight: 400 }}>A.SZ</th>}
                {!hiddenCols.has('lastpx') && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 400 }}>LAST PX</th>}
                {!hiddenCols.has('time')   && <th style={{ textAlign: 'right', padding: '5px 12px 5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '80px', fontWeight: 400 }}>TIME</th>}
              </tr>
            </thead>
            <tbody>
              {series.map(s => {
                const visibleTranches = tranches.filter(t => {
                  const p = prices[`${s.series_number}:${t.tranche_name}`]
                  return p?.bid != null || p?.ask != null || p?.last_trade_px != null
                })
                if (visibleTranches.length === 0) return null
                const visibleColCount = 1 + ALL_COLS.filter(c => !hiddenCols.has(c.key)).length
                return (
                  <Fragment key={s.series_number}>
                    <tr>
                      <td
                        colSpan={visibleColCount}
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

                      // Fingerprint: each dealer's price shown in their signature color
                      const bidColor = price?.bid != null
                        ? (DEALER_COLORS[price.bid_dealer ?? ''] ?? '#66ff88')
                        : '#2a2a2a'
                      const askColor = price?.ask != null
                        ? (DEALER_COLORS[price.ask_dealer ?? ''] ?? '#ff6666')
                        : '#2a2a2a'

                      return (
                        <tr
                          key={rowKey}
                          style={{ background: rowBg, borderBottom: '1px solid #1e1e1e' }}
                        >
                          <td style={{ padding: '5px 6px 5px 10px', color: '#ffffff', whiteSpace: 'nowrap', width: '130px' }}>
                            CMBX.{s.series_number}.{t.tranche_name}
                          </td>
                          {!hiddenCols.has('bid') && (
                            <td style={{ textAlign: 'right', padding: '5px 10px', color: bidColor }}>
                              {price?.bid != null ? formatPx(price.bid, price.mode) : <span style={{ color: '#2a2a2a' }}>—</span>}
                            </td>
                          )}
                          {!hiddenCols.has('ask') && (
                            <td style={{ textAlign: 'right', padding: '5px 10px', color: askColor }}>
                              {price?.ask != null ? formatPx(price.ask, price.mode) : <span style={{ color: '#2a2a2a' }}>—</span>}
                            </td>
                          )}
                          {!hiddenCols.has('bsz') && (
                            <td style={{ textAlign: 'right', padding: '5px 8px', color: price?.bid_size != null ? '#aaaaaa' : '#2a2a2a' }}>
                              {price?.bid_size != null ? String(price.bid_size) : '—'}
                            </td>
                          )}
                          {!hiddenCols.has('asz') && (
                            <td style={{ textAlign: 'right', padding: '5px 8px', color: price?.ask_size != null ? '#aaaaaa' : '#2a2a2a' }}>
                              {price?.ask_size != null ? String(price.ask_size) : '—'}
                            </td>
                          )}
                          {!hiddenCols.has('lastpx') && (
                            <td style={{ textAlign: 'right', padding: '5px 10px', color: price?.last_trade_px != null ? '#888' : '#2a2a2a' }}>
                              {price?.last_trade_px != null ? formatPx(price.last_trade_px, price.mode) : '—'}
                            </td>
                          )}
                          {!hiddenCols.has('time') && (
                            <td style={{ textAlign: 'right', padding: '5px 12px 5px 8px', color: '#444' }}>
                              {price?.last_trade_time ? fmtTime(price.last_trade_time) : <span style={{ color: '#2a2a2a' }}>—</span>}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Trade history — right panel */}
        <div style={{ width: '260px', borderLeft: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#080808' }}>
          <div style={{ padding: '5px 10px', borderBottom: '1px solid #1e1e1e', color: '#444', fontSize: '11px', letterSpacing: '2px', flexShrink: 0 }}>
            TRADE HISTORY
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {trades.length === 0 ? (
              <div style={{ padding: '12px 10px', color: '#2a2a2a', fontSize: '12px' }}>NO TRADES TODAY</div>
            ) : trades.map(t => {
              const isInvolved = myDealerCode != null &&
                (t.dealer === myDealerCode || t.passive_dealer === myDealerCode)
              const sideColor = t.side === 'hit' ? '#ff6666' : '#66ff88'
              return (
                <div
                  key={t.id}
                  style={{
                    padding: '5px 10px',
                    borderBottom: '1px solid #111',
                    fontSize: '12px',
                    background: isInvolved ? '#0d0d00' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#333', fontSize: '11px' }}>{fmtTime(t.created_at)}</span>
                    <span style={{ color: sideColor, fontWeight: 700, fontSize: '11px' }}>
                      {t.side === 'hit' ? 'HIT' : 'LIFT'}
                    </span>
                    {isInvolved && (
                      <span style={{ color: '#f0c040', fontSize: '10px', fontWeight: 700 }}>YOU</span>
                    )}
                  </div>
                  <div style={{ color: '#666', fontSize: '12px', marginTop: '1px' }}>
                    CMBX.{t.series_number}.{t.tranche_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                    <span style={{ color: '#888', fontWeight: 600 }}>{formatPx(t.price, t.mode)}</span>
                    {t.trade_size != null && (
                      <span style={{ color: '#444', fontSize: '11px' }}>· {t.trade_size}MM</span>
                    )}
                  </div>
                  {isInvolved && myDealerCode && (
                    <div style={{ color: '#f0c040', fontSize: '10px', marginTop: '1px', opacity: 0.7 }}>
                      {myDealerCode}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>

      {/* Legend — dealer color key */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '5px 12px', flexShrink: 0, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '14px', background: '#080808', flexWrap: 'wrap' }}>
        {DEALERS_ORDERED.map(d => (
          <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: DEALER_COLORS[d], fontSize: '10px' }}>■</span>
            <span style={{ color: '#333' }}>{d}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
