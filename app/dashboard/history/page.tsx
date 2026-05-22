'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import { formatPx, fmtTime, fmtShortDate, isLight } from '../../../lib/utils'
import { Theme, DEFAULT_THEME, loadTheme, saveTheme, loadViewAs, hasValidSession, clearSession } from '../../../lib/theme'
import { ThemePanel } from '../ThemePanel'
import { scheduleEodLogout } from '../../../lib/eod-logout'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const QUICK_RANGES = ['1D', '1W', '1M', '3M', 'ALL'] as const
type QuickRange = typeof QUICK_RANGES[number]

interface PriceChange {
  id: string
  created_at: string
  series_number: string
  tranche_name: string
  dealer: string | null
  side: 'bid' | 'ask'
  price: number | null
  size: string | null
  mode: string | null
  spx_at_time: number | null
  cdx_hy_at_time: number | null
  cdx_ig_at_time: number | null
}

interface TradeRow {
  id: string
  created_at: string
  series_number: string
  tranche_name: string
  side: string
  price: number | null
  trade_size: number | null
  dealer: string | null
  passive_dealer: string | null
  spx_at_time: number | null
  cdx_hy_at_time: number | null
  cdx_ig_at_time: number | null
}

interface DailyClose {
  date: string
  spx_close:     number | null
  cdx_hy_spread: number | null
  cdx_ig_spread: number | null
}

function getStartDate(range: QuickRange): string | null {
  if (range === 'ALL') return null
  const days: Record<string, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90 }
  const d = new Date()
  d.setDate(d.getDate() - days[range])
  return d.toISOString().split('T')[0]
}

const DEALER_COLORS: Record<string, string> = {
  MS: '#ff8888', BOA: '#88ff88', CITI: '#cc88ff', JPM: '#5aafff',
  GS: '#ffcc44', UBS: '#ff88cc', BNP: '#8888ff', DB: '#88ccff', BARC: '#ffaa66',
}

// ─── ACCESS CONTROL RULES ────────────────────────────────────────────────────
// Traders (isTrader=true): see everything — all dealer names, all trades, full blotter
// Dealers (isTrader=false, myDealerCode set): see their own prices + names; other dealer
//   names are hidden (shown as "—"). In the trade log, only trades they were party to
//   appear; they can see the counterparty name only on their own trades.
// Unauthenticated visitors: same as dealers with myDealerCode=null — all names hidden,
//   trade log shows all trades but without any dealer names.
//
// Helper: should this viewer be allowed to see a specific dealer name?
function canViewDealerName(priceDealer: string | null, myDealerCode: string | null, isTrader: boolean): boolean {
  return isTrader || priceDealer === myDealerCode
}
// ─────────────────────────────────────────────────────────────────────────────

// DATE_INPUT_STYLE is built inside the component so it can use theme-derived colours

export default function HistoryPage() {
  const [quickRange,   setQuickRange]   = useState<QuickRange>('1D')
  const [customFrom,   setCustomFrom]   = useState('')
  const [customTo,     setCustomTo]     = useState('')
  const [searchText,   setSearchText]   = useState('')
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([])
  const [trades,       setTrades]       = useState<TradeRow[]>([])
  const [dailyCloses,  setDailyCloses]  = useState<DailyClose[]>([])
  const [loading,      setLoading]      = useState(false)
  const [isTrader,     setIsTrader]     = useState(false)
  const [myDealerCode, setMyDealerCode] = useState<string | null>(null)
  const [theme,        setTheme]        = useState<Theme>(DEFAULT_THEME)
  const [showSettings, setShowSettings] = useState(false)

  const usingCustomRange = !!(customFrom && customTo)

  // ── Session check + theme + VIEW AS + EOD ────────────────────────────────
  useEffect(() => {
    if (!hasValidSession()) {
      window.location.replace('/login')
      return
    }
    const va = loadViewAs()
    // MARKET = Crosspoint admin: sees all dealer names, delete buttons, ADMIN tab
    // dealer code = dealer view: redacted counterparties, no delete buttons
    setIsTrader(va === 'MARKET')
    setMyDealerCode(va === 'MARKET' ? null : va)
    setTheme(loadTheme())
    const cancelEod = scheduleEodLogout(() => { clearSession(); window.location.href = '/login' })
    return () => cancelEod()
  }, [])

  // ── Realtime: stream new entries live ────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`history-rt-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_changes' }, (payload) => {
        const pc = payload.new as any
        setPriceChanges(prev => [{
          id: pc.id, created_at: pc.created_at,
          series_number: pc.series_number, tranche_name: pc.tranche_name,
          dealer: pc.dealer, side: pc.side, price: pc.price, size: pc.size,
          mode: pc.mode, spx_at_time: pc.spx_at_time ?? null,
          cdx_hy_at_time: pc.cdx_hy_at_time ?? null,
          cdx_ig_at_time: pc.cdx_ig_at_time ?? null,
        }, ...prev])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const t = payload.new as any
        setTrades(prev => [{
          id: t.id, created_at: t.created_at,
          series_number: t.series_number, tranche_name: t.tranche_name,
          side: t.side, price: t.price, trade_size: t.trade_size,
          dealer: t.dealer, passive_dealer: t.passive_dealer,
          spx_at_time: t.spx_at_time ?? null,
          cdx_hy_at_time: t.cdx_hy_at_time ?? null,
          cdx_ig_at_time: t.cdx_ig_at_time ?? null,
        }, ...prev])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trades' }, (payload) => {
        const id = (payload.old as any).id
        if (id) setTrades(prev => prev.filter(t => t.id !== id))
      })
      .subscribe()

    const broadcastCh = supabase.channel('trade-blotter-sync')
      .on('broadcast', { event: 'blotter-cleared' }, () => setTrades([]))
      .subscribe()

    return () => { supabase.removeChannel(ch); supabase.removeChannel(broadcastCh) }
  }, [])

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => { loadData(getStartDate('1D'), null) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData(startDate: string | null, endDate: string | null) {
    setLoading(true)
    try {
      let pcQ = supabase
        .from('price_changes')
        .select('id, created_at, series_number, tranche_name, dealer, side, price, size, mode, spx_at_time, cdx_hy_at_time, cdx_ig_at_time')
        .order('created_at', { ascending: false })
        .limit(2000)

      let trQ = supabase
        .from('trades')
        .select('id, created_at, series_number, tranche_name, side, price, trade_size, dealer, passive_dealer, spx_at_time, cdx_hy_at_time, cdx_ig_at_time')
        .order('created_at', { ascending: false })
        .limit(500)

      let ctxQ = supabase
        .from('market_context')
        .select('date, spx_close, cdx_hy_spread, cdx_ig_spread')
        .order('date', { ascending: true })
        .limit(400)

      if (startDate) {
        pcQ  = pcQ.gte('created_at', startDate + 'T00:00:00')
        trQ  = trQ.gte('created_at', startDate + 'T00:00:00')
        ctxQ = ctxQ.gte('date', startDate)
      }
      if (endDate) {
        pcQ  = pcQ.lte('created_at', endDate + 'T23:59:59')
        trQ  = trQ.lte('created_at', endDate + 'T23:59:59')
        ctxQ = ctxQ.lte('date', endDate)
      }

      const [{ data: pd }, { data: td }, { data: cd }] = await Promise.all([pcQ, trQ, ctxQ])
      if (pd) setPriceChanges(pd)
      if (td) setTrades(td)
      if (cd) setDailyCloses(cd)
    } catch (err) {
      console.error('[history] loadData failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleQuickRange(r: QuickRange) {
    setQuickRange(r)
    setCustomFrom('')
    setCustomTo('')
    loadData(getStartDate(r), null)
  }

  function handleCustomGo() {
    if (!customFrom || !customTo) return
    loadData(customFrom, customTo)
  }

  function handleClearCustom() {
    setCustomFrom('')
    setCustomTo('')
    loadData(getStartDate(quickRange), null)
  }

  async function deletePriceChange(id: string) {
    const { error } = await supabase.from('price_changes').delete().eq('id', id)
    if (error) console.warn('[history] delete price_change failed:', error.message)
    else setPriceChanges(prev => prev.filter(pc => pc.id !== id))
  }

  // ── Market context lookups ───────────────────────────────────────────────
  // SPX: daily close fallback when stamped value is missing
  const spxByDate = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const c of dailyCloses) map[c.date] = c.spx_close
    return map
  }, [dailyCloses])

  function spxFor(ts: string, spx_at_time: number | null): number | null {
    if (spx_at_time != null) return spx_at_time
    return spxByDate[ts.split('T')[0]] ?? null
  }

  // CDX HY/IG: stamped value only — no daily close fallback.
  // Values are stamped at submission time from cdx_intraday (15-sec feed)
  // and corrected every 5 min by the backfill_cdx_prices() RPC.
  function cdxHyFor(_ts: string, cdx_hy_at_time?: number | null): number | null {
    return cdx_hy_at_time ?? null
  }

  function cdxIgFor(_ts: string, cdx_ig_at_time?: number | null): number | null {
    return cdx_ig_at_time ?? null
  }

  // ── Client-side search filter ─────────────────────────────────────────────
  const q = searchText.trim().toLowerCase()

  const filteredPriceChanges = useMemo(() => {
    if (!q) return priceChanges
    return priceChanges.filter(pc => {
      const showDealer = canViewDealerName(pc.dealer, myDealerCode, isTrader)
      return (
        `${pc.tranche_name}.${pc.series_number}`.toLowerCase().includes(q) ||
        pc.tranche_name.toLowerCase().includes(q) ||
        pc.series_number.toLowerCase().includes(q) ||
        pc.side.toLowerCase().includes(q) ||
        (showDealer && (pc.dealer ?? '').toLowerCase().includes(q))
      )
    })
  }, [priceChanges, q, isTrader, myDealerCode])

  const filteredTrades = useMemo(() => {
    // All trades are visible to everyone — dealer names are shown per-row only if involved
    if (!q) return trades
    return trades.filter(t => {
      const isInvolved = myDealerCode != null && (t.dealer === myDealerCode || t.passive_dealer === myDealerCode)
      const buyer  = t.side === 'lift' ? t.dealer : t.passive_dealer
      const seller = t.side === 'lift' ? t.passive_dealer : t.dealer
      const cpty   = t.dealer === myDealerCode ? t.passive_dealer : t.dealer
      return (
        `${t.tranche_name}.${t.series_number}`.toLowerCase().includes(q) ||
        t.tranche_name.toLowerCase().includes(q) ||
        t.series_number.toLowerCase().includes(q) ||
        t.side.toLowerCase().includes(q) ||
        (isTrader  && (buyer  ?? '').toLowerCase().includes(q)) ||
        (isTrader  && (seller ?? '').toLowerCase().includes(q)) ||
        (isInvolved && (cpty  ?? '').toLowerCase().includes(q))
      )
    })
  }, [trades, q, isTrader, myDealerCode])

  function handleSaveTheme(t: Theme) {
    setTheme(t)
    setShowSettings(false)
    saveTheme(t)
  }

  // ── Contrast-safe derived colours ──────────────────────────────────────────
  const light     = isLight(theme.bg)
  const borderClr = light ? '#cccccc' : '#1a1a1a'
  const headerBg  = light ? '#e0e4ea' : '#0c0c0c'
  const rowEven   = light ? 'transparent'  : '#0a0a0a'
  const rowOdd    = light ? '#f0f2f5'      : '#0d0d0d'
  const dimClr    = light ? '#444444' : '#666666'
  const emptyClr  = light ? '#aaaaaa' : '#2a2a2a'
  const inputBg   = light ? '#ffffff' : '#111'
  const inputBdr  = (active: boolean) => active
    ? `1px solid ${theme.accent}`
    : `1px solid ${light ? '#bbbbbb' : '#2a2a2a'}`
  const dateInputStyle: React.CSSProperties = {
    background: inputBg, color: theme.fg, padding: '1px 6px',
    fontSize: '11px', fontFamily: 'Courier New, monospace',
    borderRadius: '2px', outline: 'none',
    colorScheme: (light ? 'light' : 'dark') as any,
    border: inputBdr(false),
  }

  return (
    <div style={{ background: theme.bg, color: theme.fg, fontFamily: 'Courier New, monospace', fontSize: '13px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {showSettings && <ThemePanel theme={theme} onSave={handleSaveTheme} onClose={() => setShowSettings(false)} />}

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: `1px solid ${theme.fg}22`, flexShrink: 0 }}>
        <span style={{ color: theme.accent, fontSize: '15px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX HISTORY — CROSSPOINT
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {myDealerCode && (
            <span style={{ fontSize: '11px', color: theme.fg, opacity: 0.5, letterSpacing: '1px' }}>
              {myDealerCode}
            </span>
          )}
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
      <NavTabs active="history" isTrader={isTrader} accent={theme.accent} bg={theme.bg} fg={theme.fg} onSettings={() => setShowSettings(true)} />

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderBottom: `1px solid ${theme.fg}22`, flexShrink: 0, background: theme.bg, flexWrap: 'wrap' }}>

        {/* Quick range */}
        <span style={{ color: theme.fg, fontSize: '11px', letterSpacing: '1px', opacity: 0.5 }}>RANGE</span>
        {QUICK_RANGES.map(r => (
          <button key={r} onClick={() => handleQuickRange(r)} style={{
            background: !usingCustomRange && quickRange === r ? theme.accent + '22' : 'transparent',
            color:      !usingCustomRange && quickRange === r ? theme.accent : dimClr,
            border:    `1px solid ${!usingCustomRange && quickRange === r ? theme.accent : borderClr}`,
            fontWeight: !usingCustomRange && quickRange === r ? 700 : 400,
            padding: '2px 10px', fontSize: '11px', fontFamily: 'Courier New, monospace',
            cursor: 'pointer', borderRadius: '2px',
          }}>{r}</button>
        ))}

        <span style={{ color: theme.fg, padding: '0 2px', opacity: 0.2 }}>|</span>

        {/* Custom date range */}
        <span style={{ color: theme.fg, fontSize: '11px', letterSpacing: '1px', opacity: 0.5 }}>FROM</span>
        <input
          type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
          style={{ ...dateInputStyle, border: inputBdr(usingCustomRange) }}
        />
        <span style={{ color: theme.fg, fontSize: '11px', letterSpacing: '1px', opacity: 0.5 }}>TO</span>
        <input
          type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
          style={{ ...dateInputStyle, border: inputBdr(usingCustomRange) }}
        />
        <button
          onClick={handleCustomGo} disabled={!customFrom || !customTo}
          style={{
            background: customFrom && customTo ? theme.accent + '22' : 'transparent',
            color:      customFrom && customTo ? theme.accent : dimClr,
            border:    `1px solid ${customFrom && customTo ? theme.accent : borderClr}`,
            padding: '2px 10px', fontSize: '11px', fontFamily: 'Courier New, monospace',
            cursor: customFrom && customTo ? 'pointer' : 'default', borderRadius: '2px',
          }}
        >GO</button>
        {usingCustomRange && (
          <button onClick={handleClearCustom} style={{ background: 'transparent', color: dimClr, border: `1px solid ${borderClr}`, padding: '2px 8px', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px' }}>
            ✕ CLEAR
          </button>
        )}

        <span style={{ color: theme.fg, padding: '0 2px', opacity: 0.2 }}>|</span>

        {/* Search */}
        <span style={{ color: theme.fg, fontSize: '11px', letterSpacing: '1px', opacity: 0.5 }}>SEARCH</span>
        <input
          type="text" placeholder="tranche · dealer · series..."
          value={searchText} onChange={e => setSearchText(e.target.value)}
          style={{ ...dateInputStyle, border: inputBdr(!!q), width: '190px' }}
        />
        {q && (
          <button onClick={() => setSearchText('')} style={{ background: 'transparent', color: dimClr, border: 'none', cursor: 'pointer', fontSize: '11px', fontFamily: 'Courier New, monospace', padding: '0 2px' }}>✕</button>
        )}

        {loading && <span style={{ color: dimClr, fontSize: '11px', marginLeft: '4px' }}>LOADING...</span>}
      </div>

      {/* Tables */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Price Activity */}
        <div style={{ flex: '0 0 50%', overflow: 'auto', borderBottom: `1px solid ${borderClr}` }}>
          <div style={{ position: 'sticky', top: 0, background: headerBg, padding: '5px 12px', borderBottom: `1px solid ${borderClr}`, zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: theme.accent, fontSize: '11px', letterSpacing: '2px' }}>PRICE ACTIVITY</span>
            <span style={{ color: dimClr, fontSize: '11px' }}>{filteredPriceChanges.length} entries</span>
            {q && filteredPriceChanges.length !== priceChanges.length && (
              <span style={{ color: dimClr, fontSize: '10px' }}>({priceChanges.length} total)</span>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: theme.fg, fontSize: '12px', position: 'sticky', top: '26px', background: theme.bg, zIndex: 1 } as React.CSSProperties}>
                <th style={{ textAlign: 'left',   padding: '4px 12px', borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>DATE</th>
                <th style={{ textAlign: 'left',   padding: '4px 6px',  borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>TIME</th>
                <th style={{ textAlign: 'left',   padding: '4px 6px',  borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>DLR</th>
                <th style={{ textAlign: 'left',   padding: '4px 6px',  borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>TRANCHE</th>
                <th style={{ textAlign: 'center', padding: '4px 6px',  borderBottom: `2px solid ${theme.fg}44`, fontWeight: 700 }}>SIDE</th>
                <th style={{ textAlign: 'right',  padding: '4px 6px',  borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>SPREAD</th>
                <th style={{ textAlign: 'right',  padding: '4px 6px',  borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>SZ</th>
                <th style={{ textAlign: 'right',  padding: '4px 6px',  borderBottom: '2px solid #3388ff', fontWeight: 700 }}>SPX</th>
                <th style={{ textAlign: 'right',  padding: '4px 6px',  borderBottom: '2px solid #ff8844', fontWeight: 700 }}>HY PX</th>
                <th style={{ textAlign: 'right',  padding: '4px 12px', borderBottom: '2px solid #88ccaa', fontWeight: 700 }}>CDX IG</th>
                {isTrader && <th style={{ padding: '4px 8px', borderBottom: `1px solid ${borderClr}` }} />}
              </tr>
            </thead>
            <tbody>
              {filteredPriceChanges.length === 0 ? (
                <tr><td colSpan={isTrader ? 11 : 10} style={{ padding: '24px 12px', color: emptyClr, textAlign: 'center' }}>
                  {q ? `— no results for "${searchText}"` : '— no price activity for selected range'}
                </td></tr>
              ) : filteredPriceChanges.map((pc, i) => {
                const showDealer    = canViewDealerName(pc.dealer, myDealerCode, isTrader)
                const visibleDealer = showDealer ? (pc.dealer ?? '—') : '—'
                const dealerColor   = showDealer && pc.dealer ? (DEALER_COLORS[pc.dealer] ?? dimClr) : emptyClr
                const spx   = spxFor(pc.created_at, pc.spx_at_time)
                const cdxHy = cdxHyFor(pc.created_at, pc.cdx_hy_at_time)
                const cdxIg = cdxIgFor(pc.created_at, pc.cdx_ig_at_time)
                return (
                  <tr key={pc.id} style={{ background: i % 2 === 0 ? rowEven : rowOdd, borderBottom: `1px solid ${borderClr}` }}>
                    <td style={{ padding: '3px 12px', color: dimClr }}>{fmtShortDate(pc.created_at)}</td>
                    <td style={{ padding: '3px 6px',  color: dimClr }}>{fmtTime(pc.created_at)}</td>
                    <td style={{ padding: '3px 6px',  color: dealerColor, fontWeight: 700 }}>{visibleDealer}</td>
                    <td style={{ padding: '3px 6px',  color: theme.fg }}>{pc.tranche_name}.{pc.series_number}</td>
                    <td style={{ textAlign: 'center', padding: '3px 6px', color: pc.side === 'bid' ? theme.bid : theme.ask, fontWeight: 700 }}>{pc.side.toUpperCase()}</td>
                    <td style={{ textAlign: 'right',  padding: '3px 6px', color: theme.fg, fontWeight: 700 }}>{formatPx(pc.price, pc.mode)}</td>
                    <td style={{ textAlign: 'right',  padding: '3px 6px', color: dimClr }}>{pc.size ?? '—'}</td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: spx != null ? '#3388ff' : emptyClr }}>
                      {spx != null ? Math.round(spx).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: cdxHy != null ? '#ff8844' : emptyClr }}>
                      {cdxHy != null ? `$${cdxHy.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 12px', color: cdxIg != null ? '#88ccaa' : emptyClr }}>
                      {cdxIg != null ? cdxIg.toFixed(2) : '—'}
                    </td>
                    {isTrader && (
                      <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                        <button
                          onClick={e => { e.stopPropagation(); deletePriceChange(pc.id) }}
                          style={{ background: 'transparent', border: 'none', color: emptyClr, cursor: 'pointer', fontSize: '13px', padding: '0 4px', fontFamily: 'Courier New', lineHeight: 1 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ff4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = emptyClr)}
                        >×</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Trade Log */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ position: 'sticky', top: 0, background: headerBg, padding: '5px 12px', borderBottom: `1px solid ${borderClr}`, zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: theme.accent, fontSize: '11px', letterSpacing: '2px' }}>TRADE LOG</span>
            <span style={{ color: dimClr, fontSize: '11px' }}>{filteredTrades.length} trades</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: theme.fg, fontSize: '12px', position: 'sticky', top: '26px', background: theme.bg, zIndex: 1 } as React.CSSProperties}>
                <th style={{ textAlign: 'left',  padding: '4px 12px', borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>DATE</th>
                <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>TIME</th>
                <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>TRANCHE</th>
                {isTrader && <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>BUYER</th>}
                {isTrader && <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>SELLER</th>}
                {!isTrader && <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>CPTY</th>}
                <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: `2px solid ${theme.accent}`, fontWeight: 700 }}>SPREAD</th>
                <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: `1px solid ${borderClr}`, fontWeight: 700 }}>SZ</th>
                <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #3388ff', fontWeight: 700 }}>SPX</th>
                <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #ff8844', fontWeight: 700 }}>HY PX</th>
                <th style={{ textAlign: 'right', padding: '4px 12px', borderBottom: '2px solid #88ccaa', fontWeight: 700 }}>CDX IG</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.length === 0 ? (
                <tr><td colSpan={isTrader ? 10 : 9} style={{ padding: '24px 12px', color: emptyClr, textAlign: 'center' }}>
                  {q ? `— no results for "${searchText}"` : '— no trades for selected range'}
                </td></tr>
              ) : filteredTrades.map((t, i) => {
                const isInvolved = myDealerCode != null &&
                  (t.dealer === myDealerCode || t.passive_dealer === myDealerCode)
                const buyer  = t.side === 'lift' ? t.dealer : t.passive_dealer
                const seller = t.side === 'lift' ? t.passive_dealer : t.dealer
                const cpty   = t.dealer === myDealerCode ? t.passive_dealer : t.dealer
                const spx   = spxFor(t.created_at, t.spx_at_time)
                const cdxHy = cdxHyFor(t.created_at, t.cdx_hy_at_time)
                const cdxIg = cdxIgFor(t.created_at, t.cdx_ig_at_time)
                return (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? rowEven : rowOdd, borderBottom: `1px solid ${borderClr}` }}>
                    <td style={{ padding: '3px 12px', color: dimClr }}>{fmtShortDate(t.created_at)}</td>
                    <td style={{ padding: '3px 6px',  color: dimClr }}>{fmtTime(t.created_at)}</td>
                    <td style={{ padding: '3px 6px',  color: theme.fg, fontWeight: 700 }}>{t.tranche_name}.{t.series_number}</td>
                    {isTrader && <td style={{ padding: '3px 6px', color: theme.bid, fontWeight: 700 }}>{buyer ?? '—'}</td>}
                    {isTrader && <td style={{ padding: '3px 6px', color: theme.ask, fontWeight: 700 }}>{seller ?? '—'}</td>}
                    {!isTrader && (
                      <td style={{ padding: '3px 6px', color: isInvolved ? (DEALER_COLORS[cpty ?? ''] ?? dimClr) : emptyClr, fontWeight: isInvolved ? 700 : 400 }}>
                        {isInvolved ? (cpty ?? '—') : '—'}
                      </td>
                    )}
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: theme.accent, fontWeight: 700 }}>
                      {formatPx(t.price, null)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: dimClr }}>{t.trade_size ?? '—'}</td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: spx != null ? '#3388ff' : emptyClr }}>
                      {spx != null ? Math.round(spx).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: cdxHy != null ? '#ff8844' : emptyClr }}>
                      {cdxHy != null ? `$${cdxHy.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 12px', color: cdxIg != null ? '#88ccaa' : emptyClr }}>
                      {cdxIg != null ? cdxIg.toFixed(2) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
