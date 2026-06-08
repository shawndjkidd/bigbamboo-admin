'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ops, vnd, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

// Which ingredient categories belong to each department
const DEPT_CATS: Record<string, string[]> = {
  bar: ['spirit', 'beer', 'wine', 'mixer', 'syrup'],
  kitchen: ['food', 'garnish', 'other', 'consumable'],
}

const CATEGORIES = ['spirit','beer','wine','mixer','syrup','garnish','food','consumable','other'] as const
const BASE_UNITS = ['ml','g','each'] as const
const COST_METHODS = [
  { v: 'manual', label: 'Manual price' },
  { v: 'latest', label: 'Latest purchase' },
  { v: 'average', label: 'Rolling average (90d)' },
  { v: 'fifo', label: 'FIFO' },
] as const

type Row = {
  id: string; name: string; category: string; purchase_unit_label: string; purchase_unit_size: number
  base_unit: string; current_cost_per_base: number; cost_method: string
  manual_cost_per_base: number | null; par_level_base: number | null; supplier: string | null; notes: string | null; active: boolean
  on_hand_base: number | null; counted_at: string | null
}

type VendorRow = {
  id?: string; name: string; contact_name: string | null; phone: string | null
  email: string | null; order_notes: string | null; delivery_days: string | null
}

function IngredientsInner() {
  const sp = useSearchParams()
  const dept = sp.get('dept') // 'bar' | 'kitchen' | null
  const urlView = sp.get('view')
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<'ingredients' | 'consumables' | 'stock' | 'vendors' | 'all'>(
    urlView === 'stock' ? 'stock' : urlView === 'vendors' ? 'vendors' : urlView === 'consumables' ? 'consumables' : urlView === 'all' ? 'all' : 'ingredients'
  )
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [openVendor, setOpenVendor] = useState<string | null>(null)
  const [orderQty, setOrderQty] = useState<Record<string, string>>({})
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [editVendor, setEditVendor] = useState<VendorRow | null>(null)
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user; if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    await load()
  }
  async function load() {
    setLoading(true)
    const [{ data: ing }, { data: vend }] = await Promise.all([
      ops().from('ingredients').select('*').order('name'),
      ops().from('vendors').select('*').order('name'),
    ])
    setRows((ing as Row[]) || [])
    setVendors((vend as VendorRow[]) || [])
    setLoading(false)
  }
  async function deleteRow(r: Row) {
    if (!confirm(`Delete "${r.name}"? This can't be undone.`)) return
    const { error } = await ops().from('ingredients').delete().eq('id', r.id)
    if (error) { alert(error.code === '23503' ? `Can't delete "${r.name}" — it's used in a recipe.` : error.message); return }
    load()
  }
  const canManage = role && canManageRecipes(role)

  // Department scope: bar shows drink ingredients, kitchen shows food ingredients
  const scoped = dept && DEPT_CATS[dept] ? rows.filter(r => DEPT_CATS[dept].includes(r.category)) : rows

  // Distinct suppliers, alphabetical — powers the supplier toggle
  const suppliers = Array.from(new Set(scoped.map(r => (r.supplier || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
  const categories = Array.from(new Set(scoped.map(r => r.category).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const vendorMap = new Map(vendors.map(v => [v.name, v]))
  const vendorNames = Array.from(new Set([...suppliers, ...vendors.map(v => v.name)].filter(Boolean))).sort((a, b) => a.localeCompare(b))

  const filtered = scoped.filter(r => {
    if (view === 'ingredients' && r.category === 'consumable') return false
    if (view === 'consumables' && r.category !== 'consumable') return false
    if (supplierFilter !== 'all' && (r.supplier || '').trim() !== supplierFilter) return false
    if (catFilter !== 'all' && r.category !== catFilter) return false
    if (filter && !(r.name.toLowerCase().includes(filter.toLowerCase()) || (r.supplier || '').toLowerCase().includes(filter.toLowerCase()))) return false
    return true
  })
  // Always alphabetical by name
  filtered.sort((a, b) => a.name.localeCompare(b.name))

  // Vendors view: group every item by supplier, alphabetical, "No supplier set" last
  const vendorGroups: [string, Row[]][] = (() => {
    const map = new Map<string, Row[]>()
    scoped.forEach(r => {
      if (filter && !(r.name.toLowerCase().includes(filter.toLowerCase()) || (r.supplier || '').toLowerCase().includes(filter.toLowerCase()))) return
      const key = (r.supplier || '').trim() || 'No supplier set'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    map.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)))
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'No supplier set') return 1
      if (b[0] === 'No supplier set') return -1
      return a[0].localeCompare(b[0])
    })
  })()

  function openEdit(r: Row) { if (!canManage) return; setEditing(r); setShowForm(true) }

  // --- Per-vendor order form helpers ---
  function buyAs(r: Row) { return r.purchase_unit_label || ('1 ' + r.base_unit) }
  function packPriceOf(r: Row) { return (r.current_cost_per_base || 0) * (r.purchase_unit_size || 1) }
  // --- Stock helpers (counts kept in base units, shown/entered in purchase units) ---
  function parInPurchase(r: Row) { return r.par_level_base != null && r.purchase_unit_size ? r.par_level_base / r.purchase_unit_size : null }
  function onHandInPurchase(r: Row) { return r.on_hand_base != null && r.purchase_unit_size ? r.on_hand_base / r.purchase_unit_size : null }
  function isLow(r: Row) { return r.par_level_base != null && r.on_hand_base != null && r.on_hand_base < r.par_level_base }
  function suggestedQty(r: Row) {
    if (r.par_level_base == null || r.on_hand_base == null || !r.purchase_unit_size) return 0
    const deficit = r.par_level_base - r.on_hand_base
    return deficit > 0 ? Math.ceil(deficit / r.purchase_unit_size) : 0
  }
  async function saveOnHand(r: Row, purchaseUnits: string) {
    const raw = purchaseUnits.trim()
    const v = raw === '' ? null : Number(raw)
    const base = v == null || Number.isNaN(v) ? null : v * (r.purchase_unit_size || 1)
    const { error } = await ops().from('ingredients').update({ on_hand_base: base, counted_at: new Date().toISOString() }).eq('id', r.id)
    if (error) { alert(error.message); return }
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, on_hand_base: base, counted_at: new Date().toISOString() } : x))
  }
  function fmtNum(n: number) { return Number.isInteger(n) ? String(n) : n.toFixed(1) }
  function orderLinesFor(items: Row[]) {
    return items.map(r => ({ r, q: Number(orderQty[r.id] || 0) })).filter(x => x.q > 0)
  }
  function orderTotal(items: Row[]) {
    return items.reduce((s, r) => s + packPriceOf(r) * Number(orderQty[r.id] || 0), 0)
  }
  function fillSuggested(items: Row[]) {
    setOrderQty(s => {
      const next = { ...s }
      items.forEach(r => { const sug = suggestedQty(r); if (sug > 0) next[r.id] = String(sug) })
      return next
    })
  }
  function sendOrder(vendor: string, items: Row[]) {
    const t = buildOrderText(vendor, items)
    if (!t) { alert('Set a quantity on at least one item first.'); return }
    const v = vendorMap.get(vendor)
    const phone = (v?.phone || '').replace(/[^0-9]/g, '')
    if (phone) { window.open(`https://wa.me/${phone}?text=${encodeURIComponent(t)}`, '_blank'); return }
    if (v?.email) { window.open(`mailto:${v.email}?subject=${encodeURIComponent('Order — ' + vendor)}&body=${encodeURIComponent(t)}`, '_blank'); return }
    alert('Add a phone or email to this vendor (Edit) to send directly — for now use Copy order.')
  }
  function openVendorEdit(name: string) {
    if (!canManage) return
    const existing = vendorMap.get(name)
    setEditVendor(existing || { name, contact_name: null, phone: null, email: null, order_notes: null, delivery_days: null })
    setShowVendorForm(true)
  }
  function buildOrderText(vendor: string, items: Row[]) {
    const lines = orderLinesFor(items)
    if (!lines.length) return ''
    const body = lines.map(({ r, q }) => `- ${q} x ${buyAs(r)} — ${r.name}`).join('\n')
    const total = lines.reduce((s, { r, q }) => s + packPriceOf(r) * q, 0)
    return `Order — ${vendor}\n${new Date().toLocaleDateString()}\n\n${body}\n\nEst. total: ${vnd(total)}`
  }
  async function copyOrder(vendor: string, items: Row[]) {
    const t = buildOrderText(vendor, items)
    if (!t) { alert('Set a quantity on at least one item first.'); return }
    try { await navigator.clipboard.writeText(t); alert('Order copied — paste it to your supplier.') }
    catch { window.prompt('Copy this order:', t) }
  }
  function printOrder(vendor: string, items: Row[]) {
    const lines = orderLinesFor(items)
    if (!lines.length) { alert('Set a quantity on at least one item first.'); return }
    const w = window.open('', '_blank'); if (!w) return
    const rows = lines.map(({ r, q }) => `<tr><td style="text-align:right">${q}</td><td>${buyAs(r)}</td><td>${r.name.replace(/</g, '&lt;')}</td><td style="text-align:right">${vnd(packPriceOf(r) * q)}</td></tr>`).join('')
    const total = lines.reduce((s, { r, q }) => s + packPriceOf(r) * q, 0)
    w.document.write(`<html><head><title>Order — ${vendor}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:640px;margin:30px auto;color:#1a1a1a;padding:0 20px}h1{margin:0 0 2px;font-size:20px}.sub{color:#666;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:7px 6px;border-bottom:1px solid #eee;text-align:left}tfoot td{font-weight:700;border-top:2px solid #333;border-bottom:none}</style></head><body><h1>Order — ${vendor}</h1><div class="sub">BigBamBoo · ${new Date().toLocaleDateString()}</div><table><thead><tr><th style="text-align:right">Qty</th><th>Buy as</th><th>Item</th><th style="text-align:right">Est. cost</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Est. total</td><td style="text-align:right">${vnd(total)}</td></tr></tfoot></table></body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>{dept === 'bar' ? 'Bar — Ingredients' : dept === 'kitchen' ? 'Kitchen — Ingredients' : 'Ingredients'}</h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2 }}>{view === 'vendors' ? `${vendorGroups.length} supplier${vendorGroups.length === 1 ? '' : 's'} · tap a supplier to build an order` : view === 'stock' ? `Count what you have in the units you buy · ${filtered.filter(isLow).length} below par` : `${filtered.length} ${view === 'consumables' ? 'consumables' : 'items'} · tap a row to edit, set supplier & see price history`}</div>
        </div>
        {canManage && <button onClick={() => { setEditing(null); setShowForm(true) }} style={btnPrimary}>+ Add ingredient</button>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['ingredients','consumables','stock','vendors','all'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '8px 16px', borderRadius: 100, fontSize: 14, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', background: view === v ? 'var(--accent)' : 'transparent', color: view === v ? '#fff' : 'var(--text-secondary)', border: '1px solid ' + (view === v ? 'var(--accent)' : 'var(--border)') }}>{v === 'all' ? 'All' : v}</button>
        ))}
        <div style={{ flex: 1 }} />
        {view !== 'vendors' && (
          <label style={{ fontSize: 13, color: 'var(--text-muted, #999)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Supplier
            <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} style={{ ...inp, width: 'auto', padding: '8px 10px' }}>
              <option value="all">All suppliers</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {view !== 'vendors' && categories.length > 1 && (
          <label style={{ fontSize: 13, color: 'var(--text-muted, #999)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Category
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inp, width: 'auto', padding: '8px 10px', textTransform: 'capitalize' }}>
              <option value="all">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>

      <input type="text" placeholder="Search by name or supplier…" value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inp, marginBottom: 12 }} />

      {view === 'vendors' ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {canManage && <div style={{ marginBottom: 4 }}><button onClick={() => openVendorEdit('')} style={btnPrimary}>+ Add vendor</button></div>}
          {vendorGroups.length === 0 && <div style={{ padding: 14, color: 'var(--text-muted, #999)' }}>No vendors yet. Tap “+ Add vendor”, or set a supplier on an ingredient.</div>}
          {vendorGroups.map(([vendor, items]) => {
            const isOpen = openVendor === vendor
            return (
              <div key={vendor} style={{ border: '1px solid var(--border, #eee)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-sidebar, #fafafa)' }}>
                  <button onClick={() => setOpenVendor(isOpen ? null : vendor)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--text, #333)' }}>
                    <span>{vendor === 'No supplier set' ? '— No supplier set —' : vendor}</span>
                    <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted, #999)' }}>{items.length} item{items.length === 1 ? '' : 's'}  {isOpen ? '▾' : '▸'}</span>
                  </button>
                  {canManage && vendor !== 'No supplier set' && (
                    <button onClick={() => openVendorEdit(vendor)} style={{ ...btnSecondary, margin: '0 10px', padding: '6px 12px' }}>Edit vendor</button>
                  )}
                </div>
                {isOpen && (
                  <div>
                    {(() => {
                      const v = vendorMap.get(vendor)
                      if (!v) return (canManage && vendor !== 'No supplier set')
                        ? <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted, #999)', borderBottom: '1px solid var(--border, #eee)' }}>No contact saved yet — tap “Edit vendor” to add phone / email so you can send orders.</div>
                        : null
                      const bits = [v.contact_name, v.phone, v.email, v.delivery_days && ('Delivery: ' + v.delivery_days)].filter(Boolean)
                      return (
                        <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary, #666)', borderBottom: '1px solid var(--border, #eee)' }}>
                          {bits.length ? bits.join('  ·  ') : 'No contact details yet'}
                          {v.order_notes && <div style={{ marginTop: 2, color: 'var(--text-muted, #999)' }}>{v.order_notes}</div>}
                        </div>
                      )
                    })()}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead><tr>
                        <th style={th}>Item</th>
                        <th style={th}>Buy as</th>
                        <th style={{ ...th, textAlign: 'right' }}>Order qty</th>
                        <th style={{ ...th, textAlign: 'right' }}>Est. cost</th>
                      </tr></thead>
                      <tbody>
                        {items.map(r => {
                          const q = Number(orderQty[r.id] || 0)
                          return (
                            <tr key={r.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                              <td style={td}>
                                <span style={{ fontWeight: 600 }}>{r.name}</span>
                                {isLow(r) && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: 'var(--bg-hover, #f3e6e9)', color: 'var(--burgundy, #7b2d3a)' }}>low</span>}
                                {canManage && <button onClick={() => openEdit(r)} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: 'var(--text-muted, #999)', cursor: 'pointer', fontSize: 12 }}>edit</button>}
                              </td>
                              <td style={{ ...td, color: 'var(--text-muted, #999)' }}>{buyAs(r)}</td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                <input inputMode="decimal" value={orderQty[r.id] || ''} onChange={e => setOrderQty(s => ({ ...s, [r.id]: e.target.value }))} placeholder={suggestedQty(r) > 0 ? String(suggestedQty(r)) : '0'} style={{ ...inp, width: 72, textAlign: 'right', padding: '6px 8px' }} />
                              </td>
                              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: q > 0 ? 'var(--text, #333)' : 'var(--text-muted, #bbb)' }}>{q > 0 ? vnd(packPriceOf(r) * q) : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid var(--border, #eee)', flexWrap: 'wrap', gap: 8, background: 'var(--bg-card, #fff)' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>Order total: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{vnd(orderTotal(items))}</span></span>
                      {canManage && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {items.some(r => suggestedQty(r) > 0) && <button onClick={() => fillSuggested(items)} style={btnSecondary}>Fill low items</button>}
                          {(vendorMap.get(vendor)?.phone || vendorMap.get(vendor)?.email) && <button onClick={() => sendOrder(vendor, items)} style={btnPrimary}>Send</button>}
                          <button onClick={() => copyOrder(vendor, items)} style={btnSecondary}>Copy order</button>
                          <button onClick={() => printOrder(vendor, items)} style={btnSecondary}>Print</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : view === 'stock' ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
            <th style={th}>Item</th>
            <th style={{ ...th, textAlign: 'right' }}>Par</th>
            <th style={{ ...th, textAlign: 'right' }}>On hand</th>
            <th style={{ ...th, textAlign: 'right' }}>Status</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={4} style={{ padding: 14, color: 'var(--text-muted, #999)' }}>Nothing to count yet.</td></tr>}
            {filtered.map(r => {
              const par = parInPurchase(r)
              const oh = onHandInPurchase(r)
              const low = isLow(r)
              const sug = suggestedQty(r)
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>{buyAs(r)}{r.supplier ? ' · ' + r.supplier : ''}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #666)' }}>{par != null ? fmtNum(par) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {canManage
                      ? <input inputMode="decimal" defaultValue={oh != null ? fmtNum(oh) : ''} onBlur={e => saveOnHand(r, e.target.value)} placeholder="—" style={{ ...inp, width: 84, textAlign: 'right', padding: '6px 8px' }} />
                      : (oh != null ? fmtNum(oh) : '—')}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {r.on_hand_base == null
                      ? <span style={{ fontSize: 12, color: 'var(--text-muted, #bbb)' }}>not counted</span>
                      : low
                        ? <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--burgundy, #7b2d3a)' }}>Low · order {sug}</span>
                        : <span style={{ fontSize: 12, color: '#6b7280' }}>OK</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
            <th style={th}>Name</th><th style={th}>Supplier</th><th style={th}>Category</th>
            <th style={{ ...th, textAlign: 'right' }}>Cost / base</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} style={{ padding: 14, color: 'var(--text-muted, #999)' }}>Nothing here yet.</td></tr>}
            {filtered.map(r => (
              <tr key={r.id} onClick={() => openEdit(r)} style={{ borderTop: '1px solid var(--border, #eee)', cursor: canManage ? 'pointer' : 'default' }}>
                <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                <td style={{ ...td, color: 'var(--text-secondary, #666)' }}>{r.supplier || '—'}</td>
                <td style={{ ...td, color: 'var(--text-muted, #999)' }}>{r.category}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{vnd(r.current_cost_per_base)} / {r.base_unit}</td>
                <td style={{ ...td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                  {canManage && <button onClick={() => deleteRow(r)} style={btnTrash} title="Delete" aria-label="Delete">🗑</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && venueId && (
        <IngredientForm venueId={venueId} editing={editing} vendorNames={vendorNames} onClose={() => { setShowForm(false); setEditing(null) }} onSaved={() => { setShowForm(false); setEditing(null); load() }} />
      )}
      {showVendorForm && venueId && editVendor && (
        <VendorForm venueId={venueId} editing={editVendor} onClose={() => { setShowVendorForm(false); setEditVendor(null) }} onSaved={() => { setShowVendorForm(false); setEditVendor(null); load() }} />
      )}
    </div>
  )
}

function VendorForm({ venueId, editing, onClose, onSaved }: { venueId: string; editing: VendorRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing.name === 'No supplier set' ? '' : editing.name)
  const [contactName, setContactName] = useState(editing.contact_name || '')
  const [phone, setPhone] = useState(editing.phone || '')
  const [email, setEmail] = useState(editing.email || '')
  const [delivery, setDelivery] = useState(editing.delivery_days || '')
  const [notes, setNotes] = useState(editing.order_notes || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const renaming = !!editing.name && editing.name !== 'No supplier set'

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setMsg('Vendor name is required.'); return }
    setSaving(true); setMsg(null)
    const newName = name.trim()
    const payload: any = {
      venue_id: venueId, name: newName,
      contact_name: contactName.trim() || null, phone: phone.trim() || null,
      email: email.trim() || null, order_notes: notes.trim() || null, delivery_days: delivery.trim() || null,
    }
    const res = editing.id
      ? await ops().from('vendors').update(payload).eq('id', editing.id)
      : await ops().from('vendors').insert(payload)
    if (res.error) { setSaving(false); setMsg(res.error.message); return }
    // Rename: propagate to every ingredient pointing at the old supplier name
    if (renaming && editing.name !== newName) {
      const { error } = await ops().from('ingredients').update({ supplier: newName }).eq('supplier', editing.name)
      if (error) { setSaving(false); setMsg('Vendor saved, but renaming its items failed: ' + error.message); return }
    }
    setSaving(false); onSaved()
  }

  return (
    <div style={modalBg} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>{renaming ? 'Edit vendor' : 'New vendor'}</h3>
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <Field label="Vendor name"><input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="e.g. Mega Market" autoFocus /></Field>
          {renaming && editing.name !== name.trim() && name.trim() !== '' && (
            <div style={{ fontSize: 12, color: 'var(--burgundy, #7b2d3a)' }}>Renaming will update every ingredient currently set to “{editing.name}”.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Contact name"><input value={contactName} onChange={e => setContactName(e.target.value)} style={inp} placeholder="Sales rep" /></Field>
            <Field label="Phone / WhatsApp"><input value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="e.g. 84901234567" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Email"><input value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="orders@vendor.com" /></Field>
            <Field label="Delivery days"><input value={delivery} onChange={e => setDelivery(e.target.value)} style={inp} placeholder="e.g. Mon & Thu" /></Field>
          </div>
          <Field label="Order notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} placeholder="Min order, account number, cut-off time…" /></Field>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: -4 }}>Add a phone (digits only, with country code) or email to enable the “Send” button on orders.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div>
              {editing.id && <button type="button" onClick={async () => {
                if (!confirm(`Delete vendor "${editing.name}"? This removes its contact details. Ingredients keep their supplier name.`)) return
                setSaving(true); setMsg(null)
                const { error } = await ops().from('vendors').delete().eq('id', editing.id!)
                setSaving(false)
                if (error) { setMsg(error.message); return }
                onSaved()
              }} style={{ ...btnSecondary, color: 'var(--burgundy, #7b2d3a)', borderColor: 'var(--burgundy, #7b2d3a)' }}>Delete</button>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save vendor'}</button>
            </div>
          </div>
          {msg && <div style={{ fontSize: 12, color: 'var(--burgundy, #7b2d3a)' }}>{msg}</div>}
        </form>
      </div>
    </div>
  )
}

function IngredientForm({ venueId, editing, vendorNames, onClose, onSaved }: { venueId: string; editing: Row | null; vendorNames: string[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name || '')
  const [category, setCategory] = useState(editing?.category || 'food')
  const [supplier, setSupplier] = useState(editing?.supplier || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [purchaseUnitLabel, setPurchaseUnitLabel] = useState(editing?.purchase_unit_label || '')
  const [purchaseUnitSize, setPurchaseUnitSize] = useState(String(editing?.purchase_unit_size ?? ''))
  const [baseUnit, setBaseUnit] = useState(editing?.base_unit || 'g')
  const [costMethod, setCostMethod] = useState(editing?.cost_method || 'manual')
  const [manualCost, setManualCost] = useState(String(editing?.manual_cost_per_base ?? editing?.current_cost_per_base ?? ''))
  const [packPrice, setPackPrice] = useState(editing && (editing.manual_cost_per_base ?? editing.current_cost_per_base) && editing.purchase_unit_size ? String(Math.round((editing.manual_cost_per_base ?? editing.current_cost_per_base) * editing.purchase_unit_size)) : '')
  const [parLevel, setParLevel] = useState(String(editing?.par_level_base ?? ''))
  const [history, setHistory] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (editing) ops().from('ingredient_price_history').select('observed_at, cost_per_base, source').eq('ingredient_id', editing.id).order('observed_at', { ascending: false }).limit(20).then(({ data }: any) => setHistory(data || []))
  }, [editing])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    // Only the name is required — everything else has a sensible default so a quick add always saves.
    if (!name.trim()) { setMsg('Give it a name and it’ll save.'); return }
    setSaving(true); setMsg(null)

    const puLabel = purchaseUnitLabel.trim() || ('1 ' + baseUnit)
    const puSize = Number(purchaseUnitSize) > 0 ? Number(purchaseUnitSize) : 1
    const perBaseFromPack = packPrice && puSize ? Number(packPrice) / puSize : null
    // A typed cost or pack price is always treated as a manual price so it actually sticks.
    const typedCost = perBaseFromPack != null ? perBaseFromPack : (manualCost ? Number(manualCost) : null)
    const useManual = typedCost != null || costMethod === 'manual'
    const newCost = useManual ? typedCost : (editing?.current_cost_per_base ?? null)

    const payload: any = {
      venue_id: venueId, name: name.trim(), category, supplier: supplier.trim() || null, notes: notes.trim() || null,
      purchase_unit_label: puLabel, purchase_unit_size: puSize,
      base_unit: baseUnit, cost_method: useManual ? 'manual' : costMethod,
      manual_cost_per_base: useManual ? newCost : null,
      current_cost_per_base: newCost != null ? newCost : (editing?.current_cost_per_base ?? 0),
      par_level_base: parLevel ? Number(parLevel) : null,
    }

    let id = editing?.id
    if (editing) {
      const { error } = await ops().from('ingredients').update(payload).eq('id', editing.id)
      if (error) { setSaving(false); setMsg(error.message); return }
    } else {
      const { data, error } = await ops().from('ingredients').insert(payload).select('id').single()
      if (error) { setSaving(false); setMsg(error.message); return }
      id = data?.id
    }
    // Log a price-history point whenever the cost changed (non-blocking).
    if (id && newCost != null && (!editing || Number(editing.manual_cost_per_base ?? editing.current_cost_per_base) !== Number(newCost))) {
      const { error: hErr } = await ops().from('ingredient_price_history').insert({ ingredient_id: id, cost_per_base: newCost, observed_at: new Date().toISOString(), source: 'manual' })
      if (hErr) console.warn('price history not recorded:', hErr.message)
    }
    setSaving(false); onSaved()
  }

  const livePerBase = packPrice && Number(purchaseUnitSize) > 0 ? Number(packPrice) / Number(purchaseUnitSize) : null

  return (
    <div style={modalBg} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>{editing ? editing.name : 'New ingredient'}</h3>
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="e.g. Kewpie mayonnaise" autoFocus /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Supplier / where you buy it"><input value={supplier} list="ing-vendor-list" onChange={e => setSupplier(e.target.value)} style={inp} placeholder="Pick or type a vendor…" /><datalist id="ing-vendor-list">{vendorNames.map(v => <option key={v} value={v} />)}</datalist></Field>
            <Field label="Category"><select value={category} onChange={e => setCategory(e.target.value)} style={inp}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} placeholder="Brand, pack details, substitutes…" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <Field label="Purchase unit (optional)"><input value={purchaseUnitLabel} onChange={e => setPurchaseUnitLabel(e.target.value)} style={inp} placeholder="1kg bag" /></Field>
            <Field label="Size (optional)"><input inputMode="decimal" value={purchaseUnitSize} onChange={e => setPurchaseUnitSize(e.target.value)} style={inp} placeholder="1000" /></Field>
            <Field label="Base unit"><select value={baseUnit} onChange={e => setBaseUnit(e.target.value)} style={inp}>{BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Price you paid for the pack (₫)"><input inputMode="decimal" value={packPrice} onChange={e => { setPackPrice(e.target.value); if (e.target.value) setManualCost('') }} style={inp} placeholder="e.g. 600000" /></Field>
            <Field label={'…or cost per ' + baseUnit + ' (₫)'}><input inputMode="decimal" value={manualCost} onChange={e => { setManualCost(e.target.value); if (e.target.value) setPackPrice('') }} style={inp} placeholder="e.g. 200" /></Field>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary, #999)', marginTop: -4 }}>
            {livePerBase != null
              ? '= ' + vnd(livePerBase) + ' per ' + baseUnit + ' (' + vnd(Number(packPrice)) + ' ÷ ' + Number(purchaseUnitSize) + ' ' + baseUnit + ')'
              : 'Enter the pack price + the size, and the cost per ' + baseUnit + ' is worked out for you — or just type the cost per ' + baseUnit + ' directly.'}
          </div>
          <Field label={'Par level (' + baseUnit + ', optional)'}><input inputMode="decimal" value={parLevel} onChange={e => setParLevel(e.target.value)} style={inp} /></Field>

          {editing && (
            <div style={{ borderTop: '1px solid var(--border, #eee)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>Price history</div>
              {history.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted, #999)' }}>No changes recorded yet. Saving a new cost will start the history.</div>
                : history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', color: 'var(--text-secondary, #666)' }}>
                    <span>{new Date(h.observed_at).toLocaleDateString()}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text, #333)' }}>{vnd(h.cost_per_base)} / {editing.base_unit}</span>
                  </div>
                ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
          {msg && <div style={{ fontSize: 12, color: 'var(--burgundy, #7b2d3a)' }}>{msg}</div>}
        </form>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}><div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary, #999)', marginBottom: 4 }}>{label}</div>{children}</label>
)
const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-input, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th = { padding: '10px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '9px 16px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const btnSecondary = { padding: '9px 16px', background: 'transparent', color: 'var(--text-secondary, #666)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, fontSize: 14, cursor: 'pointer' }
const btnTrash = { padding: '4px 8px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: 'none', cursor: 'pointer', fontSize: 15 }
const modalBg = { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }
const modal = { background: 'var(--bg-card, #fff)', padding: 22, borderRadius: 12, width: 'min(560px, 94vw)', maxHeight: '90vh', overflowY: 'auto' as const }

export default function IngredientsPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>}>
      <IngredientsInner />
    </Suspense>
  )
}
