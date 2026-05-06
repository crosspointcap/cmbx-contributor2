'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Each dealer's brand color — shown for their OWN prices only
const DEALER_COLOR: Record<string, string> = {
  MS:   '#ff5555',
  BOA:  '#44dd44',
  CITI: '#bb55ee',
  JPM:  '#3388ff',
  GS:   '#eebb00',
  UBS:  '#ee4499',
  BNP:  '#6666ff',
  DB:   '#11aacc',
  BARC: '#dd7722',
}

interface Profile {
  role: string
  dealer_code: string | null
}

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
}

interface SeriesConfig {
  series_number: string
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
  const [profile,      setProfile]      = useState<Profile | null>(null)
  const [authChecked,  setAuthChecked]  = useState(false)
  const [series,       setSeries]       = useState<SeriesConfig[]>([])
  const [tranches,     setTranches]     = useState<TrancheConfig[]>([])
  const [prices,       setPrices]       = useState<Record<string, Price>>({})
  const [flashRows,    setFlashRows]    = useState<Record<string, 'red' | 'green'>>({})
  const [lastTrade,    setLastTrade]    = useState<{ series: string; tranche: string; price: number | null; time: string } | null>(null)

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('role, dealer_code')
        .eq('id', session.user.id)
        .single()

      if (!prof)                  { window.location.href = '/login';             return }
      if (prof.role === 'trader') { window.location.href = '/dashboard/backend'; return }

      setProfile(prof)
      setAuthChecked(true)
    }
    checkAuth()
  }, [])

  // ── Data + realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!authChecked) return
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
        setLastTrade({ series: t.series_number, tranche: t.tranche_name, price: t.price, time: fmtTime(t.created_at) })
      })
      .subscribe()

    async function loadData() {
      const [{ data: sd }, { data: td }, { data: pd }] = await Promise.all([
        supabase.from('series_config').select('series_number, sort_order').eq('active', true).order('sort_order'),
        supabase.from('tranche_config').select('tranche_name, sort_order').eq('active', true).order('sort_order'),
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
  }, [authChecked])

  function flashRowEffect(key: string, color: 'red' | 'green') {
    let count = 0
    const id = setInterval(() => {
      setFlashRows(prev => {
        if (key in prev) { const n = { ...prev }; delete n[key]; return n }
        return { ...prev, [key]: color }
      })
      count++
      if (count >= 6) clearInterval(id)
    }, 250)
  }

  const myCode  = profile?.dealer_code ?? null
  const myColor = myCode ? (DEALER_COLOR[myCode] ?? '#f0c040') : '#f0c040'

  // ── Loading screen ────────────────────────────────────────────────────────
  if (!authChecked) return (
    <div style={{ background: '#0a0a0a', color: '#444', fontFamily: 'Courier New, monospace', fontSize: '15px', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      AUTHENTICATING...
    </div>
  )

  // ── Helper: price color ───────────────────────────────────────────────────
  function priceColor(val: number | null, dealer: string | null, side: 'bid' | 'ask') {
    if (val == null) return '#2a2a2a'
    if (myCode && dealer === myCode) return myColor          // OWN price → brand color
    return side === 'bid' ? '#66ff88' : '#ff6666'            // others → generic green/red
  }

  return (
    <div style={{ background: '#0a0a0a', color: '#ccc', fontFamily: 'Courier New, monospace', fontSize: '15px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <span style={{ color: '#f0c040', fontSize: '15px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX MARKET — CROSSPOINT CAPITAL
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {myCode && (
            <span style={{ color: myColor, fontSize: '15px', fontWeight: 700, border: `1px solid ${myColor}`, padding: '2px 10px', borderRadius: '2px', letterSpacing: '1px' }}>
              {myCode}
            </span>
          )}
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
            style={{ background: 'transparent', color: '#555', border: '1px solid #2a2a2a', padding: '2px 8px', fontSize: '13px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px' }}
          >
            SIGN OUT
          </button>
        </div>
      </div>

      {/* Grid — READ ONLY */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
          <thead>
            <tr style={{ color: '#444', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
              <th style={{ textAlign: 'left',  padding: '6px 8px 6px 12px', borderBottom: '1px solid #1e1e1e', width: '180px', fontWeight: 400 }}>TRANCHE</th>
              <th style={{ textAlign: 'right', padding: '5px 8px',          borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 400 }}>SIZE</th>
              <th style={{ textAlign: 'right', padding: '5px 10px',         borderBottom: '2px solid #66ff88', minWidth: '100px', fontWeight: 400 }}>BID</th>
              <th style={{ textAlign: 'right', padding: '5px 10px',         borderBottom: '2px solid #ff6666', minWidth: '100px', fontWeight: 400 }}>OFFER</th>
              <th style={{ textAlign: 'right', padding: '5px 8px',          borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 400 }}>SIZE</th>
              <th style={{ textAlign: 'right', padding: '5px 12px 5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '130px', fontWeight: 400 }}>LST TRADE PX</th>
            </tr>
          </thead>
          <tbody>
            {series.map(s => {
              // Only show series that have at least one priced tranche
              const liveTranches = tranches.filter(t => {
                const p = prices[`${s.series_number}:${t.tranche_name}`]
                return p?.bid != null || p?.ask != null || p?.last_trade_px != null
              })
              if (liveTranches.length === 0) return null

              return (
                <Fragment key={s.series_number}>
                  {/* Series header */}
                  <tr>
                    <td colSpan={6} style={{ padding: '8px 12px 5px 10px', color: '#f0c040', background: '#0c0c0c', fontSize: '15px', fontWeight: 600, letterSpacing: '1px', borderBottom: '1px solid #1e1e1e', borderTop: '1px solid #1a1a1a', borderLeft: '2px solid #f0c040' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span>CMBX.{s.series_number}</span>
                        <span style={{ color: '#555', fontSize: '10px', fontWeight: 400 }}>
                          {liveTranches.length} {liveTranches.length === 1 ? 'price' : 'prices'}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {liveTranches.map((t, tIdx) => {
                    const rowKey = `${s.series_number}:${t.tranche_name}`
                    const price  = prices[rowKey]
                    const flash  = flashRows[rowKey]
                    const isOdd  = tIdx % 2 === 1

                    let rowBg = isOdd ? '#0e0e0e' : '#0a0a0a'
                    if (flash === 'red')   rowBg = '#3a0000'
                    if (flash === 'green') rowBg = '#003a00'

                    const bidColor = priceColor(price?.bid ?? null, price?.bid_dealer ?? null, 'bid')
                    const askColor = priceColor(price?.ask ?? null, price?.ask_dealer ?? null, 'ask')

                    return (
                      <tr key={rowKey} style={{ background: rowBg, borderBottom: '1px solid #161616' }}>
                        {/* TRANCHE */}
                        <td style={{ padding: '6px 8px 6px 12px', color: '#ffffff', whiteSpace: 'nowrap' }}>
                          CMBX.{s.series_number}.{t.tranche_name}
                        </td>
                        {/* BID SIZE */}
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: price?.bid_size != null ? '#888' : '#2a2a2a' }}>
                          {price?.bid_size != null ? String(price.bid_size) : '—'}
                        </td>
                        {/* BID */}
                        <td style={{ textAlign: 'right', padding: '6px 10px', color: bidColor, borderLeft: '2px solid #1a3a1a' }}>
                          {price?.bid != null ? String(price.bid) : <span style={{ color: '#2a2a2a' }}>—</span>}
                        </td>
                        {/* ASK */}
                        <td style={{ textAlign: 'right', padding: '6px 10px', color: askColor, borderLeft: '2px solid #3a1a1a' }}>
                          {price?.ask != null ? String(price.ask) : <span style={{ color: '#2a2a2a' }}>—</span>}
                        </td>
                        {/* ASK SIZE */}
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: price?.ask_size != null ? '#888' : '#2a2a2a' }}>
                          {price?.ask_size != null ? String(price.ask_size) : '—'}
                        </td>
                        {/* LAST TRADE */}
                        <td style={{ textAlign: 'right', padding: '6px 12px 6px 8px' }}>
                          {price?.last_trade_px != null ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                              <span style={{ color: '#888' }}>{String(price.last_trade_px)}</span>
                              {price.last_trade_time && (
                                <span style={{ color: '#444', fontSize: '10px' }}>{fmtTime(price.last_trade_time)}</span>
                              )}
                            </div>
                          ) : <span style={{ color: '#2a2a2a' }}>—</span>}
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

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '5px 12px', flexShrink: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '16px', background: '#080808' }}>
        {lastTrade ? (
          <>
            <span style={{ color: '#444' }}>[{lastTrade.time}]</span>
            <span style={{ color: '#888' }}>LAST TRADE:</span>
            <span style={{ color: '#ccc' }}>CMBX.{lastTrade.series}.{lastTrade.tranche}</span>
            <span style={{ color: '#444' }}>@</span>
            <span style={{ color: '#f0c040' }}>{lastTrade.price ?? '—'}</span>
          </>
        ) : (
          <span style={{ color: '#2a2a2a' }}>— no trades this session</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#555' }}><span style={{ color: '#66ff88' }}>■</span> BID</span>
          <span style={{ color: '#555' }}><span style={{ color: '#ff6666' }}>■</span> ASK</span>
          {myCode && <span style={{ color: '#555' }}><span style={{ color: myColor }}>■</span> YOUR PRICE</span>}
        </span>
      </div>
    </div>
  )
}
