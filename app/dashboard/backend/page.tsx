'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEALERS = ['MS', 'BOA', 'CITI', 'JPM', 'GS', 'UBS', 'BNP', 'DB', 'BARC']

const DEFAULT_SIZE: Record<string, number> = {
  AAA:   25,
  AS:     5,
  AA:     5,
  A:      5,
  'BBB-': 5,
  BB:     5,
}

const FACILITATION_FEE_PER_MM: Record<string, number> = {
  AAA:    75,
  AS:    115,
  AA:    115,
  A:     115,
  'BBB-':125,
  BB:    125,
}

const COUPON_BPS: Record<string, number> = {
  AAA:    50,
  AS:    100,
  AA:    150,
  A:     200,
  'BBB-':300,
  BB:    500,
}

const MATURITY_DATE: Record<string, string> = {
  '6':  'February 17, 2047',
  '7':  'September 17, 2047',
  '8':  'October 17, 2057',
  '9':  'September 17, 2058',
  '10': 'November 17, 2059',
  '11': 'November 17, 2059',
  '12': 'August 17, 2061',
  '13': 'December 17, 2072',
  '14': 'September 17, 2062',
  '15': 'November 17, 2064',
  '16': 'November 17, 2065',
  '17': 'January 17, 2066',
  '18': 'January 17, 2067',
  '19': 'December 17, 2072',
}

const DEALER_INFO: Record<string, { legal: string; address: string; phone?: string; email: string }> = {
  MS: {
    legal: 'Morgan Stanley Co. International PLC',
    address: '1300 Thames Street, Thames Street Wharf, 3rd Floor\nBaltimore, MD 21231',
    email: 'spgagency@morganstanley.com; spgderivta@morganstanley.com',
  },
  BOA: {
    legal: 'BofA Securities, Inc.',
    address: '1 Bryant Park\nNew York, NY 10036',
    email: 'cmbs.trading@bofa.com',
  },
  CITI: {
    legal: 'Citigroup Global Markets Inc.',
    address: '390 Greenwich St., 4th Floor\nNew York, NY 10013',
    phone: '(212) 723-6156',
    email: 'fi.us.cmbs.trading@citi.com',
  },
  JPM: {
    legal: 'J.P. Morgan Securities LLC',
    address: '383 Madison Avenue\nNew York, NY 10179',
    email: 'jpm.cmbx.trading@jpmorgan.com',
  },
  GS: {
    legal: 'Goldman Sachs & Co. LLC',
    address: '200 West Street\nNew York, NY 10282',
    email: 'cmbx-desk@gs.com',
  },
  UBS: {
    legal: 'UBS Securities LLC',
    address: '1285 Avenue of the Americas\nNew York, NY 10019',
    email: 'cmbx.trading@ubs.com',
  },
  BNP: {
    legal: 'BNP Paribas Securities Corp.',
    address: '787 Seventh Avenue\nNew York, NY 10019',
    email: 'cmbx.desk@bnpparibas.com',
  },
  DB: {
    legal: 'Deutsche Bank Securities Inc.',
    address: '60 Wall Street\nNew York, NY 10005',
    email: 'cmbx.trading@db.com',
  },
  BARC: {
    legal: 'Barclays Capital Inc.',
    address: '745 Seventh Avenue\nNew York, NY 10019',
    email: 'cmbx.trading@barclays.com',
  },
}

const DEALER_INACTIVE: Record<string, { bg: string; border: string; color: string }> = {
  MS:   { bg: '#cc3333', border: '#ff6666', color: '#ffe0e0' },
  BOA:  { bg: '#228822', border: '#55cc55', color: '#e0ffe0' },
  CITI: { bg: '#882299', border: '#bb55cc', color: '#f0e0ff' },
  JPM:  { bg: '#1155bb', border: '#4488ee', color: '#ddeeff' },
  GS:   { bg: '#997700', border: '#ccaa00', color: '#fff0cc' },
  UBS:  { bg: '#992255', border: '#cc4488', color: '#ffe0ee' },
  BNP:  { bg: '#333399', border: '#6666cc', color: '#e0e0ff' },
  DB:   { bg: '#116688', border: '#2299bb', color: '#cceeff' },
  BARC: { bg: '#884400', border: '#bb6622', color: '#ffe8cc' },
}

const DEALER_SELECTED: Record<string, { bg: string; outline: string; color: string }> = {
  MS:   { bg: '#ff5555', outline: '#ff5555', color: '#fff' },
  BOA:  { bg: '#44dd44', outline: '#44dd44', color: '#fff' },
  CITI: { bg: '#bb55ee', outline: '#bb55ee', color: '#fff' },
  JPM:  { bg: '#3388ff', outline: '#3388ff', color: '#fff' },
  GS:   { bg: '#eebb00', outline: '#eebb00', color: '#fff' },
  UBS:  { bg: '#ee4499', outline: '#ee4499', color: '#fff' },
  BNP:  { bg: '#6666ff', outline: '#6666ff', color: '#fff' },
  DB:   { bg: '#11aacc', outline: '#11aacc', color: '#fff' },
  BARC: { bg: '#dd7722', outline: '#dd7722', color: '#fff' },
}

const DEALER_TAG: Record<string, { color: string; bg: string }> = Object.fromEntries(
  Object.entries(DEALER_INACTIVE).map(([k, v]) => [k, { color: v.color, bg: v.bg }])
)

type EditField = 'bid' | 'ask' | 'bid_size' | 'ask_size'

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

interface TradeLog {
  time: string
  action: 'HIT' | 'LIFT'
  series: string
  tranche: string
  dealer: string
  passive_dealer: string | null
  price: number | null
}

interface BlotterTrade {
  id: string
  time: string
  action: 'HIT' | 'LIFT'
  series: string
  tranche: string
  dealer: string
  passive_dealer: string | null
  trade_size: number | null
  price: number | null
}

function fmtTime(ts: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ts))
}

function nowET() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date())
}

const inputStyle: React.CSSProperties = {
  background: '#1a1a00',
  border: '1px solid #f0c040',
  color: '#fff',
  fontFamily: 'Courier New, monospace',
  fontSize: '15px',
  width: '55px',
  outline: 'none',
  padding: '1px 3px',
}

async function handleSignOut() {
  await supabase.auth.signOut()
  window.location.href = '/login'
}

export default function BackendPage() {
  const [authChecked, setAuthChecked] = useState(false)
  const [clock, setClock] = useState('')
  const [agentOnline, setAgentOnline] = useState(false)
  const [series, setSeries] = useState<SeriesConfig[]>([])
  const [tranches, setTranches] = useState<TrancheConfig[]>([])
  const [prices, setPrices] = useState<Record<string, Price>>({})
  const [selectedDealer, setSelectedDealer] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ key: string; field: EditField } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [flashRows, setFlashRows] = useState<Record<string, 'red' | 'green'>>({})
  const [hitShake, setHitShake] = useState(false)
  const [liftShake, setLiftShake] = useState(false)
  const [cellError, setCellError] = useState('')
  const [tradeLog, setTradeLog] = useState<TradeLog | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ key: string; field: EditField } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(new Set())
  const defaultsApplied = useRef(false)
  const [showBlotter, setShowBlotter] = useState(false)
  const [blotterTrades, setBlotterTrades] = useState<BlotterTrade[]>([])
  const [confirmTrade, setConfirmTrade] = useState<BlotterTrade | null>(null)
  const [confirmUpfront, setConfirmUpfront] = useState('')

  function toggleCollapse(seriesNum: string) {
    setCollapsedSeries(prev => {
      const next = new Set(prev)
      if (next.has(seriesNum)) next.delete(seriesNum)
      else next.add(seriesNum)
      return next
    })
  }

  const selectedDealerRef = useRef(selectedDealer)
  const selectedRowRef = useRef(selectedRow)
  selectedDealerRef.current = selectedDealer
  selectedRowRef.current = selectedRow

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (!prof || prof.role !== 'trader') {
        window.location.href = '/dashboard/market'
        return
      }
      setAuthChecked(true)
    }
    checkAuth()
  }, [])

  useEffect(() => {
    const tick = () => setClock(nowET())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!authChecked) return
    let cancelled = false

    const ch = supabase
      .channel(`backend-${Math.random().toString(36).slice(2)}`)
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
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const t = payload.new as { id: string; series_number: string; tranche_name: string; side: string; price: number | null; dealer: string; created_at: string }
        const key = `${t.series_number}:${t.tranche_name}`
        flashRowEffect(key, t.side === 'hit' ? 'red' : 'green')
        const entry: BlotterTrade = {
          id: t.id,
          time: fmtTime(t.created_at),
          action: t.side === 'hit' ? 'HIT' : 'LIFT',
          series: t.series_number,
          tranche: t.tranche_name,
          dealer: t.dealer,
          passive_dealer: t.passive_dealer ?? null,
          trade_size: t.trade_size ?? null,
          price: t.price,
        }
        setTradeLog({ time: entry.time, action: entry.action, series: entry.series, tranche: entry.tranche, dealer: entry.dealer, passive_dealer: entry.passive_dealer, price: entry.price })
        setBlotterTrades(prev => [entry, ...prev])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_heartbeat' }, (payload) => {
        const hb = payload.new as { bbg_connected?: boolean; active?: boolean }
        setAgentOnline(hb.bbg_connected ?? hb.active ?? false)
      })
      .subscribe()

    async function loadData() {
      const [{ data: sd }, { data: td }, { data: pd }, { data: hb }, { data: tr }] = await Promise.all([
        supabase.from('series_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('tranche_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('prices').select('*'),
        supabase.from('agent_heartbeat').select('*').limit(1).single(),
        supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(200),
      ])
      if (cancelled) return
      if (sd) {
        setSeries(sd)
        if (!defaultsApplied.current) {
          setCollapsedSeries(new Set(sd.map((s: SeriesConfig) => s.series_number)))
          defaultsApplied.current = true
        }
      }
      if (td) setTranches(td)
      if (tr) {
        setBlotterTrades(tr.map((t: any) => ({
          id: t.id,
          time: fmtTime(t.created_at),
          action: t.side === 'hit' ? 'HIT' : 'LIFT',
          series: t.series_number,
          tranche: t.tranche_name,
          dealer: t.dealer,
          passive_dealer: t.passive_dealer ?? null,
          trade_size: t.trade_size ?? null,
          price: t.price,
        })))
      }
      if (pd) {
        const map: Record<string, Price> = {}
        for (const p of pd) map[`${p.series_number}:${p.tranche_name}`] = p
        setPrices(map)
      }
      if (hb) setAgentOnline((hb as { bbg_connected?: boolean; active?: boolean }).bbg_connected ?? (hb as { bbg_connected?: boolean; active?: boolean }).active ?? false)
    }

    loadData()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [authChecked])

  function flashRowEffect(key: string, color: 'red' | 'green') {
    setFlashRows(prev => ({ ...prev, [key]: color }))
    setTimeout(() => {
      setFlashRows(prev => { const n = { ...prev }; delete n[key]; return n })
    }, 20000)
  }

  function handleDealerClick(code: string) {
    setSelectedDealer(prev => prev === code ? null : code)
  }

  async function commitCell(key: string, field: EditField, value: string) {
    const [seriesNum, trancheName] = key.split(':')
    const dealer = selectedDealerRef.current
    const existing = prices[key]
    const update: Record<string, unknown> = {
      series_number: seriesNum,
      tranche_name: trancheName,
      mode: value.trimStart().startsWith('$') ? 'price' : 'spread',
      [field]: value === '' ? null : parseFloat(value.replace(/^\$/, '')) || value.replace(/^\$/, '') || null,
    }
    if (field === 'bid' && dealer) update.bid_dealer = dealer
    if (field === 'ask' && dealer) update.ask_dealer = dealer

    // Auto-fill default size if entering a price and size is currently empty
    const defSize = DEFAULT_SIZE[trancheName] ?? 5
    if (field === 'bid' && value !== '' && existing?.bid_size == null) update.bid_size = defSize
    if (field === 'ask' && value !== '' && existing?.ask_size == null) update.ask_size = defSize

    await supabase.from('prices').upsert(update, { onConflict: 'series_number,tranche_name' })
    setEditingCell(null)
  }

  async function deleteTrade(id: string) {
    await supabase.from('trades').delete().eq('id', id)
    setBlotterTrades(prev => prev.filter(t => t.id !== id))
  }

  async function clearAllPrices() {
    await supabase.from('prices').update({
      bid: null, ask: null,
      bid_size: null, ask_size: null,
      bid_dealer: null, ask_dealer: null,
      last_trade_px: null, last_trade_time: null,
    }).neq('series_number', '')
    setPrices({})
    setTradeLog(null)
    setSelectedRow(null)
    setConfirmClear(false)
  }

  function showError(msg: string) {
    setCellError(msg)
    setTimeout(() => setCellError(''), 3000)
  }

  async function executeHit() {
    const dealer = selectedDealerRef.current
    const rowKey = selectedRowRef.current
    if (!dealer) { setHitShake(true); setTimeout(() => setHitShake(false), 500); showError('Select a counterparty first'); return }
    if (!rowKey) { setHitShake(true); setTimeout(() => setHitShake(false), 500); showError('Select a row first'); return }
    const [seriesNum, trancheName] = rowKey.split(':')
    const px = prices[rowKey]?.bid ?? null
    const passiveDealer = prices[rowKey]?.bid_dealer ?? null
    const sz = prices[rowKey]?.bid_size ?? null
    if (px == null) { setHitShake(true); setTimeout(() => setHitShake(false), 500); showError('No bid posted on this tranche'); return }
    if (dealer === passiveDealer) { setHitShake(true); setTimeout(() => setHitShake(false), 500); showError(`${dealer} cannot hit their own price`); return }
    await supabase.from('trades').insert({ series_number: seriesNum, tranche_name: trancheName, side: 'hit', price: px, dealer, passive_dealer: passiveDealer, trade_size: sz })
    await supabase.from('prices').upsert({ series_number: seriesNum, tranche_name: trancheName, last_trade_px: px, last_trade_time: new Date().toISOString() }, { onConflict: 'series_number,tranche_name' })
    flashRowEffect(rowKey, 'red')
  }

  async function executeLift() {
    const dealer = selectedDealerRef.current
    const rowKey = selectedRowRef.current
    if (!dealer) { setLiftShake(true); setTimeout(() => setLiftShake(false), 500); showError('Select a counterparty first'); return }
    if (!rowKey) { setLiftShake(true); setTimeout(() => setLiftShake(false), 500); showError('Select a row first'); return }
    const [seriesNum, trancheName] = rowKey.split(':')
    const px = prices[rowKey]?.ask ?? null
    const passiveDealer = prices[rowKey]?.ask_dealer ?? null
    const sz = prices[rowKey]?.ask_size ?? null
    if (px == null) { setLiftShake(true); setTimeout(() => setLiftShake(false), 500); showError('No offer posted on this tranche'); return }
    if (dealer === passiveDealer) { setLiftShake(true); setTimeout(() => setLiftShake(false), 500); showError(`${dealer} cannot lift their own price`); return }
    await supabase.from('trades').insert({ series_number: seriesNum, tranche_name: trancheName, side: 'lift', price: px, dealer, passive_dealer: passiveDealer, trade_size: sz })
    await supabase.from('prices').upsert({ series_number: seriesNum, tranche_name: trancheName, last_trade_px: px, last_trade_time: new Date().toISOString() }, { onConflict: 'series_number,tranche_name' })
    flashRowEffect(rowKey, 'green')
  }

  function renderEditCell(key: string, field: EditField, displayValue: React.ReactNode, tdStyle: React.CSSProperties) {
    const isEditing = editingCell?.key === key && editingCell.field === field
    const isHovered = hoveredCell?.key === key && hoveredCell.field === field
    const price = prices[key]
    const rawVal = field === 'bid' ? price?.bid : field === 'ask' ? price?.ask : field === 'bid_size' ? price?.bid_size : price?.ask_size
    const isEmpty = rawVal == null

    const cellBg = isEditing ? '#1a1a00' : isHovered ? '#141408' : 'transparent'
    const cellBorder = isEditing
      ? '1px solid #f0c040'
      : isHovered
      ? '1px solid #555500'
      : '1px solid transparent'

    return (
      <td
        style={{ ...tdStyle, cursor: 'text', background: cellBg, border: cellBorder, position: 'relative' }}
        onClick={e => {
          e.stopPropagation()
          if ((field === 'bid' || field === 'ask') && !selectedDealer) {
            showError('Select a dealer before entering a price')
            return
          }
          setEditingCell({ key, field })
          setEditValue(rawVal != null ? String(rawVal) : '')
        }}
        onMouseEnter={() => setHoveredCell({ key, field })}
        onMouseLeave={() => setHoveredCell(null)}
      >
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCell(key, field, editValue)
              if (e.key === 'Escape') setEditingCell(null)
            }}
            onBlur={() => setEditingCell(null)}
            style={inputStyle}
          />
        ) : isEmpty && isHovered ? (
          <span style={{ color: '#555', fontStyle: 'italic', fontSize: '15px' }}>type...</span>
        ) : displayValue}
      </td>
    )
  }

  if (!authChecked) {
    return (
      <div style={{ background: '#0a0a0a', color: '#444', fontFamily: 'Courier New, monospace', fontSize: '15px', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        AUTHENTICATING...
      </div>
    )
  }

  return (
    <div style={{ background: '#0a0a0a', color: '#ccc', fontFamily: 'Courier New, monospace', fontSize: '15px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-4px)}
          40%{transform:translateX(4px)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }
      `}</style>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <span style={{ color: '#f0c040', fontSize: '15px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX CONTRIBUTOR — CROSSPOINT CAPITAL
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#444', fontSize: '15px' }}>{clock}</span>
          <span style={{
            background: '#1a1200',
            color: '#f0c040',
            border: '1px solid #f0c040',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '2px',
            padding: '1px 8px',
            borderRadius: '2px',
          }}>
            ADMIN
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: agentOnline ? '#66ff88' : '#444', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: '#555', fontSize: '13px' }}>AGENT</span>
          </span>
          <a href="/dashboard/market" style={{ color: '#555', fontSize: '15px', border: '1px solid #2a2a2a', padding: '2px 8px', textDecoration: 'none', borderRadius: '2px' }}>
            MARKET
          </a>
          <button
            onClick={handleSignOut}
            style={{
              background: 'transparent',
              color: '#555',
              border: '1px solid #2a2a2a',
              padding: '2px 8px',
              fontSize: '15px',
              fontFamily: 'Courier New, monospace',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            SIGN OUT
          </button>
          <button
            onClick={() => setShowBlotter(p => !p)}
            style={{
              background: showBlotter ? '#1a1500' : 'transparent',
              color: showBlotter ? '#f0c040' : '#555',
              border: `1px solid ${showBlotter ? '#f0c040' : '#2a2a2a'}`,
              padding: '2px 8px',
              fontSize: '15px',
              fontFamily: 'Courier New, monospace',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            BLOTTER
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <NavTabs active="admin" isTrader={true} />

      {/* Dealer buttons */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 12px', gap: '4px', borderBottom: '1px solid #1e1e1e', flexShrink: 0, flexWrap: 'wrap' }}>
        {DEALERS.map(code => (
          <button
            key={code}
            onClick={() => handleDealerClick(code)}
            style={selectedDealer === code ? {
              background: DEALER_SELECTED[code]?.bg,
              color: DEALER_SELECTED[code]?.color ?? '#fff',
              border: '1px solid #fff',
              outline: `2px solid ${DEALER_SELECTED[code]?.outline}`,
              padding: '4px 14px',
              fontSize: '15px',
              fontFamily: 'Courier New, monospace',
              fontWeight: 500,
              borderRadius: '2px',
              cursor: 'pointer',
            } : {
              background: DEALER_INACTIVE[code]?.bg,
              color: DEALER_INACTIVE[code]?.color,
              border: `1px solid ${DEALER_INACTIVE[code]?.border}`,
              padding: '4px 14px',
              fontSize: '15px',
              fontFamily: 'Courier New, monospace',
              fontWeight: 500,
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            {code}
          </button>
        ))}
        <span style={{ marginLeft: '10px', fontSize: '15px', color: selectedDealer ? '#f0c040' : '#444' }}>
          {selectedDealer ? `SELECTED: ${selectedDealer}` : '— no counterparty selected'}
        </span>
        {cellError && (
          <span style={{ marginLeft: '12px', color: '#ff4444', fontSize: '15px' }}>{cellError}</span>
        )}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 12px', gap: '6px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <button
          onClick={executeHit}
          style={{
            background: '#3a0000', color: '#ff6666', border: '1px solid #aa3333',
            padding: '3px 14px', fontSize: '15px', fontFamily: 'Courier New, monospace',
            borderRadius: '2px', cursor: 'pointer', fontWeight: 700,
            animation: hitShake ? 'shake 0.5s ease' : 'none',
          }}
        >
          HIT
        </button>
        <button
          onClick={executeLift}
          style={{
            background: '#003a00', color: '#66ff88', border: '1px solid #338833',
            padding: '3px 14px', fontSize: '15px', fontFamily: 'Courier New, monospace',
            borderRadius: '2px', cursor: 'pointer', fontWeight: 700,
            animation: liftShake ? 'shake 0.5s ease' : 'none',
          }}
        >
          LIFT
        </button>
        <span style={{ color: '#444', fontSize: '13px', marginLeft: '10px' }}>
          type <span style={{ color: '#888' }}>$85.50</span> for price · <span style={{ color: '#888' }}>285</span> for spread
        </span>
        <span style={{ color: '#333', fontSize: '15px', marginLeft: 'auto', paddingRight: '2px' }}>
          hover a BID / ASK / SIZE cell → click → type → Enter to save
        </span>

        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            style={{
              background: 'transparent', color: '#444', border: '1px solid #2a2a2a',
              padding: '3px 12px', fontSize: '15px', fontFamily: 'Courier New, monospace',
              borderRadius: '2px', cursor: 'pointer', marginLeft: '8px',
            }}
          >
            CLEAR ALL
          </button>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            <span style={{ color: '#ff4444', fontSize: '15px' }}>clear all prices?</span>
            <button
              onClick={clearAllPrices}
              style={{
                background: '#3a0000', color: '#ff6666', border: '1px solid #aa3333',
                padding: '3px 12px', fontSize: '15px', fontFamily: 'Courier New, monospace',
                borderRadius: '2px', cursor: 'pointer', fontWeight: 700,
              }}
            >
              YES
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              style={{
                background: '#111', color: '#555', border: '1px solid #2a2a2a',
                padding: '3px 12px', fontSize: '15px', fontFamily: 'Courier New, monospace',
                borderRadius: '2px', cursor: 'pointer',
              }}
            >
              NO
            </button>
          </span>
        )}
      </div>

      {/* Grid + Blotter */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
          <thead>
            <tr style={{ color: '#ffffff', fontSize: '15px', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
              <th style={{ textAlign: 'left', padding: '6px 8px 6px 12px', borderBottom: '1px solid #1e1e1e', width: '160px', fontWeight: 700 }}>TRANCHE</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 700 }}>SIZE</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '2px solid #66ff88', minWidth: '100px', fontWeight: 700 }}>BID</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '2px solid #ff6666', minWidth: '100px', fontWeight: 700 }}>OFFER</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 700 }}>SIZE</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '120px', fontWeight: 700 }}>LST TRADE PX</th>
              <th style={{ textAlign: 'right', padding: '5px 12px 5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '50px', fontWeight: 700 }}>CHG</th>
            </tr>
          </thead>
          <tbody>
            {series.map(s => {
              const isCollapsed = collapsedSeries.has(s.series_number)
              const liveCount = tranches.filter(t => {
                const p = prices[`${s.series_number}:${t.tranche_name}`]
                return p?.bid != null || p?.ask != null
              }).length
              return (
              <Fragment key={s.series_number}>
                <tr onClick={() => toggleCollapse(s.series_number)} style={{ cursor: 'pointer' }}>
                  <td
                    colSpan={7}
                    style={{
                      padding: '8px 12px 5px 10px',
                      color: '#f0c040',
                      background: '#0e0e0e',
                      fontSize: '15px',
                      fontWeight: 600,
                      letterSpacing: '1px',
                      borderBottom: '1px solid #1e1e1e',
                      borderTop: '1px solid #1a1a1a',
                      borderLeft: '2px solid #f0c040',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span>
                        <span style={{ fontSize: '11px', marginRight: '8px', color: '#f0c040' }}>{isCollapsed ? '▶' : '▼'}</span>
                        CMBX.{s.series_number}
                      </span>
                      <span style={{ color: '#555', fontSize: '10px', fontWeight: 400, letterSpacing: '0px' }}>
                        {liveCount} live prices
                      </span>
                    </div>
                  </td>
                </tr>
                {tranches.filter(t => {
                  if (!isCollapsed) return true
                  const p = prices[`${s.series_number}:${t.tranche_name}`]
                  return p?.bid != null || p?.ask != null
                }).map((t, tIdx) => {
                  const rowKey = `${s.series_number}:${t.tranche_name}`
                  const price = prices[rowKey]
                  const isActive = selectedRow === rowKey
                  const flash = flashRows[rowKey]
                  const isOdd = tIdx % 2 === 1

                  let rowBg = isActive ? '#1a1500' : isOdd ? '#0d0d0d' : 'transparent'
                  if (flash === 'red') rowBg = '#3a0000'
                  if (flash === 'green') rowBg = '#003a00'

                  const bidTag = price?.bid_dealer && DEALER_TAG[price.bid_dealer] ? DEALER_TAG[price.bid_dealer] : null
                  const askTag = price?.ask_dealer && DEALER_TAG[price.ask_dealer] ? DEALER_TAG[price.ask_dealer] : null

                  const bidCell = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                      <span style={{ color: price?.bid != null ? '#ffffff' : '#2a2a2a' }}>
                        {price?.bid != null ? (price.mode === 'price' ? `$${price.bid}` : String(price.bid)) : '—'}
                      </span>
                      {price?.bid != null && bidTag && (
                        <span style={{ background: bidTag.bg, color: bidTag.color, fontSize: '15px', padding: '0 3px', borderRadius: '2px', fontWeight: 600 }}>
                          {price.bid_dealer}
                        </span>
                      )}
                    </span>
                  )

                  const askCell = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                      <span style={{ color: price?.ask != null ? '#ffffff' : '#2a2a2a' }}>
                        {price?.ask != null ? (price.mode === 'price' ? `$${price.ask}` : String(price.ask)) : '—'}
                      </span>
                      {price?.ask != null && askTag && (
                        <span style={{ background: askTag.bg, color: askTag.color, fontSize: '15px', padding: '0 3px', borderRadius: '2px', fontWeight: 600 }}>
                          {price.ask_dealer}
                        </span>
                      )}
                    </span>
                  )

                  const bszCell = <span style={{ color: price?.bid_size != null ? '#aaaaaa' : '#2a2a2a' }}>{price?.bid_size != null ? String(price.bid_size) : '—'}</span>
                  const aszCell = <span style={{ color: price?.ask_size != null ? '#aaaaaa' : '#2a2a2a' }}>{price?.ask_size != null ? String(price.ask_size) : '—'}</span>

                  return (
                    <tr
                      key={rowKey}
                      onClick={() => setSelectedRow(prev => prev === rowKey ? null : rowKey)}
                      style={{ background: rowBg, borderBottom: '1px solid #161616', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '6px 8px 6px 12px', color: '#ffffff', whiteSpace: 'nowrap', width: '160px' }}>
                        CMBX.{s.series_number}.{t.tranche_name}
                      </td>
                      {renderEditCell(rowKey, 'bid_size', bszCell, { textAlign: 'right', padding: '6px 8px' })}
                      {renderEditCell(rowKey, 'bid', bidCell, { textAlign: 'right', padding: '6px 10px', borderLeft: '2px solid #1a3a1a' })}
                      {renderEditCell(rowKey, 'ask', askCell, { textAlign: 'right', padding: '6px 10px', borderLeft: '2px solid #3a1a1a' })}
                      {renderEditCell(rowKey, 'ask_size', aszCell, { textAlign: 'right', padding: '6px 8px' })}
                      <td style={{ textAlign: 'right', padding: '6px 10px' }}>
                        {price?.last_trade_px != null ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                            <span style={{ color: '#888' }}>{String(price.last_trade_px)}</span>
                            {price.last_trade_time && (
                              <span style={{ color: '#444', fontSize: '10px' }}>{fmtTime(price.last_trade_time)}</span>
                            )}
                          </div>
                        ) : <span style={{ color: '#2a2a2a' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 12px 6px 8px', color: '#2a2a2a' }}>—</td>
                    </tr>
                  )
                })}
              </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Blotter panel */}
      {showBlotter && (
        <div style={{ width: '300px', borderLeft: '1px solid #1e1e1e', background: '#080808', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e1e1e', color: '#f0c040', fontSize: '13px', letterSpacing: '2px', fontWeight: 700, flexShrink: 0 }}>
            TRADE BLOTTER
            <span style={{ color: '#444', fontSize: '11px', fontWeight: 400, marginLeft: '8px' }}>{blotterTrades.length} trades</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {blotterTrades.length === 0 ? (
              <div style={{ padding: '16px 12px', color: '#2a2a2a', fontSize: '13px' }}>— no trades yet</div>
            ) : (
              blotterTrades.map((t, i) => (
                <div key={t.id} style={{ padding: '6px 12px', borderBottom: '1px solid #111', background: i % 2 === 0 ? '#080808' : '#0a0a0a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ color: t.action === 'HIT' ? '#ff6666' : '#66ff88', fontWeight: 700, fontSize: '13px' }}>{t.action}</span>
                    <span style={{ color: '#444', fontSize: '11px' }}>{t.time}</span>
                  </div>
                  <div style={{ color: '#ccc', fontSize: '13px' }}>CMBX.{t.series}.{t.tranche}</div>
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                      <span style={{ color: '#66ff88', fontWeight: 700 }}>
                        {t.action === 'LIFT' ? t.dealer : (t.passive_dealer ?? '?')}
                      </span>
                      <span style={{ color: '#444', fontSize: '10px' }}>buys</span>
                      <span style={{ color: '#555' }}>↔</span>
                      <span style={{ color: '#444', fontSize: '10px' }}>sells</span>
                      <span style={{ color: '#ff6666', fontWeight: 700 }}>
                        {t.action === 'LIFT' ? (t.passive_dealer ?? '?') : t.dealer}
                      </span>
                      <span style={{ marginLeft: 'auto', color: '#888', fontSize: '12px' }}>@ {t.price ?? '—'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
                    <button
                      onClick={() => { setConfirmTrade(t); setConfirmUpfront('') }}
                      style={{ flex: 1, background: '#0f0f00', color: '#f0c040', border: '1px solid #333300', padding: '2px 0', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: 'pointer', letterSpacing: '1px', borderRadius: '2px' }}
                    >
                      VIEW CONFIRM
                    </button>
                    <button
                      onClick={() => deleteTrade(t.id)}
                      title="Delete trade"
                      style={{ background: '#1a0000', color: '#663333', border: '1px solid #330000', padding: '2px 8px', fontSize: '13px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      </div>

      {/* Confirmation Modal */}
      {confirmTrade && (() => {
        const t = confirmTrade
        const tradeDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' })
        const coupon = COUPON_BPS[t.tranche] ?? 0
        const couponPct = (coupon / 100).toFixed(2)
        const notional = t.trade_size ? t.trade_size * 1_000_000 : null
        const notionalFmt = notional ? `$${notional.toLocaleString()}` : '—'
        const maturity = MATURITY_DATE[t.series] ?? '—'
        const index = `CMBX.NA.${t.tranche}.${t.series}`
        const feePerMM = FACILITATION_FEE_PER_MM[t.tranche] ?? 115
        const facFee = notional ? `$${(notional / 1_000_000 * feePerMM).toLocaleString()}` : '—'

        // LIFT: dealer lifts offer → dealer buys risk; passive (offerer) sells risk
        // HIT:  dealer hits bid   → dealer sells risk; passive (bidder) buys risk
        const riskBuyerCode  = t.action === 'LIFT' ? t.dealer : (t.passive_dealer ?? '—')
        const riskSellerCode = t.action === 'LIFT' ? (t.passive_dealer ?? '—') : t.dealer
        const riskBuyerInfo  = DEALER_INFO[riskBuyerCode]
        const riskSellerInfo = DEALER_INFO[riskSellerCode]

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px' }}>
            <div id="confirm-doc" style={{ background: '#fff', width: '750px', padding: '48px 56px', fontFamily: 'Georgia, serif', fontSize: '13px', color: '#222', lineHeight: '1.6', flexShrink: 0 }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <div style={{ color: '#2255aa', fontSize: '14px', marginBottom: '2px' }}>CMBX Trade Confirmation</div>
                  <div style={{ color: '#2255aa', fontSize: '14px' }}>Trade Date: {tradeDate}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-1px', color: '#111' }}>CROSS<span style={{ color: '#e03020' }}>✕</span>POINT</div>
                  <div style={{ fontSize: '11px', color: '#888', letterSpacing: '2px' }}>C A P I T A L</div>
                </div>
              </div>

              <hr style={{ borderColor: '#ccc', marginBottom: '16px' }} />

              {/* Parties */}
              <div style={{ color: '#2255aa', fontSize: '13px', marginBottom: '10px' }}>Parties to the Transaction:</div>
              <div style={{ marginLeft: '16px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px dashed #eee' }}>
                  <span style={{ fontWeight: 700, color: '#1a6622' }}>● BUYER OF RISK ({riskBuyerCode}):</span><br />
                  <span style={{ fontWeight: 700 }}>{riskBuyerInfo?.legal ?? riskBuyerCode}</span><br />
                  {riskBuyerInfo?.address.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}
                  {riskBuyerInfo?.phone && <span>Phone: {riskBuyerInfo.phone}<br /></span>}
                  {riskBuyerInfo && <span>Email: {riskBuyerInfo.email}</span>}
                </div>
                <div>
                  <span style={{ fontWeight: 700, color: '#881111' }}>● SELLER OF RISK ({riskSellerCode}):</span><br />
                  <span style={{ fontWeight: 700 }}>{riskSellerInfo?.legal ?? riskSellerCode}</span><br />
                  {riskSellerInfo?.address.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}
                  {riskSellerInfo?.phone && <span>Phone: {riskSellerInfo.phone}<br /></span>}
                  {riskSellerInfo && <span>Email: {riskSellerInfo.email}</span>}
                </div>
              </div>

              <hr style={{ borderColor: '#ccc', marginBottom: '16px' }} />

              {/* Trade Details */}
              <div style={{ color: '#2255aa', fontSize: '13px', marginBottom: '10px' }}>Trade Details:</div>
              <div style={{ marginLeft: '16px', marginBottom: '16px' }}>
                <div>● <strong>Index:</strong> {index}</div>
                <div>● <strong>Notional Amount:</strong> {notionalFmt}</div>
                <div>● <strong>Price:</strong> {t.price ?? '—'}</div>
                <div>● <strong>Strike/Coupon:</strong> {coupon} basis points ({couponPct}%)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ● <strong>Upfront Fee:</strong>
                  <input
                    className="no-print"
                    value={confirmUpfront}
                    onChange={e => setConfirmUpfront(e.target.value)}
                    placeholder="enter PV..."
                    style={{ border: '1px solid #aaa', padding: '1px 6px', fontSize: '13px', fontFamily: 'Georgia, serif', width: '140px', color: '#222' }}
                  />
                  {confirmUpfront && <span className="print-only" style={{ display: 'none' }}>{confirmUpfront}</span>}
                  <span style={{ fontSize: '11px', color: '#aaa' }} className="no-print">(enter before printing)</span>
                </div>
                <div>● <strong>Upfront Fee Payable to:</strong> {t.price != null && t.price > 100 ? riskBuyerInfo?.legal ?? riskBuyerCode : riskSellerInfo?.legal ?? riskSellerCode}</div>
              </div>

              <hr style={{ borderColor: '#ccc', marginBottom: '16px' }} />

              <div style={{ color: '#2255aa', fontSize: '13px', marginBottom: '10px' }}>Trade Type:</div>
              <div style={{ marginLeft: '16px', marginBottom: '16px' }}>● Credit Default Swap (CDS)</div>

              <hr style={{ borderColor: '#ccc', marginBottom: '16px' }} />

              <div style={{ color: '#2255aa', fontSize: '13px', marginBottom: '10px' }}>Effective Date:</div>
              <div style={{ marginLeft: '16px', marginBottom: '16px' }}>● {tradeDate}</div>

              <hr style={{ borderColor: '#ccc', marginBottom: '16px' }} />

              <div style={{ color: '#2255aa', fontSize: '13px', marginBottom: '10px' }}>Maturity Date:</div>
              <div style={{ marginLeft: '16px', marginBottom: '16px' }}>● {maturity}</div>

              <hr style={{ borderColor: '#ccc', marginBottom: '16px' }} />

              <div style={{ color: '#2255aa', fontSize: '13px', marginBottom: '10px' }}>Reference Obligation:</div>
              <div style={{ marginLeft: '16px', marginBottom: '16px' }}>● {index}</div>

              <hr style={{ borderColor: '#ccc', marginBottom: '16px' }} />

              <div style={{ color: '#2255aa', fontSize: '13px', marginBottom: '10px' }}>Facilitation Fee:</div>
              <div style={{ marginLeft: '16px', marginBottom: '16px' }}>● Charged by Crosspoint Capital: {facFee}</div>

              <hr style={{ borderColor: '#ccc', marginBottom: '16px' }} />

              <div style={{ fontSize: '12px', color: '#444', marginBottom: '24px' }}>
                This document serves as an official confirmation of the terms agreed upon between <strong>{riskBuyerInfo?.legal ?? riskBuyerCode}</strong> (as the Buyer of Risk) and <strong>{riskSellerInfo?.legal ?? riskSellerCode}</strong> (as the Seller of Risk) for the {index} tranche trade executed on <strong>{tradeDate}</strong>. All terms are subject to the provisions of the ISDA Master Agreement and related confirmations executed between the parties.
              </div>

              {/* Buttons */}
              <div className="no-print" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ background: '#2255aa', color: '#fff', border: 'none', padding: '8px 24px', fontSize: '13px', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: '1px' }}
                >
                  PRINT / SAVE PDF
                </button>
                <button
                  onClick={() => setConfirmTrade(null)}
                  style={{ background: '#eee', color: '#333', border: '1px solid #ccc', padding: '8px 24px', fontSize: '13px', cursor: 'pointer', fontFamily: 'Georgia, serif' }}
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Trade log bar */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '5px 12px', flexShrink: 0, fontSize: '15px', minHeight: '28px', display: 'flex', alignItems: 'center', gap: '8px', background: '#080808' }}>
        {tradeLog ? (
          <>
            <span style={{ color: '#444' }}>[{tradeLog.time}]</span>
            <span style={{ color: tradeLog.action === 'HIT' ? '#ff6666' : '#66ff88', fontWeight: 700 }}>{tradeLog.action}</span>
            <span style={{ color: '#666' }}>— CMBX.{tradeLog.series}.{tradeLog.tranche}</span>
            <span style={{ color: '#444' }}>BUYER</span>
            <span style={{ color: '#66ff88', fontWeight: 700 }}>{tradeLog.action === 'LIFT' ? tradeLog.dealer : (tradeLog.passive_dealer ?? '?')}</span>
            <span style={{ color: '#333' }}>↔</span>
            <span style={{ color: '#444' }}>SELLER</span>
            <span style={{ color: '#ff6666', fontWeight: 700 }}>{tradeLog.action === 'LIFT' ? (tradeLog.passive_dealer ?? '?') : tradeLog.dealer}</span>
            <span style={{ color: '#444' }}>@</span>
            <span style={{ color: '#bbb' }}>{tradeLog.price ?? '—'}</span>
            <span style={{ color: '#333' }}>▶</span>
            <span style={{ color: '#66ff88' }}>BLOTTER ✓</span>
          </>
        ) : (
          <span style={{ color: '#2a2a2a' }}>— no trades this session</span>
        )}
      </div>
    </div>
  )
}
