'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Choice, Field, Modal, Pill, StatCard, fmtL, todayKey, type Tone } from '@/components/brewasia/ui'

// BrewAsia keg tracker. Every keg we have: who it's from (donated or bought),
// how many, where it's going (Conference, Ale Trail bars, Collab Fest, or sold)
// and where it is now. One row = one beer from one brewery (use qty). Adding
// takes several beers from the same brewery at once. A row can be split so part
// of it goes somewhere else.

type Destination = 'unassigned' | 'conference' | 'ale_trail' | 'collab_fest' | 'sold'
type Source = 'donated' | 'purchased'
type Status = 'promised' | 'received' | 'allocated' | 'delivered' | 'tapped' | 'empty' | 'returned'

type Keg = {
  id: string
  created_at?: string
  source: Source
  brewery: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  beer_name: string | null
  beer_style: string | null
  abv: number | null
  ibu?: number | null
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
  producer_id?: string | null
  from_form?: boolean
}

// A brewery that has (or can get) its own donation form link.
type FormProducer = {
  id: string
  name: string
  kind: string
  form_token: string | null
  form_sent_at: string | null
  form_submitted_at: string | null
}

// One beer inside the add/edit form.
type Line = {
  key: string
  beer_name: string
  beer_style: string
  abv: string
  ibu: string
  size_litres: string
  coupler: string
  qty: string
  destination: Destination
  destination_venue: string
}

// The form: brewery-level fields shared by every line, plus the lines. Each line
// has its own destination, so two of the same beer can go to different places.
// Editing an existing row is the same form with exactly one line.
type Draft = {
  id?: string
  source: Source
  brewery: string
  contact_name: string
  contact_phone: string
  contact_email: string
  status: Status
  returnable: boolean
  received_at: string | null
  delivered_at: string | null
  returned_at: string | null
  notes: string
  lines: Line[]
}

// Each destination has its own colour (tokens in globals.css) so a brewery's
// kegs read at a glance: blue to Conference, teal to Ale Trail, violet to
// Collab Fest, rose sold. Unassigned stays grey: not decided yet.
const DESTS: { key: Destination; label: string; tone: Tone }[] = [
  { key: 'conference', label: 'Conference', tone: { fg: 'var(--dest-conf)', bg: 'var(--dest-conf-bg)', bd: 'var(--dest-conf-bd)' } },
  { key: 'ale_trail', label: 'Ale Trail', tone: { fg: 'var(--dest-trail)', bg: 'var(--dest-trail-bg)', bd: 'var(--dest-trail-bd)' } },
  { key: 'collab_fest', label: 'Collab Fest', tone: { fg: 'var(--dest-collab)', bg: 'var(--dest-collab-bg)', bd: 'var(--dest-collab-bd)' } },
  { key: 'sold', label: 'Sold', tone: { fg: 'var(--dest-sold)', bg: 'var(--dest-sold-bg)', bd: 'var(--dest-sold-bd)' } },
  { key: 'unassigned', label: 'Unassigned', tone: { fg: 'var(--badge-gray-text)', bg: 'var(--badge-gray-bg)', bd: 'var(--badge-gray-border)' } },
]
// Ale Trail kegs go to a named bar; sold kegs go to a named buyer.
const needsVenue = (d: Destination) => d === 'ale_trail' || d === 'sold'
const venueLabel = (d: Destination) => (d === 'sold' ? 'Buyer' : 'Ale Trail bar')
const venueHint = (d: Destination) => (d === 'sold' ? 'Who bought them?' : 'Which bar?')
const SOURCES: { key: Source; label: string }[] = [
  { key: 'donated', label: 'Donated' },
  { key: 'purchased', label: 'Purchased' },
]
const DEST_LABEL = Object.fromEntries(DESTS.map(d => [d.key, d.label])) as Record<Destination, string>

const STATUSES: Status[] = ['promised', 'received', 'allocated', 'delivered', 'tapped', 'empty', 'returned']
const STATUS_LABEL: Record<Status, string> = {
  promised: 'Promised', received: 'Received', allocated: 'Allocated', delivered: 'Delivered',
  tapped: 'Tapped', empty: 'Empty', returned: 'Returned',
}

// Status stays quiet so it doesn't fight the destination colour: a neutral pill
// with a small dot. Grey = not here / done, orange = in our cold room,
// green = out at the destination.
function statusDot(s: Status) {
  if (s === 'received' || s === 'allocated') return 'var(--accent)'
  if (s === 'delivered' || s === 'tapped') return 'var(--cal-booked-text)'
  return 'var(--text-muted)'
}
const destTone = (d: Destination): Tone => (DESTS.find(x => x.key === d) || DESTS[DESTS.length - 1]).tone

const COUPLERS = ['S', 'D', 'A', 'G', 'U']
const isDone = (s: Status) => s === 'empty' || s === 'returned'

// What the keg scanner (Gemini) sends back: kegs grouped by brewery.
type ScanLine = {
  beer_name: string | null; beer_style: string | null; abv: number | null; ibu?: number | null; size_litres: number | null
  coupler: string | null; qty: number; destination: Destination; destination_venue: string | null
}
type ScanGroup = {
  brewery: string | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null
  source: Source | null; lines: ScanLine[]
}

const SCAN_TYPES = /^(image\/|application\/pdf$)/

// Shrink big screenshots before upload (phones and retina screens make 5–10 MB images;
// the server takes ~4 MB). Keeps text readable at 2000px on the long side.
async function fileToPayload(file: File): Promise<{ data: string; mimeType: string }> {
  const asDataUrl = (blob: Blob) => new Promise<string>((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob)
  })
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return { data: await asDataUrl(file), mimeType: file.type }
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    URL.revokeObjectURL(url)
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight))
    if (scale === 1 && file.size < 1_500_000) return { data: await asDataUrl(file), mimeType: file.type }
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
    const ctx = c.getContext('2d')
    if (!ctx) return { data: await asDataUrl(file), mimeType: file.type }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return { data: c.toDataURL('image/jpeg', 0.88), mimeType: 'image/jpeg' }
  } catch {
    return { data: await asDataUrl(file), mimeType: file.type }
  }
}

// "Heart of Darkness Brewery" and "heart of darkness" are the same brewery.
const breweryKey = (v: string) => v.toLowerCase().replace(/\b(brewery|brewing|brewers?|beer|craft|company|co|ltd)\b/g, '').replace(/[^a-z0-9]/g, '')

let lineSeq = 0
// A new line copies size, coupler and destination from the one above: one
// brewery's kegs are usually the same kind.
const blankLine = (prev?: Line): Line => ({
  key: `l${++lineSeq}`, beer_name: '', beer_style: '', abv: '', ibu: '',
  size_litres: prev?.size_litres || '', coupler: prev?.coupler || '', qty: '1',
  destination: prev?.destination || 'unassigned', destination_venue: prev?.destination_venue || '',
})

const blankDraft = (): Draft => ({
  source: 'donated', brewery: '', contact_name: '', contact_phone: '', contact_email: '',
  status: 'promised', returnable: false,
  received_at: null, delivered_at: null, returned_at: null, notes: '',
  lines: [blankLine()],
})

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

  // Brewery donation form links
  const [producers, setProducers] = useState<FormProducer[]>([])

  // Screenshot scanning
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [scanQueue, setScanQueue] = useState<ScanGroup[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data, error }, { data: pr }] = await Promise.all([
      supabase.from('brewasia_kegs').select('*').order('brewery', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('brewasia_producers').select('id, name, kind, form_token, form_sent_at, form_submitted_at').order('name'),
    ])
    setLoading(false)
    if (error) { setLoadError(error.message); return }
    setLoadError('')
    setKegs((data || []) as Keg[])
    setProducers((pr || []) as FormProducer[])
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600) }

  // ── derived ──
  const breweries = useMemo(
    () => Array.from(new Set(kegs.map(k => k.brewery.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [kegs],
  )
  // Names already used, per destination: bars for Ale Trail, buyers for Sold.
  const venuesBy = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const k of kegs) {
      const v = (k.destination_venue || '').trim()
      if (!v) continue
      ;(m[k.destination] ||= new Set()).add(v)
    }
    return Object.fromEntries(Object.entries(m).map(([d, set]) => [d, Array.from(set).sort((a, b) => a.localeCompare(b))])) as Record<string, string[]>
  }, [kegs])
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

  const allTotals = useMemo(() => ({
    kegs: kegs.reduce((n, k) => n + (k.qty || 0), 0),
    litres: kegs.reduce((n, k) => n + litres(k), 0),
    promised: kegs.filter(k => k.status === 'promised').reduce((n, k) => n + (k.qty || 0), 0),
  }), [kegs])

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
        const hay = [k.brewery, k.beer_name, k.beer_style, k.destination_venue, k.contact_name, k.notes, k.source].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [kegs, q, fBrewery, fDest, fStatus])

  const groups = useMemo(() => {
    const m = new Map<string, Keg[]>()
    const sorted = [...filtered].sort((a, b) =>
      a.brewery.trim().localeCompare(b.brewery.trim(), undefined, { sensitivity: 'base' })
      || (a.beer_name || '').localeCompare(b.beer_name || '', undefined, { sensitivity: 'base' })
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
    patch(k.id, { destination, destination_venue: needsVenue(destination) && destination === k.destination ? k.destination_venue : null })
  }

  function closeEditor() {
    setEditing(null)
    setScanQueue([])
    setScanNote(null)
  }

  // Match a scanned brewery name to one we already have, so it doesn't get a second spelling.
  function knownBrewery(name: string) {
    const k = breweryKey(name)
    if (!k) return null
    return kegs.find(x => {
      const xk = breweryKey(x.brewery)
      return xk === k || (k.length >= 4 && xk.length >= 4 && (xk.includes(k) || k.includes(xk)))
    }) || null
  }

  // Put one scanned brewery into the form: fills empty brewery-level fields, and replaces
  // the blank starter line (or adds after lines the person already typed).
  function applyGroup(base: Draft, g: ScanGroup): Draft {
    const known = g.brewery ? knownBrewery(g.brewery) : null
    const d: Draft = { ...base }
    if (!d.brewery.trim()) d.brewery = known?.brewery || g.brewery || ''
    d.contact_name = d.contact_name || g.contact_name || known?.contact_name || ''
    d.contact_phone = d.contact_phone || g.contact_phone || known?.contact_phone || ''
    d.contact_email = d.contact_email || g.contact_email || known?.contact_email || ''
    if (g.source) d.source = g.source
    else if (known?.source) d.source = known.source
    if (known && !d.returnable) d.returnable = known.returnable
    const scanned: Line[] = g.lines.map(l => ({
      key: `l${++lineSeq}`,
      beer_name: l.beer_name || '', beer_style: l.beer_style || '',
      abv: l.abv == null ? '' : String(l.abv),
      ibu: l.ibu == null ? '' : String(l.ibu),
      size_litres: l.size_litres == null ? '' : String(l.size_litres),
      coupler: l.coupler || '', qty: String(l.qty || 1),
      destination: l.destination || 'unassigned', destination_venue: l.destination_venue || '',
    }))
    const isBlank = (l: Line) => !l.beer_name.trim() && !l.beer_style.trim() && !l.abv.trim()
    const kept = d.lines.filter(l => !isBlank(l))
    d.lines = scanned.length ? [...kept, ...scanned] : d.lines
    return d
  }

  async function scan(files: File[], text = '') {
    const usable = files.filter(f => SCAN_TYPES.test(f.type)).slice(0, 6)
    if (!usable.length && !text.trim()) {
      setScanNote({ tone: 'err', text: 'That isn’t an image. Drop a screenshot, a photo or a PDF.' })
      return
    }
    if (!editing) { setConfirmDelete(false); setEditing(blankDraft()) }
    setScanning(true)
    setScanNote(null)
    try {
      const images = await Promise.all(usable.map(fileToPayload))
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/admin/ops/keg-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ images, text }),
      })
      const j = await resp.json().catch(() => ({}))
      if (!resp.ok || !j.ok) {
        setScanNote({ tone: 'err', text: j.error || 'Couldn’t read that. Try a clearer screenshot.' })
        return
      }
      const groups: ScanGroup[] = j.groups || []
      if (!groups.length) {
        setScanNote({ tone: 'err', text: 'No kegs found in that. Try a closer screenshot of the list.' })
        return
      }
      const [first, ...rest] = groups
      setEditing(f => applyGroup(f && !f.id ? f : blankDraft(), first))
      setScanQueue(rest)
      const n = first.lines.length
      setScanNote({
        tone: 'ok',
        text: `Filled ${n} ${n === 1 ? 'line' : 'lines'}${first.brewery ? ` from ${knownBrewery(first.brewery)?.brewery || first.brewery}` : ''}. Check them, set where each is going, then add.`
          + (rest.length ? ` ${rest.length} more ${rest.length === 1 ? 'brewery' : 'breweries'} will open next: ${rest.map(g => g.brewery || 'unknown').join(', ')}.` : ''),
      })
    } catch (e: any) {
      setScanNote({ tone: 'err', text: 'Couldn’t read that: ' + (e?.message || e) })
    } finally {
      setScanning(false)
    }
  }

  // Drag and drop: anywhere on the page or the Add kegs box.
  function hasDropContent(e: React.DragEvent) {
    const t = Array.from(e.dataTransfer?.types || [])
    return t.includes('Files') || t.includes('text/plain')
  }
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => { if (!hasDropContent(e) || editing?.id || splitting) return; e.preventDefault(); setDragging(true) },
    onDragOver: (e: React.DragEvent) => { if (!hasDropContent(e) || editing?.id || splitting) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDragLeave: (e: React.DragEvent) => { if (e.relatedTarget && (e.currentTarget as Node).contains(e.relatedTarget as Node)) return; setDragging(false) },
    onDrop: (e: React.DragEvent) => {
      if (editing?.id || splitting) return
      e.preventDefault()
      setDragging(false)
      const files = Array.from(e.dataTransfer.files || [])
      const text = files.length ? '' : e.dataTransfer.getData('text/plain')
      if (files.length || text.trim()) scan(files, text)
    },
  }

  // Paste a screenshot (⌘V / Ctrl+V) while the Add kegs box is open.
  useEffect(() => {
    if (!editing || editing.id) return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter(f => SCAN_TYPES.test(f.type))
      if (!files.length) return
      e.preventDefault()
      scan(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  function openNew(from?: Keg) {
    setConfirmDelete(false)
    setScanNote(null)
    setScanQueue([])
    const d = blankDraft()
    if (from) {
      d.source = from.source || 'donated'
      d.brewery = from.brewery
      d.contact_name = from.contact_name || ''
      d.contact_phone = from.contact_phone || ''
      d.contact_email = from.contact_email || ''
      d.returnable = from.returnable
    } else if (fBrewery) {
      d.brewery = fBrewery
    }
    setEditing(d)
  }

  function openEdit(k: Keg) {
    setConfirmDelete(false)
    setEditing({
      id: k.id,
      source: k.source || 'donated',
      brewery: k.brewery,
      contact_name: k.contact_name || '', contact_phone: k.contact_phone || '', contact_email: k.contact_email || '',
      status: k.status, returnable: k.returnable,
      received_at: k.received_at, delivered_at: k.delivered_at, returned_at: k.returned_at,
      notes: k.notes || '',
      lines: [{
        key: `l${++lineSeq}`,
        beer_name: k.beer_name || '', beer_style: k.beer_style || '', coupler: k.coupler || '',
        abv: k.abv == null ? '' : String(k.abv),
        ibu: k.ibu == null ? '' : String(k.ibu),
        size_litres: k.size_litres == null ? '' : String(k.size_litres),
        qty: String(k.qty ?? 1),
        destination: k.destination, destination_venue: k.destination_venue || '',
      }],
    })
  }

  // Picking a brewery we already have fills in its details if still empty.
  function setBrewery(name: string) {
    setEditing(f => {
      if (!f) return f
      const known = kegs.find(k => k.brewery.trim().toLowerCase() === name.trim().toLowerCase())
      if (!known || f.id) return { ...f, brewery: name }
      return {
        ...f, brewery: name,
        source: known.source || f.source,
        contact_name: f.contact_name || known.contact_name || '',
        contact_phone: f.contact_phone || known.contact_phone || '',
        contact_email: f.contact_email || known.contact_email || '',
        returnable: f.returnable || known.returnable,
      }
    })
  }

  function updateLine(key: string, changes: Partial<Line>) {
    setEditing(f => f && { ...f, lines: f.lines.map(l => (l.key === key ? { ...l, ...changes } : l)) })
  }
  function addLine() {
    setEditing(f => f && { ...f, lines: [...f.lines, blankLine(f.lines[f.lines.length - 1])] })
  }
  // Same beer, different place: copy the line, then change where the copy goes.
  function duplicateLine(key: string) {
    setEditing(f => {
      if (!f) return f
      const i = f.lines.findIndex(l => l.key === key)
      if (i < 0) return f
      const copy = { ...f.lines[i], key: `l${++lineSeq}`, qty: '1', destination: 'unassigned' as Destination, destination_venue: '' }
      return { ...f, lines: [...f.lines.slice(0, i + 1), copy, ...f.lines.slice(i + 1)] }
    })
  }
  function removeLine(key: string) {
    setEditing(f => (f && f.lines.length > 1 ? { ...f, lines: f.lines.filter(l => l.key !== key) } : f))
  }

  async function saveDraft() {
    if (!editing) return
    const brewery = editing.brewery.trim()
    if (!brewery) return showToast('Brewery is required.')
    const num = (v: string) => (v.trim() === '' || isNaN(Number(v)) ? null : Number(v))
    const shared = {
      source: editing.source,
      brewery,
      contact_name: txt(editing.contact_name),
      contact_phone: txt(editing.contact_phone),
      contact_email: txt(editing.contact_email),
      status: editing.status,
      returnable: !!editing.returnable,
      received_at: editing.received_at || null,
      delivered_at: editing.delivered_at || null,
      returned_at: editing.returned_at || null,
      notes: txt(editing.notes),
    }
    const rows = editing.lines.map(l => ({
      ...shared,
      beer_name: txt(l.beer_name),
      beer_style: txt(l.beer_style),
      abv: num(l.abv),
      ibu: l.ibu.trim() === '' || isNaN(Number(l.ibu)) ? null : Math.round(Number(l.ibu)),
      size_litres: num(l.size_litres),
      coupler: txt(l.coupler),
      qty: Math.max(1, Math.floor(Number(l.qty) || 0)),
      destination: l.destination,
      destination_venue: needsVenue(l.destination) ? txt(l.destination_venue) : null,
    }))
    setSaving(true)
    if (editing.id) {
      const res = await supabase.from('brewasia_kegs').update(rows[0]).eq('id', editing.id).select().single()
      setSaving(false)
      if (res.error || !res.data) return showToast('Could not save. Try again.')
      const row = res.data as Keg
      setKegs(p => p.map(k => (k.id === row.id ? row : k)))
      closeEditor()
      return showToast('Saved')
    }
    const res = await supabase.from('brewasia_kegs').insert(rows).select()
    setSaving(false)
    if (res.error || !res.data) return showToast('Could not save. Try again.')
    const added = res.data as Keg[]
    setKegs(p => [...p, ...added])
    const n = added.reduce((t, k) => t + (k.qty || 0), 0)
    if (scanQueue.length) {
      const [next, ...rest] = scanQueue
      setScanQueue(rest)
      setEditing(applyGroup(blankDraft(), next))
      setScanNote({ tone: 'ok', text: `Next from your screenshot: ${next.brewery || 'unknown brewery'}${rest.length ? ` (${rest.length} more after this)` : ''}. Check, then add.` })
      return showToast(`${n} ${n === 1 ? 'keg' : 'kegs'} added`)
    }
    closeEditor()
    showToast(`${n} ${n === 1 ? 'keg' : 'kegs'} added`)
  }

  async function deleteDraft() {
    if (!editing?.id) return
    setSaving(true)
    const { error } = await supabase.from('brewasia_kegs').delete().eq('id', editing.id)
    setSaving(false)
    if (error) return showToast('Could not delete. Try again.')
    setKegs(p => p.filter(k => k.id !== editing.id))
    closeEditor()
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
      .insert({ ...rest, qty: n, destination: splitDest, destination_venue: needsVenue(splitDest) ? txt(splitVenue) : null })
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
      ['Brewery', k => k.brewery], ['Source', k => (k.source === 'purchased' ? 'Purchased' : 'Donated')], ['Contact', k => k.contact_name], ['Phone', k => k.contact_phone], ['Email', k => k.contact_email],
      ['Beer', k => k.beer_name], ['Style', k => k.beer_style], ['ABV %', k => k.abv], ['IBU', k => k.ibu], ['Size (L)', k => k.size_litres],
      ['Coupler', k => k.coupler], ['Qty', k => k.qty], ['Total litres', k => litres(k) || ''],
      ['Destination', k => DEST_LABEL[k.destination]], ['Bar / buyer', k => k.destination_venue],
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
    <div className="keg-wrap" {...(loadError ? {} : dropHandlers)}>
      {dragging && (
        <div className="keg-drop-overlay" aria-hidden>
          <div className="keg-drop-box">
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Drop to fill in kegs</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Screenshot, photo, PDF or text</div>
          </div>
        </div>
      )}
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">BrewAsia kegs</div>
          <p style={{ ...muted, fontSize: 13, margin: '6px 0 0', maxWidth: 520, lineHeight: 1.55 }}>
            Every keg we have: who it’s from, how many, where it’s going, and where it is now.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={exportCsv} disabled={!filtered.length} style={{ fontSize: 13 }}>
            Export CSV{anyFilter && filtered.length ? ` (${filtered.length})` : ''}
          </button>
          <button className="btn-accent" onClick={() => openNew()} disabled={!!loadError}>Add kegs</button>
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
          {/* ── Summary strip: All, then one card per destination ── */}
          <div className="keg-strip" style={{ margin: '24px 0 10px' }}>
            <StatCard
              label="All kegs"
              kegs={allTotals.kegs}
              litres={allTotals.litres}
              sub={allTotals.promised > 0 ? `${allTotals.promised} still promised` : ''}
              active={fDest === ''}
              loading={loading}
              onClick={() => setFDest('')}
            />
            {DESTS.map(d => {
              const t = totals[d.key]
              const active = fDest === d.key
              return (
                <StatCard
                  key={d.key}
                  label={d.label}
                  tone={d.tone}
                  kegs={t.kegs}
                  litres={t.litres}
                  sub={t.promised > 0 ? `${t.promised} still promised` : ''}
                  todo={d.key === 'unassigned' && t.kegs > 0}
                  active={active}
                  loading={loading}
                  onClick={() => setFDest(active ? '' : d.key)}
                />
              )
            })}
          </div>

          <DonationForms producers={producers} kegs={kegs} onRefresh={load} />

          {returnsDue > 0 && (
            <button
              className="cal-chip"
              onClick={() => { setFStatus(fStatus === 'empty' ? '' : 'empty'); setFDest('') }}
              style={{ cursor: 'pointer', marginBottom: 4, borderRadius: 8 }}
            >
              <span className="cal-dot" style={{ background: 'var(--badge-orange-text)' }} />
              <b style={{ color: 'var(--badge-orange-text)' }}>{returnsDue}</b> empty {returnsDue === 1 ? 'keg' : 'kegs'} to return to breweries
            </button>
          )}

          {/* ── Filters ── */}
          <div className="keg-filters" style={{ margin: '14px 0 14px' }}>
            <input className="input" placeholder="Search beer, brewery, bar, buyer…" value={q} onChange={e => setQ(e.target.value)} />
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
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No kegs yet</div>
              <div style={{ ...muted, fontSize: 13, marginBottom: 16 }}>Add kegs as breweries promise, sell or deliver them.</div>
              <button className="btn-accent" onClick={() => openNew()}>Add kegs</button>
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
                      <th>Status</th>
                      <th>Destination</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([brewery, list]) => (
                      <GroupRows key={brewery} brewery={brewery} list={list}>
                        {list.map(k => (
                          <tr key={k.id} onClick={() => openEdit(k)} style={{ cursor: 'pointer', opacity: isDone(k.status) ? 0.6 : 1 }}>
                            <td style={{ boxShadow: `inset 4px 0 0 ${destTone(k.destination).fg}` }}>
                              <div style={{ fontWeight: 500 }}>{k.beer_name || <span style={muted}>Unnamed beer</span>}</div>
                              <Flags k={k} />
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>
                              {[k.beer_style, k.abv != null ? `${k.abv}%` : null, k.ibu != null ? `${k.ibu} IBU` : null].filter(Boolean).join(' · ') || <span style={muted}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {k.size_litres != null ? `${fmtL(Number(k.size_litres))} L` : '—'}
                              {k.coupler ? <span style={{ ...muted, fontSize: 12 }}> · {k.coupler}</span> : null}
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>{k.qty}×</td>
                            <td onClick={e => e.stopPropagation()}>
                              <StatusPill value={k.status} onChange={s => setStatus(k, s)} />
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <DestCell k={k} venues={venuesBy[k.destination] || []} onDest={d => setDestination(k, d)} onVenue={v => patch(k.id, { destination_venue: v })} />
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
                        <div key={k.id} className="card" style={{ padding: 14, opacity: isDone(k.status) ? 0.6 : 1, borderLeft: `4px solid ${destTone(k.destination).fg}` }}>
                          <button onClick={() => openEdit(k)} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{k.beer_name || 'Unnamed beer'}</span>
                              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{k.qty}×</span>
                            </div>
                            <div style={{ ...muted, fontSize: 13, marginTop: 3 }}>
                              {[k.beer_style, k.abv != null ? `${k.abv}%` : null, k.ibu != null ? `${k.ibu} IBU` : null, k.size_litres != null ? `${fmtL(Number(k.size_litres))} L` : null, k.coupler].filter(Boolean).join(' · ') || 'No details yet'}
                            </div>
                            <Flags k={k} />
                          </button>
                          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <StatusPill value={k.status} onChange={s => setStatus(k, s)} />
                            <DestCell k={k} venues={venuesBy[k.destination] || []} onDest={d => setDestination(k, d)} onVenue={v => patch(k.id, { destination_venue: v })} />
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
        <Modal onClose={closeEditor} title={editing.id ? 'Edit kegs' : 'Add kegs'}>
          <datalist id="keg-breweries">{breweries.map(b => <option key={b} value={b} />)}</datalist>
          <datalist id="keg-styles">{styles.map(st => <option key={st} value={st} />)}</datalist>
          <datalist id="keg-venues-ale_trail">{(venuesBy.ale_trail || []).map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="keg-venues-sold">{(venuesBy.sold || []).map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="keg-sizes">{['20', '30', '50'].map(sz => <option key={sz} value={sz} />)}</datalist>

          {!editing.id && (
            <ScanZone scanning={scanning} note={scanNote} onFiles={files => scan(files)} />
          )}

          <div className="keg-grid-2">
            <Field label="Brewery">
              <input className="input" list="keg-breweries" value={editing.brewery} onChange={e => setBrewery(e.target.value)} placeholder="e.g. Heart of Darkness" autoFocus={!editing.id} />
            </Field>
            <Field label="How we got them">
              <Choice options={SOURCES} value={editing.source} onChange={v => setEditing(f => f && { ...f, source: v })} />
            </Field>
          </div>

          <div className="keg-grid-3">
            <Field label="Contact">
              <input className="input" value={editing.contact_name} onChange={e => setEditing(f => f && { ...f, contact_name: e.target.value })} />
            </Field>
            <Field label="Phone / Zalo">
              <input className="input" type="tel" value={editing.contact_phone} onChange={e => setEditing(f => f && { ...f, contact_phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={editing.contact_email} onChange={e => setEditing(f => f && { ...f, contact_email: e.target.value })} />
            </Field>
          </div>

          <Field label="Status">
            <select className="input" value={editing.status} onChange={e => setEditing(f => f && withStatusDates(f, e.target.value as Status))}>
              {STATUSES.map(st => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
            </select>
          </Field>

          <div className="section-title" style={{ margin: '6px 0 10px' }}>
            {editing.id ? 'Keg' : 'Kegs'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {editing.lines.map((l, i) => (
              <div key={l.key} className="keg-line">
                {!editing.id && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                      {editing.lines.length > 1 ? `Line ${i + 1}` : 'Line'}
                    </span>
                    <span style={{ display: 'flex', gap: 14 }}>
                      <button className="keg-link" onClick={() => duplicateLine(l.key)} title="Same beer going somewhere else">Same beer, other place</button>
                      {editing.lines.length > 1 && (
                        <button className="keg-link" onClick={() => removeLine(l.key)} aria-label={`Remove line ${i + 1}`}>Remove</button>
                      )}
                    </span>
                  </div>
                )}
                <div className="keg-grid-2">
                  <Field label="Beer">
                    <input className="input" value={l.beer_name} onChange={e => updateLine(l.key, { beer_name: e.target.value })} placeholder="e.g. Kurtz’s Insane IPA" />
                  </Field>
                  <Field label="Style">
                    <input className="input" list="keg-styles" value={l.beer_style} onChange={e => updateLine(l.key, { beer_style: e.target.value })} placeholder="e.g. Hazy IPA" />
                  </Field>
                </div>
                <div className="keg-grid-4">
                  <Field label="ABV %">
                    <input className="input" inputMode="decimal" value={l.abv} onChange={e => updateLine(l.key, { abv: e.target.value })} />
                  </Field>
                  <Field label="IBU">
                    <input className="input" inputMode="numeric" value={l.ibu} onChange={e => updateLine(l.key, { ibu: e.target.value.replace(/[^0-9]/g, '') })} />
                  </Field>
                  <Field label="Size (L)">
                    <input className="input" inputMode="decimal" list="keg-sizes" value={l.size_litres} onChange={e => updateLine(l.key, { size_litres: e.target.value })} />
                  </Field>
                  <Field label="Coupler">
                    <select className="input" value={l.coupler} onChange={e => updateLine(l.key, { coupler: e.target.value })}>
                      <option value="">—</option>
                      {COUPLERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="keg-grid-4">
                  <Field label="Qty">
                    <input className="input" inputMode="numeric" value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value.replace(/[^0-9]/g, '') })} />
                  </Field>
                </div>
                <div className={needsVenue(l.destination) ? 'keg-grid-2' : undefined}>
                  <Field label="Going to" last>
                    <select
                      className="input"
                      value={l.destination}
                      onChange={e => { const d = e.target.value as Destination; updateLine(l.key, { destination: d, destination_venue: needsVenue(d) ? l.destination_venue : '' }) }}
                      style={{ borderLeft: `4px solid ${destTone(l.destination).fg}`, fontWeight: 600, color: l.destination === 'unassigned' ? 'var(--text-secondary)' : destTone(l.destination).fg }}
                    >
                      {DESTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  </Field>
                  {needsVenue(l.destination) && (
                    <Field label={venueLabel(l.destination)} last>
                      <input className="input" list={`keg-venues-${l.destination}`} value={l.destination_venue} onChange={e => updateLine(l.key, { destination_venue: e.target.value })} placeholder={venueHint(l.destination)} />
                    </Field>
                  )}
                </div>
              </div>
            ))}
            {editing.id ? (
              <button onClick={() => { const k = kegs.find(x => x.id === editing.id); if (k) openNew(k) }} className="keg-add-line">
                + Add more kegs from {editing.brewery || 'this brewery'}
              </button>
            ) : (
              <button onClick={addLine} className="keg-add-line">+ Add another line</button>
            )}
          </div>

          <div className="keg-grid-2">
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

          {editing.id && (
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
          )}

          <Field label="Notes">
            <textarea className="input" rows={2} value={editing.notes} onChange={e => setEditing(f => f && { ...f, notes: e.target.value })} />
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button className="btn-accent" onClick={saveDraft} disabled={saving} style={{ flex: 1 }}>
              {saving ? 'Saving…' : editing.id ? 'Save' : addLabel(editing.lines)}
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
            Send some of them somewhere else. They become their own line with their own colour.
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
          {needsVenue(splitDest) && (
            <Field label={venueLabel(splitDest)}>
              <input className="input" list="keg-venues-split" value={splitVenue} onChange={e => setSplitVenue(e.target.value)} placeholder={venueHint(splitDest)} />
              <datalist id="keg-venues-split">{(venuesBy[splitDest] || []).map(v => <option key={v} value={v} />)}</datalist>
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
  const byDest = DESTS
    .map(d => ({ ...d, n: list.filter(k => k.destination === d.key).reduce((s, k) => s + (k.qty || 0), 0) }))
    .filter(d => d.n > 0)
  return { n, l, byDest, contact: c ? [c.contact_name, c.contact_phone].filter(Boolean).join(' · ') : '' }
}

// "2 Conference · 1 Collab Fest", each with its colour dot.
function DestBreakdown({ items }: { items: { key: string; label: string; tone: Tone; n: number }[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', verticalAlign: 'middle' }}>
      {items.map(d => (
        <span key={d.key} className="keg-dest-chip" style={{ color: d.tone.fg, background: d.tone.bg, borderColor: d.tone.bd }}>
          <b>{d.n}</b> {d.label}
        </span>
      ))}
    </span>
  )
}

function GroupRows({ brewery, list, children }: { brewery: string; list: Keg[]; children: React.ReactNode }) {
  const s = groupSummary(list)
  return (
    <>
      <tr className="keg-group">
        <td colSpan={7}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{brewery}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {s.n} {s.n === 1 ? 'keg' : 'kegs'}{s.l ? ` · ${fmtL(s.l)} L` : ''}{s.contact ? ` · ${s.contact}` : ''}
            </span>
            <span style={{ marginLeft: 'auto' }}><DestBreakdown items={s.byDest} /></span>
          </div>
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
      <div style={{ marginTop: 6 }}><DestBreakdown items={s.byDest} /></div>
    </div>
  )
}

function Flags({ k }: { k: Keg }) {
  const bought = k.source === 'purchased'
  if (!bought && !k.returnable && !k.from_form) return null
  const due = k.returnable && k.status === 'empty'
  const ret = !k.returnable ? null : due ? 'Return to brewery' : k.status === 'returned' ? 'Returned to brewery' : 'Goes back to brewery'
  return (
    <span style={{ display: 'inline-flex', gap: 8, marginTop: 4, fontSize: 11, fontWeight: 600, letterSpacing: '.03em', flexWrap: 'wrap' }}>
      {k.from_form && <span style={{ color: 'var(--accent)' }}>From brewery form</span>}
      {bought && <span style={{ color: 'var(--text-secondary)' }}>Purchased</span>}
      {ret && <span style={{ color: due ? 'var(--badge-orange-text)' : 'var(--text-muted)' }}>{ret}</span>}
    </span>
  )
}

// ── Brewery keg sign-up ───────────────────────────────────────
// One shared public link (/brewasia/donate) goes out in every email. Breweries type their
// name and kegs; they land straight in the list above (Donated · Promised · Conference,
// tagged "From brewery form"). This panel holds the link and shows who has signed up.
// Each brewery also gets a private edit link (/brewasia/donate/<token>) for changes.
const signupUrl = () => `${typeof window !== 'undefined' ? window.location.origin : ''}/brewasia/donate`
const editUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/brewasia/donate/${token}`
const signupMessage = () =>
  `Thanks for donating kegs to the BrewAsia conference! Please tell us what you're sending here:\n${signupUrl()}\n\nCảm ơn bạn đã tài trợ keg bia cho hội nghị BrewAsia! Vui lòng điền thông tin keg tại đây:\n${signupUrl()}`
const shortDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function DonationForms({ producers, kegs, onRefresh }: {
  producers: FormProducer[]
  kegs: Keg[]
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard blocked */ }
    setCopied(key)
    setTimeout(() => setCopied(c => (c === key ? null : c)), 1800)
  }

  // Breweries that have sent kegs through the form, newest first.
  const fromForm = kegs.filter(k => k.from_form)
  const groups = Array.from(
    fromForm.reduce((m, k) => {
      const id = k.producer_id || `name:${k.brewery}`
      const g = m.get(id) || { id, name: k.brewery, kegs: 0, beers: 0, producer: producers.find(p => p.id === k.producer_id) || null }
      g.kegs += k.qty || 0
      g.beers += 1
      m.set(id, g)
      return m
    }, new Map<string, { id: string; name: string; kegs: number; beers: number; producer: FormProducer | null }>()).values(),
  ).sort((a, b) => String(b.producer?.form_submitted_at || '').localeCompare(String(a.producer?.form_submitted_at || '')))
  const totalKegs = groups.reduce((n, g) => n + g.kegs, 0)

  return (
    <div className="card donate-panel" style={{ margin: '14px 0 4px' }}>
      <button onClick={() => setOpen(!open)} className="donate-panel__title" aria-expanded={open}>
        <span>Brewery keg sign-up</span>
        <span className="donate-panel__count">
          {groups.length ? <><b>{groups.length}</b> {groups.length === 1 ? 'brewery has' : 'breweries have'} signed up · <b>{totalKegs}</b> {totalKegs === 1 ? 'keg' : 'kegs'}</> : 'One link for every brewery. Put it in your emails.'}
        </span>
        <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <>
          <div className="donate-panel__invite">
            <input className="input" readOnly value={signupUrl()} onFocus={e => e.currentTarget.select()} aria-label="Sign-up link" style={{ fontSize: 13 }} />
            <button className="btn-accent" onClick={() => copy(signupUrl(), 'link')} style={{ whiteSpace: 'nowrap' }}>{copied === 'link' ? 'Copied' : 'Copy link'}</button>
            <button className="btn-outline" onClick={() => copy(signupMessage(), 'msg')} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{copied === 'msg' ? 'Copied' : 'Copy message'}</button>
            <a className="btn-outline" href={signupUrl()} target="_blank" rel="noreferrer" style={{ fontSize: 13, textDecoration: 'none' }}>Open</a>
            <button className="btn-outline" onClick={onRefresh} style={{ fontSize: 13 }}>Refresh</button>
          </div>

          {groups.length > 0 && (
            <div className="donate-panel__list">
              {groups.map(g => (
                <div key={g.id} className="donate-row">
                  <span className="collab-step-dot" style={{ background: 'var(--cal-booked-text)' }} />
                  <span className="donate-row__name">{g.name}</span>
                  <span className="donate-row__status" style={{ color: 'var(--text-secondary)' }}>
                    {g.kegs} {g.kegs === 1 ? 'keg' : 'kegs'} · {g.beers} {g.beers === 1 ? 'beer' : 'beers'}
                    {g.producer?.form_submitted_at ? ` · last sent ${shortDate(g.producer.form_submitted_at)}` : ''}
                  </span>
                  {g.producer?.form_token && (
                    <span className="donate-row__actions">
                      <button className="keg-link" onClick={() => copy(editUrl(g.producer!.form_token!), `edit-${g.id}`)} title="Their private link to change what they sent">
                        {copied === `edit-${g.id}` ? 'Copied' : 'Copy their edit link'}
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatusPill({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <Pill
      label="Status"
      value={value}
      tone={{ fg: 'var(--text-secondary)', bg: 'transparent', bd: 'var(--border)' }}
      dot={statusDot(value)}
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
      {needsVenue(k.destination) && (
        <>
          <input
            className="input keg-venue"
            list={listId}
            value={venue}
            aria-label={venueLabel(k.destination)}
            placeholder={venueHint(k.destination)}
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

function ScanZone({ scanning, note, onFiles }: { scanning: boolean; note: { tone: 'ok' | 'err'; text: string } | null; onFiles: (files: File[]) => void }) {
  const inputId = 'keg-scan-file'
  return (
    <div style={{ marginBottom: 18 }}>
      <div className={scanning ? 'keg-scan keg-scan--busy' : 'keg-scan'}>
        {scanning ? (
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>Reading it…</span>
        ) : (
          <>
            <span style={{ color: 'var(--text-secondary)' }}>
              <b style={{ color: 'var(--text)' }}>Drop a screenshot</b> anywhere, or paste one (⌘V)
            </span>
            <label htmlFor={inputId} className="btn-outline" style={{ height: 34, padding: '0 12px', fontSize: 13, cursor: 'pointer' }}>
              Choose file
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) onFiles(f) }}
            />
          </>
        )}
      </div>
      {note && (
        <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8, color: note.tone === 'err' ? 'var(--badge-red-text)' : 'var(--text-secondary)' }}>
          {note.text}
        </div>
      )}
    </div>
  )
}

function addLabel(lines: Line[]) {
  const n = lines.reduce((t, l) => t + Math.max(1, Math.floor(Number(l.qty) || 0)), 0)
  return `Add ${n} ${n === 1 ? 'keg' : 'kegs'}`
}
