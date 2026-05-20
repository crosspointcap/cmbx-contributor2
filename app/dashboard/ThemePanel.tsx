'use client'

import { useState } from 'react'
import { Theme, DEFAULT_THEME } from '../../lib/theme'

interface Props {
  theme:   Theme
  onSave:  (t: Theme) => void
  onClose: () => void
}

// ── Preset themes ────────────────────────────────────────────────────────────
const PRESETS: { label: string; desc: string; theme: Theme }[] = [
  {
    label: 'DARK',
    desc:  'Black · grey text · amber',
    theme: { bg: '#0a0a0a', fg: '#ffffff', accent: '#f0c040', bid: '#00ee55', ask: '#ff3333' },
  },
  {
    label: 'BLUE',
    desc:  'Royal blue · white · red/orange',
    theme: { bg: '#1055a0', fg: '#ffffff', accent: '#ffdd00', bid: '#ff7722', ask: '#ff2222' },
  },
  {
    label: 'LIGHT',
    desc:  'White · black text · navy',
    theme: { bg: '#f5f5f5', fg: '#111111', accent: '#1055a0', bid: '#007722', ask: '#cc1111' },
  },
]

// ── Curated swatches — vivid, high-contrast, covers dark + light + blue ──────
const SWATCHES: Record<keyof Theme, string[]> = {
  bg: [
    // dark
    '#0a0a0a', '#111111', '#1a1a1a',
    // blue (TP-style)
    '#1055a0', '#1565c0', '#0d3b7a', '#0a2a5a',
    // light
    '#f5f5f5', '#ffffff', '#eef2f8',
  ],
  fg: [
    // light text (for dark/blue backgrounds)
    '#ffffff', '#eeeeee', '#cccccc', '#ddddaa',
    // dark text (for light backgrounds)
    '#111111', '#222222', '#333333', '#1a1a44',
  ],
  accent: [
    '#f0c040', '#ffdd00', '#ff9900',  // golds / ambers
    '#1055a0', '#4499ff',              // blues
    '#00cc44', '#cc1111', '#cc44ff',   // green / red / purple
  ],
  bid: [
    '#00ee55', '#00cc44', '#44ff88',   // vivid greens
    '#ff7722', '#ff9900',              // TP-style orange bids
    '#ffffff', '#ffff00', '#44ddff',   // white / yellow / cyan
  ],
  ask: [
    '#ff3333', '#ff2222', '#ee0000',   // vivid reds
    '#ff5500', '#ff7722',              // red-oranges
    '#ffffff', '#ffaa00', '#ff44aa',   // white / amber / pink
  ],
}

const FIELDS: { key: keyof Theme; label: string }[] = [
  { key: 'bg',     label: 'BACKGROUND' },
  { key: 'fg',     label: 'TEXT'       },
  { key: 'accent', label: 'ACCENT'     },
  { key: 'bid',    label: 'BID'        },
  { key: 'ask',    label: 'OFFER'      },
]

export function ThemePanel({ theme, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Theme>(theme)
  const set = (key: keyof Theme, val: string) => setDraft(prev => ({ ...prev, [key]: val }))

  // Detect if bg is "light" so we can pick a readable panel border/bg
  const isLightBg = parseInt(draft.bg.slice(1, 3), 16) > 180

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000,
               display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: draft.bg,
        border: `2px solid ${draft.accent}`,
        padding: '24px 28px',
        width: '380px',
        fontFamily: 'Courier New, monospace',
        borderRadius: '4px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ color: draft.accent, fontSize: '14px', fontWeight: 700, letterSpacing: '2px' }}>
            DISPLAY SETTINGS
          </span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: draft.fg, fontSize: '20px', cursor: 'pointer', opacity: 0.5, fontFamily: 'Courier New', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* ── Preset theme buttons ── */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ color: draft.fg, fontSize: '10px', letterSpacing: '1px', opacity: 0.5, marginBottom: '8px' }}>
            PRESETS
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {PRESETS.map(({ label, desc, theme: preset }) => {
              const isActive = (Object.keys(preset) as (keyof Theme)[]).every(k => draft[k] === preset[k])
              return (
                <button
                  key={label}
                  onClick={() => setDraft(preset)}
                  title={desc}
                  style={{
                    flex: 1,
                    padding: '10px 4px 8px',
                    fontSize: '11px',
                    fontFamily: 'Courier New, monospace',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    cursor: 'pointer',
                    borderRadius: '3px',
                    background: preset.bg,
                    color: preset.fg,
                    border: isActive
                      ? `2px solid ${preset.accent}`
                      : `1px solid ${preset.accent}66`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span style={{ fontSize: '13px' }}>{label}</span>
                  {/* Mini preview bar */}
                  <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                    <span style={{ width: '14px', height: '6px', background: preset.bid, borderRadius: '1px', display: 'inline-block' }} />
                    <span style={{ width: '14px', height: '6px', background: preset.ask, borderRadius: '1px', display: 'inline-block' }} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${draft.fg}22`, marginBottom: '16px' }} />

        {/* ── Swatch rows ── */}
        {FIELDS.map(({ key, label }) => (
          <div key={key} style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: draft.fg, fontSize: '10px', letterSpacing: '1px', opacity: 0.55, width: '84px', flexShrink: 0 }}>
              {label}
            </span>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
              {SWATCHES[key].map(color => {
                const isSelected = draft[key] === color
                return (
                  <button
                    key={color}
                    onClick={() => set(key, color)}
                    title={color}
                    style={{
                      width: '28px', height: '28px',
                      background: color,
                      border: isSelected
                        ? `3px solid ${draft.accent}`
                        : `1px solid ${isLightBg ? '#cccccc' : '#333333'}`,
                      borderRadius: '3px',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />
                )
              })}
              {/* Live hex readout */}
              <span style={{ color: draft[key], fontSize: '10px', opacity: 0.6, marginLeft: 'auto', minWidth: '54px', textAlign: 'right' }}>
                {draft[key]}
              </span>
            </div>
          </div>
        ))}

        {/* ── Live preview row ── */}
        <div style={{
          margin: '16px 0 14px',
          padding: '10px 14px',
          border: `1px solid ${draft.accent}66`,
          borderRadius: '3px',
          background: draft.bg,
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <span style={{ color: draft.accent, fontSize: '13px', fontWeight: 700 }}>CMBX.15</span>
          <span style={{ color: draft.bid,    fontSize: '14px', fontWeight: 700 }}>85-16</span>
          <span style={{ color: draft.fg,     fontSize: '12px', opacity: 0.35 }}>/</span>
          <span style={{ color: draft.ask,    fontSize: '14px', fontWeight: 700 }}>86-00</span>
          <span style={{ color: draft.fg,     fontSize: '10px', opacity: 0.4, marginLeft: 'auto' }}>preview</span>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onSave(draft)}
            style={{
              flex: 1, padding: '8px',
              background: draft.accent, color: draft.bg,
              border: 'none',
              fontSize: '12px', fontFamily: 'Courier New', cursor: 'pointer',
              borderRadius: '3px', fontWeight: 700, letterSpacing: '1px',
            }}
          >
            SAVE
          </button>
          <button
            onClick={() => { setDraft(DEFAULT_THEME); onSave(DEFAULT_THEME) }}
            style={{
              padding: '8px 14px',
              background: 'transparent', color: draft.fg,
              border: `1px solid ${draft.fg}44`,
              fontSize: '12px', fontFamily: 'Courier New', cursor: 'pointer',
              borderRadius: '3px', opacity: 0.7,
            }}
          >
            RESET
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: 'transparent', color: draft.fg,
              border: `1px solid ${draft.fg}44`,
              fontSize: '12px', fontFamily: 'Courier New', cursor: 'pointer',
              borderRadius: '3px', opacity: 0.7,
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}
