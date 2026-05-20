'use client'

import { useState } from 'react'
import { Theme, DEFAULT_THEME } from '../../lib/theme'

interface Props {
  theme:   Theme
  onSave:  (t: Theme) => void
  onClose: () => void
}

// Curated swatches per field — terminal-friendly palette
const SWATCHES: Record<keyof Theme, string[]> = {
  bg: [
    '#0a0a0a', '#060606', '#111111',
    '#0a0f0a', '#0a0a14', '#14100a',
    '#0f0a14', '#0a1414',
  ],
  fg: [
    '#cccccc', '#ffffff', '#aaaaaa',
    '#e8e0cc', '#ccddcc', '#ddddcc',
    '#bbbbbb', '#999999',
  ],
  accent: [
    '#f0c040', '#4488ff', '#66ff88',
    '#ff6644', '#cc88ff', '#44ddff',
    '#ff4488', '#ffdd44',
  ],
  bid: [
    '#66ff88', '#44dd66', '#88ffaa',
    '#44ffff', '#4488ff', '#aaffcc',
    '#ffffff', '#ffff44',
  ],
  ask: [
    '#ff6666', '#ff4444', '#ff8844',
    '#ff44aa', '#ff88cc', '#ffaa44',
    '#ffffff', '#ff6699',
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
