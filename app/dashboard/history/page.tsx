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

const DATE_RANGES = ['1W', '1M', '3M', '6M', '1Y', 'ALL'] as const
type DateRange = typeof DATE_RANGES[number]

interface DailySnapshot {
  date: string
  series_number: string
  tranche_name: string
  best_bid: number | null
  best_ask: number | null
  trade_count: number | null
  avg_trade_px: number | null
}

interface TradeRow {
  id: string
  created_at: string
  series_number: string
  tranche_name: string
  price: number | null
  trade_size: number | null
  spx_close?: number | null
  cdx_hy_spread?: number | null
}

interface MarketContext {
  date: string
  spx_close: number | null
  spx_high: number | null
  spx_low: number | null
  vix_close: number | null
  hyg_close: number | null
  cdx_hy_spread: number | null
}

function getStartDate(range: DateRange): string | null {
  if (range === 'ALL') return null
  const days: Record<string, number> = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }
  const d = new Date()
  d.setDate(d.getDate() - days[range])
  return d.toISOString().split('T')[0]
}

function fmtDateLabel(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateFull(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(ts: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ts))
}

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 200 },
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { color: '#555', font: { family: 'Courier New, monospace', size: 10 }, boxWidth: 12, padding: 8 },
    },
    tooltip: {
      backgroundColor: '#111',
      titleColor: '#f0c040',
      bodyColor: '#ccc',
      borderColor: '#333',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: { color: '#444', font: { family: 'Courier New, monospace', size: 9 }, maxTicksLimit: 8, maxRotation: 0 },
      grid: { color: '#111' },
    },
    y: {
      ticks: { color: '#444', font: { family: 'Courier New, monospace', size: 9 } },
      grid: { color: '#111' },
    },
  },
}

export default function HistoryPage() {
  const [dateRange,        setDateRange]        = useState<DateRange>('3M')
  const [selectedChartKey, setSelectedChartKey] = useState<string | null>(null)
  const [snapshots,        setSnapshots]        = useState<DailySnapshot[]>([])
  const [trades,           setTrades]           = useState<TradeRow[]>([])
  const [marketCtx,        setMarketCtx]        = useState<MarketContext[]>([])
  const [loading,          setLoading]          = useState(false)

  // ── Realtime: sync trade deletes + inserts live ───────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`history-rt-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trades' }, (payload) => {
        const id = (payload.old as any).id
        if (id) setTrades(prev => prev.filter(t => t.id !== id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const t = payload.new as any
        const newTrade: TradeRow = {
          id: t.id,
          created_at: t.created_at,
          series_number: t.series_number,
          tranche_name: t.tranche_name,
          price: t.price,
          trade_size: t.trade_size,
        }
        setTrades(prev => [newTrade, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── Load all data when date range changes ─────────────────────────────────────
  useEffect(() => {
    loadData()
  }, [dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    const startDate = getStartDate(dateRange)

    let snapshotQ = supabase
      .from('daily_snapshots')
      .select('date, series_number, tranche_name, best_bid, best_ask, trade_count, avg_trade_px')
      .order('date', { ascending: false })
      .limit(1000)

    let tradesQ = supabase
      .from('trades')
      .select('id, created_at, series_number, tranche_name, price, trade_size')
      .order('created_at', { ascending: false })
      .limit(1000)

    let ctxQ = supabase
      .from('market_context')
      .select('date, spx_close, spx_high, spx_low, vix_close, hyg_close, cdx_hy_spread')
      .order('date', { ascending: true })
      .limit(400)

    if (startDate) {
      snapshotQ = snapshotQ.gte('date', startDate)
      tradesQ   = tradesQ.gte('created_at', startDate + 'T00:00:00')
      ctxQ      = ctxQ.gte('date', startDate)
    }

    const [{ data: sd }, { data: td }, { data: cd }] = await Promise.all([snapshotQ, tradesQ, ctxQ])

    const ctxMap: Record<string, MarketContext> = {}
    if (cd) {
      for (const row of cd) ctxMap[row.date] = row
      setMarketCtx(cd)
    }

    if (td) {
      const enriched: TradeRow[] = td.map((t: TradeRow) => {
        const tradeDate = t.created_at.split('T')[0]
        const ctx = ctxMap[tradeDate]
        return { ...t, spx_close: ctx?.spx_close ?? null, cdx_hy_spread: ctx?.cdx_hy_spread ?? null }
      })
      setTrades(enriched)
      // Default chart to first trade's tranche if nothing selected yet
      if (enriched.length > 0) {
        setSelectedChartKey(prev => prev ?? `${enriched[0].series_number}:${enriched[0].tranche_name}`)
      }
    }

    if (sd) setSnapshots(sd)
    setLoading(false)
  }

  // ── Derived chart key parts ───────────────────────────────────────────────────
  const [chartSeries, chartTranche] = selectedChartKey ? selectedChartKey.split(':') : ['—', '—']

  const chartSnapshots = useMemo(() =>
    snapshots.filter(s => `${s.series_number}:${s.tranche_name}` === selectedChartKey),
    [snapshots, selectedChartKey]
  )

  const chartTrades = useMemo(() =>
    trades.filter(t => `${t.series_number}:${t.tranche_name}` === selectedChartKey),
    [trades, selectedChartKey]
  )

  // ── CMBX chart data ───────────────────────────────────────────────────────────
  const cmbxChartData = useMemo(() => {
    const sorted = [...chartSnapshots].sort((a, b) => a.date.localeCompare(b.date))
    const labels  = sorted.map(s => fmtDateLabel(s.date))

    const tradeDateMap: Record<string, number | null> = {}
    for (const t of chartTrades) {
      const d = t.created_at.split('T')[0]
      if (!(d in tradeDateMap)) tradeDateMap[d] = t.price
    }

    return {
      labels,
      datasets: [
        {
          label: 'BID',
          data: sorted.map(s => s.best_bid),
          borderColor: '#66ff88',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
        },
        {
          label: 'OFFER',
          data: sorted.map(s => s.best_ask),
          borderColor: '#ff6666',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
        },
        {
          label: 'TRADE',
          data: sorted.map(s => tradeDateMap[s.date] ?? null),
          showLine: false,
          backgroundColor: '#f0c040',
          pointBackgroundColor: '#f0c040',
          pointBorderColor: '#f0c040',
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    }
  }, [chartSnapshots, chartTrades])

  // ── CMBX chart options with rich tooltip ─────────────────────────────────────
  const cmbxChartOptions = useMemo(() => ({
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      tooltip: {
        ...baseChartOptions.plugins.tooltip,
        callbacks: {
          title: (items: any[]) =>
            `CMBX.${chartSeries}.${chartTranche}  ·  ${items[0]?.label ?? ''}`,
          label: (item: any) => {
            if (item.raw == null) return null
            const val = typeof item.raw === 'number' ? item.raw.toFixed(3) : item.raw
            return `  ${item.dataset.label}:  ${val}`
          },
        },
      },
    },
  }), [chartSeries, chartTranche])

  // ── SPX / HYG+VIX chart options ───────────────────────────────────────────────
  const spxChartData = useMemo(() => ({
    labels: marketCtx.map(m => fmtDateLabel(m.date)),
    datasets: [{
      label: 'SPX',
      data: marketCtx.map(m => m.spx_close),
      borderColor: '#3388ff',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.1,
    }],
  }), [marketCtx])

  const spxChartOptions = useMemo(() => ({
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      tooltip: {
        ...baseChartOptions.plugins.tooltip,
        callbacks: {
          title: (items: any[]) => `S&P 500  ·  ${items[0]?.label ?? ''}`,
          label: (item: any) => {
            if (item.raw == null) return null
            return `  SPX:  ${Number(item.raw).toLocaleString()}`
          },
        },
      },
    },
  }), [])

  const hygVixChartData = useMemo(() => ({
    labels: marketCtx.map(m => fmtDateLabel(m.date)),
    datasets: [
      {
        label: 'HYG',
        data: marketCtx.map(m => m.hyg_close),
        borderColor: '#eebb00',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'VIX',
        data: marketCtx.map(m => m.vix_close),
        borderColor: '#bb55ee',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1,
        yAxisID: 'y1',
      },
    ],
  }), [marketCtx])

  const hygVixChartOptions = useMemo(() => ({
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      tooltip: {
        ...baseChartOptions.plugins.tooltip,
        callbacks: {
          title: (items: any[]) => `HYG / VIX  ·  ${items[0]?.label ?? ''}`,
          label: (item: any) => {
            if (item.raw == null) return null
            return `  ${item.dataset.label}:  ${Number(item.raw).toFixed(2)}`
          },
        },
      },
    },
    scales: {
      ...baseChartOptions.scales,
      y:  { ...baseChartOptions.scales.y, position: 'left'  as const },
      y1: { ...baseChartOptions.scales.y, position: 'right' as const, grid: { drawOnChartArea: false } },
    },
  }), [])

  const isTrader = false

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

      {/* Filter bar — date range only */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0, background: '#080808' }}>
        <span style={{ color: '#3a3a3a', fontSize: '11px', letterSpacing: '1px', marginRight: '4px' }}>RANGE</span>
        {DATE_RANGES.map(r => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            style={{
              background: dateRange === r ? '#1a1500' : 'transparent',
              color: dateRange === r ? '#f0c040' : '#3a3a3a',
              border: `1px solid ${dateRange === r ? '#f0c040' : '#222'}`,
              padding: '2px 10px',
              fontSize: '11px',
              fontFamily: 'Courier New, monospace',
              cursor: 'pointer',
              borderRadius: '2px',
              fontWeight: dateRange === r ? 700 : 400,
            }}
          >
            {r}
          </button>
        ))}
        {loading && <span style={{ color: '#3a3a3a', fontSize: '11px', marginLeft: '8px' }}>LOADING...</span>}
        {selectedChartKey && (
          <span style={{ marginLeft: 'auto', color: '#3a3a3a', fontSize: '11px' }}>
            chart: <span style={{ color: '#f0c040' }}>CMBX.{chartSeries}.{chartTranche}</span>
            <span style={{ color: '#2a2a2a' }}> — click a trade row to change</span>
          </span>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT 60%: tables ──────────────────────────────────────────────── */}
        <div style={{ width: '60%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1a1a1a', overflow: 'hidden' }}>

          {/* Table 1: Daily Price History — all tranches */}
          <div style={{ flex: '0 0 45%', overflow: 'auto', borderBottom: '1px solid #1a1a1a' }}>
            <div style={{ position: 'sticky', top: 0, background: '#0c0c0c', padding: '5px 12px', borderBottom: '1px solid #1e1e1e', zIndex: 1 }}>
              <span style={{ color: '#f0c040', fontSize: '11px', letterSpacing: '2px' }}>DAILY PRICE HISTORY</span>
              {snapshots.length > 0 && <span style={{ color: '#3a3a3a', fontSize: '11px', marginLeft: '8px' }}>{snapshots.length} rows</span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: '#444', position: 'sticky', top: '26px', background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                  <th style={{ textAlign: 'left',  padding: '4px 12px', borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>DATE</th>
                  <th style={{ textAlign: 'left',  padding: '4px 8px',  borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>TRANCHE</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px',  borderBottom: '2px solid #66ff88', fontWeight: 400 }}>BEST BID</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px',  borderBottom: '2px solid #ff6666', fontWeight: 400 }}>BEST ASK</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px',  borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>SPREAD</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px',  borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>TRADES</th>
                  <th style={{ textAlign: 'right', padding: '4px 12px', borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>AVG PX</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '24px 12px', color: '#2a2a2a', textAlign: 'center' }}>— no snapshot data for selected range</td></tr>
                ) : snapshots.map((s, i) => {
                  const sp = s.best_bid != null && s.best_ask != null ? (s.best_ask - s.best_bid).toFixed(2) : null
                  const key = `${s.series_number}:${s.tranche_name}`
                  const isSelected = key === selectedChartKey
                  return (
                    <tr
                      key={`${s.date}:${key}`}
                      onClick={() => setSelectedChartKey(key)}
                      style={{
                        background: isSelected ? '#111100' : i % 2 === 0 ? '#0a0a0a' : '#0d0d0d',
                        borderBottom: '1px solid #141414',
                        borderLeft: isSelected ? '2px solid #f0c040' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '4px 12px', color: '#666' }}>{fmtDateFull(s.date)}</td>
                      <td style={{ padding: '4px 8px', color: isSelected ? '#f0c040' : '#aaa' }}>CMBX.{s.series_number}.{s.tranche_name}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px',  color: s.best_bid  != null ? '#66ff88' : '#2a2a2a' }}>{s.best_bid  ?? '—'}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px',  color: s.best_ask  != null ? '#ff6666' : '#2a2a2a' }}>{s.best_ask  ?? '—'}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px',  color: sp != null ? '#888' : '#2a2a2a' }}>{sp ?? '—'}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px',  color: s.trade_count ? '#ccc' : '#2a2a2a' }}>{s.trade_count ?? '—'}</td>
                      <td style={{ textAlign: 'right', padding: '4px 12px', color: s.avg_trade_px != null ? '#f0c040' : '#2a2a2a' }}>{s.avg_trade_px ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table 2: Trade Log — all trades */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, background: '#0c0c0c', padding: '5px 12px', borderBottom: '1px solid #1e1e1e', zIndex: 1 }}>
              <span style={{ color: '#f0c040', fontSize: '11px', letterSpacing: '2px' }}>TRADE LOG</span>
              {trades.length > 0 && <span style={{ color: '#3a3a3a', fontSize: '11px', marginLeft: '8px' }}>{trades.length} trades</span>}
              <span style={{ color: '#2a2a2a', fontSize: '10px', marginLeft: '8px' }}>click row to view tranche on chart</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: '#444', position: 'sticky', top: '26px', background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
                  <th style={{ textAlign: 'left',  padding: '4px 12px', borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>DATE</th>
                  <th style={{ textAlign: 'left',  padding: '4px 8px',  borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>TIME</th>
                  <th style={{ textAlign: 'left',  padding: '4px 8px',  borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>TRANCHE</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px',  borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>PRICE</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px',  borderBottom: '1px solid #1a1a1a', fontWeight: 400 }}>SIZE</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px',  borderBottom: '2px solid #3388ff', fontWeight: 400 }}>SPX</th>
                  <th style={{ textAlign: 'right', padding: '4px 12px', borderBottom: '2px solid #eebb00', fontWeight: 400 }}>CDX HY</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '24px 12px', color: '#2a2a2a', textAlign: 'center' }}>— no trades for selected range</td></tr>
                ) : trades.map((t, i) => {
                  const key = `${t.series_number}:${t.tranche_name}`
                  const isSelected = key === selectedChartKey
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedChartKey(key)}
                      style={{
                        background: isSelected ? '#111100' : i % 2 === 0 ? '#0a0a0a' : '#0d0d0d',
                        borderBottom: '1px solid #141414',
                        borderLeft: isSelected ? '2px solid #f0c040' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '4px 12px', color: '#666' }}>{fmtDateFull(t.created_at.split('T')[0])}</td>
                      <td style={{ padding: '4px 8px',  color: '#555' }}>{fmtTime(t.created_at)}</td>
                      <td style={{ padding: '4px 8px',  color: isSelected ? '#f0c040' : '#fff' }}>CMBX.{t.series_number}.{t.tranche_name}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px',  color: '#f0c040' }}>{t.price ?? <span style={{ color: '#2a2a2a' }}>—</span>}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px',  color: '#777' }}>{t.trade_size != null ? `${t.trade_size}MM` : <span style={{ color: '#2a2a2a' }}>—</span>}</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px',  color: t.spx_close != null ? '#3388ff' : '#2a2a2a' }}>{t.spx_close != null ? t.spx_close.toLocaleString() : '—'}</td>
                      <td style={{ textAlign: 'right', padding: '4px 12px', color: t.cdx_hy_spread != null ? '#eebb00' : '#2a2a2a' }}>{t.cdx_hy_spread != null ? `${Number(t.cdx_hy_spread).toFixed(1)} bps` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT 40%: charts ─────────────────────────────────────────────── */}
        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Chart 1: CMBX — updates when row is clicked */}
          <div style={{ flex: 1, borderBottom: '1px solid #1a1a1a', padding: '8px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flexShrink: 0, marginBottom: '4px' }}>
              <span style={{ color: '#66ff88', fontSize: '10px', letterSpacing: '1px' }}>BID</span>
              <span style={{ color: '#2a2a2a', fontSize: '10px' }}> / </span>
              <span style={{ color: '#ff6666', fontSize: '10px', letterSpacing: '1px' }}>OFFER</span>
              {selectedChartKey && (
                <>
                  <span style={{ color: '#2a2a2a', fontSize: '10px' }}> · </span>
                  <span style={{ color: '#f0c040', fontSize: '10px', letterSpacing: '1px' }}>CMBX.{chartSeries}.{chartTranche}</span>
                </>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <Line data={cmbxChartData} options={cmbxChartOptions} />
            </div>
          </div>

          {/* Chart 2: SPX */}
          <div style={{ flex: 1, borderBottom: '1px solid #1a1a1a', padding: '8px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flexShrink: 0, marginBottom: '4px' }}>
              <span style={{ color: '#3388ff', fontSize: '10px', letterSpacing: '1px' }}>S&P 500</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <Line data={spxChartData} options={spxChartOptions} />
            </div>
          </div>

          {/* Chart 3: HYG + VIX */}
          <div style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flexShrink: 0, marginBottom: '4px' }}>
              <span style={{ color: '#eebb00', fontSize: '10px', letterSpacing: '1px' }}>HYG</span>
              <span style={{ color: '#2a2a2a', fontSize: '10px' }}> / </span>
              <span style={{ color: '#bb55ee', fontSize: '10px', letterSpacing: '1px' }}>VIX</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <Line data={hygVixChartData} options={hygVixChartOptions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
