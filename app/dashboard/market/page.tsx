'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import { fmt32nds, formatPx, fmtTime } from '../../../lib/utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Each dealer's brand color — shown for their OWN prices only
const DEALER_COLOR: Record<string, string> = {
  MS:   '#88ccff',  // light blue — MS requested
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
  bid_size: string | null
  ask_size: string | null
  bid_dealer: string | null
  ask_dealer: string | null
  last_trade_px: number | null
  last_trade_time: string | null
  mode: string | null
}

interface SeriesConfig {
  series_number: string
  sort_order: number | null
}

interface TrancheConfig {
  tranche_name: string
  sort_order: number
}

interface BlotterEntry {
  id: string
  time: string
  action: 'HIT' | 'LIFT'
  series: string
  tranche: string
  price: number | null
  dealer: string | null
  passive_dealer: string | null
}

interface Layout {
  showSizes: boolean
  showLast:  boolean
  showFeed:  boolean
}

const LAYOUT_KEY = 'cmbx_market_layout'

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return { showSizes: true, showLast: true, showFeed: true, ...JSON.parse(raw) }
  } catch {}
  return { showSizes: true, showLast: true, showFeed: true }
}

function mapTrade(t: any): BlotterEntry {
  return {
    id:             t.id,
    time:           fmtTime(t.created_at),
    action:         t.side === 'hit' ? 'HIT' : 'LIFT',
    series:         t.series_number,
    tranche:        t.tranche_name,
    price:          t.price,
    dealer:         t.dealer        ?? null,
    passive_dealer: t.passive_dealer ?? null,
  }
}

// Small toggle button used in the layout bar
function LayoutToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background:  active ? '#1a1500' : 'transparent',
        color:       active ? '#f0c040' : '#3a3a3a',
        border:     `1px solid ${active ? '#f0c040' : '#222'}`,
        fontWeight:  active ? 700 : 400,
        padding: '2px 10px', fontSize: '11px', fontFamily: 'Courier New, monospace',
        cursor: 'pointer', borderRadius: '2px', letterSpacing: '1px',
      }}
    >{label}</button>
  )
}

export default function MarketPage() {
  const [profile,         setProfile]         = useState<Profile | null>(null)
  const [authChecked,     setAuthChecked]     = useState(false)
  const [series,          setSeries]          = useState<SeriesConfig[]>([])
  const [tranches,        setTranches]        = useState<TrancheConfig[]>([])
  const [prices,          setPrices]          = useState<Record<string, Price>>({})
  const [flashRows,       setFlashRows]       = useState<Record<string, 'red' | 'green'>>({})
  const [lastTrade,       setLastTrade]       = useState<{ series: string; tranche: string; price: number | null; time: string } | null>(null)
  const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(new Set())
  const [blotter,         setBlotter]         = useState<BlotterEntry[]>([])
  const [layout,          setLayout]          = useState<Layout>({ showSizes: true, showLast: true, showFeed: true })
  const defaultsApplied = useRef(false)
  const flashTimers     = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Load persisted layout on mount
  useEffect(() => { setLayout(loadLayout()) }, [])

  function updateLayout(patch: Partial<Layout>) {
    setLayout(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function toggleCollapse(seriesNum: string) {
    setCollapsedSeries(prev => {
      const next = new Set(prev)
      if (next.has(seriesNum)) next.delete(seriesNum)
      else next.add(seriesNum)
      return next
    })
  }

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

      if (!prof) { window.location.href = '/login'; return }

      setProfile(prof)
      setAuthChecked(true)
    }
    checkAuth()
  }, [])

  // ── Broadcast: clear feed when admin wipes the blotter ───────────────────
  useEffect(() => {
    const ch = supabase.channel('trade-blotter-sync')
      .on('broadcast', { event: 'blotter-cleared' }, () => setBlotter([]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── Data + realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!authChecked) return
    let cancelled = false

    const ch = supabase
      .channel(`market-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const p = payload.old as Price
          setPrices(prev => {
            const next = { ...prev }
            delete next[`${p.series_number}:${p.tranche_name}`]
            return next
          })
        } else {
          const p = payload.new as Price
          setPrices(prev => ({ ...prev, [`${p.series_number}:${p.tranche_name}`]: p }))
          // Auto-expand series when a live price arrives
          if (p.bid != null || p.ask != null || p.last_trade_px != null) {
            setCollapsedSeries(prev => {
              if (!prev.has(p.series_number)) return prev
              const next = new Set(prev)
              next.delete(p.series_number)
              return next
            })
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const entry = mapTrade(payload.new)
        flashRowEffect(`${entry.series}:${entry.tranche}`, entry.action === 'HIT' ? 'red' : 'green')
        setLastTrade({ series: entry.series, tranche: entry.tranche, price: entry.price, time: entry.time })
        setBlotter(prev => [entry, ...prev].slice(0, 100))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trades' }, (payload) => {
        const id = (payload.old as any).id
        if (id) setBlotter(prev => prev.filter(b => b.id !== id))
      })
      .subscribe()

    async function loadData() {
      try {
        const [{ data: sd }, { data: td }, { data: pd }, { data: tr }] = await Promise.all([
          supabase.from('series_config').select('series_number, sort_order').eq('active', true).order('sort_order'),
          supabase.from('tranche_config').select('tranche_name, sort_order').eq('active', true).order('sort_order'),
          supabase.from('prices').select('*'),
          supabase.from('trades').select('id, side, series_number, tranche_name, price, created_at, dealer, passive_dealer').order('created_at', { ascending: false }).limit(100),
        ])
        if (cancelled) return
        if (sd) {
          setSeries(sd)
          if (!defaultsApplied.current) {
            const liveSeriesNums = new Set(
              (pd ?? [])
                .filter((p: any) => p.bid != null || p.ask != null || p.last_trade_px != null)
                .map((p: any) => p.series_number)
            )
            setCollapsedSeries(new Set(
              sd.map((s: SeriesConfig) => s.series_number)
                 .filter((sn: string) => !liveSeriesNums.has(sn))
            ))
            defaultsApplied.current = true
          }
        }
        if (td) setTranches(td)
        if (pd) {
          const map: Record<string, Price> = {}
          for (const p of pd) map[`${p.series_number}:${p.tranche_name}`] = p
          setPrices(map)
        }
        if (tr) setBlotter(tr.map(mapTrade))
      } catch (err) {
        console.error('[market] loadData failed:', err)
      }
    }

    loadData()
    return () => {
      cancelled = true
      supabase.removeChannel(ch)
      Object.values(flashTimers.current).forEach(clearTimeout)
      flashTimers.current = {}
    }
  }, [authChecked])

  function flashRowEffect(key: string, color: 'red' | 'green') {
    if (flashTimers.current[key]) clearTimeout(flashTimers.current[key])
    setFlashRows(prev => ({ ...prev, [key]: color }))
    flashTimers.current[key] = setTimeout(() => {
      setFlashRows(prev => { const n = { ...prev }; delete n[key]; return n })
      delete flashTimers.current[key]
    }, 20000)
  }

  const myCode  = profile?.dealer_code ?? null
  const myColor = myCode ? (DEALER_COLOR[myCode] ?? '#f0c040') : '#f0c040'

  function priceColor(val: number | null, dealer: string | null) {
    if (val == null) return '#2a2a2a'
    if (myCode && dealer === myCode) return myColor              // own price → brand color
    if (myCode === 'MS' && dealer !== myCode) return '#ff6666'   // MS only: competitors in red
    return '#ffffff'                                             // all others → white
  }

  if (!authChecked) return (
    <div style={{ background: '#0a0a0a', color: '#444', fontFamily: 'Courier New, monospace', fontSize: '15px', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      AUTHENTICATING...
    </div>
  )

  // Number of visible columns (used for series header colSpan)
  const colCount = 3 + (layout.showSizes ? 2 : 0) + (layout.showLast ? 1 : 0)

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

      {/* Nav tabs */}
      <NavTabs active="market" isTrader={profile?.role === 'trader'} />

      {/* Layout bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', borderBottom: '1px solid #1a1a1a', background: '#080808', flexShrink: 0 }}>
        <span style={{ color: '#2a2a2a', fontSize: '11px', letterSpacing: '1px', marginRight: '2px' }}>SHOW</span>
        <LayoutToggle label="SIZES"  active={layout.showSizes} onClick={() => updateLayout({ showSizes: !layout.showSizes })} />
        <LayoutToggle label="LAST"   active={layout.showLast}  onClick={() => updateLayout({ showLast:  !layout.showLast  })} />
        <LayoutToggle label="FEED"   active={layout.showFeed}  onClick={() => updateLayout({ showFeed:  !layout.showFeed  })} />
      </div>

      {/* Grid + Trade Feed */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Price grid */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
            <thead>
              <tr style={{ color: '#ffffff', fontSize: '15px', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                <th style={{ textAlign: 'left',  padding: '6px 8px 6px 12px', borderBottom: '1px solid #1e1e1e', width: '180px', fontWeight: 700 }}>TRANCHE</th>
                {layout.showSizes && (
                  <th style={{ textAlign: 'right', padding: '3px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 700 }}>SIZE</th>
                )}
                <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '2px solid #66ff88', minWidth: '100px', fontWeight: 700 }}>BID</th>
                <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '2px solid #ff6666', minWidth: '100px', fontWeight: 700 }}>OFFER</th>
                {layout.showSizes && (
                  <th style={{ textAlign: 'right', padding: '3px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 700 }}>SIZE</th>
                )}
                {layout.showLast && (
                  <th style={{ textAlign: 'right', padding: '5px 12px 5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '130px', fontWeight: 700 }}>LST TRADE PX</th>
                )}
              </tr>
            </thead>
            <tbody>
              {series.map(s => {
                const liveCount  = tranches.filter(t => {
                  const p = prices[`${s.series_number}:${t.tranche_name}`]
                  return p?.bid != null || p?.ask != null || p?.last_trade_px != null
                }).length
                const isCollapsed = collapsedSeries.has(s.series_number)

                return (
                  <Fragment key={s.series_number}>
                    <tr onClick={() => toggleCollapse(s.series_number)} style={{ cursor: 'pointer' }}>
                      <td colSpan={colCount} style={{ padding: '8px 12px 5px 10px', color: '#f0c040', background: '#0c0c0c', fontSize: '15px', fontWeight: 600, letterSpacing: '1px', borderBottom: '1px solid #1e1e1e', borderTop: '1px solid #1a1a1a', borderLeft: '2px solid #f0c040' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span>
                            <span style={{ fontSize: '11px', marginRight: '8px' }}>{isCollapsed ? '▶' : '▼'}</span>
                            CMBX.{s.series_number}
                          </span>
                          <span style={{ color: '#555', fontSize: '10px', fontWeight: 400 }}>
                            {liveCount} {liveCount === 1 ? 'price' : 'prices'}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {isCollapsed ? null : tranches.filter(t => {
                      const p = prices[`${s.series_number}:${t.tranche_name}`]
                      return p?.bid != null || p?.ask != null || p?.last_trade_px != null
                    }).map((t, tIdx) => {
                      const rowKey   = `${s.series_number}:${t.tranche_name}`
                      const price    = prices[rowKey]
                      const flash    = flashRows[rowKey]
                      const isOdd    = tIdx % 2 === 1
                      const bidColor = priceColor(price?.bid ?? null, price?.bid_dealer ?? null)
                      const askColor = priceColor(price?.ask ?? null, price?.ask_dealer ?? null)

                      let rowBg = isOdd ? '#0e0e0e' : '#0a0a0a'
                      if (flash === 'red')   rowBg = '#3a0000'
                      if (flash === 'green') rowBg = '#003a00'

                      return (
                        <tr key={rowKey} style={{ background: rowBg, borderBottom: '1px solid #161616' }}>
                          <td style={{ padding: '3px 8px 3px 12px', color: '#ffffff', whiteSpace: 'nowrap' }}>
                            CMBX.{s.series_number}.{t.tranche_name}
                          </td>
                          {layout.showSizes && (
                            <td style={{ textAlign: 'right', padding: '3px 8px', color: price?.bid_size != null ? '#888' : '#2a2a2a' }}>
                              {price?.bid_size ?? '—'}
                            </td>
                          )}
                          <td style={{ textAlign: 'right', padding: '3px 10px', color: bidColor, borderLeft: '2px solid #1a3a1a' }}>
                            {formatPx(price?.bid, price?.mode)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '3px 10px', color: askColor, borderLeft: '2px solid #3a1a1a' }}>
                            {formatPx(price?.ask, price?.mode)}
                          </td>
                          {layout.showSizes && (
                            <td style={{ textAlign: 'right', padding: '3px 8px', color: price?.ask_size != null ? '#888' : '#2a2a2a' }}>
                              {price?.ask_size ?? '—'}
                            </td>
                          )}
                          {layout.showLast && (
                            <td style={{ textAlign: 'right', padding: '3px 12px 3px 8px' }}>
                              {price?.last_trade_px != null ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                                  <span style={{ color: '#888' }}>{formatPx(price.last_trade_px, price.mode)}</span>
                                  {price.last_trade_time && (
                                    <span style={{ color: '#444', fontSize: '10px' }}>{fmtTime(price.last_trade_time)}</span>
                                  )}
                                </div>
                              ) : <span style={{ color: '#2a2a2a' }}>—</span>}
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

        {/* Trade feed */}
        {layout.showFeed && (
          <div style={{ width: '270px', borderLeft: '1px solid #1e1e1e', background: '#080808', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e1e1e', color: '#888', fontSize: '11px', letterSpacing: '2px', fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              TRADE FEED
              <span style={{ color: '#333', fontSize: '10px', fontWeight: 400 }}>{blotter.length} trades</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {blotter.length === 0 ? (
                <div style={{ padding: '12px', color: '#2a2a2a', fontSize: '13px' }}>— no trades yet</div>
              ) : blotter.map((b, i) => {
                const iAmAggressor = myCode && b.dealer         === myCode
                const iAmPassive   = myCode && b.passive_dealer === myCode
                const involved     = iAmAggressor || iAmPassive

                let mySide: 'BOUGHT' | 'SOLD' | null = null
                let counterparty: string | null = null
                if (iAmAggressor) {
                  mySide       = b.action === 'LIFT' ? 'BOUGHT' : 'SOLD'
                  counterparty = b.passive_dealer
                } else if (iAmPassive) {
                  mySide       = b.action === 'LIFT' ? 'SOLD' : 'BOUGHT'
                  counterparty = b.dealer
                }

                const rowBg = involved
                  ? (i % 2 === 0 ? '#0d0d04' : '#111108')
                  : (i % 2 === 0 ? '#080808' : '#0a0a0a')

                return (
                  <div key={b.id} style={{ padding: '7px 10px', borderBottom: '1px solid #111', background: rowBg, borderLeft: involved ? `2px solid ${myColor}` : '2px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: b.action === 'HIT' ? '#ff6666' : '#66ff88', fontWeight: 700, fontSize: '12px', letterSpacing: '1px' }}>{b.action}</span>
                      <span style={{ color: '#444', fontSize: '10px' }}>{b.time}</span>
                    </div>
                    <div style={{ color: involved ? '#fff' : '#ddd', fontSize: '12px', marginTop: '2px' }}>CMBX.{b.series}.{b.tranche}</div>
                    {involved && mySide ? (
                      <div style={{ marginTop: '3px' }}>
                        <span style={{ color: mySide === 'BOUGHT' ? '#66ff88' : '#ff6666', fontWeight: 700, fontSize: '11px' }}>{mySide}</span>
                        <span style={{ color: '#555', fontSize: '11px' }}> {mySide === 'BOUGHT' ? 'FROM' : 'TO'} </span>
                        <span style={{ color: myColor, fontWeight: 700, fontSize: '11px' }}>{counterparty ?? '—'}</span>
                        <span style={{ color: '#888', fontSize: '11px' }}> @ {b.price ?? '—'}</span>
                      </div>
                    ) : (
                      <div style={{ color: '#888', fontSize: '12px', marginTop: '1px' }}>@ {b.price ?? '—'}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
