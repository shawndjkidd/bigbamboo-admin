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
  const [typeFilter, setTypeFilter] = useState<'all' | 'menu_item' | 'add_on' | 'prep'>('all')
  const [station, setStation] = useState<'all' | 'kitchen' | 'bar'>('all')
  const [resaleIds, setResaleIds] = useState<Set<string>>(new Set())
  const [keggedIds, setKeggedIds] = useState<Set<string>>(new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [visBusy, setVisBusy] = useState(false)
  const [serveCost, setServeCost] = useState<Map<string, number>>(new Map())
  const [nameVi, setNameVi] = useState<Map<string, string>>(new Map())
  const [showResale, setShowResale] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [shopOpen, setShopOpen] = useState(false)
  const [shopQty, setShopQty] = useState<Record<string, string>>({})
  const [shopResult, setShopResult] = useState<{ supplier: string; items: { name: string; qty: number; unit: string; hint: string }[] }[] | null>(null)
  const [shopBusy, setShopBusy] = useState(false)

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
      ops().from('recipes').select('id, is_resale, is_kegged, name_vi, show_in_station'),
      ops().from('v_recipe_serve_cost').select('recipe_id, serve_cost'),
    ])
    setRows((data as RecipeWithCost[]) || [])
    setResaleIds(new Set((rec || []).filter((x: any) => x.is_resale).map((x: any) => x.id)))
    setKeggedIds(new Set((rec || []).filter((x: any) => x.is_kegged).map((x: any) => x.id)))
    setHiddenIds(new Set((rec || []).filter((x: any) => x.show_in_station === false).map((x: any) => x.id)))
    setNameVi(new Map((rec || []).filter((x: any) => x.name_vi).map((x: any) => [x.id, x.name_vi as string])))
    setServeCost(new Map((serve || []).map((x: any) => [x.recipe_id, Number(x.serve_cost)])))
    setLoading(false)
  }

  function toggle(id: string) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll(ids: string[]) {
    const allSel = ids.length > 0 && ids.every(id => selected.has(id))
    setSelected(allSel ? new Set() : new Set(ids))
  }

  // Show / hide the selected recipes in the kitchen & bar station book (/kitchen, /bar).
  // Hidden recipes stay fully here in the admin — they're just kept off the staff screens
  // so cooks and bartenders only see what's current.
  async function setStaffVisibility(ids: string[], visible: boolean) {
    if (!ids.length || visBusy) return
    setVisBusy(true)
    try {
      const { error } = await ops().from('recipes').update({ show_in_station: visible }).in('id', ids)
      if (error) { alert(error.message); return }
      setHiddenIds(prev => {
        const n = new Set(prev)
        ids.forEach(id => { visible ? n.delete(id) : n.add(id) })
        return n
      })
    } finally { setVisBusy(false) }
  }

  // Build the bilingual recipe-book HTML (sections) — shared by Print, Share and Download.
  async function buildRecipesHtml(ids: string[]): Promise<string> {
    const [{ data: recs }, { data: comps }, { data: ings }, { data: subs }] = await Promise.all([
      ops().from('recipes').select('id,name,name_vi,category,subtitle,type,method,method_vi,plating_dinein,plating_togo,glass,ice,garnish,yield_qty,yield_unit').in('id', ids),
      ops().from('recipe_components').select('recipe_id,ingredient_id,sub_recipe_id,qty,unit,sort_order').in('recipe_id', ids),
      ops().from('ingredients').select('id,name,name_vi'),
      ops().from('recipes').select('id,name,name_vi'),
    ])
    const ingMap = new Map<string, any>((ings || []).map((i: any) => [i.id, i]))
    const subMap = new Map<string, any>((subs || []).map((s: any) => [s.id, s]))
    const recById = new Map<string, any>((recs || []).map((r: any) => [r.id, r]))
    const byRecipe = new Map<string, any[]>()
    ;(comps || []).forEach((c: any) => { const a = byRecipe.get(c.recipe_id) || []; a.push(c); byRecipe.set(c.recipe_id, a) })
    const DRINK = new Set(['cocktail', 'beer', 'wine', 'na_drink'])
    return ids.map((id, idx) => {
      const r = recById.get(id); if (!r) return ''
      const cs = (byRecipe.get(id) || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const ingRows = cs.map(c => {
        const o = c.ingredient_id ? ingMap.get(c.ingredient_id) : subMap.get(c.sub_recipe_id)
        return `<tr><td>${esc(o?.name || '—')}</td><td class="vi">${esc(o?.name_vi || '')}</td><td class="amt">${Number(c.qty)} ${esc(c.unit)}</td></tr>`
      }).join('')
      const stepsEn = String(r.method || '').split('\n').filter(Boolean)
      const stepsVi = String(r.method_vi || '').split('\n').filter(Boolean)
      const stepCount = Math.max(stepsEn.length, stepsVi.length)
      const methodRows = Array.from({ length: stepCount }).map((_, i) =>
        `<tr><td class="num">${i + 1}</td><td>${esc(stepsEn[i] || '')}</td><td class="vi">${esc(stepsVi[i] || '')}</td></tr>`).join('')
      const drink = DRINK.has(r.category)
      const extra = drink
        ? `<h3>Build sheet</h3><ul><li><b>Glass:</b> ${esc(r.glass || '-')}</li><li><b>Ice:</b> ${esc(r.ice || '-')}</li><li><b>Garnish:</b> ${esc(r.garnish || '-')}</li></ul>`
        : platingBlock('Plate — Dine-in', r.plating_dinein) + platingBlock('Pack — To-go', r.plating_togo)
      return `<section style="page-break-after:${idx < ids.length - 1 ? 'always' : 'auto'}">
        <h1>${esc(r.name)}</h1>
        ${r.name_vi ? `<div class="vititle">${esc(r.name_vi)}</div>` : ''}
        <div class="sub">${esc(r.category)}${r.subtitle ? ' · ' + esc(r.subtitle) : ''} · yields ${Number(r.yield_qty)} ${esc(r.yield_unit)}</div>
        <h3>Ingredients · Nguyên liệu</h3>
        <table><thead><tr><th>Item</th><th>Tiếng Việt</th><th class="amt">Amount</th></tr></thead><tbody>${ingRows || '<tr><td>No ingredients listed</td></tr>'}</tbody></table>
        <h3>Method · Phương pháp</h3>
        <table class="method">${methodRows || '<tr><td colspan="3" style="color:#999">No method yet</td></tr>'}</table>
        ${extra}
      </section>`
    }).join('')
  }

  async function printSelected(order: string[]) {
    const ids = order.filter(id => selected.has(id))
    if (!ids.length) return
    const sections = await buildRecipesHtml(ids)
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><meta charset="utf-8"><title>BigBamBoo — Recipe Book (${ids.length})</title><style>${RECIPE_PDF_STYLE}</style></head><body><div class="rbk">${sections}</div></body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400)
  }

  // Build the PDF as real, selectable text using the embedded Be Vietnam Pro font (so Vietnamese
  // diacritics render). Two columns: English | Vietnamese for ingredients and method.
  async function buildRecipesPdf(order: string[]): Promise<{ blob: Blob; fname: string } | null> {
    const ids = order.filter(id => selected.has(id))
    if (!ids.length) return null
    const [{ data: recs }, { data: comps }, { data: ings }, { data: subs }] = await Promise.all([
      ops().from('recipes').select('id,name,name_vi,category,subtitle,method,method_vi,plating_dinein,plating_togo,glass,ice,garnish,yield_qty,yield_unit').in('id', ids),
      ops().from('recipe_components').select('recipe_id,ingredient_id,sub_recipe_id,qty,unit,sort_order').in('recipe_id', ids),
      ops().from('ingredients').select('id,name,name_vi'),
      ops().from('recipes').select('id,name,name_vi'),
    ])
    const ingMap = new Map<string, any>((ings || []).map((i: any) => [i.id, i]))
    const subMap = new Map<string, any>((subs || []).map((s: any) => [s.id, s]))
    const recById = new Map<string, any>((recs || []).map((r: any) => [r.id, r]))
    const byRecipe = new Map<string, any[]>()
    ;(comps || []).forEach((c: any) => { const a = byRecipe.get(c.recipe_id) || []; a.push(c); byRecipe.set(c.recipe_id, a) })
    const DRINK = new Set(['cocktail', 'beer', 'wine', 'na_drink'])

    const { jsPDF } = await import('jspdf')
    const { beVietnamProRegular, beVietnamProBold } = await import('@/lib/fonts/beVietnamPro')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    doc.addFileToVFS('BVP-Regular.ttf', beVietnamProRegular); doc.addFont('BVP-Regular.ttf', 'BVP', 'normal')
    doc.addFileToVFS('BVP-Bold.ttf', beVietnamProBold); doc.addFont('BVP-Bold.ttf', 'BVP', 'bold')
    doc.setLineHeightFactor(1.32)
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight()
    const M = 44, CW = PW - 2 * M
    const ACC: number[] = [184, 92, 0]
    let y = M
    const setf = (size: number, bold: boolean, rgb: number[]) => { doc.setFont('BVP', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(rgb[0], rgb[1], rgb[2]) }
    const ensure = (h: number) => { if (y + h > PH - M) { doc.addPage(); y = M } }
    const heading = (t: string) => { y += 6; ensure(20); setf(10.5, true, [26, 26, 26]); doc.text(t, M, y + 10); y += 18 }

    ids.forEach((id, idx) => {
      const r = recById.get(id); if (!r) return
      if (idx > 0) { doc.addPage(); y = M }
      setf(17, true, [26, 26, 26]); const tl = doc.splitTextToSize(String(r.name), CW); doc.text(tl, M, y + 15); y += tl.length * 17 * 1.32
      if (r.name_vi) { setf(13, false, ACC); const vl = doc.splitTextToSize(String(r.name_vi), CW); doc.text(vl, M, y + 11); y += vl.length * 13 * 1.32 }
      setf(9, false, [120, 120, 120]); doc.text(`${r.category}${r.subtitle ? ' · ' + r.subtitle : ''}  ·  yields ${Number(r.yield_qty)} ${r.yield_unit}`, M, y + 9); y += 18

      heading('Ingredients · Nguyên liệu')
      const cs = (byRecipe.get(id) || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const viX = M + CW * 0.43, enW = CW * 0.40, viW = CW * 0.33
      cs.forEach(c => {
        const o = c.ingredient_id ? ingMap.get(c.ingredient_id) : subMap.get(c.sub_recipe_id)
        const enL = doc.splitTextToSize(String(o?.name || '—'), enW)
        const viL = o?.name_vi ? doc.splitTextToSize(String(o.name_vi), viW) : []
        const rowH = Math.max(enL.length, viL.length, 1) * 10 * 1.32
        ensure(rowH + 2)
        setf(10, false, [40, 40, 40]); doc.text(enL, M, y + 9)
        if (viL.length) { setf(10, false, ACC); doc.text(viL, viX, y + 9) }
        setf(10, false, [90, 90, 90]); doc.text(`${Number(c.qty)} ${c.unit}`, PW - M, y + 9, { align: 'right' })
        y += rowH + 2
      })
      if (!cs.length) { setf(10, false, [150, 150, 150]); doc.text('No ingredients listed', M, y + 9); y += 16 }

      heading('Method · Phương pháp')
      const en = String(r.method || '').split('\n').filter(Boolean)
      const vi = String(r.method_vi || '').split('\n').filter(Boolean)
      const n = Math.max(en.length, vi.length)
      if (!n) { setf(10, false, [150, 150, 150]); doc.text('No method yet', M, y + 9); y += 16 }
      const mEnX = M + 16, mColW = (CW - 16) / 2 - 8, mViX = mEnX + mColW + 16
      for (let i = 0; i < n; i++) {
        const enL = doc.splitTextToSize(en[i] || '', mColW)
        const viL = doc.splitTextToSize(vi[i] || '', mColW)
        const rowH = Math.max(enL.length, viL.length, 1) * 10 * 1.32
        ensure(rowH + 3)
        setf(10, false, [150, 150, 150]); doc.text(String(i + 1), M, y + 9)
        setf(10, false, [40, 40, 40]); doc.text(enL, mEnX, y + 9)
        setf(10, false, ACC); doc.text(viL, mViX, y + 9)
        y += rowH + 3
      }

      if (DRINK.has(r.category)) {
        heading('Build sheet')
        setf(10, false, [40, 40, 40])
        ;[`Glass: ${r.glass || '-'}`, `Ice: ${r.ice || '-'}`, `Garnish: ${r.garnish || '-'}`].forEach(t => { ensure(15); doc.text(t, M, y + 9); y += 15 })
      } else {
        ([['Plate — Dine-in', r.plating_dinein], ['Pack — To-go', r.plating_togo]] as [string, string | null][]).forEach(([title, txt]) => {
          if (!txt) return
          heading(title)
          String(txt).split('\n').filter(Boolean).forEach((s, i) => { setf(10, false, [40, 40, 40]); const l = doc.splitTextToSize(`${i + 1}.  ${s}`, CW); ensure(l.length * 10 * 1.32); doc.text(l, M, y + 9); y += l.length * 10 * 1.32 + 1 })
        })
      }
    })
    const blob = doc.output('blob')
    const fname = ids.length === 1 ? `${recById.get(ids[0])?.name || 'recipe'}.pdf` : `BigBamBoo-Recipes-${ids.length}.pdf`
    return { blob, fname }
  }

  // Share opens ONLY the device share sheet (no save prompt). Where file-sharing isn't supported
  // (most desktop browsers), it points the user to Download instead.
  async function shareRecipes(order: string[]) {
    const pdf = await buildRecipesPdf(order)
    if (!pdf) return
    const file = new File([pdf.blob], pdf.fname, { type: 'application/pdf' })
    const nav: any = navigator
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], title: 'BigBamBoo Recipes' }) } catch { /* user cancelled */ }
    } else {
      alert('This browser can’t share a file directly — use Download instead, or open this page on your phone to share straight to Zalo / Messenger.')
    }
  }

  // Download just saves the PDF.
  async function downloadRecipes(order: string[]) {
    const pdf = await buildRecipesPdf(order)
    if (!pdf) return
    const url = URL.createObjectURL(pdf.blob); const a = document.createElement('a'); a.href = url; a.download = pdf.fname; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  function openShopping() {
    if (selected.size === 0) return
    const q: Record<string, string> = {}
    rows.filter(r => selected.has(r.recipe_id)).forEach(r => { q[r.recipe_id] = shopQty[r.recipe_id] || '1' })
    setShopQty(q); setShopResult(null); setShopOpen(true)
  }

  // Expand every selected recipe/batch (× its quantity) down to the raw ingredients you actually buy:
  // sub-recipes are recursively broken out by their yield, totals are summed per ingredient and grouped by vendor.
  async function buildShopping() {
    setShopBusy(true)
    const ids = Object.keys(shopQty)
    const [{ data: comps }, { data: recs }, { data: ings }] = await Promise.all([
      ops().from('recipe_components').select('recipe_id,ingredient_id,sub_recipe_id,qty,unit'),
      ops().from('recipes').select('id,yield_qty'),
      ops().from('ingredients').select('id,name,base_unit,purchase_unit_label,purchase_unit_size,supplier,current_cost_per_base'),
    ])
    const compsByRecipe = new Map<string, any[]>()
    ;(comps || []).forEach((c: any) => { const a = compsByRecipe.get(c.recipe_id) || []; a.push(c); compsByRecipe.set(c.recipe_id, a) })
    const recYield = new Map<string, number>((recs || []).map((r: any) => [r.id, Number(r.yield_qty)]))
    const ingById = new Map<string, any>((ings || []).map((i: any) => [i.id, i]))

    const acc = new Map<string, number>()
    const expand = (rid: string, mult: number, seen: Set<string>) => {
      if (seen.has(rid)) return
      const seen2 = new Set(seen); seen2.add(rid)
      for (const c of compsByRecipe.get(rid) || []) {
        const amt = Number(c.qty) * mult
        if (c.ingredient_id) acc.set(c.ingredient_id, (acc.get(c.ingredient_id) || 0) + amt)
        else if (c.sub_recipe_id) { const sy = recYield.get(c.sub_recipe_id) || 0; if (sy > 0) expand(c.sub_recipe_id, amt / sy, seen2) }
      }
    }
    ids.forEach(id => { const n = Number(shopQty[id]); if (n > 0) expand(id, n, new Set()) })

    type ShopItem = { name: string; qty: number; unit: string; hint: string }
    const bySupplier = new Map<string, ShopItem[]>()
    acc.forEach((qty, ingId) => {
      const ing = ingById.get(ingId); if (!ing) return
      if (Number(ing.current_cost_per_base) === 0) return // skip free/tap items like Water
      const sup = ing.supplier || '(no vendor)'
      const pu = Number(ing.purchase_unit_size) || 1
      const hint = pu > 1 ? `≈ ${(qty / pu).toFixed(1)} ${ing.purchase_unit_label}` : ''
      const arr = bySupplier.get(sup) || []
      arr.push({ name: ing.name, qty: Math.round(qty * 10) / 10, unit: ing.base_unit, hint })
      bySupplier.set(sup, arr)
    })
    const grouped: { supplier: string; items: ShopItem[] }[] = []
    bySupplier.forEach((items, supplier) => { grouped.push({ supplier, items: items.sort((a, b) => a.name.localeCompare(b.name)) }) })
    grouped.sort((a, b) => a.supplier.localeCompare(b.supplier))
    setShopResult(grouped); setShopBusy(false)
  }

  const shopHeader = () => Object.entries(shopQty).map(([id, q]) => `${q} × ${rows.find(x => x.recipe_id === id)?.name || '?'}`).join('  ·  ')

  function printShopping() {
    if (!shopResult) return
    const sections = shopResult.map(g => `<h3>${esc(g.supplier)}</h3><table><tbody>${g.items.map(it => `<tr><td>☐ ${esc(it.name)}</td><td style="text-align:right">${it.qty} ${esc(it.unit)}${it.hint ? ` <span style="color:#999">(${esc(it.hint)})</span>` : ''}</td></tr>`).join('')}</tbody></table>`).join('')
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>BigBamBoo — Shopping list</title><style>body{font-family:Inter,Arial,sans-serif;max-width:640px;margin:24px auto;color:#1a1a1a;padding:0 24px}h1{font-size:22px;margin:0 0 2px}.sub{color:#666;font-size:12px;margin-bottom:14px}h3{margin:16px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#555}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-bottom:1px solid #eee}</style></head><body><h1>Shopping list</h1><div class="sub">${esc(shopHeader())}</div>${sections}</body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400)
  }

  async function shareShopping() {
    if (!shopResult) return
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(); const M = 48; let y = M
    const ensure = (h: number) => { if (y + h > PH - M) { doc.addPage(); y = M } }
    const para = (t: string, s: number, b: boolean, gap = 4, gray = false) => { doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(s); doc.setTextColor(gray ? 130 : 30); const ls = doc.splitTextToSize(String(t), PW - 2 * M); const lh = s * 1.3; ensure(ls.length * lh); doc.text(ls, M, y); y += ls.length * lh + gap }
    para('Shopping list', 17, true, 2); para(shopHeader(), 9, false, 10, true)
    shopResult.forEach(g => {
      y += 4; para(g.supplier.toUpperCase(), 10, true, 4)
      g.items.forEach(it => { ensure(15); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30); doc.text(`☐  ${it.name}`, M, y); doc.text(`${it.qty} ${it.unit}${it.hint ? '  (' + it.hint + ')' : ''}`, PW - M, y, { align: 'right' }); y += 15 })
    })
    const blob = doc.output('blob'); const file = new File([blob], 'BigBamBoo-Shopping-list.pdf', { type: 'application/pdf' })
    const nav: any = navigator
    try { if (nav.canShare && nav.canShare({ files: [file] })) { await nav.share({ files: [file], title: 'Shopping list' }); return } } catch { /* download */ }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'BigBamBoo-Shopping-list.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  const canManage = role && canManageRecipes(role)
  const filtered = rows.filter(r => {
    if (!showResale && resaleIds.has(r.recipe_id)) return false
    if (station === 'kitchen' && BAR_CATEGORIES.has(r.category)) return false
    if (station === 'bar' && !BAR_CATEGORIES.has(r.category)) return false
    if (typeFilter === 'menu_item' && r.type !== 'menu_item') return false
    if (typeFilter === 'add_on' && r.type !== 'add_on') return false
    if (typeFilter === 'prep' && !(r.type === 'batch' || r.type === 'sub_recipe')) return false
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
        {canManage && <Link href="/dashboard/ops/recipes/new" style={btnPrimary as any}>+ Add recipe</Link>}
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
          <option value="add_on">Add-ons</option>
          <option value="prep">Prep &amp; batches</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted, #999)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showResale} onChange={e => setShowResale(e.target.checked)} /> Show bought-in
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginRight: 2 }}>
          {selected.size ? `${selected.size} selected:` : 'Select recipes to:'}
        </span>
        {([['Print', () => printSelected(filtered.map(r => r.recipe_id))], ['Share', () => shareRecipes(filtered.map(r => r.recipe_id))], ['Download', () => downloadRecipes(filtered.map(r => r.recipe_id))], ['Shopping list', openShopping]] as const).map(([label, fn]) => (
          <button key={label} onClick={fn} disabled={selected.size === 0}
            style={{ ...btnOutline, padding: '7px 14px', opacity: selected.size === 0 ? 0.45 : 1, cursor: selected.size === 0 ? 'default' : 'pointer' }}>
            {label}
          </button>
        ))}
        {canManage && (
          <>
            <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border, #e5e5e5)', margin: '0 4px' }} />
            <button onClick={() => setStaffVisibility(Array.from(selected), false)} disabled={selected.size === 0 || visBusy}
              title="Hide the selected recipes from the kitchen & bar staff screens"
              style={{ ...btnOutline, padding: '7px 14px', opacity: selected.size === 0 || visBusy ? 0.45 : 1, cursor: selected.size === 0 || visBusy ? 'default' : 'pointer' }}>
              🙈 Hide from staff
            </button>
            <button onClick={() => setStaffVisibility(Array.from(selected), true)} disabled={selected.size === 0 || visBusy}
              title="Show the selected recipes on the kitchen & bar staff screens"
              style={{ ...btnOutline, padding: '7px 14px', opacity: selected.size === 0 || visBusy ? 0.45 : 1, cursor: selected.size === 0 || visBusy ? 'default' : 'pointer' }}>
              👁 Show to staff
            </button>
          </>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ background: 'var(--bg-sidebar, #fafafa)' }}>
          <th style={{ ...th, width: 28, textAlign: 'center' }}>
            <input type="checkbox" aria-label="Select all"
              checked={filtered.length > 0 && filtered.every(r => selected.has(r.recipe_id))}
              onChange={() => toggleAll(filtered.map(r => r.recipe_id))} />
          </th>
          <th style={th}>Name</th><th style={th}>Type</th><th style={th}>Category</th>
          <th style={{ ...th, textAlign: 'right' }}>Yield</th>
          <th style={{ ...th, textAlign: 'right' }}>Cost / unit</th>
          <th style={{ ...th, textAlign: 'right' }}>Price</th>
          <th style={{ ...th, textAlign: 'right' }}>Margin</th>
          <th style={{ ...th, textAlign: 'right' }}>Margin %</th>
        </tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 12, color: 'var(--text-muted, #999)' }}>No recipes yet. {canManage && 'Click "Add recipe" to start.'}</td></tr>}
          {filtered.map(r => {
            // Kegged drinks: v_recipe_cost.cost_per_unit is per-ml of the whole keg, so the list
            // would show a near-zero cost and a meaningless ~100% margin. Use the pour-aware
            // serve cost instead and recompute margin against the pour price.
            const kegged = keggedIds.has(r.recipe_id)
            const cost = kegged ? (serveCost.get(r.recipe_id) ?? r.cost_per_unit) : r.cost_per_unit
            const margin = r.sale_price != null && cost != null ? r.sale_price - cost : r.margin_per_unit
            const marginPct = r.sale_price && margin != null ? margin / r.sale_price : null
            return (
              <tr key={r.recipe_id} style={{ borderTop: '1px solid var(--border, #eee)', background: selected.has(r.recipe_id) ? 'var(--bg-active, #f7f2ee)' : 'transparent' }}>
                <td style={{ ...td, textAlign: 'center' }}>
                  <input type="checkbox" checked={selected.has(r.recipe_id)} onChange={() => toggle(r.recipe_id)} />
                </td>
                <td style={td}>
                  <Link href={`/dashboard/ops/recipes/${r.recipe_id}`} style={{ color: 'var(--accent, #e87830)', textDecoration: 'none', fontWeight: 600 }}>{r.name}</Link>
                  {hiddenIds.has(r.recipe_id) && <span title="Hidden from the kitchen & bar staff screens" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted, #999)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 5, padding: '1px 6px', verticalAlign: 'middle' }}>🙈 Hidden</span>}
                  {nameVi.get(r.recipe_id) && <div style={{ fontSize: 11, color: 'var(--text-muted, #999)' }}>{nameVi.get(r.recipe_id)}</div>}
                </td>
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

      {shopOpen && (
        <div onClick={() => setShopOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 50, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 10, padding: 20, width: '100%', maxWidth: 460, boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Shopping list</h3>
              <button onClick={() => setShopOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted, #999)' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #999)', marginBottom: 10 }}>How many of each are you making? Sub-recipes expand to the raw ingredients you buy; tap water is skipped.</div>
            {Object.keys(shopQty).map(id => {
              const r = rows.find(x => x.recipe_id === id)
              return (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <span style={{ fontSize: 13 }}>{r?.name || id}</span>
                  <input type="number" min="0" value={shopQty[id]} onChange={e => setShopQty(q => ({ ...q, [id]: e.target.value }))} style={{ ...inp, width: 72, padding: '4px 8px' }} />
                </div>
              )
            })}
            <button onClick={buildShopping} disabled={shopBusy} style={{ ...btnPrimary, marginTop: 10, opacity: shopBusy ? 0.6 : 1 } as any}>{shopBusy ? 'Building…' : 'Build list'}</button>

            {shopResult && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border, #eee)', paddingTop: 12 }}>
                {shopResult.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted, #999)' }}>Nothing to buy — selected items have no costed ingredients.</div>}
                {shopResult.map(g => (
                  <div key={g.supplier} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #888)', marginBottom: 4 }}>{g.supplier}</div>
                    {g.items.map(it => (
                      <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                        <span>{it.name}</span>
                        <span style={{ color: 'var(--text-muted, #666)' }}>{it.qty} {it.unit}{it.hint ? ` (${it.hint})` : ''}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {shopResult.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button onClick={printShopping} style={btnOutline as any}>🖨 Print</button>
                    <button onClick={shareShopping} style={btnOutline as any}>⤴ Share / PDF</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const BAR_CATEGORIES = new Set(['cocktail', 'beer', 'wine', 'na_drink', 'syrup'])

const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, m => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[m]))
function platingBlock(title: string, txt: string | null) {
  if (!txt) return ''
  const items = String(txt).split('\n').filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')
  return `<h3>${title}</h3><ol>${items}</ol>`
}

// Scoped styles for the bilingual recipe book — shared by the Print window and the rasterised PDF.
const RECIPE_PDF_STYLE = `
.rbk{font-family:Inter,Arial,sans-serif;max-width:760px;margin:24px auto;color:#1a1a1a;padding:0 24px;background:#fff}
.rbk h1{margin:0 0 1px;font-size:24px}
.rbk .vititle{color:#b85c00;font-size:17px;font-weight:500;margin-bottom:8px}
.rbk .sub{color:#666;font-size:13px;margin-bottom:14px}
.rbk h3{margin:18px 0 4px;font-size:14px}
.rbk table{width:100%;border-collapse:collapse;font-size:13.5px;margin:6px 0}
.rbk th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#999;font-weight:600;padding:4px}
.rbk td{padding:5px 4px;border-bottom:1px solid #eee;vertical-align:top}
.rbk td.vi{color:#b85c00}.rbk td.amt{text-align:right;white-space:nowrap;color:#444}.rbk th.amt{text-align:right}
.rbk td.num{width:22px;color:#999;font-weight:600}
.rbk table.method td{width:48%}.rbk table.method td.num{width:22px}
.rbk ul{line-height:1.7;margin:4px 0;padding-left:20px}.rbk section{padding-top:8px}
`

const inp = { padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
const btnOutline = { padding: '8px 14px', background: 'transparent', color: 'var(--text-secondary, #666)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, fontSize: 13, fontWeight: 600 }
