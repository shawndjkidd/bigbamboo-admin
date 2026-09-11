'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

// BrewAsia keg tracker. Breweries donate kegs; they land at BigBamBoo and go out
// to the Conference, the Ale Trail bars, or Collab Fest. One row = one donation
// line (use qty). A line can be split so part of it goes somewhere else.

type Destination = 'unassigned' | 'conference' | 'ale_trail' | 'collab_fest'
type Status = 'promised' | 'received' | 'allocated' | 'delivered' | 'tapped' | 'empty' | 'returned'

type Keg = {
  id: string
  created_at?: string
  brewery: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  beer_name: string | null
  beer_style: string | null
  abv: number | null
  size_litres: number | null
  coupler: string | null
  qty: number
  destination: Destination
  destination_venue: string | null
  status: Status
  returnable: boolean
  received_at: string | null
  delivered_at: string | null
  returned_at: string | null
  notes: string | null
}

type Draft = Omit<Keg, 'id' | 'abv' | 'size_litres' | 'qty'> & {
  id?: string
  abv: string
  size_litres: string
  qty: string
}

const DESTS: { key: Destination; label: string }[] = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'conference', label: 'Conference' },
  { key: 'ale_trail', label: 'Ale Trail' },
  { key: 'collab_fest', label: 'Collab Fest' },
]
const DEST_LABEL = Object.fromEntries(DESTS.map(d => [d.key, d.label])) as Record<Destination, string>

const STATUSES: Status[] = ['promised', 'received', 'allocated', 'delivered', 'tapped', 'empty', 'returned']
const STATUS_LABEL: Record<Status, string> = {
  promised: 'Promised', received: 'Received', allocated: 'Allocated', delivered: 'Delivered',
  tapped: 'Tapped', empty: 'Empty', returned: 'Returned',
}

// Colour carries meaning: grey = not here yet / done with, orange = in our cold
// room, green = out at the destination. --badge-green is grey in this theme, so
// the real green comes from the calendar's --cal-booked tokens.
function statusTone(s: Status) {
  if (s === 'received' || s === 'allocated') return { bg: 'var(--badge-orange-bg)', bd: 'var(--badge-orange-border)', fg: 'var(--badge-orange-text)' }
  if (s === 'delivered' || s === 'tapped') return { bg: 'var(--cal-booked-bg)', bd: 'var(--cal-booked-border)', fg: 'var(--cal-booked-text)' }
  return { bg: 'var(--badge-gray-bg)', bd: 'var(--badge-gray-border)', fg: 'var(--badge-gray-text)' }
}
function destTone(d: Destination) {
  if (d === 'unassigned') return { bg: 'var(--badge-orange-bg)', bd: 'var(--badge-orange-border)', fg: 'var(--badge-orange-text)' }
  return { bg: 'transparent', bd: 'var(--border)', fg: 'var(--text-secondary)' }
}

const COUPLERS = ['S', 'D', 'A', 'G', 'U']
const isDone = (s: Status) => s === 'empty' || s === 'returned'

const BLANK: Draft = {
  brewery: '', contact_name: '', contact_phone: '', contact_email: '',
  beer_name: '', beer_style: '', abv: '', size_litres: '', coupler: '', qty: '1',
  destination: 'unassigned', destination_venue: '', status: 'promised', returnable: false,
  received_at: null, delivered_at: null, returned_at: null, notes: '',
}

const todayKey = () => new Date().toLocaleDateString('en-CA')
const fmtL = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n)
const litres = (k: Keg) => (Number(k.size_litres) || 0) * (k.qty || 0)
const txt = (v: string | null | undefined) => (v ?? '').trim() || null

// Stamp the date the first time a keg reaches a milestone status.
function withStatusDates<T extends { status: Status; received_at: string | null; delivered_at: string | null; returned_at: string | null }>(row: T, status: Status): T {
  const next = { ...row, status }
  if (status === 'received' && !next.received_at) next.received_at = todayKey()
  if (status === 'delivered' && !next.delivered_at) next.delivered_at = todayKey()
  if (status === 'returned' && !next.returned_at) next.returned_at = todayKey()
  return next
}

export default function KegsPage() {
  const [kegs, setKegs] = useState<Keg[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')

  const [q, setQ] = useState('')
  const [fBrewery, setFBrewery] = useState('')
  const [fDest, setFDest] = useState<'' | Destination>('')
  const [fStatus, setFStatus] = useState<'' | Status>('')

  const [editing, setEditing] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [splitting, setSplitting] = useState<Keg | null>(null)
  const [splitQty, setSplitQty] = useState('1')
  const [splitDest, setSplitDest] = useState<Destination>('unassigned')
  const [splitVenue, setSplitVenue] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('brewasia_kegs')
      .select('*')
      .order('brewery', { ascending: true })
      .order('created_at', { ascending: true })
    setLoading(false)
    if (error) { setLoadError(error.message); return }
    setLoadError('')
    setKegs((data || []) as Keg[])
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600) }

  // ── derived ──
  const breweries = useMemo(
    () => Array.from(new Set(kegs.map(k => k.brewery.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [kegs],
  )
  const venues = useMemo(
    () => Array.from(new Set(kegs.map(k => (k.destination_venue || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [kegs],
  )
  const styles = useMemo(
    () => Array.from(new Set(kegs.map(k => (k.beer_style || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [kegs],
  )

  const totals = useMemo(() => {
    const t = Object.fromEntries(DESTS.map(d => [d.key, { kegs: 0, litres: 0, promised: 0 }])) as Record<Destination, { kegs: number; litres: number; promised: number }>
    for (const k of kegs) {
      const d = t[k.destination] || t.unassigned
      d.kegs += k.qty || 0
      d.litres += litres(k)
      if (k.status === 'promised') d.promised += k.qty || 0
    }
    return t
  }, [kegs])

  const returnsDue = useMemo(
    () => kegs.filter(k => k.returnable && k.status === 'empty').reduce((n, k) => n + (k.qty || 0), 0),
    [kegs],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return kegs.filter(k => {
      if (fBrewery && k.brewery.trim() !== fBrewery) return false
      if (fDest && k.destination !== fDest) return false
      if (fStatus && k.status !== fStatus) return false
      if (needle) {
        const hay = [k.brewery, k.beer_name, k.beer_style, k.destination_venue, k.contact_name, k.notes].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [kegs, q, fBrewery, fDest, fStatus])

  const groups = useMemo(() => {
    const m = new Map<string, Keg[]>()
    const sorted = [...filtered].sort((a, b) =>
      a.brewery.trim().localeCompare(b.brewery.trim(), undefined, { sensitivity: 'base' })
      || String(a.created_at || '').localeCompare(String(b.created_at || '')))
    for (const k of sorted) {
      const key = k.brewery.trim()
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(k)
    }
    return Array.from(m.entries())
  }, [filtered])

  const anyFilter = !!(q || fBrewery || fDest || fStatus)

  // ── writes ──
  async function patch(id: string, changes: Partial<Keg>) {
    const before = kegs.find(k => k.id === id)
    if (!before) return
    setKegs(p => p.map(k => (k.id === id ? { ...k, ...changes } : k)))
    const { error } = await supabase.from('brewasia_kegs').update(changes).eq('id', id)
    if (error) {
      setKegs(p => p.map(k => (k.id === id ? before : k)))
      showToast('Could not save. Try again.')
    }
  }

  function setStatus(k: Keg, status: Status) {
    const next = withStatusDates(k, status)
    patch(k.id, { status, received_at: next.received_at, delivered_at: next.delivered_at, returned_at: next.returned_at })
  }

  function setDestination(k: Keg, destination: Destination) {
    patch(k.id, { destination, destination_venue: destination === 'ale_trail' ? k.destination_venue : null })
  }

  function openNew() {
    setConfirmDelete(false)
    setEditing({ ...BLANK, brewery: fBrewery || '' })
  }

  function openEdit(k: Keg) {
    setConfirmDelete(false)
    setEditing({
      ...k,
      contact_name: k.contact_name || '', contact_phone: k.contact_phone || '', contact_email: k.contact_email || '',
      beer_name: k.beer_name || '', beer_style: k.beer_style || '', coupler: k.coupler || '',
      destination_venue: k.destination_venue || '', notes: k.notes || '',
      abv: k.abv == null ? '' : String(k.abv),
      size_litres: k.size_litres == null ? '' : String(k.size_litres),
      qty: String(k.qty ?? 1),
    })
  }

  // Picking an existing brewery fills in its contact if the fields are still empty.
  function setBrewery(name: string) {
    setEditing(f => {
      if (!f) return f
      const known = kegs.find(k => k.brewery.trim().toLowerCase() === name.trim().toLowerCase())
      if (!known || f.id) return { ...f, brewery: name }
      return {
        ...f, brewery: name,
        contact_name: f.contact_name || known.contact_name || '',
        contact_phone: f.contact_phone || known.contact_phone || '',
        contact_email: f.contact_email || known.contact_email || '',
        returnable: f.returnable || known.returnable,
      }
    })
  }

  async function saveDraft() {
    if (!editing) return
    const brewery = editing.brewery.trim()
    const qty = Math.max(1, Math.floor(Number(editing.qty) || 0))
    if (!brewery) return showToast('Brewery is required.')
    const num = (v: string) => (v.trim() === '' || isNaN(Number(v)) ? null : Number(v))
    const payload = {
      brewery,
      contact_name: txt(editing.contact_name),
      contact_phone: txt(editing.contact_phone),
      contact_email: txt(editing.contact_email),
      beer_name: txt(editing.beer_name),
      beer_style: txt(editing.beer_style),
      abv: num(editing.abv),
      size_litres: num(editing.size_litres),
      coupler: txt(editing.coupler),
      qty,
      destination: editing.destination,
      destination_venue: editing.destination === 'ale_trail' ? txt(editing.destination_venue) : null,
      status: editing.status,
      returnable: !!editing.returnable,
      received_at: editing.received_at || null,
      delivered_at: editing.delivered_at || null,
      returned_at: editing.returned_at || null,
      notes: txt(editing.notes),
    }
    setSaving(true)
    const res = editing.id
      ? await supabase.from('brewasia_kegs').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('brewasia_kegs').insert(payload).select().single()
    setSaving(false)
    if (res.error || !res.data) return showToast('Could not save. Try again.')
    const row = res.data as Keg
    setKegs(p => (editing.id ? p.map(k => (k.id === row.id ? row : k)) : [...p, row]))
    setEditing(null)
    showToast(editing.id ? 'Saved' : 'Donation added')
  }

  async function deleteDraft() {
    if (!editing?.id) return
    setSaving(true)
    const { error } = await supabase.from('brewasia_kegs').delete().eq('id', editing.id)
    setSaving(false)
    if (error) return showToast('Could not delete. Try again.')
    setKegs(p => p.filter(k => k.id !== editing.id))
    setEditing(null)
    showToast('Deleted')
  }

  function openSplit(k: Keg) {
    setSplitting(k)
    setSplitQty('1')
    setSplitDest(DESTS.find(d => d.key !== k.destination && d.key !== 'unassigned')?.key || 'unassigned')
    setSplitVenue('')
  }

  async function doSplit() {
    const k = splitting
    if (!k) return
    const n = Math.floor(Number(splitQty) || 0)
    if (n < 1 || n >= k.qty) return showToast(`Move between 1 and ${k.qty - 1}.`)
    setSaving(true)
    const { error: upErr } = await supabase.from('brewasia_kegs').update({ qty: k.qty - n }).eq('id', k.id)
    if (upErr) { setSaving(false); return showToast('Could not split. Try again.') }
    const { id: _id, created_at: _c, ...rest } = k
    const { data, error } = await supabase
      .from('brewasia_kegs')
      .insert({ ...rest, qty: n, destination: splitDest, destination_venue: splitDest === 'ale_trail' ? txt(splitVenue) : null })
      .select()
      .single()
    if (error || !data) {
      await supabase.from('brewasia_kegs').update({ qty: k.qty }).eq('id', k.id)
      setSaving(false)
      return showToast('Could not split. Try again.')
    }
    setSaving(false)
    setKegs(p => [...p.map(x => (x.id === k.id ? { ...x, qty: k.qty - n } : x)), data as Keg])
    setSplitting(null)
    showToast(`Split: ${n} → ${DEST_LABEL[splitDest]}`)
  }

  function exportCsv() {
    const cols: [string, (k: Keg) => unknown][] = [
      ['Brewery', k => k.brewery], ['Contact', k => k.contact_name], ['Phone', k => k.contact_phone], ['Email', k => k.contact_email],
      ['Beer', k => k.beer_name], ['Style', k => k.beer_style], ['ABV %', k => k.abv], ['Size (L)', k => k.size_litres],
      ['Coupler', k => k.coupler], ['Qty', k => k.qty], ['Total litres', k => litres(k) || ''],
      ['Destination', k => DEST_LABEL[k.destination]], ['Venue', k => k.destination_venue],
      ['Status', k => STATUS_LABEL[k.status]], ['Returns to brewery', k => (k.returnable ? 'Yes' : 'No')],
      ['Received', k => k.received_at], ['Delivered', k => k.delivered_at], ['Returned', k => k.returned_at], ['Notes', k => k.notes],
    ]
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = groups.flatMap(([, list]) => list)
    const csv = [cols.map(c => esc(c[0])).join(','), ...rows.map(k => cols.map(c => esc(c[1](k))).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `brewasia-kegs-${todayKey()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const muted = { color: 'var(--text-muted)' }
  const tableMissing = /brewasia_kegs|does not exist|schema cache/i.test(loadError)

  return (
    <div className="keg-wrap">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">BrewAsia kegs</div>
          <p style={{ ...muted, fontSize: 13, margin: '6px 0 0', maxWidth: 520, lineHeight: 1.55 }}>
            Donated kegs: who promised what, where each one is going, and where it is now.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={exportCsv} disabled={!filtered.length} style={{ fontSize: 13 }}>
            Export CSV{anyFilter && filtered.length ? ` (${filtered.length})` : ''}
          </button>
          <button className="btn-accent" onClick={openNew} disabled={!!loadError}>Add donation</button>
        </div>
      </div>

      {loadError ? (
        <div className="card" style={{ padding: 22, marginTop: 24 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            {tableMissing ? 'The keg table isn’t set up yet' : 'Couldn’t load kegs'}
          </div>
          <div style={{ ...muted, fontSize: 13, lineHeight: 1.6 }}>
            {tableMissing ? 'Run BREWASIA_KEGS.sql in the Supabase SQL editor, then refresh.' : loadError}
          </div>
          <button className="btn-outline" onClick={load} style={{ marginTop: 14, fontSize: 13 }}>Refresh</button>
        </div>
      ) : (
        <>
          {/* ── Summary strip ── */}
          <div className="keg-strip" style={{ margin: '24px 0 10px' }}>
            {DESTS.map(d => {
              const t = totals[d.key]
              const todo = d.key === 'unassigned' && t.kegs > 0
              const active = fDest === d.key
              return (
                <button
                  key={d.key}
                  className={['card', 'keg-stat', todo ? 'keg-stat--todo' : '', active ? 'keg-stat--active' : ''].filter(Boolean).join(' ')}
                  onClick={() => setFDest(active ? '' : d.key)}
                  aria-pressed={active}
                >
                  <span className="kpi-label" style={{ display: 'block', marginBottom: 6, color: todo ? 'var(--badge-orange-text)' : undefined }}>
                    {d.label}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="kpi-value" style={{ fontSize: 38, color: todo ? 'var(--badge-orange-text)' : 'var(--text)' }}>
                      {loading ? '–' : t.kegs}
                    </span>
                    <span style={{ ...muted, fontSize: 12 }}>{t.kegs === 1 ? 'keg' : 'kegs'}</span>
                  </span>
                  <span className="kpi-sub" style={{ display: 'block' }}>
                    {fmtL(t.litres)} L{t.promised > 0 ? ` · ${t.promised} still promised` : ''}
                  </span>
                </button>
              )
            })}
          </div>

          {returnsDue > 0 && (
            <button
              className="cal-chip"
              onClick={() => { setFStatus(fStatus === 'empty' ? '' : 'empty'); setFDest('') }}
              style={{ cursor: 'pointer', marginBottom: 4 }}
            >
              <span className="cal-dot" style={{ background: 'var(--badge-orange-text)' }} />
              <b style={{ color: 'var(--badge-orange-text)' }}>{returnsDue}</b> empty {returnsDue === 1 ? 'keg' : 'kegs'} to return to breweries
            </button>
          )}

          {/* ── Filters ── */}
          <div className="keg-filters" style={{ margin: '14px 0 14px' }}>
            <input className="input" placeholder="Search beer, brewery, venue…" value={q} onChange={e => setQ(e.target.value)} />
            <select className="input" value={fBrewery} onChange={e => setFBrewery(e.target.value)} aria-label="Brewery">
              <option value="">All breweries</option>
              {breweries.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className="input" value={fDest} onChange={e => setFDest(e.target.value as Destination | '')} aria-label="Destination">
              <option value="">All destinations</option>
              {DESTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <select className="input" value={fStatus} onChange={e => setFStatus(e.target.value as Status | '')} aria-label="Status">
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 28, ...muted, fontSize: 13 }}>Loading…</div>
          ) : !kegs.length ? (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No donations yet</div>
              <div style={{ ...muted, fontSize: 13, marginBottom: 16 }}>Add each brewery’s promised kegs as they come in.</div>
              <button className="btn-accent" onClick={openNew}>Add donation</button>
            </div>
          ) : !filtered.length ? (
            <div className="card" style={{ padding: 28, ...muted, fontSize: 13, textAlign: 'center' }}>
              Nothing matches these filters.{' '}
              <button onClick={() => { setQ(''); setFBrewery(''); setFDest(''); setFStatus('') }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* ── Desktop table ── */}
              <div className="card keg-table-wrap" style={{ overflowX: 'auto' }}>
                <table className="data-table keg-table">
                  <thead>
                    <tr>
                      <th>Beer</th>
                      <th>Style / ABV</th>
                      <th style={{ textAlign: 'right' }}>Size</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th>Destination</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([brewery, list]) => (
                      <GroupRows key={brewery} brewery={brewery} list={list}>
                        {list.map(k => (
                          <tr key={k.id} onClick={() => openEdit(k)} style={{ cursor: 'pointer', opacity: isDone(k.status) ? 0.6 : 1 }}>
                            <td>
                              <div style={{ fontWeight: 500 }}>{k.beer_name || <span style={muted}>Unnamed beer</span>}</div>
                              <Flags k={k} />
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>
                              {[k.beer_style, k.abv != null ? `${k.abv}%` : null].filter(Boolean).join(' · ') || <span style={muted}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {k.size_litres != null ? `${fmtL(Number(k.size_litres))} L` : '—'}
                              {k.coupler ? <span style={{ ...muted, fontSize: 12 }}> · {k.coupler}</span> : null}
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>{k.qty}×</td>
                            <td onClick={e => e.stopPropagation()}>
                              <DestCell k={k} venues={venues} onDest={d => setDestination(k, d)} onVenue={v => patch(k.id, { destination_venue: v })} />
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <StatusPill value={k.status} onChange={s => setStatus(k, s)} />
                            </td>
                            <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                              {k.qty > 1 && (
                                <button className="btn-outline" onClick={() => openSplit(k)} style={{ height: 30, padding: '0 11px', fontSize: 12 }}>
                                  Split
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </GroupRows>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Phone cards ── */}
              <div className="keg-cards">
                {groups.map(([brewery, list]) => (
                  <div key={brewery}>
                    <GroupHead brewery={brewery} list={list} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {list.map(k => (
                        <div key={k.id} className="card" style={{ padding: 14, opacity: isDone(k.status) ? 0.6 : 1 }}>
                          <button onClick={() => openEdit(k)} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{k.beer_name || 'Unnamed beer'}</span>
                              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{k.qty}×</span>
                            </div>
                            <div style={{ ...muted, fontSize: 13, marginTop: 3 }}>
                              {[k.beer_style, k.abv != null ? `${k.abv}%` : null, k.size_litres != null ? `${fmtL(Number(k.size_litres))} L` : null, k.coupler].filter(Boolean).join(' · ') || 'No details yet'}
                            </div>
                            <Flags k={k} />
                          </button>
                          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <DestCell k={k} venues={venues} onDest={d => setDestination(k, d)} onVenue={v => patch(k.id, { destination_venue: v })} />
                            <StatusPill value={k.status} onChange={s => setStatus(k, s)} />
                            {k.qty > 1 && (
                              <button className="btn-outline" onClick={() => openSplit(k)} style={{ height: 38, padding: '0 14px', fontSize: 13, marginLeft: 'auto' }}>
                                Split
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Add / edit modal ── */}
      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? 'Edit donation' : 'Add donation'}>
          <datalist id="keg-breweries">{breweries.map(b => <option key={b} value={b} />)}</datalist>
          <datalist id="keg-styles">{styles.map(s => <option key={s} value={s} />)}</datalist>
          <datalist id="keg-venues">{venues.map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="keg-sizes">{['20', '30', '50'].map(s => <option key={s} value={s} />)}</datalist>

          <Field label="Brewery">
            <input className="input" list="keg-breweries" value={editing.brewery} onChange={e => setBrewery(e.target.value)} placeholder="e.g. Heart of Darkness" autoFocus={!editing.id} />
          </Field>

          <div className="keg-grid-3">
            <Field label="Contact">
              <input className="input" value={editing.contact_name || ''} onChange={e => setEditing(f => f && { ...f, contact_name: e.target.value })} />
            </Field>
            <Field label="Phone / Zalo">
              <input className="input" type="tel" value={editing.contact_phone || ''} onChange={e => setEditing(f => f && { ...f, contact_phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={editing.contact_email || ''} onChange={e => setEditing(f => f && { ...f, contact_email: e.target.value })} />
            </Field>
          </div>

          <div className="keg-grid-2">
            <Field label="Beer">
              <input className="input" value={editing.beer_name || ''} onChange={e => setEditing(f => f && { ...f, beer_name: e.target.value })} placeholder="e.g. Kurtz’s Insane IPA" />
            </Field>
            <Field label="Style">
              <input className="input" list="keg-styles" value={editing.beer_style || ''} onChange={e => setEditing(f => f && { ...f, beer_style: e.target.value })} placeholder="e.g. Hazy IPA" />
            </Field>
          </div>

          <div className="keg-grid-4">
            <Field label="ABV %">
              <input className="input" inputMode="decimal" value={editing.abv} onChange={e => setEditing(f => f && { ...f, abv: e.target.value })} />
            </Field>
            <Field label="Size (L)">
              <input className="input" inputMode="decimal" list="keg-sizes" value={editing.size_litres} onChange={e => setEditing(f => f && { ...f, size_litres: e.target.value })} />
            </Field>
            <Field label="Coupler">
              <select className="input" value={editing.coupler || ''} onChange={e => setEditing(f => f && { ...f, coupler: e.target.value })}>
                <option value="">—</option>
                {COUPLERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Qty">
              <input className="input" inputMode="numeric" value={editing.qty} onChange={e => setEditing(f => f && { ...f, qty: e.target.value.replace(/[^0-9]/g, '') })} />
            </Field>
          </div>

          <Field label="Destination">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DESTS.map(d => {
                const on = editing.destination === d.key
                return (
                  <button
                    key={d.key}
                    onClick={() => setEditing(f => f && { ...f, destination: d.key })}
                    style={{
                      padding: '8px 14px', borderRadius: 100, fontSize: 13, cursor: 'pointer', border: '1px solid',
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      background: on ? 'var(--accent-light)' : 'transparent',
                      color: on ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: on ? 600 : 400, transition: 'all .15s',
                    }}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </Field>

          {editing.destination === 'ale_trail' && (
            <Field label="Ale Trail bar">
              <input className="input" list="keg-venues" value={editing.destination_venue || ''} onChange={e => setEditing(f => f && { ...f, destination_venue: e.target.value })} placeholder="Which bar is it going to?" />
            </Field>
          )}

          <div className="keg-grid-2">
            <Field label="Status">
              <select className="input" value={editing.status} onChange={e => setEditing(f => f && withStatusDates(f, e.target.value as Status))}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="After the event">
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '6px 13px', borderRadius: 9, cursor: 'pointer',
                border: '1px solid', borderColor: editing.returnable ? 'var(--accent)' : 'var(--border)',
                background: editing.returnable ? 'var(--accent-light)' : 'transparent', fontSize: 14, color: 'var(--text)',
              }}>
                <input type="checkbox" checked={editing.returnable} onChange={e => setEditing(f => f && { ...f, returnable: e.target.checked })} />
                Keg goes back to brewery
              </label>
            </Field>
          </div>

          <div className="keg-grid-3">
            <Field label="Received">
              <input className="input" type="date" value={editing.received_at || ''} onChange={e => setEditing(f => f && { ...f, received_at: e.target.value || null })} />
            </Field>
            <Field label="Delivered">
              <input className="input" type="date" value={editing.delivered_at || ''} onChange={e => setEditing(f => f && { ...f, delivered_at: e.target.value || null })} />
            </Field>
            <Field label="Returned">
              <input className="input" type="date" value={editing.returned_at || ''} onChange={e => setEditing(f => f && { ...f, returned_at: e.target.value || null })} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea className="input" rows={2} value={editing.notes || ''} onChange={e => setEditing(f => f && { ...f, notes: e.target.value })} />
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button className="btn-accent" onClick={saveDraft} disabled={saving} style={{ flex: 1 }}>
              {saving ? 'Saving…' : editing.id ? 'Save' : 'Add donation'}
            </button>
            {editing.id && (
              confirmDelete
                ? <button className="btn-red" onClick={deleteDraft} disabled={saving}>Confirm delete</button>
                : <button className="btn-outline" onClick={() => setConfirmDelete(true)} disabled={saving}>Delete</button>
            )}
          </div>
        </Modal>
      )}

      {/* ── Split modal ── */}
      {splitting && (
        <Modal onClose={() => setSplitting(null)} title="Split this line" narrow>
          <p style={{ ...muted, fontSize: 13, lineHeight: 1.6, margin: '0 0 18px' }}>
            {splitting.brewery} · {splitting.beer_name || 'Unnamed beer'} · <b style={{ color: 'var(--text)' }}>{splitting.qty}×</b> to {DEST_LABEL[splitting.destination]}.
            Move some of these to a different destination.
          </p>
          <div className="keg-grid-2">
            <Field label={`Kegs to move (1–${splitting.qty - 1})`}>
              <input className="input" inputMode="numeric" value={splitQty} onChange={e => setSplitQty(e.target.value.replace(/[^0-9]/g, ''))} autoFocus />
            </Field>
            <Field label="Send them to">
              <select className="input" value={splitDest} onChange={e => setSplitDest(e.target.value as Destination)}>
                {DESTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </Field>
          </div>
          {splitDest === 'ale_trail' && (
            <Field label="Ale Trail bar">
              <input className="input" list="keg-venues-split" value={splitVenue} onChange={e => setSplitVenue(e.target.value)} placeholder="Which bar?" />
              <datalist id="keg-venues-split">{venues.map(v => <option key={v} value={v} />)}</datalist>
            </Field>
          )}
          <button className="btn-accent" onClick={doSplit} disabled={saving} style={{ width: '100%', marginTop: 4 }}>
            {saving ? 'Splitting…' : 'Split'}
          </button>
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ── pieces ──

function groupSummary(list: Keg[]) {
  const n = list.reduce((s, k) => s + (k.qty || 0), 0)
  const l = list.reduce((s, k) => s + litres(k), 0)
  const c = list.find(k => k.contact_name || k.contact_phone)
  return { n, l, contact: c ? [c.contact_name, c.contact_phone].filter(Boolean).join(' · ') : '' }
}

function GroupRows({ brewery, list, children }: { brewery: string; list: Keg[]; children: React.ReactNode }) {
  const s = groupSummary(list)
  return (
    <>
      <tr className="keg-group">
        <td colSpan={7}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{brewery}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 10 }}>
            {s.n} {s.n === 1 ? 'keg' : 'kegs'}{s.l ? ` · ${fmtL(s.l)} L` : ''}{s.contact ? ` · ${s.contact}` : ''}
          </span>
        </td>
      </tr>
      {children}
    </>
  )
}

function GroupHead({ brewery, list }: { brewery: string; list: Keg[] }) {
  const s = groupSummary(list)
  return (
    <div style={{ padding: '18px 2px 8px' }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>{brewery}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
        {s.n} {s.n === 1 ? 'keg' : 'kegs'}{s.l ? ` · ${fmtL(s.l)} L` : ''}{s.contact ? ` · ${s.contact}` : ''}
      </div>
    </div>
  )
}

function Flags({ k }: { k: Keg }) {
  if (!k.returnable) return null
  const due = k.status === 'empty'
  return (
    <span style={{
      display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600, letterSpacing: '.03em',
      color: due ? 'var(--badge-orange-text)' : 'var(--text-muted)',
    }}>
      {due ? 'Return to brewery' : k.status === 'returned' ? 'Returned to brewery' : 'Goes back to brewery'}
    </span>
  )
}

function Pill({ value, options, tone, onChange, label }: {
  value: string
  options: { value: string; label: string }[]
  tone: { bg: string; bd: string; fg: string }
  onChange: (v: string) => void
  label: string
}) {
  return (
    <span className="keg-pill-wrap" style={{ color: tone.fg }}>
      <select
        className="keg-pill"
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: tone.bg, borderColor: tone.bd, color: tone.fg }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  )
}

function StatusPill({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <Pill
      label="Status"
      value={value}
      tone={statusTone(value)}
      options={STATUSES.map(s => ({ value: s, label: STATUS_LABEL[s] }))}
      onChange={v => onChange(v as Status)}
    />
  )
}

function DestCell({ k, venues, onDest, onVenue }: { k: Keg; venues: string[]; onDest: (d: Destination) => void; onVenue: (v: string | null) => void }) {
  const [venue, setVenue] = useState(k.destination_venue || '')
  useEffect(() => { setVenue(k.destination_venue || '') }, [k.destination_venue])
  const listId = `keg-v-${k.id}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <Pill
        label="Destination"
        value={k.destination}
        tone={destTone(k.destination)}
        options={DESTS.map(d => ({ value: d.key, label: d.label }))}
        onChange={v => onDest(v as Destination)}
      />
      {k.destination === 'ale_trail' && (
        <>
          <input
            className="input keg-venue"
            list={listId}
            value={venue}
            placeholder="Which bar?"
            onChange={e => setVenue(e.target.value)}
            onBlur={() => { const v = venue.trim() || null; if (v !== (k.destination_venue || null)) onVenue(v) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
          <datalist id={listId}>{venues.map(v => <option key={v} value={v} />)}</datalist>
        </>
      )}
    </div>
  )
}

function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: React.ReactNode; narrow?: boolean }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.01em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
