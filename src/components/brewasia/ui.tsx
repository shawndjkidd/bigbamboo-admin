'use client'
// Shared pieces for the BrewAsia pages (Kegs, Collabs). Square corners throughout:
// Shawn doesn't want pill shapes anywhere.
import { useEffect } from 'react'

export type Tone = { fg: string; bg: string; bd: string }

export const todayKey = () => new Date().toLocaleDateString('en-CA')
export const fmtL = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n)

export function Pill({ value, options, tone, onChange, label, dot, disabled }: {
  value: string
  options: { value: string; label: string }[]
  tone: Tone
  onChange: (v: string) => void
  label: string
  dot?: string
  disabled?: boolean
}) {
  return (
    <span className="keg-pill-wrap" style={{ color: tone.fg }}>
      {dot && <span className="keg-pill-dot" style={{ background: dot }} aria-hidden />}
      <select
        className={dot ? 'keg-pill keg-pill--dot' : 'keg-pill'}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        style={{ background: tone.bg, borderColor: tone.bd, color: tone.fg }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  )
}

export function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="keg-modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="card keg-modal" style={{ maxWidth: narrow ? 420 : 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.03em', color: 'var(--text)', lineHeight: 1.1 }}>
            {title}
          </div>
          <button className="btn-outline" onClick={onClose} style={{ padding: '0 12px', fontSize: 13, height: 32 }}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function StatCard({ label, tone, kegs, litres: l, sub, todo, active, loading, onClick }: {
  label: string
  tone?: Tone
  kegs: number
  litres: number
  sub: string
  todo?: boolean
  active: boolean
  loading: boolean
  onClick: () => void
}) {
  const ring = tone ? tone.fg : 'var(--accent)'
  return (
    <button
      className={['card', 'keg-stat', todo ? 'keg-stat--todo' : ''].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-pressed={active}
      style={{ boxShadow: active ? `0 0 0 2px ${ring}` : undefined, borderColor: active ? 'transparent' : undefined }}
    >
      {tone && <span className="keg-stat__stripe" style={{ background: tone.fg }} aria-hidden />}
      <span className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, color: tone ? tone.fg : 'var(--text)' }}>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="kpi-value" style={{ fontSize: 36, color: 'var(--text)' }}>{loading ? '–' : kegs}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{kegs === 1 ? 'keg' : 'kegs'}</span>
      </span>
      <span className="kpi-sub" style={{ display: 'block' }}>
        {fmtL(l)} L{sub ? ` · ${sub}` : ''}
      </span>
    </button>
  )
}

export function Choice<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const on = value === o.key
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            style={{
              minHeight: 40, padding: '0 16px', borderRadius: 9, fontSize: 14, cursor: 'pointer', border: '1px solid',
              borderColor: on ? 'var(--accent)' : 'var(--border)',
              background: on ? 'var(--accent-light)' : 'transparent',
              color: on ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: on ? 600 : 400, transition: 'all .15s',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Field({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 14, minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.01em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
