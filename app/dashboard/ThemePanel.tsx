'use client'

import { useState } from 'react'
import { Theme, DEFAULT_THEME } from '../../lib/theme'

interface Props {
  theme:   Theme
  onSave:  (t: Theme) => void
  onClose: () => void
}

// ── Preset themes ────────────────────────────────────────────────────────────
const PRESETS: { label: string; theme: Theme }[] = [
  {
    label: 'DARK',
    theme: {
      bg: '#0a0a0a', fg: '#cccccc', accent: '#f0c040', bid: '#66ff88', ask: '#ff6666',
    },
  },
  {
    label: 'WARM',
    theme: {
      bg: '#1a1208', fg: '#e8d5aa', accent: '#f0a020', bid: '#88cc55', ask: '#ff7744',
    },
  },
  {
    label: 'LIGHT',
    theme: {
      bg: '#f2f0eb', fg: '#1a1a1a', accent: '#1a55aa', bid: '#1a7a2a', ask: '#cc2222',
    },
  },
]

// ── Curated swatches — both dark and light options ───────────────────────────
const SWATCHES: Record<keyof Theme, string[]> = {
  bg: [
    // dark
    '#0a0a0a', '#060606', '#111111', '#1a1208', '#0a0a14', '#0a0f0a',
    // light
    '#f2f0eb', '#ffffff', '#e8e8e8', '#f0ede0', '#e8eef5', '#edf5ed',
  ],
  fg: [
    // light (for dark backgrounds)
    '#cccccc', '#ffffff', '#aaaaaa', '#e8d5aa', '#ddddcc', '#bbbbbb',
    // dark (for light backgrounds)
    '#1a1a1a', '#111111', '#333333', '#222233', '#1a1208', '#2a2a1a',
  ],
  accent: [
    '#f0c040', '#f0a020', '#1a55aa', '#4488ff',
    '#44aa44', '#cc2222', '#cc88ff', '#44ddff',
  ],
  bid: [
    '#66ff88', '#44dd66', '#1a7a2a', '#2a8a3a',
    '#4488ff', '#44ffff', '#aaffcc', '#88cc55',
  ],
  ask: [
    '#ff6666', '#ff4444', '#cc2222', '#aa1111',
    '#ff8844', '#ff7744', '#ff44aa', '#dd4422',
  ],
}

const FIELDS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: 'bg',     label: 'BACKGROUND', hint: 'page background'           },
  { key: 'fg',     label: 'TEXT',       hint: 'body text'                 },
  { key: 'accent', label: 'ACCENT',     hint: 'headers & highlights'      },
  { key: 'bid',    label: 'BID',        hint: 'bid prices & buy button'   },
  { key: 'ask',    label: 'OFFER',      hint: 'ask prices & sell button'  },
]

export function ThemePanel({ theme, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Theme>(theme)
  const set = (key: keyof Theme, val: string) => setDraft(prev => ({ ...prev, [key]: val }))

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000,
               display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: draft.bg,
        border: `1px solid ${draft.accent}`,
        padding: '22px 26px',
        width: '360px',
        fontFamily: 'Courier New, monospace',
        borderRadius: '3px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <span style={{ color: draft.accent, fontSize: '13px', fontWeight: 700, letterSpacing: '2px' }}>
            DISPLAY SETTINGS
          </span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: draft.fg, fontSize: '18px', cursor: 'pointer', opacity: 0.5, fontFamily: 'Courier New' }}>
            ×
          </button>
        </div>

        {/* Preset themes */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
          {PRESETS.map(({ label, theme: preset }) => {
            const isActive = (Object.keys(preset) as (keyof Theme)[]).every(k => draft[k] === preset[k])
            return (
              <button
                key={label}
                onClick={() => setDraft(preset)}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  fontSize: '11px',
                  fontFamily: 'Courier New, monospace',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  background: isActive ? preset.accent + '22' : preset.bg,
                  color: isActive ? preset.accent : preset.fg,
                  border: `1px solid ${isActive ? preset.accent : preset.accent + '55'}`,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Swatch rows */}
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key} style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '5px' }}>
              <span style={{ color: draft.fg, fontSize: '10px', letterSpacing: '1px', opacity: 0.6, width: '90px' }}>
                {label}
              </span>
              <span style={{ color: draft.fg, fontSize: '10px', opacity: 0.3 }}>{hint}</span>
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
              {SWATCHES[key].map(color => {
                const isSelected = draft[key] === color
                return (
                  <button
                    key={color}
                    onClick={() => set(key, color)}
                    title={color}
                    style={{
                      width: '26px', height: '26px',
                      background: color,
                      border: isSelected ? `2px solid ${draft.accent}` : '2px solid transparent',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      outline: isSelected ? `1px solid ${draft.bg}` : 'none',
                      outlineOffset: '-3px',
                    }}
                  />
                )
              })}
              {/* Current value chip — shows selected hex, click to keep */}
              <span style={{
                color: draft[key],
                fontSize: '10px',
                fontFamily: 'Courier New, monospace',
                opacity: 0.7,
                marginLeft: '2px',
                minWidth: '52px',
              }}>
                {draft[key]}
              </span>
            </div>
          </div>
        ))}

        {/* Preview swatch */}
        <div style={{
          margin: '16px 0 12px',
          padding: '8px 12px',
          border: `1px solid ${draft.accent}44`,
          borderRadius: '2px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: draft.bg,
        }}>
          <span style={{ color: draft.accent, fontSize: '12px', fontWeight: 700 }}>CMBX.15</span>
          <span style={{ color: draft.bid,    fontSize: '12px', fontWeight: 700 }}>85-16</span>
          <span style={{ color: draft.fg,     fontSize: '11px', opacity: 0.4 }}>/</span>
          <span style={{ color: draft.ask,    fontSize: '12px', fontWeight: 700 }}>86-00</span>
          <span style={{ color: draft.fg,     fontSize: '11px', opacity: 0.5, marginLeft: 'auto' }}>preview</span>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={() => onSave(draft)}
            style={{
              flex: 1, background: draft.bid + '22', color: draft.bid,
              border: `1px solid ${draft.bid}66`, padding: '6px',
              fontSize: '12px', fontFamily: 'Courier New', cursor: 'pointer',
              borderRadius: '2px', fontWeight: 700, letterSpacing: '1px',
            }}
          >
            SAVE
          </button>
          <button
            onClick={() => { setDraft(DEFAULT_THEME); onSave(DEFAULT_THEME) }}
            style={{
              background: 'transparent', color: draft.fg,
              border: `1px solid ${draft.fg}33`, padding: '6px 14px',
              fontSize: '12px', fontFamily: 'Courier New', cursor: 'pointer',
              borderRadius: '2px', opacity: 0.6,
            }}
          >
            RESET
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', color: draft.fg,
              border: `1px solid ${draft.fg}33`, padding: '6px 14px',
              fontSize: '12px', fontFamily: 'Courier New', cursor: 'pointer',
              borderRadius: '2px', opacity: 0.6,
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}
