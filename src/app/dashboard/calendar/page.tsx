'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOWS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

type Slot = { id?: string; date: string; status: string; label?: string | null; is_public?: boolean; notes?: string | null }

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [slots, setSlots] = useState<Record<string, Slot>>({})
  const [events, setEvents] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<Slot>({ date: '', status: 'booked', label: '', is_public: false, notes: '' })
  const [loading, setLoading] = useState(true)
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
    setForm(existing
      ? { ...existing }
      : { date: key, status: 'booked', label: '', is_public: false, notes: '' })
  }

  async function save() {
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
    if (error) return showToast('Save failed')
    setSlots(p => ({ ...p, [form.date]: data }))
    setSelected(null)
    showToast('✓ Saved')
  }

  async function clearDay() {
    await supabase.from('venue_availability').delete().eq('date', form.date)
    setSlots(p => { const n = { ...p }; delete n[form.date]; return n })
    setSelected(null)
    showToast('Date cleared — now open')
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2500) }

  const y = cursor.getFullYear(), mo = cursor.getMonth()
  const today = new Date(); today.setHours(0,0,0,0)
  let startDow = new Date(y, mo, 1).getDay() - 1; if (startDow < 0) startDow = 6
  const daysInMonth = new Date(y, mo + 1, 0).getDate()

  const mono = { fontFamily: 'DM Mono, monospace' }
  const label = { ...mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 6, display: 'block' }
  const inp = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px', color: '#F5EED8', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  const STYLE: any = {
    open:    { bg: 'rgba(0,200,88,0.07)',   bd: 'rgba(0,200,88,0.3)',   fg: '#00C858', mark: '✓' },
    booked:  { bg: 'rgba(224,96,96,0.09)',  bd: 'rgba(224,96,96,0.38)', fg: '#E06060', mark: '✕' },
    hold:    { bg: 'rgba(232,168,32,0.09)', bd: 'rgba(232,168,32,0.38)',fg: '#E8A820', mark: '◐' },
    blocked: { bg: 'rgba(255,255,255,0.05)',bd: 'rgba(255,255,255,0.2)',fg: 'rgba(255,255,255,0.5)', mark: '■' },
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: '0.06em' }}>Venue Calendar</div>
        <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', ...mono, fontSize: 11 }}>↻ Refresh</button>
      </div>
      <div style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24 }}>
        Click any date to book, hold, or clear · Shows live on bigbamboo.app/pitch
      </div>

      {/* Month nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Bebas Neue', fontSize: 26, letterSpacing: '0.04em', color: '#F5EED8' }}>{MONTHS[mo]} {y}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['‹','›'].map((c, i) => (
            <button key={c} onClick={() => setCursor(p => { const d = new Date(p); d.setMonth(d.getMonth() + (i === 0 ? -1 : 1)); return d })}
              style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16 }}>{c}</button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ ...mono, fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: 20 }}>Loading...</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
            {DOWS.map(d => <div key={d} style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.3)', textAlign: 'center' as const, paddingBottom: 4 }}>{d}</div>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
            {Array.from({ length: startDow }).map((_, i) => <div key={'e'+i} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1
              const key = `${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const dt = new Date(y, mo, d); dt.setHours(0,0,0,0)
              const isPast = dt < today
              const slot = slots[key]
              const evTitle = events[key]
              const st = evTitle ? 'booked' : (slot?.status || 'open')
              const s = STYLE[st] || STYLE.open
              const text = evTitle || (slot?.label) || ''

              return (
                <div key={key} onClick={() => !isPast && openDay(key)}
                  style={{
                    aspectRatio: '1', borderRadius: 10, border: `1px solid ${s.bd}`, background: s.bg,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, padding: 4, cursor: isPast ? 'default' : 'pointer',
                    opacity: isPast ? 0.22 : 1, transition: 'transform 0.1s', overflow: 'hidden'
                  }}>
                  <div style={{ ...mono, fontSize: 13, fontWeight: 500, color: '#F5EED8' }}>{d}</div>
                  <div style={{ fontSize: 10, color: s.fg }}>{s.mark}</div>
                  {text && <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.55)', textAlign: 'center' as const, lineHeight: 1.1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{text}</div>}
                  {evTitle && <div style={{ fontSize: 7, color: '#E8A820' }}>event</div>}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' as const, marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {[['open','Open'],['hold','On Hold'],['booked','Booked'],['blocked','Blocked']].map(([k, l]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, ...mono, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: STYLE[k].bg, border: `1px solid ${STYLE[k].bd}` }} /> {l}
              </div>
            ))}
          </div>
          <div style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.28)', textAlign: 'center' as const, marginTop: 12 }}>
            Published events auto-block their date — manage those in Events
          </div>
        </>
      )}

      {/* Day editor */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div style={{ background: '#1A3A38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 26, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: '#F5EED8', letterSpacing: '0.04em' }}>
                  {new Date(selected + 'T00:00:00').toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                {events[selected] && <div style={{ ...mono, fontSize: 10, color: '#E8A820', marginTop: 3 }}>Published event: {events[selected]}</div>}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.5)', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={label}>Status</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {[['booked','✕ Booked'],['hold','◐ On Hold'],['blocked','■ Blocked']].map(([k, l]) => (
                  <button key={k} onClick={() => setForm(f => ({ ...f, status: k }))}
                    style={{ padding: '7px 14px', borderRadius: 100, fontSize: 11, cursor: 'pointer', ...mono, border: '1px solid',
                      background: form.status === k ? STYLE[k].bg : 'transparent',
                      borderColor: form.status === k ? STYLE[k].bd : 'rgba(255,255,255,0.12)',
                      color: form.status === k ? STYLE[k].fg : 'rgba(255,255,255,0.4)' }}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={label}>Label</label>
              <input style={inp} value={form.label || ''} placeholder="e.g. Private Event, Wedding, Maintenance"
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, color: '#F5EED8' }}>Show label publicly</div>
                <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {form.is_public ? 'Visitors see the label' : 'Visitors just see "Booked"'}
                </div>
              </div>
              <button onClick={() => setForm(f => ({ ...f, is_public: !f.is_public }))}
                style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative' as const, flexShrink: 0,
                  background: form.is_public ? '#E8A820' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute' as const, top: 3, left: form.is_public ? 23 : 3, transition: 'left 0.2s' }} />
              </button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={label}>Internal notes</label>
              <input style={inp} value={form.notes || ''} placeholder="Only you see this"
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} style={{ flex: 1, background: '#E8A820', color: '#1a0800', border: 'none', borderRadius: 10, padding: '13px', fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: '0.08em', cursor: 'pointer' }}>Save</button>
              {slots[selected] && (
                <button onClick={clearDay} style={{ background: 'rgba(0,200,88,0.1)', border: '1px solid rgba(0,200,88,0.3)', color: '#00C858', borderRadius: 10, padding: '13px 20px', cursor: 'pointer', ...mono, fontSize: 11 }}>Mark Open</button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#00B14F', color: '#fff', padding: '11px 20px', borderRadius: 8, ...mono, fontSize: 11, letterSpacing: '0.1em', zIndex: 9999 }}>{toast}</div>}
    </div>
  )
}
