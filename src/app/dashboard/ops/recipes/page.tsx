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
  const [typeFilter, setTypeFilter] = useState<'all' | 'menu_item' | 'prep'>('all')
  const [station, setStation] = useState<'all' | 'kitchen' | 'bar'>('all')
  const [resaleIds, setResaleIds] = useState<Set<string>>(new Set())
  const [keggedIds, setKeggedIds] = useState<Set<string>>(new Set())
  const [serveCost, setServeCost] = useState<Map<string, number>>(new Map())
  const [showResale, setShowResale] = useState(false)

  useEffect(() => { init() }, [])

  // Remember the station this device is set to (kitchen tablet stays on food,
  // bar tablet stays on drinks) so staff don't have to re-pick every visit.
  useEffect(() => {
    try {
      const s = localStorage.getItem('bbb_recipe_station')
      if (s === 'kitchen' || s === 'bar' || s === 'all') setStation(s)
    } catch {}
  }, [])

  function chooseStation(s: 'all' | 'kitchen' | 'bar') {
    setStation(s)
    try { localStorage.setItem('bbb_recipe_station', s) } catch {}
  }

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
    const [{ data }, { data: rec }, { data: serve }] = await Promise.all([
      ops().from('v_recipe_cost').select('*').order('name'),
      ops().from('recipes').select('id, is_resale, is_kegged'),
      ops().from('v_recipe_serve_cost').select('recipe_id, serve_cost'),
    ])
    setRows((data as RecipeWithCost[]) || [])
    setResaleIds(new Set((rec || []).filter((x: any) => x.is_resale).map((x: any) => x.id)))
    setKeggedIds(new Set((rec || []).filter((x: any) => x.is_kegged).map((x: any) => x.id)))
    setServeCost(new Map((serve || []).map((x: any) => [x.recipe_id, Number(x.serve_cost)])))
    setLoading(false)
  }

  const canManage = role && canManageRecipes(role)
  const filtered = rows.filter(r => {
    if (!showResale && resaleIds.has(r.recipe_id)) return false
    if (station === 'kitchen' && r.category !== 'food') return false
    if (station === 'bar' && !BAR_CATEGORIES.has(r.category)) return false
    if (typeFilter === 'menu_item' && r.type !== 'menu_item') return false
    if (typeFilter === 'prep' && r.type === 'menu_item') return false
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
            {filtered.length} {showResale ? 'recipes' : 'made in-house'}{!showResale && resaleIds.size ? ` · ${resaleIds.size} bought-in hidden` : ''} · cost auto-updates when ingredient prices change
          </div>
        </div>
        {canManage && (
          <Link href="/dashboard/ops/recipes/new" style={btnPrimary as any}>+ Add recipe</Link>
        )}
      </div>

      <div style={{ display: 'inline-flex', gap: 0, marginBottom: 12, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, overflow: 'hidden' }}>
        {([['all', 'All'], ['kitchen', 'Kitchen'], ['bar', 'Bar']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => chooseStation(val)}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
              borderRight: val !== 'bar' ? '1px solid var(--border, #e5e5e5)' : 'none',
              background: station === val ? 'var(--accent, #e87830)' : 'var(--bg-card, #fff)',
              color: station === val ? '#fff' : 'var(--text-muted, #777)',
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="text" placeholder="Search…" value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inp, flex: 1 }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} style={{ ...inp, width: 180 }}>
          <option value="all">All types</option>
          <option value="menu_item">Menu items</option>
          <option value="prep">Prep &amp; batches</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted, #999)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showResale} onChange={e => setShowResale(e.target.checked)} /> Show bought-in
        </label>
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
            // Kegged drinks: v_recipe_cost.cost_per_unit is per-ml of the whole keg, so the list
            // would show a near-zero cost and a meaningless ~100% margin. Use the pour-aware
            // serve cost instead and recompute margin against the pour price.
            const kegged = keggedIds.has(r.recipe_id)
            const cost = kegged ? (serveCost.get(r.recipe_id) ?? r.cost_per_unit) : r.cost_per_unit
            const margin = r.sale_price != null && cost != null ? r.sale_price - cost : r.margin_per_unit
            const marginPct = r.sale_price && margin != null ? margin / r.sale_price : null
            return (
              <tr key={r.recipe_id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}><Link href={`/dashboard/ops/recipes/${r.recipe_id}`} style={{ color: 'var(--accent, #e87830)', textDecoration: 'none', fontWeight: 600 }}>{r.name}</Link></td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{r.type}</td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{r.category}</td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #666)' }}>{Number(r.yield_qty)} {r.yield_unit}</td>
                <td style={{ ...td, textAlign: 'right' }}>{vnd(cost)}{kegged ? <span style={{ fontSize: 10, color: 'var(--text-muted, #999)' }}> /pour</span> : ''}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.sale_price ? vnd(r.sale_price) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{margin != null ? vnd(margin) : '—'}</td>
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

const BAR_CATEGORIES = new Set(['cocktail', 'beer', 'wine', 'na_drink', 'syrup'])

const inp = { padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
