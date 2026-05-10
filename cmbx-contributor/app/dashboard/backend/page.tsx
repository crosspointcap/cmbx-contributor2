'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { createClient } from '@supabase/supabase-js'
import { NavTabs } from '../NavTabs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEALERS = ['MS', 'BOA', 'CITI', 'JPM', 'GS', 'UBS', 'BNP', 'DB', 'BARC']

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
  price: number | null
  bbgPublished: boolean
}

interface TradeConfirm {
  tranche: string
  series: string
  side: 'hit' | 'lift'
  price: number | null
  buyer: string
  seller: string
  time: string
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
  fontSize: '13px',
  width: '55px',
  outline: 'none',
  padding: '1px 3px',
}

export default function BackendPage() {
  const [clock, setClock] = useState('')
  const [bbgConnected, setBbgConnected] = useState(false)
  const [series, setSeries] = useState<SeriesConfig[]>([])
  const [tranches, setTranches] = useState<TrancheConfig[]>([])
  const [prices, setPrices] = useState<Record<string, Price>>({})
  const [selectedDealer, setSelectedDealer] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [priceMode, setPriceMode] = useState<'spread' | 'price'>('spread')
  const [editingCell, setEditingCell] = useState<{ key: string; field: EditField } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [flashRows, setFlashRows] = useState<Record<string, 'red' | 'green'>>({})
  const [hitShake, setHitShake] = useState(false)
  const [liftShake, setLiftShake] = useState(false)
  const [cellError, setCellError] = useState('')
  const [tradeLog, setTradeLog] = useState<TradeLog | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ key: string; field: EditField } | null>(null)
  const [tradeConfirm, setTradeConfirm] = useState<TradeConfirm | null>(null)

  const selectedDealerRef = useRef(selectedDealer)
  const selectedRowRef = useRef(selectedRow)
  const priceModeRef = useRef(priceMode)
  selectedDealerRef.current = selectedDealer
  selectedRowRef.current = selectedRow
  priceModeRef.current = priceMode

  useEffect(() => {
    const tick = () => setClock(nowET())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false

    // Channel created synchronously so cleanup always has the ref,
    // preventing the Strict Mode double-invoke "after subscribe()" error.
    const ch = supabase
      .channel(`backend-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, (payload) => {
        const p = payload.new as Price
        setPrices(prev => ({ ...prev, [`${p.series_number}:${p.tranche_name}`]: p }))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload) => {
        const t = payload.new as any
        const key = `${t.series_number}:${t.tranche_name}`
        flashRowEffect(key, t.side === 'hit' ? 'red' : 'green')
        setTradeLog({
          time: fmtTime(t.created_at),
          action: t.side === 'hit' ? 'HIT' : 'LIFT',
          series: t.series_number,
          tranche: t.tranche_name,
          dealer: t.dealer,
          price: t.price,
          bbgPublished: t.published_to_bbg ?? false,
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_heartbeat' }, (payload) => {
        const hbNew = payload.new as any
        setBbgConnected(hbNew.bbg_connected)
      })
      .subscribe()

    async function loadData() {
      const [{ data: sd }, { data: td }, { data: pd }, { data: hb }] = await Promise.all([
        supabase.from('series_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('tranche_config').select('*').eq('active', true).order('sort_order', { ascending: true }),
        supabase.from('prices').select('*'),
        supabase.from('agent_heartbeat').select('*').limit(1).single(),
      ])
      if (cancelled) return
      if (sd) setSeries(sd)
      if (td) setTranches(td)
      if (pd) {
        const map: Record<string, Price> = {}
        for (const p of pd) map[`${p.series_number}:${p.tranche_name}`] = p
        setPrices(map)
      }
      if (hb) setBbgConnected(hb.bbg_connected)
    }

    loadData()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [])

  function flashRowEffect(key: string, color: 'red' | 'green') {
    let count = 0
    const id = setInterval(() => {
      setFlashRows(prev => {
        if (key in prev) {
          const next = { ...prev }
          delete next[key]
          return next
        }
        return { ...prev, [key]: color }
      })
      count++
      if (count >= 6) clearInterval(id)
    }, 250)
  }

  function handleDealerClick(code: string) {
    setSelectedDealer(prev => prev === code ? null : code)
  }

  async function commitCell(key: string, field: EditField, value: string) {
    const [seriesNum, trancheName] = key.split(':')
    const dealer = selectedDealerRef.current
    const update: Record<string, unknown> = {
      series_number: seriesNum,
      tranche_name: trancheName,
      mode: priceModeRef.current,
      [field]: value === '' ? null : value,
    }
    if (field === 'bid' && dealer) update.bid_dealer = dealer
    if (field === 'ask' && dealer) update.ask_dealer = dealer
    await supabase.from('prices').upsert(update, { onConflict: 'series_number,tranche_name' })
    setEditingCell(null)
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
    await supabase.from('trades').insert({ series_number: seriesNum, tranche_name: trancheName, side: 'hit', price: px, dealer })
    await supabase.from('prices').upsert({ series_number: seriesNum, tranche_name: trancheName, last_trade_px: px, last_trade_time: new Date().toISOString() }, { onConflict: 'series_number,tranche_name' })
    flashRowEffect(rowKey, 'red')
    setTradeConfirm({ tranche: trancheName, series: seriesNum, side: 'hit', price: px, buyer: dealer, seller: 'CROSSPOINT', time: nowET() })
  }

  async function executeLift() {
    const dealer = selectedDealerRef.current
    const rowKey = selectedRowRef.current
    if (!dealer) { setLiftShake(true); setTimeout(() => setLiftShake(false), 500); showError('Select a counterparty first'); return }
    if (!rowKey) { setLiftShake(true); setTimeout(() => setLiftShake(false), 500); showError('Select a row first'); return }
    const [seriesNum, trancheName] = rowKey.split(':')
    const px = prices[rowKey]?.ask ?? null
    await supabase.from('trades').insert({ series_number: seriesNum, tranche_name: trancheName, side: 'lift', price: px, dealer })
    await supabase.from('prices').upsert({ series_number: seriesNum, tranche_name: trancheName, last_trade_px: px, last_trade_time: new Date().toISOString() }, { onConflict: 'series_number,tranche_name' })
    flashRowEffect(rowKey, 'green')
    setTradeConfirm({ tranche: trancheName, series: seriesNum, side: 'lift', price: px, buyer: 'CROSSPOINT', seller: dealer, time: nowET() })
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
          <span style={{ color: '#555', fontStyle: 'italic', fontSize: '13px' }}>type...</span>
        ) : displayValue}
      </td>
    )
  }

  return (
    <div style={{ background: '#0a0a0a', color: '#ccc', fontFamily: 'Courier New, monospace', fontSize: '14px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
        <span style={{ color: '#f0c040', fontSize: '14px', letterSpacing: '2px', fontWeight: 700 }}>
          CMBX CONTRIBUTOR — CROSSPOINT CAPITAL
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#444', fontSize: '13px' }}>{clock}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: bbgConnected ? '#66ff88' : '#444', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: '#f0c040', fontSize: '13px', fontWeight: 600, letterSpacing: '1px' }}>BBG GPGX</span>
          </span>
        </div>
      </div>

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
              fontSize: '13px',
              fontFamily: 'Courier New, monospace',
              fontWeight: 500,
              borderRadius: '2px',
              cursor: 'pointer',
            } : {
              background: DEALER_INACTIVE[code]?.bg,
              color: DEALER_INACTIVE[code]?.color,
              border: `1px solid ${DEALER_INACTIVE[code]?.border}`,
              padding: '4px 14px',
              fontSize: '13px',
              fontFamily: 'Courier New, monospace',
              fontWeight: 500,
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            {code}
          </button>
        ))}
        <span style={{ marginLeft: '10px', fontSize: '13px', color: selectedDealer ? '#f0c040' : '#444' }}>
          {selectedDealer ? `SELECTED: ${selectedDealer}` : '— no counterparty selected'}
        </span>
        {cellError && (
          <span style={{ marginLeft: '12px', color: '#ff4444', fontSize: '13px' }}>{cellError}</span>
        )}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 12px', gap: '6px', borderBottom: '1px solid #1e1e1e', flexShrink: 0 }}>
        <button
          onClick={executeHit}
          style={{
            background: '#3a0000', color: '#ff6666', border: '1px solid #aa3333',
            padding: '3px 14px', fontSize: '13px', fontFamily: 'Courier New, monospace',
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
            padding: '3px 14px', fontSize: '13px', fontFamily: 'Courier New, monospace',
            borderRadius: '2px', cursor: 'pointer', fontWeight: 700,
            animation: liftShake ? 'shake 0.5s ease' : 'none',
          }}
        >
          LIFT
        </button>
        <div style={{ display: 'flex', gap: '2px', marginLeft: '10px' }}>
          {(['spread', 'price'] as const).map(m => (
            <button
              key={m}
              onClick={() => setPriceMode(m)}
              style={{
                background: priceMode === m ? '#f0c040' : '#111',
                color: priceMode === m ? '#000' : '#555',
                border: `1px solid ${priceMode === m ? '#f0c040' : '#2a2a2a'}`,
                padding: '2px 10px', fontSize: '13px', fontFamily: 'Courier New, monospace',
                borderRadius: '2px', cursor: 'pointer', textTransform: 'uppercase' as const,
                fontWeight: priceMode === m ? 700 : 400,
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <span style={{ color: '#444', fontSize: '13px', marginLeft: '10px' }}>
          entering: <span style={{ color: '#888' }}>{priceMode === 'spread' ? 'SPREAD (bps)' : 'PRICE ($)'}</span>
        </span>
        <span style={{ color: '#333', fontSize: '13px', marginLeft: 'auto', paddingRight: '2px' }}>
          hover a BID / ASK / B.SZ / A.SZ cell → click → type → Enter to save
        </span>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ color: '#ffffff', fontSize: '13px', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 1 } as React.CSSProperties}>
              <th style={{ textAlign: 'left', padding: '5px 6px 5px 10px', borderBottom: '1px solid #1e1e1e', width: '130px', fontWeight: 700 }}>TRANCHE</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '90px', fontWeight: 700 }}>BID</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '90px', fontWeight: 700 }}>ASK</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '60px', fontWeight: 700 }}>B.SZ</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '60px', fontWeight: 700 }}>A.SZ</th>
              <th style={{ textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #1e1e1e', minWidth: '70px', fontWeight: 700 }}>LAST PX</th>
              <th style={{ textAlign: 'right', padding: '5px 12px 5px 8px', borderBottom: '1px solid #1e1e1e', minWidth: '50px', fontWeight: 700 }}>CHG</th>
            </tr>
          </thead>
          <tbody>
            {series.map(s => (
              <Fragment key={s.series_number}>
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: '7px 12px 4px',
                      color: '#f0c040',
                      background: '#0e0e0e',
                      fontSize: '14px',
                      fontWeight: 600,
                      letterSpacing: '1px',
                      borderBottom: '1px solid #1e1e1e',
                      borderTop: '1px solid #1a1a1a',
                    }}
                  >
                    CMBX.{s.series_number}
                  </td>
                </tr>
                {tranches.map(t => {
                  const rowKey = `${s.series_number}:${t.tranche_name}`
                  const price = prices[rowKey]
                  const isActive = selectedRow === rowKey
                  const flash = flashRows[rowKey]

                  let rowBg = isActive ? '#1a1500' : 'transparent'
                  if (flash === 'red') rowBg = '#3a0000'
                  if (flash === 'green') rowBg = '#003a00'

                  const bidTag = price?.bid_dealer && DEALER_TAG[price.bid_dealer] ? DEALER_TAG[price.bid_dealer] : null
                  const askTag = price?.ask_dealer && DEALER_TAG[price.ask_dealer] ? DEALER_TAG[price.ask_dealer] : null

                  const bidCell = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                      <span style={{ color: price?.bid != null ? '#ffffff' : '#2a2a2a' }}>
                        {price?.bid != null ? String(price.bid) : '—'}
                      </span>
                      {price?.bid != null && bidTag && (
                        <span style={{ background: bidTag.bg, color: bidTag.color, fontSize: '13px', padding: '0 3px', borderRadius: '2px', fontWeight: 600 }}>
                          {price.bid_dealer}
                        </span>
                      )}
                    </span>
                  )

                  const askCell = (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                      <span style={{ color: price?.ask != null ? '#ffffff' : '#2a2a2a' }}>
                        {price?.ask != null ? String(price.ask) : '—'}
                      </span>
                      {price?.ask != null && askTag && (
                        <span style={{ background: askTag.bg, color: askTag.color, fontSize: '13px', padding: '0 3px', borderRadius: '2px', fontWeight: 600 }}>
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
                      style={{ background: rowBg, borderBottom: '1px solid #1e1e1e', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '4px 6px 4px 10px', color: '#ffffff', whiteSpace: 'nowrap', width: '130px' }}>
                        CMBX.{s.series_number}.{t.tranche_name}
                      </td>
                      {renderEditCell(rowKey, 'bid', bidCell, { textAlign: 'right', padding: '4px 10px' })}
                      {renderEditCell(rowKey, 'ask', askCell, { textAlign: 'right', padding: '4px 10px' })}
                      {renderEditCell(rowKey, 'bid_size', bszCell, { textAlign: 'right', padding: '4px 8px' })}
                      {renderEditCell(rowKey, 'ask_size', aszCell, { textAlign: 'right', padding: '4px 8px' })}
                      <td style={{ textAlign: 'right', padding: '4px 10px', color: price?.last_trade_px != null ? '#888' : '#2a2a2a' }}>
                        {price?.last_trade_px != null ? String(price.last_trade_px) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '4px 12px 4px 8px', color: '#2a2a2a' }}>—</td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trade confirmation overlay */}
      {tradeConfirm && (
        <div
          onClick={() => setTradeConfirm(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0f0f0f', border: '1px solid #f0c040', padding: '28px 36px', minWidth: '340px', fontFamily: 'Courier New, monospace' }}
          >
            <div style={{ color: '#f0c040', fontSize: '11px', letterSpacing: '2px', marginBottom: '20px', textAlign: 'center' }}>
              TRADE CONFIRMATION
            </div>
            <div style={{ color: '#555', fontSize: '11px', marginBottom: '16px', textAlign: 'center' }}>
              {tradeConfirm.time}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: '20px', letterSpacing: '1px' }}>
              CMBX.{tradeConfirm.series}.{tradeConfirm.tranche}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: tradeConfirm.side === 'hit' ? '#ff6666' : '#66ff88', textAlign: 'center', marginBottom: '24px' }}>
              {tradeConfirm.price ?? '—'} bps
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '32px', marginBottom: '28px' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '6px' }}>BUYER</div>
                <div style={{ color: '#66ff88', fontSize: '15px', fontWeight: 700 }}>{tradeConfirm.buyer}</div>
              </div>
              <div style={{ color: '#333', fontSize: '20px', alignSelf: 'center' }}>→</div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '6px' }}>SELLER</div>
                <div style={{ color: '#ff6666', fontSize: '15px', fontWeight: 700 }}>{tradeConfirm.seller}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setTradeConfirm(null)}
                style={{ background: '#f0c040', color: '#000', border: 'none', padding: '6px 24px', fontFamily: 'Courier New, monospace', fontSize: '12px', fontWeight: 700, cursor: 'pointer', letterSpacing: '1px' }}
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trade log bar */}
      <div style={{ borderTop: '1px solid #1e1e1e', padding: '5px 12px', flexShrink: 0, fontSize: '13px', minHeight: '28px', display: 'flex', alignItems: 'center', gap: '8px', background: '#080808' }}>
        {tradeLog ? (
          <>
            <span style={{ color: '#444' }}>[{tradeLog.time}]</span>
            <span style={{ color: tradeLog.action === 'HIT' ? '#ff6666' : '#66ff88', fontWeight: 700 }}>{tradeLog.action}</span>
            <span style={{ color: '#666' }}>— CMBX.{tradeLog.series}.{tradeLog.tranche}</span>
            <span style={{ color: '#444' }}>{tradeLog.action === 'HIT' ? 'SOLD TO' : 'BOUGHT FROM'}</span>
            <span style={{ color: '#f0c040' }}>{tradeLog.dealer}</span>
            <span style={{ color: '#444' }}>@</span>
            <span style={{ color: '#bbb' }}>{tradeLog.price ?? '—'}</span>
            <span style={{ color: '#333' }}>▶</span>
            <span style={{ color: tradeLog.bbgPublished ? '#66ff88' : '#f0c040' }}>
              BBG {tradeLog.bbgPublished ? '✓' : 'PENDING'}
            </span>
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
