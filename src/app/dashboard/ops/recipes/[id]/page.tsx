'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ops, vnd, pct, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Recipe = {
  id: string; name: string; type: string; category: string;
  yield_qty: number; yield_unit: string; sale_price: number | null;
  is_kegged: boolean; keg_size_ml: number | null; pour_size_ml: number | null;
  description: string | null; active: boolean;
  method: string | null; subtitle: string | null; image_url: string | null;
}

type Component = {
  id: string; recipe_id: string;
  ingredient_id: string | null; sub_recipe_id: string | null;
  qty: number; unit: string; notes: string | null; sort_order: number;
  ingredient?: { name: string; current_cost_per_base: number; base_unit: string } | null;
  sub_recipe?: { name: string } | null;
}

type Cost = { recipe_id: string; total_cost: number; cost_per_unit: number | null; margin_per_unit: number | null }
type IngOption = { id: string; name: string; base_unit: string; current_cost_per_base: number }
type RecOption = { id: string; name: string }

export default function RecipeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const recipeId = params.id as string

  const [role, setRole] = useState<StaffRole | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [components, setComponents] = useState<Component[]>([])
  const [cost, setCost] = useState<Cost | null>(null)
  const [ingOptions, setIngOptions] = useState<IngOption[]>([])
  const [recOptions, setRecOptions] = useState<RecOption[]>([])
  const [loading, setLoading] = useState(true)

  // add-component form
  const [addType, setAddType] = useState<'ingredient' | 'sub_recipe'>('ingredient')
  const [addRefId, setAddRefId] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addUnit, setAddUnit] = useState('ml')
  const [addBusy, setAddBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { init() }, [recipeId])

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()

    const user = session?.user
    if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).single()
    setRole(su?.role || 'staff')
    await loadAll()
  }

  async function loadAll() {
    setLoading(true)
    const [r, comps, c, ings, recs] = await Promise.all([
      ops().from('recipes').select('*').eq('id', recipeId).single(),
      ops().from('recipe_components').select('id, recipe_id, ingredient_id, sub_recipe_id, qty, unit, notes, sort_order').eq('recipe_id', recipeId).order('sort_order'),
      ops().from('v_recipe_cost').select('recipe_id, total_cost, cost_per_unit, margin_per_unit').eq('recipe_id', recipeId).single(),
      ops().from('ingredients').select('id, name, base_unit, current_cost_per_base').order('name'),
      ops().from('recipes').select('id, name').neq('id', recipeId).order('name'),
    ])
    setRecipe(r.data as Recipe)
    setIngOptions((ings.data as IngOption[]) || [])
    setRecOptions((recs.data as RecOption[]) || [])
    const ingMap = new Map((ings.data || []).map((i: any) => [i.id, i]))
    const recMap = new Map((recs.data || []).map((rr: any) => [rr.id, rr]))
    setComponents(((comps.data as Component[]) || []).map(c => ({
      ...c,
      ingredient: c.ingredient_id ? ingMap.get(c.ingredient_id) : null,
      sub_recipe: c.sub_recipe_id ? recMap.get(c.sub_recipe_id) : null,
    })))
    setCost(c.data as Cost)
    setLoading(false)
  }

  async function addComponent(e: React.FormEvent) {
    e.preventDefault()
    if (!addRefId || !addQty) { setMsg('Pick a component and qty'); return }
    setAddBusy(true); setMsg(null)
    const payload: any = {
      recipe_id: recipeId,
      qty: Number(addQty),
      unit: addUnit,
      sort_order: components.length,
    }
    if (addType === 'ingredient') payload.ingredient_id = addRefId
    else payload.sub_recipe_id = addRefId
    const { error } = await ops().from('recipe_components').insert(payload)
    setAddBusy(false)
    if (error) { setMsg(error.message); return }
    setAddRefId(''); setAddQty('')
    await loadAll()
  }

  async function removeComponent(id: string) {
    await ops().from('recipe_components').delete().eq('id', id)
    await loadAll()
  }

  async function saveMethod(v: string) {
    await ops().from('recipes').update({ method: v }).eq('id', recipeId)
    setRecipe(r => (r ? { ...r, method: v } : r))
  }

  async function buildBatch() {
    if (!recipe || !cost) return
    const planned = recipe.keg_size_ml && recipe.pour_size_ml
      ? Math.floor(recipe.keg_size_ml / recipe.pour_size_ml) : null
    const { error } = await ops().from('batches').insert({
      venue_id: (await supabase.from('venues').select('id').eq('slug','bigbamboo').single()).data?.id,
      recipe_id: recipeId,
      planned_yield: planned,
      cost_at_production: cost.total_cost,
    })
    if (error) { alert(error.message); return }
    alert(`Batch built. Planned yield: ${planned ?? '?'} pours. Cost at production: ${vnd(cost.total_cost)}`)
  }

  if (loading || !recipe) return <div style={{ color: '#999', fontSize: 14 }}>Loading…</div>
  const canManage = role && canManageRecipes(role)
  const marginPct = recipe.sale_price && cost?.margin_per_unit != null ? cost.margin_per_unit / recipe.sale_price : null

  return (
    <div>
      <Link href="/dashboard/ops/recipes" style={{ fontSize: 12, color: 'var(--text-muted, #999)', textDecoration: 'none' }}>← Recipes</Link>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 8 }}>{recipe.name}</h2>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        {recipe.type} · {recipe.category} · yields {Number(recipe.yield_qty)} {recipe.yield_unit}
        {recipe.is_kegged && ` · ${recipe.keg_size_ml}ml keg / ${recipe.pour_size_ml}ml pour`}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <Stat label="Total cost" value={vnd(cost?.total_cost)} />
        <Stat label={`Cost / ${recipe.yield_unit}`} value={vnd(cost?.cost_per_unit)} />
        <Stat label="Sale price" value={recipe.sale_price ? vnd(recipe.sale_price) : '—'} />
        <Stat label="Margin %" value={pct(marginPct)} accent={marginPct == null ? '#999' : marginPct < 0.5 ? '#C00000' : marginPct < 0.7 ? '#C65911' : '#548235'} />
      </div>

      {recipe.is_kegged && canManage && (
        <button onClick={buildBatch} style={{ ...btnPrimary, marginBottom: 24 }}>+ Build a batch (log keg production)</button>
      )}

      <div style={{ marginBottom: 24 }} className="recipe-method">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Method</h3>
          <button onClick={() => window.print()} style={btnPrimary}>Print SOP</button>
        </div>
        {canManage
          ? <textarea defaultValue={recipe.method || ''} onBlur={e => saveMethod(e.target.value)} placeholder="Step-by-step method, one step per line…" rows={8} style={{ ...inp, width: '100%', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }} />
          : <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>{recipe.method || '—'}</div>}
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Components</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={th}>Item</th><th style={th}>Type</th>
          <th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={th}>Unit</th>
          <th style={{ ...th, textAlign: 'right' }}>Unit cost</th>
          <th style={{ ...th, textAlign: 'right' }}>Component cost</th>
          <th></th>
        </tr></thead>
        <tbody>
          {components.length === 0 && <tr><td colSpan={7} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No components yet. Add ingredients below.</td></tr>}
          {components.map(c => {
            const unitCost = c.ingredient?.current_cost_per_base || 0
            const compCost = Number(c.qty) * unitCost
            return (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}>{c.ingredient?.name || c.sub_recipe?.name || '—'}</td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{c.ingredient_id ? 'ingredient' : 'sub-recipe'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{Number(c.qty)}</td>
                <td style={td}>{c.unit}</td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #666)' }}>{c.ingredient ? `${vnd(unitCost)}/${c.ingredient.base_unit}` : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{c.ingredient ? vnd(compCost) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {canManage && <button onClick={() => removeComponent(c.id)} style={btnLink}>remove</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {canManage && (
        <form onSubmit={addComponent} style={{ display: 'grid', gridTemplateColumns: '110px 2fr 80px 80px auto', gap: 8, alignItems: 'end', padding: 12, background: 'var(--bg-sidebar, #fafafa)', borderRadius: 6 }}>
          <select value={addType} onChange={e => { setAddType(e.target.value as any); setAddRefId('') }} style={inp}>
            <option value="ingredient">Ingredient</option>
            <option value="sub_recipe">Sub-recipe</option>
          </select>
          <select value={addRefId} onChange={e => {
            setAddRefId(e.target.value)
            if (addType === 'ingredient') {
              const i = ingOptions.find(x => x.id === e.target.value)
              if (i) setAddUnit(i.base_unit)
            }
          }} style={inp}>
            <option value="">Pick {addType === 'ingredient' ? 'an ingredient' : 'a sub-recipe'}…</option>
            {addType === 'ingredient'
              ? ingOptions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.base_unit})</option>)
              : recOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input type="number" step="0.0001" placeholder="qty" value={addQty} onChange={e => setAddQty(e.target.value)} style={inp} />
          <select value={addUnit} onChange={e => setAddUnit(e.target.value)} style={inp}>
            <option value="ml">ml</option><option value="g">g</option><option value="each">each</option>
          </select>
          <button type="submit" disabled={addBusy} style={btnPrimary}>{addBusy ? '…' : 'Add'}</button>
          {msg && <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#C00000' }}>{msg}</div>}
        </form>
      )}
    </div>
  )
}

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <div style={{ padding: 12, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, borderLeft: `3px solid ${accent || 'var(--accent, #e87830)'}` }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text, #333)', marginTop: 4 }}>{value}</div>
  </div>
)

const inp = { padding: '8px 10px', fontSize: 13, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const, width: '100%' }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnLink = { padding: '4px 8px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: 'none', cursor: 'pointer', fontSize: 12 }
