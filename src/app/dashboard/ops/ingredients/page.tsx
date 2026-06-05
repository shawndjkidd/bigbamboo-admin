'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

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
}

export default function IngredientsPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<'ingredients' | 'consumables' | 'all'>('ingredients')
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
    const { data } = await ops().from('ingredients').select('*').order('name')
    setRows((data as Row[]) || []); setLoading(false)
  }
  async function deleteRow(r: Row) {
    if (!confirm(`Delete "${r.name}"? This can't be undone.`)) return
    const { error } = await ops().from('ingredients').delete().eq('id', r.id)
    if (error) { alert(error.code === '23503' ? `Can't delete "${r.name}" — it's used in a recipe.` : error.message); return }
    load()
  }
  const canManage = role && canManageRecipes(role)
  const filtered = rows.filter(r => {
    if (view === 'ingredients' && r.category === 'consumable') return false
    if (view === 'consumables' && r.category !== 'consumable') return false
    if (filter && !(r.name.toLowerCase().includes(filter.toLowerCase()) || (r.supplier || '').toLowerCase().includes(filter.toLowerCase()))) return false
    return true
  })
  function openEdit(r: Row) { if (!canManage) return; setEditing(r); setShowForm(true) }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Ingredients</h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2 }}>{filtered.length} {view === 'consumables' ? 'consumables' : 'items'} · tap a row to edit, set supplier &amp; see price history</div>
        </div>
        {canManage && <button onClick={() => { setEditing(null); setShowForm(true) }} style={btnPrimary}>+ Add ingredient</button>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['ingredients','consumables','all'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '8px 16px', borderRadius: 100, fontSize: 14, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', background: view === v ? 'var(--accent)' : 'transparent', color: view === v ? '#fff' : 'var(--text-secondary)', border: '1px solid ' + (view === v ? 'var(--accent)' : 'var(--border)') }}>{v === 'all' ? 'All' : v}</button>
        ))}
      </div>

      <input type="text" placeholder="Search by name or supplier…" value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inp, marginBottom: 12 }} />

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

      {showForm && venueId && (
        <IngredientForm venueId={venueId} editing={editing} onClose={() => { setShowForm(false); setEditing(null) }} onSaved={() => { setShowForm(false); setEditing(null); load() }} />
      )}
    </div>
  )
}

function IngredientForm({ venueId, editing, onClose, onSaved }: { venueId: string; editing: Row | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name || '')
  const [category, setCategory] = useState(editing?.category || 'food')
  const [supplier, setSupplier] = useState(editing?.supplier || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [purchaseUnitLabel, setPurchaseUnitLabel] = useState(editing?.purchase_unit_label || '')
  const [purchaseUnitSize, setPurchaseUnitSize] = useState(String(editing?.purchase_unit_size ?? ''))
  const [baseUnit, setBaseUnit] = useState(editing?.base_unit || 'g')
  const [costMethod, setCostMethod] = useState(editing?.cost_method || 'manual')
  const [manualCost, setManualCost] = useState(String(editing?.manual_cost_per_base ?? editing?.current_cost_per_base ?? ''))
  const [packPrice, setPackPrice] = useState(editing && (editing.manual_cost_per_base ?? editing.current_cost_per_base) ? String(Math.round((editing.manual_cost_per_base ?? editing.current_cost_per_base) * (editing.purchase_unit_size || 1))) : '')
  const [parLevel, setParLevel] = useState(String(editing?.par_level_base ?? ''))
  const [history, setHistory] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (editing) ops().from('ingredient_price_history').select('observed_at, cost_per_base, source').eq('ingredient_id', editing.id).order('observed_at', { ascending: false }).limit(20).then(({ data }: any) => setHistory(data || []))
  }, [editing])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !purchaseUnitLabel || !purchaseUnitSize) { setMsg('Name, purchase unit and size are required'); return }
    setSaving(true); setMsg(null)
    const sizeNum = Number(purchaseUnitSize) || 0
    const perBaseFromPack = packPrice && sizeNum ? Number(packPrice) / sizeNum : null
    const newCost = costMethod === 'manual' ? (perBaseFromPack != null ? perBaseFromPack : (manualCost ? Number(manualCost) : null)) : (editing?.current_cost_per_base ?? null)
    const payload: any = {
      venue_id: venueId, name, category, supplier: supplier || null, notes: notes || null,
      purchase_unit_label: purchaseUnitLabel, purchase_unit_size: Number(purchaseUnitSize),
      base_unit: baseUnit, cost_method: costMethod,
      manual_cost_per_base: costMethod === 'manual' ? newCost : null,
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
    if (id && newCost != null && (!editing || Number(editing.manual_cost_per_base) !== Number(newCost))) {
      await ops().from('ingredient_price_history').insert({ ingredient_id: id, cost_per_base: newCost, observed_at: new Date().toISOString(), source: 'manual' })
    }
    setSaving(false); onSaved()
  }

  return (
    <div style={modalBg} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>{editing ? editing.name : 'New ingredient'}</h3>
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="e.g. Kewpie mayonnaise" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Supplier / where you buy it"><input value={supplier} onChange={e => setSupplier(e.target.value)} style={inp} placeholder="e.g. Metro, Annam" /></Field>
            <Field label="Category"><select value={category} onChange={e => setCategory(e.target.value)} style={inp}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} placeholder="Brand, pack details, substitutes…" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <Field label="Purchase unit"><input value={purchaseUnitLabel} onChange={e => setPurchaseUnitLabel(e.target.value)} style={inp} placeholder="1kg bag" /></Field>
            <Field label="Size"><input inputMode="decimal" value={purchaseUnitSize} onChange={e => setPurchaseUnitSize(e.target.value)} style={inp} placeholder="1000" /></Field>
            <Field label="Base unit"><select value={baseUnit} onChange={e => setBaseUnit(e.target.value)} style={inp}>{BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Cost method"><select value={costMethod} onChange={e => setCostMethod(e.target.value)} style={inp}>{COST_METHODS.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}</select></Field>
            <Field label="Price you paid for the pack (₫)"><input inputMode="decimal" value={packPrice} onChange={e => setPackPrice(e.target.value)} style={inp} placeholder="e.g. 600000" /></Field>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary, #999)', marginTop: -4 }}>
            {packPrice && Number(purchaseUnitSize) > 0
              ? '= ' + vnd(Number(packPrice) / Number(purchaseUnitSize)) + ' per ' + baseUnit + ' (' + vnd(Number(packPrice)) + ' ÷ ' + Number(purchaseUnitSize) + ' ' + baseUnit + ')'
              : 'Enter the pack price + the size above and the cost per ' + baseUnit + ' is worked out for you.'}
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
