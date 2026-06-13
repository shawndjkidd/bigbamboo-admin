'use client'
// Station Mode — a clean, full-screen, read-only library of recipes, batches, add-ons and
// SOPs for one station (Kitchen or Bar). Used by /kitchen and /bar. Big touch targets,
// bilingual detail, always live, plus a manager-only "Download everything" PDF.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ops, canSeeDashboard, type StaffRole } from '@/lib/ops/api'
import {
  fetchKitchenList, fetchRecipeDetail, buildSopDetailHtml, buildKitchenPdf,
  RECIPE_BOOK_CSS, type KStation, type KRecipe, type KSop, type KRecipeDetail,
} from '@/lib/ops/kitchenBook'

type TypeFilter = 'all' | 'recipes' | 'addons' | 'batches' | 'sops' | 'stock'

export default function StationView({ fixedStation }: { fixedStation: 'kitchen' | 'bar' }) {
  const router = useRouter()
  const other: 'kitchen' | 'bar' = fixedStation === 'kitchen' ? 'bar' : 'kitchen'
  const title = fixedStation === 'bar' ? 'BigBamBoo Bar' : 'BigBamBoo Kitchen'

  const [loading, setLoading] = useState(true)
  const [canExport, setCanExport] = useState(false)
  const [type, setType] = useState<TypeFilter>('all')
  const [q, setQ] = useState('')
  const [recipes, setRecipes] = useState<KRecipe[]>([])
  const [sops, setSops] = useState<KSop[]>([])
  const [detail, setDetail] = useState<{ kind: 'recipe' | 'sop'; title: string } | null>(null)
  const [recipeData, setRecipeData] = useState<KRecipeDetail | null>(null)
  const [sopHtml, setSopHtml] = useState('')
  const [scale, setScale] = useState(1)
  const [detailBusy, setDetailBusy] = useState(false)
  const [dl, setDl] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { router.push('/login'); return }
      const { data: su } = await supabase.from('staff_users').select('active, role, department').eq('email', session.user.email).maybeSingle()
      if (!su || su.active === false) { router.push('/login'); return }
      const exporter = canSeeDashboard((su.role || 'staff') as StaffRole)
      // Display / staff accounts are locked to their own station by Department — if a Bar
      // device opens the Kitchen page (or vice versa) bounce it to its own station.
      if (!exporter) {
        const deptStation = su.department === 'bar' ? 'bar' : 'kitchen'
        if (deptStation !== fixedStation) { router.replace('/' + deptStation); return }
      }
      setCanExport(exporter)
      setLoading(false)
    })()
  }, [])

  useEffect(() => { if (!loading) loadList() }, [loading])

  async function loadList() {
    const { recipes, sops } = await fetchKitchenList(fixedStation)
    setRecipes(recipes); setSops(sops)
  }

  async function openRecipe(r: KRecipe) {
    setDetail({ kind: 'recipe', title: r.name }); setScale(1); setRecipeData(null); setDetailBusy(true)
    const d = await fetchRecipeDetail(r.id)
    setRecipeData(d); setDetailBusy(false)
  }
  function openSop(s: KSop) {
    setSopHtml(buildSopDetailHtml(s)); setDetail({ kind: 'sop', title: s.title })
  }

  async function download(share: boolean) {
    setDl(true)
    try {
      const pdf = await buildKitchenPdf({ station: fixedStation })
      if (!pdf) { alert('Nothing to download yet.'); return }
      const file = new File([pdf.blob], pdf.fname, { type: 'application/pdf' })
      const nav: any = navigator
      if (share && nav.canShare && nav.canShare({ files: [file] })) {
        try { await nav.share({ files: [file], title: pdf.fname }) } catch {}
      } else {
        const url = URL.createObjectURL(pdf.blob); const a = document.createElement('a')
        a.href = url; a.download = pdf.fname; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000)
      }
    } finally { setDl(false) }
  }

  const ql = q.trim().toLowerCase()
  const showRecipes = type === 'all' || type === 'recipes' || type === 'addons' || type === 'batches'
  const showSops = type === 'all' || type === 'sops'
  const recipeCards = !showRecipes ? [] : recipes.filter(r => {
    if (type === 'recipes' && r.type !== 'menu_item') return false
    if (type === 'addons' && r.type !== 'add_on') return false
    if (type === 'batches' && !(r.type === 'batch' || r.type === 'sub_recipe')) return false
    if (ql && !(`${r.name} ${r.name_vi || ''}`.toLowerCase().includes(ql))) return false
    return true
  })
  const sopCards = !showSops ? [] : sops.filter(s => {
    if (ql && !(`${s.title} ${s.category}`.toLowerCase().includes(ql))) return false
    return true
  })
  const empty = recipeCards.length === 0 && sopCards.length === 0

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #fff)', color: 'var(--text, #1a1a1a)' }}>
      <style>{`.rbk{font-size:16px}` + RECIPE_BOOK_CSS}</style>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-sidebar, #fafafa)', borderBottom: '1px solid var(--border, #e5e5e5)', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent, #e87830)' }}>{title}</span>
            {canExport && (
              <Link href={'/' + other} style={{ fontSize: 13, color: 'var(--text-muted, #888)', textDecoration: 'none', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '6px 12px' }}>
                → {other === 'bar' ? 'Bar' : 'Kitchen'}
              </Link>
            )}
          </div>
          {canExport && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => download(false)} disabled={dl} style={{ ...bigBtn, opacity: dl ? 0.6 : 1 }}>{dl ? 'Building…' : '⬇ Download PDF'}</button>
              <button onClick={() => download(true)} disabled={dl} style={{ ...bigBtnOutline, opacity: dl ? 0.6 : 1 }}>⤴ Share</button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <Seg value={type} onChange={v => setType(v as TypeFilter)} options={[['all', 'All'], ['recipes', 'Recipes'], ['addons', 'Add-ons'], ['batches', 'Batches'], ['sops', 'SOPs'], ['stock', 'Stock']]} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ flex: 1, minWidth: 180, padding: '12px 16px', fontSize: 16, border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, background: 'var(--bg-card, #fff)', color: 'var(--text, #333)' }} />
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: 20 }}>
        {type === 'stock' && <StockSheet station={fixedStation} />}
        {type !== 'stock' && empty && <div style={{ color: '#999', fontSize: 15, padding: 20 }}>Nothing here yet for this filter.</div>}

        {type !== 'stock' && sopCards.length > 0 && showSops && type === 'all' && recipeCards.length > 0 && (
          <SectionLabel>Recipes &amp; batches</SectionLabel>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {recipeCards.map(r => (
            <button key={r.id} onClick={() => openRecipe(r)} style={card}>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text, #1a1a1a)' }}>{r.name}</div>
              {r.name_vi && <div style={{ fontSize: 14, color: 'var(--accent, #b85c00)', marginTop: 2 }}>{r.name_vi}</div>}
              <div style={{ fontSize: 11, color: '#999', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {r.type === 'batch' || r.type === 'sub_recipe' ? 'Batch' : r.type === 'add_on' ? 'Add-on' : 'Recipe'} · {r.category}
              </div>
            </button>
          ))}
        </div>

        {sopCards.length > 0 && (
          <>
            {type === 'all' && <SectionLabel>SOPs</SectionLabel>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              {sopCards.map(s => (
                <button key={s.id} onClick={() => openSop(s)} style={{ ...card, borderColor: 'var(--border, #e5e5e5)' }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text, #1a1a1a)' }}>{s.title}</div>
                  {s.title_vi && <div style={{ fontSize: 14, color: 'var(--accent, #b85c00)', marginTop: 2 }}>{s.title_vi}</div>}
                  <div style={{ fontSize: 11, color: '#999', marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    SOP · {s.category}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail overlay */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 16px', zIndex: 50, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', color: '#1a1a1a', borderRadius: 14, width: '100%', maxWidth: 820, padding: '24px 28px 40px', position: 'relative', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <button onClick={() => setDetail(null)} style={{ position: 'sticky', float: 'right', top: 0, fontSize: 26, lineHeight: 1, background: '#f0f0f0', border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer', color: '#555' }} aria-label="Close">✕</button>
            {detail.kind === 'sop'
              ? <div className="rbk" dangerouslySetInnerHTML={{ __html: sopHtml }} />
              : detailBusy || !recipeData
                ? <div style={{ color: '#999', padding: 40, textAlign: 'center' }}>Loading…</div>
                : <RecipeDetail data={recipeData} scale={scale} setScale={setScale} />}
          </div>
        </div>
      )}
    </div>
  )
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, overflow: 'hidden' }}>
      {options.map(([v, label], i) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
          borderRight: i < options.length - 1 ? '1px solid var(--border, #e5e5e5)' : 'none',
          background: value === v ? 'var(--accent, #e87830)' : 'var(--bg-card, #fff)',
          color: value === v ? '#fff' : 'var(--text-muted, #777)',
        }}>{label}</button>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999', margin: '22px 0 8px' }}>{children}</div>
}

const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000)

// Recipe detail with a live scale control: ingredient amounts and yield multiply by the
// chosen factor. Method steps and plating don't scale (they're written for 1×).
function RecipeDetail({ data, scale, setScale }: { data: KRecipeDetail; scale: number; setScale: (n: number) => void }) {
  const steps = Math.max(data.stepsEn.length, data.stepsVi.length)
  const presets: [string, number][] = [['½×', 0.5], ['1×', 1], ['2×', 2], ['3×', 3], ['4×', 4]]
  return (
    <div className="rbk">
      <h1>{data.name}</h1>
      {data.name_vi && <div className="vititle">{data.name_vi}</div>}
      <div className="sub">{data.category}{data.subtitle ? ' · ' + data.subtitle : ''} · yields {fmtQty(data.yield_qty * scale)} {data.yield_unit}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '14px 0 6px' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#666' }}>Scale · Định lượng</span>
        {presets.map(([label, v]) => (
          <button key={label} onClick={() => setScale(v)} style={{
            padding: '8px 16px', fontSize: 15, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
            border: '1px solid ' + (scale === v ? '#e87830' : '#e5e5e5'),
            background: scale === v ? '#e87830' : '#fff', color: scale === v ? '#fff' : '#555',
          }}>{label}</button>
        ))}
        <input type="number" min="0" step="0.5" value={scale}
          onChange={e => setScale(Math.max(0, Number(e.target.value) || 0))}
          style={{ width: 74, padding: '8px', fontSize: 15, border: '1px solid #e5e5e5', borderRadius: 8, textAlign: 'center' }} />
        <span style={{ fontSize: 13, color: '#999' }}>× custom</span>
      </div>

      <h3>Ingredients · Nguyên liệu</h3>
      <table><thead><tr><th>Item</th><th>Tiếng Việt</th><th className="amt">Amount</th></tr></thead>
        <tbody>
          {data.ingredients.length === 0 && <tr><td>No ingredients listed</td></tr>}
          {data.ingredients.map((i, idx) => (
            <tr key={idx}><td>{i.name}</td><td className="vi">{i.name_vi || ''}</td><td className="amt">{fmtQty(i.qty * scale)} {i.unit}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>Method · Phương pháp</h3>
      {scale !== 1 && <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>Amounts mentioned in the steps are for 1× — scale them by eye.</div>}
      <table className="method"><tbody>
        {steps === 0 && <tr><td colSpan={3} style={{ color: '#999' }}>No method yet</td></tr>}
        {Array.from({ length: steps }).map((_, i) => (
          <tr key={i}><td className="num">{i + 1}</td><td>{data.stepsEn[i] || ''}</td><td className="vi">{data.stepsVi[i] || ''}</td></tr>
        ))}
      </tbody></table>

      {data.isDrink ? (
        <><h3>Build sheet</h3><ul>
          <li><b>Glass:</b> {data.glass || '-'}</li><li><b>Ice:</b> {data.ice || '-'}</li><li><b>Garnish:</b> {data.garnish || '-'}</li>
        </ul></>
      ) : (
        <>
          {(data.platingEnDinein.length > 0 || data.platingViDinein.length > 0) && <PlatingBlock title="Plate — Dine-in · Bày tại bàn" en={data.platingEnDinein} vi={data.platingViDinein} />}
          {(data.platingEnTogo.length > 0 || data.platingViTogo.length > 0) && <PlatingBlock title="Pack — To-go · Đóng gói mang đi" en={data.platingEnTogo} vi={data.platingViTogo} />}
        </>
      )}
    </div>
  )
}
function PlatingBlock({ title, en, vi }: { title: string; en: string[]; vi: string[] }) {
  const n = Math.max(en.length, vi.length)
  return <><h3>{title}</h3><table className="method"><tbody>
    {Array.from({ length: n }).map((_, i) => <tr key={i}><td className="num">{i + 1}</td><td>{en[i] || ''}</td><td className="vi">{vi[i] || ''}</td></tr>)}
  </tbody></table></>
}

// Stock count sheet — staff count par-tracked items (in purchase units) and submit for the
// manager to review/apply. Read-only against live stock; the submit is via a secured RPC.
const BAR_ING = new Set(['spirit', 'beer', 'wine', 'mixer', 'syrup'])
function StockSheet({ station }: { station: 'kitchen' | 'bar' }) {
  const [items, setItems] = useState<any[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await ops().from('ingredients').select('id,name,name_vi,category,base_unit,purchase_unit_label,purchase_unit_size,par_level_base').eq('active', true).order('name')
      let rows = (data || []).filter((i: any) => station === 'bar' ? BAR_ING.has(i.category) : !BAR_ING.has(i.category))
      const parTracked = rows.filter((i: any) => i.par_level_base != null)
      if (parTracked.length) rows = parTracked
      setItems(rows); setLoading(false)
    })()
  }, [station])

  async function submit() {
    const p_items = items.filter(i => (counts[i.id] ?? '') !== '' && Number(counts[i.id]) >= 0).map(i => ({ ingredient_id: i.id, units: Number(counts[i.id]) }))
    if (!p_items.length) { setErr('Enter at least one count'); return }
    setBusy(true); setErr('')
    const { error } = await ops().rpc('submit_stock_count', { p_station: station, p_items, p_note: null })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(true); setCounts({})
  }

  if (loading) return <div style={{ color: '#999', padding: 20 }}>Loading stock list…</div>
  if (done) return (
    <div style={{ textAlign: 'center', padding: 40, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 600 }}>Count submitted</div>
      <div style={{ color: '#999', fontSize: 14, marginTop: 6 }}>Sent to the manager to review and apply. Stock isn't changed until they do.</div>
      <button onClick={() => setDone(false)} style={{ marginTop: 18, padding: '12px 18px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>New count</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, color: '#999', marginBottom: 14 }}>Count what's on the shelf, in {station} units. Leave blank to skip. This goes to the manager to review — it won't change stock until they apply it.</div>
      {err && <div style={{ background: '#fdecec', color: '#a32d2d', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gap: 4 }}>
        {items.length === 0 && <div style={{ color: '#999', padding: 20 }}>No {station} items to count.</div>}
        {items.map(i => (
          <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border, #eee)' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{i.name}</div>
              {i.name_vi && <div style={{ fontSize: 13, color: 'var(--accent, #b85c00)' }}>{i.name_vi}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input inputMode="decimal" value={counts[i.id] || ''} onChange={e => setCounts(c => ({ ...c, [i.id]: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="0" style={{ width: 64, padding: '10px 8px', fontSize: 15, border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, textAlign: 'center' }} />
              <span style={{ fontSize: 12, color: '#999' }}>{i.purchase_unit_label || i.base_unit}</span>
            </div>
          </div>
        ))}
      </div>
      {items.length > 0 && <button onClick={submit} disabled={busy} style={{ width: '100%', marginTop: 18, padding: '15px', fontSize: 16, fontWeight: 700, color: '#fff', background: 'var(--accent, #e87830)', border: 'none', borderRadius: 12, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Submitting…' : 'Submit count'}</button>}
    </div>
  )
}

const card: React.CSSProperties = {
  textAlign: 'left', background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 12, padding: '16px 16px', cursor: 'pointer', minHeight: 96, display: 'block',
}
const bigBtn: React.CSSProperties = {
  padding: '11px 18px', background: 'var(--accent, #e87830)', color: '#fff', border: 'none',
  borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
}
const bigBtnOutline: React.CSSProperties = {
  padding: '11px 18px', background: 'transparent', color: 'var(--text-secondary, #666)',
  border: '1px solid var(--border, #e5e5e5)', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
}
