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
  const [selected, setSelected] = useState<Set<string>>(new Set())

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

  function toggle(id: string) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll(ids: string[]) {
    const allSel = ids.length > 0 && ids.every(id => selected.has(id))
    setSelected(allSel ? new Set() : new Set(ids))
  }

  // Build one printable document from every selected recipe (menu items and batch/prep recipes alike):
  // ingredients + method, plus build sheet for drinks / plating for food. Each recipe starts a new page.
  async function printSelected(order: string[]) {
    const ids = order.filter(id => selected.has(id))
    if (!ids.length) return
    const [{ data: recs }, { data: comps }, { data: ings }, { data: subs }] = await Promise.all([
      ops().from('recipes').select('id,name,category,subtitle,type,method,plating_dinein,plating_togo,glass,ice,garnish,yield_qty,yield_unit').in('id', ids),
      ops().from('recipe_components').select('recipe_id,ingredient_id,sub_recipe_id,qty,unit,sort_order').in('recipe_id', ids),
      ops().from('ingredients').select('id,name'),
      ops().from('recipes').select('id,name'),
    ])
    const ingName = new Map<string, string>((ings || []).map((i: any) => [i.id, i.name]))
    const subName = new Map<string, string>((subs || []).map((s: any) => [s.id, s.name]))
    const recById = new Map<string, any>((recs || []).map((r: any) => [r.id, r]))
    const byRecipe = new Map<string, any[]>()
    ;(comps || []).forEach((c: any) => { const a = byRecipe.get(c.recipe_id) || []; a.push(c); byRecipe.set(c.recipe_id, a) })
    const DRINK = new Set(['cocktail', 'beer', 'wine', 'na_drink'])

    const sections = ids.map((id, idx) => {
      const r = recById.get(id); if (!r) return ''
      const cs = (byRecipe.get(id) || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const ingRows = cs.map(c => {
        const nm = c.ingredient_id ? (ingName.get(c.ingredient_id) || '—') : (subName.get(c.sub_recipe_id) || '—')
        return `<tr><td>${esc(nm)}</td><td style="text-align:right">${Number(c.qty)} ${esc(c.unit)}</td></tr>`
      }).join('')
      const steps = String(r.method || '').split('\n').filter(Boolean).map((t: string) => `<li>${esc(t)}</li>`).join('')
      const drink = DRINK.has(r.category)
      const extra = drink
        ? `<h3>Build sheet</h3><ul><li><b>Glass:</b> ${esc(r.glass || '-')}</li><li><b>Ice:</b> ${esc(r.ice || '-')}</li><li><b>Garnish:</b> ${esc(r.garnish || '-')}</li></ul>`
        : platingBlock('Plate — Dine-in', r.plating_dinein) + platingBlock('Pack — To-go', r.plating_togo)
      return `<section style="page-break-after:${idx < ids.length - 1 ? 'always' : 'auto'}">
        <h1>${esc(r.name)}</h1>
        <div class="sub">${esc(r.category)}${r.subtitle ? ' · ' + esc(r.subtitle) : ''} · yields ${Number(r.yield_qty)} ${esc(r.yield_unit)}</div>
        <h3>Ingredients</h3><table><tbody>${ingRows || '<tr><td>No ingredients listed</td></tr>'}</tbody></table>
        <h3>Method</h3><ol>${steps || '<li style="list-style:none;color:#999">No method yet</li>'}</ol>
        ${extra}
      </section>`
    }).join('')

    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>BigBamBoo — Recipe Book (${ids.length})</title><style>
      body{font-family:Inter,Arial,sans-serif;max-width:720px;margin:24px auto;color:#1a1a1a;padding:0 24px}
      h1{margin:0 0 2px;font-size:24px}.sub{color:#666;font-size:13px;margin-bottom:14px}
      h3{margin:16px 0 4px;font-size:14px}table{width:100%;border-collapse:collapse;font-size:14px;margin:6px 0}
      td{padding:5px 4px;border-bottom:1px solid #eee}ol,ul{line-height:1.7;margin:4px 0;padding-left:20px}
      section{padding-top:8px}
    </style></head><body>${sections}</body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400)
  }

  // Build a PDF of the selected recipes and hand it to the OS share sheet (Zalo, email, send to a print
  // shop…). Falls back to a direct download where sharing files isn't supported (most desktops).
  async function shareRecipes(order: string[]) {
    const ids = order.filter(id => selected.has(id))
    if (!ids.length) return
    const [{ data: recs }, { data: comps }, { data: ings }, { data: subs }] = await Promise.all([
      ops().from('recipes').select('id,name,category,subtitle,method,plating_dinein,plating_togo,glass,ice,garnish,yield_qty,yield_unit').in('id', ids),
      ops().from('recipe_components').select('recipe_id,ingredient_id,sub_recipe_id,qty,unit,sort_order').in('recipe_id', ids),
      ops().from('ingredients').select('id,name'),
      ops().from('recipes').select('id,name'),
    ])
    const ingName = new Map<string, string>((ings || []).map((i: any) => [i.id, i.name]))
    const subName = new Map<string, string>((subs || []).map((s: any) => [s.id, s.name]))
    const recById = new Map<string, any>((recs || []).map((r: any) => [r.id, r]))
    const byRecipe = new Map<string, any[]>()
    ;(comps || []).forEach((c: any) => { const a = byRecipe.get(c.recipe_id) || []; a.push(c); byRecipe.set(c.recipe_id, a) })
    const DRINK = new Set(['cocktail', 'beer', 'wine', 'na_drink'])

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight()
    const M = 48; let y = M
    const ensure = (h: number) => { if (y + h > PH - M) { doc.addPage(); y = M } }
    const para = (text: string, size: number, bold: boolean, gap = 4, gray = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(gray ? 130 : 30)
      const lines = doc.splitTextToSize(String(text), PW - 2 * M); const lh = size * 1.3
      ensure(lines.length * lh); doc.text(lines, M, y); y += lines.length * lh + gap
    }
    ids.forEach((id, idx) => {
      const r = recById.get(id); if (!r) return
      if (idx > 0) { doc.addPage(); y = M }
      const cs = (byRecipe.get(id) || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      para(r.name, 17, true, 2)
      para(`${r.category}${r.subtitle ? ' · ' + r.subtitle : ''}  ·  yields ${Number(r.yield_qty)} ${r.yield_unit}`, 9, false, 10, true)
      para('INGREDIENTS', 10, true, 4)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30)
      cs.forEach(c => {
        const nm = c.ingredient_id ? (ingName.get(c.ingredient_id) || '—') : (subName.get(c.sub_recipe_id) || '—')
        ensure(15); doc.text(String(nm), M, y); doc.text(`${Number(c.qty)} ${c.unit}`, PW - M, y, { align: 'right' }); y += 15
      })
      if (!cs.length) para('No ingredients listed', 10, false, 2, true)
      y += 6; para('METHOD', 10, true, 4)
      const steps = String(r.method || '').split('\n').filter(Boolean)
      steps.length ? steps.forEach((s, i) => para(`${i + 1}.  ${s}`, 10, false, 3)) : para('—', 10, false, 2, true)
      if (DRINK.has(r.category)) {
        y += 6; para('BUILD', 10, true, 4)
        para(`Glass: ${r.glass || '-'}`, 10, false, 2); para(`Ice: ${r.ice || '-'}`, 10, false, 2); para(`Garnish: ${r.garnish || '-'}`, 10, false, 2)
      } else {
        const dinein = String(r.plating_dinein || '').split('\n').filter(Boolean)
        const togo = String(r.plating_togo || '').split('\n').filter(Boolean)
        if (dinein.length) { y += 6; para('PLATE — DINE-IN', 10, true, 4); dinein.forEach((s, i) => para(`${i + 1}.  ${s}`, 10, false, 3)) }
        if (togo.length) { y += 6; para('PACK — TO-GO', 10, true, 4); togo.forEach((s, i) => para(`${i + 1}.  ${s}`, 10, false, 3)) }
      }
    })
    const blob = doc.output('blob')
    const fname = ids.length === 1 ? `${recById.get(ids[0])?.name || 'recipe'}.pdf` : `BigBamBoo-Recipes-${ids.length}.pdf`
    const file = new File([blob], fname, { type: 'application/pdf' })
    const nav: any = navigator
    try {
      if (nav.canShare && nav.canShare({ files: [file] })) { await nav.share({ files: [file], title: 'BigBamBoo Recipes' }); return }
    } catch { /* fall through to download */ }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fname; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  const canManage = role && canManageRecipes(role)
  const filtered = rows.filter(r => {
    if (!showResale && resaleIds.has(r.recipe_id)) return false
    if (station === 'kitchen' && BAR_CATEGORIES.has(r.category)) return false
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => printSelected(filtered.map(r => r.recipe_id))}
            disabled={selected.size === 0}
            style={{ ...btnOutline, opacity: selected.size === 0 ? 0.5 : 1, cursor: selected.size === 0 ? 'default' : 'pointer' }}
          >
            🖨 Print{selected.size ? ` (${selected.size})` : ''}
          </button>
          <button
            onClick={() => shareRecipes(filtered.map(r => r.recipe_id))}
            disabled={selected.size === 0}
            style={{ ...btnOutline, opacity: selected.size === 0 ? 0.5 : 1, cursor: selected.size === 0 ? 'default' : 'pointer' }}
          >
            ⤴ Share / PDF{selected.size ? ` (${selected.size})` : ''}
          </button>
          {canManage && <Link href="/dashboard/ops/recipes/new" style={btnPrimary as any}>+ Add recipe</Link>}
        </div>
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

const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, m => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[m]))
function platingBlock(title: string, txt: string | null) {
  if (!txt) return ''
  const items = String(txt).split('\n').filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')
  return `<h3>${title}</h3><ol>${items}</ol>`
}

const inp = { padding: '10px 12px', fontSize: 14, border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }
const th  = { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--text-muted, #999)', letterSpacing: '0.05em' }
const td  = { padding: '8px 12px', color: 'var(--text, #333)' }
const btnPrimary = { padding: '8px 14px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
const btnOutline = { padding: '8px 14px', background: 'transparent', color: 'var(--text-secondary, #666)', border: '1px solid var(--border, #e5e5e5)', borderRadius: 6, fontSize: 13, fontWeight: 600 }
