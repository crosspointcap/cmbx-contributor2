'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DATE_RANGES = ['1D', '1W', '1M', '3M', 'ALL'] as const
type DateRange = typeof DATE_RANGES[number]

interface PriceChange {
  id: string
  created_at: string
  series_number: string
  tranche_name: string
  dealer: string | null
  side: 'bid' | 'ask'
  price: number | null
  size: number | null
  mode: string | null
  cdx_hy: number | null
  cdx_ig: number | null
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
}

interface MarketContext {
  date: string
  spx_close: number | null
  vix_close: number | null
  cdx_hy_spread: number | null
  cdx_ig_spread: number | null
}

function getStartDate(range: DateRange): string | null {
  if (range === 'ALL') return null
  const days: Record<string, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90 }
  const d = new Date()
  d.setDate(d.getDate() - days[range])
  return d.toISOString().split('T')[0]
}

function fmt32nds(n: number): string {
  const whole = Math.floor(n)
  const ticks = Math.round((n - whole) * 32)
  return `${whole}-${ticks.toString().padStart(2, '0')}`
}

function formatPx(price: number | null | undefined, mode: string | null | undefined): string {
  if (price == null) return '—'
  if (mode === 'ticks') return fmt32nds(price)
  if (mode === 'price') return `$${price}`
  return String(price)
}

function fmtTime(ts: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ts))
}

function fmtDate(ts: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric',
  }).format(new Date(ts))
}

const DEALER_COLORS: Record<string, string> = {
  MS: '#ff8888', BOA: '#88ff88', CITI: '#cc88ff', JPM: '#5aafff',
  GS: '#ffcc44', UBS: '#ff88cc', BNP: '#8888ff', DB: '#88ccff', BARC: '#ffaa66',
}

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 150 },
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { color: '#555', font: { family: 'Courier New, monospace', size: 10 }, boxWidth: 10, padding: 8 },
    },
    tooltip: {
      backgroundColor: '#111', titleColor: '#f0c040', bodyColor: '#ccc',
      borderColor: '#333', borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: { color: '#444', font: { family: 'Courier New, monospace', size: 9 }, maxTicksLimit: 10, maxRotation: 0 },
      grid: { color: '#111' },
    },
    y: {
      ticks: { color: '#444', font: { family: 'Courier New, monospace', size: 9 } },
      grid: { color: '#111' },
    },
  },
}

export default function HistoryPage() {
  const [dateRange,        setDateRange]        = useState<DateRange>('1D')
  const [selectedChartKey, setSelectedChartKey] = useState<string | null>(null)
  const [priceChanges,     setPriceChanges]     = useState<PriceChange[]>([])
  const [trades,           setTrades]           = useState<TradeRow[]>([])
  const [marketCtx,        setMarketCtx]        = useState<MarketContext[]>([])
  const [loading,          setLoading]          = useState(false)
  const [isTrader,         setIsTrader]         = useState(false)
  const [myDealerCode,     setMyDealerCode]     = useState<string | null>(null)

  // ── Check role + own dealer code ─────────────────────────────────────────────
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

  // ── Realtime: new price changes + trades appear live; clears sync ─────────────
  useEffect(() => {
    const ch = supabase
      .channel(`history-rt-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_changes' }, (payload) => {
        const pc = payload.new as any
        setPriceChanges(prev => [{
          id: pc.id, created_at: pc.created_at,
          series_number: pc.series_number, tranche_name: pc.tranche_name,
          dealer: pc.dealer, side: pc.side, price: pc.price, size: pc.size, mode: pc.mode,
          cdx_hy: pc.cdx_hy ?? null, cdx_ig: pc.cdx_ig ?? null,
        }, ...prev])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const t = payload.new as any
        setTrades(prev => [{
          id: t.id, created_at: t.created_at,
          series_number: t.series_number, tranche_name: t.tranche_name,
          side: t.side, price: t.price, trade_size: t.trade_size,
          dealer: t.dealer, passive_dealer: t.passive_dealer,
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

    return () => {
      supabase.removeChannel(ch)
      supabase.removeChannel(broadcastCh)
    }
  }, [])

  // ── Load data when date range changes ─────────────────────────────────────────
  useEffect(() => { loadData() }, [dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    const startDate = getStartDate(dateRange)

    let pcQ = supabase
      .from('price_changes')
      .select('id, created_at, series_number, tranche_name, dealer, side, price, size, mode, cdx_hy, cdx_ig')
      .order('created_at', { ascending: false })
      .limit(2000)

    let trQ = supabase
      .from('trades')
      .select('id, created_at, series_number, tranche_name, side, price, trade_size, dealer, passive_dealer')
      .order('created_at', { ascending: false })
      .limit(500)

    let ctxQ = supabase
      .from('market_context')
      .select('date, spx_close, vix_close, cdx_hy_spread, cdx_ig_spread')
      .order('date', { ascending: true })
      .limit(400)

    if (startDate) {
      pcQ  = pcQ.gte('created_at', startDate + 'T00:00:00')
      trQ  = trQ.gte('created_at', startDate + 'T00:00:00')
      ctxQ = ctxQ.gte('date', startDate)
    }

    const [{ data: pd }, { data: td }, { data: cd }] = await Promise.all([pcQ, trQ, ctxQ])

    if (pd) setPriceChanges(pd)
    if (td) setTrades(td)
    if (cd) setMarketCtx(cd)
    setLoading(false)
  }

  // ── Build date → market context lookup ───────────────────────────────────────
  const ctxByDate = useMemo(() => {
    const map: Record<string, MarketContext> = {}
    for (const c of marketCtx) map[c.date] = c
    return map
  }, [marketCtx])

  // ── Selected chart tranche ────────────────────────────────────────────────────
  const [chartSeries, chartTranche] = selectedChartKey ? selectedChartKey.split(':') : ['—', '—']

  const chartPriceChanges = useMemo(() =>
    [...priceChanges]
      .filter(pc => `${pc.series_number}:${pc.tranche_name}` === selectedChartKey)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [priceChanges, selectedChartKey]
  )

  const chartTrades = useMemo(() =>
    [...trades]
      .filter(t => `${t.series_number}:${t.tranche_name}` === selectedChartKey)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [trades, selectedChartKey]
  )

  // ── CMBX chart: all bid/ask entries + trades for selected tranche ─────────────
  const cmbxChartData = useMemo(() => {
    type Evt = { ts: string; bid: number | null; ask: number | null; trade: number | null }
    const events: Evt[] = [
      ...chartPriceChanges.map(pc => ({
        ts: pc.created_at,
        bid:   pc.side === 'bid' ? pc.price : null,
        ask:   pc.side === 'ask' ? pc.price : null,
        trade: null,
      })),
      ...chartTrades.map(t => ({ ts: t.created_at, bid: null, ask: null, trade: t.price })),
    ].sort((a, b) => a.ts.localeCompare(b.ts))

    const labels = events.map(e => fmtTime(e.ts))
    return {
      labels,
      datasets: [
        {
          label: 'BID',
          data: events.map(e => e.bid),
          borderColor: '#66ff88', backgroundColor: '#66ff88',
          showLine: false, pointRadius: 5, pointHoverRadius: 7,
        },
        {
          label: 'OFFER',
          data: events.map(e => e.ask),
          borderColor: '#ff6666', backgroundColor: '#ff6666',
          showLine: false, pointRadius: 5, pointHoverRadius: 7,
        },
        {
          label: 'TRADE',
          data: events.map(e => e.trade),
          borderColor: '#f0c040', backgroundColor: '#f0c040',
          showLine: false, pointRadius: 7, pointHoverRadius: 9,
          pointStyle: 'triangle',
        },
      ],
    }
  }, [chartPriceChanges, chartTrades])

  const cmbxChartOptions = useMemo(() => ({
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      tooltip: {
        ...baseChartOptions.plugins.tooltip,
        callbacks: {
          title: (items: any[]) => `CMBX.${chartSeries}.${chartTranche}  ·  ${items[0]?.label ?? ''}`,
          label: (item: any) => item.raw == null ? null : `  ${item.dataset.label}:  ${item.raw}`,
        },
      },
    },
  }), [chartSeries, chartTranche])

  // ── SPX chart ─────────────────────────────────────────────────────────────────
  const spxChartData = useMemo(() => ({
    labels: marketCtx.map(m => fmtDate(m.date + 'T12:00:00')),
    datasets: [{
      label: 'SPX',
      data: marketCtx.map(m => m.spx_close),
      borderColor: '#3388ff', backgroundColor: 'transparent',
      borderWidth: 1.5, pointRadius: 2, tension: 0.1,
    }],
  }), [marketCtx])

  // ── CDX HY + CDX IG chart ────────────────────────────────────────────────────
  const cdxChartData = useMemo(() => ({
    labels: marketCtx.map(m => fmtDate(m.date + 'T12:00:00')),
    datasets: [
      {
        label: 'CDX HY',
        data: marketCtx.map(m => m.cdx_hy_spread),
        borderColor: '#eebb00', backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 2, tension: 0.1, yAxisID: 'y',
      },
      {
        label: 'CDX IG',
        data: marketCtx.map(m => m.cdx_ig_spread),
        borderColor: '#44ddaa', backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 2, tension: 0.1, yAxisID: 'y1',
      },
    ],
  }), [marketCtx])

  const cdxChartOptions = useMemo(() => ({
    ...baseChartOptions,
    scales: {
      ...baseChartOptions.scales,
      y:  { ...baseChartOptions.scales.y, position: 'left'  as const },
      y1: { ...baseChartOptions.scales.y, position: 'right' as const, grid: { drawOnChartArea: false } },
    },
  }), [])

  const noMarketData = marketCtx.length === 0

  return (
    <div style={{ background: '#0a0a0a', color: '#ccc', fontFamily: 'Courier New, monospace', fontSize: '13px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <span style={{ color: '#f0c040', fontSize: '15px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX HISTORY — CROSSPOINT CAPITAL
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0, background: '#080808' }}>
        <span style={{ color: '#3a3a3a', fontSize: '11px', letterSpacing: '1px', marginRight: '4px' }}>RANGE</span>
        {DATE_RANGES.map(r => (
          <button key={r} onClick={() => setDateRange(r)} style={{
            background: dateRange === r ? '#1a1500' : 'transparent',
            color: dateRange === r ? '#f0c040' : '#3a3a3a',
            border: `1px solid ${dateRange === r ? '#f0c040' : '#222'}`,
            padding: '2px 10px', fontSize: '11px', fontFamily: 'Courier New, monospace',
            cursor: 'pointer', borderRadius: '2px', fontWeight: dateRange === r ? 700 : 400,
          }}>{r}</button>
        ))}
        {loading && <span style={{ color: '#3a3a3a', fontSize: '11px', marginLeft: '8px' }}>LOADING...</span>}
        {noMarketData && (
          <span style={{ color: '#554400', fontSize: '11px', marginLeft: '12px' }}>
            ⚠ no CDX/SPX data — run bloomberg_agent/market_data_puller.py (CDX) or trigger GitHub Actions (SPX)
          </span>
        )}
        {selectedChartKey && (
          <span style={{ marginLeft: 'auto', color: '#3a3a3a', fontSize: '11px' }}>
            chart: <span style={{ color: '#f0c040' }}>CMBX.{chartSeries}.{chartTranche}</span>
            <span style={{ color: '#2a2a2a' }}> — click a row to change</span>
          </span>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT 60%: tables ──────────────────────────────────────────────── */}
        <div style={{ width: '60%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1a1a1a', overflow: 'hidden' }}>

          {/* Table 1: Price Activity */}
          <div style={{ flex: '0 0 50%', overflow: 'auto', borderBottom: '1px solid #1a1a1a' }}>
            <div style={{ position: 'sticky', top: 0, background: '#0c0c0c', padding: '5px 12px', borderBottom: '1px solid #1e1e1e', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#f0c040', fontSize: '11px', letterSpacing: '2px' }}>PRICE ACTIVITY</span>
              <span style={{ color: '#3a3a3a', fontSize: '11px' }}>{priceChanges.length} entries</span>
              {priceChanges.length === 0 && !loading && (
                <span style={{ color: '#443300', fontSize: '10px', marginLeft: '8px' }}>
                  — prices entered on the ADMIN page will appear here
                </span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ color: '#fff', fontSize: '12px', position: 'sticky', top: '26px', background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                  <th style={{ textAlign: 'left',  padding: '4px 12px', borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>DATE</th>
                  <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>TIME</th>
                  <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>DEALER</th>
                  <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>TRANCHE</th>
                  <th style={{ textAlign: 'center',padding: '4px 6px',  borderBottom: '2px solid #888',    fontWeight: 700 }}>SIDE</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>SPREAD</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>SIZE</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #eebb00', fontWeight: 700 }}>CDX HY</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #44ddaa', fontWeight: 700 }}>CDX IG</th>
                  <th style={{ textAlign: 'right', padding: '4px 12px', borderBottom: '2px solid #3388ff', fontWeight: 700 }}>SPX</th>
                </tr>
              </thead>
              <tbody>
                {priceChanges.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: '24px 12px', color: '#2a2a2a', textAlign: 'center' }}>— no price activity for selected range</td></tr>
                ) : priceChanges.map((pc, i) => {
                  const key = `${pc.series_number}:${pc.tranche_name}`
                  const isSelected = key === selectedChartKey
                  const ctx = ctxByDate[pc.created_at.split('T')[0]]
                  // Use CDX stamped directly on the row (exact moment); fall back to daily ctx for older rows
                  const pcCdxHy = pc.cdx_hy ?? ctx?.cdx_hy_spread ?? null
                  const pcCdxIg = pc.cdx_ig ?? ctx?.cdx_ig_spread ?? null
                  // Traders see all dealer names; dealers only see their own
                  const canSeeDealer = isTrader || pc.dealer === myDealerCode
                  const visibleDealer = canSeeDealer ? (pc.dealer ?? '—') : '—'
                  const dealerColor = canSeeDealer && pc.dealer ? (DEALER_COLORS[pc.dealer] ?? '#888') : '#333'
                  return (
                    <tr key={pc.id} onClick={() => setSelectedChartKey(key)} style={{
                      background: isSelected ? '#111100' : i % 2 === 0 ? '#0a0a0a' : '#0d0d0d',
                      borderBottom: '1px solid #141414',
                      borderLeft: isSelected ? '2px solid #f0c040' : '2px solid transparent',
                      cursor: 'pointer',
                    }}>
                      <td style={{ padding: '3px 12px', color: '#555' }}>{fmtDate(pc.created_at)}</td>
                      <td style={{ padding: '3px 6px',  color: '#444' }}>{fmtTime(pc.created_at)}</td>
                      <td style={{ padding: '3px 6px',  color: dealerColor, fontWeight: 700 }}>{visibleDealer}</td>
                      <td style={{ padding: '3px 6px',  color: isSelected ? '#f0c040' : '#aaa' }}>CMBX.{pc.series_number}.{pc.tranche_name}</td>
                      <td style={{ textAlign: 'center', padding: '3px 6px', color: pc.side === 'bid' ? '#66ff88' : '#ff6666', fontWeight: 700 }}>{pc.side.toUpperCase()}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px', color: '#fff' }}>
                        {formatPx(pc.price, pc.mode)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '3px 6px',  color: '#666' }}>{pc.size != null ? `${pc.size}MM` : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px',  color: pcCdxHy != null ? '#eebb00' : '#2a2a2a' }}>{pcCdxHy != null ? pcCdxHy.toFixed(1) : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px',  color: pcCdxIg != null ? '#44ddaa' : '#2a2a2a' }}>{pcCdxIg != null ? pcCdxIg.toFixed(1) : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '3px 12px', color: ctx?.spx_close != null ? '#3388ff' : '#2a2a2a' }}>{ctx?.spx_close != null ? ctx.spx_close.toLocaleString() : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table 2: Trade Log */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, background: '#0c0c0c', padding: '5px 12px', borderBottom: '1px solid #1e1e1e', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#f0c040', fontSize: '11px', letterSpacing: '2px' }}>TRADE LOG</span>
              <span style={{ color: '#3a3a3a', fontSize: '11px' }}>{trades.length} trades</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ color: '#fff', fontSize: '12px', position: 'sticky', top: '26px', background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                  <th style={{ textAlign: 'left',  padding: '4px 12px', borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>DATE</th>
                  <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>TIME</th>
                  <th style={{ textAlign: 'left',  padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>TRANCHE</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #f0c040', fontWeight: 700 }}>SPREAD</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '1px solid #1a1a1a', fontWeight: 700 }}>SIZE</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #eebb00', fontWeight: 700 }}>CDX HY</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px',  borderBottom: '2px solid #44ddaa', fontWeight: 700 }}>CDX IG</th>
                  <th style={{ textAlign: 'right', padding: '4px 12px', borderBottom: '2px solid #3388ff', fontWeight: 700 }}>SPX</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '24px 12px', color: '#2a2a2a', textAlign: 'center' }}>— no trades for selected range</td></tr>
                ) : trades.map((t, i) => {
                  const key = `${t.series_number}:${t.tranche_name}`
                  const isSelected = key === selectedChartKey
                  const ctx = ctxByDate[t.created_at.split('T')[0]]
                  return (
                    <tr key={t.id} onClick={() => setSelectedChartKey(key)} style={{
                      background: isSelected ? '#111100' : i % 2 === 0 ? '#0a0a0a' : '#0d0d0d',
                      borderBottom: '1px solid #141414',
                      borderLeft: isSelected ? '2px solid #f0c040' : '2px solid transparent',
                      cursor: 'pointer',
                    }}>
                      <td style={{ padding: '3px 12px', color: '#555' }}>{fmtDate(t.created_at)}</td>
                      <td style={{ padding: '3px 6px',  color: '#444' }}>{fmtTime(t.created_at)}</td>
                      <td style={{ padding: '3px 6px',  color: isSelected ? '#f0c040' : '#fff' }}>CMBX.{t.series_number}.{t.tranche_name}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px',  color: '#f0c040', fontWeight: 700 }}>
                        {t.price != null ? t.price : <span style={{ color: '#2a2a2a' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', padding: '3px 6px',  color: '#666' }}>{t.trade_size != null ? `${t.trade_size}MM` : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px',  color: ctx?.cdx_hy_spread != null ? '#eebb00' : '#2a2a2a' }}>{ctx?.cdx_hy_spread != null ? ctx.cdx_hy_spread.toFixed(1) : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px',  color: ctx?.cdx_ig_spread != null ? '#44ddaa' : '#2a2a2a' }}>{ctx?.cdx_ig_spread != null ? ctx.cdx_ig_spread.toFixed(1) : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '3px 12px', color: ctx?.spx_close    != null ? '#3388ff' : '#2a2a2a' }}>{ctx?.spx_close    != null ? ctx.spx_close.toLocaleString()   : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT 40%: charts ─────────────────────────────────────────────── */}
        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Chart 1: CMBX intraday bid/offer + trades */}
          <div style={{ flex: 1, borderBottom: '1px solid #1a1a1a', padding: '8px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flexShrink: 0, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#66ff88', fontSize: '10px' }}>● BID</span>
              <span style={{ color: '#ff6666', fontSize: '10px' }}>● OFFER</span>
              <span style={{ color: '#f0c040', fontSize: '10px' }}>▲ TRADE</span>
              {selectedChartKey && <span style={{ color: '#f0c040', fontSize: '10px', marginLeft: '4px' }}>CMBX.{chartSeries}.{chartTranche}</span>}
              {!selectedChartKey && <span style={{ color: '#2a2a2a', fontSize: '10px' }}>click a row to view tranche</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <Line data={cmbxChartData} options={cmbxChartOptions} />
            </div>
          </div>

          {/* Chart 2: SPX */}
          <div style={{ flex: 1, borderBottom: '1px solid #1a1a1a', padding: '8px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flexShrink: 0, marginBottom: '4px' }}>
              <span style={{ color: '#3388ff', fontSize: '10px', letterSpacing: '1px' }}>S&P 500</span>
              {noMarketData && <span style={{ color: '#333', fontSize: '10px', marginLeft: '8px' }}>no data</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <Line data={spxChartData} options={baseChartOptions} />
            </div>
          </div>

          {/* Chart 3: CDX HY + CDX IG */}
          <div style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flexShrink: 0, marginBottom: '4px' }}>
              <span style={{ color: '#eebb00', fontSize: '10px', letterSpacing: '1px' }}>CDX HY</span>
              <span style={{ color: '#2a2a2a', fontSize: '10px' }}> / </span>
              <span style={{ color: '#44ddaa', fontSize: '10px', letterSpacing: '1px' }}>CDX IG</span>
              {noMarketData && <span style={{ color: '#333', fontSize: '10px', marginLeft: '8px' }}>no data — run market_data_puller.py</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <Line data={cdxChartData} options={cdxChartOptions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
