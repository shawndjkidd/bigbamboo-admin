'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Ev = { id: string; title: string; event_date: string | null }
type Recipe = { recipe_id: string; name: string; serve_cost: number }
type Line = { id: string; kind: string; label: string | null; amount: number; qty: number | null; recipe_id: string | null; occurred_on: string }
type Cost = { id: string; category: string; vendor: string | null; amount: number; occurred_on: string }

const COST_CATS = [
  { v: 'entertainment', label: 'DJ / band' },
  { v: 'marketing', label: 'Ads / promo' },
  { v: 'consumable', label: 'Supplies' },
  { v: 'other_opex', label: 'Other' },
]

export default function EventsPnlPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [events, setEvents] = useState<Ev[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [eventId, setEventId] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const [ticketRev, setTicketRev] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [costs, setCosts] = useState<Cost[]>([])

  // forms
  const [rvLabel, setRvLabel] = useState('Door tickets'); const [rvAmt, setRvAmt] = useState('')
  const [csCat, setCsCat] = useState('entertainment'); const [csVendor, setCsVendor] = useState(''); const [csAmt, setCsAmt] = useState('')
  const [cpRecipe, setCpRecipe] = useState(''); const [cpQty, setCpQty] = useState('1'); const [cpManual, setCpManual] = useState(''); const [cpDeduct, setCpDeduct] = useState(true)

  // inline editing
  const [editId, setEditId] = useState<string | null>(null)
  const [editType, setEditType] = useState<'rev' | 'comp' | 'cost' | null>(null)
  const [eLabel, setELabel] = useState(''); const [eAmt, setEAmt] = useState(''); const [eCat, setECat] = useState('')

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    const [{ data: evs }, { data: rcs }] = await Promise.all([
      supabase.from('events').select('id, title, event_date').order('event_date', { ascending: false }),
      ops().from('v_recipe_serve_cost').select('recipe_id, name, serve_cost').order('name'),
    ])
    setEvents((evs as Ev[]) || [])
    setRecipes((rcs as Recipe[]) || [])
    if (evs && evs.length) { setEventId(evs[0].id); await loadEvent(evs[0].id) }
    setLoading(false)
  }

  async function loadEvent(id: string) {
    if (!id) return
    const [{ data: to }, { data: el }, { data: pc }] = await Promise.all([
      supabase.from('ticket_orders').select('amount_paid, status').eq('event_id', id),
      ops().from('event_lines').select('id, kind, label, amount, qty, recipe_id, occurred_on').eq('event_id', id).order('occurred_on'),
      ops().from('purchases').select('id, category, vendor, amount, occurred_on').eq('event_id', id).order('occurred_on'),
    ])
    setTicketRev((to || []).filter((t: any) => t.status !== 'cancelled').reduce((s: number, t: any) => s + (Number(t.amount_paid) || 0), 0))
    setLines((el as Line[]) || [])
    setCosts((pc as Cost[]) || [])
  }

  const num = (s: string) => Number((s || '').replace(/[^\d]/g, '')) || 0
  const ev = events.find(e => e.id === eventId)
  const evDate = ev?.event_date || today()

  const doorRev = lines.filter(l => l.kind === 'revenue').reduce((s, l) => s + Number(l.amount), 0)
  const compCost = lines.filter(l => l.kind === 'comp').reduce((s, l) => s + Number(l.amount), 0)
  const cashCost = costs.reduce((s, c) => s + Number(c.amount), 0)
  const totalRev = ticketRev + doorRev
  const net = totalRev - cashCost - compCost
  const serveCost = (rid: string) => recipes.find(r => r.recipe_id === rid)?.serve_cost || 0
  const cpAuto = cpRecipe ? serveCost(cpRecipe) * (Number(cpQty) || 0) : 0

  async function addRevenue() {
    if (!venueId || !eventId) return
    const a = num(rvAmt); if (!a) { setMsg('Enter an amount'); return }
    const { error } = await ops().from('event_lines').insert({ venue_id: venueId, event_id: eventId, occurred_on: evDate, kind: 'revenue', label: rvLabel.trim() || 'Door', amount: a })
    if (error) { setMsg(error.message); return }
    setRvAmt(''); setMsg(null); await loadEvent(eventId)
  }
  async function addCost() {
    if (!venueId || !eventId) return
    const a = num(csAmt); if (!a) { setMsg('Enter an amount'); return }
    const { error } = await ops().from('purchases').insert({ venue_id: venueId, event_id: eventId, occurred_on: evDate, category: csCat, vendor: csVendor.trim() || null, amount: a, notes: `event: ${ev?.title || ''}` })
    if (error) { setMsg(error.message); return }
    setCsAmt(''); setCsVendor(''); setMsg(null); await loadEvent(eventId)
  }
  async function addComp() {
    if (!venueId || !eventId) return
    const manual = num(cpManual)
    const qty = Number(cpQty) || 0
    const amount = manual || Math.round(cpAuto)
    if (!amount) { setMsg('Pick a drink or enter a comp amount'); return }
    const { error } = await ops().from('event_lines').insert({
      venue_id: venueId, event_id: eventId, occurred_on: evDate, kind: 'comp',
      label: cpRecipe ? (recipes.find(r => r.recipe_id === cpRecipe)?.name || 'Comp') : 'Comp', recipe_id: cpRecipe || null, qty: cpRecipe ? qty : null, amount,
    })
    if (error) { setMsg(error.message); return }
    if (cpDeduct && cpRecipe && qty > 0) {
      await ops().rpc('deduct_comp', { p_venue: venueId, p_recipe: cpRecipe, p_qty: qty })
    }
    setCpManual(''); setCpQty('1'); setMsg(null); await loadEvent(eventId)
  }
  function startEdit(type: 'rev' | 'comp' | 'cost', r: any) {
    setEditId(r.id); setEditType(type); setMsg(null)
    setELabel(type === 'cost' ? (r.vendor || '') : (r.label || ''))
    setEAmt(String(r.amount)); setECat(r.category || '')
  }
  async function saveEdit() {
    if (!editId) return
    const a = num(eAmt); if (!a) { setMsg('Enter an amount'); return }
    let error
    if (editType === 'cost') {
      ({ error } = await ops().from('purchases').update({ vendor: eLabel.trim() || null, category: eCat, amount: a }).eq('id', editId))
    } else {
      ({ error } = await ops().from('event_lines').update({ label: eLabel.trim() || null, amount: a }).eq('id', editId))
    }
    if (error) { setMsg(error.message); return }
    setEditId(null); setEditType(null); await loadEvent(eventId)
  }
  async function delLine(id: string) { await ops().from('event_lines').delete().eq('id', id); await loadEvent(eventId) }
  async function delCost(id: string) {
    // untag from the event (keep it in the P&L as a normal purchase)
    await ops().from('purchases').update({ event_id: null }).eq('id', id); await loadEvent(eventId)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Event P&amp;L is managed by managers.</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Event P&amp;L</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 16 }}>
        See if an event made money. Door revenue and cash costs (DJ, ads) also flow into your monthly P&amp;L; comps are shown here at ingredient cost (and can deduct stock) but don&apos;t double-count in the monthly P&amp;L.
      </div>

      {events.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text-muted, #999)' }}>No events yet — create one under Menu &amp; Events → Events first.</div>
      ) : (
        <>
          <select value={eventId} onChange={e => { setEventId(e.target.value); loadEvent(e.target.value) }} style={{ ...inp, maxWidth: 420, marginBottom: 16 }}>
            {events.map(e => <option key={e.id} value={e.id}>{e.title}{e.event_date ? ` — ${e.event_date}` : ''}</option>)}
          </select>

          {/* scoreboard */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <Stat label="Revenue" value={vnd(totalRev)} />
            <Stat label="Costs (cash)" value={vnd(cashCost)} />
            <Stat label="Comps (value)" value={vnd(compCost)} />
            <Stat label="Net" value={vnd(net)} color={net >= 0 ? '#548235' : 'var(--burgundy, #7b2d3a)'} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: -12, marginBottom: 20 }}>
            Revenue = online tickets {vnd(ticketRev)} + door/other {vnd(doorRev)}. {net >= 0 ? '✓ This event made money.' : '✗ This event lost money.'}
          </div>

          {/* add revenue */}
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={hdr}>Add revenue (door / other)</div>
            <div style={row}>
              <input value={rvLabel} onChange={e => setRvLabel(e.target.value)} style={{ ...inp, flex: 1, minWidth: 120 }} placeholder="e.g. Door tickets" />
              <input inputMode="numeric" value={rvAmt} onChange={e => setRvAmt(e.target.value)} style={{ ...inp, width: 150 }} placeholder="amount VND" />
              <button onClick={addRevenue} style={btn}>Add</button>
            </div>
          </div>

          {/* add cost */}
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={hdr}>Add cost (DJ, ads, supplies)</div>
            <div style={row}>
              <select value={csCat} onChange={e => setCsCat(e.target.value)} style={{ ...inp, width: 140 }}>{COST_CATS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}</select>
              <input value={csVendor} onChange={e => setCsVendor(e.target.value)} style={{ ...inp, flex: 1, minWidth: 100 }} placeholder="who / note" />
              <input inputMode="numeric" value={csAmt} onChange={e => setCsAmt(e.target.value)} style={{ ...inp, width: 140 }} placeholder="amount VND" />
              <button onClick={addCost} style={btn}>Add</button>
            </div>
          </div>

          {/* add comp */}
          <div className="card" style={{ padding: 14, marginBottom: 20 }}>
            <div style={hdr}>Add free drinks (comps)</div>
            <div style={row}>
              <select value={cpRecipe} onChange={e => setCpRecipe(e.target.value)} style={{ ...inp, flex: 1, minWidth: 160 }}>
                <option value="">— manual amount —</option>
                {recipes.map(r => <option key={r.recipe_id} value={r.recipe_id}>{r.name} ({vnd(r.serve_cost)})</option>)}
              </select>
              {cpRecipe
                ? <input inputMode="numeric" value={cpQty} onChange={e => setCpQty(e.target.value)} style={{ ...inp, width: 70 }} placeholder="qty" />
                : <input inputMode="numeric" value={cpManual} onChange={e => setCpManual(e.target.value)} style={{ ...inp, width: 140 }} placeholder="cost VND" />}
              <button onClick={addComp} style={btn}>Add{cpRecipe && cpAuto ? ` · ${vnd(Math.round(cpAuto))}` : ''}</button>
            </div>
            {cpRecipe && <label style={{ fontSize: 12, color: 'var(--text-muted,#777)', display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={cpDeduct} onChange={e => setCpDeduct(e.target.checked)} /> also deduct these from stock
            </label>}
          </div>

          {/* lines */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
              <th style={th}>Item</th><th style={th}>Type</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={{ ...th, textAlign: 'right' }}></th>
            </tr></thead>
            <tbody>
              {ticketRev > 0 && <tr style={{ borderTop: '1px solid var(--border,#eee)' }}><td style={td}>Online tickets</td><td style={{ ...td, color: '#548235' }}>revenue</td><td style={{ ...td, textAlign: 'right' }}>{vnd(ticketRev)}</td><td style={td}></td></tr>}

              {lines.filter(l => l.kind === 'revenue').map(l => editId === l.id ? (
                <EditRow key={l.id} label={eLabel} setLabel={setELabel} amt={eAmt} setAmt={setEAmt} onSave={saveEdit} onCancel={() => setEditId(null)} sign="" />
              ) : (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border,#eee)' }}><td style={td}>{l.label}</td><td style={{ ...td, color: '#548235' }}>revenue</td><td style={{ ...td, textAlign: 'right' }}>{vnd(l.amount)}</td><td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => startEdit('rev', l)} style={btnLink}>Edit</button><button onClick={() => delLine(l.id)} style={btnLink}>×</button></td></tr>
              ))}

              {costs.map(c => editId === c.id ? (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border,#eee)', background: 'var(--bg-sidebar,#fafafa)' }}>
                  <td style={td}><input value={eLabel} onChange={e => setELabel(e.target.value)} style={{ ...inp, width: '95%' }} placeholder="who / note" /></td>
                  <td style={td}><select value={eCat} onChange={e => setECat(e.target.value)} style={inp}>{COST_CATS.map(x => <option key={x.v} value={x.v}>{x.label}</option>)}</select></td>
                  <td style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={eAmt} onChange={e => setEAmt(e.target.value)} style={{ ...inp, width: 120, textAlign: 'right' }} /></td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={saveEdit} style={btnLink}>Save</button><button onClick={() => setEditId(null)} style={btnLink}>Cancel</button></td>
                </tr>
              ) : (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border,#eee)' }}><td style={td}>{c.vendor || c.category}</td><td style={{ ...td, color: 'var(--burgundy,#7b2d3a)' }}>{c.category}</td><td style={{ ...td, textAlign: 'right' }}>−{vnd(c.amount)}</td><td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => startEdit('cost', c)} style={btnLink}>Edit</button><button onClick={() => delCost(c.id)} style={btnLink} title="remove from event (keeps it in P&L)">×</button></td></tr>
              ))}

              {lines.filter(l => l.kind === 'comp').map(l => editId === l.id ? (
                <EditRow key={l.id} label={eLabel} setLabel={setELabel} amt={eAmt} setAmt={setEAmt} onSave={saveEdit} onCancel={() => setEditId(null)} sign="−" />
              ) : (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border,#eee)' }}><td style={td}>{l.label}{l.qty ? ` ×${l.qty}` : ''}</td><td style={{ ...td, color: 'var(--text-muted,#999)' }}>comp</td><td style={{ ...td, textAlign: 'right' }}>−{vnd(l.amount)}</td><td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => startEdit('comp', l)} style={btnLink}>Edit</button><button onClick={() => delLine(l.id)} style={btnLink}>×</button></td></tr>
              ))}
            </tbody>
          </table>
          {msg && <div style={{ fontSize: 12, color: 'var(--burgundy, #7b2d3a)', marginTop: 10 }}>{msg}</div>}
        </>
      )}
    </div>
  )
}

const EditRow = ({ label, setLabel, amt, setAmt, onSave, onCancel, sign }: { label: string; setLabel: (s: string) => void; amt: string; setAmt: (s: string) => void; onSave: () => void; onCancel: () => void; sign: string }) => (
  <tr style={{ borderTop: '1px solid var(--border,#eee)', background: 'var(--bg-sidebar,#fafafa)' }}>
    <td style={td}><input value={label} onChange={e => setLabel(e.target.value)} style={{ ...inp, width: '95%' }} placeholder="label" /></td>
    <td style={td}></td>
    <td style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value)} style={{ ...inp, width: 120, textAlign: 'right' }} placeholder={`${sign}amount`} /></td>
    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={onSave} style={btnLink}>Save</button><button onClick={onCancel} style={btnLink}>Cancel</button></td>
  </tr>
)

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="card" style={{ padding: '12px 16px', minWidth: 130 }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, color: color || 'var(--text, #333)' }}>{value}</div>
  </div>
)
const hdr = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 10 }
const row = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }
const inp = { padding: '9px 11px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '9px 12px', color: 'var(--text, #333)' }
const btn = { padding: '9px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }
const btnLink = { padding: '2px 6px', background: 'transparent', color: 'var(--text-muted, #999)', border: 'none', cursor: 'pointer', fontSize: 15 }
