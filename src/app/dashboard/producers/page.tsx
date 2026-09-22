'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Field, Modal, Pill, todayKey } from '@/components/brewasia/ui'
import { BrewAsiaNotice, READ_ONLY, READ_ONLY_MSG } from '@/components/brewasia/BrewAsiaReadOnly'

// BrewAsia producers: every brewery we're talking to about collabs, local (Vietnam)
// and international, with where they are, who to talk to, and how interested they are.
// Collab partners on the Collabs page are suggested from this list.

type Interest = 'lead' | 'interested' | 'confirmed' | 'dead'
// Suppliers (e.g. yeast or hop companies, usually via a local distributor) can be collab partners too.
type Kind = 'brewery' | 'supplier'
type Producer = {
  id: string
  created_at?: string
  name: string
  kind: Kind
  country: string | null
  city: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  interest: Interest
  notes: string | null
  logo_url: string | null
}
type CollabRef = { id: string; code: string; vn_partner: string | null; partners: string[]; status: string }
// logo_url is deliberately outside the Draft: it is set by uploading a file, not by
// typing in the edit form, so it must not be round-tripped through a save.
type Draft = Omit<Producer, 'id' | 'created_at' | 'country' | 'city' | 'contact_name' | 'contact_phone' | 'contact_email' | 'notes' | 'logo_url'> & {
  id?: string; country: string; city: string; contact_name: string; contact_phone: string; contact_email: string; notes: string
}

// Same idea as the old sheet's colours: green = confirmed / moving, amber = interested / pending.
const INTERESTS: { key: Interest; label: string; dot: string }[] = [
  { key: 'confirmed', label: 'Confirmed / moving', dot: 'var(--cal-booked-text)' },
  { key: 'interested', label: 'Interested / pending', dot: 'var(--accent)' },
  { key: 'lead', label: 'Lead / not contacted', dot: 'var(--text-muted)' },
  { key: 'dead', label: 'Dead / no response', dot: 'var(--badge-red-text)' },
]
const INTEREST_LABEL = Object.fromEntries(INTERESTS.map(i => [i.key, i.label])) as Record<Interest, string>
const interestDot = (i: Interest) => (INTERESTS.find(x => x.key === i) || INTERESTS[2]).dot
const interestOrder = (i: Interest) => INTERESTS.findIndex(x => x.key === i)

const blank = (): Draft => ({ name: '', kind: 'brewery', country: '', city: '', contact_name: '', contact_phone: '', contact_email: '', interest: 'lead', notes: '' })
const txt = (v: string | null | undefined) => (v ?? '').trim() || null
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')
const isSupplier = (p: Producer) => p.kind === 'supplier'
const isLocal = (p: Producer) => !isSupplier(p) && (p.country || '').trim().toLowerCase() === 'vietnam'
const isIntl = (p: Producer) => !isSupplier(p) && !isLocal(p)

export default function ProducersPage() {
  const [producers, setProducers] = useState<Producer[]>([])
  const [collabs, setCollabs] = useState<CollabRef[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')

  const [q, setQ] = useState('')
  const [fInterest, setFInterest] = useState<'' | Interest>('')
  const [fWhere, setFWhere] = useState<'' | 'local' | 'international' | 'supplier'>('')

  const [editing, setEditing] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data, error }, { data: cs }] = await Promise.all([
      supabase.from('brewasia_producers').select('*').order('name'),
      supabase.from('brewasia_collabs').select('id, code, vn_partner, partners, status').order('code'),
    ])
    setLoading(false)
    if (error) { setLoadError(error.message); return }
    setLoadError('')
    setProducers((data || []) as Producer[])
    setCollabs(((cs || []) as CollabRef[]).map(c => ({ ...c, partners: c.partners || [] })))
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600) }

  // Replace or clear a brewery's logo. The upload reuses the same route the public form
  // posts to, so staff and breweries go through one validator and one bucket rather than
  // a second staff-only path that could drift from it.
  async function setLogo(p: Producer, logo_url: string | null) {
    if (READ_ONLY) { showToast(READ_ONLY_MSG); return }
    const { error } = await supabase.from('brewasia_producers').update({ logo_url }).eq('id', p.id)
    if (error) { showToast(error.message); return }
    setProducers(prev => prev.map(x => (x.id === p.id ? { ...x, logo_url } : x)))
    showToast(logo_url ? 'Logo updated' : 'Logo removed')
  }

  const collabsFor = (name: string) => {
    const k = norm(name)
    return collabs.filter(c => c.status !== 'dead' && [c.vn_partner || '', ...c.partners].some(n => norm(n) === k))
  }

  const countries = useMemo(() => Array.from(new Set(producers.map(p => (p.country || '').trim()).filter(Boolean))).sort(), [producers])
  const cities = useMemo(() => Array.from(new Set(producers.map(p => (p.city || '').trim()).filter(Boolean))).sort(), [producers])

  const counts = useMemo(() => ({
    total: producers.length,
    local: producers.filter(isLocal).length,
    international: producers.filter(isIntl).length,
    suppliers: producers.filter(isSupplier).length,
    byInterest: INTERESTS.map(i => ({ ...i, n: producers.filter(p => p.interest === i.key).length })),
  }), [producers])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return producers
      .filter(p => {
        if (fInterest && p.interest !== fInterest) return false
        if (fWhere === 'local' && !isLocal(p)) return false
        if (fWhere === 'international' && !isIntl(p)) return false
        if (fWhere === 'supplier' && !isSupplier(p)) return false
        if (needle && ![p.name, p.country, p.city, p.contact_name, p.notes].join(' ').toLowerCase().includes(needle)) return false
        return true
      })
      .sort((a, b) => interestOrder(a.interest) - interestOrder(b.interest) || a.name.localeCompare(b.name))
  }, [producers, q, fInterest, fWhere])

  const sections = [
    { key: 'local', title: 'Local breweries · Vietnam', list: filtered.filter(isLocal) },
    { key: 'international', title: 'International breweries', list: filtered.filter(isIntl) },
    { key: 'supplier', title: 'Suppliers · usually via local distributors', list: filtered.filter(isSupplier) },
  ].filter(s => s.list.length)

  async function setInterest(p: Producer, interest: Interest) {
    if (READ_ONLY) { showToast(READ_ONLY_MSG); return }
    const before = p.interest
    setProducers(list => list.map(x => (x.id === p.id ? { ...x, interest } : x)))
    const { error } = await supabase.from('brewasia_producers').update({ interest }).eq('id', p.id)
    if (error) { setProducers(list => list.map(x => (x.id === p.id ? { ...x, interest: before } : x))); showToast('Could not save. Try again.') }
  }

  function openNew() { if (READ_ONLY) { showToast(READ_ONLY_MSG); return } setConfirmDelete(false); setEditing(blank()) }
  function openEdit(p: Producer) {
    setConfirmDelete(false)
    setEditing({
      id: p.id, name: p.name, kind: p.kind || 'brewery', country: p.country || '', city: p.city || '', contact_name: p.contact_name || '',
      contact_phone: p.contact_phone || '', contact_email: p.contact_email || '', interest: p.interest, notes: p.notes || '',
    })
  }
  const setDraft = (patch: Partial<Draft>) => setEditing(f => f && { ...f, ...patch })

  async function saveDraft() {
    if (READ_ONLY) { showToast(READ_ONLY_MSG); return }
    if (!editing) return
    const name = editing.name.trim()
    if (!name) return showToast('Name is required.')
    const clash = producers.find(p => p.id !== editing.id && p.name.trim().toLowerCase() === name.toLowerCase())
    if (clash) return showToast(`${clash.name} is already on the list.`)
    const payload = {
      name, kind: editing.kind, country: txt(editing.country), city: txt(editing.city), contact_name: txt(editing.contact_name),
      contact_phone: txt(editing.contact_phone), contact_email: txt(editing.contact_email), interest: editing.interest, notes: txt(editing.notes),
    }
    setSaving(true)
    const res = editing.id
      ? await supabase.from('brewasia_producers').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('brewasia_producers').insert(payload).select().single()
    setSaving(false)
    if (res.error || !res.data) return showToast('Could not save. Try again.')
    const row = res.data as Producer
    setProducers(list => (editing.id ? list.map(p => (p.id === row.id ? row : p)) : [...list, row]))
    setEditing(null)
    showToast(editing.id ? 'Saved' : `${row.name} added`)
  }

  async function deleteDraft() {
    if (READ_ONLY) { showToast(READ_ONLY_MSG); return }
    if (!editing?.id) return
    setSaving(true)
    const { error } = await supabase.from('brewasia_producers').delete().eq('id', editing.id)
    setSaving(false)
    if (error) return showToast('Could not delete. Try again.')
    setProducers(list => list.filter(p => p.id !== editing.id))
    setEditing(null)
    showToast('Deleted')
  }

  function exportCsv() {
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const head = ['Producer', 'Type', 'Country', 'City', 'Contact', 'Phone', 'Email', 'Interest', 'Collabs', 'Notes']
    const rows = filtered.map(p => [p.name, isSupplier(p) ? 'Supplier' : isLocal(p) ? 'Local brewery' : 'International brewery', p.country, p.city, p.contact_name, p.contact_phone, p.contact_email,
      INTEREST_LABEL[p.interest], collabsFor(p.name).map(c => c.code).join(' '), p.notes])
    const csv = [head, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `brewasia-producers-${todayKey()}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const muted = { color: 'var(--text-muted)' }

  return (
    <div className="keg-wrap">
      <BrewAsiaNotice page="producers" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">BrewAsia producers</div>
          <p style={{ ...muted, fontSize: 13, margin: '6px 0 0', maxWidth: 560, lineHeight: 1.55 }}>
            Every brewery in the collab conversation: where they are, who to talk to, and how interested they are.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/dashboard/collabs" className="btn-outline" style={{ fontSize: 13, textDecoration: 'none' }}>Collabs</Link>
          <button className="btn-outline" onClick={exportCsv} disabled={!filtered.length} style={{ fontSize: 13 }}>Export CSV</button>
          {!READ_ONLY && <button className="btn-accent" onClick={openNew} disabled={!!loadError}>Add producer</button>}
        </div>
      </div>

      {loadError ? (
        <div className="card" style={{ padding: 22, marginTop: 24 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Couldn’t load producers</div>
          <div style={{ ...muted, fontSize: 13, lineHeight: 1.6 }}>{loadError}</div>
          <button className="btn-outline" onClick={load} style={{ marginTop: 14, fontSize: 13 }}>Refresh</button>
        </div>
      ) : (
        <>
          <div className="collab-pipeline" style={{ marginTop: 24 }}>
            {[
              { key: '', label: 'All producers', n: counts.total },
              { key: 'local', label: 'Local breweries', n: counts.local },
              { key: 'international', label: 'International breweries', n: counts.international },
              { key: 'supplier', label: 'Suppliers', n: counts.suppliers },
            ].map(s => {
              const on = fWhere === s.key
              return (
                <button key={s.label} className="collab-step" aria-pressed={on} onClick={() => setFWhere(s.key as typeof fWhere)}
                  style={{ boxShadow: on ? '0 0 0 2px var(--accent)' : undefined, borderColor: on ? 'transparent' : undefined }}>
                  <span className="collab-step__top">{s.label}</span>
                  <span className="collab-step__n">{loading ? '–' : s.n}</span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {counts.byInterest.map(i => {
              const on = fInterest === i.key
              return (
                <button key={i.key} className="collab-chip" aria-pressed={on} onClick={() => setFInterest(on ? '' : i.key)}
                  style={{ borderColor: on ? 'var(--accent)' : undefined, background: on ? 'var(--accent-light)' : undefined }}>
                  <span className="collab-step-dot" style={{ background: i.dot }} /><b>{i.n}</b> {i.label}
                </button>
              )
            })}
          </div>

          <div className="keg-filters producer-filters" style={{ margin: '16px 0 14px' }}>
            <input className="input" placeholder="Search name, country, city, contact…" value={q} onChange={e => setQ(e.target.value)} />
            <select className="input" value={fInterest} onChange={e => setFInterest(e.target.value as Interest | '')} aria-label="Interest">
              <option value="">Any interest</option>
              {INTERESTS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
            </select>
            <select className="input" value={fWhere} onChange={e => setFWhere(e.target.value as typeof fWhere)} aria-label="Type">
              <option value="">All types</option>
              <option value="local">Local breweries</option>
              <option value="international">International breweries</option>
              <option value="supplier">Suppliers</option>
            </select>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 28, ...muted, fontSize: 13 }}>Loading…</div>
          ) : !sections.length ? (
            <div className="card" style={{ padding: 28, ...muted, fontSize: 13, textAlign: 'center' }}>
              {producers.length ? 'Nothing matches these filters.' : 'No producers yet.'}
            </div>
          ) : sections.map(sec => (
            <div key={sec.key} style={{ marginBottom: 20 }}>
              <div className="collab-section-label" style={{ marginTop: 6 }}>{sec.title} <span style={{ fontWeight: 400 }}>· {sec.list.length}</span></div>

              <div className="card keg-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="data-table keg-table">
                  <thead>
                    <tr>
                      <th>Producer</th>
                      <th>Country</th>
                      <th>City</th>
                      <th>Contact</th>
                      <th>Logo</th>
                      <th>Interest</th>
                      <th>Collabs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.list.map(p => {
                      const cs = collabsFor(p.name)
                      return (
                        <tr key={p.id} onClick={() => openEdit(p)} style={{ cursor: 'pointer', opacity: p.interest === 'dead' ? 0.55 : 1 }}>
                          <td style={{ boxShadow: `inset 4px 0 0 ${interestDot(p.interest)}` }}>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            {p.notes && <div style={{ ...muted, fontSize: 12, marginTop: 2, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes}</div>}
                          </td>
                          <td style={{ color: p.country ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{p.country || '—'}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{p.city || <span style={muted}>—</span>}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{[p.contact_name, p.contact_phone].filter(Boolean).join(' · ') || <span style={muted}>—</span>}</td>
                          <td onClick={e => e.stopPropagation()}><LogoCell producer={p} onChange={url => setLogo(p, url)} /></td>
                          <td onClick={e => e.stopPropagation()}><InterestSelect value={p.interest} onChange={i => setInterest(p, i)} /></td>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 13 }}>{cs.length ? cs.map(c => c.code.replace('BA-COL-', '#')).join(' ') : <span style={muted}>—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="keg-cards" style={{ gap: 8 }}>
                {sec.list.map(p => {
                  const cs = collabsFor(p.name)
                  return (
                    <div key={p.id} className="card" style={{ padding: 14, borderLeft: `4px solid ${interestDot(p.interest)}`, opacity: p.interest === 'dead' ? 0.55 : 1 }}>
                      <button onClick={() => openEdit(p)} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{p.name}</div>
                        <div style={{ ...muted, fontSize: 13, marginTop: 3 }}>
                          {[p.city, p.country, p.contact_name, cs.length ? cs.map(c => c.code.replace('BA-COL-', '#')).join(' ') : null].filter(Boolean).join(' · ') || 'No details yet'}
                        </div>
                      </button>
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <InterestSelect value={p.interest} onChange={i => setInterest(p, i)} />
                        <LogoCell producer={p} onChange={url => setLogo(p, url)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? 'Edit producer' : 'Add producer'} narrow>
          <datalist id="producer-countries">{countries.map(c => <option key={c} value={c} />)}</datalist>
          <datalist id="producer-cities">{cities.map(c => <option key={c} value={c} />)}</datalist>
          <div className="keg-grid-2">
            <Field label="Producer / brand">
              <input className="input" value={editing.name} onChange={e => setDraft({ name: e.target.value })} autoFocus={!editing.id} />
            </Field>
            <Field label="Type">
              <select className="input" value={editing.kind} onChange={e => setDraft({ kind: e.target.value as Kind })}>
                <option value="brewery">Brewery</option>
                <option value="supplier">Supplier / distributor</option>
              </select>
            </Field>
          </div>
          <div className="keg-grid-2">
            <Field label="Country">
              <input className="input" list="producer-countries" value={editing.country} onChange={e => setDraft({ country: e.target.value })} placeholder="e.g. Vietnam" />
            </Field>
            <Field label="City">
              <input className="input" list="producer-cities" value={editing.city} onChange={e => setDraft({ city: e.target.value })} />
            </Field>
          </div>
          <Field label="Interest">
            <select className="input" value={editing.interest} onChange={e => setDraft({ interest: e.target.value as Interest })}>
              {INTERESTS.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
            </select>
          </Field>
          <Field label="Contact person">
            <input className="input" value={editing.contact_name} onChange={e => setDraft({ contact_name: e.target.value })} />
          </Field>
          <div className="keg-grid-2">
            <Field label="Phone / Zalo / WhatsApp">
              <input className="input" type="tel" value={editing.contact_phone} onChange={e => setDraft({ contact_phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={editing.contact_email} onChange={e => setDraft({ contact_email: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="input" rows={3} value={editing.notes} onChange={e => setDraft({ notes: e.target.value })} />
          </Field>
          {editing.id && collabsFor(editing.name).length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              In collabs: {collabsFor(editing.name).map(c => `${c.code} (${[c.vn_partner, ...c.partners].filter(Boolean).join(' × ')})`).join(', ')}
            </div>
          )}
          {READ_ONLY ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>View only. {READ_ONLY_MSG}</div> : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-accent" onClick={saveDraft} disabled={saving} style={{ flex: 1 }}>{saving ? 'Saving…' : editing.id ? 'Save' : 'Add producer'}</button>
            {editing.id && (confirmDelete
              ? <button className="btn-red" onClick={deleteDraft} disabled={saving}>Confirm delete</button>
              : <button className="btn-outline" onClick={() => setConfirmDelete(true)} disabled={saving}>Delete</button>)}
          </div>}
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function InterestSelect({ value, onChange }: { value: Interest; onChange: (i: Interest) => void }) {
  return (
    <Pill label="Interest" value={value} tone={{ fg: 'var(--text-secondary)', bg: 'transparent', bd: 'var(--border)' }} dot={interestDot(value)}
      options={INTERESTS.map(i => ({ value: i.key, label: i.label }))} onChange={v => onChange(v as Interest)} disabled={READ_ONLY} />
  )
}

// A brewery's logo, with replace and remove. A fix-it control for when somebody uploads
// the wrong file, not a gallery.
function LogoCell({ producer, onChange }: { producer: Producer; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function upload(file: File) {
    setErr(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('brewery', producer.name)
      fd.append('logo', file, file.name)
      const r = await fetch('/api/public/producer-logo', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok || !j.url) {
        setErr(j.error === 'too-big' ? 'Over 2 MB' : j.error === 'not-an-image' ? 'Not an image' : 'Upload failed')
        return
      }
      onChange(j.url)
    } catch { setErr('Upload failed') } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {producer.logo_url
        ? <img src={producer.logo_url} alt="" style={{ height: 26, maxWidth: 90, objectFit: 'contain', background: 'var(--bg-subtle)', borderRadius: 4, padding: 2 }} />
        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>}
      {!READ_ONLY && <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: busy ? 'default' : 'pointer' }}>
        {busy ? 'Uploading…' : producer.logo_url ? 'Replace' : 'Add'}
        <input
          type="file" hidden disabled={busy}
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) upload(f) }}
        />
      </label>}
      {!READ_ONLY && producer.logo_url && (
        <button
          onClick={() => onChange(null)} disabled={busy}
          style={{ all: 'unset', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Remove
        </button>
      )}
      {err && <span style={{ fontSize: 12, color: 'var(--red)' }}>{err}</span>}
    </div>
  )
}
