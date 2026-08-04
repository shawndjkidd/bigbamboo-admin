'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOWS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
// Fri, Sat, Sun are the trading nights (index within DOWS)
const TRADING = [4, 5, 6]

type Slot = {
  id?: string
  date: string
  status: string
  label?: string | null
  is_public?: boolean
  notes?: string | null
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [slots, setSlots] = useState<Record<string, Slot>>({})
  const [events, setEvents] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<Slot>({ date: '', status: 'booked', label: '', is_public: false, notes: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: av }, { data: ev }] = await Promise.all([
      supabase.from('venue_availability').select('*'),
      supabase.from('events').select('event_date, title, is_published').eq('is_published', true),
    ])
    const m: Record<string, Slot> = {}
    ;(av || []).forEach((r: any) => { m[r.date] = r })
    setSlots(m)
    const e: Record<string, string> = {}
    ;(ev || []).forEach((r: any) => { if (r.event_date) e[r.event_date] = r.title })
    setEvents(e)
    setLoading(false)
  }

  function openDay(key: string) {
    setSelected(key)
    const existing = slots[key]
    setForm(existing ? { ...existing } : { date: key, status: 'booked', label: '', is_public: false, notes: '' })
  }

  async function save() {
    setSaving(true)
    const payload = {
      date: form.date,
      status: form.status,
      label: form.label?.trim() || null,
      is_public: !!form.is_public,
      notes: form.notes?.trim() || null,
    }
    const { data, error } = await supabase
      .from('venue_availability')
      .upsert(payload, { onConflict: 'date' })
      .select()
      .single()
    setSaving(false)
    if (error) return showToast("Couldn't save. Try again.")
    setSlots(p => ({ ...p, [form.date]: data }))
    setSelected(null)
    showToast('Date updated')
  }

  async function clearDay() {
    setSaving(true)
    await supabase.from('venue_availability').delete().eq('date', form.date)
    setSaving(false)
    setSlots(p => { const n = { ...p }; delete n[form.date]; return n })
    setSelected(null)
    showToast('Date is open again')
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600) }

  // ── date maths ──
  const y = cursor.getFullYear()
  const mo = cursor.getMonth()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayKey = keyOf(today.getFullYear(), today.getMonth(), today.getDate())
  let startDow = new Date(y, mo, 1).getDay() - 1
  if (startDow < 0) startDow = 6
  const daysInMonth = new Date(y, mo + 1, 0).getDate()

  function keyOf(yy: number, mm: number, dd: number) {
    return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  function statusOf(key: string) {
    if (events[key]) return 'booked'
    return slots[key]?.status || 'open'
  }

  // ── month summary ──
  const summary = useMemo(() => {
    let booked = 0, hold = 0, openTrading = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const key = keyOf(y, mo, d)
      const dow = (new Date(y, mo, d).getDay() + 6) % 7
      const st = statusOf(key)
      if (st === 'booked') booked++
      else if (st === 'hold') hold++
      else if (TRADING.includes(dow) && new Date(y, mo, d) >= today) openTrading++
    }
    return { booked, hold, openTrading }
  }, [y, mo, slots, events, daysInMonth])

  const cellBase: React.CSSProperties = {
    minHeight: 76,
    borderRadius: 8,
    border: '1px solid var(--border-light)',
    background: 'var(--bg-card)',
    padding: '8px 9px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
    textAlign: 'left',
    width: '100%',
    font: 'inherit',
  }

  const muted = { color: 'var(--text-muted)' }
  const eyebrow: React.CSSProperties = {
    fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--text-muted)', fontWeight: 500,
  }

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 4, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: 'var(--text)' }}>
            Venue calendar
          </h1>
          <p style={{ ...muted, fontSize: 13, margin: '4px 0 0' }}>
            Click a date to book or hold it. Open dates show as available on bigbamboo.app/pitch
          </p>
        </div>
        <button className="btn-outline" onClick={load} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* ── Month bar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, margin: '24px 0 14px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 21, fontWeight: 650, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            {MONTHS[mo]} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{y}</span>
          </div>
          {!loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Stat n={summary.booked} label="booked" tone="red" />
              {summary.hold > 0 && <Stat n={summary.hold} label="on hold" tone="orange" />}
              <Stat n={summary.openTrading} label="open Fri–Sun" tone="gray" />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <NavBtn label="Previous month" onClick={() => setCursor(p => shift(p, -1))}>‹</NavBtn>
          <button
            className="btn-outline"
            onClick={() => { const d = new Date(); d.setDate(1); setCursor(d) }}
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            Today
          </button>
          <NavBtn label="Next month" onClick={() => setCursor(p => shift(p, 1))}>›</NavBtn>
        </div>
      </div>

      {/* ── Grid ── */}
      <div style={{ position: 'relative' }}>
        {/* trading-week bands behind the grid */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, display: 'grid',
          gridTemplateColumns: 'repeat(7,1fr)', gap: 6, pointerEvents: 'none',
        }}>
          {DOWS.map((d, i) => (
            <div key={d} style={{
              borderRadius: 10,
              background: TRADING.includes(i) ? 'var(--bg-active)' : 'transparent',
            }} />
          ))}
        </div>

        {/* day-of-week header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, position: 'relative' }}>
          {DOWS.map((d, i) => (
            <div key={d} style={{
              ...eyebrow,
              textAlign: 'center',
              padding: '8px 0 10px',
              color: TRADING.includes(i) ? 'var(--accent)' : 'var(--text-muted)',
              opacity: TRADING.includes(i) ? 1 : 0.65,
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, position: 'relative', paddingBottom: 8 }}>
          {Array.from({ length: startDow }).map((_, i) => <div key={'pad' + i} />)}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1
            const key = keyOf(y, mo, d)
            const dt = new Date(y, mo, d); dt.setHours(0, 0, 0, 0)
            const dow = (dt.getDay() + 6) % 7
            const isTrading = TRADING.includes(dow)
            const isPast = dt < today
            const isToday = key === todayKey
            const st = statusOf(key)
            const evTitle = events[key]
            const slot = slots[key]
            const text = evTitle || slot?.label || ''

            const tone =
              st === 'booked' ? { bd: 'var(--badge-red-border)', bg: 'var(--badge-red-bg)', fg: 'var(--badge-red-text)', word: 'Booked' } :
              st === 'hold' ? { bd: 'var(--badge-orange-border)', bg: 'var(--badge-orange-bg)', fg: 'var(--badge-orange-text)', word: 'On hold' } :
              st === 'blocked' ? { bd: 'var(--border)', bg: 'var(--bg-subtle)', fg: 'var(--text-muted)', word: 'Blocked' } :
              null

            return (
              <button
                key={key}
                onClick={() => !isPast && openDay(key)}
                disabled={isPast}
                aria-label={`${d} ${MONTHS[mo]} — ${tone ? tone.word : isTrading ? 'open' : 'closed'}`}
                style={{
                  ...cellBase,
                  cursor: isPast ? 'default' : 'pointer',
                  opacity: isPast ? 0.32 : isTrading ? 1 : 0.55,
                  background: tone ? tone.bg : 'var(--bg-card)',
                  borderColor: tone ? tone.bd : 'var(--border-light)',
                  boxShadow: isToday ? '0 0 0 2px var(--accent)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{
                    fontSize: isTrading ? 16 : 14,
                    fontWeight: isTrading ? 650 : 450,
                    fontVariantNumeric: 'tabular-nums',
                    color: tone ? tone.fg : 'var(--text)',
                    lineHeight: 1,
                  }}>
                    {d}
                  </span>
                  {isToday && (
                    <span style={{ ...eyebrow, fontSize: 9, color: 'var(--accent)' }}>Today</span>
                  )}
                </div>

                {tone && (
                  <span style={{ ...eyebrow, fontSize: 9, color: tone.fg }}>{tone.word}</span>
                )}

                {text && (
                  <span style={{
                    fontSize: 11, lineHeight: 1.25, color: 'var(--text-secondary)',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {text}
                  </span>
                )}

                {evTitle && (
                  <span style={{ ...eyebrow, fontSize: 9, color: 'var(--accent)', marginTop: 'auto' }}>
                    Ticketed event
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{
        display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
        marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-light)',
      }}>
        <Key swatchBg="var(--bg-card)" swatchBd="var(--border-light)" text="Open" />
        <Key swatchBg="var(--badge-orange-bg)" swatchBd="var(--badge-orange-border)" text="On hold" />
        <Key swatchBg="var(--badge-red-bg)" swatchBd="var(--badge-red-border)" text="Booked" />
        <Key swatchBg="var(--bg-subtle)" swatchBd="var(--border)" text="Blocked" />
        <span style={{ ...muted, fontSize: 12, marginLeft: 'auto' }}>
          Fri–Sun are highlighted as trading nights. Published events fill their date automatically.
        </span>
      </div>

      {/* ── Day editor ── */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={e => e.target === e.currentTarget && setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 430, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 650, color: 'var(--text)' }}>
                  {new Date(selected + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                {events[selected] && (
                  <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 3 }}>
                    Ticketed event: {events[selected]}
                  </div>
                )}
              </div>
              <button className="btn-outline" onClick={() => setSelected(null)} style={{ padding: '4px 10px', fontSize: 13 }}>
                Close
              </button>
            </div>

            {events[selected] ? (
              <p style={{ ...muted, fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
                This date is filled by a published event. Edit it on the Events page — changes appear here automatically.
              </p>
            ) : (
              <>
                <Field label="Status">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      ['booked', 'Booked'],
                      ['hold', 'On hold'],
                      ['blocked', 'Blocked'],
                    ].map(([k, l]) => (
                      <button
                        key={k}
                        onClick={() => setForm(f => ({ ...f, status: k }))}
                        style={{
                          padding: '7px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                          border: '1px solid',
                          borderColor: form.status === k ? 'var(--accent)' : 'var(--border)',
                          background: form.status === k ? 'var(--accent-light)' : 'transparent',
                          color: form.status === k ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: form.status === k ? 600 : 400,
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Label" hint="Shown on your calendar. Optional.">
                  <input
                    className="input"
                    value={form.label || ''}
                    placeholder="Private event, wedding, deep clean…"
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  />
                </Field>

                <label style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  border: '1px solid var(--border-light)', borderRadius: 8,
                  padding: '12px 14px', marginBottom: 16, cursor: 'pointer',
                }}>
                  <span>
                    <span style={{ fontSize: 14, color: 'var(--text)', display: 'block' }}>Show this label publicly</span>
                    <span style={{ ...muted, fontSize: 12 }}>
                      {form.is_public ? 'Promoters see the label' : 'Promoters just see “Booked”'}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={!!form.is_public}
                    onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                  />
                </label>

                <Field label="Private note" hint="Only you see this.">
                  <input
                    className="input"
                    value={form.notes || ''}
                    placeholder="Deposit paid, contact name…"
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </Field>

                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="btn-accent" onClick={save} disabled={saving} style={{ flex: 1 }}>
                    {saving ? 'Saving…' : 'Save date'}
                  </button>
                  {slots[selected] && (
                    <button className="btn-outline" onClick={clearDay} disabled={saving}>
                      Mark open
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div role="status" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderLeft: '3px solid var(--accent)', borderRadius: 8,
          padding: '11px 18px', fontSize: 13, color: 'var(--text)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function shift(d: Date, by: number) {
  const n = new Date(d)
  n.setMonth(n.getMonth() + by)
  return n
}

function NavBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      className="btn-outline"
      onClick={onClick}
      aria-label={label}
      style={{ width: 32, height: 32, padding: 0, fontSize: 15, lineHeight: 1 }}
    >
      {children}
    </button>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone: 'red' | 'orange' | 'gray' }) {
  const c = `var(--badge-${tone}-text)`
  return (
    <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
      <strong style={{ color: c, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{n}</strong>{' '}{label}
    </span>
  )
}

function Key({ swatchBg, swatchBd, text }: { swatchBg: string; swatchBd: string; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span style={{ width: 13, height: 13, borderRadius: 4, background: swatchBg, border: `1px solid ${swatchBd}` }} />
      {text}
    </span>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
        marginBottom: 6, letterSpacing: '0.01em',
      }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{hint}</div>}
    </div>
  )
}
