'use client'

import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'
import * as XLSX from 'xlsx'
import { fmt32nds, formatPx, fmtTime, parse32nds, buildGhostMap, mergeGhost, GhostMap } from '../../../lib/utils'
import { Theme, DEFAULT_THEME, loadTheme, saveTheme, loadViewAs, hasValidSession, clearSession } from '../../../lib/theme'
import { ThemePanel } from '../ThemePanel'
import { scheduleEodLogout } from '../../../lib/eod-logout'

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
  '6':  'May 11, 2063',
  '7':  'January 17, 2047',
  '8':  'October 17, 2057',
  '9':  'September 17, 2058',
  '10': 'November 17, 2059',
  '11': 'November 18, 2054',
  '12': 'August 17, 2061',
  '13': 'December 16, 2072',
  '14': 'December 16, 2072',
  '15': 'November 18, 2064',
  '16': 'April 17, 2065',
  '17': 'December 15, 2056',
  '18': 'December 18, 2057',
  '19': 'December 17, 2058',
  '20': 'January 17, 2073',
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

// CDX HY snapshot recorded when MS submits a price — drives auto-adjustment
interface MsSnapshot {
  cdxHyAtEntry: number      // CDX HY px at time of submission
  bidAtEntry: number | null // original bid (unadjusted)
  askAtEntry: number | null // original ask (unadjusted)
  modeAtEntry: string
  lastAppliedAdj: number    // ticks already applied (to avoid re-applying same adj)
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
  mode: string | null
}

interface PriceQueueEntry {
  id: string
  series_number: string
  tranche_name: string
  side: 'bid' | 'ask'
  dealer: string
  price: number
  size: string
  mode: string
  created_at: string
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
    mode:           t.mode          ?? null,
  }
}

// ── Bulk price parser ─────────────────────────────────────────────────────
// Flexible format — any token containing '/' is a price, any plain integer
// (or t-prefixed integer) is a series number. Tokens are paired in order.
//
// Supported per-line formats:
//   Full:      "91-20/92-04 -18"     bid+ask, series at end
//              "-18 91-20/92-04"     bid+ask, series at start
//   Bid only:  "92-06/ -19"          bid only (ask side blank)
//   Ask only:  "/91-26 -18"          ask only (bid side blank)
//   Multi:     "/91-26 /85-18 -18 -17"  two ask-only rows on one line
//   t-prefix:  "60/ t16"             series written as t16 → series 16
//   Modes:     32nds (92-06), dollar ($85.50), spread (285)

function _parsePriceTok(tok: string): { bid: number | null; ask: number | null; mode: string } | null {
  const slashIdx = tok.indexOf('/')
  if (slashIdx === -1) return null
  const bidStr = tok.slice(0, slashIdx).trim()
  const askStr = tok.slice(slashIdx + 1).trim()
  const sample = (bidStr || askStr).replace('$', '')
  if (!sample) return null
  const mode = /^\d+-\d{1,2}$/.test(sample) ? 'ticks'
             : (bidStr || askStr).startsWith('$') ? 'price'
             : 'spread'
  const parsePx = (s: string): number | null => {
    if (!s) return null
    const clean = s.replace('$', '').trim()
    if (!clean) return null
    return mode === 'ticks' ? parse32nds(clean) : (parseFloat(clean) || null)
  }
  const bid = parsePx(bidStr)
  const ask = parsePx(askStr)
  if (bid == null && ask == null) return null
  return { bid, ask, mode }
}

function detectTrancheAndSeries(tok: string): { tranche: string; series: number } | null {
  // Plain number (19) or dash-only (-19): BBB-
  let m = tok.match(/^-?(\d+)$/)
  if (m) return { tranche: 'BBB-', series: parseInt(m[1], 10) }
  // Bloomberg -.19: BBB-
  m = tok.match(/^-\.(\d+)$/)
  if (m) return { tranche: 'BBB-', series: parseInt(m[1], 10) }
  // t17 / T17: AAA (top)
  m = tok.match(/^[tT](\d+)$/)
  if (m) return { tranche: 'AAA', series: parseInt(m[1], 10) }
  // aaa17 or AAA.17: AAA
  m = tok.match(/^aaa\.?(\d+)$/i)
  if (m) return { tranche: 'AAA', series: parseInt(m[1], 10) }
  // as17 or AS.17: AS
  m = tok.match(/^as\.?(\d+)$/i)
  if (m) return { tranche: 'AS', series: parseInt(m[1], 10) }
  // aa17 or AA.17: AA
  m = tok.match(/^aa\.?(\d+)$/i)
  if (m) return { tranche: 'AA', series: parseInt(m[1], 10) }
  // a17 or A.17 (single a): A
  m = tok.match(/^a\.?(\d+)$/i)
  if (m) return { tranche: 'A', series: parseInt(m[1], 10) }
  // bbb-17, bbb17, BBB-.17, BBB.17: BBB-
  m = tok.match(/^bbb-?\.?(\d+)$/i)
  if (m) return { tranche: 'BBB-', series: parseInt(m[1], 10) }
  // bb17 or BB.17: BB
  m = tok.match(/^bb\.?(\d+)$/i)
  if (m) return { tranche: 'BB', series: parseInt(m[1], 10) }
  return null
}

function parseBulkLines(text: string): Array<{ series: string; tranche: string; bid: number | null; ask: number | null; mode: string }> {
  const results: Array<{ series: string; tranche: string; bid: number | null; ask: number | null; mode: string }> = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const tokens = line.match(/\S+/g) || []
    const priceToks: string[] = []
    const trancheTokens: { tranche: string; series: number }[] = []
    for (const tok of tokens) {
      if (tok.includes('/')) {
        priceToks.push(tok)
      } else {
        const ts = detectTrancheAndSeries(tok)
        if (ts && ts.series > 0) trancheTokens.push(ts)
      }
    }
    if (priceToks.length === 0 || trancheTokens.length === 0) continue
    const count = Math.min(priceToks.length, trancheTokens.length)
    for (let i = 0; i < count; i++) {
      const px = _parsePriceTok(priceToks[i])
      if (px) results.push({ series: String(trancheTokens[i].series), tranche: trancheTokens[i].tranche, ...px })
    }
  }
  return results
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
  const [flashSides, setFlashSides] = useState<Record<string, 'bid' | 'ask' | 'row'>>({})
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
  const [confirmTrade,  setConfirmTrade]  = useState<BlotterTrade | null>(null)
  const [priceQueue, setPriceQueue] = useState<PriceQueueEntry[]>([])
  const [expandedQueueRows, setExpandedQueueRows] = useState<Set<string>>(new Set())
  const [confirmSpread, setConfirmSpread] = useState('')
  const [confirmClearBlotter, setConfirmClearBlotter] = useState(false)
  const [showBulkInput, setShowBulkInput] = useState(false)
  const [bulkText,      setBulkText]      = useState('')
  const [bulkSize,      setBulkSize]      = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult,    setBulkResult]    = useState<{ bids: number; asks: number; changes: { label: string; side: string; from: string; to: string }[] } | null>(null)
  const [ghostPrices,  setGhostPrices]  = useState<GhostMap>({})
  const [filterDealer, setFilterDealer] = useState<string | null>(null)
  const [filterCopyFlash, setFilterCopyFlash] = useState(false)
  const [theme,        setTheme]        = useState<Theme>(DEFAULT_THEME)
  const [showSettings, setShowSettings] = useState(false)
  const [rtOk,         setRtOk]         = useState(true)
  const [cdxLiveHy,    setCdxLiveHy]    = useState<number | null>(null)
  const [autoAdjMsg,   setAutoAdjMsg]   = useState<string>('')
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
  const blotterBroadcastRef   = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const priceRefreshRef       = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const forceLogoutRef        = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const latestSpxRef        = useRef<number | null>(null)
  const latestCdxRef        = useRef<{ hy: number | null; ig: number | null }>({ hy: null, ig: null })
  // MS delta-hedge snapshots: keyed by "series:tranche"
  const msSnapshotsRef      = useRef<Record<string, MsSnapshot>>({})
  selectedDealerRef.current = selectedDealer
  selectedRowRef.current    = selectedRow

  // Access gate + theme load
  // Verifies the Supabase-signed JWT — cannot be bypassed via localStorage/DevTools
  useEffect(() => {
    const ADMIN_EMAILS = ['admin@crosspoint-capital.com']
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email?.toLowerCase().trim() ?? ''
      if (!session || !ADMIN_EMAILS.includes(email)) {
        clearSession()
        window.location.replace(session ? '/dashboard/market' : '/login')
        return
      }
      setTheme(loadTheme())
      try {
        const saved = localStorage.getItem('cmbx_dealer_timeouts')
        if (saved) setPulledPrices(JSON.parse(saved))
      } catch {}
      setAuthChecked(true)
      const cancelEod = scheduleEodLogout(() => { clearSession(); window.location.href = '/login' })
      return () => cancelEod()
    })
  }, [])

  useEffect(() => {
    const tick = () => setClock(fmtTime(new Date().toISOString()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Persistent broadcast channels — wait for SUBSCRIBED before storing ref
  useEffect(() => {
    const ch = supabase.channel('trade-blotter-sync')
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') blotterBroadcastRef.current = ch
    })
    return () => { blotterBroadcastRef.current = null; supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    const ch = supabase.channel('price-refresh')
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') priceRefreshRef.current = ch
    })
    return () => { priceRefreshRef.current = null; supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    const ch = supabase.channel('force-logout')
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') forceLogoutRef.current = ch
    })
    return () => { forceLogoutRef.current = null; supabase.removeChannel(ch) }
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
          // Merge — preserves mode and other unchanged cols absent from realtime payload.
          // If the incoming payload has mode:null (DB row was null), keep whatever valid
          // mode we already have in state so prices never revert to decimal display.
          setPrices(prev => {
            const existing = prev[key]
            const merged = { ...existing, ...p }
            if (!merged.mode && existing?.mode) merged.mode = existing.mode
            return { ...prev, [key]: merged }
          })
          // Keep ghost of last non-null bid/ask so cleared prices stay visible in grey
          setGhostPrices(prev => mergeGhost(prev, key, p))
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const entry = mapTrade(payload.new)
        flashRowEffect(`${entry.series}:${entry.tranche}`, entry.action === 'HIT' ? 'red' : 'green', 30000, entry.action === 'HIT' ? 'bid' : 'ask')
        setTradeLog(entry)
        setBlotterTrades(prev => [entry, ...prev])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_heartbeat' }, (payload) => {
        const hb = payload.new as { bbg_connected?: boolean; active?: boolean }
        setAgentOnline(hb.bbg_connected ?? hb.active ?? false)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_queue' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { id: string }
          setPriceQueue(prev => prev.filter(e => e.id !== old.id))
        } else {
          const entry = payload.new as PriceQueueEntry
          setPriceQueue(prev => {
            const next = prev.filter(e => e.id !== entry.id)
            return [...next, entry].sort((a, b) => a.created_at.localeCompare(b.created_at))
          })
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cdx_intraday' }, (payload) => {
        const row = payload.new as { cdx_hy?: number | null; cdx_ig?: number | null }
        const hy = row.cdx_hy ?? null
        const ig = row.cdx_ig ?? null
        // Update whichever fields are present — never clobber a live value with null
        latestCdxRef.current = {
          hy: hy ?? latestCdxRef.current.hy,
          ig: ig ?? latestCdxRef.current.ig,
        }
        if (hy != null) {
          setCdxLiveHy(hy)
          applyMsAdjustments(hy)
        }
      })
      .subscribe((status) => {
        setRtOk(status === 'SUBSCRIBED')
        // On reconnect, immediately re-fetch prices to fill any gap missed while disconnected
        if (status === 'SUBSCRIBED') refreshPrices()
      })

    async function fetchSpx() {
      try {
        const res = await fetch('/api/spx')
        const { spx } = await res.json()
        if (spx != null) latestSpxRef.current = spx
      } catch {}
    }

    async function fetchCdx() {
      try {
        const res = await fetch('/api/cdx')
        const { cdx_hy, cdx_ig } = await res.json()
        // Prefer fresh API value; fall back to whatever realtime already set
        latestCdxRef.current = {
          hy: cdx_hy ?? latestCdxRef.current.hy,
          ig: cdx_ig ?? latestCdxRef.current.ig,
        }
      } catch {}
    }

    // Backfill: corrects cdx_hy_at_time / cdx_ig_at_time on any price_changes or
    // trades from the last 24h where the stamped value didn't match cdx_intraday.
    // Runs on load + every 5 minutes so stale or missing values self-heal.
    async function backfillCdx() {
      try {
        const { error } = await supabase.rpc('backfill_cdx_prices')
        if (error) console.warn('[cdx-backfill] rpc error:', error.message)
      } catch (e) {
        console.warn('[cdx-backfill] failed:', e)
      }
    }

    // Fetch only prices — used for polling + visibility refresh
    async function refreshPrices() {
      const { data: pd } = await supabase.from('prices').select('*')
      if (cancelled || !pd) return
      setPrices(Object.fromEntries(pd.map((p: Price) => [`${p.series_number}:${p.tranche_name}`, p])))
      setGhostPrices(buildGhostMap(pd))
    }

    async function loadData() {
      const [{ data: sd }, { data: td }, { data: pd }, { data: hb }, { data: tr }, { data: qd }] = await Promise.all([
        supabase.from('series_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('tranche_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('prices').select('*'),
        supabase.from('agent_heartbeat').select('*').limit(1).single(),
        supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('price_queue').select('*').order('created_at', { ascending: true }),
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
        setPrices(Object.fromEntries(pd.map((p: Price) => [`${p.series_number}:${p.tranche_name}`, p])))
        setGhostPrices(buildGhostMap(pd))
      }
      if (hb) { const h = hb as { bbg_connected?: boolean; active?: boolean }; setAgentOnline(h.bbg_connected ?? h.active ?? false) }
      if (qd) setPriceQueue(qd as PriceQueueEntry[])
    }

    // Fetch SPX and CDX immediately, then refresh every 5 minutes
    fetchSpx()
    fetchCdx()
    backfillCdx()   // correct any stale CDX values on load
    const spxInterval      = setInterval(fetchSpx,    5 * 60 * 1000)
    const cdxInterval      = setInterval(fetchCdx,    5 * 60 * 1000)
    const backfillInterval = setInterval(backfillCdx, 5 * 60 * 1000)

    // ── Polling fallback: re-fetch prices every 30s even if realtime is healthy ──
    const pollInterval = setInterval(refreshPrices, 30_000)

    // ── Visibility refresh: catch up on missed updates when tab becomes active ──
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refreshPrices()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    loadData()
    return () => {
      cancelled = true
      clearInterval(spxInterval)
      clearInterval(cdxInterval)
      clearInterval(backfillInterval)
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      supabase.removeChannel(ch)
      // Clear all pending timers on unmount
      Object.values(flashTimers.current).forEach(clearTimeout)
      flashTimers.current = {}
      if (errorTimer.current) { clearTimeout(errorTimer.current); errorTimer.current = null }
    }
  }, [authChecked])

  function flashRowEffect(key: string, color: 'red' | 'green', durationMs = 3000, side: 'bid' | 'ask' | 'row' = 'row') {
    if (flashTimers.current[key]) clearTimeout(flashTimers.current[key])
    setFlashRows(prev => ({ ...prev, [key]: color }))
    setFlashSides(prev => ({ ...prev, [key]: side }))
    flashTimers.current[key] = setTimeout(() => {
      setFlashRows(prev => { const n = { ...prev }; delete n[key]; return n })
      setFlashSides(prev => { const n = { ...prev }; delete n[key]; return n })
      delete flashTimers.current[key]
    }, durationMs)
  }

  function toggleQueueExpand(rowKey: string) {
    setExpandedQueueRows(prev => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey) else next.add(rowKey)
      return next
    })
  }

  async function recomputePricesRow(seriesNum: string, trancheName: string, side: 'bid' | 'ask') {
    const { data: entries } = await supabase
      .from('price_queue').select('*')
      .eq('series_number', seriesNum).eq('tranche_name', trancheName).eq('side', side)
      .order('created_at', { ascending: true })

    if (!entries || entries.length === 0) {
      await supabase.from('prices').update(
        side === 'bid'
          ? { bid: null, bid_dealer: null, bid_size: null }
          : { ask: null, ask_dealer: null, ask_size: null }
      ).eq('series_number', seriesNum).eq('tranche_name', trancheName)
      return
    }

    const mode = entries[0].mode ?? 'ticks'
    const isSpread = mode === 'spread'
    const priceArr = entries.map((e: PriceQueueEntry) => e.price)
    const bestPrice = side === 'bid'
      ? (isSpread ? Math.min(...priceArr) : Math.max(...priceArr))
      : (isSpread ? Math.max(...priceArr) : Math.min(...priceArr))

    const atBest = entries.filter((e: PriceQueueEntry) => e.price === bestPrice)
    const totalSize = atBest.reduce((sum: number, e: PriceQueueEntry) => {
      const n = parseFloat(e.size); return sum + (isNaN(n) ? 0 : n)
    }, 0)

    await supabase.from('prices').upsert({
      series_number: seriesNum, tranche_name: trancheName, mode,
      ...(side === 'bid'
        ? { bid: bestPrice, bid_dealer: atBest[0].dealer, bid_size: String(totalSize) }
        : { ask: bestPrice, ask_dealer: atBest[0].dealer, ask_size: String(totalSize) })
    }, { onConflict: 'series_number,tranche_name' })
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
        // Always include mode so the realtime payload never delivers mode:null
        // and accidentally clears the display format in the frontend
        ...(existing?.mode ? { mode: existing.mode } : {}),
        [field]: trimmed === '' ? null : trimmed,
      }, { onConflict: 'series_number,tranche_name' })
      setEditingCell(null)
      return
    }

    // ── Price fields (bid / ask) ──────────────────────────────────────────────
    // Detect format: 32nds ("80-01" or "$80-01"), dollar price ("$85.50"), or spread (plain number)
    // Dollar-format prices are auto-converted to 32nds ticks so display is always consistent
    const stripped = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed
    const is32nds  = /^\d+-\d{1,2}$/.test(stripped)
    const isDollar = !is32nds && trimmed.startsWith('$')
    const isSpread = !is32nds && !isDollar && stripped !== ''

    const mode: 'ticks' | 'spread' = isSpread ? 'spread' : 'ticks'

    let numericValue: number | null =
      stripped === '' ? null :
      is32nds         ? parse32nds(stripped) :
      isDollar        ? (() => { const f = parseFloat(stripped); if (isNaN(f)) return null; const whole = Math.floor(f); const ticks = Math.round((f - whole) * 32); return whole + ticks / 32 })() :
      isSpread        ? (() => { const f = parseFloat(stripped); return isNaN(f) ? null : f })() :
                        null

    // ── Market protection: a different dealer cannot post a worse price ─────────
    // Ticks (price): better bid = higher, better offer = lower
    // Spread (yield): better bid = lower (tighter = higher price), better offer = higher (wider = lower price)
    if (numericValue != null) {
      const isSpreadMode = mode === 'spread' || existing?.mode === 'spread'
      if (field === 'bid' && existing?.bid != null && existing.bid_dealer && existing.bid_dealer !== dealer) {
        const worse = isSpreadMode ? numericValue > existing.bid : numericValue < existing.bid
        if (worse) {
          showError(`${existing.bid_dealer} bid ${formatPx(existing.bid, existing.mode)} — ${dealer ?? 'you'} can't post a worse bid`)
          setEditingCell(null)
          return
        }
      }
      if (field === 'ask' && existing?.ask != null && existing.ask_dealer && existing.ask_dealer !== dealer) {
        const worse = isSpreadMode ? numericValue < existing.ask : numericValue > existing.ask
        if (worse) {
          showError(`${existing.ask_dealer} offer ${formatPx(existing.ask, existing.mode)} — ${dealer ?? 'you'} can't post a worse offer`)
          setEditingCell(null)
          return
        }
      }
    }

    const defSize = String(DEFAULT_SIZE[trancheName] ?? 5)
    const entrySize = field === 'bid' ? (existing?.bid_size ?? defSize) : (existing?.ask_size ?? defSize)

    if (numericValue == null) {
      if (dealer) {
        await supabase.from('price_queue').delete()
          .eq('series_number', seriesNum).eq('tranche_name', trancheName)
          .eq('side', field).eq('dealer', dealer)
      }
      await recomputePricesRow(seriesNum, trancheName, field as 'bid' | 'ask')
    } else {
      if (dealer) {
        await supabase.from('price_queue').upsert({
          series_number: seriesNum, tranche_name: trancheName,
          side: field, dealer, price: numericValue, size: entrySize, mode,
        }, { onConflict: 'series_number,tranche_name,side,dealer' })
      }
      await recomputePricesRow(seriesNum, trancheName, field as 'bid' | 'ask')
    }

    // Push refresh signal to all dealer market pages
    priceRefreshRef.current?.send({ type: 'broadcast', event: 'price-saved', payload: {} })

    // MS delta-hedge snapshot — record CDX HY at the moment of price entry
    if (dealer === 'MS' && (field === 'bid' || field === 'ask') && latestCdxRef.current.hy != null) {
      if (numericValue == null) {
        // Price cleared — remove snapshot so auto-adj stops for this row
        delete msSnapshotsRef.current[key]
      } else {
        const prev = msSnapshotsRef.current[key]
        msSnapshotsRef.current[key] = {
          cdxHyAtEntry: latestCdxRef.current.hy,
          bidAtEntry:   field === 'bid' ? numericValue : (existing?.bid   ?? prev?.bidAtEntry ?? null),
          askAtEntry:   field === 'ask' ? numericValue : (existing?.ask   ?? prev?.askAtEntry ?? null),
          modeAtEntry:  mode,
          lastAppliedAdj: 0,  // reset on fresh entry
        }
      }
    }

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
      supabase.from('price_changes').insert({
        ...baseRow,
        spx_at_time:    latestSpxRef.current,
        cdx_hy_at_time: latestCdxRef.current.hy,
        cdx_ig_at_time: latestCdxRef.current.ig,
      }).then(({ error }) => { if (error) console.warn('[price_changes insert failed]', error.message) })
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
      'TRANCHE':     `${t.tranche}.${t.series}`,
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
    await supabase.from('price_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('prices').update({
      bid: null, ask: null,
      bid_size: null, ask_size: null,
      bid_dealer: null, ask_dealer: null,
      last_trade_px: null, last_trade_time: null,
    }).neq('series_number', '')
    setPrices({})
    setPriceQueue([])
    setGhostPrices({})
    setPulledPrices({})
    msSnapshotsRef.current = {}
    setTradeLog(null)
    setSelectedRow(null)
    setConfirmClear(false)
  }

  // ── MS CDX HY auto-adjustment ─────────────────────────────────────────────
  // Rule: every 6.25c (0.0625) move in CDX HY from the snapshot → ±2 ticks on MS prices
  function applyMsAdjustments(newCdxHy: number) {
    const snaps = msSnapshotsRef.current
    const entries = Object.entries(snaps)
    if (entries.length === 0) return

    let adjCount = 0
    for (const [key, snap] of entries) {
      const cdxMove = newCdxHy - snap.cdxHyAtEntry
      // Complete 6.25c steps (signed)
      const steps   = Math.trunc(cdxMove / 0.0625)
      const tickAdj = steps * 2   // 2 ticks per 6.25c step

      if (tickAdj === snap.lastAppliedAdj) continue  // no change since last apply

      const newBid = snap.bidAtEntry != null ? snap.bidAtEntry + tickAdj / 32 : null
      const newAsk = snap.askAtEntry != null ? snap.askAtEntry + tickAdj / 32 : null

      const [seriesNum, trancheName] = key.split(':')
      const payload: Record<string, unknown> = {
        series_number: seriesNum,
        tranche_name:  trancheName,
        mode:          snap.modeAtEntry,
      }
      if (newBid != null) { payload.bid = newBid; payload.bid_dealer = 'MS' }
      if (newAsk != null) { payload.ask = newAsk; payload.ask_dealer = 'MS' }

      supabase.from('prices')
        .upsert(payload, { onConflict: 'series_number,tranche_name' })
        .then(({ error }) => {
          if (!error) snaps[key].lastAppliedAdj = tickAdj
          else console.warn('[auto-adj] upsert failed:', error.message)
        })

      flashRowEffect(key, tickAdj < 0 ? 'red' : 'green')
      adjCount++
    }

    if (adjCount > 0) {
      const firstSnap = Object.values(snaps)[0]
      const dir = firstSnap ? (newCdxHy > firstSnap.cdxHyAtEntry ? '↑' : '↓') : ''
      setAutoAdjMsg(`[${fmtTime(new Date().toISOString())}] AUTO-ADJ ${adjCount} MS price${adjCount !== 1 ? 's' : ''} — CDX HY ${dir}${newCdxHy.toFixed(2)}`)
    }
  }

  function showError(msg: string) {
    if (errorTimer.current) clearTimeout(errorTimer.current)
    setCellError(msg)
    errorTimer.current = setTimeout(() => { setCellError(''); errorTimer.current = null }, 3000)
  }

  // ── Bulk price input ──────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parsedBulk = useMemo(() => parseBulkLines(bulkText), [bulkText])

  async function submitBulkPrices() {
    if (!selectedDealer) { showError('Select a dealer first'); return }
    setBulkSubmitting(true)
    setBulkResult(null)
    const dealer = selectedDealer
    let postedBids = 0, postedAsks = 0
    const changes: { label: string; side: string; from: string; to: string }[] = []
    try {
      for (const r of parsedBulk) {
        const sz = bulkSize.trim() || String(DEFAULT_SIZE[r.tranche] ?? 5)
        const existing = prices[`${r.series}:${r.tranche}`]
        // Best-bid / best-offer guard: a different dealer can only replace an
        // existing price if their price is strictly better.
        // Ticks: better bid = higher, better offer = lower
        // Spread: better bid = lower (tighter spread), better offer = higher (wider spread)
        const isSpreadMode = r.mode === 'spread' || existing?.mode === 'spread'
        const canPostBid = r.bid != null && (
          existing?.bid == null || existing.bid_dealer === dealer ||
          (isSpreadMode ? r.bid < existing.bid : r.bid > existing.bid)
        )
        const canPostAsk = r.ask != null && (
          existing?.ask == null || existing.ask_dealer === dealer ||
          (isSpreadMode ? r.ask > existing.ask : r.ask < existing.ask)
        )
        const upsertRow: Record<string, unknown> = {
          series_number: r.series, tranche_name: r.tranche, mode: r.mode,
        }
        if (canPostBid) { upsertRow.bid = r.bid; upsertRow.bid_dealer = dealer; upsertRow.bid_size = sz }
        if (canPostAsk) { upsertRow.ask = r.ask; upsertRow.ask_dealer = dealer; upsertRow.ask_size = sz }
        if (!canPostBid && !canPostAsk) continue
        const { error: priceErr } = await supabase.from('prices').upsert(upsertRow, { onConflict: 'series_number,tranche_name' })
        if (!priceErr) {
          const label = `${r.tranche}.${r.series}`
          if (canPostBid) {
            postedBids++
            changes.push({ label, side: 'bid', from: existing?.bid != null ? formatPx(existing.bid, existing.mode) : '—', to: formatPx(r.bid!, r.mode) })
          }
          if (canPostAsk) {
            postedAsks++
            changes.push({ label, side: 'ask', from: existing?.ask != null ? formatPx(existing.ask, existing.mode) : '—', to: formatPx(r.ask!, r.mode) })
          }
        } else {
          console.warn('[bulk upsert]', priceErr.message)
        }
        const auditRows: object[] = []
        const sz2 = bulkSize.trim() || String(DEFAULT_SIZE[r.tranche] ?? 5)
        if (canPostBid) auditRows.push({ series_number: r.series, tranche_name: r.tranche, dealer, side: 'bid', price: r.bid, size: sz2, mode: r.mode, spx_at_time: latestSpxRef.current, cdx_hy_at_time: latestCdxRef.current.hy, cdx_ig_at_time: latestCdxRef.current.ig })
        if (canPostAsk) auditRows.push({ series_number: r.series, tranche_name: r.tranche, dealer, side: 'ask', price: r.ask, size: sz2, mode: r.mode, spx_at_time: latestSpxRef.current, cdx_hy_at_time: latestCdxRef.current.hy, cdx_ig_at_time: latestCdxRef.current.ig })
        if (auditRows.length > 0) {
          const { error: auditErr } = await supabase.from('price_changes').insert(auditRows)
          if (auditErr) console.warn('[bulk price_changes]', auditErr.message)
        }
      }
      // MS bulk — snapshot CDX HY for every submitted row
      if (dealer === 'MS' && latestCdxRef.current.hy != null) {
        const hy = latestCdxRef.current.hy
        for (const r of parsedBulk) {
          msSnapshotsRef.current[`${r.series}:${r.tranche}`] = {
            cdxHyAtEntry:   hy,
            bidAtEntry:     r.bid,
            askAtEntry:     r.ask,
            modeAtEntry:    r.mode,
            lastAppliedAdj: 0,
          }
        }
      }
      priceRefreshRef.current?.send({ type: 'broadcast', event: 'price-saved', payload: {} })
      setBulkResult({ bids: postedBids, asks: postedAsks, changes })
      setBulkText('')
    } finally {
      setBulkSubmitting(false)
    }
  }

  // ── Dealer pull / restore ─────────────────────────────────────────────────
  function dealerLiveCount(code: string): number {
    return Object.values(prices).filter(p => p.bid_dealer === code || p.ask_dealer === code).length
  }

  const TIMEOUT_STORAGE_KEY = 'cmbx_dealer_timeouts'

  function saveTimeoutsToStorage(updated: typeof pulledPrices) {
    try { localStorage.setItem(TIMEOUT_STORAGE_KEY, JSON.stringify(updated)) } catch {}
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
      if (hasBid) {
        await supabase.from('price_queue').delete()
          .eq('series_number', series_number).eq('tranche_name', tranche_name).eq('side', 'bid').eq('dealer', code)
        await recomputePricesRow(series_number, tranche_name, 'bid')
      }
      if (hasAsk) {
        await supabase.from('price_queue').delete()
          .eq('series_number', series_number).eq('tranche_name', tranche_name).eq('side', 'ask').eq('dealer', code)
        await recomputePricesRow(series_number, tranche_name, 'ask')
      }
    }
    if (snapshot.length > 0) {
      setPulledPrices(prev => {
        const updated = { ...prev, [code]: snapshot }
        saveTimeoutsToStorage(updated)
        return updated
      })
    }
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
    setPulledPrices(prev => {
      const updated = { ...prev }
      delete updated[code]
      saveTimeoutsToStorage(updated)
      return updated
    })
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
    const sz            = isHit ? (prices[rowKey]?.bid_size ?? null)    : (prices[rowKey]?.ask_size ?? null)

    if (px == null) { shake(); showError(isHit ? 'No bid posted on this tranche' : 'No offer posted on this tranche'); return }

    // FIFO: get the first queue entry at the best price; fall back to prices table dealer
    const tradeSide = isHit ? 'bid' : 'ask'
    const { data: queueEntries } = await supabase
      .from('price_queue').select('*')
      .eq('series_number', seriesNum).eq('tranche_name', trancheName).eq('side', tradeSide)
      .order('created_at', { ascending: true })

    const fifoEntry = (queueEntries ?? []).find((e: PriceQueueEntry) => e.price === px) ?? (queueEntries ?? [])[0] ?? null
    const passiveDealer = fifoEntry?.dealer ?? (isHit ? (prices[rowKey]?.bid_dealer ?? null) : (prices[rowKey]?.ask_dealer ?? null))
    const tradeSz = fifoEntry ? fifoEntry.size : sz

    if (dealer === passiveDealer) { shake(); showError(`${dealer} cannot ${isHit ? 'hit' : 'lift'} their own price`); return }

    await supabase.from('trades').insert({ series_number: seriesNum, tranche_name: trancheName, side, price: px, dealer, passive_dealer: passiveDealer, trade_size: tradeSz, spx_at_time: latestSpxRef.current, cdx_hy_at_time: latestCdxRef.current.hy, cdx_ig_at_time: latestCdxRef.current.ig })
    await supabase.from('prices').upsert({ series_number: seriesNum, tranche_name: trancheName, last_trade_px: px, last_trade_time: new Date().toISOString() }, { onConflict: 'series_number,tranche_name' })

    if (fifoEntry) {
      await supabase.from('price_queue').delete().eq('id', fifoEntry.id)
      await recomputePricesRow(seriesNum, trancheName, tradeSide)
    } else {
      const clearFields = isHit
        ? { bid: null, bid_dealer: null, bid_size: null }
        : { ask: null, ask_dealer: null, ask_size: null }
      await supabase.from('prices').update(clearFields).eq('series_number', seriesNum).eq('tranche_name', trancheName)
    }
    flashRowEffect(rowKey, isHit ? 'red' : 'green', 30000, isHit ? 'bid' : 'ask')
  }

  function renderEditCell(key: string, field: EditField, displayValue: React.ReactNode, tdStyle: React.CSSProperties, flashBg?: string) {
    const isEditing = editingCell?.key === key && editingCell.field === field
    const isHovered = hoveredCell?.key === key && hoveredCell.field === field
    const price = prices[key]
    const rawVal = field === 'bid' ? price?.bid : field === 'ask' ? price?.ask : field === 'bid_size' ? price?.bid_size : price?.ask_size
    const isEmpty = rawVal == null

    const cellBg = isEditing ? '#1a1a00' : flashBg ?? 'transparent'
    const cellBorder = isEditing
      ? '1px solid #f0c040'
      : isHovered
      ? '1px solid #554400'
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
            setEditValue(price?.mode === 'spread' ? formatPx(rawVal as number, 'spread') : fmt32nds(rawVal as number))
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

  function handleSaveTheme(t: Theme) {
    setTheme(t)
    setShowSettings(false)
    saveTheme(t)
  }

  return (
    <div style={{ background: theme.bg, color: theme.fg, fontFamily: 'Courier New, monospace', fontSize: '15px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {showSettings && <ThemePanel theme={theme} onSave={handleSaveTheme} onClose={() => setShowSettings(false)} />}
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-4px)}
          40%{transform:translateX(4px)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: inline-block !important; }
        }
      `}</style>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <span style={{ color: theme.accent, fontSize: '15px', letterSpacing: '2px', fontWeight: 700 }}>
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
          {cdxLiveHy != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#0e0900', border: '1px solid #3a2a00', padding: '1px 7px', borderRadius: '2px' }}>
              <span style={{ color: '#ff8844', fontSize: '11px', letterSpacing: '1px' }}>HY</span>
              <span style={{ color: '#ffaa55', fontSize: '13px', fontWeight: 700 }}>{cdxLiveHy.toFixed(2)}</span>
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: agentOnline ? '#66ff88' : '#444', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: '#555', fontSize: '13px' }}>AGENT</span>
          </span>
          <span
            title={rtOk ? 'Realtime connected' : 'Realtime disconnected — polling fallback active'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'default' }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: rtOk ? '#44cc44' : '#ff5555', display: 'inline-block', flexShrink: 0, boxShadow: rtOk ? '0 0 4px #44cc44' : '0 0 4px #ff5555' }} />
            <span style={{ color: '#555', fontSize: '13px' }}>{rtOk ? 'RT' : 'POLL'}</span>
          </span>
          <a href="/dashboard/market" style={{ color: '#555', fontSize: '15px', border: '1px solid #2a2a2a', padding: '2px 8px', textDecoration: 'none', borderRadius: '2px' }}>
            MARKET
          </a>
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
          <button
            onClick={() => {
              if (!window.confirm('Sign out ALL connected users? They will be redirected to the login page.')) return
              forceLogoutRef.current?.send({ type: 'broadcast', event: 'force-logout', payload: {} })
              clearSession()
              window.location.replace('/login')
            }}
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
            onMouseEnter={e => { e.currentTarget.style.color = '#ff5555'; e.currentTarget.style.borderColor = '#ff333344' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#2a2a2a' }}
            title="Force all connected users to log out immediately"
          >
            SIGN OUT ALL
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <NavTabs active="admin" isTrader={true} accent={theme.accent} bg={theme.bg} fg={theme.fg} onSettings={() => setShowSettings(true)} />

      {/* Dealer + action — single combined row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', padding: '3px 10px', gap: '3px', borderBottom: '1px solid #1e1e1e', flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Dealer buttons with pull/restore badges */}
        {DEALERS.map(code => {
          const count    = dealerLiveCount(code)
          const isPulled = !!pulledPrices[code]?.length
          const s        = DEALER_INACTIVE[code]
          return (
            <div key={code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
              <button onClick={() => handleDealerClick(code)} style={dealerButtonStyle(code, selectedDealer === code)}>
                {code}
              </button>
              {isPulled ? (
                <button onClick={() => restoreDealerPrices(code)} title={`Restore ${pulledPrices[code].length} ${code} prices`}
                  style={{ background: '#0a2a0a', color: '#66ff88', border: '1px solid #44aa44', padding: '2px 6px', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontWeight: 700, letterSpacing: '0.5px' }}>
                  ↩ IN ({pulledPrices[code].length})
                </button>
              ) : count > 0 ? (
                <button onClick={() => pullDealerPrices(code)} title={`Pull all ${count} ${code} prices`}
                  style={{ background: '#1a0a0a', color: '#ff8888', border: '1px solid #883333', padding: '2px 6px', fontSize: '11px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap', fontWeight: 700, letterSpacing: '0.5px' }}>
                  ↓ OUT ({count})
                </button>
              ) : <span style={{ height: '20px' }} />}
            </div>
          )
        })}

        {/* Selected / error */}
        <span style={{ fontSize: '13px', color: selectedDealer ? '#f0c040' : '#333', alignSelf: 'center', marginLeft: '6px', whiteSpace: 'nowrap' }}>
          {selectedDealer ?? '—'}
        </span>
        {cellError && <span style={{ color: '#ff4444', fontSize: '12px', alignSelf: 'center', marginLeft: '4px' }}>{cellError}</span>}

        {/* Divider */}
        <span style={{ color: '#2a2a2a', alignSelf: 'center', padding: '0 4px' }}>│</span>

        {/* HIT / LIFT / BULK */}
        <button onClick={() => executeTrade('hit')}
          style={{ background: theme.ask + '22', color: theme.ask, border: `1px solid ${theme.ask}88`, padding: '2px 10px', fontSize: '13px', fontFamily: 'Courier New, monospace', borderRadius: '2px', cursor: 'pointer', fontWeight: 700, alignSelf: 'center', animation: hitShake ? 'shake 0.5s ease' : 'none' }}>
          HIT
        </button>
        <button onClick={() => executeTrade('lift')}
          style={{ background: theme.bid + '22', color: theme.bid, border: `1px solid ${theme.bid}88`, padding: '2px 10px', fontSize: '13px', fontFamily: 'Courier New, monospace', borderRadius: '2px', cursor: 'pointer', fontWeight: 700, alignSelf: 'center', animation: liftShake ? 'shake 0.5s ease' : 'none' }}>
          LIFT
        </button>
        <button onClick={() => { setBulkText(''); setBulkResult(null); setShowBulkInput(true) }}
          style={{ background: '#0a1a0a', color: '#66ff88', border: '1px solid #336633', padding: '2px 10px', fontSize: '13px', fontFamily: 'Courier New, monospace', borderRadius: '2px', cursor: 'pointer', fontWeight: 700, alignSelf: 'center' }}>
          BULK
        </button>

        {/* Right-side controls */}
        <button onClick={() => setShowEmptyRows(v => !v)}
          style={{ marginLeft: 'auto', background: showEmptyRows ? '#1a1a00' : 'transparent', color: showEmptyRows ? '#f0c040' : '#3a3a3a', border: `1px solid ${showEmptyRows ? '#f0c040' : '#222'}`, padding: '2px 7px', fontSize: '10px', fontFamily: 'Courier New, monospace', cursor: 'pointer', borderRadius: '2px', alignSelf: 'center' }}>
          {showEmptyRows ? 'HIDE∅' : 'SHOW∅'}
        </button>

        {!confirmClear ? (
          <button onClick={() => setConfirmClear(true)}
            style={{ background: '#1a0000', color: '#cc4444', border: '1px solid #662222', padding: '2px 10px', fontSize: '13px', fontFamily: 'Courier New, monospace', borderRadius: '2px', cursor: 'pointer', fontWeight: 700, alignSelf: 'center', letterSpacing: '1px' }}>
            CLEAR ALL
          </button>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', alignSelf: 'center' }}>
            <span style={{ color: '#ff4444', fontSize: '12px', fontWeight: 700 }}>CLEAR ALL PRICES?</span>
            <button onClick={clearAllPrices} style={{ background: '#3a0000', color: '#ff6666', border: '1px solid #aa3333', padding: '2px 10px', fontSize: '13px', fontFamily: 'Courier New, monospace', borderRadius: '2px', cursor: 'pointer', fontWeight: 700 }}>YES</button>
            <button onClick={() => setConfirmClear(false)} style={{ background: '#111', color: '#555', border: '1px solid #333', padding: '2px 10px', fontSize: '13px', fontFamily: 'Courier New, monospace', borderRadius: '2px', cursor: 'pointer' }}>NO</button>
          </span>
        )}
      </div>

      {/* Dealer filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderBottom: '1px solid #111', flexShrink: 0, background: '#080808' }}>
        <span style={{ color: '#2a2a2a', fontSize: '11px', letterSpacing: '1px', marginRight: '2px' }}>FILTER</span>
        {DEALERS.map(code => {
          const isActive = filterDealer === code
          const s = DEALER_INACTIVE[code]
          return (
            <button
              key={code}
              onClick={() => setFilterDealer(prev => prev === code ? null : code)}
              style={{
                background: isActive ? s.bg : 'transparent',
                color: isActive ? s.color : '#2e2e2e',
                border: `1px solid ${isActive ? s.border : '#1a1a1a'}`,
                padding: '1px 7px',
                fontSize: '11px',
                fontFamily: 'Courier New, monospace',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              {code}
            </button>
          )
        })}
        {filterDealer && (
          <button
            onClick={() => setFilterDealer(null)}
            style={{ background: 'transparent', border: 'none', color: '#444', fontSize: '11px', cursor: 'pointer', fontFamily: 'Courier New, monospace', marginLeft: '2px' }}
          >
            × clear
          </button>
        )}
        {filterDealer && (
          <span style={{ color: '#444', fontSize: '11px', marginLeft: '6px' }}>
            showing {filterDealer} only
          </span>
        )}
        {filterDealer && (
          <button
            onClick={() => {
              const now = new Date()
              const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
              const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' })
              const lines: string[] = [`CMBX MARKETS — ${dateStr}  ${timeStr} ET`, '']
              for (const s of series) {
                for (const t of tranches) {
                  const key = `${s.series_number}:${t.tranche_name}`
                  const price = prices[key]
                  if (!price) continue
                  const hasBid = price.bid_dealer === filterDealer && price.bid != null
                  const hasAsk = price.ask_dealer === filterDealer && price.ask != null
                  if (!hasBid && !hasAsk) continue
                  const bid = hasBid ? formatPx(price.bid, price.mode) : '—'
                  const ask = hasAsk ? formatPx(price.ask, price.mode) : '—'
                  const tranche = `${t.tranche_name}.${s.series_number}`
                  lines.push(`${tranche.padEnd(12)}${bid.padStart(8)} / ${ask.padStart(7)}`)
                }
              }
              navigator.clipboard.writeText(lines.join('\n'))
              setFilterCopyFlash(true)
              setTimeout(() => setFilterCopyFlash(false), 1200)
            }}
            style={{
              marginLeft: '8px',
              background: filterCopyFlash ? '#1a3a1a' : 'transparent',
              color: filterCopyFlash ? '#44ff44' : '#555',
              border: `1px solid ${filterCopyFlash ? '#44ff44' : '#2a2a2a'}`,
              padding: '1px 10px',
              fontSize: '11px',
              fontFamily: 'Courier New, monospace',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
            }}
          >
            {filterCopyFlash ? 'COPIED ✓' : 'COPY'}
          </button>
        )}
      </div>

      {/* Grid + Blotter */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.75px' }}>
          <thead>
            <tr style={{ color: '#ffffff', fontSize: '12.75px', position: 'sticky', top: 0, background: theme.bg, zIndex: 1 } as React.CSSProperties}>
              <th style={{ textAlign: 'left',   padding: '3px 8px 3px 12px', borderBottom: '1px solid #1e1e1e', width: '160px', fontWeight: 700 }}>TRANCHE</th>
              <th style={{ textAlign: 'center', padding: '3px 8px',  borderBottom: '1px solid #1e1e1e', minWidth: '70px',  fontWeight: 700 }}>SIZE</th>
              <th style={{ textAlign: 'center', padding: '3px 10px', borderBottom: `2px solid ${theme.bid}`, minWidth: '100px', fontWeight: 700 }}>BID</th>
              <th style={{ textAlign: 'center', padding: '3px 10px', borderBottom: `2px solid ${theme.ask}`, minWidth: '100px', fontWeight: 700 }}>OFFER</th>
              <th style={{ textAlign: 'center', padding: '3px 8px',  borderBottom: '1px solid #1e1e1e', minWidth: '70px',  fontWeight: 700 }}>SIZE</th>
              <th style={{ textAlign: 'right',  padding: '3px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '120px', fontWeight: 700 }}>LST TRADE PX</th>
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
                    colSpan={6}
                    style={{
                      padding: '3px 12px 2px 10px',
                      color: theme.accent,
                      background: '#0e0e0e',
                      fontSize: '12.75px',
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
                  const p = prices[`${s.series_number}:${t.tranche_name}`]
                  if (filterDealer) {
                    return p?.bid_dealer === filterDealer || p?.ask_dealer === filterDealer
                  }
                  const hasPrice = p?.bid != null || p?.ask != null
                  if (isCollapsed) return hasPrice
                  return showEmptyRows ? true : hasPrice
                }).map((t, tIdx) => {
                  const rowKey = `${s.series_number}:${t.tranche_name}`
                  const price = prices[rowKey]
                  const isActive = selectedRow === rowKey
                  const flash = flashRows[rowKey]
                  const flashSide = flashSides[rowKey]
                  const isOdd = tIdx % 2 === 1
                  const rowQueueBid = priceQueue.filter(e => e.series_number === s.series_number && e.tranche_name === t.tranche_name && e.side === 'bid')
                  const rowQueueAsk = priceQueue.filter(e => e.series_number === s.series_number && e.tranche_name === t.tranche_name && e.side === 'ask')
                  const hasQueue = rowQueueBid.length > 1 || rowQueueAsk.length > 1
                  const isQueueExpanded = expandedQueueRows.has(rowKey)

                  const isRowHovered = hoveredCell?.key === rowKey
                  let rowBg = isActive ? '#1a1500' : isRowHovered ? '#2a1e00' : isOdd ? '#0d0d0d' : 'transparent'
                  if (flash && flashSide === 'row' && flash === 'red') rowBg = '#3a0000'
                  if (flash && flashSide === 'row' && flash === 'green') rowBg = '#003a00'

                  const ghost   = ghostPrices[rowKey]
                  const bidTag  = price?.bid_dealer && DEALER_INACTIVE[price.bid_dealer] ? DEALER_INACTIVE[price.bid_dealer] : null
                  const askTag  = price?.ask_dealer && DEALER_INACTIVE[price.ask_dealer] ? DEALER_INACTIVE[price.ask_dealer] : null
                  // Ghost: show last known value in grey when current is null
                  const ghostBid = price?.bid == null ? ghost?.bid : undefined
                  const ghostAsk = price?.ask == null ? ghost?.ask : undefined
                  const ghostMode = ghost?.mode
                  // In filter mode, only show bid/ask if this dealer owns that side
                  const showBid = !filterDealer || price?.bid_dealer === filterDealer
                  const showAsk = !filterDealer || price?.ask_dealer === filterDealer

                  const bidCell = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'center', width: '100%' }}>
                      {showBid && price?.bid != null ? (
                        <>
                          <span style={{ color: '#ffffff' }}>{formatPx(price.bid, price.mode)}</span>
                          {bidTag && <span style={{ background: bidTag.bg, color: bidTag.color, fontSize: '10px', padding: '0 3px', borderRadius: '2px', fontWeight: 600 }}>{price.bid_dealer}</span>}
                        </>
                      ) : showBid && ghostBid != null ? (
                        <span style={{ color: '#484848', fontStyle: 'italic' }}>{formatPx(ghostBid, ghostMode)}</span>
                      ) : (
                        <span style={{ color: '#2a2a2a' }}>—</span>
                      )}
                    </span>
                  )

                  const askCell = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'center', width: '100%' }}>
                      {showAsk && price?.ask != null ? (
                        <>
                          <span style={{ color: '#ffffff' }}>{formatPx(price.ask, price.mode)}</span>
                          {askTag && <span style={{ background: askTag.bg, color: askTag.color, fontSize: '10px', padding: '0 3px', borderRadius: '2px', fontWeight: 600 }}>{price.ask_dealer}</span>}
                        </>
                      ) : showAsk && ghostAsk != null ? (
                        <span style={{ color: '#484848', fontStyle: 'italic' }}>{formatPx(ghostAsk, ghostMode)}</span>
                      ) : (
                        <span style={{ color: '#2a2a2a' }}>—</span>
                      )}
                    </span>
                  )

                  const bszCell = <span style={{ color: price?.bid_size != null ? '#ffffff' : '#2a2a2a' }}>{price?.bid_size ?? '—'}</span>
                  const aszCell = <span style={{ color: price?.ask_size != null ? '#ffffff' : '#2a2a2a' }}>{price?.ask_size ?? '—'}</span>

                  return (
                    <Fragment key={rowKey}>
                    <tr
                      onClick={() => setSelectedRow(prev => prev === rowKey ? null : rowKey)}
                      style={{ background: rowBg, borderBottom: '1px solid #161616', cursor: 'pointer' }}
                    >
                      <td
                        style={{ padding: '1px 8px 1px 12px', color: '#ffffff', whiteSpace: 'nowrap', width: '160px', fontWeight: 700 }}
                        onClick={hasQueue ? (e) => { e.stopPropagation(); toggleQueueExpand(rowKey) } : undefined}
                      >
                        {hasQueue && <span style={{ color: '#f0c040', fontSize: '10px', marginRight: '4px' }}>{isQueueExpanded ? '▼' : '▶'}</span>}
                        {`${t.tranche_name}.${s.series_number}`}
                      </td>
                      {renderEditCell(rowKey, 'bid_size', bszCell, { textAlign: 'center', padding: '1px 8px' })}
                      {renderEditCell(rowKey, 'bid', bidCell, { textAlign: 'center', padding: '1px 10px', borderLeft: '2px solid #1a3a1a' }, flash && flashSide === 'bid' ? '#3a0000' : undefined)}
                      {renderEditCell(rowKey, 'ask', askCell, { textAlign: 'center', padding: '1px 10px', borderLeft: '2px solid #3a1a1a' }, flash && flashSide === 'ask' ? '#003a00' : undefined)}
                      {renderEditCell(rowKey, 'ask_size', aszCell, { textAlign: 'center', padding: '1px 8px' })}
                      <td style={{ textAlign: 'right', padding: '1px 10px' }}>
                        {price?.last_trade_px != null ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                            <span style={{ color: '#888' }}>{formatPx(price.last_trade_px, price.mode)}</span>
                            {price.last_trade_time && (
                              <span style={{ color: '#444', fontSize: '10px' }}>{fmtTime(price.last_trade_time)}</span>
                            )}
                          </div>
                        ) : <span style={{ color: '#2a2a2a' }}>—</span>}
                      </td>
                    </tr>
                    {isQueueExpanded && rowQueueBid.length > 1 && rowQueueBid.map((entry, i) => (
                      <tr key={`q-bid-${entry.id}`} style={{ background: '#060610', borderBottom: '1px solid #0f0f1a' }}>
                        <td style={{ padding: '1px 8px 1px 28px', color: '#555', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          #{i + 1} <span style={{ color: '#88aaff', fontWeight: 600 }}>{entry.dealer}</span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '1px 8px', color: '#666', fontSize: '11px' }}>{entry.size}</td>
                        <td style={{ textAlign: 'center', padding: '1px 10px', borderLeft: '2px solid #0f2a0f', color: '#aaccaa', fontSize: '11px' }}>{formatPx(entry.price, entry.mode)}</td>
                        <td colSpan={3} />
                      </tr>
                    ))}
                    {isQueueExpanded && rowQueueAsk.length > 1 && rowQueueAsk.map((entry, i) => (
                      <tr key={`q-ask-${entry.id}`} style={{ background: '#100606', borderBottom: '1px solid #1a0f0f' }}>
                        <td style={{ padding: '1px 8px 1px 28px', color: '#555', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          #{i + 1} <span style={{ color: '#ffaaaa', fontWeight: 600 }}>{entry.dealer}</span>
                        </td>
                        <td colSpan={2} />
                        <td style={{ textAlign: 'center', padding: '1px 10px', borderLeft: '2px solid #2a0f0f', color: '#ccaaaa', fontSize: '11px' }}>{formatPx(entry.price, entry.mode)}</td>
                        <td style={{ padding: '1px 8px', color: '#666', fontSize: '11px' }}>{entry.size}</td>
                        <td />
                      </tr>
                    ))}
                    </Fragment>
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
          <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e1e1e', color: theme.accent, fontSize: '13px', letterSpacing: '2px', fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                  <div style={{ color: '#ccc', fontSize: '13px' }}>{t.tranche}.{t.series}</div>
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
                      <span style={{ marginLeft: 'auto', color: '#888', fontSize: '12px' }}>@ {formatPx(t.price, null)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
                    <button
                      onClick={() => { setConfirmTrade(t); setConfirmSpread('') }}
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

      {/* Bulk Price Input Modal */}
      {showBulkInput && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowBulkInput(false) }}>
          <div style={{ background: '#0d0d0d', border: '1px solid #f0c040', padding: '20px 24px', width: '520px', maxHeight: '85vh', overflow: 'auto', borderRadius: '3px', fontFamily: 'Courier New, monospace' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ color: theme.accent, fontSize: '15px', letterSpacing: '2px', fontWeight: 700 }}>BULK PRICE INPUT</span>
              <button onClick={() => setShowBulkInput(false)} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: '18px', cursor: 'pointer', fontFamily: 'Courier New', padding: '0 4px' }}>×</button>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <span style={{ color: '#888', fontSize: '13px' }}>
                DEALER: <span style={{ color: selectedDealer ? '#f0c040' : '#ff4444', fontWeight: 700 }}>{selectedDealer ?? 'NONE SELECTED'}</span>
              </span>
              <span style={{ color: '#888', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                SIZE OVERRIDE:
                <input
                  value={bulkSize}
                  onChange={e => setBulkSize(e.target.value)}
                  placeholder="auto"
                  style={{ background: '#111', color: '#ccc', border: '1px solid #333', fontFamily: 'Courier New, monospace', fontSize: '13px', padding: '1px 6px', width: '60px', outline: 'none' }}
                />
              </span>
            </div>

            {/* Textarea */}
            <textarea
              autoFocus
              value={bulkText}
              onChange={e => { setBulkText(e.target.value); setBulkResult(null) }}
              rows={8}
              placeholder=""
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#080808', color: '#ccc',
                border: '1px solid #333', fontFamily: 'Courier New, monospace',
                fontSize: '14px', padding: '10px', resize: 'vertical', outline: 'none',
                lineHeight: '1.6',
              }}
            />

            {/* Counts */}
            {bulkText.trim() && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666', display: 'flex', gap: '16px' }}>
                <span>{bulkText.split('\n').filter(l => l.trim()).length} tranches detected</span>
                <span style={{ color: parsedBulk.length > 0 ? '#aaa' : '#555' }}>
                  {parsedBulk.filter(r => r.bid != null).length} bids, {parsedBulk.filter(r => r.ask != null).length} offers parsed
                </span>
              </div>
            )}

            {/* Live parse preview */}
            {parsedBulk.length > 0 && (
              <div style={{ marginTop: '10px', border: '1px solid #1e1e1e', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ background: '#0c0c0c', padding: '4px 10px', borderBottom: '1px solid #1e1e1e' }}>
                  <span style={{ color: '#f0c040', fontSize: '11px', letterSpacing: '1px' }}>PREVIEW — {selectedDealer ?? '?'}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <tbody>
                    {parsedBulk.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#0a0a0a' : '#0d0d0d', borderBottom: '1px solid #141414' }}>
                        <td style={{ padding: '3px 10px', color: '#888' }}>{`${r.tranche}.${r.series}`}</td>
                        <td style={{ padding: '3px 10px', color: '#66ff88', textAlign: 'center', fontWeight: 700 }}>{formatPx(r.bid, r.mode)}</td>
                        <td style={{ padding: '3px 4px', color: '#444', textAlign: 'center' }}>/</td>
                        <td style={{ padding: '3px 10px', color: '#ff8888', textAlign: 'center', fontWeight: 700 }}>{formatPx(r.ask, r.mode)}</td>
                        <td style={{ padding: '3px 10px', color: '#555', textAlign: 'right', fontSize: '11px' }}>{bulkSize.trim() || String(DEFAULT_SIZE[r.tranche] ?? 5)}MM</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Parse errors hint */}
            {bulkText.trim() && parsedBulk.length === 0 && (
              <div style={{ marginTop: '10px', color: '#ff4444', fontSize: '12px' }}>
                No valid lines found — paste Kamil's message exactly as received.
              </div>
            )}

            {/* Post-submit result */}
            {bulkResult && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ color: '#66ff88', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  ✓ {bulkResult.bids} bids, {bulkResult.asks} offers posted
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <tbody>
                    {bulkResult.changes.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #141414' }}>
                        <td style={{ padding: '2px 8px', color: '#888' }}>{c.label}</td>
                        <td style={{ padding: '2px 8px', color: '#555', width: '36px' }}>{c.side}</td>
                        <td style={{ padding: '2px 8px', color: '#666', textAlign: 'right', fontWeight: 700 }}>{c.from}</td>
                        <td style={{ padding: '2px 6px', color: '#444', textAlign: 'center' }}>→</td>
                        <td style={{ padding: '2px 8px', color: '#66ff88', textAlign: 'left', fontWeight: 700 }}>{c.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', alignItems: 'center' }}>
              <button
                onClick={submitBulkPrices}
                disabled={parsedBulk.length === 0 || !selectedDealer || bulkSubmitting}
                style={{
                  background: parsedBulk.length > 0 && selectedDealer ? '#0a2a0a' : '#111',
                  color: parsedBulk.length > 0 && selectedDealer ? '#66ff88' : '#444',
                  border: `1px solid ${parsedBulk.length > 0 && selectedDealer ? '#336633' : '#2a2a2a'}`,
                  padding: '5px 20px', fontSize: '15px', fontFamily: 'Courier New, monospace',
                  borderRadius: '2px', cursor: parsedBulk.length > 0 && selectedDealer ? 'pointer' : 'default',
                  fontWeight: 700,
                }}
              >
                {bulkSubmitting ? 'SUBMITTING...' : `SUBMIT ${parsedBulk.length > 0 ? `— ${parsedBulk.filter(r=>r.bid!=null).length} bids, ${parsedBulk.filter(r=>r.ask!=null).length} offers` : ''}`}
              </button>
              <button
                onClick={() => { setShowBulkInput(false); setBulkText(''); setBulkResult(null) }}
                style={{ background: 'transparent', color: '#555', border: '1px solid #2a2a2a', padding: '5px 16px', fontSize: '15px', fontFamily: 'Courier New, monospace', borderRadius: '2px', cursor: 'pointer' }}
              >
                CANCEL
              </button>
              {!selectedDealer && (
                <span style={{ color: '#ff4444', fontSize: '12px', marginLeft: '4px' }}>select a dealer first</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmTrade && (() => {
        const t = confirmTrade

        // ── Computed fields ───────────────────────────────────────────────────
        const now        = new Date()
        const tradeDate  = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        // Settlement = T+3 business days (skip weekends; no holiday calendar)
        const settlDate  = (() => {
          const d = new Date(now); let added = 0
          while (added < 3) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) added++ }
          return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        })()
        const coupon     = COUPON_BPS[t.tranche] ?? 0
        const notional   = t.trade_size ? t.trade_size * 1_000_000 : null
        const maturity   = MATURITY_DATE[t.series] ?? '—'
        const index      = `CMBX.NA.${t.tranche}.${t.series}`
        const feePerMM   = FACILITATION_FEE_PER_MM[t.tranche] ?? 115
        const facFee     = notional ? `$${(notional / 1_000_000 * feePerMM).toLocaleString()}` : '—'
        const priceDecimal = t.price != null ? fmt32nds(t.price) : '—'

        // ── Protection Buyer = Seller of Risk (SHORT) ─────────────────────────
        // LIFT: active dealer lifts ask → active = Protection Buyer (Seller of Risk)
        //                                 passive = Protection Seller (Buyer of Risk)
        // HIT:  active dealer hits bid  → active = Protection Seller (Buyer of Risk)
        //                                 passive = Protection Buyer (Seller of Risk)
        const protBuyerCode  = t.action === 'LIFT' ? t.dealer              : (t.passive_dealer ?? '—')
        const protSellerCode = t.action === 'LIFT' ? (t.passive_dealer ?? '—') : t.dealer
        const protBuyerInfo  = DEALER_INFO[protBuyerCode]
        const protSellerInfo = DEALER_INFO[protSellerCode]

        // ── Upfront PV: (100 − Price) / 100 × Notional ───────────────────────
        // Only valid for dollar-price mode. Spread (bps) trades have no upfront PV.
        // Positive (price < 100): Protection Seller pays to Protection Buyer
        // Negative (price > 100): Protection Buyer pays to Protection Seller
        const isDollarPrice = t.mode === 'price' || t.mode === 'ticks'
        const pvRaw      = (isDollarPrice && t.price != null && notional) ? ((100 - t.price) / 100) * notional : null
        const pvFmt      = pvRaw != null ? `$${Math.round(Math.abs(pvRaw)).toLocaleString()}` : '—'
        const pvCalcStr  = (isDollarPrice && t.price != null && notional)
          ? `(100-00 − ${fmt32nds(t.price)}) / 100 × $${notional.toLocaleString()}`
          : t.mode === 'spread' ? 'N/A — spread-priced trade' : ''
        // Who pays / receives
        const upfrontPayer    = pvRaw == null ? '—'
          : pvRaw >= 0 ? (protSellerInfo?.legal ?? protSellerCode)  // price ≤ 100: Prot Seller pays
          : (protBuyerInfo?.legal  ?? protBuyerCode)                // price > 100: Prot Buyer pays
        const upfrontReceiver = pvRaw == null ? '—'
          : pvRaw >= 0 ? (protBuyerInfo?.legal  ?? protBuyerCode)
          : (protSellerInfo?.legal ?? protSellerCode)

        // ── PDF download — open clean HTML blob in new tab and auto-print ────
        function downloadPdf() {
          const el = document.getElementById('confirm-doc')
          if (!el) return
          const clone = el.cloneNode(true) as HTMLElement
          clone.querySelectorAll('.no-print').forEach(n => n.remove())
          clone.querySelectorAll<HTMLElement>('.print-only').forEach(n => { n.style.display = '' })

          const css = `
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Georgia, "Times New Roman", serif; font-size: 13px;
                   color: #222; background: #fff; padding: 40px 48px; }
            table { border-collapse: collapse; width: 100%; }
            @page { margin: 14mm 16mm; size: A4 portrait; }
          `

          // Write into a hidden iframe and trigger print — avoids popup blockers
          const iframe = document.createElement('iframe')
          Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: 'none' })
          document.body.appendChild(iframe)

          const doc = iframe.contentDocument ?? iframe.contentWindow?.document
          if (!doc) { document.body.removeChild(iframe); return }
          doc.open()
          doc.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
            <title>CMBX Confirm — ${index} — ${tradeDate}</title>
            <style>${css}</style></head><body>${clone.innerHTML}</body></html>`)
          doc.close()

          // Give browser a moment to render, then print and clean up
          setTimeout(() => {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
            setTimeout(() => document.body.removeChild(iframe), 2000)
          }, 300)
        }

        const row = (label: string, value: React.ReactNode, shade: boolean) => (
          <tr style={{ background: shade ? '#f8f9fc' : '#fff' }}>
            <td style={{ padding: '6px 14px', color: '#555', width: '210px', borderBottom: '1px solid #efefef', fontSize: '12.75px' }}>{label}</td>
            <td style={{ padding: '6px 14px', fontWeight: 500, borderBottom: '1px solid #efefef', fontSize: '12.75px' }}>{value}</td>
          </tr>
        )

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px' }}>
            <div id="confirm-doc" style={{ background: '#fff', width: '760px', padding: '44px 52px', fontFamily: 'Georgia, serif', fontSize: '13px', color: '#222', lineHeight: '1.6', flexShrink: 0 }}>

              {/* ── Header ───────────────────────────────────────────────────── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#111', marginBottom: '3px' }}>CMBX Trade Confirmation</div>
                  <div style={{ color: '#666', fontSize: '13px' }}>Trade Date: {tradeDate}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-1px', color: '#111' }}>
                    CROSS<span style={{ color: '#e03020' }}>✕</span>POINT
                  </div>
                  <div style={{ fontSize: '11px', color: '#888', letterSpacing: '2px' }}>C A P I T A L</div>
                </div>
              </div>

              {/* ── Reference banner ─────────────────────────────────────────── */}
              <div style={{ background: '#f0f4fb', padding: '10px 16px', borderLeft: '4px solid #2255aa', marginBottom: '22px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: '#2255aa' }}>{index}</span>
                <span style={{ color: '#555', fontSize: '12px' }}>Maturity: {maturity}</span>
                <span style={{ color: '#555', fontSize: '12px' }}>Coupon: {coupon} bps/yr</span>
              </div>

              {/* ── Parties ──────────────────────────────────────────────────── */}
              <div style={{ color: '#2255aa', fontWeight: 700, fontSize: '11px', letterSpacing: '1.5px', marginBottom: '8px', textTransform: 'uppercase' }}>Parties to the Transaction</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '22px', fontSize: '12.75px', border: '1px solid #e0e0e0' }}>
                <tbody>
                  <tr style={{ background: '#fff6f6' }}>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid #e0e0e0', width: '210px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, color: '#881111' }}>Protection Buyer</div>
                      <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>Seller of Risk · Short Credit</div>
                      <div style={{ color: '#881111', fontSize: '11px', marginTop: '4px' }}>Pays: {coupon} bps/yr running</div>
                      <div style={{ color: '#1a6622', fontSize: '11px', fontWeight: 700 }}>Receives: upfront PV</div>
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid #e0e0e0', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700 }}>{protBuyerInfo?.legal ?? protBuyerCode}</div>
                      <div style={{ color: '#555', fontSize: '12px' }}>
                        {protBuyerInfo?.address.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}
                      </div>
                      {protBuyerInfo?.phone && <div style={{ color: '#555', fontSize: '12px' }}>Tel: {protBuyerInfo.phone}</div>}
                      {protBuyerInfo?.email && <div style={{ color: '#555', fontSize: '12px' }}>Email: {protBuyerInfo.email}</div>}
                    </td>
                  </tr>
                  <tr style={{ background: '#f6fff6' }}>
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, color: '#1a6622' }}>Protection Seller</div>
                      <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>Buyer of Risk · Long Credit</div>
                      <div style={{ color: '#1a6622', fontSize: '11px', marginTop: '4px', fontWeight: 700 }}>Receives: {coupon} bps/yr running</div>
                      <div style={{ color: '#881111', fontSize: '11px' }}>Pays: upfront PV</div>
                    </td>
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700 }}>{protSellerInfo?.legal ?? protSellerCode}</div>
                      <div style={{ color: '#555', fontSize: '12px' }}>
                        {protSellerInfo?.address.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}
                      </div>
                      {protSellerInfo?.phone && <div style={{ color: '#555', fontSize: '12px' }}>Tel: {protSellerInfo.phone}</div>}
                      {protSellerInfo?.email && <div style={{ color: '#555', fontSize: '12px' }}>Email: {protSellerInfo.email}</div>}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Trade Terms ───────────────────────────────────────────────── */}
              <div style={{ color: '#2255aa', fontWeight: 700, fontSize: '11px', letterSpacing: '1.5px', marginBottom: '8px', textTransform: 'uppercase' }}>Trade Terms</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '22px', border: '1px solid #e0e0e0' }}>
                <tbody>
                  {row('Index', index, false)}
                  {row('Trade Type', 'Credit Default Swap (CDS) — ISDA Standard Terms', true)}
                  {row('Notional Amount', notional ? `$${notional.toLocaleString()}` : '—', false)}
                  {row('Trade Price', priceDecimal, true)}
                  {row('Coupon (Running)', `${coupon} bps per annum (${(coupon / 100).toFixed(2)}% / year)`, false)}
                  {row('Maturity Date', maturity, true)}
                  {row('Effective Date', `${tradeDate}  (T+0)`, false)}
                  {row('Settlement Date', `${settlDate}  (T+3 business days)`, true)}
                  <tr style={{ background: '#fff' }}>
                    <td style={{ padding: '6px 14px', color: '#555', width: '210px', borderBottom: '1px solid #efefef', fontSize: '12.75px' }}>Spread (bps)</td>
                    <td style={{ padding: '4px 14px', borderBottom: '1px solid #efefef' }}>
                      <input
                        className="no-print"
                        value={confirmSpread}
                        onChange={e => setConfirmSpread(e.target.value)}
                        placeholder="enter implied spread..."
                        style={{ border: '1px solid #bbb', padding: '2px 8px', fontSize: '12.75px', fontFamily: 'Georgia, serif', width: '200px', color: '#222', borderRadius: '2px' }}
                      />
                      <span className="print-only" style={{ display: 'none', fontSize: '12.75px', fontWeight: 500 }}>{confirmSpread}</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Upfront Payment ───────────────────────────────────────────── */}
              <div style={{ color: '#2255aa', fontWeight: 700, fontSize: '11px', letterSpacing: '1.5px', marginBottom: '8px', textTransform: 'uppercase' }}>Upfront Payment (Present Value)</div>
              <div style={{ border: '1px solid #d0d8ee', background: '#f4f7fb', padding: '14px 18px', marginBottom: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ color: '#444', fontSize: '12.75px' }}>PV Amount:</span>
                  <span style={{ fontWeight: 700, fontSize: '18px', color: '#111' }}>{pvFmt}</span>
                </div>
                {pvCalcStr && (
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '10px', fontFamily: 'Courier New, monospace' }}>
                    {pvCalcStr}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px', fontSize: '12.75px' }}>
                  <span style={{ color: '#555' }}>Payable by:</span>
                  <span style={{ fontWeight: 600, color: '#881111' }}>{upfrontPayer}</span>
                  <span style={{ color: '#555' }}>Payable to:</span>
                  <span style={{ fontWeight: 600, color: '#1a6622' }}>{upfrontReceiver}</span>
                </div>
              </div>

              {/* ── Facilitation Fee ──────────────────────────────────────────── */}
              <div style={{ color: '#2255aa', fontWeight: 700, fontSize: '11px', letterSpacing: '1.5px', marginBottom: '8px', textTransform: 'uppercase' }}>Facilitation Fee</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '22px', border: '1px solid #e0e0e0' }}>
                <tbody>
                  {row('Charged by', 'Crosspoint Capital', false)}
                  {row('Amount', facFee, true)}
                </tbody>
              </table>

              {/* ── Footer ───────────────────────────────────────────────────── */}
              <div style={{ fontSize: '12.75px', color: '#555', lineHeight: '1.7', marginBottom: '24px', borderTop: '1px solid #e0e0e0', paddingTop: '16px' }}>
                This document confirms the terms agreed between <strong>{protBuyerInfo?.legal ?? protBuyerCode}</strong> (Protection Buyer) and <strong>{protSellerInfo?.legal ?? protSellerCode}</strong> (Protection Seller) for the {index} trade executed on <strong>{tradeDate}</strong>. Effective date is T+0. Settlement date is T+3 business days (<strong>{settlDate}</strong>). All terms are subject to the ISDA Master Agreement and related Schedule executed between the parties.
              </div>

              {/* ── Buttons ──────────────────────────────────────────────────── */}
              <div className="no-print" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={downloadPdf}
                  style={{ background: '#2255aa', color: '#fff', border: 'none', padding: '8px 28px', fontSize: '13px', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: '1px', borderRadius: '2px' }}
                >
                  ↓ DOWNLOAD PDF
                </button>
                <button
                  onClick={() => setConfirmTrade(null)}
                  style={{ background: '#eee', color: '#333', border: '1px solid #ccc', padding: '8px 24px', fontSize: '13px', cursor: 'pointer', fontFamily: 'Georgia, serif', borderRadius: '2px' }}
                >
                  CLOSE
                </button>
              </div>

            </div>
          </div>
        )
      })()}

      {/* Auto-adj notification bar — only shown when an adjustment has fired */}
      {autoAdjMsg && (
        <div style={{ borderTop: '1px solid #1e1e1e', padding: '3px 12px', flexShrink: 0, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px', background: '#0a0800', color: '#ff8844' }}>
          <span style={{ letterSpacing: '1px', fontWeight: 700 }}>AUTO-ADJ</span>
          <span style={{ color: '#666' }}>{autoAdjMsg}</span>
          <button onClick={() => setAutoAdjMsg('')} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontSize: '13px', fontFamily: 'Courier New' }}>×</button>
        </div>
      )}

      {/* Trade log bar */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '5px 12px', flexShrink: 0, fontSize: '15px', minHeight: '28px', display: 'flex', alignItems: 'center', gap: '8px', background: '#080808' }}>
        {tradeLog ? (
          <>
            <span style={{ color: '#444' }}>[{tradeLog.time}]</span>
            <span style={{ color: tradeLog.action === 'HIT' ? '#ff6666' : '#66ff88', fontWeight: 700 }}>{tradeLog.action}</span>
            <span style={{ color: '#666' }}>— {tradeLog.tranche}.{tradeLog.series}</span>
            <span style={{ color: '#444' }}>BUYER</span>
            <span style={{ color: '#66ff88', fontWeight: 700 }}>{tradeLog.action === 'LIFT' ? tradeLog.dealer : (tradeLog.passive_dealer ?? '?')}</span>
            <span style={{ color: '#333' }}>↔</span>
            <span style={{ color: '#444' }}>SELLER</span>
            <span style={{ color: '#ff6666', fontWeight: 700 }}>{tradeLog.action === 'LIFT' ? (tradeLog.passive_dealer ?? '?') : tradeLog.dealer}</span>
            <span style={{ color: '#444' }}>@</span>
            <span style={{ color: '#bbb' }}>{formatPx(tradeLog.price, null)}</span>
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
