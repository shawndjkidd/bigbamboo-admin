'use client'
// Manager review of stock counts submitted from the Kitchen/Bar stock sheets.
// Review the counted figures, then Apply to push them onto live on-hand levels.
import { useEffect, useState } from 'react'
import { ops, vnd, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

export default function StockCountsPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [counts, setCounts] = useState<any[]>([])
  const [items, setItems] = useState<Record<string, any[]>>({})
  const [ings, setIngs] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { init() }, [])
  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user?.email).maybeSingle()
    setRole((su?.role || 'staff') as StaffRole)
    await load(); setLoading(false)
  }
  async function load() {
    const { data: cs } = await ops().from('stock_counts').select('*').order('submitted_at', { ascending: false }).limit(50)
    setCounts(cs || [])
    const ids = (cs || []).map((c: any) => c.id)
    if (!ids.length) return
    const { data: its } = await ops().from('stock_count_items').select('*').in('count_id', ids)
    const byC: Record<string, any[]> = {}
    ;(its || []).forEach((it: any) => { (byC[it.count_id] = byC[it.count_id] || []).push(it) })
    setItems(byC)
    const ingIds = Array.from(new Set((its || []).map((it: any) => it.ingredient_id)))
    if (ingIds.length) {
      const { data: ig } = await ops().from('ingredients').select('id,name,base_unit,on_hand_base,par_level_base').in('id', ingIds)
      const m: Record<string, any> = {}; (ig || []).forEach((i: any) => { m[i.id] = i }); setIngs(m)
    }
  }
  async function apply(id: string) {
    if (!confirm('Apply this count to your live on-hand stock levels?')) return
    const { error } = await ops().rpc('apply_stock_count', { p_count: id })
    if (error) { setMsg('Error: ' + error.message); return }
    setMsg('Applied to stock'); setTimeout(() => setMsg(''), 2500); await load()
  }
  async function setPar(ingredientId: string, value: string) {
    const par = value.trim() === '' ? null : Number(value.replace(/[^\d.]/g, ''))
    await ops().from('ingredients').update({ par_level_base: par }).eq('id', ingredientId)
    setIngs(prev => ({ ...prev, [ingredientId]: { ...prev[ingredientId], par_level_base: par } }))
    setMsg('Par level saved'); setTimeout(() => setMsg(''), 1800)
  }
  // Turn an off-list count line into a real ingredient (manager has write access), then link it.
  async function createIngredient(count: any, it: any) {
    const cat = count.station === 'bar' ? 'mixer' : 'food'
    const unit = it.purchase_unit_label || 'each'
    const { data: ing, error } = await ops().from('ingredients').insert({
      venue_id: count.venue_id, name: it.new_item_name, base_unit: unit,
      purchase_unit_label: unit, purchase_unit_size: 1, current_cost_per_base: 0,
      on_hand_base: Number(it.counted_base), category: cat, active: true,
    }).select('id,name,base_unit,on_hand_base,par_level_base').single()
    if (error) { setMsg('Error: ' + error.message); return }
    await ops().from('stock_count_items').update({ ingredient_id: ing.id }).eq('id', it.id)
    setMsg('Ingredient created — set its cost on the Ingredients page'); setTimeout(() => setMsg(''), 3000)
    await load()
  }

  if (loading) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Loading…</div>
  if (!(role && canManageRecipes(role))) return <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>Managers only.</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 22, fontWeight: 600 }}>Stock counts</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 18 }}>Counts submitted by kitchen/bar staff. Review, then apply to update on-hand levels.</div>
      {msg && <div style={{ background: '#e7f5ec', color: '#1d7a46', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{msg}</div>}
      {counts.length === 0 && <div style={{ color: 'var(--text-muted, #999)', fontSize: 14 }}>No counts submitted yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {counts.map(c => {
          const its = items[c.id] || []
          const isOpen = open === c.id
          return (
            <div key={c.id} className="card" style={{ padding: isOpen ? 18 : '12px 16px' }}>
              <div onClick={() => setOpen(isOpen ? null : c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <span style={{ color: 'var(--text-muted, #999)', fontSize: 13, width: 14 }}>{isOpen ? '▾' : '▸'}</span>
                <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{c.business_date} · {c.station}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>{c.counted_by_name || c.counted_by_email} · {its.length} items</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: c.status === 'applied' ? 'var(--badge-green-bg, #e7f5ec)' : 'var(--badge-orange-bg, #fdecdc)', color: c.status === 'applied' ? '#1d7a46' : '#b8631c' }}>{c.status}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
                      <th style={th}>Item</th><th style={{ ...th, textAlign: 'right' }}>Counted</th><th style={{ ...th, textAlign: 'right' }}>On hand now</th><th style={{ ...th, textAlign: 'right' }}>Par level</th>
                    </tr></thead>
                    <tbody>
                      {its.map(it => {
                        const ing = ings[it.ingredient_id] || {}
                        const isNew = !it.ingredient_id
                        return (
                          <tr key={it.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                            <td style={td}>{isNew ? <>{it.new_item_name} <span style={{ fontSize: 10, color: '#b8631c', background: 'var(--badge-orange-bg, #fdecdc)', padding: '1px 6px', borderRadius: 100 }}>NEW</span></> : (ing.name || '—')}</td>
                            <td style={{ ...td, textAlign: 'right' }}>{Number(it.counted_units)} {it.purchase_unit_label || ''}{!isNew && <span style={{ color: 'var(--text-muted, #999)' }}> = {Number(it.counted_base)} {ing.base_unit || ''}</span>}</td>
                            <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #999)' }}>{isNew ? '—' : (ing.on_hand_base != null ? `${Number(ing.on_hand_base)} ${ing.base_unit || ''}` : '—')}</td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              {isNew
                                ? <button onClick={() => createIngredient(c, it)} style={{ padding: '5px 10px', fontSize: 12, background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Create item</button>
                                : <input defaultValue={ing.par_level_base ?? ''} onBlur={e => e.target.value !== String(ing.par_level_base ?? '') && setPar(it.ingredient_id, e.target.value)} placeholder="—" style={{ width: 80, padding: '5px 8px', fontSize: 13, textAlign: 'right', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {c.status !== 'applied'
                    ? <button onClick={() => apply(c.id)} style={{ marginTop: 14, padding: '10px 18px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Apply to stock</button>
                    : <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted, #999)' }}>Applied {c.applied_at ? new Date(c.applied_at).toLocaleString() : ''}{c.applied_by ? ' by ' + c.applied_by : ''}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const th = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td = { padding: '8px 12px', color: 'var(--text, #333)' }
