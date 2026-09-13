'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { SignupLink } from '@/components/brewasia/SignupLink'
import { Field, Modal, Pill, StatCard, fmtL, todayKey, type Tone } from '@/components/brewasia/ui'

// BrewAsia Collab Hub: who's brewing with who, how far along it is, and how many kegs
// go to the Friday Ale Trail or the Halloween Collab Fest. Replaces Shawn's
// "BrewAsia 2026 — Collab Hub" Google Sheet. Breweries live on the Producers page;
// partners here are typed with suggestions from that list.

type Use = 'friday_ale_trail' | 'halloween' | 'unassigned'
type Status = 'lead' | 'interested' | 'matched' | 'brewing' | 'event_ready' | 'done' | 'dead'
type KegLine = { use: Use; qty: number | null; size_litres: number | null; venue: string | null }

type Collab = {
  id: string
  created_at?: string
  code: string
  vn_partner: string | null
  partners: string[]
  beer_name: string | null
  beer_style: string | null
  abv: number | null
  status: Status
  ready_by: string | null
  kegs: KegLine[]
  notes: string | null
  from_form?: boolean
  fest_pour?: string | null
  submitted_by?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
}

type Producer = { id: string; name: string; kind: 'brewery' | 'supplier'; country: string | null; city: string | null }

type LineDraft = { key: string; use: Use; qty: string; size_litres: string; venue: string }
type Draft = {
  id?: string
  code?: string
  fest_pour?: string
  from?: { by: string | null; name: string | null; phone: string | null; email: string | null; at: string | null }
  vn_partner: string
  partners: { key: string; name: string }[]
  beer_name: string
  beer_style: string
  abv: string
  status: Status
  ready_by: string
  notes: string
  kegs: LineDraft[]
}

// Halloween party = the Collab Fest, so it shares Collab Fest's violet with the Kegs page.
const USES: { key: Use; label: string; tone: Tone }[] = [
  { key: 'friday_ale_trail', label: 'Friday Ale Trail', tone: { fg: 'var(--dest-trail)', bg: 'var(--dest-trail-bg)', bd: 'var(--dest-trail-bd)' } },
  { key: 'halloween', label: 'Halloween Collab Fest', tone: { fg: 'var(--dest-collab)', bg: 'var(--dest-collab-bg)', bd: 'var(--dest-collab-bd)' } },
  { key: 'unassigned', label: 'Unassigned', tone: { fg: 'var(--badge-gray-text)', bg: 'var(--badge-gray-bg)', bd: 'var(--badge-gray-border)' } },
]
const useTone = (u: Use) => (USES.find(x => x.key === u) || USES[USES.length - 1]).tone
const USE_LABEL = Object.fromEntries(USES.map(u => [u.key, u.label])) as Record<Use, string>

const STATUSES: { key: Status; label: string; dot: string }[] = [
  { key: 'lead', label: 'Lead', dot: 'var(--text-muted)' },
  { key: 'interested', label: 'Interested', dot: 'var(--accent)' },
  { key: 'matched', label: 'Matched', dot: 'var(--dest-conf)' },
  { key: 'brewing', label: 'Brewing', dot: 'var(--dest-collab)' },
  { key: 'event_ready', label: 'Event ready', dot: 'var(--cal-booked-text)' },
  { key: 'done', label: 'Done', dot: 'var(--cal-booked-text)' },
  { key: 'dead', label: 'Dead / no response', dot: 'var(--badge-red-text)' },
]
const POUR_LABEL: Record<string, string> = { own_setup: 'Own setup', main_taps: 'Donating kegs for our taps', unsure: 'Not sure yet' }
const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.key, s.label])) as Record<Status, string>
const statusDot = (s: Status) => (STATUSES.find(x => x.key === s) || STATUSES[0]).dot
const statusOrder = (s: Status) => STATUSES.findIndex(x => x.key === s)
const faded = (s: Status) => s === 'done' || s === 'dead'

let seq = 0
const nk = () => `c${++seq}`
const blankLine = (prev?: LineDraft): LineDraft => ({ key: nk(), use: prev?.use || 'unassigned', qty: '', size_litres: prev?.size_litres || '', venue: '' })
const blankDraft = (): Draft => ({
  vn_partner: '', partners: [{ key: nk(), name: '' }], beer_name: '', beer_style: '', abv: '',
  status: 'lead', ready_by: '', notes: '', kegs: [],
})

const txt = (v: string | null | undefined) => (v ?? '').trim() || null
const kegsOf = (c: Collab, use?: Use) => (c.kegs || []).filter(l => !use || l.use === use).reduce((n, l) => n + (l.qty || 0), 0)
const litresOf = (c: Collab, use?: Use) => (c.kegs || []).filter(l => !use || l.use === use).reduce((n, l) => n + (Number(l.size_litres) || 0) * (l.qty || 0), 0)
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')

export default function CollabsPage() {
  const [collabs, setCollabs] = useState<Collab[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')

  const [q, setQ] = useState('')
  const [fUse, setFUse] = useState<'' | Use>('')
  const [fStatus, setFStatus] = useState<'' | Status>('')
  const [fCountry, setFCountry] = useState('')

  const [editing, setEditing] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data, error }, { data: pr }] = await Promise.all([
      supabase.from('brewasia_collabs').select('*').order('code', { ascending: true }),
      supabase.from('brewasia_producers').select('id, name, kind, country, city').order('name'),
    ])
    setLoading(false)
    if (error) { setLoadError(error.message); return }
    setLoadError('')
    setCollabs(((data || []) as Collab[]).map(c => ({ ...c, partners: c.partners || [], kegs: Array.isArray(c.kegs) ? c.kegs : [] })))
    setProducers((pr || []) as Producer[])
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600) }

  // ── derived ──
  const producerByName = useMemo(() => {
    const m = new Map<string, Producer>()
    for (const p of producers) m.set(norm(p.name), p)
    return m
  }, [producers])
  const countryOf = (name: string) => producerByName.get(norm(name))?.country || null
  const isSupplier = (name: string) => producerByName.get(norm(name))?.kind === 'supplier'

  // A collab's country = its brewery partners' countries (the non-Vietnam side if there is one).
  // Suppliers come through local distributors, so a brewery × supplier collab counts as Vietnam.
  const countriesOf = (c: Collab) => {
    const breweries = c.partners.filter(p => !isSupplier(p))
    const cs = Array.from(new Set(breweries.map(countryOf).filter(Boolean) as string[]))
    const foreign = cs.filter(x => x.toLowerCase() !== 'vietnam')
    if (foreign.length) return foreign
    if (cs.length) return cs
    return breweries.length === 0 && c.partners.length > 0 ? ['Vietnam'] : []
  }
  const pairingOf = (c: Collab) =>
    [c.vn_partner, ...c.partners.map(p => (isSupplier(p) ? `${p} (supplier)` : p))].filter(Boolean).join(' × ') || 'No partners yet'

  const localNames = useMemo(() => producers.filter(p => (p.country || '').toLowerCase() === 'vietnam').map(p => p.name), [producers])
  const allNames = useMemo(() => producers.map(p => p.name), [producers])
  const styles = useMemo(() => Array.from(new Set(collabs.map(c => (c.beer_style || '').trim()).filter(Boolean))).sort(), [collabs])
  const venues = useMemo(() => Array.from(new Set(collabs.flatMap(c => c.kegs.map(l => (l.venue || '').trim())).filter(Boolean))).sort(), [collabs])

  const live = collabs.filter(c => c.status !== 'dead')
  const useTotals = useMemo(() => {
    const t = Object.fromEntries(USES.map(u => [u.key, { kegs: 0, litres: 0, collabs: 0 }])) as Record<Use, { kegs: number; litres: number; collabs: number }>
    for (const c of collabs) {
      if (c.status === 'dead') continue
      for (const u of USES) {
        if (c.kegs.some(l => l.use === u.key)) { t[u.key].collabs += 1; t[u.key].kegs += kegsOf(c, u.key); t[u.key].litres += litresOf(c, u.key) }
      }
    }
    return t
  }, [collabs])
  const byStatus = useMemo(() => STATUSES.map(s => ({ ...s, n: collabs.filter(c => c.status === s.key).length })), [collabs])
  const byCountry = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of live) {
      const cs = countriesOf(c)
      for (const x of cs.length ? cs : ['Country not set']) m.set(x, (m.get(x) || 0) + 1)
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] === 'Country not set' ? 1 : b[0] === 'Country not set' ? -1 : b[1] - a[1] || a[0].localeCompare(b[0])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabs, producerByName])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return collabs
      .filter(c => {
        if (fUse && !c.kegs.some(l => l.use === fUse)) return false
        if (fStatus && c.status !== fStatus) return false
        if (fCountry) {
          const cs = countriesOf(c)
          if (fCountry === 'Country not set' ? cs.length > 0 : !cs.includes(fCountry)) return false
        }
        if (needle) {
          const hay = [c.code, c.vn_partner, c.beer_name, c.beer_style, c.notes, ...c.partners, ...countriesOf(c), ...c.kegs.map(l => l.venue)].join(' ').toLowerCase()
          if (!hay.includes(needle)) return false
        }
        return true
      })
      .sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || a.code.localeCompare(b.code))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabs, q, fUse, fStatus, fCountry, producerByName])

  const anyFilter = !!(q || fUse || fStatus || fCountry)

  // ── writes ──
  async function setStatus(c: Collab, status: Status) {
    const before = c.status
    setCollabs(p => p.map(x => (x.id === c.id ? { ...x, status } : x)))
    const { error } = await supabase.from('brewasia_collabs').update({ status }).eq('id', c.id)
    if (error) {
      setCollabs(p => p.map(x => (x.id === c.id ? { ...x, status: before } : x)))
      showToast('Could not save. Try again.')
    }
  }

  function openNew() { setConfirmDelete(false); setEditing(blankDraft()) }

  function openEdit(c: Collab) {
    setConfirmDelete(false)
    setEditing({
      id: c.id, code: c.code, fest_pour: c.fest_pour || '',
      from: c.from_form ? { by: c.submitted_by || null, name: c.contact_name || null, phone: c.contact_phone || null, email: c.contact_email || null, at: c.created_at || null } : undefined,
      vn_partner: c.vn_partner || '',
      partners: (c.partners.length ? c.partners : ['']).map(name => ({ key: nk(), name })),
      beer_name: c.beer_name || '', beer_style: c.beer_style || '', abv: c.abv == null ? '' : String(c.abv),
      status: c.status, ready_by: c.ready_by || '', notes: c.notes || '',
      kegs: c.kegs.map(l => ({ key: nk(), use: l.use || 'unassigned', qty: l.qty == null ? '' : String(l.qty), size_litres: l.size_litres == null ? '' : String(l.size_litres), venue: l.venue || '' })),
    })
  }

  const setDraft = (patch: Partial<Draft>) => setEditing(f => f && { ...f, ...patch })
  const updatePartner = (key: string, name: string) => setEditing(f => f && { ...f, partners: f.partners.map(p => (p.key === key ? { ...p, name } : p)) })
  const addPartner = () => setEditing(f => f && { ...f, partners: [...f.partners, { key: nk(), name: '' }] })
  const removePartner = (key: string) => setEditing(f => (f && f.partners.length > 1 ? { ...f, partners: f.partners.filter(p => p.key !== key) } : f))
  const updateLine = (key: string, patch: Partial<LineDraft>) => setEditing(f => f && { ...f, kegs: f.kegs.map(l => (l.key === key ? { ...l, ...patch } : l)) })
  const addLine = () => setEditing(f => f && { ...f, kegs: [...f.kegs, blankLine(f.kegs[f.kegs.length - 1])] })
  const removeLine = (key: string) => setEditing(f => f && { ...f, kegs: f.kegs.filter(l => l.key !== key) })

  async function saveDraft() {
    if (!editing) return
    const partners = editing.partners.map(p => p.name.trim()).filter(Boolean)
    if (!editing.vn_partner.trim() && !partners.length) return showToast('Add at least one brewery.')
    const num = (v: string) => (v.trim() === '' || isNaN(Number(v)) ? null : Number(v))
    const payload = {
      vn_partner: txt(editing.vn_partner),
      partners,
      beer_name: txt(editing.beer_name),
      beer_style: txt(editing.beer_style),
      abv: num(editing.abv),
      status: editing.status,
      ready_by: editing.ready_by || null,
      notes: txt(editing.notes),
      fest_pour: editing.kegs.some(l => l.use === 'halloween') ? (editing.fest_pour || null) : null,
      kegs: editing.kegs.map(l => {
        const q = num(l.qty)
        return {
          use: l.use,
          qty: q == null ? null : Math.max(0, Math.floor(q)),
          size_litres: num(l.size_litres),
          venue: l.use === 'friday_ale_trail' ? txt(l.venue) : null,
        }
      }),
    }
    setSaving(true)
    const res = editing.id
      ? await supabase.from('brewasia_collabs').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('brewasia_collabs').insert(payload).select().single()
    setSaving(false)
    if (res.error || !res.data) return showToast('Could not save. Try again.')
    const d = res.data as Collab
    const row = { ...d, partners: d.partners || [], kegs: Array.isArray(d.kegs) ? d.kegs : [] }
    setCollabs(p => (editing.id ? p.map(c => (c.id === row.id ? row : c)) : [...p, row]))
    setEditing(null)
    showToast(editing.id ? 'Saved' : `${row.code} added`)
  }

  async function deleteDraft() {
    if (!editing?.id) return
    setSaving(true)
    const { error } = await supabase.from('brewasia_collabs').delete().eq('id', editing.id)
    setSaving(false)
    if (error) return showToast('Could not delete. Try again.')
    setCollabs(p => p.filter(c => c.id !== editing.id))
    setEditing(null)
    showToast('Deleted')
  }

  function exportCsv() {
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const head = ['Collab ID', 'Vietnam partner', 'Collab partners', 'Country', 'Status', 'Beer', 'Style', 'ABV %', 'Ready by', 'Friday Ale Trail kegs', 'Halloween Collab Fest kegs', 'Unassigned kegs', 'Total kegs', 'Keg detail', 'Halloween pour', 'Notes']
    const rows = filtered.map(c => [
      c.code, c.vn_partner, c.partners.join(' × '), countriesOf(c).join(', '), STATUS_LABEL[c.status], c.beer_name, c.beer_style, c.abv, c.ready_by,
      kegsOf(c, 'friday_ale_trail'), kegsOf(c, 'halloween'), kegsOf(c, 'unassigned'), kegsOf(c),
      c.kegs.map(l => `${l.qty ?? 'TBD'}×${l.size_litres != null ? ` ${l.size_litres}L` : ''} ${USE_LABEL[l.use]}${l.venue ? ` (${l.venue})` : ''}`).join('; '),
      c.fest_pour ? POUR_LABEL[c.fest_pour] || c.fest_pour : '',
      c.notes,
    ])
    const csv = [head, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `brewasia-collabs-${todayKey()}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const muted = { color: 'var(--text-muted)' }
  const tableMissing = /brewasia_collabs|does not exist|schema cache/i.test(loadError)

  return (
    <div className="keg-wrap">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">BrewAsia collabs</div>
          <p style={{ ...muted, fontSize: 13, margin: '6px 0 0', maxWidth: 580, lineHeight: 1.55 }}>
            Who wants to collaborate, who they’re matched with, how far along it is, and how many kegs go to the Friday Ale Trail or the Halloween Collab Fest.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/dashboard/producers" className="btn-outline" style={{ fontSize: 13, textDecoration: 'none' }}>Producers</Link>
          <button className="btn-outline" onClick={exportCsv} disabled={!filtered.length} style={{ fontSize: 13 }}>
            Export CSV{anyFilter && filtered.length ? ` (${filtered.length})` : ''}
          </button>
          <button className="btn-accent" onClick={openNew} disabled={!!loadError}>Add collab</button>
        </div>
      </div>

      {!loadError && <CollabSignup collabs={collabs} onRefresh={load} />}

      {loadError ? (
        <div className="card" style={{ padding: 22, marginTop: 24 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{tableMissing ? 'The collabs table isn’t set up yet' : 'Couldn’t load collabs'}</div>
          <div style={{ ...muted, fontSize: 13, lineHeight: 1.6 }}>{tableMissing ? 'Ask Claude to create brewasia_collabs.' : loadError}</div>
          <button className="btn-outline" onClick={load} style={{ marginTop: 14, fontSize: 13 }}>Refresh</button>
        </div>
      ) : (
        <>
          {/* ── Pipeline ── */}
          <div className="collab-section-label" style={{ marginTop: 24 }}>Pipeline</div>
          <div className="collab-pipeline">
            {byStatus.map(s => {
              const on = fStatus === s.key
              return (
                <button key={s.key} className="collab-step" aria-pressed={on} onClick={() => setFStatus(on ? '' : s.key)}
                  style={{ boxShadow: on ? '0 0 0 2px var(--accent)' : undefined, borderColor: on ? 'transparent' : undefined, opacity: s.n || on ? 1 : 0.55 }}>
                  <span className="collab-step__top"><span className="collab-step-dot" style={{ background: s.dot }} />{s.label}</span>
                  <span className="collab-step__n">{loading ? '–' : s.n}</span>
                </button>
              )
            })}
          </div>

          {/* ── Kegs by event ── */}
          <div className="collab-section-label">Kegs by event <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(not counting dead collabs)</span></div>
          <div className="collab-strip">
            <StatCard label="All collabs" kegs={useTotals.friday_ale_trail.kegs + useTotals.halloween.kegs + useTotals.unassigned.kegs}
              litres={useTotals.friday_ale_trail.litres + useTotals.halloween.litres + useTotals.unassigned.litres}
              sub={`${live.length} live ${live.length === 1 ? 'collab' : 'collabs'}`} active={fUse === ''} loading={loading} onClick={() => setFUse('')} />
            {USES.map(u => {
              const t = useTotals[u.key]
              const active = fUse === u.key
              return (
                <StatCard key={u.key} label={u.label} tone={u.tone} kegs={t.kegs} litres={t.litres}
                  sub={t.collabs ? `${t.collabs} ${t.collabs === 1 ? 'collab' : 'collabs'}` : ''}
                  active={active} loading={loading} onClick={() => setFUse(active ? '' : u.key)} />
              )
            })}
          </div>

          {/* ── Countries ── */}
          {byCountry.length > 0 && (
            <>
              <div className="collab-section-label">By country</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {byCountry.map(([country, n]) => {
                  const on = fCountry === country
                  return (
                    <button key={country} className="collab-chip" aria-pressed={on} onClick={() => setFCountry(on ? '' : country)}
                      style={{ borderColor: on ? 'var(--accent)' : undefined, background: on ? 'var(--accent-light)' : undefined, color: country === 'Country not set' ? 'var(--text-muted)' : undefined }}>
                      <b>{n}</b> {country}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Filters ── */}
          <div className="keg-filters" style={{ margin: '18px 0 14px' }}>
            <input className="input" placeholder="Search ID, brewery, beer, country…" value={q} onChange={e => setQ(e.target.value)} />
            <select className="input" value={fStatus} onChange={e => setFStatus(e.target.value as Status | '')} aria-label="Status">
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select className="input" value={fUse} onChange={e => setFUse(e.target.value as Use | '')} aria-label="Event">
              <option value="">All events</option>
              {USES.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
            </select>
            <select className="input" value={fCountry} onChange={e => setFCountry(e.target.value)} aria-label="Country">
              <option value="">All countries</option>
              {byCountry.map(([c]) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 28, ...muted, fontSize: 13 }}>Loading…</div>
          ) : !collabs.length ? (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No collabs yet</div>
              <div style={{ ...muted, fontSize: 13, marginBottom: 16 }}>Add each pairing: the Vietnam brewery, who they’re brewing with, and where the kegs go.</div>
              <button className="btn-accent" onClick={openNew}>Add collab</button>
            </div>
          ) : !filtered.length ? (
            <div className="card" style={{ padding: 28, ...muted, fontSize: 13, textAlign: 'center' }}>
              Nothing matches these filters.{' '}
              <button onClick={() => { setQ(''); setFUse(''); setFStatus(''); setFCountry('') }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0 }}>Clear filters</button>
            </div>
          ) : (
            <>
              {/* ── Desktop table ── */}
              <div className="card keg-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="data-table keg-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Collab</th>
                      <th>Country</th>
                      <th>Status</th>
                      <th>Kegs</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const cs = countriesOf(c)
                      return (
                        <tr key={c.id} onClick={() => openEdit(c)} style={{ cursor: 'pointer', opacity: faded(c.status) ? 0.55 : 1 }}>
                          <td style={{ ...muted, fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{c.code}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{pairingOf(c)}{c.from_form && <FormTag />}</div>
                            <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
                              {[c.beer_name, c.beer_style, c.abv != null ? `${c.abv}%` : null, c.ready_by ? `ready by ${fmtDate(c.ready_by)}` : null, c.fest_pour && c.fest_pour !== 'unsure' ? `Fest: ${POUR_LABEL[c.fest_pour] || c.fest_pour}` : null].filter(Boolean).join(' · ') || 'Beer not decided'}
                            </div>
                          </td>
                          <td style={{ color: cs.length ? 'var(--text-secondary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{cs.join(', ') || '—'}</td>
                          <td onClick={e => e.stopPropagation()}><StatusSelect value={c.status} onChange={s => setStatus(c, s)} /></td>
                          <td><KegChips kegs={c.kegs} /></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            <div style={{ fontWeight: 700 }}>{kegsOf(c)}×</div>
                            {litresOf(c) > 0 && <div style={{ ...muted, fontSize: 12 }}>{fmtL(litresOf(c))} L</div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Phone cards ── */}
              <div className="keg-cards" style={{ gap: 8 }}>
                {filtered.map(c => {
                  const cs = countriesOf(c)
                  return (
                    <div key={c.id} className="card" style={{ padding: 14, opacity: faded(c.status) ? 0.55 : 1 }}>
                      <button onClick={() => openEdit(c)} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
                        <div style={{ ...muted, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{c.code}{cs.length ? ` · ${cs.join(', ')}` : ''}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginTop: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{pairingOf(c)}{c.from_form && <FormTag />}</span>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{kegsOf(c)}×</span>
                        </div>
                        <div style={{ ...muted, fontSize: 13, marginTop: 3 }}>
                          {[c.beer_name, c.beer_style, c.abv != null ? `${c.abv}%` : null].filter(Boolean).join(' · ') || 'Beer not decided'}
                        </div>
                        {c.kegs.length > 0 && <div style={{ marginTop: 8 }}><KegChips kegs={c.kegs} /></div>}
                      </button>
                      <div style={{ marginTop: 12 }}><StatusSelect value={c.status} onChange={s => setStatus(c, s)} /></div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Add / edit ── */}
      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.code ? `Edit ${editing.code}` : 'Add collab'}>
          <datalist id="collab-local">{localNames.map(n => <option key={n} value={n} />)}</datalist>
          <datalist id="collab-all">{allNames.map(n => <option key={n} value={n} />)}</datalist>
          <datalist id="collab-styles">{styles.map(st => <option key={st} value={st} />)}</datalist>
          <datalist id="collab-venues">{venues.map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="collab-sizes">{['20', '30', '50'].map(sz => <option key={sz} value={sz} />)}</datalist>

          {editing.from && (
            <div className="keg-line" style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              <b style={{ color: 'var(--text)' }}>Sent through the collab form</b>{editing.from.by ? ` by ${editing.from.by}` : ''}{editing.from.at ? ` · ${fmtDate(editing.from.at.slice(0, 10))}` : ''}
              <div>{[editing.from.name, editing.from.phone, editing.from.email].filter(Boolean).join(' · ')}</div>
            </div>
          )}
          <div className="keg-grid-2">
            <Field label="Vietnam partner">
              <input className="input" list="collab-local" value={editing.vn_partner} onChange={e => setDraft({ vn_partner: e.target.value })} placeholder="e.g. Deme Brewing" autoFocus={!editing.id} />
            </Field>
            <Field label="Status">
              <select className="input" value={editing.status} onChange={e => setDraft({ status: e.target.value as Status })}>
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Collab partners (breweries or suppliers)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {editing.partners.map((p, i) => {
                const country = p.name.trim() ? (isSupplier(p.name) ? 'Supplier' : countryOf(p.name)) : null
                return (
                  <div key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, flexShrink: 0 }}>×</span>
                    <input className="input" list="collab-all" value={p.name} onChange={e => updatePartner(p.key, e.target.value)} placeholder={i === 0 ? 'e.g. Ranch' : 'Another partner'} aria-label={`Partner ${i + 1}`} />
                    {country && <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{country}</span>}
                    {editing.partners.length > 1 && <button className="keg-link" onClick={() => removePartner(p.key)} aria-label={`Remove partner ${i + 1}`} style={{ flexShrink: 0 }}>Remove</button>}
                  </div>
                )
              })}
              <button onClick={addPartner} className="keg-add-line">+ Add another partner</button>
            </div>
          </Field>

          <div className="keg-grid-3">
            <Field label="Beer">
              <input className="input" value={editing.beer_name} onChange={e => setDraft({ beer_name: e.target.value })} placeholder="If named yet" />
            </Field>
            <Field label="Style">
              <input className="input" list="collab-styles" value={editing.beer_style} onChange={e => setDraft({ beer_style: e.target.value })} placeholder="e.g. Hazy IPA" />
            </Field>
            <Field label="ABV %">
              <input className="input" inputMode="decimal" value={editing.abv} onChange={e => setDraft({ abv: e.target.value })} />
            </Field>
          </div>

          <Field label="Ready by">
            <input className="input" type="date" value={editing.ready_by} onChange={e => setDraft({ ready_by: e.target.value })} style={{ maxWidth: 220 }} />
          </Field>

          <div className="section-title" style={{ margin: '6px 0 10px' }}>Kegs by event</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {editing.kegs.map((l, i) => (
              <div key={l.key} className="keg-line">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Event {i + 1}</span>
                  <button className="keg-link" onClick={() => removeLine(l.key)} aria-label={`Remove event ${i + 1}`}>Remove</button>
                </div>
                <div className="collab-line-grid">
                  <Field label="Event" last>
                    <select className="input" value={l.use} onChange={e => updateLine(l.key, { use: e.target.value as Use })}
                      style={{ borderLeft: `4px solid ${useTone(l.use).fg}`, fontWeight: 600, color: l.use === 'unassigned' ? 'var(--text-secondary)' : useTone(l.use).fg }}>
                      {USES.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Kegs" last>
                    <input className="input" inputMode="numeric" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value.replace(/[^0-9]/g, '') })} placeholder="TBD" />
                  </Field>
                  <Field label="Size (L)" last>
                    <input className="input" inputMode="decimal" list="collab-sizes" value={l.size_litres} onChange={e => updateLine(l.key, { size_litres: e.target.value })} />
                  </Field>
                </div>
                {l.use === 'friday_ale_trail' && (
                  <div style={{ marginTop: 12 }}>
                    <Field label="Ale Trail bar" last>
                      <input className="input" list="collab-venues" value={l.venue} onChange={e => updateLine(l.key, { venue: e.target.value })} placeholder="Which bar? (optional)" />
                    </Field>
                  </div>
                )}
              </div>
            ))}
            <button onClick={addLine} className="keg-add-line">+ Add event</button>
          </div>

          {editing.kegs.some(l => l.use === 'halloween') && (
            <Field label="Halloween Collab Fest: how they pour">
              <select className="input" value={editing.fest_pour || ''} onChange={e => setDraft({ fest_pour: e.target.value })} style={{ maxWidth: 320 }}>
                <option value="">Not set</option>
                {Object.entries(POUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          )}

          <Field label="Notes">
            <textarea className="input" rows={3} value={editing.notes} onChange={e => setDraft({ notes: e.target.value })} />
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button className="btn-accent" onClick={saveDraft} disabled={saving} style={{ flex: 1 }}>{saving ? 'Saving…' : editing.id ? 'Save' : 'Add collab'}</button>
            {editing.id && (confirmDelete
              ? <button className="btn-red" onClick={deleteDraft} disabled={saving}>Confirm delete</button>
              : <button className="btn-outline" onClick={() => setConfirmDelete(true)} disabled={saving}>Delete</button>)}
          </div>
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <Pill label="Status" value={value} tone={{ fg: 'var(--text-secondary)', bg: 'transparent', bd: 'var(--border)' }} dot={statusDot(value)}
      options={STATUSES.map(s => ({ value: s.key, label: s.label }))} onChange={v => onChange(v as Status)} />
  )
}

// "2× 20 L · Friday Ale Trail", one tag per event line, coloured by event. No count yet = TBD.
function KegChips({ kegs }: { kegs: KegLine[] }) {
  if (!kegs.length) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No events yet</span>
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {kegs.map((l, i) => {
        const t = useTone(l.use)
        return (
          <span key={i} className="keg-dest-chip" style={{ color: t.fg, background: t.bg, borderColor: t.bd, height: 'auto', minHeight: 24, padding: '3px 8px', whiteSpace: 'normal' }}>
            <b>{l.qty == null ? 'TBD' : `${l.qty}×`}</b>{l.size_litres != null ? ` ${fmtL(Number(l.size_litres))} L` : ''} · {USE_LABEL[l.use] || 'Unassigned'}{l.venue ? ` (${l.venue})` : ''}
          </span>
        )
      })}
    </span>
  )
}

function FormTag() {
  return <span title="Sent by the brewery through the collab form" style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 5, padding: '1px 6px', verticalAlign: 2, whiteSpace: 'nowrap' }}>Form</span>
}

const collabUrl = () => `${typeof window !== 'undefined' ? window.location.origin : ''}/brewasia/collab`
const collabMessage = () => `Hi,

We're lining up collab beers for BrewAsia 2026:\n\n- Friday Ale Trail, Friday 30 October: an extended Ale Trail across Saigon, with collabs pouring at trail bars and other venues.\n- Halloween Collab Fest, Saturday 31 October at BigBamBoo: bring your own setup or donate kegs for our taps.\n\nWe're looking for something special: a collab, a Halloween theme, or a one-off. All kegs come to BigBamBoo by Friday 23 October (weekdays only).

If you're brewing a collab (or want us to match you with a partner), please send us the details here. It takes 2 minutes:
${collabUrl()}

Cheers,
BigBamBoo

---

Xin chào,

Chúng tôi đang tổng hợp các loại bia collab cho BrewAsia 2026:\n\n- Friday Ale Trail, Thứ Sáu 30/10: Ale Trail mở rộng khắp Sài Gòn, bia collab phục vụ tại các quán trong trail và địa điểm khác.\n- Halloween Collab Fest, Thứ Bảy 31/10 tại BigBamBoo: mang hệ thống rót riêng hoặc tài trợ keg cho vòi của chúng tôi.\n\nChúng tôi tìm những loại bia đặc biệt: collab, chủ đề Halloween, hoặc mẻ đặc biệt. Tất cả keg gửi tới BigBamBoo trước Thứ Sáu 23/10 (chỉ ngày thường).

Nếu bạn đang nấu bia collab (hoặc muốn chúng tôi kết nối đối tác), vui lòng gửi thông tin tại đây (chỉ mất 2 phút):
${collabUrl()}

Trân trọng,
BigBamBoo`

function CollabSignup({ collabs, onRefresh }: { collabs: Collab[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(true)
  const sent = collabs.filter(c => c.from_form)
  const breweries = new Set(sent.map(c => c.submitted_by || c.code)).size
  return (
    <div className="card donate-panel" style={{ margin: '18px 0 0' }}>
      <button onClick={() => setOpen(!open)} className="donate-panel__title" aria-expanded={open}>
        <span>Collab sign-up</span>
        <span className="donate-panel__count">
          {sent.length ? <><b>{sent.length}</b> {sent.length === 1 ? 'collab' : 'collabs'} sent by <b>{breweries}</b> {breweries === 1 ? 'brewery' : 'breweries'}. Marked “Form” below.</> : 'One link for every brewery. They send their collab, it lands here.'}
        </span>
        <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <SignupLink url={collabUrl()} emailText={collabMessage()} onRefresh={onRefresh} />}
    </div>
  )
}
