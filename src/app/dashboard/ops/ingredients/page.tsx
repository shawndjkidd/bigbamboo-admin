'use client'
import { useEffect, useState } from 'react'
import { ops, vnd, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

const CATEGORIES = [
  'spirit', 'beer', 'wine', 'mixer', 'syrup', 'garnish', 'food', 'consumable', 'other',
] as const
const BASE_UNITS = ['ml', 'g', 'each'] as const
const COST_METHODS = [
  { v: 'latest', label: 'Latest price' },
  { v: 'average', label: 'Rolling average (90d)' },
  { v: 'fifo', label: 'FIFO' },
  { v: 'manual', label: 'Manual override' },
] as const

type Row = {
  id: string
  name: string
  category: string
  purchase_unit_label: string
  purchase_unit_size: number
  base_unit: string
  current_cost_per_base: number
  cost_method: string
  manual_cost_per_base: number | null
  par_level_base: number | null
  active: boolean
}

export default function IngredientsPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()

    const user = session?.user
    if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).single()
    setRole(su?.role || 'staff')
    const { data: venue } = await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()
    setVenueId(venue?.id || null)
    await load()
  }

  async function load() {
    setLoading(true)
    const { data } = await ops().from('ingredients').select('*').order('name')
    setRows((data as Row[]) || [])
    setLoading(false)
  }

  async function deleteRow(r: Row) {
    if (!confirm(`Delete "${r.name}"? This can't be undone.`)) return
    const { error } = await ops().from('ingredients').delete().eq('id', r.id)
    if (error) {
      alert(error.code === '23503'
        ? `Can't delete "${r.name}" — it's used in a recipe. Remove it from that recipe first.`
        : error.message)
      return
    }
    load()
  }

  const canManage = role && canManageRecipes(role)
  const filtered = rows.filter(r =>
    !filter || r.name.toLowerCase().includes(filter.toLowerCase()) || r.category.toLowerCase().includes(filter.toLowerCase()))

  if (loading) return <div style={{ color: '#999', fontSize: 14 }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Ingredients</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 2 }}>
            {rows.length} ingredients · cost auto-updates when you log purchases linked to them
          </div>
        </div>
        {canManage && (
          <button onClick={() => { setEditing(null); setShowForm(true) }} style={btnPrimary}>+ Add ingredient</button>
        )}
      </div>

      <input
        type="text"
        placeholder="Search by name or category…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ ...inp, marginBottom: 12 }}
      />

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={th}>Name</th><th style={th}>Category</th><th style={th}>Purchase Unit</th>
          <th style={{ ...th, textAlign: 'right' }}>Cost / {' '}base</th>
          <th style={th}>Method</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No ingredients yet. {canManage && 'Click "Add ingredient" to start.'}</td></tr>}
          {filtered.map(r => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
              <td style={td}><strong>{r.name}</strong></td>
              <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{r.category}</td>
              <td style={{ ...td, color: 'var(--text-muted, #666)' }}>{r.purchase_unit_label} = {r.purchase_unit_size} {r.base_unit}</td>
              <td style={{ ...td, textAlign: 'right' }}>{vnd(r.current_cost_per_base)} / {r.base_unit}</td>
              <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{r.cost_method}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {canManage && (
                  <>
                    <button onClick={() => { setEditing(r); setShowForm(true) }} style={btnLink}>Edit</button>
                    <button onClick={() => deleteRow(r)} style={btnTrash} title="Delete ingredient" aria-label="Delete ingredient">🗑</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && venueId && (
        <IngredientForm
          venueId={venueId}
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function IngredientForm({ venueId, editing, onClose, onSaved }: {
  venueId: string; editing: Row | null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name || '')
  const [category, setCategory] = useState(editing?.category || 'spirit')
  const [purchaseUnitLabel, setPurchaseUnitLabel] = useState(editing?.purchase_unit_label || '')
  const [purchaseUnitSize, setPurchaseUnitSize] = useState(String(editing?.purchase_unit_size || ''))
  const [baseUnit, setBaseUnit] = useState(editing?.base_unit || 'ml')
  const [costMethod, setCostMethod] = useState(editing?.cost_method || 'latest')
  const [manualCost, setManualCost] = useState(String(editing?.manual_cost_per_base || ''))
  const [parLevel, setParLevel] = useState(String(editing?.par_level_base || ''))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !purchaseUnitLabel || !purchaseUnitSize) { setMsg('Required fields missing'); return }
    setSaving(true)
    setMsg(null)
    const payload: any = {
      venue_id: venueId, name, category,
      purchase_unit_label: purchaseUnitLabel,
      purchase_unit_size: Number(purchaseUnitSize),
      base_unit: baseUnit, cost_method: costMethod,
      manual_cost_per_base: costMethod === 'manual' && manualCost ? Number(manualCost) : null,
      par_level_base: parLevel ? Number(parLevel) : null,
    }
    const { error } = editing
      ? await ops().from('ingredients').update(payload).eq('id', editing.id)
      : await ops().from('ingredients').insert(payload)
    setSaving(false)
    if (error) { setMsg(error.message); return }
    onSaved()
  }

  return (
    <div style={modalBg} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          {editing ? 'Edit ingredient' : 'New ingredient'}
        </h3>
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <Field label="Name">
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bombay Gin" style={inp} />
          </Field>
          <Field label="Category">
            <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
            <Field label="Purchase unit">
              <input type="text" required value={purchaseUnitLabel} onChange={e => setPurchaseUnitLabel(e.target.value)} placeholder="1L bottle" style={inp} />
            </Field>
            <Field label="Size">
              <input type="number" required step="0.0001" value={purchaseUnitSize} onChange={e => setPurchaseUnitSize(e.target.value)} placeholder="1000" style={inp} />
            </Field>
            <Field label="Base unit">
              <select value={baseUnit} onChange={e => setBaseUnit(e.target.value)} style={inp}>
                {BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: -8 }}>
            e.g. "1L bottle" with size 1000 and base "ml" = 1000ml per bottle
          </div>
          <Field label="Cost method">
            <select value={costMethod} onChange={e => setCostMethod(e.target.value)} style={inp}>
              {COST_METHODS.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </Field>
          {costMethod === 'manual' && (
            <Field label={`Manual cost per ${baseUnit} (VND)`}>
              <input type="number" step="0.01" value={manualCost} onChange={e => setManualCost(e.target.value)} placeholder="500" style={inp} />
            </Field>
          )}
          <Field label={`Par level (${baseUnit}, optional)`}>
            <input type="number" step="0.01" value={parLevel} onChange={e => setParLevel(e.target.value)} placeholder="3000" style={inp} />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
          {msg && <div style={{ fontSize: 12, color: '#C00000' }}>{msg}</div>}
        </form>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 4 }}>{label}</div>
    {children}
  </label>
)

const inp = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnSecondary = { padding: '8px 14px', background: 'transparent', color: 'var(--text-muted, #666)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }
const btnLink = { padding: '4px 8px', background: 'transparent', color: 'var(--accent, #e87830)', border: 'none', cursor: 'pointer', fontSize: 12 }
const btnTrash = { padding: '4px 8px', background: 'transparent', color: 'var(--badge-red-text, #C00000)', border: 'none', cursor: 'pointer', fontSize: 14 }
const modalBg = { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modal = { background: 'var(--bg-card, #fff)', padding: 20, borderRadius: 8, width: 'min(480px, 92vw)', maxHeight: '90vh', overflowY: 'auto' as const }
