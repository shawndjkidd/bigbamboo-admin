'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ops, vnd, pct, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type RecipeWithCost = {
  recipe_id: string
  name: string
  type: string
  category: string
  yield_qty: number
  yield_unit: string
  sale_price: number | null
  total_cost: number
  cost_per_unit: number | null
  margin_per_unit: number | null
}

export default function RecipesPage() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [venueId, setVenueId] = useState<string | null>(null)
  const [rows, setRows] = useState<RecipeWithCost[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'menu_item' | 'batch' | 'sub_recipe'>('all')

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
    const { data } = await ops().from('v_recipe_cost').select('*').order('name')
    setRows((data as RecipeWithCost[]) || [])
    setLoading(false)
  }

  const canManage = role && canManageRecipes(role)
  const filtered = rows.filter(r => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    if (filter && !r.name.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  if (loading) return <div style={{ color: '#999', fontSize: 14 }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Recipes</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 2 }}>
            {rows.length} recipes · cost auto-updates when ingredient prices change
          </div>
        </div>
        {canManage && (
          <Link href="/dashboard/ops/recipes/new" style={btnPrimary as any}>+ Add recipe</Link>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="text" placeholder="Search…" value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inp, flex: 1 }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ ...inp, width: 160 }}>
          <option value="all">All types</option>
          <option value="menu_item">Menu items</option>
          <option value="batch">Batches / kegs</option>
          <option value="sub_recipe">Sub-recipes</option>
        </select>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={th}>Name</th><th style={th}>Type</th><th style={th}>Category</th>
          <th style={{ ...th, textAlign: 'right' }}>Yield</th>
          <th style={{ ...th, textAlign: 'right' }}>Cost / unit</th>
          <th style={{ ...th, textAlign: 'right' }}>Price</th>
          <th style={{ ...th, textAlign: 'right' }}>Margin</th>
          <th style={{ ...th, textAlign: 'right' }}>Margin %</th>
        </tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No recipes yet. {canManage && 'Click "Add recipe" to start.'}</td></tr>}
          {filtered.map(r => {
            const marginPct = r.sale_price && r.margin_per_unit != null ? r.margin_per_unit / r.sale_price : null
            return (
              <tr key={r.recipe_id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}><Link href={`/dashboard/ops/recipes/${r.recipe_id}`} style={{ color: 'var(--accent, #e87830)', textDecoration: 'none', fontWeight: 600 }}>{r.name}</Link></td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{r.type}</td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{r.category}</td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #666)' }}>{Number(r.yield_qty)} {r.yield_unit}</td>
                <td style={{ ...td, textAlign: 'right' }}>{vnd(r.cost_per_unit)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.sale_price ? vnd(r.sale_price) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.margin_per_unit != null ? vnd(r.margin_per_unit) : '—'}</td>
                <td style={{ ...td, textAlign: 'right', color: marginPct == null ? 'var(--text-muted, #999)' : marginPct < 0.5 ? '#C00000' : marginPct < 0.7 ? '#C65911' : '#548235' }}>
                  {pct(marginPct)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const inp = { padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
