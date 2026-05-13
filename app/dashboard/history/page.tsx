'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import { fmt32nds, formatPx, fmtTime, fmtShortDate } from '../../../lib/utils'

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
}

interface DailyClose {
  date: string
  spx_close: number | null
  hyg_close: number | null
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

const DATE_INPUT_STYLE: React.CSSProperties = {
  background: '#111', color: '#aaa', padding: '1px 6px',
  fontSize: '11px', fontFamily: 'Courier New, monospace',
  borderRadius: '2px', outline: 'none', colorScheme: 'dark' as any,
}

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

  const usingCustomRange = !!(customFrom && customTo)

  // ── Check role ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('profiles').select('role, dealer_code').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data?.role === 'trader') setIsTrader(true)
          setMyDealerCode(data?.dealer_code ?? null)
        })
    })
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
        .select('id, created_at, series_number, tranche_name, dealer, side, price, size, mode, spx_at_time')
        .order('created_at', { ascending: false })
        .limit(2000)

      let trQ = supabase
        .from('trades')
        .select('id, created_at, series_number, tranche_name, side, price, trade_size, dealer, passive_dealer, spx_at_time')
        .order('created_at', { ascending: false })
        .limit(500)

      let ctxQ = supabase
        .from('market_context')
        .select('date, spx_close, hyg_close')
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
    if (!error) setPriceChanges(prev => prev.filter(pc => pc.id !== id))
  }

  // ── Market context lookups by date ───────────────────────────────────────
  const spxByDate = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const c of dailyCloses) map[c.date] = c.spx_close
    return map
  }, [dailyCloses])

  const hygByDate = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const c of dailyCloses) map[c.date] = c.hyg_close
    return map
  }, [dailyCloses])

  function spxFor(ts: string, spx_at_time: number | null): number | null {
    if (spx_at_time != null) return spx_at_time          // exact intraday stamp
    return spxByDate[ts.split('T')[0]] ?? null            // fall back to EOD close
  }

  function hygFor(ts: string): number | null {
    return hygByDate[ts.split('T')[0]] ?? null
  }

  // ── Client-side search filter ─────────────────────────────────────────────
  const q = searchText.trim().toLowerCase()

  const filteredPriceChanges = useMemo(() => {
    if (!q) return priceChanges
    return priceChanges.filter(pc =>
      `cmbx.${pc.series_number}.${pc.tranche_name}`.toLowerCase().includes(q) ||
      (pc.dealer ?? '').toLowerCase().includes(q) ||
      pc.tranche_name.toLowerCase().includes(q)
    )
  }, [priceChanges, q])

  const filteredTrades = useMemo(() => {
    // Dealers only see trades they were a party to
    let list = (!isTrader && myDealerCode)
      ? trades.filter(t => t.dealer === myDealerCode || t.passive_dealer === myDealerCode)
      : trades
    if (!q) return list
    return list.filter(t =>
      `cmbx.${t.series_number}.${t.tranche_name}`.toLowerCase().includes(q) ||
      t.tranche_name.toLowerCase().includes(q)
    )
  }, [trades, q, isTrader, myDealerCode])

  return (
    <div style={{ background: '#0a0a0a', color: '#ccc', fontFamily: 'Courier New, monospace', fontSize: '13px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <span style={{ color: '#f0c040', fontSize: '15px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX HISTORY — CROSSPOINT
        </span>
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
          style={{ background: 'transparent', color: '#555', border: '1px solid #2a2a2a', padding: '2px 8px', fontSize: '13px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px' }}
        >
          SIGN OUT
        </button>
      </div>

      {/* Nav tabs */}
      <NavTabs active="history" isTrader={isTrader} />

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0, background: '#080808', flexWrap: 'wrap' }}>

        {/* Quick range */}
        <span style={{ color: '#3a3a3a', fontSize: '11px', letterSpacing: '1px' }}>RANGE</span>
        {QUICK_RANGES.map(r => (
          <button key={r} onClick={() => handleQuickRange(r)} style={{
            background: !usingCustomRange && quickRange === r ? '#1a1500' : 'transparent',
            color:      !usingCustomRange && quickRange === r ? '#f0c040' : '#3a3a3a',
            border:    `1px solid ${!usingCustomRange && quickRange === r ? '#f0c040' : '#222'}`,
            fontWeight: !usingCustomRange && quickRange === r ? 700 : 400,
            padding: '2px 10px', fontSize: '11px', fontFamily: 'Courier New, monospace',
            cursor: 'pointer', borderRadius: '2px',
          }}>{r}</button>
        ))}

        <span style={{ color: '#2a2a2a', padding: '0 2px' }}>|</span>

        {/* Custom date range */}
        <span style={{ color: '#3a3a3a', fontSize: '11px', letterSpacing: '1px' }}>FROM</span>
        <input
          type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
          style={{ ...DATE_INPUT_STYLE, border: `1px solid ${usingCustomRange ? '#f0c040' : '#2a2a2a'}` }}
        />
        <span style={{ color: '#3a3a3a', fontSize: '11px', letterSpacing: '1px' }}>TO</span>
        <input
          type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
          style={{ ...DATE_INPUT_STYLE, border: `1px solid ${usingCustomRange ? '#f0c040' : '#2a2a2a'}` }}
        />
        <button
          onClick={handleCustomGo} disabled={!customFrom || !customTo}
          style={{
            background: customFrom && customTo ? '#1a1500' : 'transparent',
            color:      customFrom && customTo ? '#f0c040' : '#333',
            border:    `1px solid ${customFrom && customTo ? '#f0c040' : '#222'}`,
            padding: '2px 10px', fontSize: '11px', fontFamily: 'Courier New, monospace',
            cursor: customFrom && customTo ? 'pointer' : 'default', borderRadius: '2px',
          }}
        >GO</button>
        {usingCustomRange && (
          <button onClick={handleClearCustom} style={{ background: 'transparent', color: '#555', border: '1px solid #222', padding: '2px 8px', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px' }}>
            ✕ CLEAR
          </button>
        )}

        <span style={{ color: '#2a2a2a', padding: '0 2px' }}>|</span>

        {/* Search */}
        <span style={{ color: '#3a3a3a', fontSize: '11px', letterSpacing: '1px' }}>SEARCH</span>
        <input
          type="text" placeholder="tranche · dealer · series..."
          value={searchText} onChange={e => setSearchText(e.target.value)}
          style={{ ...DATE_INPUT_STYLE, border: `1px solid ${q ? '#555' : '#2a2a2a'}`, width: '190px', color: q ? '#ccc' : '#555' }}
        />
        {q && (
          <button onClick={() => setSearchText('')} style={{ background: 'transparent', color: '#555', border: 'none', cursor: 'pointer', fontSize: '11px', fontFamily: 'Courier New, monospace', padding: '0 2px' }}>✕</button>
        )}

        {loading && <span style={{ color: '#3a3a3a', fontSize: '11px', marginLeft: '4px' }}>LOADING...</span>}
      </div>

      {/* Tables */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Price Activity */}
        <div style={{ flex: '0 0 50%', overflow: 'auto', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ position: 'sticky', top: 0, background: '#0c0c0c', padding: '5px 12px', borderBottom: '1px solid #1e1e1e', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#f0c040', fontSize: '11px', letterSpacing: '2px' }}>PRICE ACTIVITY</span>
            <span style={{ color: '#3a3a3a', fontSize: '11px' }}>{filteredPriceChanges.length} entries</span>
            {q && filteredPriceChanges.length !== priceChanges.length && (
              <span style={{ color: '#444', fontSize: '10px' }}>({priceChanges.length} total)</span>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: '#fff', fontSize: '12px', position: 'sticky', top: '26px', background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                <th style={{ textAlign: 'left',   padding: '4px 12px', borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>DATE</th>
                <th style={{ textAlign: 'left',   padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>TIME</th>
                <th style={{ textAlign: 'left',   padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>DLR</th>
                <th style={{ textAlign: 'left',   padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>TRANCHE</th>
                <th style={{ textAlign: 'center', padding: '4px 6px',  borderBottom: '2px solid #888',    fontWeight: 700 }}>SIDE</th>
                <th style={{ textAlign: 'right',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>SPREAD</th>
                <th style={{ textAlign: 'right',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>SZ</th>
                <th style={{ textAlign: 'right',  padding: '4px 6px',  borderBottom: '2px solid #3388ff', fontWeight: 700 }}>SPX</th>
                <th style={{ textAlign: 'right',  padding: '4px 12px', borderBottom: '2px solid #ff8844', fontWeight: 700 }}>HY</th>
                {isTrader && <th style={{ padding: '4px 8px', borderBottom: '1px solid #1a1a1a' }} />}
              </tr>
            </thead>
            <tbody>
              {filteredPriceChanges.length === 0 ? (
                <tr><td colSpan={isTrader ? 10 : 9} style={{ padding: '24px 12px', color: '#2a2a2a', textAlign: 'center' }}>
                  {q ? `— no results for "${searchText}"` : '— no price activity for selected range'}
                </td></tr>
              ) : filteredPriceChanges.map((pc, i) => {
                const canSeeDealer  = isTrader || pc.dealer === myDealerCode
                const visibleDealer = canSeeDealer ? (pc.dealer ?? '—') : '—'
                const dealerColor   = canSeeDealer && pc.dealer ? (DEALER_COLORS[pc.dealer] ?? '#888') : '#333'
                const spx           = spxFor(pc.created_at, pc.spx_at_time)
                const hyg           = hygFor(pc.created_at)
                return (
                  <tr key={pc.id} style={{ background: i % 2 === 0 ? '#0a0a0a' : '#0d0d0d', borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '3px 12px', color: '#555' }}>{fmtShortDate(pc.created_at)}</td>
                    <td style={{ padding: '3px 6px',  color: '#444' }}>{fmtTime(pc.created_at)}</td>
                    <td style={{ padding: '3px 6px',  color: dealerColor, fontWeight: 700 }}>{visibleDealer}</td>
                    <td style={{ padding: '3px 6px',  color: '#aaa' }}>{pc.tranche_name}.{pc.series_number}</td>
                    <td style={{ textAlign: 'center', padding: '3px 6px', color: pc.side === 'bid' ? '#66ff88' : '#ff6666', fontWeight: 700 }}>{pc.side.toUpperCase()}</td>
                    <td style={{ textAlign: 'right',  padding: '3px 6px',  color: '#fff' }}>{formatPx(pc.price, pc.mode)}</td>
                    <td style={{ textAlign: 'right',  padding: '3px 6px',  color: '#666' }}>{pc.size ?? '—'}</td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: spx != null ? '#3388ff' : '#2a2a2a' }}>
                      {spx != null ? Math.round(spx).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 12px', color: hyg != null ? '#ff8844' : '#2a2a2a' }}>
                      {hyg != null ? hyg.toFixed(2) : '—'}
                    </td>
                    {isTrader && (
                      <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                        <button
                          onClick={e => { e.stopPropagation(); deletePriceChange(pc.id) }}
                          style={{ background: 'transparent', border: 'none', color: '#442222', cursor: 'pointer', fontSize: '13px', padding: '0 4px', fontFamily: 'Courier New', lineHeight: 1 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ff4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#442222')}
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
          <div style={{ position: 'sticky', top: 0, background: '#0c0c0c', padding: '5px 12px', borderBottom: '1px solid #1e1e1e', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#f0c040', fontSize: '11px', letterSpacing: '2px' }}>TRADE LOG</span>
            <span style={{ color: '#3a3a3a', fontSize: '11px' }}>{filteredTrades.length} trades</span>
            {q && filteredTrades.length !== trades.length && (
              <span style={{ color: '#444', fontSize: '10px' }}>({trades.length} total)</span>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: '#fff', fontSize: '12px', position: 'sticky', top: '26px', background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                <th style={{ textAlign: 'left',  padding: '4px 12px', borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>DATE</th>
                <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>TIME</th>
                <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>TRANCHE</th>
                {isTrader && <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>BUYER</th>}
                {isTrader && <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>SELLER</th>}
                {!isTrader && <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>CPTY</th>}
                <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #f0c040', fontWeight: 700 }}>SPREAD</th>
                <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>SZ</th>
                <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #3388ff', fontWeight: 700 }}>SPX</th>
                <th style={{ textAlign: 'right', padding: '4px 12px', borderBottom: '2px solid #ff8844', fontWeight: 700 }}>HY</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.length === 0 ? (
                <tr><td colSpan={isTrader ? 9 : 8} style={{ padding: '24px 12px', color: '#2a2a2a', textAlign: 'center' }}>
                  {q ? `— no results for "${searchText}"` : '— no trades for selected range'}
                </td></tr>
              ) : filteredTrades.map((t, i) => {
                // For traders: show both buyer and seller
                // For dealers: show only who they traded against
                const buyer  = t.side === 'lift' ? t.dealer : t.passive_dealer
                const seller = t.side === 'lift' ? t.passive_dealer : t.dealer
                const cpty   = t.dealer === myDealerCode ? t.passive_dealer : t.dealer
                const spx    = spxFor(t.created_at, t.spx_at_time)
                const hyg    = hygFor(t.created_at)
                return (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? '#0a0a0a' : '#0d0d0d', borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '3px 12px', color: '#555' }}>{fmtShortDate(t.created_at)}</td>
                    <td style={{ padding: '3px 6px',  color: '#444' }}>{fmtTime(t.created_at)}</td>
                    <td style={{ padding: '3px 6px',  color: '#fff' }}>{t.tranche_name}.{t.series_number}</td>
                    {isTrader && <td style={{ padding: '3px 6px', color: '#66ff88', fontWeight: 700 }}>{buyer ?? '—'}</td>}
                    {isTrader && <td style={{ padding: '3px 6px', color: '#ff6666', fontWeight: 700 }}>{seller ?? '—'}</td>}
                    {!isTrader && <td style={{ padding: '3px 6px', color: DEALER_COLORS[cpty ?? ''] ?? '#666', fontWeight: 700 }}>{cpty ?? '—'}</td>}
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: '#f0c040', fontWeight: 700 }}>
                      {t.price != null ? t.price : <span style={{ color: '#2a2a2a' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 6px',  color: '#666' }}>{t.trade_size ?? '—'}</td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', color: spx != null ? '#3388ff' : '#2a2a2a' }}>
                      {spx != null ? Math.round(spx).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 12px', color: hyg != null ? '#ff8844' : '#2a2a2a' }}>
                      {hyg != null ? hyg.toFixed(2) : '—'}
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
