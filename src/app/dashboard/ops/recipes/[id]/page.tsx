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
  published_version: number | null;
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
  const [versions, setVersions] = useState<any[]>([])
  const [showSop, setShowSop] = useState(false)

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
    const [r, comps, c, ings, recs, vers] = await Promise.all([
      ops().from('recipes').select('*').eq('id', recipeId).single(),
      ops().from('recipe_components').select('id, recipe_id, ingredient_id, sub_recipe_id, qty, unit, notes, sort_order').eq('recipe_id', recipeId).order('sort_order'),
      ops().from('v_recipe_cost').select('recipe_id, total_cost, cost_per_unit, margin_per_unit').eq('recipe_id', recipeId).single(),
      ops().from('ingredients').select('id, name, base_unit, current_cost_per_base').order('name'),
      ops().from('recipes').select('id, name').neq('id', recipeId).order('name'),
      ops().from('recipe_versions').select('*').eq('recipe_id', recipeId).order('version', { ascending: false }),
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
    setVersions((vers.data as any[]) || [])
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

  async function updateComponent(id: string, changes: { qty?: number; unit?: string }) {
    const { error } = await ops().from('recipe_components').update(changes).eq('id', id)
    if (error) { alert(error.message); return }
    await loadAll()
  }

  async function saveMethod(v: string) {
    await ops().from('recipes').update({ method: v }).eq('id', recipeId)
    setRecipe(r => (r ? { ...r, method: v } : r))
  }

  async function savePhoto(v: string) {
    await ops().from('recipes').update({ image_url: v || null }).eq('id', recipeId)
    setRecipe(r => (r ? { ...r, image_url: v || null } : r))
  }
  async function uploadPhoto(file: File) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `recipes/${recipeId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('venue-assets').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { alert(error.message); return }
    const { data } = supabase.storage.from('venue-assets').getPublicUrl(path)
    await savePhoto(data.publicUrl)
  }
  async function publishVersion() {
    if (!recipe) return
    const nextV = (recipe.published_version || 0) + 1
    const snapshot = {
      recipe: { name: recipe.name, category: recipe.category, subtitle: recipe.subtitle, method: recipe.method, image_url: recipe.image_url, sale_price: recipe.sale_price },
      components: components.map(c => ({ ingredient_id: c.ingredient_id, sub_recipe_id: c.sub_recipe_id, qty: c.qty, unit: c.unit, sort_order: c.sort_order })),
    }
    const venueId = (await supabase.from('venues').select('id').eq('slug', 'bigbamboo').single()).data?.id
    const { error } = await ops().from('recipe_versions').insert({ recipe_id: recipeId, venue_id: venueId, version: nextV, snapshot })
    if (error) { alert(error.message); return }
    await ops().from('recipes').update({ published_version: nextV }).eq('id', recipeId)
    await loadAll()
  }
  async function restoreVersion(v: any) {
    if (!confirm(`Restore version ${v.version}? The current state is saved as a new version first, so nothing is lost.`)) return
    await publishVersion()
    const s = v.snapshot
    await ops().from('recipes').update({ method: s.recipe.method, image_url: s.recipe.image_url, subtitle: s.recipe.subtitle, category: s.recipe.category, sale_price: s.recipe.sale_price }).eq('id', recipeId)
    await ops().from('recipe_components').delete().eq('recipe_id', recipeId)
    if (s.components?.length) await ops().from('recipe_components').insert(s.components.map((c: any) => ({ ...c, recipe_id: recipeId })))
    await loadAll()
  }

  function buildCompRows(withCost: boolean) {
    return components.map(c => {
      const name = c.ingredient?.name || c.sub_recipe?.name || '—'
      const compCost = Number(c.qty) * (c.ingredient?.current_cost_per_base || 0)
      return `<tr><td>${name}</td><td style="text-align:right">${Number(c.qty)} ${c.unit}</td>${withCost ? `<td style="text-align:right">${c.ingredient ? vnd(compCost) : '—'}</td>` : ''}</tr>`
    }).join('')
  }
  function openPrint(withCost: boolean) {
    if (!recipe) return
    const w = window.open('', '_blank'); if (!w) return
    const steps = (recipe.method || '').split('\n').filter(Boolean).map(t => `<li>${t.replace(/</g, '&lt;')}</li>`).join('')
    const costHead = withCost ? '<th style="text-align:right">Cost</th>' : ''
    const costLine = withCost && cost ? `<p style="font-weight:600;margin-top:4px">Cost / portion: ${vnd(cost.cost_per_unit)}</p>` : ''
    const img = (!withCost && recipe.image_url) ? `<img src="${recipe.image_url}" style="max-width:240px;border-radius:8px;margin:8px 0"/>` : ''
    w.document.write(`<html><head><title>${recipe.name}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:700px;margin:30px auto;color:#1a1a1a;padding:0 20px}h1{margin:0 0 2px}.sub{color:#666;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}td,th{padding:6px 4px;border-bottom:1px solid #eee;text-align:left}ol{line-height:1.7}</style></head><body><h1>${recipe.name}</h1><div class="sub">${recipe.category}${recipe.subtitle ? ' · ' + recipe.subtitle : ''}${withCost ? ' · internal' : ''}</div>${img}<h3>Components</h3><table><thead><tr><th>Item</th><th style="text-align:right">Amount</th>${costHead}</tr></thead><tbody>${buildCompRows(withCost)}</tbody></table>${costLine}<h3>Method</h3><ol>${steps}</ol><p style="margin-top:24px;color:#999;font-size:11px">BigBamBoo · ${withCost ? 'Recipe (with cost)' : 'SOP'}</p></body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
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
        <Stat label="Margin %" value={pct(marginPct)} accent={marginPct == null ? '#999' : marginPct < 0.5 ? 'var(--burgundy, #7b2d3a)' : marginPct < 0.7 ? '#C65911' : '#6b7280'} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {canManage && <button onClick={publishVersion} style={btnPrimary}>Publish new version</button>}
        {recipe.published_version ? <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>Current: v{recipe.published_version} · {versions.length} saved</span> : null}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <button onClick={() => setShowSop(true)} style={btnPrimary}>View SOP</button>
        <button onClick={() => openPrint(false)} style={btnOutline}>Print SOP</button>
        <button onClick={() => openPrint(true)} style={btnOutline}>Print recipe (with cost)</button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Serving photo</h3>
        {recipe.image_url && <img src={recipe.image_url} alt="serving" style={{ maxWidth: 220, borderRadius: 8, marginBottom: 8, display: 'block', border: '1px solid var(--border, #eee)' }} />}
        {canManage && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ ...btnPrimary, display: 'inline-block' }}>
              {recipe.image_url ? 'Replace photo' : 'Upload photo'}
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f) }} style={{ display: 'none' }} />
            </label>
            {recipe.image_url && <button onClick={() => savePhoto('')} style={btnLink}>Remove</button>}
          </div>
        )}
      </div>

      {versions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Version history</h3>
          {versions.map(v => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border, #eee)', fontSize: 13 }}>
              <span>v{v.version} · {new Date(v.published_at).toLocaleDateString()}</span>
              {canManage && <button onClick={() => restoreVersion(v)} style={btnLink}>Restore</button>}
            </div>
          ))}
        </div>
      )}

      {recipe.is_kegged && canManage && (
        <button onClick={buildBatch} style={{ ...btnPrimary, marginBottom: 24 }}>+ Build a batch (log keg production)</button>
      )}

      <div style={{ marginBottom: 24 }} className="recipe-method">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Method</h3>
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
                <td style={{ ...td, textAlign: 'right' }}>
                  {canManage
                    ? <input type="number" step="0.0001" defaultValue={Number(c.qty)} onBlur={e => { const v = Number(e.target.value); if (!Number.isNaN(v) && v !== Number(c.qty)) updateComponent(c.id, { qty: v }) }} style={{ ...inp, width: 80, textAlign: 'right', padding: '4px 8px' }} />
                    : Number(c.qty)}
                </td>
                <td style={td}>
                  {canManage
                    ? <select defaultValue={c.unit} onChange={e => updateComponent(c.id, { unit: e.target.value })} style={{ ...inp, width: 72, padding: '4px 8px' }}>
                        <option value="ml">ml</option><option value="g">g</option><option value="each">each</option>
                      </select>
                    : c.unit}
                </td>
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

      {showSop && (
        <div onClick={() => setShowSop(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 12, padding: '24px 28px', maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{recipe.name}</h2>
              <button onClick={() => setShowSop(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted, #999)' }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 16 }}>{recipe.category}{recipe.subtitle ? ' · ' + recipe.subtitle : ''} · SOP</div>
            {recipe.image_url && <img src={recipe.image_url} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 16 }} />}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>Components</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}><tbody>
              {components.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '6px 0' }}>{c.ingredient?.name || c.sub_recipe?.name || '—'}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{Number(c.qty)} {c.unit}</td>
                </tr>
              ))}
            </tbody></table>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>Method</div>
            <ol style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 20, margin: 0 }}>
              {(recipe.method || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
              {!recipe.method && <li style={{ listStyle: 'none', color: 'var(--text-muted, #999)' }}>No method yet.</li>}
            </ol>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => openPrint(false)} style={btnPrimary}>Print SOP</button>
              <button onClick={() => setShowSop(false)} style={btnOutline}>Close</button>
            </div>
          </div>
        </div>
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
const btnOutline = { padding: '8px 14px', background: 'transparent', color: 'var(--text-secondary, #666)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }
