'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/* This page used to hardcode the old tropical palette — #1A3A38 green panels,
   #00C858 badges, cream text — while the rest of the admin had moved to the
   neutral token system. That is why it looked like a different product. Every
   colour here now comes from a CSS variable, so it follows light/dark with
   everything else and there is one place to change it.

   Type sizes were also 9–13px throughout, which is unreadable on a phone.
   Nothing is below 12px now. */

const STATUSES = [
  { key: 'new',       label: 'New',               tone: 'accent' },
  { key: 'reviewing', label: 'Reviewing',         tone: 'blue' },
  { key: 'meeting',   label: 'Meeting scheduled', tone: 'blue' },
  { key: 'approved',  label: 'Approved',          tone: 'green' },
  { key: 'planning',  label: 'Planning',          tone: 'green' },
  { key: 'live',      label: 'Live',              tone: 'accent' },
  { key: 'done',      label: 'Done',              tone: 'gray' },
  { key: 'declined',  label: 'Declined',          tone: 'red' },
]

const TONES: Record<string, { fg: string; bg: string; bd: string }> = {
  accent: { fg: 'var(--accent)',       bg: 'var(--badge-orange-bg)', bd: 'var(--badge-orange-border)' },
  blue:   { fg: 'var(--badge-blue-text)',  bg: 'var(--badge-blue-bg)',   bd: 'var(--badge-blue-border)' },
  green:  { fg: 'var(--badge-green-text)', bg: 'var(--badge-green-bg)',  bd: 'var(--badge-green-border)' },
  red:    { fg: 'var(--badge-red-text)',   bg: 'var(--badge-red-bg)',    bd: 'var(--badge-red-border)' },
  gray:   { fg: 'var(--badge-gray-text)',  bg: 'var(--badge-gray-bg)',   bd: 'var(--badge-gray-border)' },
}

const STATUS_MAP: any = Object.fromEntries(STATUSES.map(s => [s.key, s]))
const toneOf = (s: any) => TONES[s?.tone] || TONES.gray

/** Numbers arrive however the promoter typed them: "0347 393 293",
 *  "+84 347 393 293", "84347393293". wa.me and zalo.me both need the bare
 *  international form, so a local 0-prefixed number silently failed to open
 *  anything at all — which is why the WhatsApp button looked dead. */
function phoneIntl(raw?: string | null): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '84' + d.slice(1)
  return d.length >= 8 ? d : null
}

export default function PitchesPage() {
  const [pitches, setPitches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [filter, setFilter] = useState('all')
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { loadPitches() }, [])

  async function loadPitches() {
    setLoading(true)
    const { data } = await supabase
      .from('event_pitches')
      .select('*')
      .order('created_at', { ascending: false })
    setPitches(data || [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('event_pitches').update({ status }).eq('id', id)
    setPitches(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    if (selected?.id === id) setSelected((s: any) => ({ ...s, status }))
    showToast('Status updated')
  }

  async function saveNotes(id: string) {
    setSavingNotes(true)
    await supabase.from('event_pitches').update({ internal_notes: notes }).eq('id', id)
    setPitches(prev => prev.map(p => p.id === id ? { ...p, internal_notes: notes } : p))
    setSavingNotes(false)
    showToast('Notes saved')
  }

  /* Deleting is permanent and there is no undo in the UI, so it asks first and
     names the pitch. Declining is the reversible option and is one click away. */
  async function deletePitch(p: any) {
    const ok = window.confirm(
      `Delete "${p.event_name}" for good?\n\n` +
      `This cannot be undone. If you just want it off your list, set it to ` +
      `Declined instead — that keeps the record.`
    )
    if (!ok) return
    setDeleting(true)
    const { error } = await supabase.from('event_pitches').delete().eq('id', p.id)
    setDeleting(false)
    if (error) { showToast('Could not delete — ' + error.message); return }
    setPitches(prev => prev.filter(x => x.id !== p.id))
    setSelected(null)
    showToast('Pitch deleted')
  }

  function openPitch(p: any) { setSelected(p); setNotes(p.internal_notes || '') }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const filtered = filter === 'all' ? pitches : pitches.filter(p => p.status === filter)
  const newCount = pitches.filter(p => p.status === 'new').length

  const mono = { fontFamily: 'DM Mono, monospace' }
  const label = { ...mono, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }
  const inp = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 13px', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const }
  const chip = { padding: '7px 15px', borderRadius: 100, fontSize: 12.5, cursor: 'pointer', ...mono, border: '1px solid', transition: 'all 0.15s' }

  function bool(v: boolean) {
    return v
      ? <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Yes</span>
      : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' as const }}>
        <div>
          <div className="page-title">
            Event Pitches
            {newCount > 0 && (
              <span style={{ background: 'var(--badge-orange-bg)', border: '1px solid var(--badge-orange-border)', color: 'var(--accent)', fontSize: 13, padding: '3px 10px', borderRadius: 100, marginLeft: 10, ...mono, letterSpacing: '0.06em', verticalAlign: 'middle' }}>
                {newCount} new
              </span>
            )}
          </div>
          <div style={{ ...mono, fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', marginTop: 4 }}>
            {pitches.length} total · bigbamboo.app/pitch
          </div>
        </div>
        <button onClick={loadPitches} className="btn-outline" style={{ ...mono, fontSize: 13 }}>↻ Refresh</button>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const, marginBottom: 20 }}>
        <button onClick={() => setFilter('all')}
          style={{ ...chip, background: filter === 'all' ? 'var(--bg-hover)' : 'transparent', borderColor: filter === 'all' ? 'var(--border)' : 'var(--border-light)', color: filter === 'all' ? 'var(--text)' : 'var(--text-secondary)', fontWeight: filter === 'all' ? 600 : 400 }}>
          All ({pitches.length})
        </button>
        {STATUSES.map(s => {
          const count = pitches.filter(p => p.status === s.key).length
          if (!count) return null
          const t = toneOf(s)
          const on = filter === s.key
          return (
            <button key={s.key} onClick={() => setFilter(s.key)}
              style={{ ...chip, background: on ? t.bg : 'transparent', borderColor: on ? t.bd : 'var(--border-light)', color: on ? t.fg : 'var(--text-secondary)', fontWeight: on ? 600 : 400 }}>
              {s.label} ({count})
            </button>
          )
        })}
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)', padding: 20, fontSize: 14 }}>Loading pitches…</div> : (
        <>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 15, marginBottom: 6, color: 'var(--text-secondary)' }}>No pitches here yet.</div>
              <div style={{ fontSize: 14 }}>Share bigbamboo.app/pitch to start getting submissions.</div>
            </div>
          )}

          {/* Pitch cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(p => {
              const s = STATUS_MAP[p.status] || STATUS_MAP.new
              const t = toneOf(s)
              return (
                <div key={p.id} onClick={() => openPitch(p)} className="card"
                  style={{ padding: 18, cursor: 'pointer', borderLeft: `3px solid ${t.fg}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6, flexWrap: 'wrap' as const }}>
                      <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>{p.event_name}</span>
                      {/* One badge, not two. This used to render the status pill
                          AND a separate hardcoded "NEW", so new pitches read
                          "New NEW". */}
                      <span style={{ ...mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '3px 9px', borderRadius: 100, background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>{s.label}</span>
                    </div>
                    <div style={{ fontSize: 14.5, color: 'var(--text-secondary)', marginBottom: 5 }}>{p.event_type} · {p.name}</div>
                    <div style={{ ...mono, fontSize: 12.5, color: 'var(--text-muted)' }}>
                      {p.expected_attendance && `${p.expected_attendance} ppl · `}
                      {p.preferred_day && `${p.preferred_day} · `}
                      {new Date(p.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 20, flexShrink: 0 }}>›</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Detail modal */}
      {selected && (() => {
        const wa = phoneIntl(selected.whatsapp)
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, overflowY: 'auto', padding: 20 }}
            onClick={e => e.target === e.currentTarget && setSelected(null)}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 720, margin: '0 auto', boxShadow: 'var(--shadow-lg)' }}>

              {/* Modal header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 12 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{selected.event_name}</div>
                  <div style={{ ...label, marginTop: 6 }}>
                    {selected.event_type} · submitted {new Date(selected.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close"
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
              </div>

              {/* Status pipeline */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ ...label, marginBottom: 10 }}>Pipeline status</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                  {STATUSES.map(s => {
                    const t = toneOf(s)
                    const on = selected.status === s.key
                    return (
                      <button key={s.key} onClick={() => updateStatus(selected.id, s.key)}
                        style={{ ...chip, background: on ? t.bg : 'transparent', borderColor: on ? t.bd : 'var(--border-light)', color: on ? t.fg : 'var(--text-secondary)', fontWeight: on ? 700 : 400 }}>
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Contact */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 9, marginBottom: 16 }}>
                {[
                  { l: 'Name', v: selected.name },
                  { l: 'WhatsApp / Zalo', v: selected.whatsapp },
                  { l: 'Email', v: selected.email },
                  { l: 'Instagram', v: selected.instagram },
                ].map(f => f.v ? (
                  <div key={f.l} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', borderRadius: 9, padding: '11px 14px' }}>
                    <div style={label}>{f.l}</div>
                    <div style={{ fontSize: 15, marginTop: 4, color: 'var(--text)' }}>{f.v}</div>
                  </div>
                ) : null)}
              </div>

              {/* Quick reply. Both wa.me and zalo.me open the installed app on a
                  phone and the web client on desktop, and both message from
                  Shawn's own account — there is no API or business number in
                  the middle. */}
              <div style={{ display: 'flex', gap: 9, marginBottom: 26, flexWrap: 'wrap' as const }}>
                {wa && (
                  <a href={`https://zalo.me/${wa}`} target="_blank" rel="noopener" className="btn-primary"
                    style={{ textDecoration: 'none', fontSize: 14, padding: '10px 18px' }}>
                    Zalo
                  </a>
                )}
                {wa && (
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener" className="btn-outline"
                    style={{ textDecoration: 'none', fontSize: 14, padding: '10px 18px' }}>
                    WhatsApp
                  </a>
                )}
                {selected.email && (
                  <a href={`mailto:${selected.email}?subject=Re: Your BigBamBoo event pitch — ${selected.event_name}`} className="btn-outline"
                    style={{ textDecoration: 'none', fontSize: 14, padding: '10px 18px' }}>
                    Email
                  </a>
                )}
              </div>

              {/* Event details */}
              <Section label="The event">
                {selected.tagline && <Detail label="One-liner" value={selected.tagline} />}
                <Detail label="Description" value={selected.description} />
                <Detail label="Why people will come" value={selected.why_people_come} />
              </Section>

              <Section label="The crowd">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 9 }}>
                  <MiniCard label="Attendance" value={selected.expected_attendance || '—'} />
                  <MiniCard label="Age range" value={selected.age_range || '—'} />
                  <MiniCard label="Language" value={selected.audience_language || '—'} />
                </div>
              </Section>

              <Section label="Timing">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 9 }}>
                  <MiniCard label="Day" value={selected.preferred_day || '—'} />
                  <MiniCard label="Time" value={selected.preferred_time || '—'} />
                  <MiniCard label="How far out" value={selected.how_far_out || '—'} />
                </div>
              </Section>

              <Section label="What they've got">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 7 }}>
                  {[
                    ['Performers confirmed', selected.has_performers],
                    ['Vendors', selected.has_vendors],
                    ['Sponsors', selected.has_sponsors],
                    ['Photographer', selected.has_photographer],
                    ['Volunteers', selected.has_volunteers],
                    ['Marketing plan', selected.has_marketing],
                    ['Ticket platform', selected.has_ticket_platform],
                  ].map(([l, v]: any) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 13px', background: 'var(--bg-subtle)', borderRadius: 8 }}>
                      <span style={{ fontSize: 14 }}>{l}</span>{bool(v)}
                    </div>
                  ))}
                </div>
              </Section>

              <Section label="What they need from BBB">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 7 }}>
                  {[
                    ['Sound system', selected.needs_sound],
                    ['Bar only', selected.needs_bar],
                    ['Full food & bar', selected.needs_food_bar],
                    ['Full production', selected.needs_production],
                    ['Ticketing help', selected.needs_ticketing],
                    ['Marketing', selected.needs_marketing],
                    ['Photography', selected.needs_photography],
                  ].map(([l, v]: any) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 13px', background: 'var(--bg-subtle)', borderRadius: 8 }}>
                      <span style={{ fontSize: 14 }}>{l}</span>{bool(v)}
                    </div>
                  ))}
                </div>
              </Section>

              {(selected.run_before || selected.past_venues || selected.past_instagram || selected.past_event_links) && (
                <Section label="Past experience">
                  <Detail label="Run events before?" value={selected.run_before ? 'Yes' : 'No'} />
                  {selected.past_venues && <Detail label="Past venues" value={selected.past_venues} />}
                  {selected.past_instagram && <Detail label="Instagram" value={selected.past_instagram} />}
                  {selected.past_event_links && <Detail label="Links" value={selected.past_event_links} />}
                </Section>
              )}

              {(selected.extra_notes || selected.poster_url) && (
                <Section label="Files & notes">
                  {selected.extra_notes && <Detail label="Extra notes" value={selected.extra_notes} />}
                  {selected.poster_url && (
                    <div>
                      <div style={{ ...label, marginBottom: 6 }}>Files / poster</div>
                      <a href={selected.poster_url} target="_blank" rel="noopener"
                        style={{ color: 'var(--accent)', fontSize: 14, wordBreak: 'break-all' as const }}>{selected.poster_url}</a>
                    </div>
                  )}
                </Section>
              )}

              {/* Internal notes */}
              <Section label="Internal notes (only you see these)">
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Your thoughts, follow-up actions, questions…"
                  style={{ ...inp, minHeight: 110, marginBottom: 12 }} />
                <button onClick={() => saveNotes(selected.id)} disabled={savingNotes} className="btn-primary" style={{ fontSize: 14 }}>
                  {savingNotes ? 'Saving…' : 'Save notes'}
                </button>
              </Section>

              {/* Destructive action, kept at the very bottom and visually apart
                  so it is never the thing you hit by accident. */}
              <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 26, paddingTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 380 }}>
                  Set this to <strong>Declined</strong> to turn it down but keep the record. Delete removes it permanently.
                </div>
                <button onClick={() => deletePitch(selected)} disabled={deleting} className="btn-red" style={{ fontSize: 14 }}>
                  {deleting ? 'Deleting…' : 'Delete pitch'}
                </button>
              </div>

            </div>
          </div>
        )
      })()}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--text)', color: 'var(--bg)', padding: '12px 20px', borderRadius: 9, fontSize: 14, zIndex: 9999, boxShadow: 'var(--shadow-lg)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function Section({ label: l, children }: any) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: 11, paddingBottom: 7, borderBottom: '1px solid var(--border-light)' }}>{l}</div>
      {children}
    </div>
  )
}

function Detail({ label: l, value: v }: any) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: 5 }}>{l}</div>
      <div style={{ fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap' as const, color: 'var(--text)' }}>{v}</div>
    </div>
  )
}

function MiniCard({ label: l, value: v }: any) {
  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', borderRadius: 9, padding: '11px 14px' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: 5 }}>{l}</div>
      <div style={{ fontSize: 15, color: 'var(--text)' }}>{v}</div>
    </div>
  )
}
