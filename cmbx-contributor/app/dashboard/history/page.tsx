'use client'

import { useEffect, useState } from 'react'
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

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Range = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'

interface Snapshot {
  date: string
  series_number: number
  tranche_name: string
  best_bid: number | null
  best_ask: number | null
  trade_count: number
  avg_trade_px: number | null
}

interface Trade {
  id: string
  created_at: string
  series_number: number
  tranche_name: string
  price: number | null
  trade_size: number | null
}

interface MarketCtx {
  date: string
  spx_close: number | null
  vix_close: number | null
  hyg_close: number | null
  cdx_hy_spread: number | null
}

const RANGE_DAYS: Record<Range, number | null> = {
  '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': null,
}

function startDate(range: Range): string | null {
  const days = RANGE_DAYS[range]
  if (days === null) return null
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m) - 1]} ${parseInt(d)}`
}

function fmtTime(ts: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ts))
}

const CHART_FONT = { family: 'Courier New', size: 11 }
const AXIS_STYLE = {
  ticks: { color: '#555', font: CHART_FONT, maxTicksLimit: 8 },
  grid: { color: '#1a1a1a' },
}
const TOOLTIP_STYLE = {
  backgroundColor: '#111',
  borderColor: '#333',
  borderWidth: 1,
  titleColor: '#f0c040',
  bodyColor: '#ccc',
  titleFont: { family: 'Courier New', size: 12 },
  bodyFont: { family: 'Courier New', size: 12 },
}
const LEGEND_STYLE = {
  labels: { color: '#aaa', font: CHART_FONT, boxWidth: 10 },
}

export default function HistoryPage() {
  const [range, setRange] = useState<Range>('3M')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [market, setMarket] = useState<MarketCtx[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [range])

  async function loadData() {
    setLoading(true)
    const from = startDate(range)

    let snapQ = sb.table('daily_snapshots').select('*').order('date', { ascending: true })
    if (from) snapQ = snapQ.gte('date', from)

    let tradeQ = sb.table('trades')
      .select('id, created_at, series_number, tranche_name, price, trade_size')
      .order('created_at', { ascending: false })
    if (from) tradeQ = tradeQ.gte('created_at', from + 'T00:00:00')

    let mktQ = sb.table('market_context').select('*').order('date', { ascending: true })
    if (from) mktQ = mktQ.gte('date', from)

    const [{ data: snapData }, { data: tradeData }, { data: mktData }] = await Promise.all([
      snapQ, tradeQ, mktQ,
    ])

    const snaps: Snapshot[] = snapData || []
    setSnapshots(snaps)
    setTrades(tradeData || [])
    setMarket(mktData || [])

    setSelectedKey(prev => {
      if (prev) return prev
      if (snaps.length > 0) return `${snaps[0].series_number}:${snaps[0].tranche_name}`
      return null
    })

    setLoading(false)
  }

  const [selSeries, selTranche] = (selectedKey || ':').split(':')
  const filteredSnaps = snapshots.filter(
    s => String(s.series_number) === selSeries && s.tranche_name === selTranche
  )
  const chartLabel = selectedKey ? `CMBX.${selSeries}.${selTranche}` : 'CMBX'

  const mktByDate: Record<string, MarketCtx> = {}
  for (const m of market) mktByDate[m.date] = m

  // Deduplicate snapshots for table: latest per (date, series, tranche)
  const snapRows = Object.values(
    snapshots.reduce<Record<string, Snapshot>>((acc, s) => {
      acc[`${s.date}:${s.series_number}:${s.tranche_name}`] = s
      return acc
    }, {})
  ).sort((a, b) => b.date.localeCompare(a.date) || Number(a.series_number) - Number(b.series_number))

  // ── Chart data ──────────────────────────────────────────────────────────────
  const cmbxData = {
    labels: filteredSnaps.map(s => shortDate(s.date)),
    datasets: [
      {
        label: 'Bid',
        data: filteredSnaps.map(s => s.best_bid),
        borderColor: '#ffffff',
        backgroundColor: 'transparent',
        pointRadius: 2,
        tension: 0.1,
      },
      {
        label: 'Ask',
        data: filteredSnaps.map(s => s.best_ask),
        borderColor: '#f0c040',
        backgroundColor: 'transparent',
        pointRadius: 2,
        tension: 0.1,
      },
    ],
  }

  const spxData = {
    labels: market.map(m => shortDate(m.date)),
    datasets: [{
      label: 'SPX',
      data: market.map(m => m.spx_close),
      borderColor: '#4488ff',
      backgroundColor: 'transparent',
      pointRadius: 2,
      tension: 0.1,
    }],
  }

  const hygData = {
    labels: market.map(m => shortDate(m.date)),
    datasets: [
      {
        label: 'HYG',
        data: market.map(m => m.hyg_close),
        borderColor: '#66ccff',
        backgroundColor: 'transparent',
        pointRadius: 2,
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'CDX HY (bps)',
        data: market.map(m => m.cdx_hy_spread),
        borderColor: '#ff9944',
        backgroundColor: 'transparent',
        pointRadius: 2,
        tension: 0.1,
        yAxisID: 'y1',
      },
    ],
  }

  const cmbxOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: LEGEND_STYLE,
      title: {
        display: true,
        text: chartLabel,
        color: '#f0c040',
        font: { family: 'Courier New', size: 12, weight: 'bold' as const },
      },
      tooltip: {
        ...TOOLTIP_STYLE,
        callbacks: {
          title: (items: { label: string }[]) =>
            items.length ? `${chartLabel} · ${items[0].label}` : '',
        },
      },
    },
    scales: { x: AXIS_STYLE, y: AXIS_STYLE },
  }

  const spxOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: LEGEND_STYLE,
      title: { display: true, text: 'S&P 500', color: '#f0c040', font: { family: 'Courier New', size: 12, weight: 'bold' as const } },
      tooltip: TOOLTIP_STYLE,
    },
    scales: { x: AXIS_STYLE, y: AXIS_STYLE },
  }

  const hygOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: LEGEND_STYLE,
      title: { display: true, text: 'HYG / CDX HY', color: '#f0c040', font: { family: 'Courier New', size: 12, weight: 'bold' as const } },
      tooltip: TOOLTIP_STYLE,
    },
    scales: {
      x: AXIS_STYLE,
      y: { ...AXIS_STYLE, position: 'left' as const },
      y1: {
        position: 'right' as const,
        ticks: { color: '#555', font: CHART_FONT },
        grid: { drawOnChartArea: false, color: '#1a1a1a' },
      },
    },
  }

  // ── Shared table header style ────────────────────────────────────────────────
  const TH: React.CSSProperties = {
    padding: '4px 8px',
    borderBottom: '1px solid #1e1e1e',
    fontWeight: 700,
    color: '#ddd',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{
      background: '#0a0a0a', color: '#ccc',
      fontFamily: 'Courier New, monospace', fontSize: '13px',
      height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <span style={{ color: '#f0c040', fontSize: '14px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX HISTORY — CROSSPOINT CAPITAL
        </span>
      </div>

      <NavTabs active="history" isTrader={false} />

      {/* Range selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        {(['1W', '1M', '3M', '6M', '1Y', 'ALL'] as Range[]).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              background: range === r ? '#f0c040' : 'transparent',
              color: range === r ? '#000' : '#555',
              border: '1px solid ' + (range === r ? '#f0c040' : '#333'),
              fontFamily: 'Courier New, monospace',
              fontSize: '12px',
              padding: '2px 10px',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            {r}
          </button>
        ))}
        {!loading && (
          <span style={{ color: '#333', fontSize: '12px', marginLeft: '8px' }}>
            {snapRows.length} rows · {trades.length} trades
          </span>
        )}
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: Tables (60%) */}
        <div style={{ width: '60%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e1e1e', overflow: 'hidden' }}>

          {/* Daily Price History */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ padding: '5px 12px', color: '#f0c040', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', borderBottom: '1px solid #1e1e1e', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 2 }}>
              DAILY PRICE HISTORY
              <span style={{ color: '#333', marginLeft: '8px', fontWeight: 400 }}>click row to select chart tranche</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ position: 'sticky', top: '27px', background: '#0a0a0a', zIndex: 1 }}>
                  <th style={{ ...TH, textAlign: 'left', paddingLeft: '12px' }}>DATE</th>
                  <th style={{ ...TH, textAlign: 'left' }}>TRANCHE</th>
                  <th style={{ ...TH, textAlign: 'right' }}>BID</th>
                  <th style={{ ...TH, textAlign: 'right' }}>ASK</th>
                  <th style={{ ...TH, textAlign: 'right' }}>SPRD</th>
                  <th style={{ ...TH, textAlign: 'right' }}>TRD</th>
                  <th style={{ ...TH, textAlign: 'right', paddingRight: '12px' }}>AVG PX</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={7} style={{ padding: '20px', color: '#333', textAlign: 'center' }}>Loading…</td></tr>
                  : snapRows.length === 0
                  ? <tr><td colSpan={7} style={{ padding: '20px', color: '#333', textAlign: 'center' }}>No data for range</td></tr>
                  : snapRows.map(s => {
                    const key = `${s.series_number}:${s.tranche_name}`
                    const sel = key === selectedKey
                    const spread = s.best_bid != null && s.best_ask != null
                      ? (s.best_ask - s.best_bid).toFixed(1)
                      : '—'
                    return (
                      <tr
                        key={`${s.date}:${key}`}
                        onClick={() => setSelectedKey(key)}
                        style={{
                          cursor: 'pointer',
                          borderLeft: sel ? '2px solid #f0c040' : '2px solid transparent',
                          background: sel ? '#0d0d00' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '3px 8px 3px 10px', color: '#555', borderBottom: '1px solid #111' }}>{s.date}</td>
                        <td style={{ padding: '3px 8px', color: '#ccc', borderBottom: '1px solid #111' }}>
                          CMBX.{s.series_number}.{s.tranche_name}
                        </td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#fff', borderBottom: '1px solid #111' }}>{s.best_bid ?? '—'}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#fff', borderBottom: '1px solid #111' }}>{s.best_ask ?? '—'}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#666', borderBottom: '1px solid #111' }}>{spread}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#666', borderBottom: '1px solid #111' }}>{s.trade_count || '—'}</td>
                        <td style={{ padding: '3px 8px 3px 8px', textAlign: 'right', color: '#666', borderBottom: '1px solid #111', paddingRight: '12px' }}>
                          {s.avg_trade_px != null ? s.avg_trade_px.toFixed(2) : '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {/* Trade Log */}
          <div style={{ flex: 1, overflow: 'auto', borderTop: '1px solid #1e1e1e' }}>
            <div style={{ padding: '5px 12px', color: '#f0c040', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', borderBottom: '1px solid #1e1e1e', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 2 }}>
              TRADE LOG
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ position: 'sticky', top: '27px', background: '#0a0a0a', zIndex: 1 }}>
                  <th style={{ ...TH, textAlign: 'left', paddingLeft: '12px' }}>DATE</th>
                  <th style={{ ...TH, textAlign: 'left' }}>TIME</th>
                  <th style={{ ...TH, textAlign: 'left' }}>TRANCHE</th>
                  <th style={{ ...TH, textAlign: 'right' }}>PRICE</th>
                  <th style={{ ...TH, textAlign: 'right' }}>SIZE</th>
                  <th style={{ ...TH, textAlign: 'right' }}>SPX</th>
                  <th style={{ ...TH, textAlign: 'right', paddingRight: '12px' }}>CDX HY</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={7} style={{ padding: '20px', color: '#333', textAlign: 'center' }}>Loading…</td></tr>
                  : trades.length === 0
                  ? <tr><td colSpan={7} style={{ padding: '20px', color: '#333', textAlign: 'center' }}>No trades for range</td></tr>
                  : trades.map(t => {
                    const date = t.created_at.split('T')[0]
                    const mkt = mktByDate[date]
                    return (
                      <tr key={t.id}>
                        <td style={{ padding: '3px 8px 3px 10px', color: '#555', borderBottom: '1px solid #111' }}>{date}</td>
                        <td style={{ padding: '3px 8px', color: '#555', borderBottom: '1px solid #111' }}>{fmtTime(t.created_at)}</td>
                        <td style={{ padding: '3px 8px', color: '#ccc', borderBottom: '1px solid #111' }}>
                          CMBX.{t.series_number}.{t.tranche_name}
                        </td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#fff', borderBottom: '1px solid #111' }}>{t.price ?? '—'}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#666', borderBottom: '1px solid #111' }}>{t.trade_size ?? '—'}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#666', borderBottom: '1px solid #111' }}>
                          {mkt?.spx_close != null ? mkt.spx_close.toFixed(0) : '—'}
                        </td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#666', borderBottom: '1px solid #111', paddingRight: '12px' }}>
                          {mkt?.cdx_hy_spread != null ? mkt.cdx_hy_spread.toFixed(0) : '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Charts (40%) */}
        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', padding: '12px', gap: '12px', overflow: 'auto' }}>
          <div style={{ flex: 1, minHeight: '180px' }}>
            <Line data={cmbxData} options={cmbxOpts} />
          </div>
          <div style={{ flex: 1, minHeight: '180px' }}>
            <Line data={spxData} options={spxOpts} />
          </div>
          <div style={{ flex: 1, minHeight: '180px' }}>
            <Line data={hygData} options={hygOpts as any} />
          </div>
        </div>
      </div>
    </div>
  )
}
