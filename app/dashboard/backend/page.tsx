'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import * as XLSX from 'xlsx'
import { fmt32nds, formatPx, fmtTime, parse32nds } from '../../../lib/utils'

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

type EditField = 'bid' | 'ask' | 'bid_size' | 'ask_size'

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

function dealerButtonStyle(code: string, isSelected: boolean): React.CSSProperties {
  if (isSelected) {
    const s = DEALER_SELECTED[code]
    return { background: s?.bg, color: s?.color ?? '#fff', border: '1px solid #fff', outline: `2px solid ${s?.outline}`, padding: '4px 14px', fontSize: '15px', fontFamily: 'Courier New, monospace', fontWeight: 500, borderRadius: '2px', cursor: 'pointer' }
  }
  const d = DEALER_INACTIVE[code]
  return { background: d?.bg, color: d?.color, border: `1px solid ${d?.border}`, padding: '4px 14px', fontSize: '15px', fontFamily: 'Courier New, monospace', fontWeight: 500, borderRadius: '2px', cursor: 'pointer' }
}

function mapTrade(t: any): BlotterTrade {
  return {
    id:             t.id,
    time:           fmtTime(t.created_at),
    action:         t.side === 'hit' ? 'HIT' : 'LIFT',
    series:         t.series_number,
    tranche:        t.tranche_name,
    dealer:         t.dealer        ?? null,
    passive_dealer: t.passive_dealer ?? null,
    trade_size:     t.trade_size    ?? null,
    price:          t.price,
  }
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
  const [tradeLog, setTradeLog] = useState<BlotterTrade | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ key: string; field: EditField } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(new Set())
  const [showEmptyRows,   setShowEmptyRows]   = useState(true)
  const defaultsApplied  = useRef(false)
  const flashTimers      = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const errorTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showBlotter, setShowBlotter] = useState(false)
  const [blotterTrades, setBlotterTrades] = useState<BlotterTrade[]>([])
  const [confirmTrade, setConfirmTrade] = useState<BlotterTrade | null>(null)
  const [confirmUpfront, setConfirmUpfront] = useState('')
  const [confirmClearBlotter, setConfirmClearBlotter] = useState(false)
  const [ghostPrices,  setGhostPrices]  = useState<Record<string, { bid?: number; ask?: number; mode?: string | null }>>({})
  const [pulledPrices, setPulledPrices] = useState<Record<string, Array<{
    series_number: string; tranche_name: string; mode?: string | null
    bid?: number | null; bid_size?: string | null
    ask?: number | null; ask_size?: string | null
  }>>>({})

  function toggleCollapse(seriesNum: string) {
    setCollapsedSeries(prev => {
      const next = new Set(prev)
      if (next.has(seriesNum)) next.delete(seriesNum)
      else next.add(seriesNum)
      return next
    })
  }

  const selectedDealerRef   = useRef(selectedDealer)
  const selectedRowRef      = useRef(selectedRow)
  const blotterBroadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const latestSpxRef        = useRef<number | null>(null)
  selectedDealerRef.current = selectedDealer
  selectedRowRef.current    = selectedRow

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
    const tick = () => setClock(fmtTime(new Date().toISOString()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Persistent broadcast channel — wait for SUBSCRIBED before storing ref
  useEffect(() => {
    const ch = supabase.channel('trade-blotter-sync')
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') blotterBroadcastRef.current = ch
    })
    return () => { blotterBroadcastRef.current = null; supabase.removeChannel(ch) }
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
          const key = `${p.series_number}:${p.tranche_name}`
          setPrices(prev => ({ ...prev, [key]: p }))
          // Keep ghost of last non-null bid/ask so cleared prices stay visible in grey
          if (p.bid != null || p.ask != null) {
            setGhostPrices(prev => ({
              ...prev,
              [key]: {
                ...prev[key],
                ...(p.bid != null ? { bid: p.bid, mode: p.mode } : {}),
                ...(p.ask != null ? { ask: p.ask, mode: p.mode } : {}),
              }
            }))
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const entry = mapTrade(payload.new)
        flashRowEffect(`${entry.series}:${entry.tranche}`, entry.action === 'HIT' ? 'red' : 'green')
        setTradeLog(entry)
        setBlotterTrades(prev => [entry, ...prev])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_heartbeat' }, (payload) => {
        const hb = payload.new as { bbg_connected?: boolean; active?: boolean }
        setAgentOnline(hb.bbg_connected ?? hb.active ?? false)
      })
      .subscribe()

    async function loadData() {
      const [{ data: sd }, { data: td }, { data: pd }, { data: hb }, { data: tr }, { data: ctx }] = await Promise.all([
        supabase.from('series_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('tranche_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('prices').select('*'),
        supabase.from('agent_heartbeat').select('*').limit(1).single(),
        supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('market_snapshots').select('spx').order('captured_at', { ascending: false }).limit(1).single(),
      ])
      if (cancelled) return
      if (sd) {
        setSeries(sd)
        if (!defaultsApplied.current) {
          setCollapsedSeries(new Set())  // admin: all series expanded on load
          defaultsApplied.current = true
        }
      }
      if (td) setTranches(td)
      if (tr) setBlotterTrades(tr.map(mapTrade))
      if (pd) {
        const map: Record<string, Price> = {}
        const ghosts: Record<string, { bid?: number; ask?: number; mode?: string | null }> = {}
        for (const p of pd) {
          const k = `${p.series_number}:${p.tranche_name}`
          map[k] = p
          if (p.bid != null || p.ask != null) {
            ghosts[k] = {
              ...(p.bid != null ? { bid: p.bid, mode: p.mode } : {}),
              ...(p.ask != null ? { ask: p.ask, mode: p.mode } : {}),
            }
          }
        }
        setPrices(map)
        setGhostPrices(ghosts)
      }
      if (hb) { const h = hb as { bbg_connected?: boolean; active?: boolean }; setAgentOnline(h.bbg_connected ?? h.active ?? false) }
      if (ctx) latestSpxRef.current = (ctx as { spx: number | null }).spx ?? null
    }

    loadData()
    return () => {
      cancelled = true
      supabase.removeChannel(ch)
      // Clear all pending timers on unmount
      Object.values(flashTimers.current).forEach(clearTimeout)
      flashTimers.current = {}
      if (errorTimer.current) { clearTimeout(errorTimer.current); errorTimer.current = null }
    }
  }, [authChecked])

  function flashRowEffect(key: string, color: 'red' | 'green') {
    // Clear any existing timer for this row before starting a new one
    if (flashTimers.current[key]) clearTimeout(flashTimers.current[key])
    setFlashRows(prev => ({ ...prev, [key]: color }))
    flashTimers.current[key] = setTimeout(() => {
      setFlashRows(prev => { const n = { ...prev }; delete n[key]; return n })
      delete flashTimers.current[key]
    }, 20000)
  }

  function handleDealerClick(code: string) {
    setSelectedDealer(prev => prev === code ? null : code)
  }

  async function commitCell(key: string, field: EditField, value: string) {
    const [seriesNum, trancheName] = key.split(':')
    const dealer = selectedDealerRef.current
    const existing = prices[key]
    const trimmed  = value.trim()

    // ── Size fields: stored as text so "10A", "25B" etc. are valid ───────────
    if (field === 'bid_size' || field === 'ask_size') {
      await supabase.from('prices').upsert({
        series_number: seriesNum,
        tranche_name:  trancheName,
        [field]: trimmed === '' ? null : trimmed,
      }, { onConflict: 'series_number,tranche_name' })
      setEditingCell(null)
      return
    }

    // ── Price fields (bid / ask) ──────────────────────────────────────────────
    // Detect format: 32nds ("80-01" or "$80-01"), dollar price ("$85.50"), or spread (plain number)
    const stripped = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed
    const is32nds  = /^\d+-\d{1,2}$/.test(stripped)
    const isDollar = !is32nds && trimmed.startsWith('$')
    const mode     = is32nds ? 'ticks' : isDollar ? 'price' : 'spread'

    const numericValue: number | null =
      stripped === '' ? null :
      is32nds         ? parse32nds(stripped) :
                        (parseFloat(stripped) || null)

    const update: Record<string, unknown> = {
      series_number: seriesNum,
      tranche_name:  trancheName,
      mode,
      [field]: numericValue,
    }
    if (field === 'bid' && dealer) update.bid_dealer = dealer
    if (field === 'ask' && dealer) update.ask_dealer = dealer

    // Auto-fill default size if entering a price and size is currently empty
    const defSize = String(DEFAULT_SIZE[trancheName] ?? 5)
    if (field === 'bid' && trimmed !== '' && existing?.bid_size == null) update.bid_size = defSize
    if (field === 'ask' && trimmed !== '' && existing?.ask_size == null) update.ask_size = defSize

    await supabase.from('prices').upsert(update, { onConflict: 'series_number,tranche_name' })

    // Log every bid/ask price entry to the audit table
    if (trimmed !== '' && numericValue != null) {
      const sz = field === 'bid'
        ? (update.bid_size as string ?? existing?.bid_size ?? null)
        : (update.ask_size as string ?? existing?.ask_size ?? null)
      const baseRow = {
        series_number: seriesNum,
        tranche_name:  trancheName,
        dealer,
        side:   field,
        price:  numericValue,
        size:   sz,
        mode,
      }
      supabase.from('price_changes').insert({ ...baseRow, spx_at_time: latestSpxRef.current })
        .then(({ error }) => { if (error) console.warn('[price_changes insert failed]', error.message) })
    }

    setEditingCell(null)
  }

  async function deleteTrade(id: string) {
    await supabase.from('trades').delete().eq('id', id)
    setBlotterTrades(prev => prev.filter(t => t.id !== id))
  }

  async function clearAllTrades() {
    const { error } = await supabase.from('trades').delete().not('id', 'is', null)
    if (error) {
      showError(`Clear failed: ${error.message}`)
      setConfirmClearBlotter(false)
      return
    }
    blotterBroadcastRef.current?.send({ type: 'broadcast', event: 'blotter-cleared', payload: {} })
    setBlotterTrades([])
    setTradeLog(null)
    setConfirmClearBlotter(false)
  }

  function exportBlotterXlsx() {
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    const rows = blotterTrades.map(t => ({
      'TIME (ET)':   t.time,
      'ACTION':      t.action,
      'TRANCHE':     `CMBX.${t.series}.${t.tranche}`,
      'BUYER':       t.action === 'LIFT' ? t.dealer : (t.passive_dealer ?? ''),
      'SELLER':      t.action === 'LIFT' ? (t.passive_dealer ?? '') : t.dealer,
      'PRICE':       t.price ?? '',
      'SIZE (MM)':   t.trade_size ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Trade Blotter')
    XLSX.writeFile(wb, `CMBX_Blotter_${today}.xlsx`)
  }

  async function clearAllPrices() {
    await supabase.from('prices').update({
      bid: null, ask: null,
      bid_size: null, ask_size: null,
      bid_dealer: null, ask_dealer: null,
      last_trade_px: null, last_trade_time: null,
    }).neq('series_number', '')
    setPrices({})
    setGhostPrices({})
    setPulledPrices({})
    setTradeLog(null)
    setSelectedRow(null)
    setConfirmClear(false)
  }

  function showError(msg: string) {
    if (errorTimer.current) clearTimeout(errorTimer.current)
    setCellError(msg)
    errorTimer.current = setTimeout(() => { setCellError(''); errorTimer.current = null }, 3000)
  }

  // ── Dealer pull / restore ─────────────────────────────────────────────────
  function dealerLiveCount(code: string): number {
    return Object.values(prices).filter(p => p.bid_dealer === code || p.ask_dealer === code).length
  }

  async function pullDealerPrices(code: string) {
    const snapshot: Array<{ series_number: string; tranche_name: string; mode?: string | null; bid?: number | null; bid_size?: string | null; ask?: number | null; ask_size?: string | null }> = []
    for (const [key, p] of Object.entries(prices)) {
      const hasBid = p.bid_dealer === code && p.bid != null
      const hasAsk = p.ask_dealer === code && p.ask != null
      if (!hasBid && !hasAsk) continue
      const [series_number, tranche_name] = key.split(':')
      snapshot.push({
        series_number, tranche_name, mode: p.mode,
        ...(hasBid ? { bid: p.bid, bid_size: p.bid_size } : {}),
        ...(hasAsk ? { ask: p.ask, ask_size: p.ask_size } : {}),
      })
      const update: Record<string, unknown> = { series_number, tranche_name }
      if (hasBid) { update.bid = null; update.bid_dealer = null; update.bid_size = null }
      if (hasAsk) { update.ask = null; update.ask_dealer = null; update.ask_size = null }
      await supabase.from('prices').upsert(update, { onConflict: 'series_number,tranche_name' })
    }
    if (snapshot.length > 0) setPulledPrices(prev => ({ ...prev, [code]: snapshot }))
  }

  async function restoreDealerPrices(code: string) {
    const snapshot = pulledPrices[code]
    if (!snapshot?.length) return
    for (const item of snapshot) {
      const update: Record<string, unknown> = { series_number: item.series_number, tranche_name: item.tranche_name }
      if (item.mode) update.mode = item.mode
      if (item.bid != null) { update.bid = item.bid; update.bid_dealer = code; update.bid_size = item.bid_size ?? null }
      if (item.ask != null) { update.ask = item.ask; update.ask_dealer = code; update.ask_size = item.ask_size ?? null }
      await supabase.from('prices').upsert(update, { onConflict: 'series_number,tranche_name' })
    }
    setPulledPrices(prev => { const n = { ...prev }; delete n[code]; return n })
  }

  async function executeTrade(side: 'hit' | 'lift') {
    const isHit      = side === 'hit'
    const setShake   = isHit ? setHitShake : setLiftShake
    const dealer     = selectedDealerRef.current
    const rowKey     = selectedRowRef.current

    function shake() { setShake(true); setTimeout(() => setShake(false), 500) }

    if (!dealer) { shake(); showError('Select a counterparty first'); return }
    if (!rowKey) { shake(); showError('Select a row first'); return }

    const [seriesNum, trancheName] = rowKey.split(':')
    const px            = isHit ? (prices[rowKey]?.bid ?? null)         : (prices[rowKey]?.ask ?? null)
    const passiveDealer = isHit ? (prices[rowKey]?.bid_dealer ?? null)  : (prices[rowKey]?.ask_dealer ?? null)
    const sz            = isHit ? (prices[rowKey]?.bid_size ?? null)    : (prices[rowKey]?.ask_size ?? null)

    if (px == null)            { shake(); showError(isHit ? 'No bid posted on this tranche' : 'No offer posted on this tranche'); return }
    if (dealer === passiveDealer) { shake(); showError(`${dealer} cannot ${isHit ? 'hit' : 'lift'} their own price`); return }

    await supabase.from('trades').insert({ series_number: seriesNum, tranche_name: trancheName, side, price: px, dealer, passive_dealer: passiveDealer, trade_size: sz, spx_at_time: latestSpxRef.current })
    await supabase.from('prices').upsert({ series_number: seriesNum, tranche_name: trancheName, last_trade_px: px, last_trade_time: new Date().toISOString() }, { onConflict: 'series_number,tranche_name' })
    flashRowEffect(rowKey, isHit ? 'red' : 'green')
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
          // Pre-populate in the correct display format
          if (rawVal != null && (field === 'bid' || field === 'ask')) {
            const mode = price?.mode
            if (mode === 'ticks')       setEditValue(fmt32nds(rawVal as number))
            else if (mode === 'price')  setEditValue(`$${rawVal}`)
            else                        setEditValue(String(rawVal))
          } else {
            setEditValue(rawVal != null ? String(rawVal) : '')
          }
        }}
        onMouseEnter={() => setHoveredCell({ key, field })}
        onMouseLeave={() => setHoveredCell(null)}
      >
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onFocus={e => e.target.select()}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCell(key, field, editValue)
              if (e.key === 'Escape') setEditingCell(null)
            }}
            onBlur={() => setEditingCell(null)}
            style={inputStyle}
          />
        ) : isEmpty && isHovered ? (
          <span style={{ color: '#555', fontStyle: 'italic', fontSize: '13px' }}>type...</span>
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
          CMBX — CROSSPOINT CAPITAL
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
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
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
      <div style={{ display: 'flex', alignItems: 'flex-end', padding: '5px 12px', gap: '4px', borderBottom: '1px solid #1e1e1e', flexShrink: 0, flexWrap: 'wrap' }}>
        {DEALERS.map(code => {
          const count    = dealerLiveCount(code)
          const isPulled = !!pulledPrices[code]?.length
          const s        = DEALER_INACTIVE[code]
          return (
            <div key={code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <button onClick={() => handleDealerClick(code)} style={dealerButtonStyle(code, selectedDealer === code)}>
                {code}
              </button>
              {isPulled ? (
                <button
                  onClick={() => restoreDealerPrices(code)}
                  title={`Restore ${pulledPrices[code].length} ${code} prices`}
                  style={{ background: '#0a1a0a', color: '#66ff88', border: '1px solid #336633', padding: '1px 5px', fontSize: '10px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px', lineHeight: '13px', whiteSpace: 'nowrap' }}
                >↩ {pulledPrices[code].length}</button>
              ) : count > 0 ? (
                <button
                  onClick={() => pullDealerPrices(code)}
                  title={`Pull all ${count} ${code} prices`}
                  style={{ background: 'transparent', color: s?.color + '99', border: `1px solid ${s?.border}55`, padding: '1px 5px', fontSize: '10px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px', lineHeight: '13px', whiteSpace: 'nowrap' }}
                >↓ {count}</button>
              ) : (
                <span style={{ height: '15px' }} />
              )}
            </div>
          )
        })}
        <span style={{ marginLeft: '10px', fontSize: '15px', color: selectedDealer ? '#f0c040' : '#444', alignSelf: 'center' }}>
          {selectedDealer ? `SELECTED: ${selectedDealer}` : '— no counterparty selected'}
        </span>
        {cellError && (
          <span style={{ marginLeft: '12px', color: '#ff4444', fontSize: '15px', alignSelf: 'center' }}>{cellError}</span>
        )}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 12px', gap: '6px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <button
          onClick={() => executeTrade('hit')}
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
          onClick={() => executeTrade('lift')}
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
          <span style={{ color: '#888' }}>80-16</span> or <span style={{ color: '#888' }}>$80-16</span> 32nds · <span style={{ color: '#888' }}>$85.50</span> price · <span style={{ color: '#888' }}>285</span> spread
        </span>
        <button
          onClick={() => setShowEmptyRows(v => !v)}
          style={{
            marginLeft: 'auto',
            background: showEmptyRows ? '#1a1a00' : 'transparent',
            color: showEmptyRows ? '#f0c040' : '#444',
            border: `1px solid ${showEmptyRows ? '#f0c040' : '#2a2a2a'}`,
            padding: '2px 10px', fontSize: '11px', fontFamily: 'Courier New, monospace',
            cursor: 'pointer', borderRadius: '2px', letterSpacing: '1px',
          }}
        >
          {showEmptyRows ? '▼ HIDE EMPTY' : '▶ SHOW EMPTY'}
        </button>
        <span style={{ color: '#333', fontSize: '15px', paddingRight: '2px' }}>
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
              <th style={{ textAlign: 'left',   padding: '3px 8px 3px 12px', borderBottom: '1px solid #1e1e1e', width: '160px', fontWeight: 700 }}>TRANCHE</th>
              <th style={{ textAlign: 'center', padding: '3px 8px',  borderBottom: '1px solid #1e1e1e', minWidth: '70px',  fontWeight: 700 }}>SIZE</th>
              <th style={{ textAlign: 'center', padding: '3px 10px', borderBottom: '2px solid #66ff88', minWidth: '100px', fontWeight: 700 }}>BID</th>
              <th style={{ textAlign: 'center', padding: '3px 10px', borderBottom: '2px solid #ff6666', minWidth: '100px', fontWeight: 700 }}>OFFER</th>
              <th style={{ textAlign: 'center', padding: '3px 8px',  borderBottom: '1px solid #1e1e1e', minWidth: '70px',  fontWeight: 700 }}>SIZE</th>
              <th style={{ textAlign: 'right',  padding: '3px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '120px', fontWeight: 700 }}>LST TRADE PX</th>
              <th style={{ textAlign: 'right',  padding: '3px 12px 3px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '50px', fontWeight: 700 }}>CHG</th>
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
                  if (isCollapsed) return false   // collapsed = header only, no rows
                  const p = prices[`${s.series_number}:${t.tranche_name}`]
                  const hasPrice = p?.bid != null || p?.ask != null
                  return showEmptyRows ? true : hasPrice
                }).map((t, tIdx) => {
                  const rowKey = `${s.series_number}:${t.tranche_name}`
                  const price = prices[rowKey]
                  const isActive = selectedRow === rowKey
                  const flash = flashRows[rowKey]
                  const isOdd = tIdx % 2 === 1

                  let rowBg = isActive ? '#1a1500' : isOdd ? '#0d0d0d' : 'transparent'
                  if (flash === 'red') rowBg = '#3a0000'
                  if (flash === 'green') rowBg = '#003a00'

                  const ghost   = ghostPrices[rowKey]
                  const bidTag  = price?.bid_dealer && DEALER_INACTIVE[price.bid_dealer] ? DEALER_INACTIVE[price.bid_dealer] : null
                  const askTag  = price?.ask_dealer && DEALER_INACTIVE[price.ask_dealer] ? DEALER_INACTIVE[price.ask_dealer] : null
                  // Ghost: show last known value in grey when current is null
                  const ghostBid = price?.bid == null ? ghost?.bid : undefined
                  const ghostAsk = price?.ask == null ? ghost?.ask : undefined
                  const ghostMode = ghost?.mode

                  const bidCell = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'center', width: '100%' }}>
                      {price?.bid != null ? (
                        <>
                          <span style={{ color: '#ffffff' }}>{formatPx(price.bid, price.mode)}</span>
                          {bidTag && <span style={{ background: bidTag.bg, color: bidTag.color, fontSize: '15px', padding: '0 3px', borderRadius: '2px', fontWeight: 600 }}>{price.bid_dealer}</span>}
                        </>
                      ) : ghostBid != null ? (
                        <span style={{ color: '#484848', fontStyle: 'italic' }}>{formatPx(ghostBid, ghostMode)}</span>
                      ) : (
                        <span style={{ color: '#2a2a2a' }}>—</span>
                      )}
                    </span>
                  )

                  const askCell = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'center', width: '100%' }}>
                      {price?.ask != null ? (
                        <>
                          <span style={{ color: '#ffffff' }}>{formatPx(price.ask, price.mode)}</span>
                          {askTag && <span style={{ background: askTag.bg, color: askTag.color, fontSize: '15px', padding: '0 3px', borderRadius: '2px', fontWeight: 600 }}>{price.ask_dealer}</span>}
                        </>
                      ) : ghostAsk != null ? (
                        <span style={{ color: '#484848', fontStyle: 'italic' }}>{formatPx(ghostAsk, ghostMode)}</span>
                      ) : (
                        <span style={{ color: '#2a2a2a' }}>—</span>
                      )}
                    </span>
                  )

                  const bszCell = <span style={{ color: price?.bid_size != null ? '#aaaaaa' : '#2a2a2a' }}>{price?.bid_size ?? '—'}</span>
                  const aszCell = <span style={{ color: price?.ask_size != null ? '#aaaaaa' : '#2a2a2a' }}>{price?.ask_size ?? '—'}</span>

                  return (
                    <tr
                      key={rowKey}
                      onClick={() => setSelectedRow(prev => prev === rowKey ? null : rowKey)}
                      style={{ background: rowBg, borderBottom: '1px solid #161616', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '3px 8px 3px 12px', color: '#ffffff', whiteSpace: 'nowrap', width: '160px' }}>
                        CMBX.{s.series_number}.{t.tranche_name}
                      </td>
                      {renderEditCell(rowKey, 'bid_size', bszCell, { textAlign: 'center', padding: '3px 8px' })}
                      {renderEditCell(rowKey, 'bid', bidCell, { textAlign: 'center', padding: '3px 10px', borderLeft: '2px solid #1a3a1a' })}
                      {renderEditCell(rowKey, 'ask', askCell, { textAlign: 'center', padding: '3px 10px', borderLeft: '2px solid #3a1a1a' })}
                      {renderEditCell(rowKey, 'ask_size', aszCell, { textAlign: 'center', padding: '3px 8px' })}
                      <td style={{ textAlign: 'right', padding: '3px 10px' }}>
                        {price?.last_trade_px != null ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                            <span style={{ color: '#888' }}>{formatPx(price.last_trade_px, price.mode)}</span>
                            {price.last_trade_time && (
                              <span style={{ color: '#444', fontSize: '10px' }}>{fmtTime(price.last_trade_time)}</span>
                            )}
                          </div>
                        ) : <span style={{ color: '#2a2a2a' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', padding: '3px 12px 3px 8px', color: '#2a2a2a' }}>—</td>
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
          <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e1e1e', color: '#f0c040', fontSize: '13px', letterSpacing: '2px', fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>TRADE BLOTTER</span>
            <span style={{ color: '#444', fontSize: '11px', fontWeight: 400 }}>{blotterTrades.length} trades</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                onClick={exportBlotterXlsx}
                disabled={blotterTrades.length === 0}
                style={{ background: blotterTrades.length > 0 ? '#0a1a0a' : 'transparent', color: blotterTrades.length > 0 ? '#66ff88' : '#333', border: `1px solid ${blotterTrades.length > 0 ? '#336633' : '#222'}`, padding: '1px 7px', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: blotterTrades.length > 0 ? 'pointer' : 'default', borderRadius: '2px', letterSpacing: '1px' }}
              >
                XLS
              </button>
              {!confirmClearBlotter ? (
                <button
                  onClick={() => setConfirmClearBlotter(true)}
                  style={{ background: 'transparent', color: '#444', border: '1px solid #2a2a2a', padding: '1px 7px', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px', letterSpacing: '1px' }}
                >
                  CLEAR
                </button>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#ff4444', fontSize: '10px' }}>sure?</span>
                  <button onClick={clearAllTrades} style={{ background: '#3a0000', color: '#ff6666', border: '1px solid #aa3333', padding: '1px 7px', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px', fontWeight: 700 }}>YES</button>
                  <button onClick={() => setConfirmClearBlotter(false)} style={{ background: '#111', color: '#555', border: '1px solid #2a2a2a', padding: '1px 7px', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px' }}>NO</button>
                </span>
              )}
            </span>
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
