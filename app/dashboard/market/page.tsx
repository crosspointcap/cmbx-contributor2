'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import { formatPx, fmtTime, isLight } from '../../../lib/utils'
import { Theme, DEFAULT_THEME, loadTheme, saveTheme, loadViewAs, hasValidSession, clearSession, ViewAs } from '../../../lib/theme'
import { ThemePanel } from '../ThemePanel'
import { scheduleEodLogout } from '../../../lib/eod-logout'

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

function priceColor(priceDealer: string | null, myDealer: string | null, hasPrice: boolean, fg: string): string {
  if (!hasPrice) return 'transparent'
  if (!priceDealer) return fg                                 // unattributed → theme text colour
  if (priceDealer === myDealer) return MY_COLOR[myDealer ?? ''] ?? '#f0c040'  // YOUR price
  if (myDealer === 'MS') return MS_OTHERS_COLOR               // MS sees others red
  if (!myDealer) return fg                                    // not logged in → theme text colour
  return fg                                                   // all others → theme text colour
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
  const [viewAs, setViewAs] = useState<ViewAs>('MARKET')
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set())
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
  const [showSettings, setShowSettings] = useState(false)
  const [rtOk, setRtOk] = useState(true)
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Derived — never stored as state to avoid stale closure issues
  const myDealerCode: string | null = viewAs === 'MARKET' ? null : viewAs

  // ── Session check + theme + VIEW AS + EOD ────────────────────────────────
  useEffect(() => {
    if (!hasValidSession()) {
      window.location.replace('/login')
      return
    }
    setTheme(loadTheme())
    setViewAs(loadViewAs())
    const cancelEod = scheduleEodLogout(() => { clearSession(); window.location.href = '/login' })
    return () => cancelEod()
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
      localStorage.setItem('cmbx_market_hidden_cols', JSON.stringify(Array.from(next)))
      return next
    })
  }

  // ── Main data channel ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    // Fetch only prices (called on poll + visibility refresh, no need to re-fetch config)
    async function refreshPrices() {
      const { data: pd } = await supabase.from('prices').select('*')
      if (cancelled || !pd) return
      const map: Record<string, Price> = {}
      for (const p of pd) map[`${p.series_number}:${p.tranche_name}`] = p
      setPrices(map)
    }

    const ch = supabase
      .channel(`market-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, (payload) => {
        // Guard: DELETE events have no payload.new — price rows are nulled, not deleted
        if (payload.eventType === 'DELETE') return
        const p = payload.new as Price
        if (!p?.series_number) return
        const key = `${p.series_number}:${p.tranche_name}`
        // Merge — never let mode:null from a partial payload overwrite a valid mode in state
        setPrices(prev => {
          const existing = prev[key]
          const merged = { ...existing, ...p }
          if (!merged.mode && existing?.mode) merged.mode = existing.mode
          return { ...prev, [key]: merged }
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const t = payload.new as any
        const key = `${t.series_number}:${t.tranche_name}`
        flashRowEffect(key, t.side === 'hit' ? 'red' : 'green')
      })
      .subscribe((status) => {
        setRtOk(status === 'SUBSCRIBED')
        // If connection dropped and just recovered, do a full price refresh to catch any missed updates
        if (status === 'SUBSCRIBED') refreshPrices()
      })

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

    // ── Polling fallback: re-fetch prices every 30s even if realtime is healthy ──
    const pollInterval = setInterval(refreshPrices, 30_000)

    // ── Visibility refresh: catch up whenever the user returns to the tab ──────
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refreshPrices()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    loadData()
    return () => {
      cancelled = true
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      supabase.removeChannel(ch)
      // Clear any active flash timers on unmount
      Object.values(flashTimers.current).forEach(clearTimeout)
    }
  }, [])

  // Flash row for 30 seconds — solid highlight, no blink
  function flashRowEffect(key: string, color: 'red' | 'green') {
    if (flashTimers.current[key]) clearTimeout(flashTimers.current[key])
    setFlashRows(prev => ({ ...prev, [key]: color }))
    flashTimers.current[key] = setTimeout(() => {
      setFlashRows(prev => { const n = { ...prev }; delete n[key]; return n })
      delete flashTimers.current[key]
    }, 30000)
  }

  function handleSaveTheme(t: Theme) {
    setTheme(t)
    setShowSettings(false)
    saveTheme(t)
  }

  return (
    <div style={{ background: theme.bg, color: theme.fg, fontFamily: 'Courier New, monospace', fontSize: '17px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {showSettings && <ThemePanel theme={theme} onSave={handleSaveTheme} onClose={() => setShowSettings(false)} />}

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: `1px solid ${theme.fg}22`, flexShrink: 0 }}>
        <span style={{ color: theme.accent, fontSize: '14px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX MARKET — CROSSPOINT CAPITAL
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Signed-in identity */}
          {viewAs !== 'MARKET' && (
            <span style={{ fontSize: '11px', color: theme.fg, opacity: 0.5, letterSpacing: '1px' }}>
              {viewAs}
            </span>
          )}
          {/* RT status */}
          <span
            title={rtOk ? 'Realtime connected' : 'Realtime disconnected — polling fallback active'}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: rtOk ? '#44cc44' : '#ff5555', opacity: 0.85, cursor: 'default' }}
          >
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: rtOk ? '#44cc44' : '#ff5555', boxShadow: rtOk ? '0 0 4px #44cc44' : '0 0 4px #ff5555' }} />
            {rtOk ? 'LIVE' : 'POLLING'}
          </span>
          {/* Sign out */}
          <button
            onClick={() => { clearSession(); window.location.href = '/login' }}
            style={{
              background: 'transparent',
              color: theme.fg,
              border: `1px solid ${theme.fg}33`,
              fontFamily: 'Courier New, monospace',
              fontSize: '10px',
              letterSpacing: '1px',
              padding: '3px 10px',
              cursor: 'pointer',
              borderRadius: '2px',
              opacity: 0.5,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = theme.fg + '88' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.borderColor = theme.fg + '33' }}
          >
            SIGN OUT
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <NavTabs active="market" isTrader={false} accent={theme.accent} bg={theme.bg} fg={theme.fg} onSettings={() => setShowSettings(true)} />

      {/* Column visibility toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderBottom: `1px solid ${theme.fg}18`, flexShrink: 0, background: theme.bg }}>
        <span style={{ color: theme.fg, fontSize: '10px', marginRight: '2px', letterSpacing: '1px', opacity: 0.3 }}>COLS</span>
        {ALL_COLS.map(col => {
          const hidden = hiddenCols.has(col.key)
          return (
            <button
              key={col.key}
              onClick={() => toggleCol(col.key)}
              style={{
                background: 'transparent',
                color: hidden ? theme.fg + '22' : theme.fg + '55',
                border: `1px solid ${hidden ? theme.fg + '18' : theme.fg + '33'}`,
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
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* ── Derive contrast-safe colours from the current theme ── */}
          {(() => {
            const light      = isLight(theme.bg)
            const borderClr  = light ? '#cccccc' : '#1e1e1e'
            const headerBg   = light ? '#e0e4ea' : '#0b0b0b'
            const headerBdr  = light ? theme.accent + 'aa' : theme.accent + '55'
            const dimClr     = light ? '#666666' : '#555555'
            const emptyClr   = light ? '#aaaaaa' : '#2a2a2a'
            const sizeClr    = light ? '#336688' : '#4a6a8a'
            const oddRowBg   = light ? '#f0f2f5' : '#0d0d0d'

            return (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '16px' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: theme.bg, zIndex: 1 } as React.CSSProperties}>
                <th style={{ textAlign: 'left', padding: '5px 6px 5px 10px', borderBottom: `1px solid ${borderClr}`, width: '88px', fontWeight: 600, color: theme.fg }}>TRANCHE</th>
                {!hiddenCols.has('bid')    && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: `2px solid ${theme.bid}`, minWidth: '70px', fontWeight: 600, color: theme.fg }}>BID</th>}
                {!hiddenCols.has('ask')    && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: `2px solid ${theme.ask}`, minWidth: '70px', fontWeight: 600, color: theme.fg }}>ASK</th>}
                {!hiddenCols.has('bsz')    && <th style={{ textAlign: 'right', padding: '5px 8px',  borderBottom: `1px solid ${borderClr}`, minWidth: '50px', fontWeight: 400, color: dimClr }}>B.SZ</th>}
                {!hiddenCols.has('asz')    && <th style={{ textAlign: 'right', padding: '5px 8px',  borderBottom: `1px solid ${borderClr}`, minWidth: '50px', fontWeight: 400, color: dimClr }}>A.SZ</th>}
                {!hiddenCols.has('lastpx') && <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: `1px solid ${borderClr}`, minWidth: '70px', fontWeight: 400, color: dimClr }}>LAST PX</th>}
                {!hiddenCols.has('time')   && <th style={{ textAlign: 'right', padding: '5px 12px 5px 8px', borderBottom: `1px solid ${borderClr}`, minWidth: '70px', fontWeight: 400, color: dimClr }}>TIME</th>}
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
                          padding: '4px 10px 3px 10px',
                          color: theme.accent,
                          background: headerBg,
                          fontSize: '13px',
                          fontWeight: 700,
                          letterSpacing: '2px',
                          borderBottom: `1px solid ${headerBdr}`,
                          borderTop: `2px solid ${headerBdr}`,
                          borderLeft: `3px solid ${theme.accent}`,
                        }}
                      >
                        CMBX.{s.series_number}
                      </td>
                    </tr>
                    {visibleTranches.map((t, tIdx) => {
                      const rowKey = `${s.series_number}:${t.tranche_name}`
                      const price = prices[rowKey]
                      const flash = flashRows[rowKey]

                      let rowBg = tIdx % 2 === 1 ? oddRowBg : 'transparent'
                      if (flash === 'red')   rowBg = light ? '#ffdddd' : '#3a0000'
                      if (flash === 'green') rowBg = light ? '#ddffdd' : '#003a00'

                      const bidColor = priceColor(price?.bid_dealer ?? null, myDealerCode, price?.bid != null, theme.fg)
                      const askColor = priceColor(price?.ask_dealer ?? null, myDealerCode, price?.ask != null, theme.fg)

                      return (
                        <tr
                          key={rowKey}
                          style={{ background: rowBg, borderBottom: `1px solid ${borderClr}` }}
                        >
                          <td style={{ padding: '5px 6px 5px 10px', color: theme.fg, whiteSpace: 'nowrap', width: '100px', fontSize: '14px', fontWeight: 700 }}>
                            {t.tranche_name}.{s.series_number}
                          </td>
                          {!hiddenCols.has('bid') && (
                            <td style={{ textAlign: 'right', padding: '5px 10px', color: bidColor, fontWeight: 700 }}>
                              {price?.bid != null ? formatPx(price.bid, price.mode) : <span style={{ color: emptyClr }}>—</span>}
                            </td>
                          )}
                          {!hiddenCols.has('ask') && (
                            <td style={{ textAlign: 'right', padding: '5px 10px', color: askColor, fontWeight: 700 }}>
                              {price?.ask != null ? formatPx(price.ask, price.mode) : <span style={{ color: emptyClr }}>—</span>}
                            </td>
                          )}
                          {!hiddenCols.has('bsz') && (
                            <td style={{ textAlign: 'right', padding: '5px 8px', color: price?.bid_size != null ? sizeClr : emptyClr, fontSize: '12px', opacity: 0.55 }}>
                              {price?.bid_size != null ? String(price.bid_size) : '—'}
                            </td>
                          )}
                          {!hiddenCols.has('asz') && (
                            <td style={{ textAlign: 'right', padding: '5px 8px', color: price?.ask_size != null ? sizeClr : emptyClr, fontSize: '12px', opacity: 0.55 }}>
                              {price?.ask_size != null ? String(price.ask_size) : '—'}
                            </td>
                          )}
                          {!hiddenCols.has('lastpx') && (
                            <td style={{ textAlign: 'right', padding: '5px 10px', color: price?.last_trade_px != null ? dimClr : emptyClr }}>
                              {price?.last_trade_px != null ? formatPx(price.last_trade_px, price.mode) : '—'}
                            </td>
                          )}
                          {!hiddenCols.has('time') && (
                            <td style={{ textAlign: 'right', padding: '5px 12px 5px 8px', color: dimClr }}>
                              {price?.last_trade_time ? fmtTime(price.last_trade_time) : <span style={{ color: emptyClr }}>—</span>}
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
            )
          })()}
        </div>

      </div>

      {/* Legend */}
      <div style={{ borderTop: `1px solid ${theme.fg}22`, padding: '5px 12px', flexShrink: 0, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '16px', background: theme.bg }}>
        <span style={{ color: theme.fg, opacity: 0.4 }}><span style={{ color: theme.fg, opacity: 1 }}>■</span> MARKET</span>
        {myDealerCode === 'MS' && <span style={{ color: theme.fg, opacity: 0.4 }}><span style={{ color: MS_OTHERS_COLOR }}>■</span> OTHER</span>}
        {myDealerCode && <span style={{ color: theme.fg, opacity: 0.5 }}><span style={{ color: MY_COLOR[myDealerCode] ?? theme.accent }}>■</span> YOUR PRICE</span>}
      </div>
    </div>
  )
}
