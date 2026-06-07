'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ops, vnd, today, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

const CATEGORIES = ['food', 'mixer', 'beer', 'wine', 'liquor', 'garnish', 'consumable', 'other_opex']

type Ing = { id: string; name: string; base_unit: string; purchase_unit_size: number; purchase_unit_label: string }
type Item = { name: string; qty: number; total_price: number; unit: string | null; ingredientId: string }

function guessIngredient(name: string, ings: Ing[]): string {
  const n = name.toLowerCase()
  let best = '', score = 0
  for (const i of ings) {
    const a = i.name.toLowerCase()
    let s = 0
    if (a === n) s = 100
    else if (a.includes(n) || n.includes(a)) s = 60
    else s = n.split(/[^a-z0-9]+/).filter(w => w.length > 2).filter(w => a.includes(w)).length * 25
    if (s > score) { score = s; best = i.id }
  }
  return score >= 25 ? best : ''
}

export default function InvoiceScanPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [ings, setIngs] = useState<Ing[]>([])
  const [vendorNames, setVendorNames] = useState<string[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [vendor, setVendor] = useState('')
  const [date, setDate] = useState(today())
  const [category, setCategory] = useState('food')
  const [vat, setVat] = useState('0')
  const [delivery, setDelivery] = useState('0')
  const [landed, setLanded] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    const [{ data: ig }, { data: vd }] = await Promise.all([
      ops().from('ingredients').select('id, name, base_unit, purchase_unit_size, purchase_unit_label').order('name'),
      ops().from('vendors').select('name'),
    ])
    const list = (ig as Ing[]) || []
    setIngs(list)
    const names = new Set<string>()
    ;(vd || []).forEach((v: any) => v.name && names.add(String(v.name).trim()))
    list.forEach(() => {})
    setVendorNames(Array.from(names).sort((a, b) => a.localeCompare(b)))
    setLoading(false)
  }

  async function onFile(file: File) {
    setScanning(true); setMsg(null); setItems([])
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file)
      })
      const r = await fetch('/api/admin/ops/invoice-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, mimeType: file.type || 'image/jpeg' }),
      })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error || 'Scan failed'); setScanning(false); return }
      if (j.vendor && !vendor) setVendor(String(j.vendor))
      setVat(String(Math.round(Number(j.tax) || 0)))
      setDelivery(String(Math.round(Number(j.fees) || 0)))
      const parsed: Item[] = (j.items || []).map((it: any) => ({
        name: it.name, qty: Number(it.qty) || 1, total_price: Number(it.total_price) || 0, unit: it.unit || null,
        ingredientId: guessIngredient(it.name, ings),
      }))
      setItems(parsed)
      if (parsed.length === 0) setMsg('No line items found — try a clearer photo.')
    } catch (e: any) { setMsg('Error: ' + (e?.message || e)) }
    setScanning(false)
  }

  function setRow(i: number, patch: Partial<Item>) {
    setItems(items.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  const subtotal = items.reduce((a, r) => a + Number(r.total_price || 0), 0)
  const extra = (Number(vat.replace(/[^\d]/g, '')) || 0) + (Number(delivery.replace(/[^\d]/g, '')) || 0)
  const invoiceTotal = subtotal + extra
  function perBaseOf(row: Item): number | null {
    const ing = ings.find(i => i.id === row.ingredientId); if (!ing) return null
    const size = Number(ing.purchase_unit_size) || 1
    let base = Number(row.total_price)
    if (landed && subtotal > 0) base += extra * (Number(row.total_price) / subtotal) // spread VAT + delivery by value
    return row.qty > 0 ? base / (row.qty * size) : base
  }

  async function apply() {
    if (!venueId) return
    setBusy(true); setMsg(null)
    let updated = 0
    for (const row of items) {
      if (!row.ingredientId) continue
      const ing = ings.find(i => i.id === row.ingredientId); if (!ing) continue
      const perBase = perBaseOf(row); if (perBase == null) continue
      const { error } = await ops().from('ingredients').update({ cost_method: 'manual', manual_cost_per_base: perBase, current_cost_per_base: perBase }).eq('id', ing.id)
      if (error) { setMsg('Failed updating ' + ing.name + ': ' + error.message); setBusy(false); return }
      await ops().from('ingredient_price_history').insert({ ingredient_id: ing.id, cost_per_base: perBase, observed_at: new Date().toISOString(), source: 'invoice' })
      updated++
    }
    const { error: pErr } = await ops().from('purchases').insert({
      venue_id: venueId, occurred_on: date, vendor: vendor || null, category, amount: invoiceTotal, notes: `Invoice scan — ${updated} items priced`,
    })
    setBusy(false)
    if (pErr) { setMsg('Costs updated, but logging the purchase failed: ' + pErr.message); return }
    setMsg(`✓ Updated ${updated} ingredient cost${updated === 1 ? '' : 's'} and logged a ${vnd(invoiceTotal)} purchase.`)
    setItems([])
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Invoice scanning is available to managers.</div>

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Scan invoice</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        Snap a supplier invoice. The AI drafts the line items — review, match each to an ingredient, then apply to update costs and log the spend. <Link href="/dashboard/ops/purchase" style={{ color: 'var(--accent)' }}>Or log a total manually →</Link>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ ...btnPrimary, display: 'inline-block', cursor: scanning ? 'wait' : 'pointer', opacity: scanning ? 0.6 : 1 }}>
          {scanning ? 'Reading invoice…' : '📷 Upload / photograph invoice'}
          <input type="file" accept="image/*" capture="environment" disabled={scanning} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} style={{ display: 'none' }} />
        </label>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('✓') ? '#548235' : 'var(--burgundy, #7b2d3a)' }}>{msg}</span>}
      </div>

      {items.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 200px', gap: 10, marginBottom: 14 }}>
            <div><label className="label">Vendor</label><input value={vendor} list="inv-vendors" onChange={e => setVendor(e.target.value)} style={inp} placeholder="Vendor" /><datalist id="inv-vendors">{vendorNames.map(v => <option key={v} value={v} />)}</datalist></div>
            <div><label className="label">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></div>
            <div><label className="label">Spend category</label><select value={category} onChange={e => setCategory(e.target.value)} style={inp}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
              <th style={th}>On invoice</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={th}>Match to ingredient</th><th style={{ ...th, textAlign: 'right' }}>New unit cost</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {items.map((row, i) => {
                const pb = perBaseOf(row)
                const ing = ings.find(x => x.id === row.ingredientId)
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                    <td style={td}>{row.name}{row.unit ? <span style={{ color: 'var(--text-muted, #999)' }}> · {row.unit}</span> : ''}</td>
                    <td style={{ ...td, textAlign: 'right' }}><input inputMode="decimal" value={String(row.qty)} onChange={e => setRow(i, { qty: Number(e.target.value) || 0 })} style={{ ...inp, width: 64, textAlign: 'right', padding: '4px 6px' }} /></td>
                    <td style={{ ...td, textAlign: 'right' }}><input inputMode="numeric" value={String(row.total_price)} onChange={e => setRow(i, { total_price: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} style={{ ...inp, width: 110, textAlign: 'right', padding: '4px 6px' }} /></td>
                    <td style={td}>
                      <select value={row.ingredientId} onChange={e => setRow(i, { ingredientId: e.target.value })} style={{ ...inp, padding: '4px 6px' }}>
                        <option value="">— skip —</option>
                        {ings.map(ig => <option key={ig.id} value={ig.id}>{ig.name}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: pb == null ? 'var(--text-muted, #bbb)' : 'var(--text, #333)' }}>{pb == null ? '—' : `${vnd(pb)}/${ing?.base_unit}`}</td>
                    <td style={{ ...td, textAlign: 'right' }}><button onClick={() => setItems(items.filter((_, idx) => idx !== i))} style={btnLink}>remove</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 420 }}>
            <div><label className="label">VAT / tax (₫)</label><input inputMode="numeric" value={vat} onChange={e => setVat(e.target.value)} style={inp} /></div>
            <div><label className="label">Delivery / fees (₫)</label><input inputMode="numeric" value={delivery} onChange={e => setDelivery(e.target.value)} style={inp} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10 }}>
            <input type="checkbox" checked={landed} onChange={e => setLanded(e.target.checked)} />
            Spread VAT &amp; delivery across ingredient costs (true landed cost)
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>
              Items {vnd(subtotal)} · VAT {vnd(Number(vat.replace(/[^\d]/g, '')) || 0)} · Delivery {vnd(Number(delivery.replace(/[^\d]/g, '')) || 0)}
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #333)', marginTop: 2 }}>Total: {vnd(invoiceTotal)}</div>
            </div>
            <button onClick={apply} disabled={busy} style={btnPrimary}>{busy ? 'Applying…' : 'Apply — update costs & log purchase'}</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 8 }}>Unit cost = (line total + its share of VAT/delivery, if enabled) ÷ (qty × pack size). The full total (incl. VAT &amp; delivery) is what gets logged to the P&amp;L.</div>
        </>
      )}
    </div>
  )
}

const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '8px 10px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '8px 10px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '10px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const btnLink = { padding: '4px 8px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: 'none', cursor: 'pointer', fontSize: 12 }
