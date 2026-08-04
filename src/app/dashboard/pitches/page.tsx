'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const STATUSES = [
  { key: 'new',       label: 'New',              color: '#00C858', dot: '🟢' },
  { key: 'reviewing', label: 'Reviewing',         color: '#E8A820', dot: '🟡' },
  { key: 'meeting',   label: 'Meeting Scheduled', color: '#FB923C', dot: '🟠' },
  { key: 'approved',  label: 'Approved',          color: '#60A5FA', dot: '🔵' },
  { key: 'planning',  label: 'Planning',          color: '#A78BFA', dot: '🟣' },
  { key: 'live',      label: 'Live',              color: '#F87171', dot: '🔴' },
  { key: 'done',      label: 'Done',              color: 'rgba(255,255,255,0.3)', dot: '⚪' },
  { key: 'declined',  label: 'Declined',          color: '#E06060', dot: '⛔' },
]

const STATUS_MAP: any = Object.fromEntries(STATUSES.map(s => [s.key, s]))

export default function PitchesPage() {
  const [pitches, setPitches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [filter, setFilter] = useState('all')
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
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

  function openPitch(p: any) { setSelected(p); setNotes(p.internal_notes || '') }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const filtered = filter === 'all' ? pitches : pitches.filter(p => p.status === filter)
  const newCount = pitches.filter(p => p.status === 'new').length

  const mono = { fontFamily: 'DM Mono, monospace' }
  const label = { ...mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)' }
  const inp = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px', color: '#F5EED8', fontSize: 13, outline: 'none', fontFamily: 'DM Mono, monospace', resize: 'vertical' as const }

  function bool(v: boolean) {
    return v
      ? <span style={{ color: '#00C858', fontSize: 12 }}>✓ Yes</span>
      : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>—</span>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: '0.06em' }}>
            Event Pitches {newCount > 0 && <span style={{ background: '#00C858', color: '#fff', fontSize: 12, padding: '2px 8px', borderRadius: 100, marginLeft: 8, fontFamily: 'DM Mono', letterSpacing: '0.08em', verticalAlign: 'middle' }}>{newCount} new</span>}
          </div>
          <div style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
            {pitches.length} total pitches · bigbamboo.app/pitch
          </div>
        </div>
        <button onClick={loadPitches} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', ...mono, fontSize: 11 }}>↻ Refresh</button>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 20 }}>
        <button onClick={() => setFilter('all')} style={{ padding: '5px 14px', borderRadius: 100, fontSize: 11, cursor: 'pointer', ...mono, border: '1px solid', background: filter === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent', borderColor: filter === 'all' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)', color: filter === 'all' ? '#fff' : 'rgba(255,255,255,0.4)' }}>
          All ({pitches.length})
        </button>
        {STATUSES.map(s => {
          const count = pitches.filter(p => p.status === s.key).length
          return count > 0 ? (
            <button key={s.key} onClick={() => setFilter(s.key)} style={{ padding: '5px 14px', borderRadius: 100, fontSize: 11, cursor: 'pointer', ...mono, border: '1px solid', background: filter === s.key ? s.color + '22' : 'transparent', borderColor: filter === s.key ? s.color + '88' : 'rgba(255,255,255,0.1)', color: filter === s.key ? s.color : 'rgba(255,255,255,0.4)' }}>
              {s.dot} {s.label} ({count})
            </button>
          ) : null
        })}
      </div>

      {loading ? <div style={{ color: 'rgba(255,255,255,0.4)', padding: 20, ...mono, fontSize: 12 }}>Loading pitches...</div> : (
        <>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎪</div>
              <div style={{ ...mono, fontSize: 12 }}>No pitches yet. Share bigbamboo.app/pitch to start getting submissions.</div>
            </div>
          )}

          {/* Pitch cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(p => {
              const s = STATUS_MAP[p.status] || STATUS_MAP.new
              return (
                <div key={p.id} onClick={() => openPitch(p)} className="card"
                  style={{ padding: 16, cursor: 'pointer', borderLeft: `3px solid ${s.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#F5EED8' }}>{p.event_name}</span>
                      <span style={{ ...mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const, padding: '2px 8px', borderRadius: 100, background: s.color + '18', color: s.color, border: `1px solid ${s.color}44` }}>{s.label}</span>
                      {p.status === 'new' && <span style={{ ...mono, fontSize: 9, background: '#00C858', color: '#fff', padding: '2px 8px', borderRadius: 100 }}>NEW</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{p.event_type} · {p.name}</div>
                    <div style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                      {p.expected_attendance && `${p.expected_attendance} ppl · `}
                      {p.preferred_day && `${p.preferred_day} · `}
                      {new Date(p.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, flexShrink: 0 }}>›</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* DETAIL MODAL */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9000, overflowY: 'auto', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div style={{ background: '#1A3A38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 28, maxWidth: 680, margin: '0 auto' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: '#F5EED8', letterSpacing: '0.04em' }}>{selected.event_name}</div>
                <div style={{ ...label, marginTop: 4 }}>{selected.event_type} · submitted {new Date(selected.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.5)', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
            </div>

            {/* Status pipeline */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ ...label, marginBottom: 10 }}>Pipeline Status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {STATUSES.map(s => (
                  <button key={s.key} onClick={() => updateStatus(selected.id, s.key)}
                    style={{ padding: '6px 14px', borderRadius: 100, fontSize: 11, cursor: 'pointer', ...mono, border: '1px solid', transition: 'all 0.15s',
                      background: selected.status === s.key ? s.color + '22' : 'transparent',
                      borderColor: selected.status === s.key ? s.color + '88' : 'rgba(255,255,255,0.1)',
                      color: selected.status === s.key ? s.color : 'rgba(255,255,255,0.4)',
                      fontWeight: selected.status === s.key ? 700 : 400 }}>
                    {s.dot} {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {[
                { l: 'Name', v: selected.name },
                { l: 'WhatsApp / Zalo', v: selected.whatsapp },
                { l: 'Email', v: selected.email },
                { l: 'Instagram', v: selected.instagram },
              ].map(f => f.v ? (
                <div key={f.l} className="card" style={{ padding: '10px 14px' }}>
                  <div style={label}>{f.l}</div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>{f.v}</div>
                </div>
              ) : null)}
            </div>

            {/* Quick reply buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' as const }}>
              {selected.whatsapp && (
                <a href={`https://wa.me/${selected.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noopener"
                  style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer', ...mono, textDecoration: 'none', display: 'inline-block' }}>
                  💬 WhatsApp
                </a>
              )}
              {selected.email && (
                <a href={`mailto:${selected.email}?subject=Re: Your BigBamBoo Event Pitch — ${selected.event_name}`}
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer', ...mono, textDecoration: 'none', display: 'inline-block' }}>
                  ✉ Email
                </a>
              )}
            </div>

            {/* Event details */}
            <Section label="The Event">
              {selected.tagline && <Detail label="One-liner" value={selected.tagline} />}
              <Detail label="Description" value={selected.description} />
              <Detail label="Why people will come" value={selected.why_people_come} />
            </Section>

            <Section label="The Crowd">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <MiniCard label="Attendance" value={selected.expected_attendance || '—'} />
                <MiniCard label="Age Range" value={selected.age_range || '—'} />
                <MiniCard label="Language" value={selected.audience_language || '—'} />
              </div>
            </Section>

            <Section label="Timing">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <MiniCard label="Day" value={selected.preferred_day || '—'} />
                <MiniCard label="Time" value={selected.preferred_time || '—'} />
                <MiniCard label="How Far Out" value={selected.how_far_out || '—'} />
              </div>
            </Section>

            <Section label="What They've Got">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['Performers confirmed', selected.has_performers],
                  ['Vendors', selected.has_vendors],
                  ['Sponsors', selected.has_sponsors],
                  ['Photographer', selected.has_photographer],
                  ['Volunteers', selected.has_volunteers],
                  ['Marketing plan', selected.has_marketing],
                  ['Ticket platform', selected.has_ticket_platform],
                ].map(([l, v]: any) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 7 }}>
                    <span style={{ fontSize: 12 }}>{l}</span>{bool(v)}
                  </div>
                ))}
              </div>
            </Section>

            <Section label="What They Need From BBB">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  ['Sound system', selected.needs_sound],
                  ['Bar only', selected.needs_bar],
                  ['Full food & bar', selected.needs_food_bar],
                  ['Full production', selected.needs_production],
                  ['Ticketing help', selected.needs_ticketing],
                  ['Marketing', selected.needs_marketing],
                  ['Photography', selected.needs_photography],
                ].map(([l, v]: any) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 7 }}>
                    <span style={{ fontSize: 12 }}>{l}</span>{bool(v)}
                  </div>
                ))}
              </div>
            </Section>

            {(selected.run_before || selected.past_venues || selected.past_instagram || selected.past_event_links) && (
              <Section label="Past Experience">
                <Detail label="Run events before?" value={selected.run_before ? 'Yes' : 'No'} />
                {selected.past_venues && <Detail label="Past venues" value={selected.past_venues} />}
                {selected.past_instagram && <Detail label="Instagram" value={selected.past_instagram} />}
                {selected.past_event_links && <Detail label="Links" value={selected.past_event_links} />}
              </Section>
            )}

            {(selected.extra_notes || selected.poster_url) && (
              <Section label="Files & Notes">
                {selected.extra_notes && <Detail label="Extra notes" value={selected.extra_notes} />}
                {selected.poster_url && (
                  <div>
                    <div style={{ ...label, marginBottom: 6 }}>Files / Poster</div>
                    <a href={selected.poster_url} target="_blank" rel="noopener"
                      style={{ color: '#E8A820', fontSize: 13, wordBreak: 'break-all' as const }}>{selected.poster_url}</a>
                  </div>
                )}
              </Section>
            )}

            {/* Internal notes */}
            <Section label="Internal Notes (not visible to pitcher)">
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Your thoughts, follow-up actions, questions..."
                style={{ ...inp, minHeight: 100, marginBottom: 10 }} />
              <button onClick={() => saveNotes(selected.id)} disabled={savingNotes}
                style={{ background: 'rgba(232,168,32,0.12)', border: '1px solid rgba(232,168,32,0.3)', color: '#E8A820', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', ...mono, fontSize: 11 }}>
                {savingNotes ? 'Saving...' : '💾 Save Notes'}
              </button>
            </Section>

          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#00B14F', color: '#fff', padding: '11px 20px', borderRadius: 8, ...mono, fontSize: 11, letterSpacing: '0.1em', zIndex: 9999 }}>{toast}</div>}
    </div>
  )
}

function Section({ label: l, children }: any) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{l}</div>
      {children}
    </div>
  )
}

function Detail({ label: l, value: v }: any) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{l}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>{v}</div>
    </div>
  )
}

function MiniCard({ label: l, value: v }: any) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{l}</div>
      <div style={{ fontSize: 13 }}>{v}</div>
    </div>
  )
}
