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
  plating_dinein: string | null; plating_togo: string | null;
  glass: string | null; ice: string | null; garnish: string | null;
  published_version: number | null;
}

const DRINK_CATS = ['cocktail', 'beer', 'wine', 'na_drink']

type Component = {
  id: string; recipe_id: string;
  ingredient_id: string | null; sub_recipe_id: string | null;
  qty: number; unit: string; notes: string | null; sort_order: number;
  ingredient?: { name: string; current_cost_per_base: number; base_unit: string; category: string } | null;
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
  const [kegInput, setKegInput] = useState('')

  // add-component form
  const [addType, setAddType] = useState<'ingredient' | 'sub_recipe'>('ingredient')
  const [addRefId, setAddRefId] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addUnit, setAddUnit] = useState('ml')
  const [addBusy, setAddBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { init() }, [recipeId])
  useEffect(() => { if (recipe?.yield_qty != null) setKegInput(String(Number(recipe.yield_qty))) }, [recipe?.yield_qty])

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
      ops().from('ingredients').select('id, name, base_unit, current_cost_per_base, category').order('name'),
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

  async function saveRecipe(changes: Partial<Recipe>) {
    await ops().from('recipes').update(changes).eq('id', recipeId)
    setRecipe(r => (r ? { ...r, ...changes } : r))
  }

  async function saveMethod(v: string) {
    await ops().from('recipes').update({ method: v }).eq('id', recipeId)
    setRecipe(r => (r ? { ...r, method: v } : r))
  }

  // Rescale a batch: multiply every INGREDIENT component by (newSize / oldSize) and update the batch size.
  // Works for any recipe — yield_qty is the batch size. For kegged drinks, keg_size_ml is kept in sync.
  async function rescaleBatch(newSizeStr: string) {
    if (!recipe) return
    const newSize = Number(newSizeStr)
    const oldSize = Number(recipe.yield_qty)
    if (!newSize || newSize <= 0 || !oldSize || newSize === oldSize) return
    if (!confirm(`Rescale this batch from ${oldSize} to ${newSize} ${recipe.yield_unit}? Every ingredient amount will be scaled to match.`)) return
    const f = newSize / oldSize
    for (const c of components) {
      if (!c.ingredient_id) continue // never scale sub-recipe references
      await ops().from('recipe_components').update({ qty: Number((Number(c.qty) * f).toFixed(3)) }).eq('id', c.id)
    }
    const upd: any = { yield_qty: newSize }
    if (recipe.is_kegged) upd.keg_size_ml = newSize
    await ops().from('recipes').update(upd).eq('id', recipeId)
    await loadAll()
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
      recipe: { name: recipe.name, category: recipe.category, subtitle: recipe.subtitle, method: recipe.method, plating_dinein: recipe.plating_dinein, plating_togo: recipe.plating_togo, glass: recipe.glass, ice: recipe.ice, garnish: recipe.garnish, image_url: recipe.image_url, sale_price: recipe.sale_price },
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
    await ops().from('recipes').update({ method: s.recipe.method, plating_dinein: s.recipe.plating_dinein ?? null, plating_togo: s.recipe.plating_togo ?? null, glass: s.recipe.glass ?? null, ice: s.recipe.ice ?? null, garnish: s.recipe.garnish ?? null, image_url: s.recipe.image_url, subtitle: s.recipe.subtitle, category: s.recipe.category, sale_price: s.recipe.sale_price }).eq('id', recipeId)
    await ops().from('recipe_components').delete().eq('recipe_id', recipeId)
    if (s.components?.length) await ops().from('recipe_components').insert(s.components.map((c: any) => ({ ...c, recipe_id: recipeId })))
    await loadAll()
  }

  function buildCompRows(withCost: boolean) {
    return components.map(c => {
      const name = c.ingredient?.name || c.sub_recipe?.name || '—'
      const compCost = Number(c.qty) * (c.ingredient?.current_cost_per_base || 0)
      const pkg = c.ingredient && c.ingredient.category === 'consumable' ? ' (packaging)' : ''
      return `<tr><td>${name}${pkg}</td><td style="text-align:right">${Number(c.qty)} ${c.unit}</td>${withCost ? `<td style="text-align:right">${c.ingredient ? vnd(compCost) : '—'}</td>` : ''}</tr>`
    }).join('')
  }
  function platingHtml(which: 'dinein' | 'togo') {
    if (!recipe) return ''
    const txt = which === 'dinein' ? recipe.plating_dinein : recipe.plating_togo
    if (!txt) return ''
    const items = txt.split('\n').filter(Boolean).map(t => `<li>${t.replace(/</g, '&lt;')}</li>`).join('')
    const title = which === 'dinein' ? 'Plating — Dine-in' : 'Packing — To-go'
    return `<h3>${title}</h3><ol>${items}</ol>`
  }
  // plating: null = recipe-with-cost (no plating focus); 'dinein'/'togo' = that SOP variant
  function openPrint(withCost: boolean, plating: 'dinein' | 'togo' | null = null) {
    if (!recipe) return
    const w = window.open('', '_blank'); if (!w) return
    const steps = (recipe.method || '').split('\n').filter(Boolean).map(t => `<li>${t.replace(/</g, '&lt;')}</li>`).join('')
    const costHead = withCost ? '<th style="text-align:right">Cost</th>' : ''
    const drink = DRINK_CATS.includes(recipe.category)
    const costLine = withCost && cost
      ? (drink
          ? `<p style="font-weight:600;margin-top:4px">Keg cost: ${vnd(cost.total_cost)} · Cost / pour: ${vnd(cost.cost_per_unit)}${recipe.keg_size_ml ? ` · ${Number(recipe.keg_size_ml)}ml keg → ${Number(recipe.yield_qty)} pours` : ''}</p>`
          : `<p style="font-weight:600;margin-top:4px">Dine-in cost / portion: ${vnd(dineInCost)} · To-go (with packaging): ${vnd(toGoCost)}</p>`)
      : ''
    const img = (!withCost && recipe.image_url) ? `<img src="${recipe.image_url}" style="max-width:240px;border-radius:8px;margin:8px 0"/>` : ''
    // Drinks: build sheet (glass/ice/garnish). Food: plating block(s).
    const platingSection = drink
      ? `<h3>Build sheet</h3><ul><li><b>Glass:</b> ${(recipe.glass || '-')}</li><li><b>Ice:</b> ${(recipe.ice || '-')}</li><li><b>Garnish:</b> ${(recipe.garnish || '-')}</li></ul>`
      : (plating ? platingHtml(plating) : (withCost ? platingHtml('dinein') + platingHtml('togo') : ''))
    const variantLabel = drink ? (withCost ? 'Build sheet (with cost)' : 'Build sheet') : plating === 'dinein' ? 'SOP · Dine-in' : plating === 'togo' ? 'SOP · To-go' : (withCost ? 'Recipe (with cost)' : 'SOP')
    const headerNote = plating === 'dinein' ? ' · Dine-in' : plating === 'togo' ? ' · To-go' : (withCost ? ' · internal' : '')
    w.document.write(`<html><head><title>${recipe.name}${plating ? ' — ' + (plating === 'dinein' ? 'Dine-in' : 'To-go') : ''}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:700px;margin:30px auto;color:#1a1a1a;padding:0 20px}h1{margin:0 0 2px}.sub{color:#666;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}td,th{padding:6px 4px;border-bottom:1px solid #eee;text-align:left}ol{line-height:1.7}h3{margin:18px 0 4px}</style></head><body><h1>${recipe.name}</h1><div class="sub">${recipe.category}${recipe.subtitle ? ' · ' + recipe.subtitle : ''}${headerNote}</div>${img}<h3>Components</h3><table><thead><tr><th>Item</th><th style="text-align:right">Amount</th>${costHead}</tr></thead><tbody>${buildCompRows(withCost)}</tbody></table>${costLine}<h3>Method</h3><ol>${steps}</ol>${platingSection}<p style="margin-top:24px;color:#999;font-size:11px">BigBamBoo · ${variantLabel}</p></body></html>`)
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
  const packagingCost = components.reduce((sum, c) => {
    const isPkg = c.ingredient && c.ingredient.category === 'consumable'
    return isPkg ? sum + Number(c.qty) * (c.ingredient!.current_cost_per_base || 0) : sum
  }, 0)
  const toGoCost = cost?.total_cost ?? 0
  const dineInCost = Math.max(0, toGoCost - packagingCost)
  const cogsPct = (cost?.cost_per_unit && recipe.sale_price) ? cost.cost_per_unit / recipe.sale_price : null
  const isDrink = DRINK_CATS.includes(recipe.category)
  // For kegged drinks, yield_qty is the keg volume (ml) and cost_per_unit is per ml → cost per pour = per-ml × pour size
  const costPerPour = (isDrink && cost?.cost_per_unit != null && recipe.pour_size_ml) ? cost.cost_per_unit * Number(recipe.pour_size_ml) : (cost?.cost_per_unit ?? null)
  const cogsDisplay = isDrink ? (costPerPour && recipe.sale_price ? costPerPour / recipe.sale_price : null) : cogsPct
  const poursPerKeg = (recipe.keg_size_ml && recipe.pour_size_ml) ? Math.floor(Number(recipe.keg_size_ml) / Number(recipe.pour_size_ml)) : null

  return (
    <div>
      {/* 1. Back link + title + meta */}
      <Link href="/dashboard/ops/recipes" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', marginBottom: 14 }}>← Back to recipes</Link>
      {canManage
        ? <input defaultValue={recipe.name} onBlur={e => e.target.value !== recipe.name && saveRecipe({ name: e.target.value })} style={{ ...inp, fontSize: 26, fontWeight: 700, maxWidth: 560, display: 'block' }} />
        : <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{recipe.name}</h2>}
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        {recipe.type} · {recipe.category} · yields {Number(recipe.yield_qty)} {recipe.yield_unit}
        {recipe.is_kegged && ` · ${recipe.keg_size_ml}ml keg / ${recipe.pour_size_ml}ml pour`}
      </div>
      {canManage && (
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 150px', gap: 10, margin: '4px 0 20px' }}>
          <div><label className="label">Category</label><select defaultValue={recipe.category} onChange={e => saveRecipe({ category: e.target.value })} style={inp}>{['cocktail','beer','wine','na_drink','food','snack','syrup','garnish','other'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="label">Subtitle</label><input defaultValue={recipe.subtitle || ''} onBlur={e => saveRecipe({ subtitle: e.target.value })} style={inp} /></div>
          <div><label className="label">Sale price (₫)</label><input defaultValue={recipe.sale_price ?? ''} inputMode="decimal" onBlur={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); saveRecipe({ sale_price: v ? Number(v) : null }) }} style={inp} /></div>
        </div>
      )}

      {/* 2. Cost stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {isDrink ? (
          <>
            <Stat label="Keg cost" value={vnd(cost?.total_cost ?? 0)} sub={poursPerKeg ? `${poursPerKeg} pours` : undefined} />
            <Stat label="Cost / pour" value={vnd(costPerPour)} accent="var(--accent, #e87830)" />
          </>
        ) : (
          <>
            <Stat label="Dine-in cost" value={vnd(dineInCost)} />
            <Stat label="To-go cost" value={vnd(toGoCost)} accent={packagingCost > 0 ? 'var(--accent, #e87830)' : undefined} />
          </>
        )}
        <Stat label={isDrink ? 'Price / drink' : 'Sale price'} value={recipe.sale_price ? vnd(recipe.sale_price) : '—'} />
        <Stat label="COGS %" value={pct(cogsDisplay)} accent={cogsDisplay == null ? '#999' : cogsDisplay > 0.45 ? 'var(--burgundy, #7b2d3a)' : cogsDisplay > 0.35 ? '#C65911' : '#6b7280'} />
      </div>

      {/* 3. Components + add form */}
      {recipe.is_kegged && canManage && (
        <button onClick={buildBatch} style={{ ...btnPrimary, marginBottom: 24 }}>+ Build a batch (log keg production)</button>
      )}
      {canManage && !recipe.is_kegged && (recipe.type === 'batch' || recipe.type === 'sub_recipe' || Number(recipe.yield_qty) > 1) && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>📦 Batch size</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <label className="label">Batch yields ({recipe.yield_unit})</label>
              <input inputMode="decimal" value={kegInput} onChange={e => setKegInput(e.target.value)} style={{ ...inp, width: 140 }} />
            </div>
            <button onClick={() => rescaleBatch(kegInput)} style={btnPrimary} disabled={Number(kegInput) === Number(recipe.yield_qty)}>Rescale ingredients</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>Scale the whole batch up or down — every ingredient below adjusts proportionally.</span>
          </div>
        </div>
      )}
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
                <td style={td}>
                  {c.ingredient?.name || c.sub_recipe?.name || '—'}
                  {c.ingredient && c.ingredient.category === 'consumable' && <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'var(--bg-hover, #eee)', color: 'var(--text-secondary, #666)' }}>packaging</span>}
                </td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted, #999)' }}>{c.ingredient_id ? 'ingredient' : 'sub-recipe'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {canManage
                    ? <input type="text" inputMode="decimal" defaultValue={Number(c.qty)} onBlur={e => { const v = parseFloat(e.target.value); if (!Number.isNaN(v) && v !== Number(c.qty)) updateComponent(c.id, { qty: v }) }} style={{ ...inp, width: 80, textAlign: 'right', padding: '4px 8px' }} />
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
          <input type="text" inputMode="decimal" placeholder="qty" value={addQty} onChange={e => setAddQty(e.target.value)} style={inp} />
          <select value={addUnit} onChange={e => setAddUnit(e.target.value)} style={inp}>
            <option value="ml">ml</option><option value="g">g</option><option value="each">each</option>
          </select>
          <button type="submit" disabled={addBusy} style={btnPrimary}>{addBusy ? '…' : 'Add'}</button>
          {msg && <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#C00000' }}>{msg}</div>}
        </form>
      )}

      {/* 4. Method (shared prep + cook) */}
      <div style={{ marginTop: 24, marginBottom: 16 }} className="recipe-method">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{isDrink ? 'Build / method' : 'Method'} <span style={{ fontWeight: 400, color: 'var(--text-muted, #999)' }}>· {isDrink ? 'how to build the keg & pour' : 'shared prep & cook steps'}</span></h3>
        {canManage
          ? <textarea defaultValue={recipe.method || ''} onBlur={e => saveMethod(e.target.value)} placeholder="Step-by-step method, one step per line…" rows={8} style={{ ...inp, width: '100%', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }} />
          : <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>{recipe.method || '—'}</div>}
      </div>

      {isDrink ? (
        <div style={{ marginBottom: 24 }}>
          {/* Keg control — rescale ingredients to a new keg size */}
          {recipe.is_kegged && (
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>🛢 Keg / batch size</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
                <div>
                  <label className="label">Batch size (ml)</label>
                  {canManage
                    ? <input inputMode="decimal" value={kegInput} onChange={e => setKegInput(e.target.value)} style={inp} />
                    : <div style={{ fontSize: 14 }}>{Number(recipe.yield_qty)} ml</div>}
                </div>
                <div>
                  <label className="label">Pour size (ml)</label>
                  {canManage
                    ? <input defaultValue={recipe.pour_size_ml ?? ''} inputMode="decimal" onBlur={e => { const v = Number(e.target.value); if (v) saveRecipe({ pour_size_ml: v }) }} style={inp} />
                    : <div style={{ fontSize: 14 }}>{Number(recipe.pour_size_ml)} ml</div>}
                </div>
                <div>
                  <label className="label">Pours per keg</label>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{poursPerKeg ?? '—'}</div>
                </div>
              </div>
              {canManage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={() => rescaleBatch(kegInput)} style={btnPrimary} disabled={Number(kegInput) === Number(recipe.yield_qty)}>Rescale ingredients to this batch size</button>
                  <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>Scales every ingredient below proportionally.</span>
                </div>
              )}
            </div>
          )}
          {/* Build sheet — glass / ice / garnish */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label className="label">🥃 Glass</label>
              {canManage ? <input defaultValue={recipe.glass || ''} onBlur={e => saveRecipe({ glass: e.target.value })} style={inp} placeholder="e.g. Highball" /> : <div style={{ fontSize: 14 }}>{recipe.glass || '—'}</div>}
            </div>
            <div>
              <label className="label">🧊 Ice</label>
              {canManage ? <input defaultValue={recipe.ice || ''} onBlur={e => saveRecipe({ ice: e.target.value })} style={inp} placeholder="e.g. Cubed, fill" /> : <div style={{ fontSize: 14 }}>{recipe.ice || '—'}</div>}
            </div>
            <div>
              <label className="label">🍋 Garnish</label>
              {canManage ? <input defaultValue={recipe.garnish || ''} onBlur={e => saveRecipe({ garnish: e.target.value })} style={inp} placeholder="e.g. Lime wheel" /> : <div style={{ fontSize: 14 }}>{recipe.garnish || '—'}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🍽 Plate — Dine-in</h3>
            {canManage
              ? <textarea defaultValue={recipe.plating_dinein || ''} onBlur={e => saveRecipe({ plating_dinein: e.target.value })} placeholder="In-house plating, one step per line — basket, garnish, ramekin…" rows={5} style={{ ...inp, width: '100%', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }} />
              : <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>{recipe.plating_dinein || '—'}</div>}
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🥡 Pack — To-go</h3>
            {canManage
              ? <textarea defaultValue={recipe.plating_togo || ''} onBlur={e => saveRecipe({ plating_togo: e.target.value })} placeholder="Takeaway packing, one step per line — clamshell, vent, sauce cup, bag…" rows={5} style={{ ...inp, width: '100%', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }} />
              : <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>{recipe.plating_togo || '—'}</div>}
          </div>
        </div>
      )}

      {/* 5. SOP — staff card */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '2px solid var(--border, #e5e5e5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{isDrink ? 'Build sheet — staff card' : 'SOP — staff card'}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {isDrink ? (
              <button onClick={() => openPrint(false)} style={btnPrimary}>Print build sheet</button>
            ) : (
              <>
                <button onClick={() => openPrint(false, 'dinein')} style={btnPrimary}>Print SOP — Dine-in</button>
                <button onClick={() => openPrint(false, 'togo')} style={btnOutline}>Print SOP — To-go</button>
              </>
            )}
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 2 }}>{recipe.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 16 }}>{recipe.category}{recipe.subtitle ? ' · ' + recipe.subtitle : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: recipe.image_url ? '1fr 200px' : '1fr', gap: 20, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>Components</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}><tbody>
                {components.length === 0 && <tr><td style={{ color: 'var(--text-muted, #999)', padding: '6px 0' }}>No components</td></tr>}
                {components.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '6px 0' }}>{c.ingredient?.name || c.sub_recipe?.name || '—'}{c.ingredient && c.ingredient.category === 'consumable' && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted, #999)' }}>(packaging)</span>}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{Number(c.qty)} {c.unit}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            {recipe.image_url && <img src={recipe.image_url} alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border, #eee)' }} />}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', margin: '8px 0' }}>Method</div>
          <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
            {(recipe.method || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
            {!recipe.method && <li style={{ listStyle: 'none', color: 'var(--text-muted, #999)' }}>No method yet — add it in the Method box above.</li>}
          </ol>

          {/* Build sheet (drinks) or plating blocks (food) inside the card */}
          {isDrink ? (
            <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
              <div><span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>🥃 Glass</span><div style={{ fontSize: 14 }}>{recipe.glass || '—'}</div></div>
              <div><span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>🧊 Ice</span><div style={{ fontSize: 14 }}>{recipe.ice || '—'}</div></div>
              <div><span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>🍋 Garnish</span><div style={{ fontSize: 14 }}>{recipe.garnish || '—'}</div></div>
              {recipe.is_kegged && <div><span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)' }}>🛢 Keg</span><div style={{ fontSize: 14 }}>{Number(recipe.keg_size_ml)}ml → {Number(recipe.yield_qty)} pours</div></div>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 6 }}>🍽 Plate — Dine-in</div>
                <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
                  {(recipe.plating_dinein || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
                  {!recipe.plating_dinein && <li style={{ listStyle: 'none', color: 'var(--text-muted, #999)' }}>—</li>}
                </ol>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 6 }}>🥡 Pack — To-go</div>
                <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
                  {(recipe.plating_togo || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}
                  {!recipe.plating_togo && <li style={{ listStyle: 'none', color: 'var(--text-muted, #999)' }}>—</li>}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. Publish new version */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 32, marginBottom: 16 }}>
        {canManage && <button onClick={publishVersion} style={btnPrimary}>Publish new version</button>}
        {recipe.published_version ? <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>Current: v{recipe.published_version} · {versions.length} saved</span> : null}
      </div>

      {/* 7. Version history */}
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

      {/* 8. Print recipe (with cost) */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => openPrint(true)} style={btnOutline}>Print recipe (with cost)</button>
      </div>

      {/* 9. Serving photo */}
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
    </div>
  )
}

const Stat = ({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) => (
  <div style={{ padding: 12, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, borderLeft: `3px solid ${accent || 'var(--accent, #e87830)'}` }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)' }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text, #333)', marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: 'var(--text-muted, #bbb)', marginTop: 2 }}>{sub}</div>}
  </div>
)

const inp = { padding: '8px 10px', fontSize: 13, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const, width: '100%' }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnLink = { padding: '4px 8px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: 'none', cursor: 'pointer', fontSize: 12 }
const btnOutline = { padding: '8px 14px', background: 'transparent', color: 'var(--text-secondary, #666)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }
