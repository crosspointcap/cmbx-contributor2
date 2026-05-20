'use client'

import { useState } from 'react'
import { Theme, DEFAULT_THEME } from '../../lib/theme'

interface Props {
  theme:   Theme
  onSave:  (t: Theme) => void
  onClose: () => void
}

const FIELDS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: 'bg',     label: 'BACKGROUND', hint: 'page & table background' },
  { key: 'fg',     label: 'TEXT',       hint: 'main body text'          },
  { key: 'accent', label: 'ACCENT',     hint: 'headers & borders'       },
  { key: 'bid',    label: 'BID',        hint: 'bid prices & buy button' },
  { key: 'ask',    label: 'OFFER',      hint: 'ask prices & sell button'},
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
        width: '320px',
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

        {/* Colour pickers */}
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <label style={{ color: draft.fg, fontSize: '11px', width: '90px', opacity: 0.7, letterSpacing: '1px' }}>
              {label}
            </label>
            <input
              type="color"
              value={draft[key]}
              onChange={e => set(key, e.target.value)}
              style={{ width: '36px', height: '26px', border: `1px solid ${draft.accent}44`,
                       background: 'none', cursor: 'pointer', padding: '1px', borderRadius: '2px' }}
            />
            <span style={{ color: draft[key], fontSize: '11px', fontFamily: 'Courier New', minWidth: '60px' }}>
              {draft[key]}
            </span>
            <span style={{ color: draft.fg, fontSize: '10px', opacity: 0.35 }}>{hint}</span>
          </div>
        ))}

        {/* Preview swatch */}
        <div style={{
          margin: '14px 0',
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
