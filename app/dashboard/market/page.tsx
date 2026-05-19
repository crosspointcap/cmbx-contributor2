'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import { formatPx, fmtTime } from '../../../lib/utils' // fmtTime used for last_trade_time column

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)


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

// Color each dealer sees for THEIR OWN prices
const MY_COLOR: Record<string, string> = {
  MS:   '#4488ff',  // blue  (as specified)
  BOA:  '#88ff88',  // green
  CITI: '#cc88ff',  // purple
  JPM:  '#44ddff',  // cyan
  GS:   '#ffcc44',  // gold
  UBS:  '#ff88cc',  // pink
  BNP:  '#9999ff',  // indigo
  DB:   '#66ccff',  // sky
  BARC: '#ffaa66',  // orange
}
// MS sees ALL other dealers' prices in red; everyone else sees them in white
const MS_OTHERS_COLOR = '#ff5555'

function priceColor(priceDealer: string | null, myDealer: string | null, hasPrice: boolean): string {
  if (!hasPrice) return '#2a2a2a'
  if (!priceDealer) return '#ffffff'                          // unattributed → white
  if (priceDealer === myDealer) return MY_COLOR[myDealer ?? ''] ?? '#f0c040'  // YOUR price
  if (myDealer === 'MS') return MS_OTHERS_COLOR               // MS sees others red
  if (!myDealer) return '#ffffff'                             // not logged in → white
  return '#ffffff'                                            // all others see white
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
  const [myDealerCode, setMyDealerCode] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set())

  // ── Hard auth — redirect to /login if no session; traders go to /backend ────
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }
      const { data: prof } = await supabase
        .from('profiles').select('role, dealer_code').eq('id', session.user.id).single()
      // Traders belong on the backend page — send them there
      if (prof?.role === 'trader') { window.location.href = '/dashboard/backend'; return }
      if (prof?.dealer_code) setMyDealerCode(prof.dealer_code)
      setAuthReady(true)
    }
    checkAuth()
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
        // Guard: DELETE events have no payload.new — price rows are nulled, not deleted
        if (payload.eventType === 'DELETE') return
        const p = payload.new as Price
        if (!p?.series_number) return
        const key = `${p.series_number}:${p.tranche_name}`
        // Merge into existing — preserves mode (and other unchanged cols) if not in the realtime payload
        setPrices(prev => ({ ...prev, [key]: { ...prev[key], ...p } }))
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

  if (!authReady) return null

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderBottom: '1px solid #161616', flexShrink: 0, background: '#060606' }}>
        <span style={{ color: '#282828', fontSize: '10px', marginRight: '2px', letterSpacing: '1px' }}>COLS</span>
        {ALL_COLS.map(col => {
          const hidden = hiddenCols.has(col.key)
          return (
            <button
              key={col.key}
              onClick={() => toggleCol(col.key)}
              style={{
                background: 'transparent',
                color: hidden ? '#1e1e1e' : '#383838',
                border: `1px solid ${hidden ? '#181818' : '#2a2a2a'}`,
                padding: '1px 6px',
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

      {/* Price grid */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Price grid */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: '#444', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                <th style={{ textAlign: 'left', padding: '5px 6px 5px 10px', borderBottom: '1px solid #1a1a1a', width: '88px', fontWeight: 400, color: '#333' }}>TRANCHE</th>
                {!hiddenCols.has('bid')    && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1a1a1a', minWidth: '70px', fontWeight: 400, color: '#333' }}>BID</th>}
                {!hiddenCols.has('ask')    && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1a1a1a', minWidth: '70px', fontWeight: 400, color: '#333' }}>ASK</th>}
                {!hiddenCols.has('bsz')    && <th style={{ textAlign: 'right', padding: '5px 8px',  borderBottom: '1px solid #1a1a1a', minWidth: '50px', fontWeight: 400, color: '#333' }}>B.SZ</th>}
                {!hiddenCols.has('asz')    && <th style={{ textAlign: 'right', padding: '5px 8px',  borderBottom: '1px solid #1a1a1a', minWidth: '50px', fontWeight: 400, color: '#333' }}>A.SZ</th>}
                {!hiddenCols.has('lastpx') && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1a1a1a', minWidth: '70px', fontWeight: 400, color: '#333' }}>LAST PX</th>}
                {!hiddenCols.has('time')   && <th style={{ textAlign: 'right', padding: '5px 12px 5px 8px', borderBottom: '1px solid #1a1a1a', minWidth: '70px', fontWeight: 400, color: '#333' }}>TIME</th>}
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
                          padding: '4px 10px 3px 8px',
                          color: '#f0c040',
                          background: '#0b0b0b',
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '2px',
                          borderBottom: '1px solid #161616',
                          borderTop: '2px solid #1c1500',
                          borderLeft: '2px solid #3a2a00',
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

                      const bidColor = priceColor(price?.bid_dealer ?? null, myDealerCode, price?.bid != null)
                      const askColor = priceColor(price?.ask_dealer ?? null, myDealerCode, price?.ask != null)

                      return (
                        <tr
                          key={rowKey}
                          style={{ background: rowBg, borderBottom: '1px solid #1e1e1e' }}
                        >
                          <td style={{ padding: '5px 6px 5px 10px', color: '#ffffff', whiteSpace: 'nowrap', width: '88px', fontSize: '12px', fontWeight: 700 }}>
                            {t.tranche_name}.{s.series_number}
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
                            <td style={{ textAlign: 'right', padding: '5px 8px', color: price?.bid_size != null ? '#4a6a8a' : '#1e1e1e', fontSize: '12px' }}>
                              {price?.bid_size != null ? String(price.bid_size) : '—'}
                            </td>
                          )}
                          {!hiddenCols.has('asz') && (
                            <td style={{ textAlign: 'right', padding: '5px 8px', color: price?.ask_size != null ? '#4a6a8a' : '#1e1e1e', fontSize: '12px' }}>
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

      </div>

      {/* Legend */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '5px 12px', flexShrink: 0, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '16px', background: '#080808' }}>
        <span style={{ color: '#333' }}><span style={{ color: '#ffffff' }}>■</span> MARKET</span>
        {myDealerCode === 'MS' && <span style={{ color: '#333' }}><span style={{ color: MS_OTHERS_COLOR }}>■</span> OTHER</span>}
        {myDealerCode && <span style={{ color: '#555' }}><span style={{ color: MY_COLOR[myDealerCode] ?? '#f0c040' }}>■</span> YOUR PRICE</span>}
      </div>
    </div>
  )
}
