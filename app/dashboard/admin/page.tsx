'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatPx } from '@/lib/utils'
import type { SeriesConfig, TrancheConfig, Dealer, Trade } from '@/lib/types'

type Tab = 'SERIES' | 'TRANCHES' | 'DEALERS' | 'BLOTTER'

function formatTime(ts: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ts))
}

function formatDate(ts: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts))
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<Tab>('SERIES')

  // Data
  const [series, setSeries] = useState<SeriesConfig[]>([])
  const [tranches, setTranches] = useState<TrancheConfig[]>([])
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [trades, setTrades] = useState<Trade[]>([])

  // Editing
  const [editingSeries, setEditingSeries] = useState<number | null>(null)
  const [editingSeriesData, setEditingSeriesData] = useState<
    Partial<SeriesConfig>
  >({})
  const [editingTranche, setEditingTranche] = useState<number | null>(null)
  const [editingTrancheData, setEditingTrancheData] = useState<
    Partial<TrancheConfig>
  >({})

  // Add forms
  const [showAddSeries, setShowAddSeries] = useState(false)
  const [newSeriesForm, setNewSeriesForm] = useState({
    series_number: '',
    label: '',
    gpgx_page_id: '',
    gpgx_monitor: '1',
    gpgx_page_number: '1',
  })

  const [showAddTranche, setShowAddTranche] = useState(false)
  const [newTrancheForm, setNewTrancheForm] = useState({
    tranche_name: '',
    sort_order: '',
  })

  const [showAddDealer, setShowAddDealer] = useState(false)
  const [newDealerForm, setNewDealerForm] = useState({
    dealer_code: '',
    full_name: '',
  })

  // Blotter filters
  const [filterSeries, setFilterSeries] = useState('')
  const [filterTranche, setFilterTranche] = useState('')
  const [filterDealer, setFilterDealer] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Drag reorder for tranches
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'trader') {
        router.push('/dashboard/market')
        return
      }

      loadData()
    }
    init()
  }, [])

  async function loadData() {
    const [seriesRes, trancheRes, dealerRes, tradesRes] = await Promise.all([
      supabase.from('series_config').select('*').order('sort_order'),
      supabase.from('tranche_config').select('*').order('sort_order'),
      supabase.from('dealers').select('*'),
      supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false }),
    ])

    if (seriesRes.data) setSeries(seriesRes.data)
    if (trancheRes.data) setTranches(trancheRes.data)
    if (dealerRes.data) setDealers(dealerRes.data)
    if (tradesRes.data) setTrades(tradesRes.data as Trade[])
  }

  // ---- SERIES ----
  async function toggleSeriesActive(s: SeriesConfig) {
    await supabase
      .from('series_config')
      .update({ active: !s.active })
      .eq('id', s.id)
    setSeries((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x))
    )
  }

  async function saveSeries() {
    if (!editingSeries) return
    await supabase
      .from('series_config')
      .update(editingSeriesData)
      .eq('id', editingSeries)
    setSeries((prev) =>
      prev.map((x) =>
        x.id === editingSeries ? { ...x, ...editingSeriesData } : x
      )
    )
    setEditingSeries(null)
    setEditingSeriesData({})
  }

  async function addSeries(e: React.FormEvent) {
    e.preventDefault()
    const maxSort = series.reduce(
      (acc, s) => Math.max(acc, s.sort_order ?? 0),
      0
    )
    const { data } = await supabase
      .from('series_config')
      .insert({
        ...newSeriesForm,
        active: true,
        sort_order: maxSort + 1,
        gpgx_page_id: newSeriesForm.gpgx_page_id || null,
      })
      .select()
      .single()
    if (data) setSeries((prev) => [...prev, data])
    setShowAddSeries(false)
    setNewSeriesForm({
      series_number: '',
      label: '',
      gpgx_page_id: '',
      gpgx_monitor: '1',
      gpgx_page_number: '1',
    })
  }

  // ---- TRANCHES ----
  async function toggleTrancheActive(t: TrancheConfig) {
    await supabase
      .from('tranche_config')
      .update({ active: !t.active })
      .eq('id', t.id)
    setTranches((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x))
    )
  }

  async function saveTranche() {
    if (!editingTranche) return
    await supabase
      .from('tranche_config')
      .update(editingTrancheData)
      .eq('id', editingTranche)
    setTranches((prev) =>
      prev.map((x) =>
        x.id === editingTranche ? { ...x, ...editingTrancheData } : x
      )
    )
    setEditingTranche(null)
    setEditingTrancheData({})
  }

  async function addTranche(e: React.FormEvent) {
    e.preventDefault()
    const { data } = await supabase
      .from('tranche_config')
      .insert({
        tranche_name: newTrancheForm.tranche_name,
        sort_order: parseInt(newTrancheForm.sort_order) || tranches.length + 1,
        active: true,
      })
      .select()
      .single()
    if (data) setTranches((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order))
    setShowAddTranche(false)
    setNewTrancheForm({ tranche_name: '', sort_order: '' })
  }

  async function handleTrancheDrop(dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) return
    const reordered = [...tranches]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dropIdx, 0, moved)

    // Reassign sort_order
    const updated = reordered.map((t, i) => ({ ...t, sort_order: i + 1 }))
    setTranches(updated)
    setDragIdx(null)
    setDragOverIdx(null)

    // Persist
    for (const t of updated) {
      await supabase
        .from('tranche_config')
        .update({ sort_order: t.sort_order })
        .eq('id', t.id)
    }
  }

  // ---- DEALERS ----
  async function toggleDealerActive(d: Dealer) {
    await supabase
      .from('dealers')
      .update({ active: !d.active })
      .eq('id', d.id)
    setDealers((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, active: !x.active } : x))
    )
  }

  async function addDealer(e: React.FormEvent) {
    e.preventDefault()
    const { data } = await supabase
      .from('dealers')
      .insert({
        dealer_code: newDealerForm.dealer_code.toUpperCase(),
        full_name: newDealerForm.full_name || null,
        active: true,
      })
      .select()
      .single()
    if (data) setDealers((prev) => [...prev, data])
    setShowAddDealer(false)
    setNewDealerForm({ dealer_code: '', full_name: '' })
  }

  // ---- BLOTTER FILTERS ----
  const filteredTrades = trades.filter((t) => {
    if (filterSeries && t.series_number !== filterSeries) return false
    if (filterTranche && t.tranche_name !== filterTranche) return false
    if (filterDealer && t.dealer !== filterDealer) return false
    if (filterDateFrom && t.created_at < filterDateFrom) return false
    if (filterDateTo && t.created_at > filterDateTo + 'T23:59:59') return false
    return true
  })

  const inputClass =
    'bg-[#111] border border-[#333] text-[#cccccc] text-xs px-3 py-1.5 outline-none focus:border-[#f0c040] rounded-none'
  const selectClass =
    'bg-[#111] border border-[#333] text-[#cccccc] text-xs px-3 py-1.5 outline-none focus:border-[#f0c040] rounded-none'
  const btnPrimary =
    'px-4 py-1.5 text-xs font-bold bg-[#f0c040] text-[#0a0a0a] rounded-[3px] cursor-pointer'
  const btnSecondary =
    'px-4 py-1.5 text-xs border border-[#333] text-[#555] hover:text-[#cccccc] rounded-[3px] cursor-pointer'
  const btnToggleOn =
    'px-3 py-1 text-xs border border-[#66ff88] text-[#66ff88] rounded-[3px] cursor-pointer'
  const btnToggleOff =
    'px-3 py-1 text-xs border border-[#333] text-[#555] rounded-[3px] cursor-pointer'
  const btnEdit =
    'px-3 py-1 text-xs border border-[#f0c04066] text-[#f0c040] hover:border-[#f0c040] rounded-[3px] cursor-pointer'
  const thClass = 'text-left py-2 pr-6 text-[#555] text-xs font-normal border-b border-[#222]'
  const tdClass = 'py-2 pr-6 text-xs border-b border-[#1a1a1a]'

  return (
    <div
      className="flex flex-col h-screen bg-[#0a0a0a] text-[#cccccc]"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#222]">
        <span className="text-[#f0c040] text-sm tracking-widest font-semibold">
          CMBX CONTRIBUTOR — ADMIN
        </span>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard/backend"
            className="text-xs text-[#555] hover:text-[#f0c040] border border-[#333] px-2 py-1 rounded-[3px]"
          >
            ← BACKEND
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-[#222] px-4 pt-2 gap-0">
        {(['SERIES', 'TRANCHES', 'DEALERS', 'BLOTTER'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-1.5 text-xs mr-1 rounded-t-[3px] border border-b-0 transition-colors ${
              activeTab === tab
                ? 'border-[#f0c040] text-[#f0c040] bg-[#f0c04010]'
                : 'border-[#222] text-[#555] hover:text-[#cccccc]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {/* ---- SERIES TAB ---- */}
        {activeTab === 'SERIES' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#555] text-xs tracking-widest">
                SERIES CONFIGURATION
              </span>
              <button
                onClick={() => setShowAddSeries(!showAddSeries)}
                className={btnPrimary}
              >
                + ADD SERIES
              </button>
            </div>

            {showAddSeries && (
              <form
                onSubmit={addSeries}
                className="mb-4 p-4 border border-[#f0c04066] bg-[#0d0d0d] flex flex-wrap gap-3 items-end"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">NUMBER</label>
                  <input
                    required
                    value={newSeriesForm.series_number}
                    onChange={(e) =>
                      setNewSeriesForm((f) => ({
                        ...f,
                        series_number: e.target.value,
                      }))
                    }
                    className={inputClass}
                    style={{ width: 80 }}
                    placeholder="16"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">LABEL</label>
                  <input
                    required
                    value={newSeriesForm.label}
                    onChange={(e) =>
                      setNewSeriesForm((f) => ({ ...f, label: e.target.value }))
                    }
                    className={inputClass}
                    style={{ width: 120 }}
                    placeholder="CMBX.16"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">GPGX ID</label>
                  <input
                    value={newSeriesForm.gpgx_page_id}
                    onChange={(e) =>
                      setNewSeriesForm((f) => ({
                        ...f,
                        gpgx_page_id: e.target.value,
                      }))
                    }
                    className={inputClass}
                    style={{ width: 100 }}
                    placeholder="optional"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">MONITOR</label>
                  <input
                    value={newSeriesForm.gpgx_monitor}
                    onChange={(e) =>
                      setNewSeriesForm((f) => ({
                        ...f,
                        gpgx_monitor: e.target.value,
                      }))
                    }
                    className={inputClass}
                    style={{ width: 60 }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">PAGE</label>
                  <input
                    value={newSeriesForm.gpgx_page_number}
                    onChange={(e) =>
                      setNewSeriesForm((f) => ({
                        ...f,
                        gpgx_page_number: e.target.value,
                      }))
                    }
                    className={inputClass}
                    style={{ width: 60 }}
                  />
                </div>
                <button type="submit" className={btnPrimary}>
                  ADD
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSeries(false)}
                  className={btnSecondary}
                >
                  CANCEL
                </button>
              </form>
            )}

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>LABEL</th>
                  <th className={thClass}>NUMBER</th>
                  <th className={thClass}>GPGX ID</th>
                  <th className={thClass}>MONITOR</th>
                  <th className={thClass}>PAGE</th>
                  <th className={thClass}>STATUS</th>
                  <th className={thClass}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-[#ffffff03]"
                  >
                    <td className={tdClass}>
                      {editingSeries === s.id ? (
                        <input
                          value={editingSeriesData.label ?? s.label}
                          onChange={(e) =>
                            setEditingSeriesData((d) => ({
                              ...d,
                              label: e.target.value,
                            }))
                          }
                          className={inputClass}
                          style={{ width: 120 }}
                        />
                      ) : (
                        <span className="text-[#f0c040]">{s.label}</span>
                      )}
                    </td>
                    <td className={tdClass + ' text-[#888]'}>
                      {s.series_number}
                    </td>
                    <td className={tdClass}>
                      {editingSeries === s.id ? (
                        <input
                          value={editingSeriesData.gpgx_page_id ?? s.gpgx_page_id ?? ''}
                          onChange={(e) =>
                            setEditingSeriesData((d) => ({
                              ...d,
                              gpgx_page_id: e.target.value || null,
                            }))
                          }
                          className={inputClass}
                          style={{ width: 100 }}
                        />
                      ) : (
                        <span className="text-[#555]">
                          {s.gpgx_page_id ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {editingSeries === s.id ? (
                        <input
                          value={editingSeriesData.gpgx_monitor ?? s.gpgx_monitor}
                          onChange={(e) =>
                            setEditingSeriesData((d) => ({
                              ...d,
                              gpgx_monitor: e.target.value,
                            }))
                          }
                          className={inputClass}
                          style={{ width: 60 }}
                        />
                      ) : (
                        <span className="text-[#555]">{s.gpgx_monitor}</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {editingSeries === s.id ? (
                        <input
                          value={editingSeriesData.gpgx_page_number ?? s.gpgx_page_number}
                          onChange={(e) =>
                            setEditingSeriesData((d) => ({
                              ...d,
                              gpgx_page_number: e.target.value,
                            }))
                          }
                          className={inputClass}
                          style={{ width: 60 }}
                        />
                      ) : (
                        <span className="text-[#555]">
                          {s.gpgx_page_number}
                        </span>
                      )}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={
                          s.active ? 'text-[#66ff88]' : 'text-[#555]'
                        }
                      >
                        {s.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <div className="flex items-center gap-2">
                        {editingSeries === s.id ? (
                          <>
                            <button
                              onClick={saveSeries}
                              className={btnPrimary}
                            >
                              SAVE
                            </button>
                            <button
                              onClick={() => {
                                setEditingSeries(null)
                                setEditingSeriesData({})
                              }}
                              className={btnSecondary}
                            >
                              CANCEL
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingSeries(s.id)
                              setEditingSeriesData({})
                            }}
                            className={btnEdit}
                          >
                            EDIT
                          </button>
                        )}
                        <button
                          onClick={() => toggleSeriesActive(s)}
                          className={
                            s.active ? btnToggleOn : btnToggleOff
                          }
                        >
                          {s.active ? 'DISABLE' : 'ENABLE'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- TRANCHES TAB ---- */}
        {activeTab === 'TRANCHES' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#555] text-xs tracking-widest">
                TRANCHE CONFIGURATION{' '}
                <span className="text-[#333]">(drag to reorder)</span>
              </span>
              <button
                onClick={() => setShowAddTranche(!showAddTranche)}
                className={btnPrimary}
              >
                + ADD TRANCHE
              </button>
            </div>

            {showAddTranche && (
              <form
                onSubmit={addTranche}
                className="mb-4 p-4 border border-[#f0c04066] bg-[#0d0d0d] flex gap-3 items-end"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">NAME</label>
                  <input
                    required
                    value={newTrancheForm.tranche_name}
                    onChange={(e) =>
                      setNewTrancheForm((f) => ({
                        ...f,
                        tranche_name: e.target.value,
                      }))
                    }
                    className={inputClass}
                    style={{ width: 100 }}
                    placeholder="e.g. BBB+"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">SORT ORDER</label>
                  <input
                    value={newTrancheForm.sort_order}
                    onChange={(e) =>
                      setNewTrancheForm((f) => ({
                        ...f,
                        sort_order: e.target.value,
                      }))
                    }
                    className={inputClass}
                    style={{ width: 80 }}
                    placeholder={String(tranches.length + 1)}
                  />
                </div>
                <button type="submit" className={btnPrimary}>
                  ADD
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTranche(false)}
                  className={btnSecondary}
                >
                  CANCEL
                </button>
              </form>
            )}

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className={thClass} style={{ width: 30 }}></th>
                  <th className={thClass}>NAME</th>
                  <th className={thClass}>SORT ORDER</th>
                  <th className={thClass}>STATUS</th>
                  <th className={thClass}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {tranches.map((t, idx) => (
                  <tr
                    key={t.id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOverIdx(idx)
                    }}
                    onDrop={() => handleTrancheDrop(idx)}
                    onDragEnd={() => {
                      setDragIdx(null)
                      setDragOverIdx(null)
                    }}
                    className={`hover:bg-[#ffffff03] cursor-default ${
                      dragOverIdx === idx ? 'bg-[#f0c04010]' : ''
                    }`}
                  >
                    <td className={tdClass}>
                      <span className="text-[#333] cursor-grab select-none px-2">
                        ⠿
                      </span>
                    </td>
                    <td className={tdClass}>
                      {editingTranche === t.id ? (
                        <input
                          value={
                            editingTrancheData.tranche_name ?? t.tranche_name
                          }
                          onChange={(e) =>
                            setEditingTrancheData((d) => ({
                              ...d,
                              tranche_name: e.target.value,
                            }))
                          }
                          className={inputClass}
                          style={{ width: 100 }}
                        />
                      ) : (
                        <span className="text-[#f0c040] font-semibold">
                          {t.tranche_name}
                        </span>
                      )}
                    </td>
                    <td className={tdClass + ' text-[#555]'}>
                      {editingTranche === t.id ? (
                        <input
                          type="number"
                          value={
                            editingTrancheData.sort_order ?? t.sort_order
                          }
                          onChange={(e) =>
                            setEditingTrancheData((d) => ({
                              ...d,
                              sort_order: parseInt(e.target.value),
                            }))
                          }
                          className={inputClass}
                          style={{ width: 80 }}
                        />
                      ) : (
                        t.sort_order
                      )}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={
                          t.active ? 'text-[#66ff88]' : 'text-[#555]'
                        }
                      >
                        {t.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <div className="flex items-center gap-2">
                        {editingTranche === t.id ? (
                          <>
                            <button onClick={saveTranche} className={btnPrimary}>
                              SAVE
                            </button>
                            <button
                              onClick={() => {
                                setEditingTranche(null)
                                setEditingTrancheData({})
                              }}
                              className={btnSecondary}
                            >
                              CANCEL
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingTranche(t.id)
                              setEditingTrancheData({})
                            }}
                            className={btnEdit}
                          >
                            EDIT
                          </button>
                        )}
                        <button
                          onClick={() => toggleTrancheActive(t)}
                          className={t.active ? btnToggleOn : btnToggleOff}
                        >
                          {t.active ? 'DISABLE' : 'ENABLE'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- DEALERS TAB ---- */}
        {activeTab === 'DEALERS' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#555] text-xs tracking-widest">
                DEALER CONFIGURATION
              </span>
              <button
                onClick={() => setShowAddDealer(!showAddDealer)}
                className={btnPrimary}
              >
                + ADD DEALER
              </button>
            </div>

            {showAddDealer && (
              <form
                onSubmit={addDealer}
                className="mb-4 p-4 border border-[#f0c04066] bg-[#0d0d0d] flex gap-3 items-end"
              >
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">CODE</label>
                  <input
                    required
                    value={newDealerForm.dealer_code}
                    onChange={(e) =>
                      setNewDealerForm((f) => ({
                        ...f,
                        dealer_code: e.target.value.toUpperCase(),
                      }))
                    }
                    className={inputClass}
                    style={{ width: 80 }}
                    placeholder="FIRM"
                    maxLength={8}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#555]">FULL NAME</label>
                  <input
                    value={newDealerForm.full_name}
                    onChange={(e) =>
                      setNewDealerForm((f) => ({
                        ...f,
                        full_name: e.target.value,
                      }))
                    }
                    className={inputClass}
                    style={{ width: 220 }}
                    placeholder="Optional"
                  />
                </div>
                <button type="submit" className={btnPrimary}>
                  ADD
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDealer(false)}
                  className={btnSecondary}
                >
                  CANCEL
                </button>
              </form>
            )}

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>CODE</th>
                  <th className={thClass}>FULL NAME</th>
                  <th className={thClass}>STATUS</th>
                  <th className={thClass}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {dealers.map((d) => (
                  <tr key={d.id} className="hover:bg-[#ffffff03]">
                    <td className={tdClass}>
                      <span className="text-[#f0c040] font-semibold">
                        {d.dealer_code}
                      </span>
                    </td>
                    <td className={tdClass + ' text-[#888]'}>
                      {d.full_name ?? '—'}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={
                          d.active ? 'text-[#66ff88]' : 'text-[#555]'
                        }
                      >
                        {d.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <button
                        onClick={() => toggleDealerActive(d)}
                        className={d.active ? btnToggleOn : btnToggleOff}
                      >
                        {d.active ? 'DISABLE' : 'ENABLE'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- BLOTTER TAB ---- */}
        {activeTab === 'BLOTTER' && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-[#555] text-xs tracking-widest mr-2">
                TRADE BLOTTER
              </span>

              {/* Filters */}
              <select
                value={filterSeries}
                onChange={(e) => setFilterSeries(e.target.value)}
                className={selectClass}
              >
                <option value="">ALL SERIES</option>
                {series.map((s) => (
                  <option key={s.series_number} value={s.series_number}>
                    CMBX.{s.series_number}
                  </option>
                ))}
              </select>

              <select
                value={filterTranche}
                onChange={(e) => setFilterTranche(e.target.value)}
                className={selectClass}
              >
                <option value="">ALL TRANCHES</option>
                {tranches.map((t) => (
                  <option key={t.tranche_name} value={t.tranche_name}>
                    {t.tranche_name}
                  </option>
                ))}
              </select>

              <select
                value={filterDealer}
                onChange={(e) => setFilterDealer(e.target.value)}
                className={selectClass}
              >
                <option value="">ALL DEALERS</option>
                {dealers.map((d) => (
                  <option key={d.dealer_code} value={d.dealer_code}>
                    {d.dealer_code}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <span className="text-[#555] text-xs">FROM</span>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className={inputClass}
                />
                <span className="text-[#555] text-xs">TO</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className={inputClass}
                />
              </div>

              {(filterSeries ||
                filterTranche ||
                filterDealer ||
                filterDateFrom ||
                filterDateTo) && (
                <button
                  onClick={() => {
                    setFilterSeries('')
                    setFilterTranche('')
                    setFilterDealer('')
                    setFilterDateFrom('')
                    setFilterDateTo('')
                  }}
                  className="text-xs text-[#ff6666] hover:text-[#ff9999] border border-[#ff666633] px-2 py-1 rounded-[3px]"
                >
                  CLEAR
                </button>
              )}

              <span className="text-[#333] text-xs ml-auto">
                {filteredTrades.length} TRADES
              </span>
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>TIME</th>
                  <th className={thClass}>SERIES</th>
                  <th className={thClass}>TRANCHE</th>
                  <th className={thClass}>SIDE</th>
                  <th className={thClass + ' text-right'}>PRICE</th>
                  <th className={thClass + ' text-right'}>SIZE</th>
                  <th className={thClass}>DEALER</th>
                  <th className={thClass}>BBG</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade) => (
                  <tr
                    key={trade.id}
                    className={`hover:bg-[#ffffff03] ${
                      trade.side === 'hit'
                        ? 'bg-[#ff666608]'
                        : 'bg-[#66ff8808]'
                    }`}
                  >
                    <td className={tdClass + ' text-[#555]'}>
                      {formatDate(trade.created_at)}
                    </td>
                    <td className={tdClass + ' text-[#f0c040]'}>
                      CMBX.{trade.series_number}
                    </td>
                    <td className={tdClass + ' text-[#f0c040]'}>
                      {trade.tranche_name}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={
                          trade.side === 'hit'
                            ? 'text-[#ff6666] font-semibold'
                            : 'text-[#66ff88] font-semibold'
                        }
                      >
                        {trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td className={tdClass + ' text-right text-[#cccccc]'}>
                      {formatPx(trade.price, null)}
                    </td>
                    <td className={tdClass + ' text-right text-[#888]'}>
                      {trade.size != null ? String(trade.size) : '—'}
                    </td>
                    <td className={tdClass + ' text-[#888]'}>{trade.dealer}</td>
                    <td className={tdClass}>
                      {trade.published_to_bbg ? (
                        <span className="text-[#66ff88]">
                          ✓{' '}
                          {trade.bbg_publish_time
                            ? formatTime(trade.bbg_publish_time)
                            : ''}
                        </span>
                      ) : (
                        <span className="text-[#555]">PENDING</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredTrades.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-8 text-center text-[#333] text-xs"
                    >
                      NO TRADES
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
