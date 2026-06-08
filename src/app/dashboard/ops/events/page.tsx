'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Ev = { id: string; title: string; event_date: string | null }
type Recipe = { recipe_id: string; name: string; serve_cost: number }
type Line = { id: string; kind: string; label: string | null; amount: number; qty: number | null; recipe_id: string | null }
type Cost = { id: string; category: string; vendor: string | null; amount: number }
type Agg = { ticketRev: number; doorRev: number; compCost: number; cashCost: number }

const COST_CATS = [
  { v: 'entertainment', label: 'DJ / band' },
  { v: 'marketing', label: 'Ads / promo' },
  { v: 'consumable', label: 'Supplies' },
  { v: 'other_opex', label: 'Other' },
]

export default function EventsPnlPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<Ev[]>([])
  const [agg, setAgg] = useState<Record<string, Agg>>({})
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  // new event
  const [showNew, setShowNew] = useState(false)
  const [nvTitle, setNvTitle] = useState(''); const [nvDate, setNvDate] = useState(today())
  const [scanning, setScanning] = useState(false)
  const [nvStart, setNvStart] = useState(''); const [nvEnd, setNvEnd] = useState('')
  const [nvDesc, setNvDesc] = useState(''); const [nvPrice, setNvPrice] = useState(''); const [nvFree, setNvFree] = useState(false); const [nvType, setNvType] = useState('')
  const [showPaste, setShowPaste] = useState(false); const [pasteText, setPasteText] = useState('')

  // open modal
  const [openId, setOpenId] = useState<string | null>(null)
  const [ticketRev, setTicketRev] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [costs, setCosts] = useState<Cost[]>([])

  // detail forms
  const [rvLabel, setRvLabel] = useState('Door tickets'); const [rvAmt, setRvAmt] = useState('')
  const [csCat, setCsCat] = useState('entertainment'); const [csVendor, setCsVendor] = useState(''); const [csAmt, setCsAmt] = useState('')
  const [cpRecipe, setCpRecipe] = useState(''); const [cpQty, setCpQty] = useState('1'); const [cpManual, setCpManual] = useState(''); const [cpDeduct, setCpDeduct] = useState(true)
  const [editId, setEditId] = useState<string | null>(null); const [editType, setEditType] = useState<'rev' | 'comp' | 'cost' | null>(null)
  const [eLabel, setELabel] = useState(''); const [eAmt, setEAmt] = useState(''); const [eCat, setECat] = useState('')

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    const { data: rcs } = await ops().from('v_recipe_serve_cost').select('recipe_id, name, serve_cost').order('name')
    setRecipes((rcs as Recipe[]) || [])
    await loadAll()
    setLoading(false)
  }

  async function loadAll() {
    const [{ data: evs }, { data: to }, { data: el }, { data: pc }] = await Promise.all([
      supabase.from('events').select('id, title, event_date').order('event_date', { ascending: false }),
      supabase.from('ticket_orders').select('event_id, amount_paid, status'),
      ops().from('event_lines').select('event_id, kind, amount'),
      ops().from('purchases').select('event_id, amount').not('event_id', 'is', null),
    ])
    setEvents((evs as Ev[]) || [])
    const a: Record<string, Agg> = {}
    ;(evs || []).forEach((e: any) => { a[e.id] = { ticketRev: 0, doorRev: 0, compCost: 0, cashCost: 0 } })
    ;(to || []).forEach((t: any) => { if (t.event_id && a[t.event_id] && t.status !== 'cancelled') a[t.event_id].ticketRev += Number(t.amount_paid) || 0 })
    ;(el || []).forEach((l: any) => { if (l.event_id && a[l.event_id]) { if (l.kind === 'revenue') a[l.event_id].doorRev += Number(l.amount) || 0; else if (l.kind === 'comp') a[l.event_id].compCost += Number(l.amount) || 0 } })
    ;(pc || []).forEach((p: any) => { if (p.event_id && a[p.event_id]) a[p.event_id].cashCost += Number(p.amount) || 0 })
    setAgg(a)
  }

  const num = (s: string) => Number((s || '').replace(/[^\d]/g, '')) || 0
  const netOf = (id: string) => { const x = agg[id]; return x ? x.ticketRev + x.doorRev - x.cashCost - x.compCost : 0 }
  const revOf = (id: string) => { const x = agg[id]; return x ? x.ticketRev + x.doorRev : 0 }

  async function createEvent() {
    if (!nvTitle.trim()) { setMsg('Give the event a name'); return }
    const payload: any = { title: nvTitle.trim(), event_date: nvDate, type: nvType.trim() || 'Event', is_published: false }
    if (nvStart) payload.start_time = nvStart
    if (nvEnd) payload.end_time = nvEnd
    if (nvDesc.trim()) payload.description = nvDesc.trim()
    if (nvFree) { payload.is_free = true; payload.ticket_price = 0 }
    else if (num(nvPrice)) { payload.ticket_price = num(nvPrice); payload.is_free = false }
    const { data, error } = await supabase.from('events').insert(payload).select('id').single()
    if (error) { setMsg('Could not create event: ' + error.message); return }
    setShowNew(false); setNvTitle(''); setNvStart(''); setNvEnd(''); setNvDesc(''); setNvPrice(''); setNvFree(false); setNvType(''); setMsg(null)
    await loadAll()
    if (data?.id) open(data.id)
  }

  function applyScan(j: any) {
    setShowNew(true)
    if (j.title) setNvTitle(j.title)
    if (j.date && /^\d{4}-\d{2}-\d{2}$/.test(j.date)) setNvDate(j.date)
    setNvStart((j.start_time || '').slice(0, 5)); setNvEnd((j.end_time || '').slice(0, 5))
    setNvType(j.type || ''); setNvDesc(j.description || ''); setNvFree(!!j.is_free)
    setNvPrice(j.ticket_price ? String(j.ticket_price) : '')
  }
  async function sendScan(payload: any) {
    setScanning(true); setMsg(null)
    try {
      const resp = await fetch('/api/admin/ops/event-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await resp.json()
      if (!resp.ok || !j.ok) { setMsg(j.error || 'Read failed'); setScanning(false); return }
      applyScan(j); setShowPaste(false); setPasteText(''); setMsg('✓ Read — review the details below, then Create.')
    } catch (e: any) { setMsg('Read error: ' + e.message) }
    setScanning(false)
  }
  async function scanEvent(file: File) {
    const dataUrl: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file) })
    await sendScan({ imageBase64: dataUrl, mimeType: file.type })
  }

  async function open(id: string) {
    setOpenId(id); setEditId(null); setMsg(null)
    const [{ data: to }, { data: el }, { data: pc }] = await Promise.all([
      supabase.from('ticket_orders').select('amount_paid, status').eq('event_id', id),
      ops().from('event_lines').select('id, kind, label, amount, qty, recipe_id').eq('event_id', id).order('created_at'),
      ops().from('purchases').select('id, category, vendor, amount').eq('event_id', id),
    ])
    setTicketRev((to || []).filter((t: any) => t.status !== 'cancelled').reduce((s: number, t: any) => s + (Number(t.amount_paid) || 0), 0))
    setLines((el as Line[]) || [])
    setCosts((pc as Cost[]) || [])
  }
  async function reopen() { if (openId) { await open(openId); await loadAll() } }

  const ev = events.find(e => e.id === openId)
  const evDate = ev?.event_date || today()
  const doorRev = lines.filter(l => l.kind === 'revenue').reduce((s, l) => s + Number(l.amount), 0)
  const compCost = lines.filter(l => l.kind === 'comp').reduce((s, l) => s + Number(l.amount), 0)
  const cashCost = costs.reduce((s, c) => s + Number(c.amount), 0)
  const totalRev = ticketRev + doorRev
  const net = totalRev - cashCost - compCost
  const serveCost = (rid: string) => recipes.find(r => r.recipe_id === rid)?.serve_cost || 0
  const cpAuto = cpRecipe ? serveCost(cpRecipe) * (Number(cpQty) || 0) : 0

  async function addRevenue() { const a = num(rvAmt); if (!a || !venueId || !openId) { setMsg('Enter an amount'); return }
    const { error } = await ops().from('event_lines').insert({ venue_id: venueId, event_id: openId, occurred_on: evDate, kind: 'revenue', label: rvLabel.trim() || 'Door', amount: a })
    if (error) { setMsg(error.message); return } setRvAmt(''); await reopen() }
  async function addCost() { const a = num(csAmt); if (!a || !venueId || !openId) { setMsg('Enter an amount'); return }
    const { error } = await ops().from('purchases').insert({ venue_id: venueId, event_id: openId, occurred_on: evDate, category: csCat, vendor: csVendor.trim() || null, amount: a, notes: `event: ${ev?.title || ''}` })
    if (error) { setMsg(error.message); return } setCsAmt(''); setCsVendor(''); await reopen() }
  async function addComp() { if (!venueId || !openId) return
    const amount = num(cpManual) || Math.round(cpAuto); const qty = Number(cpQty) || 0
    if (!amount) { setMsg('Pick a drink or enter a comp amount'); return }
    const { error } = await ops().from('event_lines').insert({ venue_id: venueId, event_id: openId, occurred_on: evDate, kind: 'comp', label: cpRecipe ? (recipes.find(r => r.recipe_id === cpRecipe)?.name || 'Comp') : 'Comp', recipe_id: cpRecipe || null, qty: cpRecipe ? qty : null, amount })
    if (error) { setMsg(error.message); return }
    if (cpDeduct && cpRecipe && qty > 0) await ops().rpc('deduct_comp', { p_venue: venueId, p_recipe: cpRecipe, p_qty: qty })
    setCpManual(''); setCpQty('1'); await reopen() }
  function startEdit(type: 'rev' | 'comp' | 'cost', r: any) { setEditId(r.id); setEditType(type); setMsg(null); setELabel(type === 'cost' ? (r.vendor || '') : (r.label || '')); setEAmt(String(r.amount)); setECat(r.category || '') }
  async function saveEdit() { if (!editId) return; const a = num(eAmt); if (!a) { setMsg('Enter an amount'); return }
    let error; if (editType === 'cost') { ({ error } = await ops().from('purchases').update({ vendor: eLabel.trim() || null, category: eCat, amount: a }).eq('id', editId)) }
    else { ({ error } = await ops().from('event_lines').update({ label: eLabel.trim() || null, amount: a }).eq('id', editId)) }
    if (error) { setMsg(error.message); return } setEditId(null); await reopen() }
  async function delLine(id: string) { await ops().from('event_lines').delete().eq('id', id); await reopen() }
  async function delCost(id: string) { await ops().from('purchases').update({ event_id: null }).eq('id', id); await reopen() }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Event P&amp;L is managed by managers.</div>

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>Event P&amp;L</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ ...btn, cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.6 : 1, background: 'transparent', color: 'var(--accent,#e87830)', border: '1px solid var(--accent,#e87830)' }}>
            {scanning ? 'Reading…' : '📷 Scan event'}
            <input type="file" accept="image/*" disabled={scanning} onChange={e => { const f = e.target.files?.[0]; if (f) scanEvent(f); e.target.value = '' }} style={{ display: 'none' }} />
          </label>
          <button onClick={() => { setShowPaste(s => !s); setMsg(null) }} style={{ ...btn, background: 'transparent', color: 'var(--accent,#e87830)', border: '1px solid var(--accent,#e87830)' }}>📝 Paste text</button>
          <button onClick={() => { setShowNew(true); setMsg(null) }} style={btn}>+ New event</button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginBottom: 18 }}>
        Each card is one event — tap to open its full P&amp;L. Door revenue and cash costs also roll into your monthly P&amp;L.
      </div>

      {showPaste && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={hdr}>Paste event text</div>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4} style={{ ...inp, width: '100%', resize: 'vertical' }} placeholder="Paste the Facebook event text here…" />
          <div style={{ ...row, marginTop: 8 }}>
            <button onClick={() => pasteText.trim() && sendScan({ text: pasteText.trim() })} disabled={scanning} style={btn}>{scanning ? 'Reading…' : 'Read text'}</button>
            <button onClick={() => { setShowPaste(false); setPasteText('') }} style={{ ...btn, background: 'transparent', color: 'var(--text-muted,#999)' }}>Cancel</button>
          </div>
        </div>
      )}

      {showNew && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={hdr}>New event</div>
          <div style={row}>
            <input value={nvTitle} onChange={e => setNvTitle(e.target.value)} style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="Event name (e.g. CraftCon June)" />
            <input type="date" value={nvDate} onChange={e => setNvDate(e.target.value)} style={inp} />
            <input type="time" value={nvStart} onChange={e => setNvStart(e.target.value)} style={{ ...inp, width: 110 }} title="Start time" />
            <input type="time" value={nvEnd} onChange={e => setNvEnd(e.target.value)} style={{ ...inp, width: 110 }} title="End time" />
          </div>
          <div style={{ ...row, marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted,#999)' }}>
              <input type="checkbox" checked={nvFree} onChange={e => setNvFree(e.target.checked)} /> Free
            </label>
            {!nvFree && <input inputMode="numeric" value={nvPrice} onChange={e => setNvPrice(e.target.value)} style={{ ...inp, width: 150 }} placeholder="ticket price ₫" />}
            <input value={nvType} onChange={e => setNvType(e.target.value)} style={{ ...inp, width: 150 }} placeholder="type / tagline" />
            <input value={nvDesc} onChange={e => setNvDesc(e.target.value)} style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="short description" />
            <button onClick={createEvent} style={btn}>Create</button>
            <button onClick={() => setShowNew(false)} style={{ ...btn, background: 'transparent', color: 'var(--text-muted,#999)' }}>Cancel</button>
          </div>
        </div>
      )}
      {msg && !openId && <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--burgundy,#7b2d3a)' }}>{msg}</div>}

      {events.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text-muted, #999)' }}>No events yet — tap “+ New event”.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {events.map(e => {
            const n = netOf(e.id)
            return (
              <button key={e.id} onClick={() => open(e.id)} style={{
                textAlign: 'left', cursor: 'pointer', background: 'var(--bg-card, #fff)',
                border: '1px solid var(--border, #e5e5e5)', borderRadius: 12, padding: 16,
                borderLeft: `4px solid ${n >= 0 ? '#548235' : 'var(--burgundy, #7b2d3a)'}`,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 10 }}>{e.event_date || 'no date'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #777)' }}>Revenue {vnd(revOf(e.id))}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: n >= 0 ? '#548235' : 'var(--burgundy, #7b2d3a)' }}>{n >= 0 ? '+' : ''}{vnd(n)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 2 }}>{n >= 0 ? 'made money' : 'lost money'}</div>
              </button>
            )
          })}
        </div>
      )}

      {/* Detail modal */}
      {openId && ev && (
        <div onClick={() => setOpenId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 50, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 14, padding: 22, maxWidth: 640, width: '100%', marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div><div style={{ fontSize: 19, fontWeight: 700 }}>{ev.title}</div><div style={{ fontSize: 12, color: 'var(--text-muted,#999)' }}>{ev.event_date || ''}</div></div>
              <button onClick={() => setOpenId(null)} style={{ ...btnLink, fontSize: 22 }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <Stat label="Revenue" value={vnd(totalRev)} />
              <Stat label="Costs" value={vnd(cashCost)} />
              <Stat label="Comps" value={vnd(compCost)} />
              <Stat label="Net" value={`${net >= 0 ? '+' : ''}${vnd(net)}`} color={net >= 0 ? '#548235' : 'var(--burgundy,#7b2d3a)'} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted,#999)', marginBottom: 16 }}>Online tickets {vnd(ticketRev)} + door {vnd(doorRev)}. {net >= 0 ? '✓ made money' : '✗ lost money'}</div>

            <div className="card" style={{ padding: 12, marginBottom: 10 }}>
              <div style={hdr}>Add revenue (door / other)</div>
              <div style={row}><input value={rvLabel} onChange={e => setRvLabel(e.target.value)} style={{ ...inp, flex: 1, minWidth: 110 }} /><input inputMode="numeric" value={rvAmt} onChange={e => setRvAmt(e.target.value)} style={{ ...inp, width: 130 }} placeholder="amount" /><button onClick={addRevenue} style={btn}>Add</button></div>
            </div>
            <div className="card" style={{ padding: 12, marginBottom: 10 }}>
              <div style={hdr}>Add cost (DJ, ads, supplies)</div>
              <div style={row}><select value={csCat} onChange={e => setCsCat(e.target.value)} style={{ ...inp, width: 120 }}>{COST_CATS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}</select><input value={csVendor} onChange={e => setCsVendor(e.target.value)} style={{ ...inp, flex: 1, minWidth: 80 }} placeholder="who" /><input inputMode="numeric" value={csAmt} onChange={e => setCsAmt(e.target.value)} style={{ ...inp, width: 110 }} placeholder="amount" /><button onClick={addCost} style={btn}>Add</button></div>
            </div>
            <div className="card" style={{ padding: 12, marginBottom: 14 }}>
              <div style={hdr}>Add free drinks (comps)</div>
              <div style={row}>
                <select value={cpRecipe} onChange={e => setCpRecipe(e.target.value)} style={{ ...inp, flex: 1, minWidth: 140 }}><option value="">— manual amount —</option>{recipes.map(r => <option key={r.recipe_id} value={r.recipe_id}>{r.name} ({vnd(r.serve_cost)})</option>)}</select>
                {cpRecipe ? <input inputMode="numeric" value={cpQty} onChange={e => setCpQty(e.target.value)} style={{ ...inp, width: 64 }} placeholder="qty" /> : <input inputMode="numeric" value={cpManual} onChange={e => setCpManual(e.target.value)} style={{ ...inp, width: 120 }} placeholder="cost" />}
                <button onClick={addComp} style={btn}>Add{cpRecipe && cpAuto ? ` · ${vnd(Math.round(cpAuto))}` : ''}</button>
              </div>
              {cpRecipe && <label style={{ fontSize: 12, color: 'var(--text-muted,#777)', display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}><input type="checkbox" checked={cpDeduct} onChange={e => setCpDeduct(e.target.checked)} /> also deduct from stock</label>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {ticketRev > 0 && <tr style={{ borderTop: '1px solid var(--border,#eee)' }}><td style={td}>Online tickets</td><td style={{ ...td, color: '#548235' }}>revenue</td><td style={{ ...td, textAlign: 'right' }}>{vnd(ticketRev)}</td><td style={td}></td></tr>}
                {lines.filter(l => l.kind === 'revenue').map(l => editId === l.id ? <EditRow key={l.id} label={eLabel} setLabel={setELabel} amt={eAmt} setAmt={setEAmt} onSave={saveEdit} onCancel={() => setEditId(null)} /> : (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--border,#eee)' }}><td style={td}>{l.label}</td><td style={{ ...td, color: '#548235' }}>revenue</td><td style={{ ...td, textAlign: 'right' }}>{vnd(l.amount)}</td><td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => startEdit('rev', l)} style={btnLink}>Edit</button><button onClick={() => delLine(l.id)} style={btnLink}>×</button></td></tr>
                ))}
                {costs.map(c => editId === c.id ? (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border,#eee)', background: 'var(--bg-sidebar,#fafafa)' }}>
                    <td style={td}><input value={eLabel} onChange={e => setELabel(e.target.value)} style={{ ...inp, width: '92%' }} /></td>
                    <td style={td}><select value={eCat} onChange={e => setECat(e.target.value)} style={inp}>{COST_CATS.map(x => <option key={x.v} value={x.v}>{x.label}</option>)}</select></td>
                    <td style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={eAmt} onChange={e => setEAmt(e.target.value)} style={{ ...inp, width: 110, textAlign: 'right' }} /></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={saveEdit} style={btnLink}>Save</button><button onClick={() => setEditId(null)} style={btnLink}>Cancel</button></td>
                  </tr>
                ) : (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border,#eee)' }}><td style={td}>{c.vendor || c.category}</td><td style={{ ...td, color: 'var(--burgundy,#7b2d3a)' }}>{c.category}</td><td style={{ ...td, textAlign: 'right' }}>−{vnd(c.amount)}</td><td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => startEdit('cost', c)} style={btnLink}>Edit</button><button onClick={() => delCost(c.id)} style={btnLink} title="remove from event">×</button></td></tr>
                ))}
                {lines.filter(l => l.kind === 'comp').map(l => editId === l.id ? <EditRow key={l.id} label={eLabel} setLabel={setELabel} amt={eAmt} setAmt={setEAmt} onSave={saveEdit} onCancel={() => setEditId(null)} /> : (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--border,#eee)' }}><td style={td}>{l.label}{l.qty ? ` ×${l.qty}` : ''}</td><td style={{ ...td, color: 'var(--text-muted,#999)' }}>comp</td><td style={{ ...td, textAlign: 'right' }}>−{vnd(l.amount)}</td><td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => startEdit('comp', l)} style={btnLink}>Edit</button><button onClick={() => delLine(l.id)} style={btnLink}>×</button></td></tr>
                ))}
              </tbody>
            </table>
            {msg && openId && <div style={{ fontSize: 12, marginTop: 10, color: 'var(--burgundy,#7b2d3a)' }}>{msg}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

const EditRow = ({ label, setLabel, amt, setAmt, onSave, onCancel }: { label: string; setLabel: (s: string) => void; amt: string; setAmt: (s: string) => void; onSave: () => void; onCancel: () => void }) => (
  <tr style={{ borderTop: '1px solid var(--border,#eee)', background: 'var(--bg-sidebar,#fafafa)' }}>
    <td style={td}><input value={label} onChange={e => setLabel(e.target.value)} style={{ ...inp, width: '92%' }} /></td>
    <td style={td}></td>
    <td style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value)} style={{ ...inp, width: 110, textAlign: 'right' }} /></td>
    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={onSave} style={btnLink}>Save</button><button onClick={onCancel} style={btnLink}>Cancel</button></td>
  </tr>
)
const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="card" style={{ padding: '10px 14px', minWidth: 110 }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>{label}</div>
    <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3, color: color || 'var(--text, #333)' }}>{value}</div>
  </div>
)
const hdr = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 8 }
const row = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }
const inp = { padding: '9px 11px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const td = { padding: '9px 10px', color: 'var(--text, #333)' }
const btn = { padding: '9px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
const btnLink = { padding: '2px 6px', background: 'transparent', color: 'var(--text-muted, #999)', border: 'none', cursor: 'pointer', fontSize: 14 }
