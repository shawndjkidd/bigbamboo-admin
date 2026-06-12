'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ops, vnd, pct, canManageRecipes, type StaffRole } from '@/lib/ops/api'
import { supabase } from '@/lib/supabase'

type Recipe = {
  id: string; name: string; type: string; category: string;
  yield_qty: number; yield_unit: string; sale_price: number | null;
  is_kegged: boolean; keg_size_ml: number | null; pour_size_ml: number | null;
  description: string | null; description_vi: string | null; active: boolean;
  menu_name: string | null; menu_name_vi: string | null;
  method: string | null; subtitle: string | null; image_url: string | null;
  plating_dinein: string | null; plating_togo: string | null;
  glass: string | null; ice: string | null; garnish: string | null;
  published_version: number | null;
  name_vi: string | null; method_vi: string | null;
}

const DRINK_CATS = ['cocktail', 'beer', 'wine', 'na_drink']
// Delivery-platform commissions (of sale price) — used to show per-channel COGS.
const CAPICHI_RATE = 0.16
const GRAB_RATE = 0.25
// Bar/kitchen split for the sub-recipe picker: a food recipe shouldn't list drink sub-recipes (and vice-versa).
const BAR_CATS = ['cocktail', 'beer', 'wine', 'na_drink', 'syrup']
// Same split for the ingredient picker — mirrors the Ingredients page's category→station map.
const ING_BAR_CATS = ['spirit', 'beer', 'wine', 'mixer', 'syrup']
const ING_KITCHEN_CATS = ['food', 'garnish', 'other']

type Component = {
  id: string; recipe_id: string;
  ingredient_id: string | null; sub_recipe_id: string | null;
  qty: number; unit: string; notes: string | null; sort_order: number;
  ingredient?: { name: string; name_vi?: string | null; current_cost_per_base: number; base_unit: string; category: string } | null;
  sub_recipe?: { name: string; name_vi?: string | null } | null;
}

type Cost = { recipe_id: string; total_cost: number; cost_per_unit: number | null; margin_per_unit: number | null }
type IngOption = { id: string; name: string; name_vi?: string | null; base_unit: string; current_cost_per_base: number; category: string; active: boolean }
type RecOption = { id: string; name: string; name_vi?: string | null; category: string; type: string }
type SubCost = { cost_per_unit: number | null; yield_unit: string }

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
  const [subCost, setSubCost] = useState<Map<string, SubCost>>(new Map())
  const [loading, setLoading] = useState(true)
  const [versions, setVersions] = useState<any[]>([])
  const [kegInput, setKegInput] = useState('')
  const [yieldUnitInput, setYieldUnitInput] = useState('g')
  const [menuItem, setMenuItem] = useState<any | null>(null)
  const [menuSection, setMenuSection] = useState('')
  const [menuSections, setMenuSections] = useState<string[]>(['bites', 'grilled_sourdough', 'add_ons', 'cocktails', 'beer', 'wine', 'na', 'shots', 'special_events'])
  const [menuBusy, setMenuBusy] = useState(false)
  const [autoVi, setAutoVi] = useState(true)

  // add-component form
  const [addType, setAddType] = useState<'ingredient' | 'packaging' | 'sub_recipe'>('ingredient')
  const [addRefId, setAddRefId] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addUnit, setAddUnit] = useState('ml')
  const [addBusy, setAddBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { init() }, [recipeId])
  useEffect(() => { if (recipe?.yield_qty != null) setKegInput(String(Number(recipe.yield_qty))) }, [recipe?.yield_qty])
  useEffect(() => { if (recipe?.yield_unit) setYieldUnitInput(recipe.yield_unit) }, [recipe?.yield_unit])
  useEffect(() => { try { setAutoVi(localStorage.getItem('bbb_auto_vi') !== 'off') } catch {} }, [])
  function toggleAutoVi() { setAutoVi(v => { const n = !v; try { localStorage.setItem('bbb_auto_vi', n ? 'on' : 'off') } catch {} return n }) }
  // Load the live menu section list so the Add-to-menu dropdown matches the sections on the Menu page
  // (including any custom ones), instead of a hardcoded list.
  useEffect(() => {
    (async () => {
      const defaults = ['bites', 'grilled_sourdough', 'add_ons', 'cocktails', 'beer', 'wine', 'na', 'shots', 'special_events']
      const [{ data: rows }, { data: ord }] = await Promise.all([
        supabase.from('menu_items').select('section'),
        supabase.from('site_settings').select('value').eq('key', 'menu_section_order').maybeSingle(),
      ])
      const fromItems = Array.from(new Set((rows || []).map((r: any) => String(r.section)).filter(Boolean))) as string[]
      let list = defaults.slice()
      fromItems.forEach(s => { if (!list.includes(s)) list.push(s) })
      if (ord?.value) { try { const o: string[] = JSON.parse(ord.value); list = [...o.filter(s => list.includes(s)), ...list.filter(s => !o.includes(s))] } catch {} }
      setMenuSections(list)
    })()
  }, [])
  useEffect(() => {
    if (!recipe || menuSection) return
    const m: Record<string, string> = { cocktail: 'cocktails', beer: 'beer', wine: 'wine', na_drink: 'na', food: 'bites' }
    setMenuSection(recipe.name?.startsWith('Add:') ? 'add_ons' : (m[recipe.category] || 'bites'))
  }, [recipe?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()

    const user = session?.user
    if (!user) return
    const { data: su } = await supabase.from('staff_users').select('role').eq('email', user.email).single()
    setRole(su?.role || 'staff')
    await loadAll()
  }

  // silent = refresh data in place without flipping the whole page back to the "Loading…" state.
  // Component edits (qty/unit), add/remove, yield changes etc. use silent so the row you're editing
  // doesn't unmount and kick you out mid-edit. Only the first load shows the full-page spinner.
  async function loadAll(silent = false) {
    if (!silent) setLoading(true)
    const [r, comps, c, ings, recs, vers, subc] = await Promise.all([
      ops().from('recipes').select('*').eq('id', recipeId).single(),
      ops().from('recipe_components').select('id, recipe_id, ingredient_id, sub_recipe_id, qty, unit, notes, sort_order').eq('recipe_id', recipeId).order('sort_order'),
      ops().from('v_recipe_cost').select('recipe_id, total_cost, cost_per_unit, margin_per_unit').eq('recipe_id', recipeId).single(),
      ops().from('ingredients').select('id, name, name_vi, base_unit, current_cost_per_base, category, active').order('name'),
      ops().from('recipes').select('id, name, name_vi, category, type').neq('id', recipeId).order('name'),
      ops().from('recipe_versions').select('*').eq('recipe_id', recipeId).order('version', { ascending: false }),
      ops().from('v_recipe_cost').select('recipe_id, cost_per_unit, yield_unit'),
    ])
    setRecipe(r.data as Recipe)
    setIngOptions((ings.data as IngOption[]) || [])
    setRecOptions((recs.data as RecOption[]) || [])
    const ingMap = new Map<string, any>((ings.data || []).map((i: any) => [i.id, i]))
    const recMap = new Map<string, any>((recs.data || []).map((rr: any) => [rr.id, rr]))
    setComponents(((comps.data as Component[]) || []).map(c => ({
      ...c,
      ingredient: c.ingredient_id ? ingMap.get(c.ingredient_id) : null,
      sub_recipe: c.sub_recipe_id ? recMap.get(c.sub_recipe_id) : null,
    })))
    setCost(c.data as Cost)
    setVersions((vers.data as any[]) || [])
    setSubCost(new Map(((subc.data as any[]) || []).map(x => [x.recipe_id, { cost_per_unit: x.cost_per_unit, yield_unit: x.yield_unit } as SubCost])))
    const { data: mi } = await supabase.from('menu_items').select('*').eq('recipe_id', recipeId).maybeSingle()
    setMenuItem(mi || null)
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
    if (addType === 'ingredient' || addType === 'packaging') payload.ingredient_id = addRefId
    else payload.sub_recipe_id = addRefId
    const { error } = await ops().from('recipe_components').insert(payload)
    setAddBusy(false)
    if (error) { setMsg(error.message); return }
    setAddRefId(''); setAddQty('')
    await loadAll(true)
  }

  async function removeComponent(id: string) {
    await ops().from('recipe_components').delete().eq('id', id)
    await loadAll(true)
  }

  async function updateComponent(id: string, changes: { qty?: number; unit?: string }) {
    const { error } = await ops().from('recipe_components').update(changes).eq('id', id)
    if (error) { alert(error.message); return }
    await loadAll(true)
  }

  // Delete a recipe — but only if nothing real points at it. A recipe can be referenced by sales history,
  // POS mapping, event lines, batch production, or by other recipes (as a sub-recipe). We block on those
  // with a clear reason rather than orphan data, and only hard-delete a truly unused recipe.
  async function deleteRecipe() {
    if (!recipe) return
    const [usedIn, posMap, sales, evt, batch] = await Promise.all([
      ops().from('recipe_components').select('recipe_id').eq('sub_recipe_id', recipeId),
      ops().from('pos_item_map').select('id').eq('recipe_id', recipeId).limit(1),
      ops().from('sales_items').select('id').eq('recipe_id', recipeId).limit(1),
      ops().from('event_lines').select('id').eq('recipe_id', recipeId).limit(1),
      ops().from('batches').select('id').eq('recipe_id', recipeId).limit(1),
    ])
    const blockers: string[] = []
    if (usedIn.data && usedIn.data.length) {
      const rawNames = usedIn.data.map((x: any) => recOptions.find(r => r.id === x.recipe_id)?.name || 'another recipe')
      const names = rawNames.filter((n: string, i: number) => rawNames.indexOf(n) === i)
      blockers.push(`it's used as a sub-recipe in: ${names.join(', ')}`)
    }
    if (posMap.data && posMap.data.length) blockers.push('it\'s linked to a POS menu item (unlink it in Menu map first)')
    if (sales.data && sales.data.length) blockers.push('it has sales history')
    if (evt.data && evt.data.length) blockers.push('it\'s used in an event P&L')
    if (batch.data && batch.data.length) blockers.push('it has batch production logged')
    if (blockers.length) {
      alert(`Can't delete "${recipe.name}" because ${blockers.join('; and ')}.\n\nReassign or remove those first, then delete.`)
      return
    }
    if (!confirm(`Delete "${recipe.name}" permanently? This removes the recipe and its components and cannot be undone.`)) return
    await ops().from('recipe_components').delete().eq('recipe_id', recipeId)
    await ops().from('recipe_versions').delete().eq('recipe_id', recipeId)
    const { error } = await ops().from('recipes').delete().eq('id', recipeId)
    if (error) { alert(error.message); return }
    router.push('/dashboard/ops/recipes')
  }

  async function saveRecipe(changes: Partial<Recipe>) {
    await ops().from('recipes').update(changes).eq('id', recipeId)
    setRecipe(r => (r ? { ...r, ...changes } : r))
  }

  async function saveMethod(v: string) {
    await ops().from('recipes').update({ method: v }).eq('id', recipeId)
    setRecipe(r => (r ? { ...r, method: v } : r))
    if (autoVi && v.trim()) { const vi = await translateToVi(v); if (vi) await saveRecipe({ method_vi: vi }) }
  }

  // Translate English → Vietnamese via the Gemini-backed endpoint. Returns '' on any failure.
  async function translateToVi(text: string): Promise<string> {
    try {
      const res = await fetch('/api/admin/ops/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const j = await res.json().catch(() => ({}))
      return res.ok ? String(j.vi || '') : ''
    } catch { return '' }
  }

  // Save the English name; when auto-translate is on, refresh the Vietnamese name to match.
  async function saveName(name: string) {
    await saveRecipe({ name })
    if (autoVi && name.trim()) { const vi = await translateToVi(name); if (vi) await saveRecipe({ name_vi: vi }) }
  }

  // Save the English description; when auto-translate is on, refresh the Vietnamese description to match.
  async function saveDescription(v: string) {
    await saveRecipe({ description: v })
    if (autoVi && v.trim()) { const vi = await translateToVi(v); if (vi) await saveRecipe({ description_vi: vi }) }
  }

  // Save the customer-facing menu name (separate from the recipe's organizing name). Auto-translates the VN too.
  async function saveMenuName(v: string) {
    await saveRecipe({ menu_name: v || null })
    if (autoVi && v.trim()) { const vi = await translateToVi(v); if (vi) await saveRecipe({ menu_name_vi: vi }) }
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
    await loadAll(true)
  }

  // Correct the batch yield WITHOUT touching ingredient amounts — this is the denominator the cost is
  // divided by. Use when a sub-recipe's cost is wildly off because the yield was left at e.g. "1 each".
  async function saveYield() {
    const q = Number(kegInput)
    if (!q || q <= 0) return
    await ops().from('recipes').update({ yield_qty: q, yield_unit: yieldUnitInput }).eq('id', recipeId)
    await loadAll(true)
  }

  // Publish this recipe to the customer-facing menu (public.menu_items). Goes live (not draft) in the
  // chosen section; rearrange or hide it on the Menu page. Linked by recipe_id so the button toggles add/remove.
  async function addToMenu() {
    if (!recipe || !menuSection) return
    setMenuBusy(true)
    const price = recipe.sale_price ? `${Math.round(Number(recipe.sale_price) / 1000)}k` : 'TBA'
    const { error } = await supabase.from('menu_items').insert({
      recipe_id: recipeId, section: menuSection, name: recipe.menu_name || recipe.name, name_vi: recipe.menu_name_vi || recipe.name_vi,
      subtitle: recipe.subtitle, description: recipe.description, description_vi: recipe.description_vi,
      price, is_draft: false, is_available: true, sort_order: 999,
    })
    setMenuBusy(false)
    if (error) { alert(error.message); return }
    await loadAll(true)
  }
  // Push the recipe's current details to the linked menu_items row (name, Vietnamese name,
  // subtitle, description + Vietnamese, price) so menu edits stay in sync after editing the recipe.
  async function updateMenu() {
    if (!recipe || !menuItem) return
    setMenuBusy(true)
    const price = recipe.sale_price ? `${Math.round(Number(recipe.sale_price) / 1000)}k` : (menuItem.price || 'TBA')
    const { error } = await supabase.from('menu_items').update({
      name: recipe.menu_name || recipe.name, name_vi: recipe.menu_name_vi || recipe.name_vi, subtitle: recipe.subtitle,
      description: recipe.description, description_vi: recipe.description_vi, price,
    }).eq('id', menuItem.id)
    setMenuBusy(false)
    if (error) { alert(error.message); return }
    await loadAll(true)
  }
  async function removeFromMenu() {
    if (!menuItem) return
    if (!confirm('Remove this item from the front-end menu?')) return
    await supabase.from('menu_items').delete().eq('id', menuItem.id)
    await loadAll(true)
  }

  async function savePhoto(v: string) {
    await ops().from('recipes').update({ image_url: v || null }).eq('id', recipeId)
    setRecipe(r => (r ? { ...r, image_url: v || null } : r))
  }
  async function uploadPhoto(file: File) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `recipes/${recipeId}-${Date.now()}.${ext}`
    // upsert:false — the path is already unique (recipeId + timestamp), and an upsert would require an
    // UPDATE policy the venue-assets bucket doesn't have (causing "new row violates row-level security policy").
    const { error } = await supabase.storage.from('venue-assets').upload(path, file, { upsert: false, contentType: file.type })
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
    await loadAll(true)
  }
  async function restoreVersion(v: any) {
    if (!confirm(`Restore version ${v.version}? The current state is saved as a new version first, so nothing is lost.`)) return
    await publishVersion()
    const s = v.snapshot
    await ops().from('recipes').update({ method: s.recipe.method, plating_dinein: s.recipe.plating_dinein ?? null, plating_togo: s.recipe.plating_togo ?? null, glass: s.recipe.glass ?? null, ice: s.recipe.ice ?? null, garnish: s.recipe.garnish ?? null, image_url: s.recipe.image_url, subtitle: s.recipe.subtitle, category: s.recipe.category, sale_price: s.recipe.sale_price }).eq('id', recipeId)
    await ops().from('recipe_components').delete().eq('recipe_id', recipeId)
    if (s.components?.length) await ops().from('recipe_components').insert(s.components.map((c: any) => ({ ...c, recipe_id: recipeId })))
    await loadAll(true)
  }

  // One click after editing: snapshot a new version AND push the latest name/price/description to the
  // linked front-end menu item. (Cost and the printed SOP card already read the recipe live.)
  async function updateEverything() {
    setMenuBusy(true)
    await publishVersion()
    if (menuItem) await updateMenu()
    setMenuBusy(false)
    alert('✓ Updated.' + (menuItem ? ' New version published and the menu item synced.' : ' New version published.'))
  }

  function buildCompRows(withCost: boolean) {
    return components.map(c => {
      const name = c.ingredient?.name || c.sub_recipe?.name || '—'
      const nameVi = c.ingredient?.name_vi || c.sub_recipe?.name_vi || ''
      const sc = c.sub_recipe_id ? subCost.get(c.sub_recipe_id) : null
      const unitCost = c.ingredient?.current_cost_per_base ?? (sc?.cost_per_unit ?? 0)
      const hasCost = c.ingredient != null || (sc != null && sc.cost_per_unit != null)
      const compCost = Number(c.qty) * Number(unitCost)
      const pkg = c.ingredient && c.ingredient.category === 'consumable' ? ' (packaging)' : ''
      return `<tr><td>${name}${pkg}</td><td class="vi">${nameVi}</td><td style="text-align:right">${Number(c.qty)} ${c.unit}</td>${withCost ? `<td style="text-align:right">${hasCost ? vnd(compCost) : '—'}</td>` : ''}</tr>`
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
    const esc = (s: string) => s.replace(/</g, '&lt;')
    const stepsEn = (recipe.method || '').split('\n').filter(Boolean)
    const stepsVi = (recipe.method_vi || '').split('\n').filter(Boolean)
    const stepCount = Math.max(stepsEn.length, stepsVi.length)
    const methodRows = Array.from({ length: stepCount }).map((_, i) =>
      `<tr><td class="num">${i + 1}</td><td>${esc(stepsEn[i] || '')}</td><td class="vi">${esc(stepsVi[i] || '')}</td></tr>`).join('')
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
      : (plating ? platingHtml(plating) : platingHtml('dinein') + platingHtml('togo'))
    const variantLabel = drink ? (withCost ? 'Build sheet (with cost)' : 'Build sheet') : plating === 'dinein' ? 'SOP · Dine-in' : plating === 'togo' ? 'SOP · To-go' : (withCost ? 'Recipe (with cost)' : 'SOP')
    const headerNote = plating === 'dinein' ? ' · Dine-in' : plating === 'togo' ? ' · To-go' : (withCost ? ' · internal' : '')
    w.document.write(`<html><head><meta charset="utf-8"><title>${recipe.name}${plating ? ' — ' + (plating === 'dinein' ? 'Dine-in' : 'To-go') : ''}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:740px;margin:30px auto;color:#1a1a1a;padding:0 20px}h1{margin:0 0 1px}.vititle{color:#b85c00;font-size:17px;font-weight:500;margin-bottom:6px}.sub{color:#666;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:13.5px;margin:8px 0}td,th{padding:6px 4px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}td.vi{color:#b85c00}td.num{width:20px;color:#999;font-weight:600}table.method td{width:48%}table.method td.num{width:20px}ol{line-height:1.7}h3{margin:18px 0 4px}</style></head><body><h1>${recipe.name}</h1>${recipe.name_vi ? `<div class="vititle">${recipe.name_vi}</div>` : ''}<div class="sub">${recipe.category}${recipe.subtitle ? ' · ' + recipe.subtitle : ''}${headerNote}</div>${img}<h3>Components · Nguyên liệu</h3><table><thead><tr><th>Item</th><th>Tiếng Việt</th><th style="text-align:right">Amount</th>${costHead}</tr></thead><tbody>${buildCompRows(withCost)}</tbody></table>${costLine}<h3>Method · Phương pháp</h3><table class="method">${methodRows || '<tr><td>—</td></tr>'}</table>${platingSection}<p style="margin-top:24px;color:#999;font-size:11px">BigBamBoo · ${variantLabel}</p></body></html>`)
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
  // Delivery-channel COGS: to-go (with-packaging) cost plus the platform's commission on the sale price.
  const price = recipe.sale_price ? Number(recipe.sale_price) : null
  const capichiCogs = price ? (toGoCost + CAPICHI_RATE * price) / price : null
  const grabCogs = price ? (toGoCost + GRAB_RATE * price) / price : null
  const deliveryColor = (p: number | null) => p == null ? '#999' : p > 0.6 ? 'var(--burgundy, #7b2d3a)' : p > 0.5 ? '#C65911' : '#6b7280'
  const isDrink = DRINK_CATS.includes(recipe.category)
  // Sub-recipe picker: keep it on-station — a food recipe only lists food/prep sub-recipes, a bar recipe only lists bar ones.
  const parentIsBar = BAR_CATS.includes(recipe.category)
  const subRecipeOptions = recOptions.filter(r => parentIsBar ? BAR_CATS.includes(r.category) : !BAR_CATS.includes(r.category))
  const ingPickerOptions = ingOptions.filter(i => i.active !== false && (parentIsBar ? ING_BAR_CATS.includes(i.category) : ING_KITCHEN_CATS.includes(i.category)))
  // Packaging (consumables) live under their own picker option so they don't clutter the food/drink list — and stay reachable from both stations.
  // Inactive items (overhead supplies like pens/towels) are hidden here but stay usable in purchase/expense screens.
  const packagingOptions = ingOptions.filter(i => i.active !== false && i.category === 'consumable')
  // For kegged drinks, yield_qty is the keg volume (ml) and cost_per_unit is per ml → cost per pour = per-ml × pour size
  const costPerPour = (isDrink && cost?.cost_per_unit != null && recipe.pour_size_ml) ? cost.cost_per_unit * Number(recipe.pour_size_ml) : (cost?.cost_per_unit ?? null)
  const cogsDisplay = isDrink ? (costPerPour && recipe.sale_price ? costPerPour / recipe.sale_price : null) : cogsPct
  const poursPerKeg = (recipe.keg_size_ml && recipe.pour_size_ml) ? Math.floor(Number(recipe.keg_size_ml) / Number(recipe.pour_size_ml)) : null

  return (
    <div>
      {/* 1. Back link + title + meta */}
      <Link href="/dashboard/ops/recipes" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', marginBottom: 14 }}>← Back to recipes</Link>
      {canManage
        ? <input defaultValue={recipe.name} onBlur={e => e.target.value !== recipe.name && saveName(e.target.value)} style={{ ...inp, fontSize: 26, fontWeight: 700, maxWidth: 560, display: 'block' }} />
        : <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{recipe.name}</h2>}
      {canManage
        ? <input defaultValue={recipe.name_vi || ''} placeholder="Tên tiếng Việt…" onBlur={e => e.target.value !== (recipe.name_vi || '') && saveRecipe({ name_vi: e.target.value || null })} style={{ ...inp, fontSize: 16, fontWeight: 500, maxWidth: 560, display: 'block', marginTop: 4, color: 'var(--accent, #e87830)' }} />
        : recipe.name_vi && <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--accent, #e87830)', marginTop: 2 }}>{recipe.name_vi}</div>}
      {canManage && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoVi} onChange={toggleAutoVi} /> Auto-translate name, description & method to Vietnamese when I edit the English
        </label>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginTop: 2, marginBottom: 20 }}>
        {recipe.type} · {recipe.category} · yields {Number(recipe.yield_qty)} {recipe.yield_unit}
        {recipe.is_kegged && ` · ${recipe.keg_size_ml}ml keg / ${recipe.pour_size_ml}ml pour`}
      </div>
      {canManage && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 150px', gap: 10, margin: '4px 0 10px' }}>
          <div><label className="label">Category</label><select defaultValue={recipe.category} onChange={e => saveRecipe({ category: e.target.value })} style={inp}>{['cocktail','beer','wine','na_drink','food','snack','syrup','garnish','other'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="label">Subtitle</label><input defaultValue={recipe.subtitle || ''} onBlur={e => saveRecipe({ subtitle: e.target.value })} style={inp} /></div>
          <div><label className="label">Sale price (₫)</label><input defaultValue={recipe.sale_price ?? ''} inputMode="decimal" onBlur={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); saveRecipe({ sale_price: v ? Number(v) : null }) }} style={inp} /></div>
        </div>
        <div style={{ margin: '0 0 14px' }}>
          <label className="label">Menu name (leave blank to use the recipe name on the menu)</label>
          <input defaultValue={recipe.menu_name || ''} placeholder={recipe.name} onBlur={e => e.target.value !== (recipe.menu_name || '') && saveMenuName(e.target.value)} style={inp} />
          <input key={recipe.menu_name_vi || 'mv'} defaultValue={recipe.menu_name_vi || ''} placeholder="Tên trên menu (tiếng Việt)…" onBlur={e => e.target.value !== (recipe.menu_name_vi || '') && saveRecipe({ menu_name_vi: e.target.value || null })} style={{ ...inp, marginTop: 6, color: 'var(--accent, #e87830)' }} />
        </div>
        <div style={{ margin: '0 0 20px' }}>
          <label className="label">Description (menu)</label>
          <textarea defaultValue={recipe.description || ''} placeholder="One-line menu description, e.g. Three cheeses, garlic butter grilled sourdough & a pickle" onBlur={e => e.target.value !== (recipe.description || '') && saveDescription(e.target.value)} style={{ ...inp, minHeight: 46, resize: 'vertical' }} />
          <textarea key={recipe.description_vi || 'vi'} defaultValue={recipe.description_vi || ''} placeholder="Mô tả tiếng Việt…" onBlur={e => e.target.value !== (recipe.description_vi || '') && saveRecipe({ description_vi: e.target.value || null })} style={{ ...inp, minHeight: 46, resize: 'vertical', marginTop: 6, color: 'var(--accent, #e87830)' }} />
        </div>
        </>
      )}

      {/* 2. Cost stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 24 }}>
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
        {!isDrink && <Stat label="Capichi COGS" value={pct(capichiCogs)} accent={deliveryColor(capichiCogs)} sub="incl. 16% fee" />}
        {!isDrink && <Stat label="Grab COGS" value={pct(grabCogs)} accent={deliveryColor(grabCogs)} sub="incl. 25% fee" />}
      </div>

      {/* 2b. Front-end menu publish */}
      {canManage && (
        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {menuItem ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#548235' }}>● On front-end menu</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>section: {menuItem.section} · {menuItem.price}{menuItem.is_draft ? ' · draft' : ''}</span>
              <Link href="/dashboard/menu" style={{ fontSize: 12, color: 'var(--accent, #e87830)', textDecoration: 'none' }}>arrange on Menu page →</Link>
              <button onClick={updateMenu} disabled={menuBusy} title="Push this recipe's name, Vietnamese, description and price to the menu" style={{ ...btnPrimary, marginLeft: 'auto', padding: '6px 12px', fontSize: 12, opacity: menuBusy ? 0.6 : 1 }}>{menuBusy ? 'Updating…' : 'Update menu'}</button>
              <button onClick={removeFromMenu} style={{ ...btnLink }}>Remove from menu</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Front-end menu</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>Not on the customer menu.</span>
              <select value={menuSection} onChange={e => setMenuSection(e.target.value)} style={{ ...inp, width: 175, padding: '6px 8px' }}>
                {menuSections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={addToMenu} disabled={menuBusy || !menuSection} style={{ ...btnPrimary, opacity: menuBusy ? 0.6 : 1 }}>{menuBusy ? 'Adding…' : '+ Add to menu'}</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>Adds it live to the chosen section — rearrange or hide it on the Menu page.</span>
            </>
          )}
        </div>
      )}

      {/* 3. Components + add form */}
      {recipe.is_kegged && canManage && (
        <button onClick={buildBatch} style={{ ...btnPrimary, marginBottom: 24 }}>+ Build a batch (log keg production)</button>
      )}
      {canManage && !recipe.is_kegged && (recipe.type === 'batch' || recipe.type === 'sub_recipe' || Number(recipe.yield_qty) > 1) && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Batch yield</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 10 }}>
            How much one batch makes — the cost is divided by this. If a prep&apos;s cost looks way too high, the yield is usually wrong (e.g. left at &ldquo;1 each&rdquo; instead of the real grams/ml).
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <label className="label">Makes</label>
              <input inputMode="decimal" value={kegInput} onChange={e => setKegInput(e.target.value)} style={{ ...inp, width: 120 }} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select value={yieldUnitInput} onChange={e => setYieldUnitInput(e.target.value)} style={{ ...inp, width: 90 }}>
                <option value="g">g</option><option value="ml">ml</option><option value="each">each</option>
              </select>
            </div>
            <button onClick={saveYield} style={btnPrimary} disabled={Number(kegInput) === Number(recipe.yield_qty) && yieldUnitInput === recipe.yield_unit}>Save yield</button>
            <button onClick={() => rescaleBatch(kegInput)} style={btnOutline} disabled={Number(kegInput) === Number(recipe.yield_qty)}>Rescale ingredients instead</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 8 }}>
            <b>Save yield</b> just corrects the amount — ingredients stay as they are. <b>Rescale</b> changes the batch to a different size and scales every ingredient proportionally.
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
            const sc = c.sub_recipe_id ? subCost.get(c.sub_recipe_id) : null
            const unitCost = c.ingredient?.current_cost_per_base ?? (sc?.cost_per_unit ?? 0)
            const compCost = Number(c.qty) * Number(unitCost)
            const hasCost = c.ingredient != null || (sc != null && sc.cost_per_unit != null)
            const unitCostLabel = c.ingredient
              ? `${vnd(unitCost)}/${c.ingredient.base_unit}`
              : (sc != null && sc.cost_per_unit != null ? `${vnd(unitCost)}/${sc.yield_unit}` : '—')
            return (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={td}>
                  {c.ingredient?.name || c.sub_recipe?.name || '—'}
                  {c.ingredient && c.ingredient.category === 'consumable' && <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'var(--bg-hover, #eee)', color: 'var(--text-secondary, #666)' }}>packaging</span>}
                  {(c.ingredient?.name_vi || c.sub_recipe?.name_vi) && <div style={{ fontSize: 11, color: 'var(--accent, #e87830)' }}>{c.ingredient?.name_vi || c.sub_recipe?.name_vi}</div>}
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
                <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #666)' }}>{unitCostLabel}</td>
                <td style={{ ...td, textAlign: 'right' }}>{hasCost ? vnd(compCost) : '—'}</td>
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
            <option value="packaging">Packaging</option>
            <option value="sub_recipe">Sub-recipe</option>
          </select>
          <select value={addRefId} onChange={e => {
            setAddRefId(e.target.value)
            if (addType === 'ingredient' || addType === 'packaging') {
              const i = ingOptions.find(x => x.id === e.target.value)
              if (i) setAddUnit(i.base_unit)
            }
          }} style={inp}>
            <option value="">Pick {addType === 'sub_recipe' ? 'a sub-recipe' : addType === 'packaging' ? 'a packaging item' : 'an ingredient'}…</option>
            {addType === 'ingredient'
              ? ingPickerOptions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.base_unit})</option>)
              : addType === 'packaging'
                ? packagingOptions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.base_unit})</option>)
                : subRecipeOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
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
          ? <StepsEditor key={recipe.id} value={recipe.method || ''} onSave={saveMethod} placeholder="First step… (press Enter for the next)" />
          : <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>{(recipe.method || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}{!recipe.method && <li style={{ listStyle: 'none', color: 'var(--text-muted, #999)' }}>—</li>}</ol>}

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent, #e87830)', margin: '14px 0 6px' }}>Phương pháp (Tiếng Việt)</div>
        {canManage
          ? <StepsEditor key={recipe.id + '-method-vi'} value={recipe.method_vi || ''} onSave={v => saveRecipe({ method_vi: v })} placeholder="Bước đầu tiên… (Enter để xuống bước)" />
          : <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0, color: 'var(--accent, #e87830)' }}>{(recipe.method_vi || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}{!recipe.method_vi && <li style={{ listStyle: 'none', color: 'var(--text-muted, #999)' }}>—</li>}</ol>}
      </div>

      {isDrink ? (
        <div style={{ marginBottom: 24 }}>
          {/* Keg control — rescale ingredients to a new keg size */}
          {recipe.is_kegged && (
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>🛢 Keg / batch size</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
                <div>
                  <label className="label">Batch size (litres)</label>
                  {canManage
                    ? <input inputMode="decimal" value={kegInput === '' ? '' : String(Number(kegInput) / 1000)} onChange={e => setKegInput(e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 1000)))} style={inp} />
                    : <div style={{ fontSize: 14 }}>{Number(recipe.yield_qty) / 1000} L</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #999)', marginTop: 2 }}>= {Number(kegInput || 0).toLocaleString()} ml</div>
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
              ? <StepsEditor key={recipe.id + '-dinein'} value={recipe.plating_dinein || ''} onSave={v => saveRecipe({ plating_dinein: v })} placeholder="First plating step — basket, garnish, ramekin…" />
              : <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>{(recipe.plating_dinein || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}{!recipe.plating_dinein && <li style={{ listStyle: 'none', color: 'var(--text-muted, #999)' }}>—</li>}</ol>}
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🥡 Pack — To-go</h3>
            {canManage
              ? <StepsEditor key={recipe.id + '-togo'} value={recipe.plating_togo || ''} onSave={v => saveRecipe({ plating_togo: v })} placeholder="First packing step — clamshell, vent, sauce cup, bag…" />
              : <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>{(recipe.plating_togo || '').split('\n').filter(Boolean).map((t, i) => <li key={i}>{t}</li>)}{!recipe.plating_togo && <li style={{ listStyle: 'none', color: 'var(--text-muted, #999)' }}>—</li>}</ol>}
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
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 1 }}>{recipe.name}</div>
          {recipe.name_vi && <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--accent, #e87830)', marginBottom: 2 }}>{recipe.name_vi}</div>}
          <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 16 }}>{recipe.category}{recipe.subtitle ? ' · ' + recipe.subtitle : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: recipe.image_url ? '1fr 200px' : '1fr', gap: 20, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', marginBottom: 8 }}>Components</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}><tbody>
                {components.length === 0 && <tr><td style={{ color: 'var(--text-muted, #999)', padding: '6px 0' }}>No components</td></tr>}
                {components.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '6px 0' }}>{c.ingredient?.name || c.sub_recipe?.name || '—'}{c.ingredient && c.ingredient.category === 'consumable' && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted, #999)' }}>(packaging)</span>}{(c.ingredient?.name_vi || c.sub_recipe?.name_vi) && <span style={{ color: 'var(--accent, #e87830)', marginLeft: 6, fontSize: 12 }}>· {c.ingredient?.name_vi || c.sub_recipe?.name_vi}</span>}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{Number(c.qty)} {c.unit}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            {recipe.image_url && <img src={recipe.image_url} alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border, #eee)' }} />}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted, #999)', margin: '8px 0' }}>Method · Phương pháp</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}><tbody>
            {(() => {
              const en = (recipe.method || '').split('\n').filter(Boolean)
              const vi = (recipe.method_vi || '').split('\n').filter(Boolean)
              const n = Math.max(en.length, vi.length)
              if (!n) return <tr><td style={{ color: 'var(--text-muted, #999)' }}>No method yet — add it in the Method box above.</td></tr>
              return Array.from({ length: n }).map((_, i) => (
                <tr key={i} style={{ verticalAlign: 'top' }}>
                  <td style={{ width: 22, color: 'var(--text-muted, #999)', fontWeight: 600, padding: '3px 0' }}>{i + 1}</td>
                  <td style={{ width: '48%', padding: '3px 10px 3px 0', lineHeight: 1.6 }}>{en[i] || ''}</td>
                  <td style={{ width: '48%', padding: '3px 0', lineHeight: 1.6, color: 'var(--accent, #e87830)' }}>{vi[i] || ''}</td>
                </tr>
              ))
            })()}
          </tbody></table>

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 32, marginBottom: 6, flexWrap: 'wrap' }}>
        {canManage && <button onClick={updateEverything} disabled={menuBusy} style={{ ...btnPrimary, opacity: menuBusy ? 0.6 : 1 }}>{menuBusy ? 'Updating…' : 'Update everything'}</button>}
        {canManage && <button onClick={publishVersion} style={btnLink}>Just save a version</button>}
        {recipe.published_version ? <span style={{ fontSize: 12, color: 'var(--text-muted, #999)' }}>Current: v{recipe.published_version} · {versions.length} saved</span> : null}
      </div>
      {canManage && <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 16 }}>Saves a new version{menuItem ? ' and pushes name/price/description to the menu' : ''}. Cost & the printed card already update live.</div>}

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

      {/* 8. Print recipe (training — no cost) */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => openPrint(false)} style={btnOutline}>Print recipe (for training)</button>
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

      {/* 10. Danger zone — delete recipe */}
      {canManage && (
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border, #e5e5e5)' }}>
          <button onClick={deleteRecipe} style={btnDanger}>Delete recipe</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginLeft: 12 }}>
            Only works if nothing (sales, POS map, events, batches, other recipes) points at it.
          </span>
        </div>
      )}
    </div>
  )
}

// Numbered step editor: each line is a step. Enter splits at the cursor and starts the next step;
// Backspace at the start of a step merges it back into the previous one. Stored as newline-joined text,
// which is exactly what the SOP card and print view already expect.
function StepsEditor({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const initial = (value || '').split('\n').map(s => s.trim()).filter(Boolean)
  const [steps, setSteps] = useState<string[]>(initial.length ? initial : [''])
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function persist(next: string[]) { onSave(next.map(s => s.trim()).filter(Boolean).join('\n')) }
  function setAt(i: number, text: string) { const n = steps.slice(); n[i] = text; setSteps(n) }
  function focusAt(i: number, caret?: number) {
    setTimeout(() => { const el = refs.current[i]; if (el) { el.focus(); if (caret != null) el.setSelectionRange(caret, caret) } }, 0)
  }
  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget
    if (e.key === 'Enter') {
      e.preventDefault()
      const pos = el.selectionStart ?? el.value.length
      const before = el.value.slice(0, pos), after = el.value.slice(pos)
      const n = steps.slice(); n[i] = before; n.splice(i + 1, 0, after)
      setSteps(n); persist(n); focusAt(i + 1, 0)
    } else if (e.key === 'Backspace' && (el.selectionStart ?? 0) === 0 && (el.selectionEnd ?? 0) === 0 && i > 0) {
      e.preventDefault()
      const prevText = steps[i - 1]
      const n = steps.slice(); n[i - 1] = prevText + steps[i]; n.splice(i, 1)
      setSteps(n); persist(n); focusAt(i - 1, prevText.length)
    }
  }
  return (
    <div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 100, background: 'var(--accent, #e87830)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          <input
            ref={el => { refs.current[i] = el }}
            value={s}
            onChange={e => setAt(i, e.target.value)}
            onKeyDown={e => handleKey(i, e)}
            onBlur={() => persist(steps)}
            placeholder={i === 0 ? (placeholder || 'First step…') : 'Next step… (Enter for a new one)'}
            style={{ ...inp, flex: 1 }}
          />
        </div>
      ))}
      <button type="button" onClick={() => { const n = [...steps, '']; setSteps(n); focusAt(n.length - 1) }} style={{ ...btnOutline, marginTop: 4 }}>+ Add step</button>
    </div>
  )
}

const Stat = ({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) => (
  <div style={{ padding: '7px 12px', background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, borderLeft: `3px solid ${accent || 'var(--accent, #e87830)'}` }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted, #999)', display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{label}</span>{sub && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--text-muted, #bbb)' }}>{sub}</span>}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text, #333)', marginTop: 1 }}>{value}</div>
  </div>
)

const inp = { padding: '8px 10px', fontSize: 13, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)', boxSizing: 'border-box' as const, width: '100%' }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnLink = { padding: '4px 8px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: 'none', cursor: 'pointer', fontSize: 12 }
const btnOutline = { padding: '8px 14px', background: 'transparent', color: 'var(--text-secondary, #666)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }
const btnDanger = { padding: '8px 14px', background: 'transparent', color: 'var(--burgundy, #7b2d3a)', border: '1px solid var(--burgundy, #7b2d3a)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
