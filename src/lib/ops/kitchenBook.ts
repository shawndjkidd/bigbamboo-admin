// ════════════════════════════════════════════════════════════
//   Kitchen book — shared data + rendering for Kitchen Mode
// ════════════════════════════════════════════════════════════
// One place that knows how to:
//   • fetch the kitchen library (recipes/batches + SOPs) with a station filter
//   • render a single recipe or SOP to bilingual HTML (for the live iPad page)
//   • build a combined "download everything" PDF (recipes + SOPs) with real,
//     selectable Vietnamese text via the embedded Be Vietnam Pro font.
// Used by /kitchen (live page) and its Download button. Read-only.
// ════════════════════════════════════════════════════════════
import { ops } from './api'
import { supabase } from '@/lib/supabase'

export type KStation = 'all' | 'kitchen' | 'bar'

// Drink categories live on the Bar; everything else is Kitchen.
const BAR_CATEGORIES = new Set(['cocktail', 'beer', 'wine', 'na_drink', 'syrup'])
const DRINK = new Set(['cocktail', 'beer', 'wine', 'na_drink'])

export type KRecipe = {
  id: string; name: string; name_vi: string | null
  type: string; category: string
}
export type KSop = {
  id: string; department: string; category: string; title: string
  purpose: string | null; responsible: string | null; frequency: string | null; est_time: string | null
  steps: string | null; note: string | null; sort_order: number; version: number
  title_vi: string | null; purpose_vi: string | null; steps_vi: string | null; note_vi: string | null
}

function recipeInStation(category: string, station: KStation) {
  if (station === 'kitchen') return !BAR_CATEGORIES.has(category)
  if (station === 'bar') return BAR_CATEGORIES.has(category)
  return true
}
function sopInStation(dept: string, station: KStation) {
  if (station === 'all') return true
  if (station === 'kitchen') return dept === 'kitchen' || dept === 'general'
  return dept === 'bar' || dept === 'general'
}

// ── Browse list (cards) ─────────────────────────────────────
export async function fetchKitchenList(station: KStation): Promise<{ recipes: KRecipe[]; sops: KSop[] }> {
  const [{ data: recs }, { data: sops }] = await Promise.all([
    ops().from('recipes').select('id,name,name_vi,type,category,is_resale').order('name'),
    supabase.from('sops').select('id,department,category,title,title_vi,purpose,purpose_vi,responsible,frequency,est_time,steps,steps_vi,note,note_vi,sort_order,version,is_published').order('category').order('sort_order'),
  ])
  const recipes = ((recs || []) as any[])
    .filter(r => !r.is_resale && recipeInStation(r.category, station))
    .map(r => ({ id: r.id, name: r.name, name_vi: r.name_vi, type: r.type, category: r.category }))
  const sopRows = ((sops || []) as any[])
    .filter(s => s.is_published !== false && sopInStation(s.department, station))
    .map(s => s as KSop)
  return { recipes, sops: sopRows }
}

// ── Recipe detail (HTML for the live page) ──────────────────
const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, m => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[m]))

type RecipeFull = {
  id: string; name: string; name_vi: string | null; category: string; subtitle: string | null; type: string
  method: string | null; method_vi: string | null; plating_dinein: string | null; plating_togo: string | null
  glass: string | null; ice: string | null; garnish: string | null; yield_qty: number; yield_unit: string
}

async function fetchRecipesFull(ids: string[]) {
  const [{ data: recs }, { data: comps }, { data: ings }, { data: subs }] = await Promise.all([
    ops().from('recipes').select('id,name,name_vi,category,subtitle,type,method,method_vi,plating_dinein,plating_togo,glass,ice,garnish,yield_qty,yield_unit').in('id', ids),
    ops().from('recipe_components').select('recipe_id,ingredient_id,sub_recipe_id,qty,unit,sort_order').in('recipe_id', ids),
    ops().from('ingredients').select('id,name,name_vi'),
    ops().from('recipes').select('id,name,name_vi'),
  ])
  const ingMap = new Map<string, any>(((ings || []) as any[]).map(i => [i.id, i]))
  const subMap = new Map<string, any>(((subs || []) as any[]).map(s => [s.id, s]))
  const recById = new Map<string, RecipeFull>(((recs || []) as any[]).map(r => [r.id, r]))
  const byRecipe = new Map<string, any[]>()
  ;((comps || []) as any[]).forEach(c => { const a = byRecipe.get(c.recipe_id) || []; a.push(c); byRecipe.set(c.recipe_id, a) })
  return { ingMap, subMap, recById, byRecipe }
}

function platingBlock(title: string, txt: string | null) {
  if (!txt) return ''
  const items = String(txt).split('\n').filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')
  return `<h3>${title}</h3><ol>${items}</ol>`
}

function recipeSectionHtml(id: string, data: Awaited<ReturnType<typeof fetchRecipesFull>>, lastBreak = true): string {
  const r = data.recById.get(id); if (!r) return ''
  const cs = (data.byRecipe.get(id) || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const ingRows = cs.map(c => {
    const o = c.ingredient_id ? data.ingMap.get(c.ingredient_id) : data.subMap.get(c.sub_recipe_id)
    return `<tr><td>${esc(o?.name || '—')}</td><td class="vi">${esc(o?.name_vi || '')}</td><td class="amt">${Number(c.qty)} ${esc(c.unit)}</td></tr>`
  }).join('')
  const stepsEn = String(r.method || '').split('\n').filter(Boolean)
  const stepsVi = String(r.method_vi || '').split('\n').filter(Boolean)
  const stepCount = Math.max(stepsEn.length, stepsVi.length)
  const methodRows = Array.from({ length: stepCount }).map((_, i) =>
    `<tr><td class="num">${i + 1}</td><td>${esc(stepsEn[i] || '')}</td><td class="vi">${esc(stepsVi[i] || '')}</td></tr>`).join('')
  const extra = DRINK.has(r.category)
    ? `<h3>Build sheet</h3><ul><li><b>Glass:</b> ${esc(r.glass || '-')}</li><li><b>Ice:</b> ${esc(r.ice || '-')}</li><li><b>Garnish:</b> ${esc(r.garnish || '-')}</li></ul>`
    : platingBlock('Plate — Dine-in', r.plating_dinein) + platingBlock('Pack — To-go', r.plating_togo)
  return `<section style="page-break-after:${lastBreak ? 'always' : 'auto'}">
    <h1>${esc(r.name)}</h1>
    ${r.name_vi ? `<div class="vititle">${esc(r.name_vi)}</div>` : ''}
    <div class="sub">${esc(r.category)}${r.subtitle ? ' · ' + esc(r.subtitle) : ''} · yields ${Number(r.yield_qty)} ${esc(r.yield_unit)}</div>
    <h3>Ingredients · Nguyên liệu</h3>
    <table><thead><tr><th>Item</th><th>Tiếng Việt</th><th class="amt">Amount</th></tr></thead><tbody>${ingRows || '<tr><td>No ingredients listed</td></tr>'}</tbody></table>
    <h3>Method · Phương pháp</h3>
    <table class="method">${methodRows || '<tr><td colspan="3" style="color:#999">No method yet</td></tr>'}</table>
    ${extra}
  </section>`
}

// Render a single recipe to HTML (used by the live page detail pane).
export async function buildRecipeDetailHtml(id: string): Promise<string> {
  const data = await fetchRecipesFull([id])
  return recipeSectionHtml(id, data, false)
}

// Render a single SOP to HTML (used by the live page detail pane). Bilingual: each step
// shows English and Vietnamese side by side (Vietnamese falls back to blank if not set yet).
export function buildSopDetailHtml(s: KSop): string {
  const en = String(s.steps || '').split('\n').filter(Boolean)
  const vi = String(s.steps_vi || '').split('\n').filter(Boolean)
  const n = Math.max(en.length, vi.length)
  const stepRows = Array.from({ length: n }).map((_, i) =>
    `<tr><td class="num">${i + 1}</td><td>${esc(en[i] || '')}</td><td class="vi">${esc(vi[i] || '')}</td></tr>`).join('')
  const chips = [s.responsible ? `Who: ${esc(s.responsible)}` : '', s.frequency ? `When: ${esc(s.frequency)}` : '', s.est_time ? `Time: ${esc(s.est_time)}` : '']
    .filter(Boolean).map(c => `<span class="chip">${c}</span>`).join('')
  return `<section>
    <h1>${esc(s.title)}</h1>
    ${s.title_vi ? `<div class="vititle">${esc(s.title_vi)}</div>` : ''}
    <div class="sub">${esc(s.category)} · ${esc(s.department)} SOP</div>
    ${s.purpose ? `<p style="margin:6px 0 2px;font-size:14px">${esc(s.purpose)}</p>` : ''}
    ${s.purpose_vi ? `<p style="margin:0 0 10px;font-size:14px;color:#b85c00">${esc(s.purpose_vi)}</p>` : ''}
    ${chips ? `<div style="margin:8px 0">${chips}</div>` : ''}
    <h3>Steps · Các bước</h3>
    <table class="method">${stepRows || '<tr><td colspan="3" style="color:#999">No steps yet</td></tr>'}</table>
    ${s.note ? `<div class="note">${esc(s.note)}${s.note_vi ? `<br><span style="color:#b85c00">${esc(s.note_vi)}</span>` : ''}</div>` : ''}
  </section>`
}

// Scoped CSS for the live detail pane and the print window.
export const RECIPE_BOOK_CSS = `
.rbk{font-family:Inter,Arial,sans-serif;max-width:760px;margin:0 auto;color:#1a1a1a}
.rbk h1{margin:0 0 1px;font-size:24px}
.rbk .vititle{color:#b85c00;font-size:17px;font-weight:500;margin-bottom:8px}
.rbk .sub{color:#666;font-size:13px;margin-bottom:14px;text-transform:capitalize}
.rbk h3{margin:18px 0 4px;font-size:14px}
.rbk table{width:100%;border-collapse:collapse;font-size:14.5px;margin:6px 0}
.rbk th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#999;font-weight:600;padding:4px}
.rbk td{padding:7px 4px;border-bottom:1px solid #eee;vertical-align:top}
.rbk td.vi{color:#b85c00}.rbk td.amt{text-align:right;white-space:nowrap;color:#444}.rbk th.amt{text-align:right}
.rbk td.num{width:24px;color:#999;font-weight:600}
.rbk table.method td{width:48%}.rbk table.method td.num{width:24px}
.rbk ul,.rbk ol{line-height:1.8;margin:4px 0;padding-left:22px;font-size:15px}.rbk section{padding-top:8px}
.rbk .chip{display:inline-block;background:#f0f0f0;border-radius:6px;padding:4px 10px;font-size:12px;margin-right:8px}
.rbk .note{background:#fbe7e9;border-radius:8px;padding:10px 14px;margin-top:16px;font-size:14px}
`

// ── Combined "download everything" PDF ──────────────────────
export async function buildKitchenPdf(opts: { station: KStation; includeRecipes?: boolean; includeSops?: boolean }): Promise<{ blob: Blob; fname: string } | null> {
  const includeRecipes = opts.includeRecipes !== false
  const includeSops = opts.includeSops !== false
  const { recipes, sops } = await fetchKitchenList(opts.station)
  const recipeIds = includeRecipes ? recipes.map(r => r.id) : []
  const sopList = includeSops ? sops : []
  if (!recipeIds.length && !sopList.length) return null

  const data = recipeIds.length ? await fetchRecipesFull(recipeIds) : null

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
  let first = true
  const setf = (size: number, bold: boolean, rgb: number[]) => { doc.setFont('BVP', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(rgb[0], rgb[1], rgb[2]) }
  const ensure = (h: number) => { if (y + h > PH - M) { doc.addPage(); y = M } }
  const heading = (t: string) => { y += 6; ensure(20); setf(10.5, true, [26, 26, 26]); doc.text(t, M, y + 10); y += 18 }
  const newEntry = () => { if (!first) { doc.addPage(); y = M } first = false }

  if (data) recipeIds.forEach(id => {
    const r = data.recById.get(id); if (!r) return
    newEntry()
    setf(17, true, [26, 26, 26]); const tl = doc.splitTextToSize(String(r.name), CW); doc.text(tl, M, y + 15); y += tl.length * 17 * 1.32
    if (r.name_vi) { setf(13, false, ACC); const vl = doc.splitTextToSize(String(r.name_vi), CW); doc.text(vl, M, y + 11); y += vl.length * 13 * 1.32 }
    setf(9, false, [120, 120, 120]); doc.text(`${r.category}${r.subtitle ? ' · ' + r.subtitle : ''}  ·  yields ${Number(r.yield_qty)} ${r.yield_unit}`, M, y + 9); y += 18

    heading('Ingredients · Nguyên liệu')
    const cs = (data.byRecipe.get(id) || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const viX = M + CW * 0.43, enW = CW * 0.40, viW = CW * 0.33
    cs.forEach(c => {
      const o = c.ingredient_id ? data.ingMap.get(c.ingredient_id) : data.subMap.get(c.sub_recipe_id)
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

  // SOP section — divider page, then one SOP per page.
  if (sopList.length) {
    newEntry()
    setf(20, true, [26, 26, 26]); doc.text('Standard Operating Procedures', M, y + 18); y += 30
    setf(10, false, [120, 120, 120]); doc.text('Opening, closing, cleaning, safety & service checklists', M, y + 9); y += 18
    sopList.forEach(s => {
      newEntry()
      setf(17, true, [26, 26, 26]); const tl = doc.splitTextToSize(String(s.title), CW); doc.text(tl, M, y + 15); y += tl.length * 17 * 1.32
      if (s.title_vi) { setf(13, false, ACC); const vl = doc.splitTextToSize(String(s.title_vi), CW); doc.text(vl, M, y + 11); y += vl.length * 13 * 1.32 }
      setf(9, false, [120, 120, 120]); doc.text(`${s.category} · ${s.department} SOP`, M, y + 9); y += 16
      if (s.purpose) { setf(10, false, [60, 60, 60]); const pl = doc.splitTextToSize(String(s.purpose), CW); ensure(pl.length * 10 * 1.32); doc.text(pl, M, y + 9); y += pl.length * 10 * 1.32 + 2 }
      if (s.purpose_vi) { setf(10, false, ACC); const pvl = doc.splitTextToSize(String(s.purpose_vi), CW); ensure(pvl.length * 10 * 1.32); doc.text(pvl, M, y + 9); y += pvl.length * 10 * 1.32 + 4 }
      const meta = [s.responsible ? `Who: ${s.responsible}` : '', s.frequency ? `When: ${s.frequency}` : '', s.est_time ? `Time: ${s.est_time}` : ''].filter(Boolean).join('    ')
      if (meta) { setf(9, false, ACC); doc.text(meta, M, y + 9); y += 16 }
      heading('Steps · Các bước')
      const en = String(s.steps || '').split('\n').filter(Boolean)
      const vi = String(s.steps_vi || '').split('\n').filter(Boolean)
      const n = Math.max(en.length, vi.length)
      if (!n) { setf(10, false, [150, 150, 150]); doc.text('No steps yet', M, y + 9); y += 16 }
      const sEnX = M + 16, sColW = (CW - 16) / 2 - 8, sViX = sEnX + sColW + 16
      for (let i = 0; i < n; i++) {
        const enL = doc.splitTextToSize(en[i] || '', sColW)
        const viL = doc.splitTextToSize(vi[i] || '', sColW)
        const rowH = Math.max(enL.length, viL.length, 1) * 10 * 1.32
        ensure(rowH + 3)
        setf(10, false, [150, 150, 150]); doc.text(String(i + 1), M, y + 9)
        setf(10, false, [40, 40, 40]); doc.text(enL, sEnX, y + 9)
        setf(10, false, ACC); doc.text(viL, sViX, y + 9)
        y += rowH + 3
      }
      if (s.note) { y += 4; setf(10, true, [150, 40, 40]); const nl = doc.splitTextToSize(`Note: ${s.note}${s.note_vi ? '  /  ' + s.note_vi : ''}`, CW); ensure(nl.length * 10 * 1.32); doc.text(nl, M, y + 9); y += nl.length * 10 * 1.32 }
    })
  }

  const stationLabel = opts.station === 'all' ? 'All' : opts.station === 'kitchen' ? 'Kitchen' : 'Bar'
  return { blob: doc.output('blob'), fname: `BigBamBoo-${stationLabel}-Book.pdf` }
}
