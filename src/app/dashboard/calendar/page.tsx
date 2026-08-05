'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TeaserField from '@/components/TeaserField'
import { useT, pick } from '@/i18n/admin'

// Fri, Sat, Sun are the trading nights (index within the day-of-week row)
const TRADING = [4, 5, 6]

type Slot = {
  id?: string
  date: string
  status: string
  label?: string | null
  label_vi?: string | null
  teaser?: string | null
  teaser_vi?: string | null
  is_public?: boolean
  notes?: string | null
}

type Ev = { title: string; title_vi: string | null; teaser: string | null; teaser_vi: string | null }

const BLANK: Slot = {
  date: '', status: 'booked', label: '', label_vi: '', teaser: '', teaser_vi: '', is_public: false, notes: '',
}

export default function CalendarPage() {
  const { t, lang } = useT()
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [slots, setSlots] = useState<Record<string, Slot>>({})
  const [events, setEvents] = useState<Record<string, Ev>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<Slot>({ ...BLANK })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: av }, { data: ev }] = await Promise.all([
      supabase.from('venue_availability').select('*'),
      supabase.from('events').select('event_date, title, title_vi, teaser, teaser_vi, is_published').eq('is_published', true),
    ])
    const m: Record<string, Slot> = {}
    ;(av || []).forEach((r: any) => { m[r.date] = r })
    setSlots(m)
    const e: Record<string, Ev> = {}
    ;(ev || []).forEach((r: any) => {
      if (r.event_date) e[r.event_date] = {
        title: r.title, title_vi: r.title_vi ?? null, teaser: r.teaser ?? null, teaser_vi: r.teaser_vi ?? null,
      }
    })
    setEvents(e)
    setLoading(false)
  }

  function openDay(key: string) {
    setSelected(key)
    const existing = slots[key]
    setForm(existing ? { ...BLANK, ...existing } : { ...BLANK, date: key })
  }

  async function save() {
    setSaving(true)
    const payload = {
      date: form.date,
      status: form.status,
      label: form.label?.trim() || null,
      label_vi: form.label_vi?.trim() || null,
      teaser: form.teaser?.trim() || null,
      teaser_vi: form.teaser_vi?.trim() || null,
      is_public: !!form.is_public,
      notes: form.notes?.trim() || null,
    }
    const { data, error } = await supabase
      .from('venue_availability')
      .upsert(payload, { onConflict: 'date' })
      .select()
      .single()
    setSaving(false)
    if (error) return showToast(t.common.tryAgain)
    setSlots(p => ({ ...p, [form.date]: data }))
    setSelected(null)
    showToast(t.cal.dateUpdated)
  }

  async function clearDay() {
    setSaving(true)
    await supabase.from('venue_availability').delete().eq('date', form.date)
    setSaving(false)
    setSlots(p => { const n = { ...p }; delete n[form.date]; return n })
    setSelected(null)
    showToast(t.cal.dateOpened)
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

  const TONES: Record<string, { bd: string; bg: string; fg: string; word: string }> = {
    /* Booked is green, on-hold is the theme orange. They used to be red and
       orange — two warm tones side by side, so a confirmed night and a
       pencilled one looked near enough identical at a glance. */
    booked: {
      bd: 'var(--cal-booked-border)',
      bg: 'linear-gradient(160deg, var(--cal-booked-bg) 0%, transparent 85%), var(--bg-card)',
      fg: 'var(--cal-booked-text)',
      word: t.cal.statusBooked,
    },
    hold: {
      bd: 'var(--badge-orange-border)',
      bg: 'linear-gradient(160deg, var(--badge-orange-bg) 0%, transparent 85%), var(--bg-card)',
      fg: 'var(--badge-orange-text)',
      word: t.cal.statusHold,
    },
    blocked: {
      bd: 'var(--border)',
      bg: 'var(--bg-subtle)',
      fg: 'var(--text-muted)',
      word: t.cal.statusBlocked,
    },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, mo, slots, events, daysInMonth])

  const muted = { color: 'var(--text-muted)' }

  return (
    <div className="cal-wrap">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">{t.cal.title}</div>
          <p style={{ ...muted, fontSize: 13, margin: '6px 0 0', maxWidth: 520, lineHeight: 1.55 }}>
            {t.cal.blurb} <span style={{ color: 'var(--accent)' }}>bigbamboo.app/pitch</span>.
          </p>
        </div>
        <button className="btn-outline" onClick={load} disabled={loading} style={{ fontSize: 13 }}>
          {loading ? t.common.loading : t.common.refresh}
        </button>
      </div>

      {/* ── Month bar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 14, margin: '26px 0 16px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, letterSpacing: '0.03em',
            color: 'var(--text)', lineHeight: 1,
          }}>
            {t.cal.months[mo]} <span style={{ color: 'var(--text-muted)' }}>{y}</span>
          </div>
          {!loading && (
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip n={summary.booked} label={t.cal.booked} color="var(--cal-booked-text)" />
              {summary.hold > 0 && <Chip n={summary.hold} label={t.cal.onHold} color="var(--badge-orange-text)" />}
              <Chip n={summary.openTrading} label={t.cal.openTrading} color="var(--text-secondary)" />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <NavBtn label={t.cal.prevMonth} onClick={() => setCursor(p => shift(p, -1))}>‹</NavBtn>
          <button
            className="btn-outline"
            onClick={() => { const d = new Date(); d.setDate(1); setCursor(d) }}
            style={{ fontSize: 12, padding: '0 14px', height: 32 }}
          >
            {t.common.today}
          </button>
          <NavBtn label={t.cal.nextMonth} onClick={() => setCursor(p => shift(p, 1))}>›</NavBtn>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="card" style={{ padding: '10px 12px 14px', position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          {/* warm bands behind the trading nights */}
          <div aria-hidden style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'grid',
            gridTemplateColumns: 'repeat(7,1fr)', gap: 7, pointerEvents: 'none',
          }}>
            {t.cal.dows.map((d, i) => (
              <div key={d} className={TRADING.includes(i) ? 'cal-band' : undefined} />
            ))}
          </div>

          {/* day-of-week header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 7, position: 'relative' }}>
            {t.cal.dows.map((d, i) => {
              const trading = TRADING.includes(i)
              return (
                <div key={d} className="cal-eyebrow" style={{
                  textAlign: 'center', padding: '11px 0 12px',
                  color: trading ? 'var(--accent)' : 'var(--text-muted)',
                  opacity: trading ? 1 : 0.55,
                  fontSize: 12,
                }}>
                  {d}
                </div>
              )
            })}
          </div>

          {/* days */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 7, position: 'relative', paddingBottom: 6 }}>
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
              const ev = events[key]
              const slot = slots[key]
              const title = ev
                ? pick(lang, ev.title, ev.title_vi)
                : pick(lang, slot?.label, slot?.label_vi)
              const teaser = ev
                ? pick(lang, ev.teaser, ev.teaser_vi)
                : pick(lang, slot?.teaser, slot?.teaser_vi)
              const tone = TONES[st] || null

              const cls = [
                'cal-cell',
                isPast ? 'cal-cell--past' : 'cal-cell--live',
                !tone && !isTrading && !isPast ? 'cal-cell--quiet' : '',
              ].filter(Boolean).join(' ')

              return (
                <button
                  key={key}
                  className={cls}
                  onClick={() => !isPast && openDay(key)}
                  disabled={isPast}
                  aria-label={`${d} ${t.cal.months[mo]} — ${tone ? tone.word : isTrading ? t.cal.statusOpen : ''}`}
                  style={{
                    background: tone ? tone.bg : undefined,
                    borderColor: tone ? tone.bd : undefined,
                    opacity: isPast ? 0.3 : tone || isTrading ? 1 : 0.62,
                    boxShadow: isToday ? '0 0 0 2px var(--accent), 0 6px 18px -10px rgba(234,88,12,.6)' : undefined,
                  }}
                >
                  {tone && <span className="cal-cell__stripe" style={{ background: tone.fg }} />}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: isTrading || tone ? 23 : 19,
                      letterSpacing: '0.03em',
                      lineHeight: 1,
                      color: tone ? tone.fg : 'var(--text)',
                      opacity: tone || isTrading ? 1 : 0.75,
                    }}>
                      {d}
                    </span>
                    {isToday && <span className="cal-eyebrow" style={{ fontSize: 11, color: 'var(--accent)' }}>{t.common.today}</span>}
                  </div>

                  {tone && (
                    <span className="cal-eyebrow" style={{ fontSize: 11, color: tone.fg, opacity: .9 }}>
                      {tone.word}
                    </span>
                  )}

                  {title && (
                    <span style={{
                      fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: 'var(--text)',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {title}
                    </span>
                  )}

                  {teaser && (
                    <span style={{
                      fontSize: 12.5, lineHeight: 1.4, color: 'var(--text-muted)', fontStyle: 'italic',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {teaser}
                    </span>
                  )}

                  {ev && (
                    <span className="cal-eyebrow" style={{ fontSize: 11, color: 'var(--accent)', marginTop: 'auto' }}>
                      {t.cal.ticketedEvent}
                    </span>
                  )}

                  {!tone && isTrading && !isPast && (
                    <span className="cal-eyebrow" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 'auto', opacity: .7 }}>
                      {t.cal.statusOpen}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <Key bg="var(--bg-card)" bd="var(--border)" text={t.cal.statusOpen} />
        <Key bg="var(--badge-orange-bg)" bd="var(--badge-orange-text)" text={t.cal.statusHold} />
        <Key bg="var(--badge-red-bg)" bd="var(--badge-red-text)" text={t.cal.statusBooked} />
        <Key bg="var(--bg-subtle)" bd="var(--text-muted)" text={t.cal.statusBlocked} />
        <span style={{ ...muted, fontSize: 12, marginLeft: 'auto', maxWidth: 380, textAlign: 'right', lineHeight: 1.5 }}>
          {t.cal.legendNote}
        </span>
      </div>

      {/* ── Day editor ── */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={e => e.target === e.currentTarget && setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 460, padding: 26, maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 22 }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.03em', color: 'var(--text)', lineHeight: 1.1 }}>
                  {new Date(selected + 'T00:00:00').toLocaleDateString(t.cal.locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                {events[selected] && (
                  <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 5 }}>
                    {t.cal.eventPrefix} {pick(lang, events[selected].title, events[selected].title_vi)}
                  </div>
                )}
              </div>
              <button className="btn-outline" onClick={() => setSelected(null)} style={{ padding: '0 12px', fontSize: 13, height: 32 }}>
                {t.common.close}
              </button>
            </div>

            {events[selected] ? (
              <p style={{ ...muted, fontSize: 13, lineHeight: 1.65, margin: '0 0 8px' }}>
                {t.cal.eventLocked}
              </p>
            ) : (
              <>
                <Field label={t.cal.status}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      ['booked', t.cal.statusBooked],
                      ['hold', t.cal.statusHold],
                      ['blocked', t.cal.statusBlocked],
                    ].map(([k, l]) => (
                      <button
                        key={k}
                        onClick={() => setForm(f => ({ ...f, status: k }))}
                        style={{
                          padding: '8px 16px', borderRadius: 100, fontSize: 13, cursor: 'pointer',
                          border: '1px solid',
                          borderColor: form.status === k ? 'var(--accent)' : 'var(--border)',
                          background: form.status === k ? 'var(--accent-light)' : 'transparent',
                          color: form.status === k ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: form.status === k ? 600 : 400,
                          transition: 'all .15s',
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label={t.cal.nameLabel} hint={t.cal.nameHint}>
                  <input
                    className="input"
                    value={form.label || ''}
                    placeholder={t.cal.namePlaceholder}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  />
                </Field>

                <Field label={t.cal.nameLabelVi} hint={t.cal.nameViHint}>
                  <input
                    className="input"
                    value={form.label_vi || ''}
                    placeholder={t.cal.namePlaceholder}
                    onChange={e => setForm(f => ({ ...f, label_vi: e.target.value }))}
                  />
                </Field>

                <TeaserField
                  value={form.teaser || ''}
                  onChange={v => setForm(f => ({ ...f, teaser: v }))}
                  valueVi={form.teaser_vi || ''}
                  onChangeVi={v => setForm(f => ({ ...f, teaser_vi: v }))}
                />

                <label style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  border: '1px solid', borderColor: form.is_public ? 'var(--accent)' : 'var(--border-light)',
                  background: form.is_public ? 'var(--accent-light)' : 'transparent',
                  borderRadius: 10, padding: '13px 15px', marginBottom: 16, cursor: 'pointer',
                  transition: 'all .15s',
                }}>
                  <span>
                    <span style={{ fontSize: 14, color: 'var(--text)', display: 'block', fontWeight: 500 }}>{t.cal.showPublicly}</span>
                    <span style={{ ...muted, fontSize: 12 }}>
                      {form.is_public ? t.cal.showPubliclyOn : t.cal.showPubliclyOff}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={!!form.is_public}
                    onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                  />
                </label>

                <Field label={t.cal.privateNote} hint={t.cal.privateNoteHint}>
                  <input
                    className="input"
                    value={form.notes || ''}
                    placeholder={t.cal.privateNotePlaceholder}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </Field>

                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button className="btn-accent" onClick={save} disabled={saving} style={{ flex: 1 }}>
                    {saving ? t.common.saving : t.cal.saveDate}
                  </button>
                  {slots[selected] && (
                    <button className="btn-outline" onClick={clearDay} disabled={saving}>
                      {t.cal.markOpen}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
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
      style={{ width: 32, height: 32, padding: 0, fontSize: 16, lineHeight: 1 }}
    >
      {children}
    </button>
  )
}

function Chip({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className="cal-chip">
      <span className="cal-dot" style={{ background: color }} />
      <b style={{ color }}>{n}</b> {label}
    </span>
  )
}

function Key({ bg, bd, text }: { bg: string; bd: string; text: string }) {
  return (
    <span className="cal-chip">
      <span style={{ width: 12, height: 12, borderRadius: 4, background: bg, border: `1px solid ${bd}` }} />
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
